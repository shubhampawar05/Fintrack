import type { CategoryKind, Direction, SpendGroup } from "@prisma/client";
import { monthKey, monthsInRange, type DateRange } from "@/lib/dates";
import { percent, sumPaise, type Paise } from "@/lib/money";

/** The minimal shape analytics needs; built from DB rows by the query layer. */
export interface AnalyticsTxn {
  id: string;
  date: string;
  accountId: string;
  direction: Direction;
  amountPaise: Paise;
  categoryId: string | null;
  categoryKey: string | null;
  categoryName: string;
  categoryKind: CategoryKind;
  group: SpendGroup | null;
  merchant: string;
  merchantKey: string | null;
  /** Original bank narration (used for evidence in insights). */
  description?: string;
  /** If this credit refunds an earlier transaction, the original's category. */
  refundOf?: { categoryId: string | null; categoryName: string; categoryKind: CategoryKind; group: SpendGroup | null } | null;
}

export interface AnalyticsOptions {
  /** Count credit-card bill payments as spending (true when card purchases are NOT imported). */
  ccPaymentsAsExpense: boolean;
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  group: SpendGroup | null;
  amountPaise: Paise;
  count: number;
  pct: number | null;
}

export interface Summary {
  range: DateRange;
  income: Paise;
  expenses: Paise;
  refunds: Paise;
  savings: Paise;
  savingsRate: number | null;
  totalCredits: Paise;
  totalDebits: Paise;
  netCashFlow: Paise;
  investmentsIn: Paise;
  investmentsOut: Paise;
  transfersOut: Paise;
  transfersIn: Paise;
  matchedTransferVolume: Paise;
  ccPayments: Paise;
  cashWithdrawals: Paise;
  lendingOut: Paise;
  lendingIn: Paise;
  unclassifiedOut: Paise;
  unclassifiedIn: Paise;
  unclassifiedCount: number;
  incomeByCategory: CategoryTotal[];
  expensesByCategory: CategoryTotal[];
  expensesByGroup: Record<"ESSENTIAL" | "DISCRETIONARY" | "FAMILY" | "UNGROUPED", Paise>;
  topMerchants: { merchant: string; merchantKey: string | null; amountPaise: Paise; count: number; pct: number | null }[];
  monthly: { month: string; income: Paise; expenses: Paise; net: Paise; investments: Paise }[];
}

type Bucket = { amount: Paise; count: number; name: string; group: SpendGroup | null };

function add(map: Map<string, Bucket>, key: string, name: string, group: SpendGroup | null, amount: Paise) {
  const b = map.get(key) ?? { amount: 0, count: 0, name, group };
  b.amount += amount;
  b.count += 1;
  map.set(key, b);
}

/**
 * How a single transaction contributes to income (+) and expense (+) totals.
 * This is the one place where the accounting rules live:
 *  - TRANSFER, SETTLEMENT, INVESTMENT, CASH, UNCLASSIFIED never count as income/expense.
 *  - Credit-card bill payments count as expense only when card purchases are not imported.
 *  - Refunds reduce the expense of the original's category (or a "Refunds" bucket if unlinked);
 *    a refund of a non-expense (e.g. a failed transfer) has no effect.
 *  - Credits in an expense category (cashback, merchant refund) reduce that category.
 */
export function classify(
  t: AnalyticsTxn,
  opts: AnalyticsOptions,
): { income: Paise; expense: Paise; expenseCategory?: { id: string | null; name: string; group: SpendGroup | null } } {
  const sign = t.direction === "CREDIT" ? 1 : -1;
  const own = { id: t.categoryId, name: t.categoryName, group: t.group };
  switch (t.categoryKind) {
    case "INCOME":
      return { income: sign * t.amountPaise, expense: 0 };
    case "EXPENSE":
      return { income: 0, expense: -sign * t.amountPaise, expenseCategory: own };
    case "CREDIT_CARD_PAYMENT":
      if (!opts.ccPaymentsAsExpense) return { income: 0, expense: 0 };
      return { income: 0, expense: -sign * t.amountPaise, expenseCategory: own };
    case "REFUND": {
      if (t.direction === "DEBIT") return { income: 0, expense: 0 };
      if (t.refundOf) {
        const k = t.refundOf.categoryKind;
        if (k === "EXPENSE" || (k === "CREDIT_CARD_PAYMENT" && opts.ccPaymentsAsExpense)) {
          return {
            income: 0,
            expense: -t.amountPaise,
            expenseCategory: { id: t.refundOf.categoryId, name: t.refundOf.categoryName, group: t.refundOf.group },
          };
        }
        return { income: 0, expense: 0 };
      }
      return { income: 0, expense: -t.amountPaise, expenseCategory: own };
    }
    default:
      return { income: 0, expense: 0 };
  }
}

