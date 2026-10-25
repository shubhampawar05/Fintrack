import "server-only";
import { prisma } from "./db";
import type { AnalyticsOptions, AnalyticsTxn } from "@/lib/finance/analytics";
import { addDays, dateToIso, isoToDate, todayIso, type DateRange } from "@/lib/dates";
import { toPaise, type Paise } from "@/lib/money";

export async function getAnalyticsOptions(userId: string): Promise<AnalyticsOptions & { reason: string }> {
  const [settings, cardAccounts] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.bankAccount.count({ where: { userId, accountType: "CREDIT_CARD", archived: false } }),
  ]);
  const t = settings?.ccPaymentTreatment ?? "AUTO";
  if (t === "EXPENSE") return { ccPaymentsAsExpense: true, reason: "Card bill payments are counted as spending (Settings)." };
  if (t === "EXCLUDE") return { ccPaymentsAsExpense: false, reason: "Card bill payments are excluded from spending (Settings)." };
  return cardAccounts > 0
    ? { ccPaymentsAsExpense: false, reason: "Card purchases are imported, so card bill payments are not counted again." }
    : { ccPaymentsAsExpense: true, reason: "No credit-card statements are imported, so card bill payments are counted as (unitemized) spending." };
}

/** Load transactions in shape needed by analytics. `range` may be widened by callers for comparisons. */
export async function getAnalyticsTxns(userId: string, range?: DateRange): Promise<AnalyticsTxn[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, ...(range ? { txnDate: { gte: isoToDate(range.from), lte: isoToDate(range.to) } } : {}) },
    include: { category: true, refundOf: { include: { category: true } } },
    orderBy: { txnDate: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    date: dateToIso(t.txnDate),
    accountId: t.accountId,
    direction: t.direction,
    amountPaise: toPaise(t.amountPaise),
    categoryId: t.categoryId,
    categoryKey: t.category?.key ?? null,
    categoryName: t.category?.name ?? "Unclassified",
    categoryKind: t.category?.kind ?? "UNCLASSIFIED",
    group: t.category?.group ?? null,
    merchant: t.merchantOverride || t.merchant || t.description.slice(0, 40),
    merchantKey: t.merchantKey,
    description: t.description,
    refundOf: t.refundOf
      ? {
          categoryId: t.refundOf.categoryId,
          categoryName: t.refundOf.category?.name ?? "Unclassified",
          categoryKind: t.refundOf.category?.kind ?? "UNCLASSIFIED",
          group: t.refundOf.category?.group ?? null,
        }
      : null,
  }));
}

export interface AccountOverview {
  id: string;
  displayName: string;
  bankName: string;
  accountType: string;
  accountLast4: string | null;
  color: string | null;
  transactionCount: number;
  firstDate: string | null;
  lastDate: string | null;
  balance: { status: "VERIFIED" | "UNVERIFIED" | "UNKNOWN"; amountPaise: Paise | null; asOf: string | null; note: string };
  coverage: { from: string; to: string }[];
  gaps: { from: string; to: string }[];
  imports: number;
}

/** Merge statement periods into continuous coverage windows and report the gaps between them. */
export function coverageWindows(periods: { from: string; to: string }[]) {
  const sorted = [...periods].sort((a, b) => (a.from < b.from ? -1 : 1));
  const merged: { from: string; to: string }[] = [];
  for (const p of sorted) {
    const last = merged[merged.length - 1];
    if (last && p.from <= addDays(last.to, 1)) {
      if (p.to > last.to) last.to = p.to;
    } else merged.push({ ...p });
  }
  const gaps = merged.slice(1).map((m, i) => ({ from: addDays(merged[i].to, 1), to: addDays(m.from, -1) }));
  return { merged, gaps };
}

