import Link from "next/link";
import { AlertTriangle, CheckCircle2, PiggyBank } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { computeSummary } from "@/lib/finance/analytics";
import { budgetStatus } from "@/lib/finance/budgets";
import { endOfMonth, formatMonth, todayIso } from "@/lib/dates";
import { formatINR, paiseToRupeeInput, toPaise } from "@/lib/money";
import { monthFromParams, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MonthPicker } from "@/components/month-picker";
import { Money } from "@/components/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BudgetDialog, DeleteBudget } from "./budget-form";

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const month = monthFromParams(await searchParams, todayIso().slice(0, 7));
  const range = { from: `${month}-01`, to: endOfMonth(`${month}-01`) };
  const [budgets, categories, txns, options] = await Promise.all([
    prisma.budget.findMany({ where: { userId: user.id }, include: { category: true } }),
    prisma.category.findMany({ where: { userId: user.id, kind: { in: ["EXPENSE", "CREDIT_CARD_PAYMENT"] } }, orderBy: { sortOrder: "asc" } }),
    getAnalyticsTxns(user.id, range),
    getAnalyticsOptions(user.id),
  ]);
  const s = computeSummary(txns, range, options);
  const rows = budgets
    .map((b) => {
      const actual = s.expensesByCategory.find((c) => c.categoryId === b.categoryId)?.amountPaise ?? 0;
      return { b, ...budgetStatus(toPaise(b.amountPaise), actual) };
    })
    .sort((a, b) => (b.pctUsed ?? 0) - (a.pctUsed ?? 0));
  const totalBudget = rows.reduce((t, r) => t + r.budget, 0);
  const totalActual = rows.reduce((t, r) => t + r.actual, 0);
  const unbudgeted = s.expenses - totalActual;

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly limits per spending category, compared with actual spending (net of refunds)."
        actions={
          <>
            <MonthPicker month={month} />
            <BudgetDialog categories={categories.filter((c) => !budgets.some((b) => b.categoryId === c.id)).map((c) => ({ id: c.id, name: c.name }))} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!rows.length ? (
            <EmptyState
              icon={<PiggyBank />}
              title="No budgets yet"
              description="Set monthly budgets for categories like Rent, Groceries, Restaurants, Transport, Shopping, Family support, Travel and Entertainment. You can set them now — they're compared with your spending once statements are imported."
              action={<BudgetDialog categories={categories.map((c) => ({ id: c.id, name: c.name }))} />}
            />
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="w-40">Used</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ b, budget, actual, remaining, pctUsed, status }) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link href={`/transactions?category=${b.categoryId}&range=custom&from=${range.from}&to=${range.to}`} className="font-medium underline-offset-4 hover:underline">
                          {b.category.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-right">{formatINR(budget, { decimals: false })}</TableCell>
                      <TableCell className="tabular text-right">{formatINR(actual, { decimals: false })}</TableCell>
                      <TableCell className="text-right">
                        <Money paise={remaining} tone="signed" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(pctUsed ?? 0, 100)} aria-label={`${pctUsed}% used`} className={status === "over" ? "[&_[data-slot=progress-indicator]]:bg-negative" : status === "near" ? "[&_[data-slot=progress-indicator]]:bg-warning" : undefined} />
                          <span className="tabular w-12 text-right text-xs">{pctUsed}%</span>
                          {status === "over" ? <AlertTriangle className="size-4 text-negative" aria-label="Over budget" /> : status === "ok" ? <CheckCircle2 className="size-4 text-positive" aria-label="Within budget" /> : null}
                        </div>
                      </TableCell>
                      <TableCell className="flex justify-end">
                        <BudgetDialog categories={[{ id: b.categoryId, name: b.category.name }]} initial={{ categoryId: b.categoryId, amount: paiseToRupeeInput(budget) }} />
                        <DeleteBudget id={b.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium">
                    <TableCell>Total budgeted</TableCell>
                    <TableCell className="tabular text-right">{formatINR(totalBudget, { decimals: false })}</TableCell>
                    <TableCell className="tabular text-right">{formatINR(totalActual, { decimals: false })}</TableCell>
                    <TableCell className="text-right">
                      <Money paise={totalBudget - totalActual} tone="signed" />
                    </TableCell>
                    <TableCell colSpan={2} className="text-xs font-normal text-muted-foreground">
                      + {formatINR(unbudgeted, { decimals: false })} in categories without a budget
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{formatMonth(month)} summary</CardTitle>
            <CardDescription>Where the month’s money went, by type</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["Income", s.income],
                ["Essential expenses", s.expensesByGroup.ESSENTIAL],
                ["Discretionary expenses", s.expensesByGroup.DISCRETIONARY + s.expensesByGroup.UNGROUPED],
                ["Family support", s.expensesByGroup.FAMILY],
                ["Savings (income − expenses)", s.savings],
                ["Investments", s.investmentsIn],
                ["Internal transfers", s.transfersOut],
                ["Cash withdrawn", s.cashWithdrawals],
                ["Not yet categorized", s.unclassifiedOut],
              ].map(([label, v]) => (
                <div key={label as string} className="flex justify-between gap-2 border-b pb-2 last:border-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular font-medium">{formatINR(v as number, { decimals: false })}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Statements can’t see cash spending or accounts you haven’t imported — add manual entries on the Transactions page to fill gaps.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
