import { describe, expect, it } from "vitest";
import { computeSummary, compareCategories, largestExpenses, type AnalyticsTxn } from "@/lib/finance/analytics";

let n = 0;
function tx(o: Partial<AnalyticsTxn> & Pick<AnalyticsTxn, "direction" | "amountPaise" | "categoryKind">): AnalyticsTxn {
  n++;
  return {
    id: `t${n}`, date: "2026-03-10", accountId: "a", categoryId: o.categoryKey ?? o.categoryKind, categoryKey: null,
    categoryName: o.categoryKey ?? o.categoryKind, group: null, merchant: `m${n}`, merchantKey: `m${n}`, ...o,
  };
}

const MARCH = { from: "2026-03-01", to: "2026-03-31" };

// A month with every kind of movement. Expected values below are computed by hand.
const salary = tx({ direction: "CREDIT", amountPaise: 85_000_00, categoryKind: "INCOME", categoryKey: "salary" });
const interest = tx({ direction: "CREDIT", amountPaise: 42_00, categoryKind: "INCOME", categoryKey: "interest" });
const rent = tx({ direction: "DEBIT", amountPaise: 18_000_00, categoryKind: "EXPENSE", categoryKey: "rent", group: "ESSENTIAL" });
const groceries = tx({ direction: "DEBIT", amountPaise: 4_500_00, categoryKind: "EXPENSE", categoryKey: "groceries", group: "ESSENTIAL" });
const food = tx({ direction: "DEBIT", amountPaise: 2_000_00, categoryKind: "EXPENSE", categoryKey: "food", group: "DISCRETIONARY" });
const family = tx({ direction: "DEBIT", amountPaise: 5_000_00, categoryKind: "EXPENSE", categoryKey: "family", group: "FAMILY" });
const groceryRefund = tx({
  direction: "CREDIT", amountPaise: 450_00, categoryKind: "REFUND", categoryKey: "refund",
  refundOf: { categoryId: "groceries", categoryName: "groceries", categoryKind: "EXPENSE", group: "ESSENTIAL" },
});
const transferOut = tx({ direction: "DEBIT", amountPaise: 20_000_00, categoryKind: "TRANSFER", accountId: "a" });
const transferIn = tx({ direction: "CREDIT", amountPaise: 20_000_00, categoryKind: "TRANSFER", accountId: "b" });
const ccBill = tx({ direction: "DEBIT", amountPaise: 12_000_00, categoryKind: "CREDIT_CARD_PAYMENT", categoryKey: "cc-payment" });
const sip = tx({ direction: "DEBIT", amountPaise: 10_000_00, categoryKind: "INVESTMENT" });
const atm = tx({ direction: "DEBIT", amountPaise: 2_000_00, categoryKind: "CASH" });
const lent = tx({ direction: "DEBIT", amountPaise: 3_000_00, categoryKind: "SETTLEMENT" });
const unknown = tx({ direction: "DEBIT", amountPaise: 700_00, categoryKind: "UNCLASSIFIED" });
const failedTransfer = tx({ direction: "DEBIT", amountPaise: 24_500_00, categoryKind: "REFUND" });
const failedTransferReversal = tx({
  direction: "CREDIT", amountPaise: 24_500_00, categoryKind: "REFUND",
  refundOf: { categoryId: "refund", categoryName: "refund", categoryKind: "REFUND", group: null },
});
const outOfRange = tx({ direction: "DEBIT", amountPaise: 99_999_00, categoryKind: "EXPENSE", date: "2026-04-01" });

const all = [salary, interest, rent, groceries, food, family, groceryRefund, transferOut, transferIn, ccBill, sip, atm, lent, unknown, failedTransfer, failedTransferReversal, outOfRange];

describe("computeSummary — accounting rules", () => {
  const s = computeSummary(all, MARCH, { ccPaymentsAsExpense: false });

  it("counts only genuine income", () => {
    expect(s.income).toBe(85_000_00 + 42_00);
  });

  it("excludes transfers, investments, cash, lending and card bills from expenses; nets refunds", () => {
    // rent + groceries + food + family − grocery refund
    expect(s.expenses).toBe(18_000_00 + 4_500_00 + 2_000_00 + 5_000_00 - 450_00);
    expect(s.refunds).toBe(450_00);
    expect(s.expensesByCategory.find((c) => c.categoryId === "groceries")?.amountPaise).toBe(4_050_00);
  });

  it("computes savings and savings rate from integer paise", () => {
    const income = 85_042_00;
    const expenses = 29_050_00;
    expect(s.savings).toBe(income - expenses);
    expect(s.savingsRate).toBe(65.8); // 55,992 / 85,042 = 65.84%
  });

  it("reports net cash flow as all credits minus all debits in range", () => {
    const credits = 85_000_00 + 42_00 + 450_00 + 20_000_00 + 24_500_00;
    const debits = 18_000_00 + 4_500_00 + 2_000_00 + 5_000_00 + 20_000_00 + 12_000_00 + 10_000_00 + 2_000_00 + 3_000_00 + 700_00 + 24_500_00;
    expect(s.totalCredits).toBe(credits);
    expect(s.totalDebits).toBe(debits);
    expect(s.netCashFlow).toBe(credits - debits);
  });

  it("tracks movements separately", () => {
    expect(s).toMatchObject({
      transfersOut: 20_000_00, transfersIn: 20_000_00, matchedTransferVolume: 20_000_00,
      investmentsIn: 10_000_00, cashWithdrawals: 2_000_00, ccPayments: 12_000_00,
      lendingOut: 3_000_00, unclassifiedOut: 700_00, unclassifiedCount: 1,
    });
  });

  it("groups essential, discretionary and family spending", () => {
    expect(s.expensesByGroup).toEqual({ ESSENTIAL: 18_000_00 + 4_050_00, DISCRETIONARY: 2_000_00, FAMILY: 5_000_00, UNGROUPED: 0 });
  });

  it("computes category percentages of total expenses", () => {
    const rentRow = s.expensesByCategory.find((c) => c.categoryId === "rent")!;
    expect(rentRow.pct).toBe(62); // 18,000 / 29,050
  });
});

