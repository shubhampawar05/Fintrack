import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { dateToIso, formatDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import type { ColumnMapping } from "@/lib/parsing";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PreviewTable, type PreviewRow } from "./preview-table";
import { MappingEditor } from "./mapping-editor";
import { DeleteImportButton } from "../delete-import";

export default async function ImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const imp = await prisma.statementImport.findFirst({ where: { id, userId: user.id }, include: { account: true } });
  if (!imp) notFound();
  const rows = await prisma.importedTransaction.findMany({ where: { importId: id }, orderBy: { rowIndex: "asc" } });
  const meta = imp.meta as { bankName?: string; holderName?: string; accountLast4?: string };
  const warnings = imp.warnings as string[];
  const errors = imp.errors as string[];
  const editable = imp.status === "PREVIEW";
  const data: PreviewRow[] = rows.map((r) => ({
    id: r.id,
    rowIndex: r.rowIndex,
    page: r.page,
    txnDate: r.txnDate ? dateToIso(r.txnDate) : null,
    description: r.description,
    reference: r.reference,
    amountPaise: r.amountPaise === null ? null : toPaise(r.amountPaise),
    direction: r.direction,
    balancePaise: r.balancePaise === null ? null : toPaise(r.balancePaise),
    errors: r.errors,
    warnings: r.warnings,
    status: r.status,
    edited: r.edited,
  }));
  const valid = data.filter((r) => r.status === "PENDING");
  const debit = valid.filter((r) => r.direction === "DEBIT").reduce((s, r) => s + (r.amountPaise ?? 0), 0);
  const credit = valid.filter((r) => r.direction === "CREDIT").reduce((s, r) => s + (r.amountPaise ?? 0), 0);
  const table = imp.rawTable as { headers: string[]; rows: string[][] } | null;

  return (
    <>
      <PageHeader
        title={editable ? "Review import" : "Import details"}
        description={
          <>
            {imp.fileName} → <strong>{imp.account.displayName}</strong>
            {meta.bankName && ` · detected ${meta.bankName}`}
            {meta.accountLast4 && ` ••${meta.accountLast4}`} · parser {imp.parserId}@{imp.parserVersion}
          </>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/import">Back to imports</Link>
            </Button>
            <DeleteImportButton id={imp.id} fileName={imp.fileName} imported={imp.rowsImported} committed={imp.status === "COMMITTED"} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Period" value={<span className="text-base">{imp.periodStart && imp.periodEnd ? `${formatDate(dateToIso(imp.periodStart))} – ${formatDate(dateToIso(imp.periodEnd))}` : "Not stated"}</span>} />
        <StatCard label="Rows found" value={imp.rowsTotal} hint={`${imp.rowsRejected} with errors · ${imp.rowsDuplicate} already imported · ${imp.rowsExcluded} excluded`} />
        <StatCard label="To import" value={editable ? valid.length : imp.rowsImported} hint={editable ? `Debits ${formatINR(debit)} · Credits ${formatINR(credit)}` : "Committed"} />
        <StatCard
          label="Opening → closing"
          value={<span className="text-base">{imp.openingBalancePaise !== null ? formatINR(toPaise(imp.openingBalancePaise)) : "—"} → {imp.closingBalancePaise !== null ? formatINR(toPaise(imp.closingBalancePaise)) : "—"}</span>}
        />
        <StatCard
          label="Running-balance check"
          icon={imp.balanceCheck === "PASSED" ? <CheckCircle2 className="size-4 text-positive" /> : <CircleAlert className="size-4 text-warning" />}
          value={<span className="text-base">{imp.balanceCheck === "PASSED" ? "Every row reconciles" : imp.balanceCheck === "FAILED" ? "Mismatches found" : "Not available"}</span>}
          hint={imp.balanceCheck === "NOT_AVAILABLE" ? "Statement has no running balance column" : undefined}
        />
      </div>

      <div className="mt-4 space-y-3">
        {errors.map((e) => (
          <Alert key={e} variant="destructive">
            <CircleAlert />
            <AlertTitle>Cannot import</AlertTitle>
            <AlertDescription>{e}</AlertDescription>
          </Alert>
        ))}
        {warnings.map((w) => (
          <Alert key={w}>
            <Info />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}
      </div>

      {editable && table && (imp.fileType === "CSV" || imp.fileType === "XLSX") && (
        <MappingEditor importId={imp.id} headers={table.headers} sample={table.rows.slice(1, 6)} mapping={imp.columnMapping as unknown as ColumnMapping} />
      )}

      <div className="mt-6">
        <PreviewTable importId={imp.id} rows={data} editable={editable && errors.length === 0} />
      </div>
    </>
  );
}
