"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleHelp, Link2, StickyNote, Trash2 } from "lucide-react";
import type { CategoryKind } from "@prisma/client";
import { bulkCategorize, deleteManualTransaction, markReviewed, updateTransaction } from "@/server/actions/transactions";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export interface TxnRow {
  id: string;
  date: string;
  valueDate: string | null;
  description: string;
  merchant: string;
  merchantOverride: string | null;
  merchantKey: string | null;
  account: string;
  amountPaise: number;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  kind: CategoryKind;
  method: string;
  confidence: number;
  needsReview: boolean;
  notes: string | null;
  reference: string | null;
  isManual: boolean;
  transfer: { status: string } | null;
  refundOf: { date: string; merchant: string } | null;
  /** Payee, note and tags from the Paytm history, when matched. */
  app: { payee: string; note: string | null; tags: string[] } | null;
}

type Cat = { id: string; name: string; kind: CategoryKind };

export const KIND_LABEL: Record<CategoryKind, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Own transfer",
  CREDIT_CARD_PAYMENT: "Card bill",
  INVESTMENT: "Investment",
  CASH: "Cash",
  REFUND: "Refund",
  SETTLEMENT: "Lending",
  UNCLASSIFIED: "Unclassified",
};

const GROUPS: [string, CategoryKind[]][] = [
  ["Expenses", ["EXPENSE"]],
  ["Income", ["INCOME"]],
  ["Money movements", ["TRANSFER", "CREDIT_CARD_PAYMENT", "INVESTMENT", "CASH", "REFUND", "SETTLEMENT", "UNCLASSIFIED"]],
];

