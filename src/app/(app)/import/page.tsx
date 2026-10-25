import Link from "next/link";
import { FileClock, Landmark } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { dateToIso, formatDate } from "@/lib/dates";
import { readParam, type SearchParams } from "@/lib/range-params";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadForm } from "./upload-form";
import { DeleteImportButton } from "./delete-import";
import { DeletePaymentAppImport, PaymentAppForm } from "./payment-app-form";

const STATUS: Record<string, "default" | "secondary" | "outline" | "destructive"> = { COMMITTED: "secondary", PREVIEW: "default", FAILED: "destructive", DISCARDED: "outline" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [accounts, imports, appImports] = await Promise.all([
    prisma.bankAccount.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" } }),
    prisma.statementImport.findMany({ where: { userId: user.id }, include: { account: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.paymentAppImport.findMany({
      where: { userId: user.id },
      include: { _count: { select: { entries: { where: { transactionId: { not: null } } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <>
      <PageHeader title="Import statements" description="Every statement is previewed and validated before anything is saved. Re-importing overlapping periods is safe." />
      {!accounts.length ? (
        <EmptyState icon={<Landmark />} title="Add an account first" description="Statements are imported into a specific bank account." action={{ href: "/accounts", label: "Add account" }} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upload a statement</CardTitle>
            <CardDescription>
              Supported: text-based PDF e-statements (Kotak, Federal Bank, Bank of Maharashtra and a generic fallback), CSV, XLS and XLSX exports. Scanned PDFs are detected and rejected — they need OCR.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadForm accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))} defaultAccount={readParam(sp, "account")} />
          </CardContent>
        </Card>
      )}

      {accounts.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Payment app history</CardTitle>
            <CardDescription>
              Pay mostly through Paytm? Its UPI statement has what bank narrations leave out — who you paid, your note and your tags. Each payment is matched to its bank
              transaction by UPI reference number; nothing is added to your totals, and your tags (#Food, #rapido, #Self Transfer…) are used to categorize.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PaymentAppForm />
            {appImports.length > 0 && (
              <ul className="divide-y rounded-lg border text-sm">
                {appImports.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.fileName}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.periodStart && a.periodEnd ? `${formatDate(dateToIso(a.periodStart))} – ${formatDate(dateToIso(a.periodEnd))} · ` : ""}
                        {a.entriesTotal} payments · {a._count.entries} matched to bank transactions
                      </div>
                    </div>
                    <DeletePaymentAppImport id={a.id} fileName={a.fileName} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight">Import history</h2>
      {!imports.length ? (
        <EmptyState icon={<FileClock />} title="No imports yet" />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Imported</TableHead>
                <TableHead className="text-right">Duplicates</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead>Balance check</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="max-w-56">
                    <Link href={`/import/${i.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
                      {i.fileName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(dateToIso(i.createdAt))} · {i.parserId}@{i.parserVersion}
                    </div>
                  </TableCell>
                  <TableCell>{i.account.displayName}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {i.periodStart && i.periodEnd ? `${formatDate(dateToIso(i.periodStart))} – ${formatDate(dateToIso(i.periodEnd))}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[i.status]}>{i.status === "PREVIEW" ? "Awaiting review" : i.status.toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">{i.rowsTotal}</TableCell>
                  <TableCell className="tabular text-right">{i.rowsImported}</TableCell>
                  <TableCell className="tabular text-right">{i.rowsDuplicate}</TableCell>
                  <TableCell className="tabular text-right">{i.rowsRejected}</TableCell>
                  <TableCell>
                    <Badge variant={i.balanceCheck === "PASSED" ? "secondary" : "outline"}>{i.balanceCheck.replace("_", " ").toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <DeleteImportButton id={i.id} fileName={i.fileName} imported={i.rowsImported} committed={i.status === "COMMITTED"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
