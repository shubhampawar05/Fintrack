import Link from "next/link";
import { Repeat } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { dateToIso, formatDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SetupEmptyState } from "@/components/onboarding/setup-empty-state";
import { getSetupPrerequisite } from "@/server/onboarding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecurringActions } from "./recurring-actions";

const PER_YEAR = { WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 } as const;

export default async function RecurringPage() {
  const user = await requireUser();
  const prerequisite = await getSetupPrerequisite(user.id);
  const items = await prisma.recurringTransaction.findMany({ where: { userId: user.id }, include: { category: true }, orderBy: [{ status: "asc" }, { typicalAmountPaise: "desc" }] });
  const active = items.filter((i) => i.status !== "REJECTED");
  const outflowYear = active.filter((i) => i.direction === "DEBIT").reduce((t, i) => t + toPaise(i.typicalAmountPaise) * PER_YEAR[i.frequency], 0);
  const groups: [string, typeof items][] = [
    ["Suggested — please review", items.filter((i) => i.status === "SUGGESTED")],
    ["Confirmed", items.filter((i) => i.status === "CONFIRMED")],
    ["Dismissed", items.filter((i) => i.status === "REJECTED")],
  ];
  return (
    <>
      <PageHeader
        title="Recurring payments"
        description={`Detected only after at least 3 occurrences at a regular interval and similar amount. Active recurring outflows ≈ ${formatINR(outflowYear, { decimals: false })} per year.`}
      />
      {prerequisite ? (
        <SetupEmptyState prerequisite={prerequisite} what="Recurring payments are detected from your imported transactions." />
      ) : !items.length ? (
        <EmptyState icon={<Repeat />} title="Nothing recurring detected yet" description="Import a few months of statements. Rent, salary, subscriptions, EMIs, insurance and regular family transfers appear here once they repeat." />
      ) : (
        <div className="space-y-6">
          {groups
            .filter(([, list]) => list.length)
            .map(([title, list]) => (
              <Card key={title} className="pb-0">
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                  {title.startsWith("Suggested") && <CardDescription>Confirm what is genuinely recurring, edit names/types, or dismiss false matches.</CardDescription>}
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Payee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead className="text-right">Typical amount</TableHead>
                        <TableHead>History</TableHead>
                        <TableHead>Next expected</TableHead>
                        <TableHead className="pr-6" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="pl-6">
                            <Link href={`/transactions?merchant=${encodeURIComponent(r.merchantKey)}&range=all`} className="font-medium underline-offset-4 hover:underline">
                              {r.label}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {r.direction === "CREDIT" ? "Money in" : "Money out"} · {r.category?.name ?? "Uncategorized"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{r.kind.toLowerCase()}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{r.frequency.toLowerCase()}</TableCell>
                          <TableCell className="tabular text-right text-sm">
                            {formatINR(toPaise(r.typicalAmountPaise))}
                            {r.maxAmountPaise !== r.minAmountPaise && (
                              <div className="text-xs text-muted-foreground">
                                {formatINR(toPaise(r.minAmountPaise), { decimals: false })}–{formatINR(toPaise(r.maxAmountPaise), { decimals: false })}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.occurrences}× · {formatDate(dateToIso(r.firstDate))} → {formatDate(dateToIso(r.lastDate))}
                            <div>{Math.round(r.confidence * 100)}% confidence</div>
                          </TableCell>
                          <TableCell className="text-sm">{r.nextExpectedDate ? formatDate(dateToIso(r.nextExpectedDate)) : <span className="text-xs text-muted-foreground">Not enough evidence</span>}</TableCell>
                          <TableCell className="pr-6">
                            <RecurringActions id={r.id} status={r.status} label={r.label} kind={r.kind} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
