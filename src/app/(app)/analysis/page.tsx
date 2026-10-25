import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Lightbulb, TrendingUp } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { computeSummary, compareCategories, incomeCaptured, largestExpenses, type Summary } from "@/lib/finance/analytics";
import { generateInsights } from "@/lib/finance/insights";
import { addMonths, formatDate, previousPeriod, startOfMonth, type DateRange } from "@/lib/dates";
import { formatINR, percent } from "@/lib/money";
import { href, rangeFromParams, rangeQuery, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { RangeFilter } from "@/components/range-filter";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { MonthlyBars, RankedBars, SplitBar } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FOCUS: { label: string; keys: string[] }[] = [
  { label: "Food (groceries + eating out)", keys: ["groceries", "food"] },
  { label: "Shopping", keys: ["shopping"] },
  { label: "Transport", keys: ["transport"] },
  { label: "Rent and housing", keys: ["rent"] },
  { label: "Family support", keys: ["family"] },
];

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { preset, range, label } = rangeFromParams(sp, "last-month");
  const rq = rangeQuery(preset, range);
  const tx = (q: Record<string, string>) => href("/transactions", { ...rq, ...q });

  const [txns, options, recurring, recurringTxnIds, categories] = await Promise.all([
    getAnalyticsTxns(user.id),
    getAnalyticsOptions(user.id),
    prisma.recurringTransaction.findMany({ where: { userId: user.id, status: { not: "REJECTED" }, direction: "DEBIT" }, include: { category: true } }),
    prisma.transaction.findMany({ where: { userId: user.id, recurringId: { not: null } }, select: { id: true } }),
    prisma.category.findMany({ where: { userId: user.id }, select: { id: true, key: true } }),
  ]);
  const keyOf = new Map(categories.map((c) => [c.id, c.key]));
  if (!txns.length) {
    return (
      <>
        <PageHeader title="Where is my money going?" />
        <EmptyState icon={<TrendingUp />} title="No data yet" description="Import statements to see your spending analysis." action={{ href: "/import", label: "Import statement" }} />
      </>
    );
  }

  const s = computeSummary(txns, range, options);
  const prevRange = previousPeriod(range);
  const p = computeSummary(txns, prevRange, options);
  // Baseline: the three equal-length periods before the current one.
  const baselines: Summary[] = [];
  let r: DateRange = range;
  for (let i = 0; i < 3; i++) {
    r = previousPeriod(r);
    baselines.push(computeSummary(txns, r, options));
  }
  const changes = compareCategories(s, p);
  const unexpected = s.expensesByCategory
    .map((c) => {
      const avg = Math.round(baselines.reduce((t, b) => t + (b.expensesByCategory.find((x) => x.categoryId === c.categoryId)?.amountPaise ?? 0), 0) / baselines.length);
      return { ...c, avg, diff: c.amountPaise - avg };
    })
    .filter((c) => c.diff >= 1000_00 && (c.avg === 0 ? c.amountPaise >= 2000_00 : c.amountPaise > c.avg * 1.25))
    .sort((a, b) => b.diff - a.diff);

  const trendFrom = range.from === "1900-01-01" ? range.from : addMonths(startOfMonth(range.to), -5) < range.from ? addMonths(startOfMonth(range.to), -5) : range.from;
  const trend = computeSummary(txns, { from: trendFrom, to: range.to }, options);
  const recurringIds = new Set(recurringTxnIds.map((t) => t.id));
  const oneTime = largestExpenses(txns, range, options, 40).filter((t) => !recurringIds.has(t.id)).slice(0, 8);
  const insights = generateInsights({ current: s, previous: p, txns, options, linkBase: tx });
  const subs = recurring.filter((x) => x.kind === "SUBSCRIPTION" || x.category?.key === "subscriptions");
  const spendChange = s.expenses - p.expenses;
  const byKey = (keys: string[], sum: Summary) =>
    sum.expensesByCategory.filter((c) => keys.includes(keyOf.get(c.categoryId ?? "") ?? "")).reduce((t, c) => t + c.amountPaise, 0);

  return (
    <>
      <PageHeader
        title="Where is my money going?"
        description={`${label} · ${formatDate(range.from === "1900-01-01" ? txns[0].date : range.from)} – ${formatDate(range.to)} · compared with ${formatDate(prevRange.from)} – ${formatDate(prevRange.to)}`}
        actions={<RangeFilter preset={preset} from={range.from} to={range.to} />}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Spent" value={formatINR(s.expenses, { decimals: false })} hint={`${s.expensesByCategory.reduce((t, c) => t + c.count, 0)} transactions · refunds ${formatINR(s.refunds, { decimals: false })} netted`} />
        <StatCard
          label="Change vs previous period"
          value={
            <span className="inline-flex items-center gap-1">
              {spendChange > 0 ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
              {formatINR(Math.abs(spendChange), { decimals: false })}
            </span>
          }
          hint={p.expenses ? `${spendChange > 0 ? "+" : ""}${percent(spendChange, p.expenses)}% (was ${formatINR(p.expenses, { decimals: false })})` : "No spending in the previous period"}
        />
        <StatCard label="Left after income & expenses" value={<Money paise={s.savings} tone="signed" />} hint={`Income ${formatINR(s.income, { decimals: false })}${incomeCaptured(s) ? ` · savings rate ${s.savingsRate}%` : " · most income isn't received in these accounts"}`} />
        <StatCard label="Moved between own accounts" value={formatINR(s.transfersOut, { decimals: false })} hint={`vs ${formatINR(s.expenses, { decimals: false })} spent externally — transfers are not spending`} />
      </section>

      {insights.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4" /> Observations
            </CardTitle>
            <CardDescription>Derived only from your transactions in this period</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-4 md:grid-cols-2">
              {insights.map((i) => (
                <li key={i.title} className="rounded-lg border p-3">
                  <div className="font-medium">{i.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{i.detail}</p>
                  {i.href && (
                    <Link href={i.href} className="mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline">
                      See transactions →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Amount and share of total spending. Click a category for its transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.expensesByCategory.length ? (
              <RankedBars data={s.expensesByCategory.map((c) => ({ label: c.name, amount: c.amountPaise, pct: c.pct, href: tx({ category: c.categoryId ?? "" }), sub: `${c.count} transaction(s)` }))} />
            ) : (
              <p className="text-sm text-muted-foreground">No categorized spending in this period.</p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Essential vs discretionary</CardTitle>
              <CardDescription>Based on each category’s group (editable in Settings)</CardDescription>
            </CardHeader>
            <CardContent>
              <SplitBar
                parts={[
                  { label: "Essential", amount: s.expensesByGroup.ESSENTIAL, color: "var(--series-1)" },
                  { label: "Discretionary", amount: s.expensesByGroup.DISCRETIONARY + s.expensesByGroup.UNGROUPED, color: "var(--series-2)" },
                  { label: "Family support", amount: s.expensesByGroup.FAMILY, color: "var(--series-3)" },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Key areas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead className="text-right">This period</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FOCUS.map((f) => {
                    const cur = byKey(f.keys, s);
                    const prev = byKey(f.keys, p);
                    return (
                      <TableRow key={f.label}>
                        <TableCell>{f.label}</TableCell>
                        <TableCell className="tabular text-right">{formatINR(cur, { decimals: false })}</TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">{formatINR(prev, { decimals: false })}</TableCell>
                        <TableCell className="tabular text-right">{percent(cur, s.expenses) ?? 0}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What changed</CardTitle>
            <CardDescription>Category spending vs the previous period, largest change first</CardDescription>
          </CardHeader>
          <CardContent>
            {changes.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Now</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.slice(0, 10).map((c) => (
                    <TableRow key={c.name}>
                      <TableCell>
                        <Link href={tx({ category: c.categoryId ?? "" })} className="underline-offset-4 hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-right">{formatINR(c.current, { decimals: false })}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{formatINR(c.previous, { decimals: false })}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatINR(c.change, { decimals: false, sign: true })}
                        {c.changePct !== null && <span className="ml-1 text-xs text-muted-foreground">({c.changePct > 0 ? "+" : ""}{c.changePct}%)</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No changes to compare.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unusual increases</CardTitle>
            <CardDescription>Categories at least 25% and ₹1,000 above their average over the previous three periods</CardDescription>
          </CardHeader>
          <CardContent>
            {unexpected.length ? (
              <ul className="space-y-3 text-sm">
                {unexpected.map((c) => (
                  <li key={c.name} className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={tx({ category: c.categoryId ?? "" })} className="font-medium underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.avg === 0 ? "New this period — no spending in the previous three periods" : `Usually about ${formatINR(c.avg, { decimals: false })}`}
                      </div>
                    </div>
                    <Badge variant="outline" className="tabular">
                      +{formatINR(c.diff, { decimals: false })}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing stands out against your recent baseline.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Monthly trend</CardTitle>
            <CardDescription>Income vs spending per month</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={trend.monthly} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top merchants</CardTitle>
            <CardDescription>Who received the most of your spending</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              max={8}
              data={s.topMerchants.map((m) => ({ label: m.merchant, amount: m.amountPaise, pct: m.pct, sub: `${m.count} payment(s)`, href: m.merchantKey ? tx({ merchant: m.merchantKey }) : undefined }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Largest one-time expenses</CardTitle>
            <CardDescription>Excluding detected recurring payments</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {oneTime.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.merchant}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(t.date)} · {t.categoryName}
                    </div>
                  </div>
                  <Money paise={t.amountPaise} />
                </li>
              ))}
              {!oneTime.length && <li className="text-muted-foreground">None in this period.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions & recurring charges</CardTitle>
            <CardDescription>Annualized cost — worth checking you still use each</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {(subs.length ? subs : recurring.slice(0, 6)).map((r) => {
                const perYear = Number(r.typicalAmountPaise) * ({ WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 } as const)[r.frequency];
                const raised = Number(r.maxAmountPaise) > Number(r.minAmountPaise) * 1.05;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatINR(Number(r.typicalAmountPaise), { decimals: false })} {r.frequency.toLowerCase()} · {r.occurrences} payments
                        {raised && ` · ranged ${formatINR(Number(r.minAmountPaise), { decimals: false })}–${formatINR(Number(r.maxAmountPaise), { decimals: false })}`}
                      </div>
                    </div>
                    <span className="tabular text-right text-xs text-muted-foreground">{formatINR(perYear, { decimals: false })}/yr</span>
                  </li>
                );
              })}
              {!recurring.length && <li className="text-muted-foreground">No recurring payments detected (needs at least 3 regular occurrences).</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending vs money movements</CardTitle>
            <CardDescription>Outflows that are not consumption are shown separately</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              data={[
                { label: "Spending (expenses)", amount: s.expenses, href: tx({ kind: "EXPENSE" }) },
                { label: "Transfers to own accounts", amount: s.transfersOut, href: tx({ kind: "TRANSFER", direction: "DEBIT" }) },
                { label: `Credit card bills${options.ccPaymentsAsExpense ? " (in spending)" : ""}`, amount: s.ccPayments, href: tx({ kind: "CREDIT_CARD_PAYMENT" }) },
                { label: "Investments", amount: s.investmentsIn, href: tx({ kind: "INVESTMENT", direction: "DEBIT" }) },
                { label: "Cash withdrawals", amount: s.cashWithdrawals, href: tx({ kind: "CASH" }) },
                { label: "Lent to people", amount: s.lendingOut, href: tx({ kind: "SETTLEMENT", direction: "DEBIT" }) },
                { label: "Not yet categorized", amount: s.unclassifiedOut, href: tx({ kind: "UNCLASSIFIED", direction: "DEBIT" }) },
              ].filter((x) => x.amount > 0)}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