describe("credit-card payment treatment", () => {
  it("counts card bills as spending when card purchases are not imported", () => {
    const s = computeSummary(all, MARCH, { ccPaymentsAsExpense: true });
    expect(s.expenses).toBe(29_050_00 + 12_000_00);
  });
});

describe("date range filtering", () => {
  it("ignores transactions outside the range", () => {
    const s = computeSummary(all, MARCH, { ccPaymentsAsExpense: false });
    expect(s.expensesByCategory.some((c) => c.amountPaise === 99_999_00)).toBe(false);
    const april = computeSummary(all, { from: "2026-04-01", to: "2026-04-30" }, { ccPaymentsAsExpense: false });
    expect(april.expenses).toBe(99_999_00);
    expect(april.income).toBe(0);
    expect(april.savingsRate).toBeNull();
  });
  it("includes both boundary dates", () => {
    const edge = [tx({ direction: "DEBIT", amountPaise: 1_00, categoryKind: "EXPENSE", date: "2026-03-01" }), tx({ direction: "DEBIT", amountPaise: 2_00, categoryKind: "EXPENSE", date: "2026-03-31" })];
    expect(computeSummary(edge, MARCH, { ccPaymentsAsExpense: false }).expenses).toBe(3_00);
  });
  it("builds a row per month in the range", () => {
    const s = computeSummary(all, { from: "2026-02-01", to: "2026-04-30" }, { ccPaymentsAsExpense: false });
    expect(s.monthly.map((m) => m.month)).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(s.monthly[1].income).toBe(85_042_00);
  });
});

describe("comparisons", () => {
  it("quantifies category changes between periods", () => {
    const feb = [tx({ direction: "DEBIT", amountPaise: 1_000_00, categoryKind: "EXPENSE", categoryKey: "food", date: "2026-02-10" })];
    const cur = computeSummary([...all, ...feb], MARCH, { ccPaymentsAsExpense: false });
    const prev = computeSummary([...all, ...feb], { from: "2026-02-01", to: "2026-02-28" }, { ccPaymentsAsExpense: false });
    const foodChange = compareCategories(cur, prev).find((c) => c.categoryId === "food")!;
    expect(foodChange).toMatchObject({ current: 2_000_00, previous: 1_000_00, change: 1_000_00, changePct: 100 });
  });
  it("lists largest expenses only", () => {
    const top = largestExpenses(all, MARCH, { ccPaymentsAsExpense: false }, 2);
    expect(top.map((t) => t.amountPaise)).toEqual([18_000_00, 5_000_00]);
  });
});

import { budgetStatus, requiredMonthly } from "@/lib/finance/budgets";

describe("budgets and goals", () => {
  it("computes remaining, percentage used and status", () => {
    expect(budgetStatus(10_000_00, 4_000_00)).toEqual({ budget: 10_000_00, actual: 4_000_00, remaining: 6_000_00, pctUsed: 40, status: "ok" });
    expect(budgetStatus(10_000_00, 9_000_00).status).toBe("near");
    expect(budgetStatus(10_000_00, 12_500_00)).toMatchObject({ remaining: -2_500_00, pctUsed: 125, status: "over" });
  });
  it("computes the monthly contribution needed for a goal", () => {
    expect(requiredMonthly(1_00_000_00, 40_000_00, 6)).toBe(10_000_00);
    expect(requiredMonthly(1_00_000_00, 1_00_000_00, 6)).toBe(0);
    expect(requiredMonthly(1_00_000_00, 0, null)).toBeNull();
    expect(requiredMonthly(100_00, 0, 3)).toBe(3334);
  });
});

import { incomeCaptured } from "@/lib/finance/analytics";

describe("savings rate meaningfulness", () => {
  it("only reports a rate when the accounts receive most of the income", () => {
    expect(incomeCaptured({ income: 85_000_00, expenses: 30_000_00 })).toBe(true);
    expect(incomeCaptured({ income: 604_00, expenses: 2_67_374_00 })).toBe(false);
    expect(incomeCaptured({ income: 0, expenses: 0 })).toBe(false);
  });
});
