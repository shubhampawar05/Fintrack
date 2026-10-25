import "server-only";
import { prisma } from "./db";
import { getAnalyticsOptions, getAnalyticsTxns, getDataQualityWarnings } from "./queries";
import { computeSummary, compareCategories, largestExpenses } from "@/lib/finance/analytics";
import { generateInsights } from "@/lib/finance/insights";
import { budgetStatus } from "@/lib/finance/budgets";
import { addMonths, endOfMonth } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { href } from "@/lib/range-params";

/** Everything the monthly report shows, computed from stored transactions only. */
export async function buildMonthlyReport(userId: string, month: string) {
  const range = { from: `${month}-01`, to: endOfMonth(`${month}-01`) };
  const prevFrom = addMonths(range.from, -1);
  const prevRange = { from: prevFrom, to: endOfMonth(prevFrom) };
  const [txns, options, budgets, recurring, warnings, uncategorized] = await Promise.all([
    getAnalyticsTxns(userId, { from: addMonths(range.from, -1), to: range.to }),
    getAnalyticsOptions(userId),
    prisma.budget.findMany({ where: { userId }, include: { category: true } }),
    prisma.recurringTransaction.findMany({ where: { userId, status: { not: "REJECTED" }, direction: "DEBIT" }, orderBy: { typicalAmountPaise: "desc" } }),
    getDataQualityWarnings(userId, range),
    prisma.transaction.count({ where: { userId, txnDate: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) }, category: { kind: "UNCLASSIFIED" } } }),
  ]);
  const current = computeSummary(txns, range, options);
  const previous = computeSummary(txns, prevRange, options);
  const linkBase = (q: Record<string, string>) => href("/transactions", { range: "custom", from: range.from, to: range.to, ...q });
  return {
    month,
    range,
    current,
    previous,
    options,
    changes: compareCategories(current, previous),
    largest: largestExpenses(txns, range, options, 10),
    recurring: recurring.filter((r) => r.lastDate >= new Date(`${addMonths(range.from, -2)}T00:00:00Z`)),
    budgets: budgets.map((b) => ({
      name: b.category.name,
      ...budgetStatus(toPaise(b.amountPaise), current.expensesByCategory.find((c) => c.categoryId === b.categoryId)?.amountPaise ?? 0),
    })),
    warnings,
    uncategorized,
    insights: generateInsights({ current, previous, txns, options, linkBase }),
  };
}
