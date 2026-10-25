"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { accountSchema, type AccountInput } from "@/lib/validation/schemas";
import { parseAmountToPaise } from "@/lib/money";
import { isoToDate, parseIndianDate } from "@/lib/dates";
import { run } from "./util";

function toData(input: AccountInput) {
  const v = accountSchema.parse(input);
  const opening = v.openingBalance ? parseAmountToPaise(v.openingBalance) : null;
  if (v.openingBalance && opening === null) throw new Error("Opening balance is not a valid amount.");
  const date = v.openingBalanceDate ? parseIndianDate(v.openingBalanceDate) : null;
  if (opening !== null && !date) throw new Error("Give the date of the opening balance.");
  return {
    displayName: v.displayName,
    bankName: v.bankName,
    accountType: v.accountType,
    currency: v.currency.toUpperCase(),
    accountLast4: v.accountLast4 || null,
    openingBalancePaise: opening === null ? null : BigInt(opening),
    openingBalanceDate: date ? isoToDate(date) : null,
  };
}

export async function createAccount(input: AccountInput) {
  return run(async () => {
    const user = await requireUser();
    const data = toData(input);
    const exists = await prisma.bankAccount.findFirst({ where: { userId: user.id, displayName: data.displayName } });
    if (exists) throw new Error("An account with this name already exists.");
    const a = await prisma.bankAccount.create({ data: { ...data, userId: user.id } });
    await audit(prisma, user.id, "BankAccount", a.id, "CREATE", null, { displayName: a.displayName, bankName: a.bankName });
    revalidatePath("/", "layout");
    return a.id;
  }, "Account created");
}

export async function updateAccount(id: string, input: AccountInput) {
  return run(async () => {
    const user = await requireUser();
    const before = await prisma.bankAccount.findFirst({ where: { id, userId: user.id } });
    if (!before) throw new Error("Account not found");
    const data = toData(input);
    await prisma.bankAccount.update({ where: { id }, data });
    await audit(prisma, user.id, "BankAccount", id, "UPDATE", { displayName: before.displayName, accountType: before.accountType }, { displayName: data.displayName, accountType: data.accountType });
    revalidatePath("/", "layout");
  }, "Account updated");
}

/** Archiving hides the account; deleting removes it with all its transactions and imports. */
export async function archiveAccount(id: string, archived: boolean) {
  return run(async () => {
    const user = await requireUser();
    const r = await prisma.bankAccount.updateMany({ where: { id, userId: user.id }, data: { archived } });
    if (!r.count) throw new Error("Account not found");
    await audit(prisma, user.id, "BankAccount", id, archived ? "ARCHIVE" : "UNARCHIVE");
    revalidatePath("/", "layout");
  });
}

export async function deleteAccount(id: string) {
  return run(async () => {
    const user = await requireUser();
    const a = await prisma.bankAccount.findFirst({ where: { id, userId: user.id }, include: { _count: { select: { transactions: true } } } });
    if (!a) throw new Error("Account not found");
    await prisma.$transaction(async (tx) => {
      const ids = (await tx.transaction.findMany({ where: { accountId: id }, select: { id: true } })).map((t) => t.id);
      await tx.transaction.updateMany({ where: { refundOfId: { in: ids } }, data: { refundOfId: null } });
      await tx.bankAccount.delete({ where: { id } });
      await audit(tx, user.id, "BankAccount", id, "DELETE", { displayName: a.displayName, transactions: a._count.transactions });
    });
    revalidatePath("/", "layout");
  }, "Account and its data deleted");
}
