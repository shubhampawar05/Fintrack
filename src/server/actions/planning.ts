"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { budgetSchema, goalSchema } from "@/lib/validation/schemas";
import { isoToDate, parseIndianDate } from "@/lib/dates";
import { run } from "./util";

export async function upsertBudget(input: z.input<typeof budgetSchema>) {
  return run(async () => {
    const user = await requireUser();
    const v = budgetSchema.parse(input);
    const cat = await prisma.category.findFirst({ where: { id: v.categoryId, userId: user.id } });
    if (!cat) throw new Error("Category not found");
    if (cat.kind !== "EXPENSE" && cat.kind !== "CREDIT_CARD_PAYMENT") throw new Error("Budgets can only be set on spending categories.");
    const b = await prisma.budget.upsert({
      where: { userId_categoryId: { userId: user.id, categoryId: v.categoryId } },
      update: { amountPaise: BigInt(v.amount) },
      create: { userId: user.id, categoryId: v.categoryId, amountPaise: BigInt(v.amount) },
    });
    await audit(prisma, user.id, "Budget", b.id, "UPSERT", null, { categoryId: v.categoryId, amount: v.amount });
    revalidatePath("/budgets");
  }, "Budget saved");
}

export async function deleteBudget(id: string) {
  return run(async () => {
    const user = await requireUser();
    const r = await prisma.budget.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) throw new Error("Budget not found");
    await audit(prisma, user.id, "Budget", id, "DELETE");
    revalidatePath("/budgets");
  }, "Budget removed");
}

export async function saveGoal(id: string | null, input: z.input<typeof goalSchema>) {
  return run(async () => {
    const user = await requireUser();
    const v = goalSchema.parse(input);
    const date = v.targetDate ? parseIndianDate(v.targetDate) : null;
    const data = {
      name: v.name, targetAmountPaise: BigInt(v.target), currentAmountPaise: BigInt(v.current),
      targetDate: date ? isoToDate(date) : null, notes: v.notes || null,
    };
    if (id) {
      const r = await prisma.financialGoal.updateMany({ where: { id, userId: user.id }, data });
      if (!r.count) throw new Error("Goal not found");
      await audit(prisma, user.id, "FinancialGoal", id, "UPDATE", null, { current: v.current, target: v.target });
    } else {
      const g = await prisma.financialGoal.create({ data: { ...data, userId: user.id } });
      await audit(prisma, user.id, "FinancialGoal", g.id, "CREATE", null, { target: v.target });
    }
    revalidatePath("/goals");
  }, "Goal saved");
}

export async function deleteGoal(id: string) {
  return run(async () => {
    const user = await requireUser();
    const r = await prisma.financialGoal.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) throw new Error("Goal not found");
    revalidatePath("/goals");
  }, "Goal deleted");
}

const recurringPatch = z.object({
  status: z.enum(["SUGGESTED", "CONFIRMED", "REJECTED"]).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(["SUBSCRIPTION", "RENT", "SALARY", "EMI", "INSURANCE", "FAMILY", "INVESTMENT", "BILL", "OTHER"]).optional(),
});

export async function updateRecurring(id: string, patch: z.input<typeof recurringPatch>) {
  return run(async () => {
    const user = await requireUser();
    const v = recurringPatch.parse(patch);
    const before = await prisma.recurringTransaction.findFirst({ where: { id, userId: user.id } });
    if (!before) throw new Error("Not found");
    await prisma.recurringTransaction.update({ where: { id }, data: v });
    if (v.status === "REJECTED") await prisma.transaction.updateMany({ where: { recurringId: id, userId: user.id }, data: { recurringId: null } });
    await audit(prisma, user.id, "RecurringTransaction", id, "UPDATE", { status: before.status, label: before.label, kind: before.kind }, v);
    revalidatePath("/recurring");
  }, recurringMessage(patch));
}

function recurringMessage(p: { status?: string }) {
  return p.status === "CONFIRMED" ? "Confirmed as recurring" : p.status === "REJECTED" ? "Dismissed" : "Saved";
}
