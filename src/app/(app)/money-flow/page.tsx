import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { getSetupPrerequisite } from "@/server/onboarding";
import { computeMoneyFlow, IN_BUCKETS, OUT_BUCKETS, type OutBucket } from "@/lib/finance/money-flow";
import { formatDate, todayIso } from "@/lib/dates";
import { formatINR, percent } from "@/lib/money";
import { href, rangeFromParams, rangeQuery, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { RangeFilter } from "@/components/range-filter";
import { StatCard } from "@/components/stat-card";
import { RankedBars } from "@/components/charts";
import { SetupEmptyState } from "@/components/onboarding/setup-empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TITLE = "Money flow";

const OUT_HINT: Partial<Record<OutBucket, string>> = {
  card: "Card bills paid from your bank accounts",
  own: "Still your money — moved to another of your accounts",
  people: "Loans and repayments; see People for who owes whom",
  other: "Reversed refunds and debits in income categories",
};

export default async function MoneyFlowPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { preset, range, label } = rangeFromParams(sp, "last-3-months");
  const rq = rangeQuery(preset, range);

  const prerequisite = await getSetupPrerequisite(user.id);
  if (prerequisite) {
    return (
      <>
        <PageHeader title={TITLE} />
        <SetupEmptyState prerequisite={prerequisite} what="Money flow splits all money in and out of your accounts." />
      </>
    );
  }

  const [txns, options, unmatched] = await Promise.all([
    getAnalyticsTxns(user.id),
    getAnalyticsOptions(user.id),
    // Own-account transfers out with no matched credit in an imported account.
    prisma.transaction.findMany({
      where: { userId: user.id, direction: "DEBIT", category: { kind: "TRANSFER" }, OR: [{ transferOut: { is: null } }, { transferOut: { status: "REJECTED" } }] },
      select: { id: true },
    }),
  ]);
  const f = computeMoneyFlow(txns, range, options, new Set(unmatched.map((t) => t.id)));
  const tx = (q: Record<string, string | undefined>) => href("/transactions", { ...rq, ...q });
  const outLink = (b: OutBucket, kinds: string[]) =>
    tx({ direction: "DEBIT", kind: kinds.join(","), group: b === "myself" ? "PERSONAL" : b === "family" ? "FAMILY" : undefined });

  const outData = OUT_BUCKETS.filter((b) => b.key !== "unclassified" && f.out[b.key] > 0).map((b) => ({
    id: b.key,
    label: b.label,
    amount: f.out[b.key],
    pct: percent(f.out[b.key], f.totalOut),
    href: outLink(b.key, b.kinds),
    sub: OUT_HINT[b.key],
  }));
  const inData = IN_BUCKETS.filter((b) => b.key !== "unclassified" && f.in[b.key] > 0).map((b) => ({
    id: b.key,
    label: b.label,
    amount: f.in[b.key],
    pct: percent(f.in[b.key], f.totalIn),
    href: tx({ direction: "CREDIT", kind: b.kinds.join(",") }),
  }));
  const cardRepaid = f.out.card - f.cardNet;

  return (
    <>
      <PageHeader
        title={TITLE}
        description={`${label} · ${formatDate(range.from === "1900-01-01" ? (txns[0]?.date ?? range.from) : range.from)} – ${formatDate(range.to < todayIso() ? range.to : todayIso())} · every rupee in and out of your imported accounts`}
        actions={<RangeFilter preset={preset} from={range.from} to={range.to} />}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
        <StatCard label="Money out" value={formatINR(f.totalOut, { decimals: false })} hint="All debits, every account" />
        <StatCard label="Money in" value={formatINR(f.totalIn, { decimals: false })} hint="All credits, every account" />
        <StatCard label="Spent on myself (net)" value={formatINR(f.myselfNet, { decimals: false })} hint="Spending outside family support, after friends paid back their share" />
        <StatCard
          label="Card bills, net of friends' repayments"
          value={formatINR(f.cardNet, { decimals: false })}
          hint={cardRepaid > 0 ? `${formatINR(f.out.card, { decimals: false })} paid − ${formatINR(cardRepaid, { decimals: false })} repaid by friends` : `${formatINR(f.out.card, { decimals: false })} paid · no repayments tagged`}
        />
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Family support (net) {formatINR(f.familyNet, { decimals: false })}. {options.reason}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleHelp className="size-4" /> Not yet classified
          </CardTitle>
          <CardDescription>Money out that isn&apos;t counted anywhere yet — not as spending, not as a loan.</CardDescription>
        </CardHeader>
        <CardContent>
          {f.out.unclassified === 0 ? (
            <p className="text-sm">₹0 — every payment out in this period is classified.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="text-lg font-semibold tabular">{formatINR(f.out.unclassified, { decimals: false })}</span>{" "}
                <span className="text-muted-foreground">
                  · {f.unclassifiedOutShare}% of money out ·{" "}
                  <Link className="underline-offset-4 hover:underline" href={tx({ direction: "DEBIT", kind: "UNCLASSIFIED" })}>
                    see all
                  </Link>
                </span>
              </p>
              <ul className="divide-y text-sm">
                {f.topUnclassified.map((u) => (
                  <li key={u.key} className="flex items-center justify-between gap-3 py-2">
                    <Link className="min-w-0 truncate underline-offset-4 hover:underline" href={u.personId ? `/people/${u.personId}` : tx({ merchant: u.key, kind: "UNCLASSIFIED" })}>
                      {u.label}
                    </Link>
                    <span className="tabular shrink-0">
                      {formatINR(u.amountPaise, { decimals: false })} <span className="text-xs text-muted-foreground">· {u.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Payments to friends? Make them a person on <Link className="underline underline-offset-4" href="/people">People</Link> and tag each payment.
              </p>
            </div>
          )}
          {f.in.unclassified > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Also {formatINR(f.in.unclassified, { decimals: false })} of money in is not yet classified (
              <Link className="underline underline-offset-4" href={tx({ direction: "CREDIT", kind: "UNCLASSIFIED" })}>
                see
              </Link>
              ).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where money went</CardTitle>
            <CardDescription>
              {formatINR(f.totalOut, { decimals: false })} out, split by what it was. Together with not yet classified ({formatINR(f.out.unclassified, { decimals: false })}) these add up to the total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {outData.length ? <RankedBars data={outData} /> : <p className="text-sm text-muted-foreground">No money out in this period.</p>}
            {f.unmatchedTransfersOut > 0 && (
              <p className="rounded-lg border p-3 text-sm">
                {formatINR(f.unmatchedTransfersOut, { decimals: false })} went to accounts that aren&apos;t imported, so what happened to it next is unknown.{" "}
                <Link className="font-medium underline-offset-4 hover:underline" href="/import">
                  Import those statements →
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where money came from</CardTitle>
            <CardDescription>
              {formatINR(f.totalIn, { decimals: false })} in. Friends paying you back is not income.
            </CardDescription>
          </CardHeader>
          <CardContent>{inData.length ? <RankedBars data={inData} /> : <p className="text-sm text-muted-foreground">No money in this period.</p>}</CardContent>
        </Card>
      </div>
    </>
  );
}
