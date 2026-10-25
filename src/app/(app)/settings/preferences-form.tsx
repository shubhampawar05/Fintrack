"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSettings } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function PreferencesForm({
  initial,
}: {
  initial: { ownIdentifiers: string[]; transferWindowDays: number; ccPaymentTreatment: "AUTO" | "EXPENSE" | "EXCLUDE"; aiCategorization: boolean };
}) {
  const router = useRouter();
  const [ids, setIds] = useState(initial.ownIdentifiers.join("\n"));
  const [win, setWin] = useState(String(initial.transferWindowDays));
  const [cc, setCc] = useState(initial.ccPaymentTreatment);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettings({
            ownIdentifiers: ids.split("\n").map((s) => s.trim()).filter(Boolean),
            transferWindowDays: Number(win),
            ccPaymentTreatment: cc,
            aiCategorization: false,
          });
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ids">Your own names, phone numbers and UPI IDs</Label>
        <Textarea id="ids" rows={4} value={ids} onChange={(e) => setIds(e.target.value)} placeholder={"YOUR NAME\n98XXXXXXXX\nname@upi"} />
        <p className="text-xs text-muted-foreground">
          One per line. Payments to or from these are treated as transfers between your own accounts — never income or spending. Learned automatically from imported statements; edit if something is wrong.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="win">Transfer matching window (days)</Label>
          <Input id="win" type="number" min={0} max={10} value={win} onChange={(e) => setWin(e.target.value)} />
          <p className="text-xs text-muted-foreground">How far apart the two sides of a transfer may be dated.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Credit card bill payments</Label>
          <Select value={cc} onValueChange={(v) => setCc(v as typeof cc)}>
            <SelectTrigger className="w-full" aria-label="Credit card bill payments">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO">Automatic (recommended)</SelectItem>
              <SelectItem value="EXPENSE">Always count as spending</SelectItem>
              <SelectItem value="EXCLUDE">Never count as spending</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Automatic: counted as spending only while no credit-card account is tracked, so purchases are never counted twice.</p>
        </div>
      </div>
      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">AI categorization: not enabled.</span> All categorization runs locally with deterministic rules; nothing is sent to any external AI service. An opt-in AI suggestion feature is planned but not implemented in this version.
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
