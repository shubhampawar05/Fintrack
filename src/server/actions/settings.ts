"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { ensureUserDefaults } from "@/server/bootstrap";
import { recategorize, runLinking } from "@/server/pipeline";
import { ruleSchema, type RuleInput } from "@/lib/validation/schemas";
import { parseAmountToPaise } from "@/lib/money";
import { SESSION_COOKIE } from "@/server/session";
import { run } from "./util";

const settingsSchema = z.object({
  ownIdentifiers: z.array(z.string().trim().min(4).max(80)).max(30),
  transferWindowDays: z.coerce.number().int().min(0).max(10),
  ccPaymentTreatment: z.enum(["AUTO", "EXPENSE", "EXCLUDE"]),
  aiCategorization: z.boolean(),
});

export async function saveSettings(input: z.input<typeof settingsSchema>) {
  return run(async () => {
    const user = await requireUser();
    const v = settingsSchema.parse(input);
    const before = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    await prisma.userSettings.update({ where: { userId: user.id }, data: { ...v, ownIdentifiers: [...new Set(v.ownIdentifiers)] } });
    await audit(prisma, user.id, "UserSettings", user.id, "UPDATE", before ? { ...before, ownIdentifiers: before.ownIdentifiers.length } : null, { ...v, ownIdentifiers: v.ownIdentifiers.length });
    if (JSON.stringify(before?.ownIdentifiers) !== JSON.stringify(v.ownIdentifiers) || before?.transferWindowDays !== v.transferWindowDays) {
      await recategorize(user.id);
    }
    revalidatePath("/", "layout");
  }, "Settings saved");
}

function ruleData(input: RuleInput) {
  const v = ruleSchema.parse(input);
  if (v.matchType === "REGEX") {
    try {
      new RegExp(v.pattern, "i");
    } catch {
      throw new Error("The regular expression is invalid.");
    }
  }
  return {
    name: v.name, field: v.field, matchType: v.matchType, pattern: v.pattern, direction: v.direction === "ANY" ? null : v.direction,
    accountId: v.accountId || null, categoryId: v.categoryId, merchantName: v.merchantName || null, priority: v.priority, enabled: v.enabled,
  };
}

export async function saveRule(id: string | null, input: RuleInput, minAmount?: string, maxAmount?: string) {
  return run(async () => {
    const user = await requireUser();
    const data = {
      ...ruleData(input),
      minAmountPaise: minAmount ? BigInt(parseAmountToPaise(minAmount) ?? 0) : null,
      maxAmountPaise: maxAmount ? BigInt(parseAmountToPaise(maxAmount) ?? 0) : null,
    };
    const cat = await prisma.category.findFirst({ where: { id: data.categoryId, userId: user.id } });
    if (!cat) throw new Error("Category not found");
    if (id) {
      const before = await prisma.categorizationRule.findFirst({ where: { id, userId: user.id } });
      if (!before) throw new Error("Rule not found");
      // Built-in rules keep their low-priority slot so user rules still win.
      await prisma.categorizationRule.update({ where: { id }, data: { ...data, priority: before.isSystem ? before.priority : data.priority } });
      await audit(prisma, user.id, "CategorizationRule", id, "UPDATE", { pattern: before.pattern, categoryId: before.categoryId, enabled: before.enabled }, data);
    } else {
      const r = await prisma.categorizationRule.create({ data: { ...data, userId: user.id } });
      await audit(prisma, user.id, "CategorizationRule", r.id, "CREATE", null, data);
    }
    const changed = await recategorize(user.id);
    revalidatePath("/", "layout");
    return changed;
  });
}

export async function deleteRule(id: string) {
  return run(async () => {
    const user = await requireUser();
    const r = await prisma.categorizationRule.findFirst({ where: { id, userId: user.id } });
    if (!r) throw new Error("Rule not found");
    if (r.isSystem) throw new Error("Built-in rules can be disabled but not deleted.");
    await prisma.categorizationRule.delete({ where: { id } });
    await audit(prisma, user.id, "CategorizationRule", id, "DELETE", { pattern: r.pattern });
    await recategorize(user.id);
    revalidatePath("/", "layout");
  }, "Rule deleted");
}

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER", "CREDIT_CARD_PAYMENT", "INVESTMENT", "CASH", "REFUND", "SETTLEMENT", "UNCLASSIFIED"]),
  group: z.enum(["ESSENTIAL", "DISCRETIONARY", "FAMILY", "NONE"]).default("NONE"),
  parentId: z.string().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export async function saveCategory(id: string | null, input: z.input<typeof categorySchema>) {
  return run(async () => {
    const user = await requireUser();
    const v = categorySchema.parse(input);
    const data = {
      name: v.name, group: v.kind === "EXPENSE" && v.group !== "NONE" ? v.group : null, parentId: v.parentId || null, color: v.color ?? null,
    };
    if (id) {
      const before = await prisma.category.findFirst({ where: { id, userId: user.id } });
      if (!before) throw new Error("Category not found");
      // The kind of a built-in category drives accounting rules and cannot change.
      await prisma.category.update({ where: { id }, data: { ...data, kind: before.isSystem ? before.kind : v.kind } });
      await audit(prisma, user.id, "Category", id, "UPDATE", { name: before.name, group: before.group }, data);
    } else {
      const c = await prisma.category.create({ data: { ...data, kind: v.kind, userId: user.id, sortOrder: 1000 } });
      await audit(prisma, user.id, "Category", c.id, "CREATE", null, { name: v.name, kind: v.kind });
    }
    revalidatePath("/", "layout");
  }, "Category saved");
}

export async function deleteCategory(id: string) {
  return run(async () => {
    const user = await requireUser();
    const c = await prisma.category.findFirst({ where: { id, userId: user.id } });
    if (!c) throw new Error("Category not found");
    if (c.isSystem) throw new Error("Built-in categories cannot be deleted (you can rename them).");
    const unclassified = await prisma.category.findFirstOrThrow({ where: { userId: user.id, key: "unclassified" } });
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: unclassified.id, needsReview: true, categorizationMethod: "DEFAULT", confidence: 0 } });
      await tx.category.delete({ where: { id } });
      await audit(tx, user.id, "Category", id, "DELETE", { name: c.name });
    });
    await recategorize(user.id);
    revalidatePath("/", "layout");
  }, "Category deleted; its transactions were re-evaluated");
}

/** Permanently delete every transaction, import, budget, goal, rule and setting. */
export async function deleteAllData(confirmation: string) {
  return run(async () => {
    const user = await requireUser();
    if (confirmation !== "DELETE") throw new Error('Type DELETE to confirm.');
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({ where: { userId: user.id }, data: { refundOfId: null } });
      await tx.transaction.deleteMany({ where: { userId: user.id } });
      await tx.statementImport.deleteMany({ where: { userId: user.id } });
      await tx.bankAccount.deleteMany({ where: { userId: user.id } });
      await tx.budget.deleteMany({ where: { userId: user.id } });
      await tx.financialGoal.deleteMany({ where: { userId: user.id } });
      await tx.recurringTransaction.deleteMany({ where: { userId: user.id } });
      await tx.categorizationRule.deleteMany({ where: { userId: user.id } });
      await tx.category.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.deleteMany({ where: { userId: user.id } });
      await tx.userSettings.deleteMany({ where: { userId: user.id } });
    });
    await ensureUserDefaults(user.id);
    await runLinking(user.id);
    (await cookies()).delete(SESSION_COOKIE);
    revalidatePath("/", "layout");
  }, "All data deleted");
}
