"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatMonth } from "@/lib/dates";
import { Button } from "@/components/ui/button";

export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (m: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("month", m);
    router.push(`${pathname}?${sp.toString()}`);
  };
  const shift = (n: number) => addMonths(`${month}-01`, n).slice(0, 7);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => go(shift(-1))}>
        <ChevronLeft />
      </Button>
      <span className="min-w-24 text-center text-sm font-medium">{formatMonth(month)}</span>
      <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => go(shift(1))}>
        <ChevronRight />
      </Button>
    </div>
  );
}
