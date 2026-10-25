import { formatINR, percent, type Paise } from "@/lib/money";
import { classify, compareCategories, incomeCaptured, type AnalyticsOptions, type AnalyticsTxn, type Summary } from "./analytics";

export interface Insight {
  title: string;
  detail: string;
  href?: string;
  /** Used only for ordering; insights are descriptive, never judgemental. */
  weight: number;
}

const fmt = (p: Paise) => formatINR(p, { decimals: false });

/**
 * Three to five observations grounded in the selected period's transactions.
 * Each one quantifies what changed and links to the transactions behind it.
 */
export function generateInsights(input: {
  current: Summary;
  previous: Summary;
  txns: AnalyticsTxn[];
  options: AnalyticsOptions;
  linkBase: (q: Record<string, string>) => string;
}): Insight[] {
  const { current: c, previous: p, txns, options, linkBase } = input;
  const out: Insight[] = [];
  const inRange = txns.filter((t) => t.date >= c.range.from && t.date <= c.range.to);

  // Savings / income position.
  if (incomeCaptured(c)) {
    out.push({
      title: `You kept ${c.savingsRate}% of income`,
      detail: `Income ${fmt(c.income)} minus spending ${fmt(c.expenses)} leaves ${fmt(c.savings)}${
        c.investmentsIn ? `; separately, ${fmt(c.investmentsIn)} went into investments` : ""
      }.${p.income > 0 && p.savingsRate !== null ? ` Previous period: ${p.savingsRate}%.` : ""}`,
      weight: 50,
    });
  } else if (c.expenses > 0) {
    out.push({
      title: c.income ? "Most of your income isn't in these accounts" : "No income was detected in these accounts",
      detail: `Spending was ${fmt(c.expenses)} but recorded income was only ${fmt(c.income)}, and no salary credits were found. Money arrived mainly as transfers from your other accounts${c.transfersIn ? ` (${fmt(c.transfersIn)})` : ""} and from people (${fmt(c.unclassifiedIn)} not yet categorized). Import the account your salary lands in for a real savings rate.`,
      href: "/import",
      weight: 80,
    });
  }

  // Largest category changes vs previous period.
  for (const ch of compareCategories(c, p).slice(0, 3)) {
    if (Math.abs(ch.change) < 1000_00 || (ch.previous > 0 && Math.abs(ch.changePct ?? 0) < 20)) continue;
    const cat = inRange
      .filter((t) => (t.refundOf ? false : t.categoryId === ch.categoryId) && classify(t, options).expense > 0)
      .sort((a, b) => b.amountPaise - a.amountPaise);
    const biggest = cat[0];
    out.push({
      title: `${ch.name} ${ch.change > 0 ? "rose" : "fell"} by ${fmt(Math.abs(ch.change))}`,
      detail: `${fmt(ch.current)} this period vs ${fmt(ch.previous)} before${ch.changePct !== null ? ` (${ch.change > 0 ? "+" : ""}${ch.changePct}%)` : ""}, across ${cat.length} transaction(s)${
        biggest ? `; the largest was ${fmt(biggest.amountPaise)} to ${biggest.merchant} on ${biggest.date}` : ""
      }.`,
      href: ch.categoryId ? linkBase({ category: ch.categoryId }) : undefined,
      weight: 40 + Math.min(Math.abs(ch.change) / 1000_00, 30),
    });
  }

  // Credit card bills: the biggest blind spot when card statements are missing.
  if (c.ccPayments > 0) {
    const share = percent(c.ccPayments, c.totalDebits - c.transfersOut);
    out.push({
      title: `${fmt(c.ccPayments)} paid towards credit card bills`,
      detail: options.ccPaymentsAsExpense
        ? `That is ${share}% of outflows (excluding own-account transfers). Card purchases are not itemized here, so this money shows as one lump; importing card statements would reveal where it went.`
        : `Excluded from spending because the card purchases themselves are imported.`,
      href: linkBase({ kind: "CREDIT_CARD_PAYMENT" }),
      weight: options.ccPaymentsAsExpense ? 45 + (share ?? 0) / 2 : 10,
    });
  }

  // Avoidable bank charges with concrete evidence.
  const charges = inRange.filter((t) => t.categoryKey === "bank-charges" && t.direction === "DEBIT");
  const chargeTotal = charges.reduce((s, t) => s + t.amountPaise, 0);
  if (chargeTotal >= 100_00) {
    const bounces = charges.filter((t) => /NACH RETURN|ECS RETURN|BOUNCE|MANDATE/i.test(t.description ?? ""));
    out.push({
      title: `${fmt(chargeTotal)} paid in bank charges`,
      detail: `${charges.length} charge(s) in this period${bounces.length ? `, including ${bounces.length} mandate-return charge(s) — these are levied when an auto-debit fails for low balance` : ""}.`,
      href: linkBase({ category: charges[0].categoryId ?? "" }),
      weight: 35 + chargeTotal / 100_00,
    });
  }

  // Unclassified outflows reduce accuracy.
  if (c.unclassifiedOut > 0) {
    out.push({
      title: `${fmt(c.unclassifiedOut)} of outflows are not yet categorized`,
      detail: `${c.unclassifiedCount} transaction(s), mostly payments to people, are excluded from spending until you categorize them (e.g. family support, lending, rent).`,
      href: "/transactions?review=1",
      weight: 30 + percent(c.unclassifiedOut, Math.max(c.totalDebits, 1))! / 2,
    });
  }

  // Top merchant concentration.
  const m = c.topMerchants[0];
  if (m && m.pct !== null && m.pct >= 15) {
    out.push({
      title: `${m.merchant} received ${m.pct}% of spending`,
      detail: `${fmt(m.amountPaise)} over ${m.count} payment(s) in this period.`,
      href: m.merchantKey ? linkBase({ merchant: m.merchantKey }) : undefined,
      weight: 20 + m.pct / 2,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
}
