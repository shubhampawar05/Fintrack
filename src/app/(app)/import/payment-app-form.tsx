"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { deletePaymentAppImportAction } from "@/server/actions/imports";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Outcome =
  | { ok: true; entries: number; linked: number; unlinked: number; warnings: string[] }
  | { ok: false; message?: string; error?: string };

export function PaymentAppForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setResult(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const res = await fetch("/api/payment-app", { method: "POST", body });
      const r = (await res.json()) as Outcome;
      setResult(r);
      if (r.ok) {
        toast.success(`Added details to ${r.linked} bank transactions`);
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Network error while uploading." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="paytm-file">Paytm UPI statement (PDF)</Label>
        <label
          htmlFor="paytm-file"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
        >
          <FileUp className="size-5 text-muted-foreground" />
          <span className="truncate">{file ? file.name : "Paytm app → Balance & History → Download statement"}</span>
          <input id="paytm-file" type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {result && !result.ok && (
        <Alert variant="destructive">
          <AlertTitle>Could not read this file</AlertTitle>
          <AlertDescription>{result.message ?? result.error}</AlertDescription>
        </Alert>
      )}
      {result?.ok && (
        <Alert>
          <AlertTitle>
            Matched {result.linked} of {result.entries} Paytm payments to your bank transactions
          </AlertTitle>
          <AlertDescription>
            {result.unlinked > 0 &&
              `${result.unlinked} weren't matched — they were paid from accounts or cards you haven't imported, or fall outside your statements' dates. They'll match automatically if you import those statements later.`}
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="secondary" disabled={!file || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <FileUp />} {busy ? "Matching…" : "Upload Paytm history"}
      </Button>
    </form>
  );
}

export function DeletePaymentAppImport({ id, fileName }: { id: string; fileName: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${fileName}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!confirm("Remove this Paytm history? Payee names, notes and tags it added are removed; bank transactions stay.")) return;
          const r = await deletePaymentAppImportAction(id);
          if (r.ok) {
            toast.success("Paytm history removed");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
