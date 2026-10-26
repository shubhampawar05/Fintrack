import { describe, expect, it } from "vitest";
import type { CategoryKind, SpendGroup } from "@prisma/client";
import { computeSummary, type AnalyticsTxn } from "@/lib/finance/analytics";
import { computeMoneyFlow } from "@/lib/finance/money-flow";

let n = 0;
type FlowTxn = AnalyticsTxn & { personId?: string | null };
function tx(o: Partial<FlowTxn> & Pick<AnalyticsTxn, "direction" | "amountPaise" | "categoryKind">): FlowTxn {
  n++;
  return {
    id: `t${n}`, date: "2026-03-10", accountId: "a", categoryId: o.categoryKey ?? o.categoryKind, categoryKey: null,
    categoryName: o.categoryKey ?? o.categoryKind, group: null, merchant: `m${n}`, merchantKey: `m${n}`, ...o,
  };
}

const MARCH = { from: "2026-03-01", to: "2026-03-31" };
const NONE = new Set<string>();
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("money out buckets", () => {
  const rows = [
    tx({ direction: "DEBIT", amountPaise: 1_000_000, categoryKind: "EXPENSE", categoryKey: "groceries", group: "ESSENTIAL" }),
    tx({ direction: "DEBIT", amountPaise: 1_000_000, categoryKind: "EXPENSE", categoryKey: "family", group: "FAMILY" }),
    tx({ direction: "DEBIT", amountPaise: 3_000_000, categoryKind: "CREDIT_CARD_PAYMENT", categoryKey: "cc-payment" }),
    tx({ direction: "DEBIT", amountPaise: 500_000, categoryKind: "INVESTMENT" }),
    tx({ direction: "DEBIT", amountPaise: 2_000_000, categoryKind: "TRANSFER" }),
    tx({ direction: "DEBIT", amountPaise: 700_000, categoryKind: "SETTLEMENT" }),
    tx({ direction: "DEBIT", amountPaise: 1_800_000, categoryKind: "UNCLASSIFIED" }),
  ];

  it("splits debits into buckets that add up to total debits", () => {
    const f = computeMoneyFlow(rows, MARCH, { ccPaymentsAsExpense: true }, NONE);
    expect(f.out).toEqual({ myself: 1_000_000, family: 1_000_000, card: 3_000_000, invested: 500_000, own: 2_000_000, people: 700_000, cash: 0, other: 0, unclassified: 1_800_000 });
    expect(f.totalOut).toBe(10_000_000);
    expect(sum(f.out)).toBe(f.totalOut);
    expect(f.unclassifiedOutShare).toBe(18);
  });

  it("counts a debit with no category as not yet classified", () => {
    // The query layer maps a missing category to kind UNCLASSIFIED.
    const f = computeMoneyFlow([tx({ direction: "DEBIT", amountPaise: 12_345, categoryKind: "UNCLASSIFIED", categoryId: null })], MARCH, { ccPaymentsAsExpense: true }, NONE);
    expect(f.out.unclassified).toBe(12_345);
  });

  it("puts debits in income or refund categories under Other", () => {
    const f = computeMoneyFlow(
      [tx({ direction: "DEBIT", amountPaise: 100, categoryKind: "INCOME" }), tx({ direction: "DEBIT", amountPaise: 2_450_000, categoryKind: "REFUND" })],
      MARCH, { ccPaymentsAsExpense: true }, NONE,
    );
    expect(f.out.other).toBe(2_450_100);
    expect(sum(f.out)).toBe(f.totalOut);
  });

  it("calls out transfers with no matched counterpart", () => {
    const a = tx({ direction: "DEBIT", amountPaise: 1_500_000, categoryKind: "TRANSFER" });
    const b = tx({ direction: "DEBIT", amountPaise: 500_000, categoryKind: "TRANSFER" });
    const f = computeMoneyFlow([a, b], MARCH, { ccPaymentsAsExpense: true }, new Set([a.id]));
    expect(f.out.own).toBe(2_000_000);
    expect(f.unmatchedTransfersOut).toBe(1_500_000);
  });

  it("lists the largest unclassified counterparties with their person", () => {
    const f = computeMoneyFlow(
      [
        tx({ direction: "DEBIT", amountPaise: 600_000, categoryKind: "UNCLASSIFIED", merchant: "Tushar Sharma", merchantKey: "phone:1", personId: "p1" }),
        tx({ direction: "DEBIT", amountPaise: 400_000, categoryKind: "UNCLASSIFIED", merchant: "Tushar Sharma", merchantKey: "phone:1", personId: "p1" }),
        tx({ direction: "DEBIT", amountPaise: 800_000, categoryKind: "UNCLASSIFIED", merchant: "Someone", merchantKey: "x@y" }),
      ],
      MARCH, { ccPaymentsAsExpense: true }, NONE,
    );
    expect(f.topUnclassified[0]).toEqual({ key: "phone:1", label: "Tushar Sharma", personId: "p1", amountPaise: 1_000_000, count: 2 });
    expect(f.topUnclassified[1].personId).toBeNull();
  });
});

