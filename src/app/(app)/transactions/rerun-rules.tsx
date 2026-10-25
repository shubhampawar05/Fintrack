"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { recategorizeAll } from "@/server/actions/transactions";
import { Button } from "@/components/ui/button";

export function RerunRulesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      title="Re-apply rules to automatically categorized transactions. Your manual choices are never changed."
      onClick={() =>
        start(async () => {
          const r = await recategorizeAll();
          if (r.ok) {
            toast.success(`Rules re-applied · ${r.data} transaction(s) changed`);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} /> Re-run rules
    </Button>
  );
}
