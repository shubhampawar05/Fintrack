"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { RANGE_PRESETS } from "@/lib/range-params";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RangeFilter({ preset, from, to }: { preset: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState({ from, to });

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    start(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      <Select
        value={preset}
        onValueChange={(v) => (v === "custom" ? apply({ range: "custom", from: custom.from, to: custom.to }) : apply({ range: v, from: null, to: null }))}
      >
        <SelectTrigger className="w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ range: "custom", ...custom });
          }}
        >
          <Input type="date" aria-label="From" className="w-36" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <Input type="date" aria-label="To" className="w-36" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          <Button size="sm" type="submit" variant="outline">
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
