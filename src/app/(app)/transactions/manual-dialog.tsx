"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { addManualTransaction } from "@/server/actions/transactions";
import { todayIso } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ManualTransactionDialog({ accounts, categories }: { accounts: { id: string; name: string }[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({ accountId: accounts[0]?.id ?? "", date: todayIso(), description: "", amount: "", direction: "DEBIT" as "DEBIT" | "CREDIT", categoryId: "", notes: "" });
  if (!accounts.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Manual entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a manual transaction</DialogTitle>
          <DialogDescription>For things statements can’t show, e.g. how withdrawn cash was spent. Manual entries are marked and never treated as bank-verified.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addManualTransaction(v);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={v.accountId} onValueChange={(accountId) => setV({ ...v, accountId })}>
                <SelectTrigger className="w-full" aria-label="Account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="md">Date</Label>
              <Input id="md" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma">Amount (₹)</Label>
              <Input id="ma" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={v.direction} onValueChange={(d) => setV({ ...v, direction: d as "DEBIT" | "CREDIT" })}>
                <SelectTrigger className="w-full" aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT">Money out</SelectItem>
                  <SelectItem value="CREDIT">Money in</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mdesc">Description</Label>
            <Input id="mdesc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={v.categoryId} onValueChange={(categoryId) => setV({ ...v, categoryId })}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !v.categoryId}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
