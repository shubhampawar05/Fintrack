"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { updateRecurring } from "@/server/actions/planning";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KINDS = ["SUBSCRIPTION", "RENT", "SALARY", "EMI", "INSURANCE", "FAMILY", "INVESTMENT", "BILL", "OTHER"] as const;

export function RecurringActions({ id, status, label, kind }: { id: string; status: string; label: string; kind: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ label, kind });
  const act = (patch: Parameters<typeof updateRecurring>[1]) =>
    start(async () => {
      const r = await updateRecurring(id, patch);
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="flex justify-end gap-1">
      {status !== "CONFIRMED" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act({ status: "CONFIRMED" })}>
          <Check /> Confirm
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Edit">
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit recurring payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rl">Name</Label>
              <Input id="rl" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={v.kind} onValueChange={(k) => setV({ ...v, kind: k })}>
                <SelectTrigger className="w-full" aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k.charAt(0) + k.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={pending} onClick={() => act({ label: v.label, kind: v.kind as (typeof KINDS)[number], status: "CONFIRMED" })}>
              Save & confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {status !== "REJECTED" ? (
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss" disabled={pending} onClick={() => act({ status: "REJECTED" })}>
          <X />
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act({ status: "SUGGESTED" })}>
          Restore
        </Button>
      )}
    </div>
  );
}