export function CategorySelect({ value, categories, onChange, className, label }: { value: string | null; categories: Cat[]; onChange: (id: string) => void; className?: string; label: string }) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 w-full text-xs", className)} aria-label={label}>
        <SelectValue placeholder="Choose category" />
      </SelectTrigger>
      <SelectContent>
        {GROUPS.map(([g, kinds]) => (
          <SelectGroup key={g}>
            <SelectLabel>{g}</SelectLabel>
            {categories
              .filter((c) => kinds.includes(c.kind))
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TransactionsTable({ rows, categories }: { rows: TxnRow[]; categories: Cat[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<string | null>(null);
  const [withRule, setWithRule] = useState(true);
  const [editing, setEditing] = useState<TxnRow | null>(null);
  const [pending, start] = useTransition();

  const setCategory = (row: TxnRow, categoryId: string) =>
    start(async () => {
      const r = await updateTransaction(row.id, { categoryId });
      if (r.ok) {
        toast.success("Category updated");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:top-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <CategorySelect value={bulkCat} categories={categories} onChange={setBulkCat} className="w-56" label="Category for selected" />
          <div className="flex items-center gap-2">
            <Checkbox id="withRule" checked={withRule} onCheckedChange={(v) => setWithRule(v === true)} />
            <Label htmlFor="withRule" className="text-sm font-normal">
              Create a rule for these merchants
            </Label>
          </div>
          <Button
            size="sm"
            disabled={!bulkCat || pending}
            onClick={() =>
              start(async () => {
                const r = await bulkCategorize([...selected], bulkCat!, withRule);
                if (r.ok) {
                  toast.success(`Categorized ${r.data?.updated} transaction(s)${r.data?.others ? `; rule also updated ${r.data.others} more` : ""}`);
                  setSelected(new Set());
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await markReviewed([...selected]);
                if (r.ok) {
                  setSelected(new Set());
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Mark reviewed
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Merchant / description</TableHead>
              <TableHead className="hidden md:table-cell">Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-56">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} data-state={selected.has(t.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${t.merchant}`}
                    checked={selected.has(t.id)}
                    onCheckedChange={(v) => {
                      const n = new Set(selected);
                      if (v) n.add(t.id);
                      else n.delete(t.id);
                      setSelected(n);
                    }}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{formatDate(t.date)}</TableCell>
                <TableCell className="max-w-[22rem]">
                  <button type="button" className="block w-full text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setEditing(t)}>
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {t.merchant}
                      {t.notes && <StickyNote className="size-3 shrink-0 text-muted-foreground" aria-label="Has notes" />}
                      {t.needsReview && <CircleHelp className="size-3.5 shrink-0 text-warning" aria-label="Needs review" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground" title={t.description}>
                      {t.description}
                    </div>
                    {t.app && (t.app.note || t.app.tags.length > 0) && (
                      <div className="truncate text-xs text-muted-foreground" title="From your Paytm history">
                        {[t.app.note, ...t.app.tags.map((x) => `#${x}`)].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">{t.account}</TableCell>
                <TableCell className="text-right text-sm">
                  <Money paise={t.amountPaise} direction={t.direction} tone="direction" />
                </TableCell>
                <TableCell>
                  <CategorySelect value={t.categoryId} categories={categories} onChange={(id) => setCategory(t, id)} label={`Category for ${t.merchant}`} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={t.kind === "UNCLASSIFIED" ? "outline" : "secondary"}>{KIND_LABEL[t.kind]}</Badge>
                    {t.transfer && (
                      <Badge variant="outline" title="Linked to the other side of a transfer">
                        <Link2 /> {t.transfer.status === "CONFIRMED" ? "matched" : t.transfer.status === "SUGGESTED" ? "suggested" : "rejected"}
                      </Badge>
                    )}
                    {t.refundOf && <Badge variant="outline">refund</Badge>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <EditSheet row={editing} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = {
  RULE: "Built-in rule",
  USER_RULE: "Your rule",
  MCC: "Merchant category code",
  OWN_ACCOUNT: "Your own account",
  TRANSFER_MATCH: "Matched transfer",
  REFUND_MATCH: "Matched refund",
  AI: "AI suggestion",
  USER: "You",
  DEFAULT: "Not categorized",
};

function EditSheet({ row, categories, onClose }: { row: TxnRow; categories: Cat[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [categoryId, setCategoryId] = useState(row.categoryId);
  const [merchant, setMerchant] = useState(row.merchantOverride ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.merchant}</SheetTitle>
          <SheetDescription>
            {formatDate(row.date, "long")} · {row.account}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4">
          <div className="text-3xl font-semibold">
            <Money paise={row.amountPaise} direction={row.direction} tone="direction" />
          </div>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Original text</dt>
            <dd className="break-all font-mono text-xs">{row.description}</dd>
            {row.app && (
              <>
                <dt className="text-muted-foreground">Paytm</dt>
                <dd>
                  {row.app.payee}
                  {row.app.note && <span className="text-muted-foreground"> · “{row.app.note}”</span>}
                  {row.app.tags.length > 0 && <span className="text-muted-foreground"> · {row.app.tags.map((x) => `#${x}`).join(" ")}</span>}
                </dd>
              </>
            )}
            {row.reference && (
              <>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="break-all">{row.reference}</dd>
              </>
            )}
            {row.valueDate && row.valueDate !== row.date && (
              <>
                <dt className="text-muted-foreground">Value date</dt>
                <dd>{formatDate(row.valueDate)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Categorized by</dt>
            <dd>
              {METHOD_LABEL[row.method] ?? row.method} · {Math.round(row.confidence * 100)}% confidence
            </dd>
            {row.refundOf && (
              <>
                <dt className="text-muted-foreground">Refund of</dt>
                <dd>
                  {row.refundOf.merchant} on {formatDate(row.refundOf.date)}
                </dd>
              </>
            )}
          </dl>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategorySelect value={categoryId} categories={categories} onChange={setCategoryId} label="Category" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant">Merchant name</Label>
            <Input id="merchant" placeholder={row.merchant} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            <p className="text-xs text-muted-foreground">Corrects the display name; the original bank text is never changed.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <SheetFooter className="flex-row justify-between">
          {row.isManual ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteManualTransaction(row.id);
                  if (r.ok) {
                    onClose();
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateTransaction(row.id, {
                  ...(categoryId && categoryId !== row.categoryId ? { categoryId } : {}),
                  merchantOverride: merchant,
                  notes,
                });
                if (r.ok) {
                  toast.success("Saved");
                  onClose();
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
