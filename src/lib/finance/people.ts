import type { CategoryKind, Direction } from "@prisma/client";
import type { Paise } from "@/lib/money";

/**
 * What a payment with a person was. Each tag maps to an existing category, so the
 * accounting rules in analytics.ts apply unchanged:
 *  - loan:   "Personal lending and repayments" (SETTLEMENT) — moves the person's balance only.
 *  - card:   a friend paying the user back for a card purchase → "Credit card payments" credit,
 *            which nets against card bills.
 *  - shared: a share of a shared expense, in the expense category the user picks.
 *  - gift:   family support when paid, other income when received.
 */
export type PersonTag = "loan" | "card" | "shared" | "gift";

export const PERSON_TAGS: { tag: PersonTag; label: string; hint: string }[] = [
  { tag: "loan", label: "Loan or repayment", hint: "Lending, borrowing and paying back. Moves the balance; never income or spending." },
  { tag: "card", label: "Paid me back for my card", hint: "They used your credit card and paid you. Reduces your card bills." },
  { tag: "shared", label: "Shared expense", hint: "A share of rent, food or a trip. Counts in the category you choose." },
  { tag: "gift", label: "Gift or family support", hint: "Money to family counts as Family support; money received is Other income." },
];

export interface LedgerTxn {
  direction: Direction;
  amountPaise: Paise;
  categoryKind: CategoryKind;
}

export interface PersonBalance {
  /** Positive: the person owes the user. Negative: the user owes the person. */
  balance: Paise;
  untaggedCount: number;
  untaggedPaise: Paise;
}

/** Opening balance + lending debits − lending credits. Untagged rows are reported, never counted. */
export function personBalance(openingPaise: Paise, txns: LedgerTxn[]): PersonBalance {
  let balance = openingPaise;
  let untaggedCount = 0;
  let untaggedPaise = 0;
  for (const t of txns) {
    if (t.categoryKind === "SETTLEMENT") balance += t.direction === "DEBIT" ? t.amountPaise : -t.amountPaise;
    else if (t.categoryKind === "UNCLASSIFIED") {
      untaggedCount++;
      untaggedPaise += t.amountPaise;
    }
  }
  return { balance, untaggedCount, untaggedPaise };
}

export type TagResult = { ok: true; categoryKey: string | null } | { ok: false; error: string };

/**
 * The built-in category key a tag sets, or null for "shared" (the caller supplies an expense category).
 * Own-account transfers are never re-tagged: they must stay out of income and spending.
 */
export function tagToCategoryKey(tag: PersonTag, direction: Direction, currentKind: CategoryKind): TagResult {
  if (currentKind === "TRANSFER") return { ok: false, error: "Transfers between your own accounts can't be tagged as a payment with a person." };
  switch (tag) {
    case "loan":
      return { ok: true, categoryKey: "lending" };
    case "card":
      if (direction === "DEBIT") return { ok: false, error: "A card repayment must be money you received." };
      return { ok: true, categoryKey: "cc-payment" };
    case "shared":
      return { ok: true, categoryKey: null };
    case "gift":
      return { ok: true, categoryKey: direction === "DEBIT" ? "family" : "other-income" };
  }
}

/** The tag a categorized person transaction reads as, derived from its category (tags are not stored). */
export function tagForCategory(kind: CategoryKind, key: string | null): PersonTag | null {
  if (kind === "SETTLEMENT") return "loan";
  if (kind === "CREDIT_CARD_PAYMENT") return "card";
  if (key === "family" || key === "other-income") return "gift";
  if (kind === "EXPENSE") return "shared";
  return null;
}

export function balanceWording(balance: Paise): "owes-you" | "you-owe" | "settled" {
  return balance > 0 ? "owes-you" : balance < 0 ? "you-owe" : "settled";
}

/** Case- and space-insensitive key that keeps person names unique per user. */
export function personNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
