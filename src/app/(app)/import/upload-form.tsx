"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Result = { ok: true; importId: string } | { ok: false; code?: string; message?: string; importId?: string; error?: string };

export function UploadForm({ accounts, defaultAccount }: { accounts: { id: string; name: string }[]; defaultAccount?: string }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(defaultAccount ?? accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !accountId) return;
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("accountId", accountId);
    if (password) body.set("password", password);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/imports");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 60));
    xhr.onload = () => {
      setProgress(null);
      let r: Result;
      try {
        r = JSON.parse(xhr.responseText);
      } catch {
        setError("Unexpected server response.");
        return;
      }
      if (r.ok) {
        setPassword("");
        toast.success("Statement parsed — review the preview");
        router.push(`/import/${r.importId}`);
        return;
      }
      if (r.code === "PASSWORD_REQUIRED" || r.code === "PASSWORD_INCORRECT") setNeedsPassword(true);
      if (r.code === "ALREADY_IMPORTED" && r.importId) {
        toast.info(r.message);
        router.push(`/import/${r.importId}`);
        return;
      }
      setError(r.message ?? r.error ?? "Upload failed.");
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Network error while uploading.");
    };
    setProgress(5);
    xhr.send(body);
    // Server-side parsing has no byte progress; show an indeterminate tail.
    const tick = setInterval(() => setProgress((p) => (p === null ? (clearInterval(tick), null) : Math.min(p + 4, 95))), 400);
  }

  const busy = progress !== null;
  return (
    <form onSubmit={upload} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <div className="space-y-2">
          <Label>Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-full" aria-label="Account">
              <SelectValue placeholder="Choose account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="file">Statement file</Label>
          <label
            htmlFor="file"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setFile(f);
                setNeedsPassword(false);
              }
            }}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
          >
            <FileUp className="size-5 text-muted-foreground" />
            <span className="truncate">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Drop a PDF, CSV, XLS or XLSX here, or click to choose"}</span>
            <input
              ref={inputRef}
              id="file"
              type="file"
              className="sr-only"
              accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setNeedsPassword(false);
              }}
            />
          </label>
        </div>
      </div>
      {(needsPassword || file?.name.toLowerCase().endsWith(".pdf")) && (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="pdfpw" className="flex items-center gap-1.5">
            <KeyRound className="size-3.5" /> PDF password {needsPassword ? "(required)" : "(if protected)"}
          </Label>
          <Input id="pdfpw" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={needsPassword && !password} />
          <p className="text-xs text-muted-foreground">Used once to open the file in memory. It is never stored or logged.</p>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not import this file</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {busy && <Progress value={progress} aria-label="Upload and parsing progress" />}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!file || !accountId || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FileUp />} {busy ? "Parsing…" : "Upload & preview"}
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Parsed locally on your server. The file itself is not kept.
        </span>
      </div>
    </form>
  );
}
