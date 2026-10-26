import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getPerson, listPeopleOptions, topUntaggedPeople } from "@/server/people";
import { balanceWording } from "@/lib/finance/people";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonTxnTable, type PersonTxnRow } from "./person-txn-table";
import { DeletePerson, LinkedKeys, MergePerson, OpeningBalanceDialog, RenamePerson } from "./person-actions";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getPerson(user.id, id).catch(() => null);
  if (!data) notFound();
  const { person, keys, history, balance, untaggedCount, untaggedPaise, cardsImported } = data;

  const [categories, people, suggestions, otherKeys] = await Promise.all([
    prisma.category.findMany({ where: { userId: user.id, kind: "EXPENSE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    listPeopleOptions(user.id),
    topUntaggedPeople(user.id, 50),
    prisma.personKey.findMany({ where: { userId: user.id, personId: { not: id } }, include: { person: { select: { name: true } } } }),
  ]);
  const others = people.filter((p) => p.id !== id);

  // Running balance after each loan/repayment, starting from the opening balance.
  let running = person.openingBalancePaise;
  const rows: PersonTxnRow[] = history.map((t) => {
    if (t.categoryKind === "SETTLEMENT") running += t.direction === "DEBIT" ? t.amountPaise : -t.amountPaise;
    return { ...t, balanceAfter: t.categoryKind === "SETTLEMENT" ? running : null };
  });
  const toTag = rows.filter((r) => r.categoryKind === "UNCLASSIFIED" || r.needsReview);
  const w = balanceWording(balance);

  return (
    <>
      <Link href="/people" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> People
      </Link>
      <PageHeader
        title={person.name}
        description={`${history.length} transaction(s) across your accounts`}
        actions={
          <>
            <RenamePerson personId={person.id} name={person.name} />
            <OpeningBalanceDialog personId={person.id} name={person.name} openingPaise={person.openingBalancePaise} asOf={person.openingAsOf} />
            {others.length > 0 && <MergePerson personId={person.id} name={person.name} people={others} />}
            <DeletePerson personId={person.id} name={person.name} />
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Balance">
        <StatCard
          label="Balance"
          value={
            w === "settled" ? "Settled" : <span className={w === "owes-you" ? "text-positive" : "text-negative"}>{formatINR(Math.abs(balance), { decimals: false })}</span>
          }
          hint={w === "owes-you" ? `${person.name} owes you` : w === "you-owe" ? `You owe ${person.name}` : "Nobody owes anything"}
        />
        <StatCard
          label="Opening balance"
          value={formatINR(Math.abs(person.openingBalancePaise), { decimals: false })}
          hint={
            person.openingBalancePaise === 0
              ? "None — set one for debts older than your statements"
              : `${person.openingBalancePaise > 0 ? `${person.name} owed you` : `You owed ${person.name}`}${person.openingAsOf ? ` on ${formatDate(person.openingAsOf)}` : ""}`
          }
        />
        <StatCard className="col-span-2 lg:col-span-1" label="Not yet tagged" value={formatINR(untaggedPaise, { decimals: false })} hint={`${untaggedCount} transaction(s) — not counted in the balance`} />
      </section>

      {cardsImported && (
        <Alert className="mt-4">
          <Info />
          <AlertDescription>
            Card statements are imported, so card bills already aren&apos;t counted as spending. &quot;Paid me back for my card&quot; then has no effect on your totals — tag such payments as a shared expense instead.
          </AlertDescription>
        </Alert>
      )}

      {toTag.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>To tag</CardTitle>
            <CardDescription>Unclassified payments and guesses flagged for review. Select one or many, then say what they were.</CardDescription>
          </CardHeader>
          <CardContent>
            <PersonTxnTable rows={toTag} categories={categories} people={others} />
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Every payment with {person.name}, oldest first. Only loans and repayments move the balance.
            {person.openingBalancePaise !== 0 && ` Starts from an opening balance of ${formatINR(person.openingBalancePaise, { decimals: false, sign: true })}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PersonTxnTable rows={rows} categories={categories} people={others} showBalance />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Linked UPI IDs and names</CardTitle>
          <CardDescription>Payments from any of these are attributed to {person.name} automatically, including future imports.</CardDescription>
        </CardHeader>
        <CardContent>
          <LinkedKeys
            personId={person.id}
            keys={keys}
            candidates={[
              ...suggestions.map((s) => ({ merchantKey: s.merchantKey, label: `${s.label} · ${s.count} txn(s)`, owner: null })),
              ...otherKeys.map((k) => ({ merchantKey: k.merchantKey, label: k.merchantKey, owner: k.person.name })),
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}