describe("money in and net figures", () => {
  it("a card repayment from a friend is not income", () => {
    const f = computeMoneyFlow(
      [
        tx({ direction: "CREDIT", amountPaise: 2_950_000, categoryKind: "CREDIT_CARD_PAYMENT", categoryKey: "cc-payment" }),
        tx({ direction: "CREDIT", amountPaise: 15_000_000, categoryKind: "INCOME", categoryKey: "salary" }),
      ],
      MARCH, { ccPaymentsAsExpense: true }, NONE,
    );
    expect(f.in.income).toBe(15_000_000);
    expect(f.in.paidBack).toBe(2_950_000);
    expect(sum(f.in)).toBe(f.totalIn);
  });

  it("shows card bills gross and net of friends' repayments", () => {
    const f = computeMoneyFlow(
      [
        tx({ direction: "DEBIT", amountPaise: 10_000_000, categoryKind: "CREDIT_CARD_PAYMENT", categoryKey: "cc-payment" }),
        tx({ direction: "CREDIT", amountPaise: 4_000_000, categoryKind: "CREDIT_CARD_PAYMENT", categoryKey: "cc-payment" }),
      ],
      MARCH, { ccPaymentsAsExpense: false }, NONE,
    );
    expect(f.out.card).toBe(10_000_000);
    expect(f.cardNet).toBe(6_000_000);
  });
});

// Deterministic pseudo-random generator so the property test is reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}
const KINDS: CategoryKind[] = ["INCOME", "EXPENSE", "TRANSFER", "CREDIT_CARD_PAYMENT", "INVESTMENT", "CASH", "REFUND", "SETTLEMENT", "UNCLASSIFIED"];
const GROUPS: (SpendGroup | null)[] = ["ESSENTIAL", "DISCRETIONARY", "FAMILY", null];

describe("money flow invariants (generated data)", () => {
  for (const seed of [1, 7, 42, 2026, 99991]) {
    it(`buckets partition totals and net figures match Spending Analysis (seed ${seed})`, () => {
      const r = rng(seed);
      const rows = Array.from({ length: 300 }, () => {
        const kind = KINDS[Math.floor(r() * KINDS.length)];
        const refundOfKind = KINDS[Math.floor(r() * KINDS.length)];
        return tx({
          direction: r() < 0.5 ? "DEBIT" : "CREDIT",
          amountPaise: 1 + Math.floor(r() * 5_000_000),
          categoryKind: kind,
          group: kind === "EXPENSE" ? GROUPS[Math.floor(r() * GROUPS.length)] : null,
          date: r() < 0.9 ? "2026-03-15" : "2026-04-02",
          refundOf: kind === "REFUND" && r() < 0.5 ? { categoryId: "x", categoryName: "x", categoryKind: refundOfKind, group: GROUPS[Math.floor(r() * GROUPS.length)] } : null,
        });
      });
      for (const ccPaymentsAsExpense of [true, false]) {
        const opts = { ccPaymentsAsExpense };
        const f = computeMoneyFlow(rows, MARCH, opts, NONE);
        const s = computeSummary(rows, MARCH, opts);
        expect(sum(f.out)).toBe(f.totalOut);
        expect(sum(f.in)).toBe(f.totalIn);
        expect(f.totalOut).toBe(s.totalDebits);
        expect(f.totalIn).toBe(s.totalCredits);
        expect(f.myselfNet + f.familyNet + (ccPaymentsAsExpense ? f.cardNet : 0)).toBe(s.expenses);
      }
    });
  }
});
