import type { CategoryKind, Direction } from "@prisma/client";
import { daysBetween } from "@/lib/dates";

export interface TransferCandidateTxn {
  id: string;
  accountId: string;
  date: string;
  direction: Direction;
  amountPaise: number;
  bankRef?: string | null;
  kind: CategoryKind;
  /** True when categorized as an own-account transfer from the narration (name/phone/UPI ID). */
  ownCounterparty: boolean;
  /** True when the user explicitly categorized this transaction. */
  userLocked: boolean;
}

export interface TransferMatch {
  debitId: string;
  creditId: string;
  confidence: number;
  reason: string;
  /** Exact reference matches are confirmed automatically; everything else is a suggestion. */
  status: "CONFIRMED" | "SUGGESTED";
}

const ELIGIBLE: CategoryKind[] = ["TRANSFER", "UNCLASSIFIED", "SETTLEMENT"];

/**
 * Find likely transfers between the user's own tracked accounts.
 *
 * - Same UPI/IMPS reference + same amount + opposite direction in two different accounts
 *   is proof of a transfer → CONFIRMED.
 * - Same amount within the date window is only a SUGGESTION (rule: never assume every
 *   matching debit/credit pair is internal). Ambiguous candidates (several equally good
 *   counterparts) are not suggested at all.
 */
export function findTransferMatches(
  txns: TransferCandidateTxn[],
  windowDays: number,
  excluded: { debitId: string; creditId: string }[] = [],
): TransferMatch[] {
  const rejected = new Set(excluded.map((e) => `${e.debitId}|${e.creditId}`));
  const debits = txns.filter((t) => t.direction === "DEBIT");
  const credits = txns.filter((t) => t.direction === "CREDIT");
  const creditsByRef = new Map<string, TransferCandidateTxn[]>();
  const creditsByAmount = new Map<number, TransferCandidateTxn[]>();
  for (const c of credits) {
    if (c.bankRef) creditsByRef.set(c.bankRef, [...(creditsByRef.get(c.bankRef) ?? []), c]);
    creditsByAmount.set(c.amountPaise, [...(creditsByAmount.get(c.amountPaise) ?? []), c]);
  }

  const candidates: (TransferMatch & { tiebreak: number })[] = [];
  for (const d of debits) {
    // 1) Exact reference match — eligible regardless of category (the reference is proof).
    if (d.bankRef) {
      for (const c of creditsByRef.get(d.bankRef) ?? []) {
        if (c.accountId === d.accountId || c.amountPaise !== d.amountPaise) continue;
        if (Math.abs(daysBetween(d.date, c.date)) > windowDays) continue;
        if (rejected.has(`${d.id}|${c.id}`)) continue;
        candidates.push({
          debitId: d.id,
          creditId: c.id,
          confidence: 0.99,
          reason: "Same UPI/IMPS reference number on both accounts",
          status: "CONFIRMED",
          tiebreak: 0,
        });
      }
    }
    // 2) Amount + date proximity — suggestion only.
    if (!ELIGIBLE.includes(d.kind) || (d.userLocked && d.kind !== "TRANSFER")) continue;
    const pool = (creditsByAmount.get(d.amountPaise) ?? []).filter(
      (c) =>
        c.accountId !== d.accountId &&
        ELIGIBLE.includes(c.kind) &&
        !(c.userLocked && c.kind !== "TRANSFER") &&
        !(d.bankRef && c.bankRef && d.bankRef !== c.bankRef && /^\d{12}$/.test(d.bankRef) && /^\d{12}$/.test(c.bankRef)) &&
        Math.abs(daysBetween(d.date, c.date)) <= windowDays &&
        !rejected.has(`${d.id}|${c.id}`),
    );
    if (pool.length !== 1) continue; // ambiguous or none
    const c = pool[0];
    const sameDay = d.date === c.date;
    let confidence = 0.5 + (sameDay ? 0.1 : 0);
    if (d.ownCounterparty && c.ownCounterparty) confidence += 0.25;
    else if (d.ownCounterparty || c.ownCounterparty) confidence += 0.1;
    candidates.push({
      debitId: d.id,
      creditId: c.id,
      confidence: Math.min(confidence, 0.9),
      reason: `Same amount ${sameDay ? "on the same day" : `within ${Math.abs(daysBetween(d.date, c.date))} day(s)`}${
        d.ownCounterparty || c.ownCounterparty ? " and your name/UPI ID appears in the narration" : ""
      }`,
      status: "SUGGESTED",
      tiebreak: Math.abs(daysBetween(d.date, c.date)),
    });
  }

  // Greedy best-first: each transaction participates in at most one transfer.
  candidates.sort((a, b) => b.confidence - a.confidence || a.tiebreak - b.tiebreak);
  const used = new Set<string>();
  const out: TransferMatch[] = [];
  for (const c of candidates) {
    if (used.has(c.debitId) || used.has(c.creditId)) continue;
    used.add(c.debitId);
    used.add(c.creditId);
    out.push({ debitId: c.debitId, creditId: c.creditId, confidence: c.confidence, reason: c.reason, status: c.status });
  }
  return out;
}
