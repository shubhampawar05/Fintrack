"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteGoal, saveGoal } from "@/server/actions/planning";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type GoalInput = { name: string; target: string; current: string; targetDate: string; notes: string };

export function GoalDialog({ id, initial }: { id?: string; initial?: GoalInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<GoalInput>(initial ?? { name: "", target: "", current: "0", targetDate: "", notes: "" });
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit goal">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> New goal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{id ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>Update the current amount whenever you add to it — bank statements alone can’t tell which money is set aside for which goal.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveGoal(id ?? null, v);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="gn">Name</Label>
            <Input id="gn" placeholder="e.g. Emergency fund" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gt">Target (₹)</Label>
              <Input id="gt" inputMode="decimal" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gc">Saved so far (₹)</Label>
              <Input id="gc" inputMode="decimal" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd">Target date</Label>
            <Input id="gd" type="date" value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gno">Notes</Label>
            <Textarea id="gno" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteGoal({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete goal"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!confirm("Delete this goal?")) return;
          const r = await deleteGoal(id);
          if (r.ok) router.refresh();
          else toast.error(r.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
