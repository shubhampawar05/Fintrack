import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/server/auth";
import { buildMonthlyReport } from "@/server/report";
import { formatDate, formatMonth, todayIso, addMonths } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { incomeCaptured } from "@/lib/finance/analytics";
import { monthFromParams, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "@/components/month-picker";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { RankedBars } from "@/components/charts";
import { DataWarnings } from "@/components/data-warnings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintButton } from "./print-button";
import { SetupEmptyState } from "@/components/onboarding/setup-empty-state";
import { getSetupPrerequisite } from "@/server/onboarding";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const prerequisite = await getSetupPrerequisite(user.id);
  if (prerequisite) {
    return (
      <>
        <PageHeader title="Monthly reports" description="A month-by-month summary you can export to CSV or PDF." />
        <SetupEmptyState prerequisite={prerequisite} what="Reports summarize your imported transactions month by month." />
      </>
    );
  }
  const month = monthFromParams(await searchParams, addMonths(todayIso(), -1).slice(0, 7));
  const r = await buildMonthlyReport(user.id, month);
  const c = r.current;
  const p = r.previous;
  const link = (q: Record<string, string>) => `/transactions?${new URLSearchParams({ range: "custom", from: r.range.from, to: r.range.to, ...q })}`;
  return (
    <>
      <PageHeader
        title={`Monthly report · ${formatMonth(month)}`}
        description={`${formatDate(r.range.from)} – ${formatDate(r.range.to)} · compared with ${formatMonth(r.previous.range.from.slice(0, 7))}`}
        actions={
          <>
            <MonthPicker month={month} />
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/${month}`}>
                <Download /> CSV
              </a>
            </Button>
            <PrintButton />
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total income" value={formatINR(c.income, { decimals: false })} hint={`Previous: ${formatINR(p.income, { decimals: false })}`} />
        <StatCard label="Total expenses" value={formatINR(c.expenses, { decimals: false })} hint={`Previous: ${formatINR(p.expenses, { decimals: false })}`} />
        <StatCard label="Net cash flow" value={<Money paise={c.netCashFlow} tone="signed" />} hint="All credits − all debits" />
        <StatCard label="Savings rate" value={incomeCaptured(c) ? `${c.savingsRate}%` : "—"} hint={incomeCaptured(c) ? `Saved ${formatINR(c.savings, { decimals: false })}` : "Not meaningful: most income isn't received in these accounts"} />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Observations</CardTitle>
          <CardDescription>Specific to this month’s transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {r.insights.length ? (
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {r.insights.map((i) => (
                <li key={i.title}>
                  <span className="font-medium">{i.title}.</span> <span className="text-muted-foreground">{i.detail}</span>{" "}
                  {i.href && (
                    <Link href={i.href} className="no-print font-medium underline-offset-4 hover:underline">
                      Transactions →
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Not enough data this month for observations.</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top spending categories</CardTitle>
          </CardHeader>
          <CardContent>
            <RankedBars max={8} data={c.expensesByCategory.map((x) => ({ label: x.name, amount: x.amountPaise, pct: x.pct, href: link({ category: x.categoryId ?? "" }) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Changes from previous month</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">This month</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.changes.slice(0, 8).map((x) => (
                  <TableRow key={x.name}>
                    <TableCell>{x.name}</TableCell>
                    <TableCell className="tabular text-right">{formatINR(x.current, { decimals: false })}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatINR(x.change, { decimals: false, sign: true })}
                      {x.changePct !== null && <span className="ml-1 text-xs text-muted-foreground">({x.changePct > 0 ? "+" : ""}{x.changePct}%)</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Largest transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {r.largest.map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {t.merchant} <span className="text-xs text-muted-foreground">· {formatDate(t.date)} · {t.categoryName}</span>
                  </span>
                  <Money paise={t.amountPaise} />
                </li>
              ))}
              {!r.largest.length && <li className="text-muted-foreground">No expenses this month.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recurring expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {r.recurring.map((x) => (
                <li key={x.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {x.label} <span className="text-xs text-muted-foreground">· {x.frequency.toLowerCase()} · {x.status === "CONFIRMED" ? "confirmed" : "suggested"}</span>
                  </span>
                  <Money paise={toPaise(x.typicalAmountPaise)} />
                </li>
              ))}
              {!r.recurring.length && <li className="text-muted-foreground">None detected.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Budget performance</CardTitle>
          </CardHeader>
          <CardContent>
            {r.budgets.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Budget</TableHead>
                    <TableHead className="text-right">Limit</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.budgets.map((b) => (
                    <TableRow key={b.name}>
                      <TableCell>{b.name}</TableCell>
                      <TableCell className="tabular text-right">{formatINR(b.budget, { decimals: false })}</TableCell>
                      <TableCell className="tabular text-right">{formatINR(b.actual, { decimals: false })}</TableCell>
                      <TableCell className={b.status === "over" ? "tabular text-right font-medium text-negative" : "tabular text-right"}>
                        {b.pctUsed}%{b.status === "over" && " · over"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No budgets set.{" "}
                <Link href="/budgets" className="underline">
                  Set budgets
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Data quality</CardTitle>
            <CardDescription>
              {r.uncategorized} uncategorized transaction(s) this month ·{" "}
              <Link href={link({ review: "1" })} className="no-print underline">
                review
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataWarnings warnings={r.warnings} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
