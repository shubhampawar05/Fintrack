"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { recategorize, runLinking } from "@/server/pipeline";
import { manualTransactionSchema, transactionPatchSchema } from "@/lib/validation/schemas";
import { isoToDate } from "@/lib/dates";
import { run } from "./util";

const ids = z.array(z.string().min(1)).min(1).max(2000);

async function ownedCategory(userId: string, categoryId: string) {
  const c = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!c) throw new Error("Category not found");
  return c;
}

export async function updateTransaction(id: string, patch: z.input<typeof transactionPatchSchema>) {
  return run(async () => {
    const user = await requireUser();
    const v = transactionPatchSchema.parse(patch);
    const before = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
    if (!before) throw new Error("Transaction not found");
    const data: Record<string, unknown> = {};
    if (v.categoryId !== undefined && v.categoryId !== before.categoryId) {
      await ownedCategory(user.id, v.categoryId);
      Object.assign(data, { categoryId: v.categoryId, categorizationMethod: "USER", confidence: 1, needsReview: false });
    }
    if (v.merchantOverride !== undefined) data.merchantOverride = v.merchantOverride || null;
    if (v.notes !== undefined) data.notes = v.notes || null;
    if (!Object.keys(data).length) return;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data });
      await audit(
        tx, user.id, "Transaction", id, "UPDATE",
        { categoryId: before.categoryId, method: before.categorizationMethod, merchantOverride: before.merchantOverride, notes: before.notes },
        data,
      );
    });
    revalidatePath("/", "layout");
  }, "Saved");
}

/**
 * Categorize many transactions at once. Optionally remember the choice as a rule
 * for each selected merchant, so future imports are categorized the same way.
 */
export async function bulkCategorize(txnIds: string[], categoryId: string, createRules: boolean) {
  return run(async () => {
    const user = await requireUser();
    const list = ids.parse(txnIds);
    const cat = await ownedCategory(user.id, categoryId);
    const txns = await prisma.transaction.findMany({ where: { id: { in: list }, userId: user.id }, select: { id: true, categoryId: true, merchantKey: true, merchant: true } });
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { id: { in: txns.map((t) => t.id) } },
        data: { categoryId, categorizationMethod: "USER", confidence: 1, needsReview: false },
      });
      for (const t of txns) await audit(tx, user.id, "Transaction", t.id, "CATEGORIZE", { categoryId: t.categoryId }, { categoryId });
      if (createRules) {
        const keys = [...new Map(txns.filter((t) => t.merchantKey).map((t) => [t.merchantKey!, t.merchant])).entries()];
        for (const [key, merchant] of keys) {
          const exists = await tx.categorizationRule.findFirst({ where: { userId: user.id, field: "MERCHANT", matchType: "EQUALS", pattern: key, isSystem: false } });
          if (exists) await tx.categorizationRule.update({ where: { id: exists.id }, data: { categoryId } });
          else {
            const r = await tx.categorizationRule.create({
              data: { userId: user.id, name: `${merchant ?? key} → ${cat.name}`, field: "MERCHANT", matchType: "EQUALS", pattern: key, categoryId, priority: 10 },
            });
            await audit(tx, user.id, "CategorizationRule", r.id, "CREATE", null, { pattern: key, categoryId });
          }
        }
      }
    });
    const others = createRules ? await recategorize(user.id) : 0;
    if (!createRules) await runLinking(user.id);
    revalidatePath("/", "layout");
    return { updated: txns.length, others };
  });
}

export async function markReviewed(txnIds: string[]) {
  return run(async () => {
    const user = await requireUser();
    await prisma.transaction.updateMany({ where: { id: { in: ids.parse(txnIds) }, userId: user.id }, data: { needsReview: false } });
    revalidatePath("/", "layout");
  }, "Marked as reviewed");
}

export async function decideTransfer(transferId: string, confirm: boolean) {
  return run(async () => {
    const user = await requireUser();
    const t = await prisma.internalTransfer.findFirst({ where: { id: transferId, userId: user.id } });
    if (!t) throw new Error("Transfer not found");
    const transferCat = await prisma.category.findFirstOrThrow({ where: { userId: user.id, key: "transfer" } });
    await prisma.$transaction(async (tx) => {
      await tx.internalTransfer.update({ where: { id: t.id }, data: { status: confirm ? "CONFIRMED" : "REJECTED", decidedAt: new Date() } });
      if (confirm) {
        await tx.transaction.updateMany({
          where: { id: { in: [t.debitTxnId, t.creditTxnId] } },
          data: { categoryId: transferCat.id, categorizationMethod: "TRANSFER_MATCH", confidence: 1, needsReview: false, merchant: "Own account" },
        });
      }
      await audit(tx, user.id, "InternalTransfer", t.id, confirm ? "CONFIRM" : "REJECT", { status: t.status }, { status: confirm ? "CONFIRMED" : "REJECTED" });
    });
    revalidatePath("/", "layout");
  }, confirm ? "Marked as transfer between your accounts" : "Suggestion dismissed");
}

export async function recategorizeAll() {
  return run(async () => {
    const user = await requireUser();
    const n = await recategorize(user.id);
    revalidatePath("/", "layout");
    return n;
  });
}

/** Manual entries cover what statements cannot show (e.g. cash spending). */
export async function addManualTransaction(input: z.input<typeof manualTransactionSchema>) {
  return run(async () => {
    const user = await requireUser();
    const v = manualTransactionSchema.parse(input);
    const account = await prisma.bankAccount.findFirst({ where: { id: v.accountId, userId: user.id } });
    if (!account) throw new Error("Account not found");
    await ownedCategory(user.id, v.categoryId);
    const t = await prisma.transaction.create({
      data: {
        userId: user.id, accountId: v.accountId, txnDate: isoToDate(v.date), description: v.description, amountPaise: BigInt(v.amount),
        direction: v.direction, categoryId: v.categoryId, categorizationMethod: "USER", confidence: 1, needsReview: false,
        merchant: v.description, merchantKey: `manual:${v.description.toLowerCase()}`, notes: v.notes || null, isManual: true,
        dedupeKey: `manual:${crypto.randomUUID()}`,
      },
    });
    await audit(prisma, user.id, "Transaction", t.id, "CREATE_MANUAL", null, { amount: v.amount, direction: v.direction });
    revalidatePath("/", "layout");
  }, "Manual transaction added");
}

export async function deleteManualTransaction(id: string) {
  return run(async () => {
    const user = await requireUser();
    const t = await prisma.transaction.findFirst({ where: { id, userId: user.id, isManual: true } });
    if (!t) throw new Error("Only manual transactions can be deleted individually.");
    await prisma.transaction.delete({ where: { id } });
    await audit(prisma, user.id, "Transaction", id, "DELETE_MANUAL", { amount: t.amountPaise, description: t.description });
    revalidatePath("/", "layout");
  }, "Deleted");
}

/** Categorize every uncategorized/review-flagged transaction with one counterparty, and remember it as a rule. */
export async function categorizeCounterparty(merchantKey: string, categoryId: string) {
  const user = await requireUser();
  const list = await prisma.transaction.findMany({
    where: { userId: user.id, merchantKey: z.string().min(1).max(200).parse(merchantKey), categorizationMethod: { not: "USER" }, needsReview: true },
    select: { id: true },
  });
  if (!list.length) return { ok: false as const, error: "Nothing left to categorize for this counterparty." };
  return bulkCategorize(list.map((t) => t.id), categoryId, true);
}
