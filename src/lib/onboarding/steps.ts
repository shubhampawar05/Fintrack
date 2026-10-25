/**
 * First-run setup: which steps exist and whether each is done. Status is always derived from the
 * user's data (passed in as plain facts) — never stored — so it cannot drift from reality.
 */

export type SetupStepId = "accounts" | "statements" | "identity" | "review" | "paytm" | "plan";

export interface SetupStepDef {
  id: SetupStepId;
  title: string;
  /** One line on why the step matters. */
  reason: string;
  href: string;
  action: string;
  required: boolean;
}

export const SETUP_STEPS: SetupStepDef[] = [
  {
    id: "accounts",
    title: "Add your bank accounts",
    reason: "Each statement is imported into a specific account. Only the bank name, type and last 4 digits are needed.",
    href: "/accounts",
    action: "Add account",
    required: true,
  },
  {
    id: "statements",
    title: "Import a statement for every account",
    reason: "Money moving between your accounts is only recognised as a transfer when both sides are imported.",
    href: "/import",
    action: "Import statement",
    required: true,
  },
  {
    id: "identity",
    title: "Tell Fintrack who you are",
    reason: "Payments to your own name, phone number or UPI IDs are transfers, not spending.",
    href: "/settings",
    action: "Check identifiers",
    required: true,
  },
  {
    id: "review",
    title: "Review flagged transactions",
    reason: "Payments to people can't be categorized automatically — a quick decision per person fixes them all.",
    href: "/transactions?review=1",
    action: "Review",
    required: true,
  },
  {
    id: "paytm",
    title: "Upload your Paytm history",
    reason: "Adds the real payee name, your notes and tags to UPI payments, and categorizes many of them.",
    href: "/import",
    action: "Upload history",
    required: false,
  },
  {
    id: "plan",
    title: "Set a budget or goal",
    reason: "Compare spending against a monthly limit, or track savings toward something.",
    href: "/budgets",
    action: "Create budget",
    required: false,
  },
];

export interface SetupFacts {
  /** Non-archived accounts and whether each has at least one committed import. */
  accounts: { name: string; hasCommittedImport: boolean }[];
  ownIdentifierCount: number;
  transactionCount: number;
  needsReviewCount: number;
  reviewMarkedDone: boolean;
  paymentAppImportCount: number;
  budgetCount: number;
  goalCount: number;
}

export interface SetupStep extends SetupStepDef {
  done: boolean;
  /** Progress or status line, e.g. "2 of 3 accounts imported". */
  detail?: string;
  /** Review step only: the user may mark it done (there is something to review). */
  canMarkDone?: boolean;
}

export interface SetupProgress {
  steps: SetupStep[];
  requiredDone: number;
  requiredTotal: number;
  allRequiredDone: boolean;
  /** The missing prerequisite that leaves data pages empty, if any. */
  nextPrerequisite: "accounts" | "statements" | null;
}

/** Review counts as done below this share of transactions needing review (integer percent). */
export const REVIEW_DONE_BELOW_PCT = 10;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function evaluateSetup(f: SetupFacts): SetupProgress {
  const imported = f.accounts.filter((a) => a.hasCommittedImport).length;
  const missing = f.accounts.filter((a) => !a.hasCommittedImport).map((a) => a.name);
  // Integer comparison: needsReview / total < 10%  ⇔  needsReview * 100 < total * 10.
  const belowThreshold = f.transactionCount > 0 && f.needsReviewCount * 100 < f.transactionCount * REVIEW_DONE_BELOW_PCT;

  const status: Record<SetupStepId, Pick<SetupStep, "done" | "detail" | "canMarkDone">> = {
    accounts: {
      done: f.accounts.length > 0,
      detail: f.accounts.length ? plural(f.accounts.length, "account") + " added" : undefined,
    },
    statements: {
      done: f.accounts.length > 0 && missing.length === 0,
      detail: f.accounts.length
        ? `${imported} of ${f.accounts.length} accounts imported${missing.length ? ` — still missing: ${missing.join(", ")}` : ""}`
        : undefined,
    },
    identity: {
      done: f.ownIdentifierCount > 0,
      detail: f.ownIdentifierCount
        ? `${plural(f.ownIdentifierCount, "identifier")} saved — check them and add your UPI IDs`
        : undefined,
    },
    review: {
      done: f.transactionCount > 0 && (belowThreshold || f.reviewMarkedDone),
      detail: f.transactionCount ? `${plural(f.needsReviewCount, "transaction")} need${f.needsReviewCount === 1 ? "s" : ""} review` : undefined,
      canMarkDone: f.transactionCount > 0 && !belowThreshold && !f.reviewMarkedDone,
    },
    paytm: { done: f.paymentAppImportCount > 0 },
    plan: {
      done: f.budgetCount + f.goalCount > 0,
      detail: f.budgetCount + f.goalCount ? `${plural(f.budgetCount, "budget")}, ${plural(f.goalCount, "goal")}` : undefined,
    },
  };

  const steps = SETUP_STEPS.map((def) => ({ ...def, ...status[def.id] }));
  const required = steps.filter((s) => s.required);
  const requiredDone = required.filter((s) => s.done).length;
  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    allRequiredDone: requiredDone === required.length,
    nextPrerequisite: f.accounts.length === 0 ? "accounts" : f.transactionCount === 0 ? "statements" : null,
  };
}

/** "How Fintrack works" walkthrough. Keep in line with the accounting rules in src/lib/finance/analytics.ts. */
export const HOW_IT_WORKS: { title: string; body: string[] }[] = [
  {
    title: "Your statements stay on this machine",
    body: [
      "Upload PDF, CSV or XLSX statements from your bank. Each file is read in memory and then discarded — only the extracted rows are kept.",
      "PDF passwords are used once and never stored. Nothing is sent to any outside service.",
    ],
  },
  {
    title: "What counts as spending",
    body: [
      "Only real expenses count as spending, and only real income counts as income.",
      "Transfers between your own accounts, investments, cash withdrawals and lending to or from friends are tracked separately — never as spending or income.",
    ],
  },
  {
    title: "Credit-card bills",
    body: [
      "Paying a card bill moves money to the card; the spending happened on the card.",
      "If you haven't imported the card's own statement, the bill payment is counted as spending so it isn't lost. Import the card statement to see itemized purchases instead.",
    ],
  },
  {
    title: "Why some rows are flagged",
    body: [
      "Every PDF row is checked against the bank's running balance, and anything uncertain is flagged instead of guessed — most often payments to people.",
      "Review them once per person under Transactions → Needs review; your choice becomes a rule for future imports.",
    ],
  },
];
