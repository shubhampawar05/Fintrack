"use client";
import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { accountSchema, type AccountInput } from "@/lib/validation/schemas";
import { createAccount, updateAccount } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = [
  ["SAVINGS", "Savings"],
  ["SALARY", "Salary"],
  ["CURRENT", "Current"],
  ["CREDIT_CARD", "Credit card"],
  ["WALLET", "Wallet"],
  ["OTHER", "Other"],
] as const;

export function AccountFormDialog({ account }: { account?: AccountInput & { id: string } }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: account ?? { displayName: "", bankName: "", accountType: "SAVINGS", currency: "INR", accountLast4: "", openingBalance: "", openingBalanceDate: "" },
  });
  const err = form.formState.errors;

  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = account ? await updateAccount(account.id, values) : await createAccount(values);
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setOpen(false);
        if (!account) form.reset();
      } else toast.error(r.error);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {account ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${account.displayName}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Add account
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add bank account"}</DialogTitle>
          <DialogDescription>Never enter passwords, PINs or full card numbers. Only the last 4 digits are stored.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" placeholder="e.g. Federal – everyday" {...form.register("displayName")} aria-invalid={!!err.displayName} />
              {err.displayName && <p className="text-xs text-destructive">{err.displayName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank</Label>
              <Input id="bankName" placeholder="e.g. Federal Bank" {...form.register("bankName")} aria-invalid={!!err.bankName} />
              {err.bankName && <p className="text-xs text-destructive">{err.bankName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <Controller
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Account type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" maxLength={3} {...form.register("currency")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountLast4">Last 4 digits</Label>
                <Input id="accountLast4" inputMode="numeric" maxLength={4} {...form.register("accountLast4")} aria-invalid={!!err.accountLast4} />
              </div>
            </div>
          </div>
          <fieldset className="grid gap-2 rounded-lg border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Opening balance (optional — filled automatically from statements)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Opening balance" placeholder="₹ amount" {...form.register("openingBalance")} />
              <Input aria-label="Opening balance date" type="date" {...form.register("openingBalanceDate")} />
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
