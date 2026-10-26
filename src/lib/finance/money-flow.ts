import type { CategoryKind } from "@prisma/client";
import type { DateRange } from "@/lib/dates";
import { percent, type Paise } from "@/lib/money";
import { classify, type AnalyticsOptions, type AnalyticsTxn } from "./analytics";

/**
 * Where every rupee went: all debits and all credits of a period split into named buckets
 * that add up exactly to the totals. Unlike computeSummary, nothing is left out — money that
 * is not yet classified gets its own bucket instead of silently disappearing.
 */

export type OutBucket = "myself" | "family" | "card" | "invested" | "own" | "people" | "cash" | "other" | "unclassified";
export type InBucket = "income" | "paidBack" | "people" | "own" | "investments" | "cash" | "unclassified";

export const OUT_BUCKETS: { key: OutBucket; label: string; kinds: CategoryKind[] }[] = [
  { key: "myself", label: "Spent on myself", kinds: ["EXPENSE"] },
  { key: "family", label: "Family support", kinds: ["EXPENSE"] },
  { key: "card", label: "Card bills", kinds: ["CREDIT_CARD_PAYMENT"] },
  { key: "invested", label: "Invested", kinds: ["INVESTMENT"] },
  { key: "own", label: "Moved to my own accounts", kinds: ["TRANSFER"] },
  { key: "people", label: "Lent or repaid to people", kinds: ["SETTLEMENT"] },
  { key: "cash", label: "Cash withdrawn", kinds: ["CASH"] },
  { key: "other", label: "Other", kinds: ["INCOME", "REFUND"] },
  { key: "unclassified", label: "Not yet classified", kinds: ["UNCLASSIFIED"] },
];

export const IN_BUCKETS: { key: InBucket; label: string; kinds: CategoryKind[] }[] = [
  { key: "income", label: "Income", kinds: ["INCOME"] },
  { key: "paidBack", label: "Paid back by people and refunds", kinds: ["EXPENSE", "CREDIT_CARD_PAYMENT", "REFUND"] },
  { key: "people", label: "Borrowed or repaid by people", kinds: ["SETTLEMENT"] },
  { key: "own", label: "From my own accounts", kinds: ["TRANSFER"] },
  { key: "investments", label: "Investment withdrawals", kinds: ["INVESTMENT"] },
  { key: "cash", label: "Cash deposits", kinds: ["CASH"] },
  { key: "unclassified", label: "Not yet classified", kinds: ["UNCLASSIFIED"] },
];

export function outBucketOf(t: Pick<AnalyticsTxn, "categoryKind" | "group">): OutBucket {
  switch (t.categoryKind) {
    case "EXPENSE":
      return t.group === "FAMILY" ? "family" : "myself";
    case "CREDIT_CARD_PAYMENT":
      return "card";
    case "INVESTMENT":
      return "invested";
    case "TRANSFER":
      return "own";
    case "SETTLEMENT":
      return "people";
    case "CASH":
      return "cash";
    case "INCOME":
    case "REFUND":
      return "other";
    default:
      return "unclassified";
  }
}

export function inBucketOf(t: Pick<AnalyticsTxn, "categoryKind">): InBucket {
  switch (t.categoryKind) {
    case "INCOME":
      return "income";
    case "EXPENSE":
    case "CREDIT_CARD_PAYMENT":
    case "REFUND":
      return "paidBack";
    case "SETTLEMENT":
      return "people";
    case "TRANSFER":
      return "own";
    case "INVESTMENT":
      return "investments";
    case "CASH":
      return "cash";
    default:
      return "unclassified";
  }
}

export interface FlowCounterparty {
  key: string;
  label: string;
  personId: string | null;
  amountPaise: Paise;
  count: number;
}

export interface MoneyFlow {
  range: DateRange;
  totalOut: Paise;
  totalIn: Paise;
  out: Record<OutBucket, Paise>;
  in: Record<InBucket, Paise>;
  /** Expense debits outside Family support, minus the credits that net against them. */
  myselfNet: Paise;
  familyNet: Paise;
  /** Card-bill debits minus friends' card repayments and card-bill refunds. */
  cardNet: Paise;
  /** Own-account transfers out with no matched credit in an imported account. */
  unmatchedTransfersOut: Paise;
  unclassifiedOutShare: number | null;
  topUnclassified: FlowCounterparty[];
}

const zeroOut = (): Record<OutBucket, Paise> => ({ myself: 0, family: 0, card: 0, invested: 0, own: 0, people: 0, cash: 0, other: 0, unclassified: 0 });
const zeroIn = (): Record<InBucket, Paise> => ({ income: 0, paidBack: 0, people: 0, own: 0, investments: 0, cash: 0, unclassified: 0 });

const isCardRow = (t: AnalyticsTxn) => t.categoryKind === "CREDIT_CARD_PAYMENT" || (t.categoryKind === "REFUND" && t.refundOf?.categoryKind === "CREDIT_CARD_PAYMENT");

export function computeMoneyFlow(
  txns: (AnalyticsTxn & { personId?: string | null })[],
  range: DateRange,
  opts: AnalyticsOptions,
  unmatchedTransferIds: ReadonlySet<string>,
): MoneyFlow {
  const out = zeroOut();
  const inn = zeroIn();
  let totalOut = 0;
  let totalIn = 0;
  let myselfNet = 0;
  let familyNet = 0;
  let cardNet = 0;
  let unmatchedTransfersOut = 0;
  const unknown = new Map<string, FlowCounterparty>();

  for (const t of txns) {
    if (t.date < range.from || t.date > range.to) continue;
    if (t.direction === "DEBIT") {
      totalOut += t.amountPaise;
      const b = outBucketOf(t);
      out[b] += t.amountPaise;
      if (b === "own" && unmatchedTransferIds.has(t.id)) unmatchedTransfersOut += t.amountPaise;
      if (b === "unclassified") {
        const key = t.merchantKey ?? t.merchant;
        const u = unknown.get(key) ?? { key, label: t.merchant, personId: t.personId ?? null, amountPaise: 0, count: 0 };
        u.amountPaise += t.amountPaise;
        u.count++;
        if (!u.personId && t.personId) u.personId = t.personId;
        unknown.set(key, u);
      }
    } else {
      totalIn += t.amountPaise;
      inn[inBucketOf(t)] += t.amountPaise;
    }

    // Net figures reuse the accounting rules of Spending Analysis so the two pages agree.
    if (isCardRow(t)) {
      cardNet += classify(t, { ccPaymentsAsExpense: true }).expense;
      continue;
    }
    const c = classify(t, opts);
    if (!c.expense) continue;
    if (c.expenseCategory?.group === "FAMILY") familyNet += c.expense;
    else myselfNet += c.expense;
  }

  return {
    range,
    totalOut,
    totalIn,
    out,
    in: inn,
    myselfNet,
    familyNet,
    cardNet,
    unmatchedTransfersOut,
    unclassifiedOutShare: percent(out.unclassified, totalOut),
    topUnclassified: [...unknown.values()].sort((a, b) => b.amountPaise - a.amountPaise).slice(0, 5),
  };
}
