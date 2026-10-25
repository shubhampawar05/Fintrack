"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ColumnMapping } from "@/lib/parsing";
import { remapImport } from "@/server/actions/imports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: "date", label: "Transaction date", required: true },
  { key: "description", label: "Description", required: true },
  { key: "debit", label: "Debit / withdrawal" },
  { key: "credit", label: "Credit / deposit" },
  { key: "amount", label: "Single amount (signed)" },
  { key: "drCr", label: "Dr/Cr indicator" },
  { key: "balance", label: "Balance" },
  { key: "reference", label: "Reference / cheque no." },
  { key: "valueDate", label: "Value date" },
];

export function MappingEditor({ importId, headers, sample, mapping }: { importId: string; headers: string[]; sample: string[][]; mapping: ColumnMapping }) {
  const [m, setM] = useState<ColumnMapping>(mapping);
  const [save, setSave] = useState(true);
  const [pending, start] = useTransition();
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Column mapping</CardTitle>
        <CardDescription>Detected automatically. Correct any column and re-apply; the preview below updates without re-uploading.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">
                {f.label}
                {f.required && " *"}
              </Label>
              <Select value={m[f.key] == null ? "none" : String(m[f.key])} onValueChange={(v) => setM({ ...m, [f.key]: v === "none" ? null : Number(v) })}>
                <SelectTrigger className="w-full" aria-label={f.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not mapped —</SelectItem>
                  {headers.map((h, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {h || `Column ${i + 1}`} {sample[0]?.[i] ? `· e.g. ${String(sample[0][i]).slice(0, 18)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {m.amount != null && m.drCr == null && (
          <div className="flex items-center gap-2">
            <Checkbox id="neg" checked={m.negativeIsDebit ?? true} onCheckedChange={(v) => setM({ ...m, negativeIsDebit: v === true })} />
            <Label htmlFor="neg" className="text-sm font-normal">Negative amounts are debits</Label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await remapImport(importId, m, save);
                if (r.ok) toast.success(r.message);
                else toast.error(r.error);
              })
            }
          >
            {pending ? "Re-parsing…" : "Apply mapping"}
          </Button>
          <div className="flex items-center gap-2">
            <Checkbox id="save" checked={save} onCheckedChange={(v) => setSave(v === true)} />
            <Label htmlFor="save" className="text-sm font-normal">Remember for this account</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
