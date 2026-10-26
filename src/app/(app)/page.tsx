import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleHelp, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAccountsOverview, getAnalyticsOptions, getAnalyticsTxns, getDataQualityWarnings } from "@/server/queries";
import { computeSummary, incomeCaptured, largestExpenses } from "@/lib/finance/analytics";
import { addMonths, formatDate, previousPeriod, startOfMonth } from "@/lib/dates";
import { formatINR, percent } from "@/lib/money";
import { href, rangeFromParams, rangeQuery, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { RangeFilter } from "@/components/range-filter";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { MonthlyBars, RankedBars } from "@/components/charts";
import { DataWarnings } from "@/components/data-warnings";
import { getSetupProgress } from "@/server/onboarding";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { HowItWorks } from "@/components/onboarding/how-it-works";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { preset, range, label } = rangeFromParams(sp, "last-3-months");
  const rq = rangeQuery(preset, range);

  const onboarding = await getSetupProgress(user.id);
  const walkthrough = !onboarding.guideSeen && <HowItWorks autoOpen seen={false} />;
  if (onboarding.progress.nextPrerequisite) {
    // No accounts or nothing imported yet: the setup checklist is the dashboard.
    return (
      <>
        <PageHeader title="Dashboard" description="Where your money goes, across all your accounts." />
        {walkthrough}
        <SetupChecklist progress={onboarding.progress} mode="full" />
      </>
    );
  }
  const showChecklist = !onboarding.progress.allRequiredDone && !onboarding.checklistHidden;

  const prev = previousPeriod(range);
  const trendFrom = range.from === "1900-01-01" ? range.from : addMonths(startOfMonth(range.to), -5) < range.from ? addMonths(startOfMonth(range.to), -5) : range.from;
  const [txns, options, accounts, warnings, recurring, recent, uncategorized] = await Promise.all([
    getAnalyticsTxns(user.id),
    getAnalyticsOptions(user.id),
    getAccountsOverview(user.id),
    getDataQualityWarnings(user.id, range),
    prisma.recurringTransaction.findMany({ where: { userId: user.id, status: { not: "REJECTED" }, direction: "DEBIT" }, orderBy: { typicalAmountPaise: "desc" }, take: 5 }),
    prisma.transaction.findMany({ where: { userId: user.id }, include: { account: true, category: true }, orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }], take: 6 }),
    prisma.transaction.findMany({ where: { userId: user.id, needsReview: true }, include: { account: true }, orderBy: [{ amountPaise: "desc" }], take: 5 }),
  ]);
  const s = computeSummary(txns, range, options);
  const p = computeSummary(txns, prev, options);
  const trend = computeSummary(txns, { from: trendFrom, to: range.to }, options);
  const largest = largestExpenses(txns, range, options, 5);
  const spendChange = percent(s.expenses - p.expenses, p.expenses);

  const known = accounts.filter((a) => a.balance.amountPaise !== null);
  const totalBalance = known.reduce((t, a) => t + a.balance.amountPaise!, 0);
  const allVerified = known.length === accounts.length && accounts.every((a) => a.balance.status === "VERIFIED");
  const perAccount = new Map(accounts.map((a) => [a.id, { in: 0, out: 0, n: 0 }]));
  for (const t of txns) {
    if (t.date < range.from || t.date > range.to) continue;
    const a = perAccount.get(t.accountId);
    if (!a) continue;
    a.n++;
    if (t.direction === "CREDIT") a.in += t.amountPaise;
    else a.out += t.amountPaise;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${label} · ${formatDate(range.from === "1900-01-01" ? (txns[0]?.date ?? range.from) : range.from)} – ${formatDate(range.to)}`}
        actions={<RangeFilter preset={preset} from={range.from} to={range.to} />}
      />
      {walkthrough}
      {showChecklist && <SetupChecklist progress={onboarding.progress} mode="banner" />}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
        <StatCard
          label="Total balance"
          icon={allVerified ? <CheckCircle2 className="size-4 text-positive" aria-label="Verified" /> : <CircleHelp className="size-4" aria-label="Partly unverified" />}
          value={known.length ? formatINR(totalBalance, { decimals: false }) : "Unknown"}
          hint={
            allVerified
              ? "Verified from statement closing balances"
              : `${known.length} of ${accounts.length} account balances known${known.some((a) => a.balance.status !== "VERIFIED") ? " · some unverified" : ""}`
          }
        />
        <StatCard label="Income" value={formatINR(s.income, { decimals: false })} hint={s.income ? `${s.incomeByCategory[0]?.name ?? ""} is the largest source` : "No income detected"} />
        <StatCard
          label="Expenses"
          value={formatINR(s.expenses, { decimals: false })}
          hint={
            spendChange === null ? (
              "No previous period to compare"
            ) : (
              <span className="inline-flex items-center gap-1">
                {spendChange > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(spendChange)}% vs previous period ({formatINR(p.expenses, { decimals: false })})
              </span>
            )
          }
        />
        <StatCard
          label="Savings"
          value={<Money paise={s.savings} tone="signed" />}
          hint={incomeCaptured(s) ? `Savings rate ${s.savingsRate}%` : "Rate not shown: most income isn't received in these accounts"}
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Money movements">
        <StatCard label="Net cash flow" value={<Money paise={s.netCashFlow} tone="signed" />} hint="All credits − all debits" />
        <StatCard label="Invested" value={formatINR(s.investmentsIn, { decimals: false })} hint={s.investmentsOut ? `${formatINR(s.investmentsOut, { decimals: false })} withdrawn/paid out` : "Contributions to assets"} />
        <StatCard label="Own-account transfers" value={formatINR(s.transfersOut, { decimals: false })} hint="Not counted as spending" />
        <StatCard
          label="Card bills · Cash"
          value={`${formatINR(s.ccPayments, { decimals: false, compact: true })} · ${formatINR(s.cashWithdrawals, { decimals: false, compact: true })}`}
          hint={options.ccPaymentsAsExpense ? "Card bills counted as spending" : "Card bills excluded"}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Income vs expenses</CardTitle>
            <CardDescription>Monthly totals, excluding transfers and investments</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={trend.monthly} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where it went</CardTitle>
            <CardDescription>Spending by category · {label.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            {s.expensesByCategory.length ? (
              <RankedBars
                max={7}
                data={s.expensesByCategory.map((c) => ({
                  label: c.name,
                  amount: c.amountPaise,
                  pct: c.pct,
                  href: href("/transactions", { ...rq, category: c.categoryId ?? undefined }),
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No categorized spending in this period.</p>
            )}
            <Link href={href("/analysis", rq)} className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
              Full spending analysis →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>Balances and activity in this period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.map((a) => {
              const act = perAccount.get(a.id)!;
              return (
                <div key={a.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Wallet className="size-4 text-muted-foreground" />
                      {a.displayName}
                    </span>
                    {a.balance.amountPaise !== null ? <Money paise={a.balance.amountPaise} className="text-sm font-medium" /> : <span className="text-sm text-muted-foreground">Unknown</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {act.n} txns · in {formatINR(act.in, { decimals: false, compact: true })} · out {formatINR(act.out, { decimals: false, compact: true })}
                    </span>
                    <Badge variant={a.balance.status === "VERIFIED" ? "secondary" : "outline"} title={a.balance.note}>
                      {a.balance.status === "VERIFIED" ? "Verified" : a.balance.status === "UNKNOWN" ? "Unknown" : "Unverified"}
                      {a.balance.asOf && ` · ${formatDate(a.balance.asOf)}`}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Largest expenses</CardTitle>
            <CardDescription>{label}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {largest.map((t) => (
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
              {!largest.length && <li className="text-muted-foreground">No expenses in this period.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recurring payments</CardTitle>
            <CardDescription>Detected from at least 3 regular occurrences</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {recurring.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.frequency.toLowerCase()} · {r.occurrences}× {r.status === "CONFIRMED" ? "· confirmed" : "· suggested"}
                      {r.nextExpectedDate && ` · next ~${formatDate(r.nextExpectedDate.toISOString().slice(0, 10))}`}
                    </div>
                  </div>
                  <Money paise={Number(r.typicalAmountPaise)} />
                </li>
              ))}
              {!recurring.length && <li className="text-muted-foreground">Nothing recurring detected yet.</li>}
            </ul>
            <Link href="/recurring" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
              Review recurring →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.merchantOverride || t.merchant}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(t.txnDate.toISOString().slice(0, 10))} · {t.account.displayName} · {t.category?.name ?? "Unclassified"}
                    </div>
                  </div>
                  <Money paise={Number(t.amountPaise)} direction={t.direction} tone="direction" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Needs review</CardTitle>
            <CardDescription>Largest uncertain or uncategorized transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {uncategorized.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.merchantOverride || t.merchant}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(t.txnDate.toISOString().slice(0, 10))} · {t.account.displayName}
                    </div>
                  </div>
                  <Money paise={Number(t.amountPaise)} direction={t.direction} tone="direction" />
                </li>
              ))}
              {!uncategorized.length && <li className="text-muted-foreground">All caught up.</li>}
            </ul>
            <Link href="/transactions?review=1" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
              Review all →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Data quality</CardTitle>
            <CardDescription>What these numbers can and cannot tell you</CardDescription>
          </CardHeader>
          <CardContent>
            <DataWarnings warnings={warnings} limit={6} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
