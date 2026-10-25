import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleHelp, Landmark, Upload } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAccountsOverview } from "@/server/queries";
import { formatDate, dateToIso } from "@/lib/dates";
import { paiseToRupeeInput, toPaise } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountFormDialog } from "./account-form";
import { DeleteAccountButton } from "./account-actions";

export default async function AccountsPage() {
  const user = await requireUser();
  const [overview, accounts] = await Promise.all([
    getAccountsOverview(user.id),
    prisma.bankAccount.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Bank accounts" description="Each account is imported separately. Balances are verified from statement closing balances." actions={<AccountFormDialog />} />
      {!overview.length ? (
        <EmptyState icon={<Landmark />} title="No accounts yet" description="Add one entry per bank account (e.g. Kotak, Federal Bank, Bank of Maharashtra), then import their statements." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.map((a) => {
            const acc = accounts.find((x) => x.id === a.id)!;
            const Icon = a.balance.status === "VERIFIED" ? CheckCircle2 : a.balance.status === "UNKNOWN" ? CircleHelp : CircleAlert;
            return (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle>{a.displayName}</CardTitle>
                  <CardDescription>
                    {a.bankName} · {a.accountType.replace("_", " ").toLowerCase()}
                    {a.accountLast4 && ` · ••${a.accountLast4}`}
                  </CardDescription>
                  <CardAction className="flex">
                    <AccountFormDialog
                      account={{
                        id: acc.id, displayName: acc.displayName, bankName: acc.bankName, accountType: acc.accountType, currency: acc.currency,
                        accountLast4: acc.accountLast4 ?? "",
                        openingBalance: acc.openingBalancePaise !== null ? paiseToRupeeInput(toPaise(acc.openingBalancePaise)) : "",
                        openingBalanceDate: acc.openingBalanceDate ? dateToIso(acc.openingBalanceDate) : "",
                      }}
                    />
                    <DeleteAccountButton id={a.id} name={a.displayName} count={a.transactionCount} />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className="flex items-center gap-2 text-2xl font-semibold">
                      {a.balance.amountPaise !== null ? <Money paise={a.balance.amountPaise} /> : "Unknown"}
                      <Icon className={a.balance.status === "VERIFIED" ? "size-5 text-positive" : "size-5 text-muted-foreground"} aria-label={a.balance.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.balance.asOf && `As of ${formatDate(a.balance.asOf)}. `}
                      {a.balance.note}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Transactions</div>
                      <div className="font-medium tabular">{a.transactionCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Statements</div>
                      <div className="font-medium tabular">{a.imports}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Statement coverage</div>
                    {a.coverage.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {a.coverage.map((c) => (
                          <Badge key={c.from} variant="secondary">
                            {formatDate(c.from)} – {formatDate(c.to)}
                          </Badge>
                        ))}
                        {a.gaps.map((g) => (
                          <Badge key={g.from} variant="outline" className="border-warning text-warning">
                            Gap {formatDate(g.from)} – {formatDate(g.to)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No statements imported.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/import?account=${a.id}`}>
                        <Upload /> Import statement
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/transactions?account=${a.id}&range=all`}>View transactions</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
