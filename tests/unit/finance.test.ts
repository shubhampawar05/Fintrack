import { describe, expect, it } from "vitest";
import { findTransferMatches, type TransferCandidateTxn } from "@/lib/finance/transfers";
import { findRefundLinks, type RefundCandidateTxn } from "@/lib/finance/refunds";
import { detectRecurring, type RecurringInputTxn } from "@/lib/finance/recurring";
import { assignDedupeKeys } from "@/lib/finance/dedupe";

const t = (o: Partial<TransferCandidateTxn> & Pick<TransferCandidateTxn, "id" | "accountId" | "direction">): TransferCandidateTxn => ({
  date: "2026-08-01", amountPaise: 2000_00, kind: "UNCLASSIFIED", ownCounterparty: false, userLocked: false, ...o,
});

describe("internal transfer detection", () => {
  it("confirms matches with the same UPI reference in two accounts", () => {
    const m = findTransferMatches(
      [
        t({ id: "k1", accountId: "kotak", direction: "DEBIT", bankRef: "212120918724", kind: "TRANSFER", ownCounterparty: true }),
        t({ id: "f1", accountId: "federal", direction: "CREDIT", bankRef: "212120918724", kind: "TRANSFER", ownCounterparty: true }),
      ],
      3,
    );
    expect(m).toEqual([expect.objectContaining({ debitId: "k1", creditId: "f1", status: "CONFIRMED" })]);
  });

  it("only suggests amount+date matches and never auto-confirms them", () => {
    const m = findTransferMatches(
      [t({ id: "d", accountId: "a", direction: "DEBIT" }), t({ id: "c", accountId: "b", direction: "CREDIT", date: "2026-08-02" })],
      3,
    );
    expect(m).toHaveLength(1);
    expect(m[0].status).toBe("SUGGESTED");
    expect(m[0].confidence).toBeLessThan(0.8);
  });

  it("does not match different UPI references even when amount and date agree", () => {
    const m = findTransferMatches(
      [
        t({ id: "d", accountId: "fed", direction: "DEBIT", amountPaise: 10000_00, bankRef: "209983552462" }),
        t({ id: "c", accountId: "bom", direction: "CREDIT", amountPaise: 10000_00, bankRef: "209959575651" }),
      ],
      3,
    );
    expect(m).toEqual([]);
  });

  it("does not suggest when the counterpart is ambiguous, out of window, same account, or a categorized expense", () => {
    expect(
      findTransferMatches(
        [t({ id: "d", accountId: "a", direction: "DEBIT" }), t({ id: "c1", accountId: "b", direction: "CREDIT" }), t({ id: "c2", accountId: "c", direction: "CREDIT" })],
        3,
      ),
    ).toEqual([]);
    expect(findTransferMatches([t({ id: "d", accountId: "a", direction: "DEBIT" }), t({ id: "c", accountId: "b", direction: "CREDIT", date: "2026-08-10" })], 3)).toEqual([]);
    expect(findTransferMatches([t({ id: "d", accountId: "a", direction: "DEBIT" }), t({ id: "c", accountId: "a", direction: "CREDIT" })], 3)).toEqual([]);
    expect(findTransferMatches([t({ id: "d", accountId: "a", direction: "DEBIT", kind: "EXPENSE" }), t({ id: "c", accountId: "b", direction: "CREDIT" })], 3)).toEqual([]);
  });

  it("does not re-suggest pairs the user rejected", () => {
    const txns = [t({ id: "d", accountId: "a", direction: "DEBIT" }), t({ id: "c", accountId: "b", direction: "CREDIT" })];
    expect(findTransferMatches(txns, 3, [{ debitId: "d", creditId: "c" }])).toEqual([]);
  });

  it("pairs each transaction at most once", () => {
    const m = findTransferMatches(
      [
        t({ id: "d1", accountId: "a", direction: "DEBIT", bankRef: "111111111111" }),
        t({ id: "c1", accountId: "b", direction: "CREDIT", bankRef: "111111111111" }),
        t({ id: "d2", accountId: "a", direction: "DEBIT", bankRef: "222222222222" }),
        t({ id: "c2", accountId: "b", direction: "CREDIT", bankRef: "222222222222" }),
      ],
      3,
    );
    expect(m.map((x) => `${x.debitId}-${x.creditId}`).sort()).toEqual(["d1-c1", "d2-c2"]);
  });
});

const r = (o: Partial<RefundCandidateTxn> & Pick<RefundCandidateTxn, "id" | "direction">): RefundCandidateTxn => ({
  accountId: "a", date: "2026-01-09", amountPaise: 300_00, description: "x", isReversalNarration: false, ...o,
});

