"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const KINDS = [
  ["INCOME", "Income"],
  ["EXPENSE", "Expense"],
  ["TRANSFER", "Own transfer"],
  ["CREDIT_CARD_PAYMENT", "Card bill"],
  ["INVESTMENT", "Investment"],
  ["CASH", "Cash"],
  ["REFUND", "Refund"],
  ["SETTLEMENT", "Lending"],
  ["UNCLASSIFIED", "Unclassified"],
];

export function TransactionFilters({ accounts, categories, sort }: { accounts: { id: string; name: string }[]; categories: { id: string; name: string }[]; sort: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");

  function set(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    start(() => router.push(`${pathname}?${sp.toString()}`));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sel = (key: string, placeholder: string, items: [string, string][], width = "w-40") => (
    <Select value={params.get(key) ?? "all"} onValueChange={(v) => set({ [key]: v })}>
      <SelectTrigger className={width} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {items.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const active = ["q", "account", "category", "kind", "direction", "min", "max", "review", "merchant"].some((k) => params.get(k));
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search description, merchant, notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
      </div>
      {sel("account", "All accounts", accounts.map((a) => [a.id, a.name]))}
      {sel("category", "All categories", [["none", "No category"], ...categories.map((c) => [c.id, c.name] as [string, string])], "w-48")}
      {sel("kind", "All types", KINDS as [string, string][])}
      {sel("direction", "In & out", [["DEBIT", "Money out"], ["CREDIT", "Money in"]], "w-32")}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          set({ min, max });
        }}
      >
        <Input className="w-24" placeholder="Min ₹" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum amount" />
        <Input className="w-24" placeholder="Max ₹" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum amount" />
        <Button type="submit" variant="outline" size="sm">
          Go
        </Button>
      </form>
      <Select value={sort} onValueChange={(v) => set({ sort: v })}>
        <SelectTrigger className="w-40" aria-label="Sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date_desc">Newest first</SelectItem>
          <SelectItem value="date_asc">Oldest first</SelectItem>
          <SelectItem value="amount_desc">Largest first</SelectItem>
          <SelectItem value="amount_asc">Smallest first</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 px-1">
        <Switch id="review" checked={params.get("review") === "1"} onCheckedChange={(v) => set({ review: v ? "1" : null })} />
        <Label htmlFor="review" className="text-sm font-normal">Needs review</Label>
      </div>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            setMin("");
            setMax("");
            set({ q: null, account: null, category: null, kind: null, direction: null, min: null, max: null, review: null, merchant: null });
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
