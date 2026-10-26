import Link from "next/link";
import { Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listPeople, topUntaggedPeople } from "@/server/people";
import { getSetupPrerequisite } from "@/server/onboarding";
import { balanceWording } from "@/lib/finance/people";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { SetupEmptyState } from "@/components/onboarding/setup-empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MakePersonButton } from "./make-person";

const TITLE = "People";
const DESCRIPTION = "Friends and family you exchange money with — who owes whom, and what each payment was.";

function Suggestions({ items }: { items: Awaited<ReturnType<typeof topUntaggedPeople>> }) {
  return (
    <ul className="divide-y">
      {items.map((g) => (
        <li key={g.merchantKey} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{g.label}</div>
            <div className="text-xs text-muted-foreground">
              {g.count} transaction(s)
              {g.outPaise > 0 && ` · paid ${formatINR(g.outPaise, { decimals: false })}`}
              {g.inPaise > 0 && ` · received ${formatINR(g.inPaise, { decimals: false })}`}
            </div>
          </div>
          <MakePersonButton merchantKey={g.merchantKey} suggestedName={g.label} />
        </li>
      ))}
    </ul>
  );
}

export default async function PeoplePage() {
  const user = await requireUser();
  const prerequisite = await getSetupPrerequisite(user.id);
  if (prerequisite) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <SetupEmptyState prerequisite={prerequisite} what="People are created from the person-to-person payments in your statements." />
      </>
    );
  }

  const [{ people, owedToMe, iOwe, firstDate }, suggestions] = await Promise.all([listPeople(user.id), topUntaggedPeople(user.id, 15)]);

  if (!people.length) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <EmptyState
          icon={<Users />}
          title="No people yet"
          description="People are created from person-to-person payments. Pick someone below — their payments are then grouped together and you can tag each one as a loan, card money or a shared expense."
        />
        {suggestions.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Payments with people, not yet tagged</CardTitle>
              <CardDescription>Largest first</CardDescription>
            </CardHeader>
            <CardContent>
              <Suggestions items={suggestions} />
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  const untagged = people.reduce((t, p) => t + p.untaggedPaise, 0);
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Totals">
        <StatCard label="Owed to you" value={<span className="text-positive">{formatINR(owedToMe, { decimals: false })}</span>} hint="Money you lent that hasn't come back" />
        <StatCard label="You owe" value={<span className={iOwe ? "text-negative" : undefined}>{formatINR(iOwe, { decimals: false })}</span>} hint="Money you borrowed and haven't returned" />
        <StatCard
          className="col-span-2 lg:col-span-1"
          label="Not yet tagged"
          value={formatINR(untagged, { decimals: false })}
          hint={firstDate ? `Balances count from ${formatDate(firstDate)}, your earliest statement — set an opening balance for older debts` : undefined}
        />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Everyone</CardTitle>
          <CardDescription>People with untagged payments first</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {people.map((p) => {
              const w = balanceWording(p.balance);
              return (
                <li key={p.id}>
                  <Link href={`/people/${p.id}`} className="flex items-center justify-between gap-3 rounded-md py-3 outline-offset-2 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.txnCount} transaction(s)
                        {p.untaggedCount > 0 && ` · ${p.untaggedCount} not tagged (${formatINR(p.untaggedPaise, { decimals: false })})`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      {w === "settled" ? (
                        <Badge variant="secondary">Settled</Badge>
                      ) : (
                        <>
                          <div className={w === "owes-you" ? "font-medium text-positive" : "font-medium text-negative"}>{formatINR(Math.abs(p.balance), { decimals: false })}</div>
                          <div className="text-xs text-muted-foreground">{w === "owes-you" ? "owes you" : "you owe"}</div>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>More people to add</CardTitle>
            <CardDescription>Payments with people that aren&apos;t grouped under anyone yet</CardDescription>
          </CardHeader>
          <CardContent>
            <Suggestions items={suggestions} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
