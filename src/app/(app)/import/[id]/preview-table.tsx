"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Pencil, TriangleAlert } from "lucide-react";
import { commitImportAction, discardImportAction, editImportRow, excludeImportRows } from "@/server/actions/imports";
import { formatDate } from "@/lib/dates";
import { formatINR, paiseToRupeeInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface PreviewRow {
  id: string;
  rowIndex: number;
  page: number | null;
  txnDate: string | null;
  description: string;
  reference: string | null;
  amountPaise: number | null;
  direction: "DEBIT" | "CREDIT" | null;
  balancePaise: number | null;
  errors: string[];
  warnings: string[];
  status: string;
  edited: boolean;
}

const PAGE = 100;
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Will import",
  DUPLICATE: "Already imported",
  REJECTED: "Error",
  EXCLUDED: "Excluded",
  IMPORTED: "Imported",
};

export function PreviewTable({ importId, rows, editable }: { importId: string; rows: PreviewRow[]; editable: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PreviewRow | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    if (tab === "issues") return rows.filter((r) => r.errors.length || r.warnings.length);
    if (tab === "duplicates") return rows.filter((r) => r.status === "DUPLICATE");
    if (tab === "excluded") return rows.filter((r) => r.status === "EXCLUDED");
    return rows;
  }, [rows, tab]);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const count = (f: (r: PreviewRow) => boolean) => rows.filter(f).length;
  const toImport = count((r) => r.status === "PENDING");

  function exclude(excluded: boolean) {
    start(async () => {
      const r = await excludeImportRows(importId, [...selected], excluded);
      if (r.ok) {
        setSelected(new Set());
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setPage(0);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
            <TabsTrigger value="issues">Issues ({count((r) => r.errors.length > 0 || r.warnings.length > 0)})</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicates ({count((r) => r.status === "DUPLICATE")})</TabsTrigger>
            <TabsTrigger value="excluded">Excluded ({count((r) => r.status === "EXCLUDED")})</TabsTrigger>
          </TabsList>
        </Tabs>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 && (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => exclude(true)}>
                  Exclude {selected.size}
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => exclude(false)}>
                  Include {selected.size}
                </Button>
              </>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={pending}>
                  Discard preview
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard this preview?</AlertDialogTitle>
                  <AlertDialogDescription>The extracted rows are deleted and nothing is imported. The history entry remains.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      start(async () => {
                        const r = await discardImportAction(importId);
                        if (r.ok) router.push("/import");
                        else toast.error(r.error);
                      })
                    }
                  >
                    Discard
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              size="sm"
              disabled={pending || toImport === 0}
              onClick={() =>
                start(async () => {
                  const r = await commitImportAction(importId);
                  if (r.ok && r.data) {
                    toast.success(`Imported ${r.data.imported} transaction(s)${r.data.duplicates ? `, skipped ${r.data.duplicates} duplicate(s)` : ""}`);
                    router.push("/transactions?range=all");
                  } else if (!r.ok) toast.error(r.error);
                })
              }
            >
              {pending ? "Working…" : `Import ${toImport} transaction(s)`}
            </Button>
          </div>
        )}
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {editable && (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={shown.length > 0 && shown.every((r) => selected.has(r.id))}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      shown.forEach((r) => (v ? next.add(r.id) : next.delete(r.id)));
                      setSelected(next);
                    }}
                  />
                </TableHead>
              )}
              <TableHead className="w-10">#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              {editable && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id} className={cn(r.status === "EXCLUDED" || r.status === "DUPLICATE" ? "opacity-60" : undefined)}>
                {editable && (
                  <TableCell>
                    <Checkbox
                      aria-label={`Select row ${r.rowIndex + 1}`}
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(r.id);
                        else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                  </TableCell>
                )}
                <TableCell className="tabular text-xs text-muted-foreground">{r.rowIndex + 1}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{r.txnDate ? formatDate(r.txnDate) : <span className="text-destructive">Invalid</span>}</TableCell>
                <TableCell className="max-w-[28rem]">
                  <div className="truncate text-sm" title={r.description}>
                    {r.description || <span className="text-destructive">Missing</span>}
                  </div>
                  {r.reference && <div className="truncate text-xs text-muted-foreground">Ref {r.reference}</div>}
                  {[...r.errors, ...r.warnings].map((m) => (
                    <div key={m} className={cn("flex items-center gap-1 text-xs", r.errors.includes(m) ? "text-destructive" : "text-warning")}>
                      {r.errors.includes(m) ? <CircleAlert className="size-3" /> : <TriangleAlert className="size-3" />} {m}
                    </div>
                  ))}
                </TableCell>
                <TableCell className="tabular text-right text-sm">{r.direction === "DEBIT" && r.amountPaise !== null ? formatINR(r.amountPaise) : ""}</TableCell>
                <TableCell className="tabular text-right text-sm text-positive">{r.direction === "CREDIT" && r.amountPaise !== null ? formatINR(r.amountPaise) : ""}</TableCell>
                <TableCell className="tabular text-right text-sm text-muted-foreground">{r.balancePaise !== null ? formatINR(r.balancePaise) : ""}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "REJECTED" ? "destructive" : r.status === "PENDING" || r.status === "IMPORTED" ? "secondary" : "outline"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                    {r.edited && " · edited"}
                  </Badge>
                </TableCell>
                {editable && (
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit row ${r.rowIndex + 1}`} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!shown.length && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Nothing here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {filtered.length > PAGE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            {page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} of {filtered.length}
          </span>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
      {editing && <EditRowDialog importId={importId} row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditRowDialog({ importId, row, onClose }: { importId: string; row: PreviewRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    txnDate: row.txnDate ?? "",
    description: row.description,
    amount: row.amountPaise !== null ? paiseToRupeeInput(row.amountPaise) : "",
    direction: (row.direction ?? "DEBIT") as "DEBIT" | "CREDIT",
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct row {row.rowIndex + 1}</DialogTitle>
          <DialogDescription>The original extracted text is kept for audit; your corrections are imported.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await editImportRow(importId, row.id, v);
              if (r.ok) {
                toast.success("Row updated");
                onClose();
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d">Date</Label>
              <Input id="d" type="date" value={v.txnDate} onChange={(e) => setV({ ...v, txnDate: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={v.direction} onValueChange={(d) => setV({ ...v, direction: d as "DEBIT" | "CREDIT" })}>
                <SelectTrigger className="w-full" aria-label="Debit or credit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT">Debit (money out)</SelectItem>
                  <SelectItem value="CREDIT">Credit (money in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a">Amount (₹)</Label>
            <Input id="a" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input id="desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save correction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
