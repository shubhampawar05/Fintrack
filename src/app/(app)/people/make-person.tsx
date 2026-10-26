"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { createPersonAction } from "@/server/actions/people";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Turn a counterparty into a named person, then open their page to tag payments. */
export function MakePersonButton({ merchantKey, suggestedName, size = "sm" }: { merchantKey: string; suggestedName: string; size?: "sm" | "xs" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline">
          <UserPlus /> Make a person
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make a person</DialogTitle>
          <DialogDescription>
            Every payment to or from this UPI ID or name is attributed to the person, now and in future imports. You then tag what each payment was — a loan, card money or a shared expense.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createPersonAction(merchantKey, name);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
                router.push(`/people/${r.data!.id}`);
              } else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`pn-${merchantKey}`}>Name</Label>
            <Input id={`pn-${merchantKey}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            <p className="text-xs text-muted-foreground">Counterparty: {merchantKey}</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              Create person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
