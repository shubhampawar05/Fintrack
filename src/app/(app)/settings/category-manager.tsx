"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCategory, saveCategory } from "@/server/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Cat = { id: string; name: string; kind: string; group: string | null; isSystem: boolean; parentId: string | null; count: number };
const KINDS = ["EXPENSE", "INCOME", "TRANSFER", "CREDIT_CARD_PAYMENT", "INVESTMENT", "CASH", "REFUND", "SETTLEMENT", "UNCLASSIFIED"];

function CategoryDialog({ cat, parents }: { cat?: Cat; parents: Cat[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: cat?.name ?? "", kind: cat?.kind ?? "EXPENSE", group: cat?.group ?? "NONE", parentId: cat?.parentId ?? "" });
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {cat ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${cat.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus /> Add category
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cat ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cn">Name</Label>
            <Input id="cn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Accounting type</Label>
              <Select value={v.kind} onValueChange={(kind) => setV({ ...v, kind })} disabled={cat?.isSystem}>
                <SelectTrigger className="w-full" aria-label="Accounting type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={v.group} onValueChange={(group) => setV({ ...v, group })} disabled={v.kind !== "EXPENSE"}>
                <SelectTrigger className="w-full" aria-label="Group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="ESSENTIAL">Essential</SelectItem>
                  <SelectItem value="DISCRETIONARY">Discretionary</SelectItem>
                  <SelectItem value="FAMILY">Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Parent (makes this a subcategory)</Label>
            <Select value={v.parentId || "none"} onValueChange={(p) => setV({ ...v, parentId: p === "none" ? "" : p })}>
              <SelectTrigger className="w-full" aria-label="Parent category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {parents
                  .filter((p) => p.id !== cat?.id && p.kind === v.kind)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !v.name}
            onClick={() =>
              start(async () => {
                const r = await saveCategory(cat?.id ?? null, { ...v, kind: v.kind as never, group: v.group as never });
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (
    <div className="space-y-3">
      <CategoryDialog parents={categories.filter((c) => !c.parentId)} />
      <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Txns</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.parentId && <span className="text-muted-foreground">{byId.get(c.parentId)?.name} › </span>}
                  {c.name} {!c.isSystem && <Badge variant="outline">custom</Badge>}
                </TableCell>
                <TableCell className="text-xs">{c.kind.replace(/_/g, " ").toLowerCase()}</TableCell>
                <TableCell className="text-xs">{c.group?.toLowerCase() ?? "—"}</TableCell>
                <TableCell className="tabular text-right text-xs">{c.count}</TableCell>
                <TableCell className="flex justify-end">
                  <CategoryDialog cat={c} parents={categories.filter((x) => !x.parentId)} />
                  {!c.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${c.name}`}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          if (!confirm(`Delete “${c.name}”? Its ${c.count} transaction(s) will be re-categorized.`)) return;
                          const r = await deleteCategory(c.id);
                          if (r.ok) router.refresh();
                          else toast.error(r.error);
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
