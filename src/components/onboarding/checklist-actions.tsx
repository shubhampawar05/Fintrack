"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Check, EyeOff, LayoutDashboard } from "lucide-react";
import { setChecklistHiddenAction, setReviewDoneAction } from "@/server/actions/onboarding";
import { Button } from "@/components/ui/button";

function useAction(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
  const [pending, start] = useTransition();
  return {
    pending,
    run: () =>
      start(async () => {
        const r = await fn();
        if (!r.ok) toast.error(r.error ?? "Something went wrong.");
        else if (success) toast.success(success);
      }),
  };
}

export function HideChecklistButton() {
  const a = useAction(() => setChecklistHiddenAction(true), "Hidden — reopen it any time from Guide");
  return (
    <Button variant="ghost" size="sm" onClick={a.run} disabled={a.pending}>
      <EyeOff /> Hide
    </Button>
  );
}

export function ShowChecklistButton() {
  const a = useAction(() => setChecklistHiddenAction(false), "Checklist is back on the dashboard");
  return (
    <Button variant="outline" size="sm" onClick={a.run} disabled={a.pending}>
      <LayoutDashboard /> Show on dashboard
    </Button>
  );
}

export function MarkReviewDoneButton() {
  const a = useAction(() => setReviewDoneAction(true), "Review step marked as done");
  return (
    <Button variant="outline" size="sm" onClick={a.run} disabled={a.pending}>
      <Check /> Mark as done
    </Button>
  );
}
