"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAllData } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DangerZone() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete all my financial data</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete everything?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently deletes all accounts, transactions, original imported rows, import history, budgets, goals, recurring payments, your rules and custom categories, settings and the audit log. Built-in categories and rules are recreated empty. Type DELETE to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Type DELETE to confirm" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={text !== "DELETE" || pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAllData(text);
                if (r.ok) {
                  toast.success(r.message);
                  router.push("/login");
                } else toast.error(r.error);
              })
            }
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
