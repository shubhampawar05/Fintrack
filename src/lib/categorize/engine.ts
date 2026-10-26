import type { CategorizationMethod, Direction, RuleField, RuleMatchType } from "@prisma/client";
import { extractCounterparty, isOwnCounterparty, isTruncatedOwnName, knownMerchant, PAYMENT_APPS, sharesSurname, titleCase, type Counterparty } from "./counterparty";
import { MCC_CATEGORY, categoryForTags } from "./defaults";

export const REVIEW_THRESHOLD = 0.8;

/**
 * Everyday categories where a note on a person-to-person payment ("rapido", "petrol", "juice")
 * is reliable and a mistake is cheap. Notes implying rent, loans, insurance, shopping or family
 * support are still flagged for review.
 */
const LOW_RISK_NOTE_CATEGORIES = ["transport", "food", "groceries", "fitness", "health"];

export interface RuleLike {
  id: string;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  direction?: Direction | null;
  accountId?: string | null;
  minAmountPaise?: number | null;
  maxAmountPaise?: number | null;
  categoryId: string;
  merchantName?: string | null;
  priority: number;
  isSystem: boolean;
  enabled: boolean;
  confidence: number;
}

export interface CategorizeContext {
  rules: RuleLike[];
  categoryIdByKey: Record<string, string>;
  ownIdentifiers: string[];
  holderNames: string[];
}

export interface TxnInput {
  description: string;
  direction: Direction;
  amountPaise: number;
  accountId: string;
  /** The same payment as recorded by a payment app (Paytm): real payee name, your note and tags. */
  app?: PaymentAppDetail | null;
}

export interface PaymentAppDetail {
  kind: "PAID" | "RECEIVED" | "SELF";
  payee: string;
  note?: string | null;
  tags: string[];
}

export interface CategorizeResult {
  categoryId: string;
  method: CategorizationMethod;
  confidence: number;
  needsReview: boolean;
  merchant: string;
  merchantKey: string;
  counterparty: Counterparty;
  ruleId?: string;
  reason: string;
}

const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, pattern.length > 500 ? null : new RegExp(pattern, "i"));
    } catch {
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern)!;
}

/** Text a DESCRIPTION rule is matched against: the bank narration plus your payment-app note. */
function ruleSubject(txn: TxnInput): string {
  return txn.app?.note ? `${txn.description} ${txn.app.note}` : txn.description;
}

export function ruleMatches(rule: RuleLike, txn: TxnInput, cp: Counterparty): boolean {
  if (!rule.enabled) return false;
  if (rule.direction && rule.direction !== txn.direction) return false;
  if (rule.accountId && rule.accountId !== txn.accountId) return false;
  if (rule.minAmountPaise != null && txn.amountPaise < rule.minAmountPaise) return false;
  if (rule.maxAmountPaise != null && txn.amountPaise > rule.maxAmountPaise) return false;
  const subject = rule.field === "MERCHANT" ? `${cp.display} ${cp.key}` : ruleSubject(txn);
  const s = subject.toLowerCase();
  const p = rule.pattern.toLowerCase().trim();
  if (!p) return false;
  switch (rule.matchType) {
    case "CONTAINS":
      return s.includes(p);
    case "STARTS_WITH":
      return s.startsWith(p);
    case "EQUALS":
      return rule.field === "MERCHANT" ? cp.display.toLowerCase() === p || cp.key === p : s === p;
    case "REGEX":
      return compile(rule.pattern)?.test(subject) ?? false;
  }
}

/**
 * Deterministic categorization. Order of precedence:
 *  1. User rules            — always win.
 *  2. Own-account transfer  — counterparty is the user (name / phone / UPI ID).
 *     Also: a payment app (Paytm) recorded it as a transfer to yourself.
 *  3. Bank reversal/refund  — narration is a reversal of an earlier debit.
 *  4. Payment-app tag       — your own tag in Paytm names the spending type ("#Food", "#rapido").
 *  5. Built-in rules        — keyword rules seeded into the DB (editable), also over your Paytm note.
 *  6. Merchant category code (MCC) printed by the bank.
 *  7. Family hint           — same surname as the holder; low confidence, needs review.
 *  8. Unclassified          — flagged for review instead of guessing.
 */
