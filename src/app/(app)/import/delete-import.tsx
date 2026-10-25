"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteImportAction } from "@/server/actions/imports";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteImportButton({ id, fileName, imported, committed }: { id: string; fileName: string; imported: number; committed: boolean }) {
  const [withTxns, setWithTxns] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete import ${fileName}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this import?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Always deleted:</strong> the import record for “{fileName}” and every original row extracted from it. (The file itself was never stored.)
              </p>
              {committed && (
                <p>
                  <strong>Transactions:</strong> {imported} transaction(s) were created by this import. Rows that were skipped as duplicates belong to an earlier import and are not affected.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {committed && imported > 0 && (
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox id="withTxns" checked={withTxns} onCheckedChange={(v) => setWithTxns(v === true)} />
            <Label htmlFor="withTxns" className="text-sm font-normal leading-snug">
              Also delete its {imported} transaction(s), including your notes and category edits on them. Untick to keep the transactions.
            </Label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteImportAction(id, committed && withTxns);
                if (r.ok) {
                  toast.success(`Import deleted${r.data?.transactionsDeleted ? ` with ${r.data.transactionsDeleted} transactions` : ""}`);
                  router.push("/import");
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
