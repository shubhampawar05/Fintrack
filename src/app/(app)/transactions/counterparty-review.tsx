"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CategoryKind } from "@prisma/client";
import { categorizeCounterparty } from "@/server/actions/transactions";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategorySelect } from "./transactions-table";

export interface CounterpartyGroup {
  merchantKey: string;
  label: string;
  count: number;
  outPaise: number;
  inPaise: number;
}

function Row({ g, categories }: { g: CounterpartyGroup; categories: { id: string; name: string; kind: CategoryKind }[] }) {
  const router = useRouter();
  const [cat, setCat] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <div className="truncate font-medium">{g.label}</div>
        <div className="text-xs text-muted-foreground">
          {g.count} transaction(s)
          {g.outPaise > 0 && ` · paid ${formatINR(g.outPaise, { decimals: false })}`}
          {g.inPaise > 0 && ` · received ${formatINR(g.inPaise, { decimals: false })}`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CategorySelect value={cat} categories={categories} onChange={setCat} className="w-56" label={`Category for ${g.label}`} />
        <Button
          size="sm"
          disabled={!cat || pending}
          onClick={() =>
            start(async () => {
              const r = await categorizeCounterparty(g.merchantKey, cat!);
              if (r.ok) {
                toast.success(`Categorized ${r.data?.updated} transaction(s) and saved a rule`);
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Apply to all
        </Button>
      </div>
    </li>
  );
}

export function CounterpartyReview({ groups, categories }: { groups: CounterpartyGroup[]; categories: { id: string; name: string; kind: CategoryKind }[] }) {
  if (!groups.length) return null;
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Review by person or merchant</CardTitle>
        <CardDescription>
          The counterparties with the most transactions awaiting review. Choose what they are — e.g. Family support, Personal lending and repayments, Rent, or Transfers between my own accounts — and future imports will follow the same rule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {groups.map((g) => (
            <Row key={g.merchantKey} g={g} categories={categories} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
