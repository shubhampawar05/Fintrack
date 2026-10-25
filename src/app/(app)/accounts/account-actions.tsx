"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteAccount } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteAccountButton({ id, name, count }: { id: string; name: string; count: number }) {
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the account, its {count} transaction(s), import history and the original imported rows. Budgets, goals and
            categorization rules are kept. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAccount(id);
                if (r.ok) toast.success(r.message);
                else toast.error(r.error);
              })
            }
          >
            Delete everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
