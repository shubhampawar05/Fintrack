import Link from "next/link";
import { Download, ListFilter } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildTransactionFilter } from "@/server/transactions-query";
import { dateToIso } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { readParam, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { RangeFilter } from "@/components/range-filter";
import { EmptyState } from "@/components/empty-state";
import { SetupEmptyState } from "@/components/onboarding/setup-empty-state";
import { getSetupPrerequisite } from "@/server/onboarding";
import { Button } from "@/components/ui/button";
import { TransactionFilters } from "./filters";
import { TransactionsTable, type TxnRow } from "./transactions-table";
import { TransferSuggestions } from "./transfer-suggestions";
import { ManualTransactionDialog } from "./manual-dialog";
import { RerunRulesButton } from "./rerun-rules";
import { CounterpartyReview, type CounterpartyGroup } from "./counterparty-review";
import { personByKey } from "@/server/people";
import { extractCounterparty } from "@/lib/categorize/counterparty";

const PAGE_SIZE = 50;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { where, orderBy, preset, range, label, sortKey } = buildTransactionFilter(user.id, sp);
  const page = Math.max(1, Number(readParam(sp, "page") ?? 1) || 1);
  const [rows, total, sums, accounts, categories, suggestions] = await Promise.all([
    prisma.transaction.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: {
        account: true, category: true, transferOut: true, transferIn: true, refundOf: { select: { id: true, txnDate: true, merchant: true } },
        paymentAppEntry: { select: { payee: true, note: true, tags: true } },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["direction"], where, _sum: { amountPaise: true } }),
    prisma.bankAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.internalTransfer.findMany({
      where: { userId: user.id, status: "SUGGESTED" },
      include: { debitTxn: { include: { account: true } }, creditTxn: { include: { account: true } } },
      orderBy: { confidence: "desc" },
      take: 50,
    }),
  ]);
  const reviewMode = readParam(sp, "review") === "1";
  let groups: CounterpartyGroup[] = [];
  if (reviewMode) {
    const g = await prisma.transaction.groupBy({
      by: ["merchantKey", "direction"],
      where: { userId: user.id, needsReview: true, categorizationMethod: { not: "USER" }, merchantKey: { not: null } },
      _count: true,
      _sum: { amountPaise: true },
    });
    const byKey = new Map<string, CounterpartyGroup>();
    for (const row of g) {
      const cur = byKey.get(row.merchantKey!) ?? { merchantKey: row.merchantKey!, label: row.merchantKey!, count: 0, outPaise: 0, inPaise: 0, personId: null, isPerson: false };
      cur.count += row._count;
      if (row.direction === "DEBIT") cur.outPaise += toPaise(row._sum.amountPaise);
      else cur.inPaise += toPaise(row._sum.amountPaise);
      byKey.set(row.merchantKey!, cur);
    }
    groups = [...byKey.values()].filter((x) => x.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);
    const labels = await prisma.transaction.findMany({
      where: { userId: user.id, merchantKey: { in: groups.map((x) => x.merchantKey) } },
      distinct: ["merchantKey"],
      select: { merchantKey: true, merchant: true, merchantOverride: true, description: true, paymentAppEntry: { select: { kind: true } } },
    });
    const people = await personByKey(user.id, groups.map((x) => x.merchantKey));
    for (const x of groups) {
      const l = labels.find((y) => y.merchantKey === x.merchantKey);
      x.label = l?.merchantOverride || l?.merchant || x.merchantKey;
      x.personId = people.get(x.merchantKey) ?? null;
      x.isPerson = !!l && (extractCounterparty(l.description).isPerson || (l.paymentAppEntry !== null && l.paymentAppEntry.kind !== "SELF"));
    }
  }
  const sum = (d: "DEBIT" | "CREDIT") => toPaise(sums.find((s) => s.direction === d)?._sum.amountPaise ?? 0n);
  const data: TxnRow[] = rows.map((t) => ({
    id: t.id,
    date: dateToIso(t.txnDate),
    valueDate: t.valueDate ? dateToIso(t.valueDate) : null,
    description: t.description,
    merchant: t.merchantOverride || t.merchant || "",
    merchantOverride: t.merchantOverride,
    merchantKey: t.merchantKey,
    account: t.account.displayName,
    amountPaise: toPaise(t.amountPaise),
    direction: t.direction,
    categoryId: t.categoryId,
    kind: t.category?.kind ?? "UNCLASSIFIED",
    method: t.categorizationMethod,
    confidence: t.confidence,
    needsReview: t.needsReview,
    notes: t.notes,
    reference: t.reference,
    isManual: t.isManual,
    transfer: t.transferOut ?? t.transferIn ? { status: (t.transferOut ?? t.transferIn)!.status } : null,
    refundOf: t.refundOf ? { date: dateToIso(t.refundOf.txnDate), merchant: t.refundOf.merchant ?? "" } : null,
    app: t.paymentAppEntry,
  }));
  const exportQuery = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  exportQuery.delete("page");

  // Distinguish "nothing imported yet" from "filters match nothing".
  const prerequisite = total === 0 ? await getSetupPrerequisite(user.id) : null;
  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${label} · ${total} transaction(s) · out ${formatINR(sum("DEBIT"), { decimals: false })} · in ${formatINR(sum("CREDIT"), { decimals: false })}`}
        actions={
          <>
            <RangeFilter preset={preset} from={range.from} to={range.to} />
            <RerunRulesButton />
            <ManualTransactionDialog accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
            <Button asChild variant="outline" size="sm">
              <a href={`/api/transactions/export?${exportQuery.toString()}`}>
                <Download /> Export CSV
              </a>
            </Button>
          </>
        }
      />
      {suggestions.length > 0 && (
        <TransferSuggestions
          items={suggestions.map((s) => ({
            id: s.id,
            confidence: s.confidence,
            reason: s.reason,
            debit: { date: dateToIso(s.debitTxn.txnDate), account: s.debitTxn.account.displayName, description: s.debitTxn.description, amountPaise: toPaise(s.debitTxn.amountPaise) },
            credit: { date: dateToIso(s.creditTxn.txnDate), account: s.creditTxn.account.displayName, description: s.creditTxn.description },
          }))}
        />
      )}
      {reviewMode && <CounterpartyReview groups={groups} categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} />}
      <TransactionFilters
        accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        sort={sortKey}
      />
      {total === 0 ? (
        prerequisite ? (
          <SetupEmptyState prerequisite={prerequisite} what="Your transactions appear here once a statement is imported." />
        ) : (
          <EmptyState icon={<ListFilter />} title="No transactions match these filters" description="Try widening the date range or clearing filters." />
        )
      ) : (
        <>
          <TransactionsTable rows={data} categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} />
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} of {total}
            </span>
            <PageLink sp={sp} page={page - 1} disabled={page <= 1} label="Previous" />
            <PageLink sp={sp} page={page + 1} disabled={page * PAGE_SIZE >= total} label="Next" />
          </div>
        </>
      )}
    </>
  );
}

function PageLink({ sp, page, disabled, label }: { sp: SearchParams; page: number; disabled: boolean; label: string }) {
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  q.set("page", String(page));
  return disabled ? (
    <Button variant="outline" size="sm" disabled>
      {label}
    </Button>
  ) : (
    <Button asChild variant="outline" size="sm">
      <Link href={`/transactions?${q.toString()}`}>{label}</Link>
    </Button>
  );
}
