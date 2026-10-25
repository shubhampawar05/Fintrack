import { Goal as GoalIcon } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { computeSummary } from "@/lib/finance/analytics";
import { requiredMonthly } from "@/lib/finance/budgets";
import { addMonths, dateToIso, endOfMonth, formatDate, monthsInRange, startOfMonth, todayIso } from "@/lib/dates";
import { formatINR, paiseToRupeeInput, percent, toPaise } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GoalDialog, DeleteGoal } from "./goal-form";

export default async function GoalsPage() {
  const user = await requireUser();
  const today = todayIso();
  const last3 = { from: addMonths(startOfMonth(today), -3), to: endOfMonth(addMonths(startOfMonth(today), -1)) };
  const [goals, txns, options] = await Promise.all([
    prisma.financialGoal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    getAnalyticsTxns(user.id, last3),
    getAnalyticsOptions(user.id),
  ]);
  const s = computeSummary(txns, last3, options);
  const avgSavings = Math.round(s.savings / 3);
  const avgInvest = Math.round(s.investmentsIn / 3);
  return (
    <>
      <PageHeader
        title="Financial goals"
        description={`Over the last 3 full months you kept about ${formatINR(avgSavings, { decimals: false })}/month after expenses and invested about ${formatINR(avgInvest, { decimals: false })}/month.`}
        actions={<GoalDialog />}
      />
      {!goals.length ? (
        <EmptyState icon={<GoalIcon />} title="No goals yet" description="Create goals like an emergency fund, a trip or a down payment and track progress toward them." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const target = toPaise(g.targetAmountPaise);
            const current = toPaise(g.currentAmountPaise);
            const pct = Math.min(percent(current, target) ?? 0, 100);
            const date = g.targetDate ? dateToIso(g.targetDate) : null;
            const monthsLeft = date ? Math.max(monthsInRange(today, date).length - 1, 0) : null;
            const need = requiredMonthly(target, current, monthsLeft);
            const feasible = need !== null && avgSavings > 0 ? need <= avgSavings : null;
            return (
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle>{g.name}</CardTitle>
                  <CardDescription>{date ? `By ${formatDate(date)} · ${monthsLeft} month(s) left` : "No target date"}</CardDescription>
                  <CardAction className="flex">
                    <GoalDialog
                      id={g.id}
                      initial={{ name: g.name, target: paiseToRupeeInput(target), current: paiseToRupeeInput(current), targetDate: date ?? "", notes: g.notes ?? "" }}
                    />
                    <DeleteGoal id={g.id} />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-semibold tabular">{formatINR(current, { decimals: false })}</span>
                    <span className="text-sm text-muted-foreground">of {formatINR(target, { decimals: false })}</span>
                  </div>
                  <Progress value={pct} aria-label={`${pct}% complete`} />
                  <p className="text-sm text-muted-foreground">
                    {current >= target
                      ? "Goal reached."
                      : need === null
                        ? `${formatINR(target - current, { decimals: false })} to go.`
                        : `Needs ${formatINR(need, { decimals: false })}/month${feasible === null ? "" : feasible ? " — within your recent monthly savings." : " — more than your recent average monthly savings."}`}
                  </p>
                  {g.notes && <p className="text-xs text-muted-foreground">{g.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
