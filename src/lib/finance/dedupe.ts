import { createHash } from "node:crypto";
import type { Direction } from "@prisma/client";

export interface DedupeInput {
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  description: string;
  reference?: string | null;
}

export function normalizeDescription(d: string): string {
  return d.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const r = ref.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  // Placeholders like "0", "-", "NA" are not real references.
  return r.length >= 4 && !/^0+$/.test(r) ? r : null;
}

/**
 * Account-scoped dedupe keys for the rows of one statement.
 *
 * Identity = date + direction + amount + (bank reference, or normalized narration).
 * Rows that are identical on all of those are numbered by occurrence (#1, #2, …) within the
 * statement, so two genuine ₹20 tea payments on the same day stay two transactions, while
 * re-importing an overlapping statement reproduces the same keys and is skipped.
 */
export function assignDedupeKeys(rows: DedupeInput[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const ref = normalizeRef(r.reference);
    const identity = ref
      ? `ref:${ref}|${r.txnDate}|${r.direction}|${r.amountPaise}`
      : `desc:${normalizeDescription(r.description)}|${r.txnDate}|${r.direction}|${r.amountPaise}`;
    const n = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, n);
    return `${createHash("sha256").update(identity).digest("hex").slice(0, 32)}#${n}`;
  });
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