export function categorize(txn: TxnInput, ctx: CategorizeContext): CategorizeResult {
  const cp = extractCounterparty(txn.description);
  // Federal narrations only carry a UPI ID ("UPI 98xxxxxxxx"); the payment app knows the name.
  // A UPI ID like "paytmqr…@paytm" only names the app that carried the payment, so the payee name wins there too.
  const vpaMerchant = knownMerchant(cp.vpa ?? "");
  if (txn.app?.payee && txn.app.kind !== "SELF" && !cp.name && cp.channel === "UPI" && (!vpaMerchant || PAYMENT_APPS.has(vpaMerchant))) {
    cp.display = titleCase(txn.app.payee);
  }
  const cat = (key: string) => {
    const id = ctx.categoryIdByKey[key];
    if (!id) throw new Error(`Missing system category: ${key}`);
    return id;
  };
  const result = (
    categoryId: string,
    method: CategorizationMethod,
    confidence: number,
    reason: string,
    extra: Partial<CategorizeResult> = {},
  ): CategorizeResult => ({
    categoryId,
    method,
    confidence,
    needsReview: confidence < REVIEW_THRESHOLD,
    merchant: extra.merchant ?? cp.display,
    merchantKey: cp.key,
    counterparty: cp,
    reason,
    ...extra,
  });

  const sorted = [...ctx.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted.filter((r) => !r.isSystem)) {
    if (ruleMatches(rule, txn, cp)) {
      return result(rule.categoryId, "USER_RULE", Math.max(rule.confidence, 0.95), "Matched your rule", {
        ruleId: rule.id,
        merchant: rule.merchantName || cp.display,
      });
    }
  }

  if (isOwnCounterparty(cp, ctx.ownIdentifiers)) {
    return result(cat("transfer"), "OWN_ACCOUNT", 0.95, "Counterparty is one of your own accounts", {
      merchant: "Own account",
    });
  }

  if (txn.app?.kind === "SELF") {
    return result(cat("transfer"), "OWN_ACCOUNT", 0.95, "Paytm records this as a transfer to yourself", {
      merchant: "Own account",
    });
  }

  if (isTruncatedOwnName(cp, ctx.ownIdentifiers)) {
    return result(cat("transfer"), "OWN_ACCOUNT", 0.7, "Looks like your own name, shortened by the bank — confirm", {
      merchant: "Own account",
    });
  }

  if (cp.isReversal && txn.direction === "CREDIT") {
    return result(cat("refund"), "RULE", 0.9, "Bank reversal / refund narration");
  }

  const tagged = txn.direction === "DEBIT" && txn.app ? categoryForTags(txn.app.tags) : undefined;
  if (tagged) {
    return result(cat(tagged.key), "RULE", 0.9, `Your Paytm tag "#${tagged.tag}"`);
  }

  for (const rule of sorted.filter((r) => r.isSystem)) {
    if (ruleMatches(rule, txn, cp)) {
      // Keywords in a person-to-person payment usually come from a free-text note ("Loan", "Gym"):
      // keep the hint but always ask the user to confirm.
      const lowRisk = LOW_RISK_NOTE_CATEGORIES.some((k) => ctx.categoryIdByKey[k] === rule.categoryId);
      const capped = cp.isPerson && !lowRisk;
      const confidence = capped ? Math.min(rule.confidence, 0.6) : cp.isPerson ? Math.min(rule.confidence, 0.85) : rule.confidence;
      return result(rule.categoryId, "RULE", confidence, capped ? "Keyword in a payment note — please confirm" : "Matched built-in rule", {
        ruleId: rule.id,
        merchant: rule.merchantName || cp.display,
      });
    }
  }

  if (cp.mcc && cp.mcc !== "0000" && txn.direction === "DEBIT" && MCC_CATEGORY[cp.mcc]) {
    return result(cat(MCC_CATEGORY[cp.mcc]), "MCC", 0.8, `Merchant category code ${cp.mcc}`);
  }

  if (txn.direction === "DEBIT" && sharesSurname(cp, ctx.holderNames)) {
    return result(cat("family"), "RULE", 0.6, "Recipient shares your surname — please confirm");
  }

  return result(
    cat("unclassified"),
    "DEFAULT",
    0,
    cp.isPerson ? "Payment to/from a person — needs your input" : "No rule matched",
  );
}
