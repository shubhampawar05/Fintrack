import type { Direction } from "@prisma/client";
import { daysBetween } from "@/lib/dates";

export interface RefundCandidateTxn {
  id: string;
  accountId: string;
  date: string;
  direction: Direction;
  amountPaise: number;
  description: string;
  bankRef?: string | null;
  merchantKey?: string | null;
  isReversalNarration: boolean;
  refundOfId?: string | null;
}

export interface RefundLink {
  refundId: string;
  originalId: string;
  reason: string;
}

const REFUND_TEXT = /REFUND|REVERSAL|\bREV\b|DEBITREV|CHARGEBACK|RRC\b/i;
const REFUND_WINDOW_DAYS = 120;

/**
 * Link refunds/reversals (credits) to the debits they reverse, within the same account.
 * Precedence: identical bank reference → identical narration same day (bank-side
 * adjustment pairs) → refund narration + same merchant + amount ≤ original.
 */
export function findRefundLinks(txns: RefundCandidateTxn[]): RefundLink[] {
  const debits = txns.filter((t) => t.direction === "DEBIT");
  const linkedOriginals = new Set(txns.map((t) => t.refundOfId).filter(Boolean) as string[]);
  const links: RefundLink[] = [];

  for (const c of txns) {
    if (c.direction !== "CREDIT" || c.refundOfId) continue;
    const sameAccount = debits.filter(
      (d) =>
        d.accountId === c.accountId &&
        !linkedOriginals.has(d.id) &&
        d.date <= c.date &&
        daysBetween(d.date, c.date) <= REFUND_WINDOW_DAYS,
    );
    let original: RefundCandidateTxn | undefined;
    let reason = "";
    if (c.bankRef) {
      original = sameAccount.find((d) => d.bankRef === c.bankRef && d.amountPaise >= c.amountPaise);
      reason = "Same transaction reference as the original debit";
    }
    if (!original) {
      original = sameAccount.find(
        (d) => d.date === c.date && d.amountPaise === c.amountPaise && d.description.trim() === c.description.trim(),
      );
      reason = "Identical debit and credit on the same day (bank adjustment)";
    }
    if (!original && (c.isReversalNarration || REFUND_TEXT.test(c.description)) && c.merchantKey) {
      const matches = sameAccount
        .filter((d) => d.merchantKey === c.merchantKey && d.amountPaise >= c.amountPaise)
        .sort((a, b) => (a.amountPaise === c.amountPaise ? -1 : 0) - (b.amountPaise === c.amountPaise ? -1 : 0) || (a.date < b.date ? 1 : -1));
      original = matches[0];
      reason = "Refund narration from the same merchant";
    }
    if (original) {
      linkedOriginals.add(original.id);
      links.push({ refundId: c.id, originalId: original.id, reason });
    }
  }
  return links;
}
