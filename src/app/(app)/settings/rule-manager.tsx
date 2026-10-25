"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteRule, saveRule } from "@/server/actions/settings";
import { paiseToRupeeInput } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type RuleRow = {
  id: string;
  name: string;
  field: "DESCRIPTION" | "MERCHANT";
  matchType: "CONTAINS" | "STARTS_WITH" | "EQUALS" | "REGEX";
  pattern: string;
  direction: "DEBIT" | "CREDIT" | null;
  accountId: string | null;
  categoryId: string;
  categoryName: string;
  merchantName: string | null;
  minAmountPaise: number | null;
  maxAmountPaise: number | null;
  priority: number;
  enabled: boolean;
  isSystem: boolean;
};
type Opt = { id: string; name: string };

function RuleDialog({ rule, categories, accounts }: { rule?: RuleRow; categories: Opt[]; accounts: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    name: rule?.name ?? "",
    field: rule?.field ?? "DESCRIPTION",
    matchType: rule?.matchType ?? "CONTAINS",
    pattern: rule?.pattern ?? "",
    direction: (rule?.direction ?? "ANY") as "DEBIT" | "CREDIT" | "ANY",
    accountId: rule?.accountId ?? "",
    categoryId: rule?.categoryId ?? "",
    merchantName: rule?.merchantName ?? "",
    priority: rule?.priority ?? 10,
    enabled: rule?.enabled ?? true,
    min: rule?.minAmountPaise != null ? paiseToRupeeInput(rule.minAmountPaise) : "",
    max: rule?.maxAmountPaise != null ? paiseToRupeeInput(rule.maxAmountPaise) : "",
  });
  const select = (label: string, value: string, onChange: (v: string) => void, items: [string, string][]) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(([k, l]) => (
            <SelectItem key={k} value={k}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {rule ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit rule ${rule.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus /> Add rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? (rule.isSystem ? "Edit built-in rule" : "Edit rule") : "New categorization rule"}</DialogTitle>
          <DialogDescription>Your rules run before built-in rules. Saving re-applies rules to automatically categorized transactions; your manual choices are kept.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rn">Rule name</Label>
            <Input id="rn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          {select("Match on", v.field, (field) => setV({ ...v, field: field as typeof v.field }), [["DESCRIPTION", "Bank narration"], ["MERCHANT", "Merchant"]])}
          {select("How", v.matchType, (m) => setV({ ...v, matchType: m as typeof v.matchType }), [["CONTAINS", "Contains"], ["STARTS_WITH", "Starts with"], ["EQUALS", "Equals"], ["REGEX", "Regular expression"]])}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rp">Text to match</Label>
            <Input id="rp" value={v.pattern} onChange={(e) => setV({ ...v, pattern: e.target.value })} placeholder="e.g. swiggy" className="font-mono" />
          </div>
          {select("Direction", v.direction, (d) => setV({ ...v, direction: d as typeof v.direction }), [["ANY", "Money in or out"], ["DEBIT", "Money out"], ["CREDIT", "Money in"]])}
          {select("Account", v.accountId || "all", (a) => setV({ ...v, accountId: a === "all" ? "" : a }), [["all", "Any account"], ...accounts.map((a) => [a.id, a.name] as [string, string])])}
          <div className="space-y-1.5">
            <Label htmlFor="rmin">Min amount (₹)</Label>
            <Input id="rmin" inputMode="decimal" value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rmax">Max amount (₹)</Label>
            <Input id="rmax" inputMode="decimal" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} />
          </div>
          {select("Category", v.categoryId || "", (c) => setV({ ...v, categoryId: c }), categories.map((c) => [c.id, c.name]))}
          <div className="space-y-1.5">
            <Label htmlFor="rm">Rename merchant to (optional)</Label>
            <Input id="rm" value={v.merchantName} onChange={(e) => setV({ ...v, merchantName: e.target.value })} />
          </div>
          {!rule?.isSystem && (
            <div className="space-y-1.5">
              <Label htmlFor="rpr">Priority (1 runs first)</Label>
              <Input id="rpr" type="number" min={1} max={99} value={v.priority} onChange={(e) => setV({ ...v, priority: Number(e.target.value) })} />
            </div>
          )}
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch id="ren" checked={v.enabled} onCheckedChange={(enabled) => setV({ ...v, enabled })} />
            <Label htmlFor="ren">Enabled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !v.name || !v.pattern || !v.categoryId}
            onClick={() =>
              start(async () => {
                const { min, max, ...input } = v;
                const r = await saveRule(rule?.id ?? null, input, min, max);
                if (r.ok) {
                  toast.success(`Rule saved · ${r.data} transaction(s) re-categorized`);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RuleManager({ rules, categories, accounts }: { rules: RuleRow[]; categories: Opt[]; accounts: Opt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showSystem, setShowSystem] = useState(false);
  const shown = rules.filter((r) => showSystem || !r.isSystem);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RuleDialog categories={categories} accounts={accounts} />
        <div className="flex items-center gap-2">
          <Switch id="sys" checked={showSystem} onCheckedChange={setShowSystem} />
          <Label htmlFor="sys" className="text-sm font-normal">Show built-in rules ({rules.filter((r) => r.isSystem).length})</Label>
        </div>
      </div>
      <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Category</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id} className={r.enabled ? undefined : "opacity-50"}>
                <TableCell className="max-w-48">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="flex gap-1">
                    {r.isSystem && <Badge variant="outline">built-in</Badge>}
                    {!r.enabled && <Badge variant="outline">disabled</Badge>}
                  </div>
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="truncate font-mono text-xs" title={r.pattern}>
                    {r.field === "MERCHANT" ? "merchant" : "narration"} {r.matchType.toLowerCase().replace("_", " ")} “{r.pattern}”
                  </div>
                  {r.direction && <div className="text-xs text-muted-foreground">{r.direction === "DEBIT" ? "money out" : "money in"} only</div>}
                </TableCell>
                <TableCell className="text-sm">{r.categoryName}</TableCell>
                <TableCell className="flex justify-end">
                  <RuleDialog rule={r} categories={categories} accounts={accounts} />
                  {!r.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete rule ${r.name}`}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          if (!confirm(`Delete rule “${r.name}”?`)) return;
                          const res = await deleteRule(r.id);
                          if (res.ok) router.refresh();
                          else toast.error(res.error);
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!shown.length && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No rules of your own yet. Categorize transactions with “Create a rule” ticked, or add one here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
