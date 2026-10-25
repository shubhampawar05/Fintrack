import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import type { DataQualityWarning } from "@/server/queries";

export function DataWarnings({ warnings, limit }: { warnings: DataQualityWarning[]; limit?: number }) {
  if (!warnings.length) return null;
  const shown = limit ? warnings.slice(0, limit) : warnings;
  return (
    <ul className="space-y-2 text-sm" aria-label="Data quality notes">
      {shown.map((w, i) => (
        <li key={i} className="flex gap-2">
          {w.level === "warning" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Note" />
          )}
          <span className="text-muted-foreground">
            {w.message}{" "}
            {w.href && (
              <Link href={w.href} className="font-medium text-foreground underline-offset-4 hover:underline">
                Review
              </Link>
            )}
          </span>
        </li>
      ))}
      {limit && warnings.length > limit && <li className="pl-6 text-xs text-muted-foreground">+{warnings.length - limit} more on the report page</li>}
    </ul>
  );
}