describe("refund and reversal linking", () => {
  it("links UPI refunds to the original by reference", () => {
    const links = findRefundLinks([
      r({ id: "d", direction: "DEBIT", bankRef: "530132895032", description: "UPIOUT/530132895032/kukufm@ybl/Collect/5733" }),
      r({ id: "c", direction: "CREDIT", bankRef: "530132895032", description: "UPI REFUND RRC 530132895032", isReversalNarration: true, date: "2026-01-10" }),
    ]);
    expect(links).toEqual([expect.objectContaining({ refundId: "c", originalId: "d" })]);
  });
  it("links identical same-day debit/credit adjustment pairs", () => {
    const links = findRefundLinks([
      r({ id: "d", direction: "DEBIT", description: "Ac xfr from Sol 5555 to 2409" }),
      r({ id: "c", direction: "CREDIT", description: "Ac xfr from Sol 5555 to 2409" }),
    ]);
    expect(links).toHaveLength(1);
  });
  it("links merchant refunds by merchant, never a refund larger than the original", () => {
    const links = findRefundLinks([
      r({ id: "d1", direction: "DEBIT", merchantKey: "name:blinkit", amountPaise: 450_00, date: "2026-01-10" }),
      r({ id: "c", direction: "CREDIT", merchantKey: "name:blinkit", amountPaise: 450_00, date: "2026-03-25", description: "UPI/BLINKIT/YESB/1/Refund" }),
      r({ id: "c2", direction: "CREDIT", merchantKey: "name:blinkit", amountPaise: 900_00, date: "2026-03-26", description: "UPI/BLINKIT/YESB/2/Refund" }),
    ]);
    expect(links.map((l) => [l.refundId, l.originalId])).toEqual([["c", "d1"]]);
  });
  it("does not link across accounts or to later debits", () => {
    expect(
      findRefundLinks([
        r({ id: "d", direction: "DEBIT", accountId: "other", bankRef: "1" }),
        r({ id: "c", direction: "CREDIT", bankRef: "1", isReversalNarration: true }),
        r({ id: "late", direction: "DEBIT", bankRef: "1", date: "2026-02-01" }),
      ]),
    ).toEqual([]);
  });
});

const rec = (id: string, date: string, amountPaise: number, extra: Partial<RecurringInputTxn> = {}): RecurringInputTxn => ({
  id, date, amountPaise, direction: "DEBIT", merchantKey: "name:netflix com", merchant: "Netflix", categoryKey: "subscriptions", categoryKind: "EXPENSE", ...extra,
});

describe("recurring detection", () => {
  it("detects monthly subscriptions with a next expected date", () => {
    const s = detectRecurring([rec("1", "2026-01-12", 649_00), rec("2", "2026-02-12", 649_00), rec("3", "2026-03-12", 649_00)], "2026-03-20");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ frequency: "MONTHLY", kind: "SUBSCRIPTION", occurrences: 3, typicalAmountPaise: 649_00, nextExpectedDate: "2026-04-11" });
  });
  it("never flags a single or double occurrence as recurring", () => {
    expect(detectRecurring([rec("1", "2026-01-12", 649_00)], "2026-03-01")).toEqual([]);
    expect(detectRecurring([rec("1", "2026-01-12", 649_00), rec("2", "2026-02-12", 649_00)], "2026-03-01")).toEqual([]);
  });
  it("ignores irregular cadence and wildly different amounts", () => {
    expect(detectRecurring([rec("1", "2026-01-01", 649_00), rec("2", "2026-01-04", 649_00), rec("3", "2026-03-30", 649_00)], "2026-04-01")).toEqual([]);
    expect(detectRecurring([rec("1", "2026-01-12", 100_00), rec("2", "2026-02-12", 5000_00), rec("3", "2026-03-12", 20000_00)], "2026-04-01")).toEqual([]);
  });
  it("does not forecast stale series", () => {
    const s = detectRecurring([rec("1", "2025-01-12", 649_00), rec("2", "2025-02-12", 649_00), rec("3", "2025-03-12", 649_00)], "2026-03-20");
    expect(s[0].nextExpectedDate).toBeNull();
  });
  it("excludes internal transfers", () => {
    const tx = [1, 2, 3].map((m) => rec(String(m), `2026-0${m}-01`, 5000_00, { categoryKind: "TRANSFER", merchantKey: "own" }));
    expect(detectRecurring(tx, "2026-04-01")).toEqual([]);
  });
});

describe("duplicate detection keys", () => {
  const row = { txnDate: "2026-04-05", direction: "DEBIT" as const, amountPaise: 640_00, description: "UPIOUT/600000000032/swiggy.payu@hdfcbank/Food/5812" };
  it("is stable across re-imports of overlapping statements", () => {
    expect(assignDedupeKeys([row, { ...row, amountPaise: 1 }])[0]).toBe(assignDedupeKeys([row])[0]);
  });
  it("keeps legitimate identical repeats distinct", () => {
    const [a, b] = assignDedupeKeys([row, row]);
    expect(a).not.toBe(b);
    expect(a.endsWith("#1") && b.endsWith("#2")).toBe(true);
  });
  it("uses the bank reference when present so narration formatting differences don't matter", () => {
    const [a] = assignDedupeKeys([{ ...row, reference: "S10000012" }]);
    const [b] = assignDedupeKeys([{ ...row, description: "different text", reference: "S10000012" }]);
    const [c] = assignDedupeKeys([{ ...row, reference: "S10000013" }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("does not merge same-amount transactions with different narrations", () => {
    const [a] = assignDedupeKeys([row]);
    const [b] = assignDedupeKeys([{ ...row, description: "UPIOUT/600000000099/zomato@hdfcbank/Food/5812" }]);
    expect(a).not.toBe(b);
  });
});
