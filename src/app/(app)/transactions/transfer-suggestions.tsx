"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";
import { decideTransfer } from "@/server/actions/transactions";
import { formatDate } from "@/lib/dates";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Item {
  id: string;
  confidence: number;
  reason: string;
  debit: { date: string; account: string; description: string; amountPaise: number };
  credit: { date: string; account: string; description: string };
}

export function TransferSuggestions({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const decide = (id: string, confirm: boolean) =>
    start(async () => {
      const r = await decideTransfer(id, confirm);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Possible transfers between your accounts</CardTitle>
        <CardDescription>
          Same amount, close dates, different accounts — but no shared reference number. Confirm only if you moved this money yourself; confirmed pairs are excluded from income and expenses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5 font-medium">
                  <Money paise={s.debit.amountPaise} /> {s.debit.account} <ArrowRight className="size-3.5" /> {s.credit.account}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatDate(s.debit.date)}: {s.debit.description}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatDate(s.credit.date)}: {s.credit.description}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.reason} · {Math.round(s.confidence * 100)}% confidence
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(s.id, false)}>
                  <X /> Not a transfer
                </Button>
                <Button size="sm" disabled={pending} onClick={() => decide(s.id, true)}>
                  <Check /> Confirm
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
