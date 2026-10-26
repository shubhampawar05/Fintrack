"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CategoryKind } from "@prisma/client";
import { assignPersonAction, tagPersonTransactionsAction } from "@/server/actions/people";
import { PERSON_TAGS, type PersonTag } from "@/lib/finance/people";
import { formatDate } from "@/lib/dates";
import { formatINR, type Paise } from "@/lib/money";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface PersonTxnRow {
  id: string;
  date: string;
  direction: "DEBIT" | "CREDIT";
  amountPaise: Paise;
  merchant: string;
  description: string;
  account: string;
  categoryName: string;
  categoryKind: CategoryKind;
  tag: PersonTag | null;
  needsReview: boolean;
  balanceAfter: Paise | null;
}

const TAG_LABEL = Object.fromEntries(PERSON_TAGS.map((t) => [t.tag, t.label])) as Record<PersonTag, string>;

export function PersonTxnTable({
  rows,
  categories,
  people,
  showBalance,
}: {
  rows: PersonTxnRow[];
  categories: { id: string; name: string }[];
  people: { id: string; name: string }[];
  showBalance?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState<PersonTag | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = [...selected];
  const chosen = rows.filter((r) => selected.has(r.id));
  const tagInvalid = tag === "card" && chosen.some((r) => r.direction === "DEBIT");
  const canApply = ids.length > 0 && tag !== null && (tag !== "shared" || category !== null) && !tagInvalid;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };
  const done = () => {
    setSelected(new Set());
    router.refresh();
  };

  if (!rows.length) return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  return (
    <div className="space-y-3">
      {ids.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:flex-wrap sm:items-center" role="region" aria-label="Tag selected">
          <span className="text-sm font-medium">{ids.length} selected</span>
          <Select value={tag ?? undefined} onValueChange={(v) => setTag(v as PersonTag)}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-56" aria-label="What were these?">
              <SelectValue placeholder="What were these?" />
            </SelectTrigger>
            <SelectContent>
              {PERSON_TAGS.map((t) => (
                <SelectItem key={t.tag} value={t.tag}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tag === "shared" && (
            <Select value={category ?? undefined} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-56" aria-label="Spending category">
                <SelectValue placeholder="Spending category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            disabled={!canApply || pending}
            onClick={() =>
              start(async () => {
                const r = await tagPersonTransactionsAction(ids, tag!, category ?? undefined);
                if (r.ok) {
                  toast.success(`Tagged ${r.data?.updated} transaction(s)`);
                  done();
                } else toast.error(r.error);
              })
            }
          >
            Apply
          </Button>
          {people.length > 0 && (
            <Select
              onValueChange={(target) =>
                start(async () => {
                  const r = await assignPersonAction(ids, target === "none" ? null : target);
                  if (r.ok) {
                    toast.success(`Moved ${r.data?.updated} transaction(s)`);
                    done();
                  } else toast.error(r.error);
                })
              }
            >
              <SelectTrigger className="h-8 w-full text-xs sm:ml-auto sm:w-48" aria-label="Not this person? Move to…">
                <SelectValue placeholder="Not this person? Move to…" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">Nobody</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tag && <p className="w-full text-xs text-muted-foreground">{tagInvalid ? "A card repayment must be money you received — unselect the payments you made." : PERSON_TAGS.find((t) => t.tag === tag)!.hint}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all"
                  checked={selected.size === rows.length ? true : selected.size ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>What it was</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {showBalance && <TableHead className="text-right">Balance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox aria-label={`Select ${r.merchant} on ${r.date}`} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{formatDate(r.date)}</TableCell>
                <TableCell className="max-w-36 sm:max-w-64">
                  <div className="truncate text-sm" title={r.description}>
                    {r.direction === "DEBIT" ? "You paid" : "You received"} · {r.account}
                  </div>
                  <div className="truncate text-xs text-muted-foreground" title={r.description}>
                    {r.description}
                  </div>
                </TableCell>
                <TableCell>
                  {r.categoryKind === "UNCLASSIFIED" ? (
                    <Badge variant="outline">Not tagged</Badge>
                  ) : (
                    <div className="text-sm">
                      {r.tag ? TAG_LABEL[r.tag] : r.categoryName}
                      {r.tag === "shared" && <span className="text-muted-foreground"> · {r.categoryName}</span>}
                      {r.needsReview && (
                        <Badge variant="outline" className="ml-1">
                          Guess
                        </Badge>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Money paise={r.amountPaise} direction={r.direction} tone="direction" />
                </TableCell>
                {showBalance && (
                  <TableCell className="tabular text-right text-sm text-muted-foreground">
                    {r.balanceAfter === null ? "" : formatINR(r.balanceAfter, { decimals: false, sign: true })}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
