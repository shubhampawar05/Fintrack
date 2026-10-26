"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Merge, Pencil, Trash2, X } from "lucide-react";
import {
  deletePersonAction, linkKeyAction, mergePeopleAction, renamePersonAction, setOpeningBalanceAction, unlinkKeyAction,
} from "@/server/actions/people";
import { paiseToRupeeInput, type Paise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RenamePerson({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil /> Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await renamePersonAction(personId, value);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <Label htmlFor="rename" className="sr-only">
            Name
          </Label>
          <Input id="rename" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} required />
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

export function OpeningBalanceDialog({ personId, name, openingPaise, asOf }: { personId: string; name: string; openingPaise: Paise; asOf: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(openingPaise ? paiseToRupeeInput(Math.abs(openingPaise)) : "");
  const [owesMe, setOwesMe] = useState(openingPaise >= 0);
  const [date, setDate] = useState(asOf ?? "");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Opening balance
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opening balance</DialogTitle>
          <DialogDescription>For money owed before your first imported statement. Leave the amount empty for none.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await setOpeningBalanceAction(personId, { amount, owesMe, asOf: date });
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ob-dir">Who owed whom</Label>
            <Select value={owesMe ? "me" : "them"} onValueChange={(v) => setOwesMe(v === "me")}>
              <SelectTrigger id="ob-dir" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">{name} owed me</SelectItem>
                <SelectItem value="them">I owed {name}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ob-amt">Amount (₹)</Label>
              <Input id="ob-amt" inputMode="decimal" placeholder="10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-date">As of</Label>
              <Input id="ob-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
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

export function MergePerson({ personId, name, people }: { personId: string; name: string; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [into, setInto] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Merge /> Merge
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {name} into…</DialogTitle>
          <DialogDescription>Use this when the same person appears twice. Their UPI IDs, payments and opening balance move over, and {name} is removed.</DialogDescription>
        </DialogHeader>
        <Select value={into ?? undefined} onValueChange={setInto}>
          <SelectTrigger className="w-full" aria-label="Merge into">
            <SelectValue placeholder="Choose a person" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            disabled={!into || pending}
            onClick={() =>
              start(async () => {
                const r = await mergePeopleAction(personId, into!);
                if (r.ok) {
                  toast.success(r.message);
                  router.push(`/people/${into}`);
                } else toast.error(r.error);
              })
            }
          >
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePerson({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes the person, their linked UPI IDs and opening balance. Their transactions stay, with the categories you gave them — they just won&apos;t be grouped under anyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deletePersonAction(personId);
                if (r.ok) {
                  toast.success(r.message);
                  router.push("/people");
                } else toast.error(r.error);
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type Candidate = { merchantKey: string; label: string; owner: string | null };

export function LinkedKeys({ personId, keys, candidates }: { personId: string; keys: { merchantKey: string; label: string }[]; candidates: Candidate[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<string | null>(null);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const link = (move: boolean) =>
    start(async () => {
      const r = await linkKeyAction(personId, pick!, move);
      if (!r.ok) return void toast.error(r.error);
      if (r.data?.needsMove) return setMoveFrom(r.data.needsMove);
      toast.success("Linked");
      setPick(null);
      setMoveFrom(null);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="divide-y">
        {keys.map((k) => (
          <li key={k.merchantKey} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{k.label}</div>
              <div className="truncate text-xs text-muted-foreground">{k.merchantKey}</div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Unlink ${k.label}`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await unlinkKeyAction(personId, k.merchantKey);
                  if (r.ok) {
                    toast.success(r.message);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <X />
            </Button>
          </li>
        ))}
        {!keys.length && <li className="py-2 text-sm text-muted-foreground">None — payments are only attributed by hand.</li>}
      </ul>
      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={pick ?? undefined} onValueChange={(v) => { setPick(v); setMoveFrom(null); }}>
            <SelectTrigger className="w-full sm:w-80" aria-label="Link another UPI ID or name">
              <SelectValue placeholder="Link another UPI ID or name" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.merchantKey} value={c.merchantKey}>
                  {c.label}
                  {c.owner && ` (belongs to ${c.owner})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!pick || pending} onClick={() => link(false)}>
            <Link2 /> Link
          </Button>
        </div>
      )}
      {moveFrom && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>
            This belongs to {moveFrom}. Move it here? Payments you moved by hand stay with {moveFrom}.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMoveFrom(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={() => link(true)}>
              Move
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