export async function getAccountsOverview(userId: string): Promise<AccountOverview[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    include: { imports: { where: { status: "COMMITTED" }, orderBy: { periodEnd: "desc" } } },
  });
  const stats = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId },
    _count: true,
    _min: { txnDate: true },
    _max: { txnDate: true },
  });
  return Promise.all(
    accounts.map(async (a) => {
      const st = stats.find((s) => s.accountId === a.id);
      const periods = a.imports
        .filter((i) => i.periodStart && i.periodEnd)
        .map((i) => ({ from: dateToIso(i.periodStart!), to: dateToIso(i.periodEnd!) }));
      const { merged, gaps } = coverageWindows(periods);
      const latest = a.imports.find((i) => i.periodEnd && i.closingBalancePaise !== null);
      let balance: AccountOverview["balance"] = {
        status: "UNKNOWN",
        amountPaise: null,
        asOf: null,
        note: "No statement with a closing balance has been imported.",
      };
      if (latest) {
        const asOf = dateToIso(latest.periodEnd!);
        // Manual entries after the statement end adjust the balance; they are not bank-verified.
        const after = await prisma.transaction.findMany({
          where: { accountId: a.id, txnDate: { gt: latest.periodEnd! } },
          select: { amountPaise: true, direction: true, txnDate: true },
        });
        const delta = after.reduce((s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * toPaise(t.amountPaise), 0);
        const verified = latest.balanceCheck === "PASSED" && after.length === 0;
        balance = {
          status: verified ? "VERIFIED" : "UNVERIFIED",
          amountPaise: toPaise(latest.closingBalancePaise) + delta,
          asOf: after.length ? dateToIso(new Date(Math.max(...after.map((t) => t.txnDate.getTime())))) : asOf,
          note: verified
            ? `Closing balance printed on the statement ending ${asOf}, reconciled row by row.`
            : after.length
              ? "Statement balance adjusted by later transactions that are not bank-verified."
              : "The statement's running balance did not fully reconcile — verify against your bank.",
        };
      }
      return {
        id: a.id,
        displayName: a.displayName,
        bankName: a.bankName,
        accountType: a.accountType,
        accountLast4: a.accountLast4,
        color: a.color,
        transactionCount: st?._count ?? 0,
        firstDate: st?._min.txnDate ? dateToIso(st._min.txnDate) : null,
        lastDate: st?._max.txnDate ? dateToIso(st._max.txnDate) : null,
        balance,
        coverage: merged,
        gaps,
        imports: a.imports.length,
      };
    }),
  );
}

export interface DataQualityWarning {
  level: "info" | "warning";
  message: string;
  href?: string;
}

/** Explicit statements about what the numbers can and cannot tell you. */
export async function getDataQualityWarnings(userId: string, range: DateRange): Promise<DataQualityWarning[]> {
  const [accounts, unclassified, review, suggestions, options, ownUnmatched] = await Promise.all([
    getAccountsOverview(userId),
    prisma.transaction.count({ where: { userId, txnDate: { gte: isoToDate(range.from), lte: isoToDate(range.to) }, category: { kind: "UNCLASSIFIED" } } }),
    prisma.transaction.count({ where: { userId, needsReview: true, txnDate: { gte: isoToDate(range.from), lte: isoToDate(range.to) } } }),
    prisma.internalTransfer.count({ where: { userId, status: "SUGGESTED" } }),
    getAnalyticsOptions(userId),
    prisma.transaction.aggregate({
      where: {
        userId, txnDate: { gte: isoToDate(range.from), lte: isoToDate(range.to) }, category: { kind: "TRANSFER" },
        transferOut: null, transferIn: null,
      },
      _count: true,
    }),
  ]);
  const w: DataQualityWarning[] = [];
  if (!accounts.length) w.push({ level: "info", message: "No accounts yet. Add your bank accounts and import statements.", href: "/accounts" });
  for (const a of accounts) {
    if (a.transactionCount === 0) {
      w.push({ level: "warning", message: `${a.displayName}: no statements imported yet.`, href: "/import" });
      continue;
    }
    // Future days can't be covered by any statement yet.
    const to = range.to > todayIso() ? todayIso() : range.to;
    const covered = a.coverage.some((c) => c.from <= range.from && c.to >= to);
    const overlaps = a.coverage.some((c) => c.from <= range.to && c.to >= range.from);
    if (!covered && range.from !== "1900-01-01") {
      w.push({
        level: "warning",
        message: overlaps
          ? `${a.displayName}: statements only partly cover the selected period (covered ${a.coverage.map((c) => `${c.from} → ${c.to}`).join(", ")}).`
          : `${a.displayName}: no statement covers the selected period, so its activity is missing from these totals.`,
        href: "/accounts",
      });
    }
    for (const g of a.gaps) w.push({ level: "warning", message: `${a.displayName}: no statement for ${g.from} → ${g.to}.`, href: "/import" });
    if (a.balance.status !== "VERIFIED") w.push({ level: "info", message: `${a.displayName}: balance is ${a.balance.status.toLowerCase()} — ${a.balance.note}`, href: "/accounts" });
  }
  if (unclassified) w.push({ level: "warning", message: `${unclassified} transaction(s) in this period are unclassified and are excluded from income and expenses until reviewed.`, href: "/transactions?review=1" });
  else if (review) w.push({ level: "info", message: `${review} transaction(s) have low-confidence categories awaiting review.`, href: "/transactions?review=1" });
  if (suggestions) w.push({ level: "info", message: `${suggestions} possible transfer(s) between your accounts need confirmation.`, href: "/transactions?transfers=1" });
  if (ownUnmatched._count) {
    w.push({
      level: "info",
      message: `${ownUnmatched._count} transfer(s) involve your own accounts that are not imported here (e.g. other banks or wallets). They are excluded from income and expenses.`,
    });
  }
  w.push({ level: "info", message: options.reason, href: "/settings" });
  return w;
}