export function computeSummary(txns: AnalyticsTxn[], range: DateRange, opts: AnalyticsOptions): Summary {
  const inRange = txns.filter((t) => t.date >= range.from && t.date <= range.to);
  const incomeCats = new Map<string, Bucket>();
  const expenseCats = new Map<string, Bucket>();
  const merchants = new Map<string, Bucket & { key: string | null }>();
  const months = new Map<string, { income: Paise; expenses: Paise; investments: Paise; net: Paise }>();
  const groups = { ESSENTIAL: 0, DISCRETIONARY: 0, FAMILY: 0, UNGROUPED: 0 };
  const s = {
    income: 0, expenses: 0, refunds: 0, totalCredits: 0, totalDebits: 0, investmentsIn: 0, investmentsOut: 0,
    transfersOut: 0, transfersIn: 0, ccPayments: 0, cashWithdrawals: 0, lendingOut: 0, lendingIn: 0,
    unclassifiedOut: 0, unclassifiedIn: 0, unclassifiedCount: 0,
  };

  for (const t of inRange) {
    const m = months.get(monthKey(t.date)) ?? { income: 0, expenses: 0, investments: 0, net: 0 };
    if (t.direction === "CREDIT") {
      s.totalCredits += t.amountPaise;
      m.net += t.amountPaise;
    } else {
      s.totalDebits += t.amountPaise;
      m.net -= t.amountPaise;
    }
    const c = classify(t, opts);
    if (c.income) {
      s.income += c.income;
      m.income += c.income;
      add(incomeCats, t.categoryId ?? "none", t.categoryName, null, c.income);
    }
    if (c.expense) {
      s.expenses += c.expense;
      m.expenses += c.expense;
      if (c.expense < 0) s.refunds += -c.expense;
      const cat = c.expenseCategory!;
      add(expenseCats, cat.id ?? "none", cat.name, cat.group, c.expense);
      groups[cat.group ?? "UNGROUPED"] += c.expense;
      if (c.expense > 0) {
        const groupKey = t.merchant;
        const mb = merchants.get(groupKey) ?? { amount: 0, count: 0, name: t.merchant, group: null, key: t.merchantKey };
        mb.amount += c.expense;
        mb.count += 1;
        if (!mb.key && t.merchantKey) mb.key = t.merchantKey;
        merchants.set(groupKey, mb);
      }
    }
    const debit = t.direction === "DEBIT";
    switch (t.categoryKind) {
      case "INVESTMENT":
        if (debit) {
          s.investmentsIn += t.amountPaise;
          m.investments += t.amountPaise;
        } else s.investmentsOut += t.amountPaise;
        break;
      case "TRANSFER":
        if (debit) s.transfersOut += t.amountPaise;
        else s.transfersIn += t.amountPaise;
        break;
      case "CREDIT_CARD_PAYMENT":
        if (debit) s.ccPayments += t.amountPaise;
        break;
      case "CASH":
        if (debit) s.cashWithdrawals += t.amountPaise;
        break;
      case "SETTLEMENT":
        if (debit) s.lendingOut += t.amountPaise;
        else s.lendingIn += t.amountPaise;
        break;
      case "UNCLASSIFIED":
        s.unclassifiedCount++;
        if (debit) s.unclassifiedOut += t.amountPaise;
        else s.unclassifiedIn += t.amountPaise;
        break;
    }
    months.set(monthKey(t.date), m);
  }

  const toTotals = (map: Map<string, Bucket>, total: Paise): CategoryTotal[] =>
    [...map.entries()]
      .map(([id, b]) => ({ categoryId: id === "none" ? null : id, name: b.name, group: b.group, amountPaise: b.amount, count: b.count, pct: percent(b.amount, total) }))
      .filter((c) => c.amountPaise !== 0)
      .sort((a, b) => b.amountPaise - a.amountPaise);

  const savings = s.income - s.expenses;
  const allMonths = range.from === "1900-01-01" ? [...months.keys()].sort() : monthsInRange(range.from, range.to);
  return {
    range,
    ...s,
    savings,
    savingsRate: s.income > 0 ? percent(savings, s.income) : null,
    netCashFlow: s.totalCredits - s.totalDebits,
    matchedTransferVolume: Math.min(s.transfersIn, s.transfersOut),
    incomeByCategory: toTotals(incomeCats, s.income),
    expensesByCategory: toTotals(expenseCats, s.expenses),
    expensesByGroup: groups,
    topMerchants: [...merchants.values()]
      .map((b) => ({ merchant: b.name, merchantKey: b.key, amountPaise: b.amount, count: b.count, pct: percent(b.amount, s.expenses) }))
      .sort((a, b) => b.amountPaise - a.amountPaise)
      .slice(0, 15),
    monthly: allMonths.map((month) => {
      const v = months.get(month) ?? { income: 0, expenses: 0, investments: 0, net: 0 };
      return { month, ...v };
    }),
  };
}

/**
 * A savings rate is only meaningful when the imported accounts actually receive the income.
 * When recorded income is below 20% of spending (e.g. salary goes to an account not imported),
 * we say so instead of showing a figure like −44,000%.
 */
export function incomeCaptured(s: Pick<Summary, "income" | "expenses">): boolean {
  return s.income > 0 && s.income * 5 >= s.expenses;
}

export interface CategoryChange {
  categoryId: string | null;
  name: string;
  current: Paise;
  previous: Paise;
  change: Paise;
  changePct: number | null;
}

/** Category-level comparison between two periods, largest absolute change first. */
export function compareCategories(current: Summary, previous: Summary): CategoryChange[] {
  const keys = new Map<string, { name: string; id: string | null }>();
  for (const c of [...current.expensesByCategory, ...previous.expensesByCategory]) {
    keys.set(c.categoryId ?? "none", { name: c.name, id: c.categoryId });
  }
  return [...keys.entries()]
    .map(([k, v]) => {
      const cur = current.expensesByCategory.find((c) => (c.categoryId ?? "none") === k)?.amountPaise ?? 0;
      const prev = previous.expensesByCategory.find((c) => (c.categoryId ?? "none") === k)?.amountPaise ?? 0;
      return { categoryId: v.id, name: v.name, current: cur, previous: prev, change: cur - prev, changePct: percent(cur - prev, prev) };
    })
    .filter((c) => c.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

export function largestExpenses(txns: AnalyticsTxn[], range: DateRange, opts: AnalyticsOptions, limit = 10) {
  return txns
    .filter((t) => t.date >= range.from && t.date <= range.to && t.direction === "DEBIT" && classify(t, opts).expense > 0)
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, limit);
}

export { sumPaise };
