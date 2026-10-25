import { matchPaytmAccount } from "@/lib/parsing/paytm";

export interface AppEntryLike {
  id: string;
  upiRef: string;
  kind: "PAID" | "RECEIVED" | "SELF";
  amountPaise: number;
  /** Paying account label; for SELF entries `payee` is the receiving account label. */
  account: string;
  payee: string;
}

export interface BankTxnLike {
  id: string;
  accountId: string;
  bankRef: string | null;
  direction: "DEBIT" | "CREDIT";
  amountPaise: number;
}

export interface AccountLike {
  id: string;
  bankName: string;
  accountLast4: string | null;
}

/**
 * Pair payment-app entries with bank transactions. A pair needs the same UPI reference, the same
 * amount and the matching direction; when the app's account label maps to an imported account the
 * transaction must be in that account. Ambiguous candidates are left unmatched — never guessed.
 * A transfer to yourself is attached to the debit when the paying account is imported, otherwise
 * to the credit in the receiving account.
 */
export function matchPaymentAppEntries(entries: AppEntryLike[], txns: BankTxnLike[], accounts: AccountLike[]): Map<string, string> {
  const byRef = new Map<string, BankTxnLike[]>();
  for (const t of txns) if (t.bankRef) byRef.set(t.bankRef, [...(byRef.get(t.bankRef) ?? []), t]);
  const used = new Set<string>();
  const out = new Map<string, string>();

  const pick = (e: AppEntryLike, direction: "DEBIT" | "CREDIT", label: string): BankTxnLike | undefined => {
    if (/credit card|gold coins|wallet/i.test(label)) return undefined;
    const account = matchPaytmAccount(label, accounts);
    const hits = (byRef.get(e.upiRef) ?? []).filter(
      (t) => t.direction === direction && t.amountPaise === e.amountPaise && !used.has(t.id) && (!account || t.accountId === account.id),
    );
    return hits.length === 1 ? hits[0] : undefined;
  };

  for (const e of entries) {
    const hit =
      e.kind === "PAID" ? pick(e, "DEBIT", e.account)
      : e.kind === "RECEIVED" ? pick(e, "CREDIT", e.account)
      : (pick(e, "DEBIT", e.account) ?? pick(e, "CREDIT", e.payee));
    if (hit) {
      used.add(hit.id);
      out.set(e.id, hit.id);
    }
  }
  return out;
}
