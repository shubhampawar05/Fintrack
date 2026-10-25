"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteBudget, upsertBudget } from "@/server/actions/planning";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BudgetDialog({ categories, initial }: { categories: { id: string; name: string }[]; initial?: { categoryId: string; amount: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial ?? { categoryId: "", amount: "" });
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit budget">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Set budget
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit monthly budget" : "Set a monthly budget"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await upsertBudget(v);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={v.categoryId} onValueChange={(categoryId) => setV({ ...v, categoryId })} disabled={!!initial}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Choose a spending category" />
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
          <div className="space-y-1.5">
            <Label htmlFor="amt">Monthly amount (₹)</Label>
            <Input id="amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !v.categoryId}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBudget({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Remove budget"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await deleteBudget(id);
          if (r.ok) router.refresh();
          else toast.error(r.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
