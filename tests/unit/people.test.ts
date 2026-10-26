import { describe, expect, it } from "vitest";
import { balanceWording, personBalance, personNameKey, tagForCategory, tagToCategoryKey, type LedgerTxn } from "@/lib/finance/people";

const lend = (amountPaise: number): LedgerTxn => ({ direction: "DEBIT", amountPaise, categoryKind: "SETTLEMENT" });
const back = (amountPaise: number): LedgerTxn => ({ direction: "CREDIT", amountPaise, categoryKind: "SETTLEMENT" });

describe("personBalance", () => {
  it("lend then get partly repaid", () => {
    const b = personBalance(0, [lend(1_000_000), back(400_000)]);
    expect(b.balance).toBe(600_000);
    expect(balanceWording(b.balance)).toBe("owes-you");
  });

  it("borrowing from a friend makes the balance negative", () => {
    const b = personBalance(0, [back(2_430_000)]);
    expect(b.balance).toBe(-2_430_000);
    expect(balanceWording(b.balance)).toBe("you-owe");
  });

  it("card and shared-expense tags do not move the balance", () => {
    const b = personBalance(0, [
      { direction: "CREDIT", amountPaise: 2_950_000, categoryKind: "CREDIT_CARD_PAYMENT" },
      { direction: "CREDIT", amountPaise: 120_000, categoryKind: "EXPENSE" },
      { direction: "DEBIT", amountPaise: 350_000, categoryKind: "EXPENSE" },
    ]);
    expect(b.balance).toBe(0);
    expect(balanceWording(b.balance)).toBe("settled");
  });

  it("starts from the opening balance", () => {
    expect(personBalance(1_000_000, []).balance).toBe(1_000_000);
    expect(personBalance(1_000_000, [back(1_000_000)]).balance).toBe(0);
  });

  it("reports untagged rows separately and leaves them out of the balance", () => {
    const b = personBalance(0, [lend(500_000), { direction: "DEBIT", amountPaise: 300_000, categoryKind: "UNCLASSIFIED" }, { direction: "CREDIT", amountPaise: 200_000, categoryKind: "UNCLASSIFIED" }]);
    expect(b).toEqual({ balance: 500_000, untaggedCount: 2, untaggedPaise: 500_000 });
  });
});

describe("tagToCategoryKey", () => {
  it("maps loans to lending in both directions", () => {
    expect(tagToCategoryKey("loan", "DEBIT", "UNCLASSIFIED")).toEqual({ ok: true, categoryKey: "lending" });
    expect(tagToCategoryKey("loan", "CREDIT", "UNCLASSIFIED")).toEqual({ ok: true, categoryKey: "lending" });
  });

  it("card repayments must be money received", () => {
    expect(tagToCategoryKey("card", "CREDIT", "UNCLASSIFIED")).toEqual({ ok: true, categoryKey: "cc-payment" });
    expect(tagToCategoryKey("card", "DEBIT", "UNCLASSIFIED").ok).toBe(false);
  });

  it("gift is family support when paid and other income when received", () => {
    expect(tagToCategoryKey("gift", "DEBIT", "UNCLASSIFIED")).toEqual({ ok: true, categoryKey: "family" });
    expect(tagToCategoryKey("gift", "CREDIT", "UNCLASSIFIED")).toEqual({ ok: true, categoryKey: "other-income" });
  });

  it("shared expense leaves the category to the caller", () => {
    expect(tagToCategoryKey("shared", "DEBIT", "UNCLASSIFIED")).toEqual({ ok: true, categoryKey: null });
  });

  it("never re-tags own-account transfers", () => {
    for (const tag of ["loan", "card", "shared", "gift"] as const) expect(tagToCategoryKey(tag, "CREDIT", "TRANSFER").ok).toBe(false);
  });
});

describe("tagForCategory and names", () => {
  it("derives the tag label from the category", () => {
    expect(tagForCategory("SETTLEMENT", "lending")).toBe("loan");
    expect(tagForCategory("CREDIT_CARD_PAYMENT", "cc-payment")).toBe("card");
    expect(tagForCategory("EXPENSE", "family")).toBe("gift");
    expect(tagForCategory("INCOME", "other-income")).toBe("gift");
    expect(tagForCategory("EXPENSE", "groceries")).toBe("shared");
    expect(tagForCategory("UNCLASSIFIED", "unclassified")).toBeNull();
  });

  it("name keys ignore case and extra spaces", () => {
    expect(personNameKey("  Govinda   Gadre ")).toBe(personNameKey("govinda gadre"));
  });
});
