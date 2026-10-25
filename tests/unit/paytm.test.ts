import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "@/lib/parsing/pdf/extract";
import { matchPaytmAccount, parsePaytmStatement } from "@/lib/parsing/paytm";
import { parsePaymentAppStatement, parseStatement } from "@/lib/parsing";
import { matchPaymentAppEntries } from "@/lib/finance/payment-app";
import { categorize } from "@/lib/categorize/engine";
import { categoryForTags } from "@/lib/categorize/defaults";
import { testContext } from "./helpers";

const fixture = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/statements", f)));

describe("Paytm UPI statement parser", () => {
  it("reads every payment card and reconciles with Paytm's printed totals", async () => {
    const r = parsePaytmStatement(await extractPdfText(fixture("paytm-synthetic.pdf")));
    expect(r.totalsCheck).toBe("PASSED");
    expect(r.summary).toMatchObject({ periodStart: "2026-01-01", periodEnd: "2026-03-31", reportedPaidPaise: 2_025_00, reportedReceivedPaise: 20_000_00 });
    expect(r.entries.map((e) => e.kind)).toEqual(["PAID", "SELF", "PAID", "RECEIVED", "PAID"]);
    expect(r.entries[2]).toMatchObject({
      date: "2026-02-15", payee: "Priya Nair", upiId: "friend123@okaxis", upiRef: "600000000030", note: "Movie night", tags: ["drinks"],
      account: "Fi (Federal Bank) - 56", amountPaise: 2_000_00,
    });
    expect(r.entries[1]).toMatchObject({ kind: "SELF", payee: "Kotak Mahindra Bank - 2233", tags: ["Self Transfer"], amountPaise: 15_000_00 });
    expect(r.entries[4]).toMatchObject({ upiRef: undefined, bankRef: "15200000001", account: "Gold Coins" });
  });

  it("is refused by the bank-statement importer and accepted by the payment-app importer", async () => {
    await expect(parseStatement({ bytes: fixture("paytm-synthetic.pdf"), fileName: "p.pdf" })).rejects.toThrow(/Paytm UPI statement/);
    await expect(parsePaymentAppStatement({ bytes: fixture("federal-synthetic.pdf"), fileName: "f.pdf" })).rejects.toThrow(/doesn't look like a Paytm/);
    expect((await parsePaymentAppStatement({ bytes: fixture("paytm-synthetic.pdf"), fileName: "p.pdf" })).entries).toHaveLength(5);
  });
});

describe("matching Paytm entries to bank transactions", () => {
  const accounts = [
    { id: "fed", bankName: "Federal Bank", accountLast4: "0496" },
    { id: "k1", bankName: "Kotak Mahindra Bank", accountLast4: "3661" },
    { id: "k2", bankName: "Kotak Mahindra Bank", accountLast4: "7824" },
  ];
  it("maps app account labels to imported accounts by bank and trailing digits", () => {
    expect(matchPaytmAccount("Fi (Federal Bank) - 96", accounts)?.id).toBe("fed");
    expect(matchPaytmAccount("Kotak Mahindra Bank - 24", accounts)?.id).toBe("k2");
    expect(matchPaytmAccount("State Bank Of India - 70", accounts)).toBeUndefined();
    expect(matchPaytmAccount("CSB Bank Rupay Credit Card - 55", accounts)).toBeUndefined();
  });
  it("needs the same reference, amount, direction and account — and never guesses", () => {
    const entry = (o: object) => ({ id: "e", upiRef: "111", kind: "PAID" as const, amountPaise: 100_00, account: "Fi (Federal Bank) - 96", payee: "X", ...o });
    const txn = (o: object) => ({ id: "t", accountId: "fed", bankRef: "111", direction: "DEBIT" as const, amountPaise: 100_00, ...o });
    expect(matchPaymentAppEntries([entry({})], [txn({})], accounts).get("e")).toBe("t");
    expect(matchPaymentAppEntries([entry({})], [txn({ amountPaise: 99_00 })], accounts).size).toBe(0);
    expect(matchPaymentAppEntries([entry({})], [txn({ direction: "CREDIT" })], accounts).size).toBe(0);
    expect(matchPaymentAppEntries([entry({})], [txn({ accountId: "k1" })], accounts).size).toBe(0);
    expect(matchPaymentAppEntries([entry({})], [txn({ id: "a" }), txn({ id: "b" })], accounts).size).toBe(0);
    expect(matchPaymentAppEntries([entry({ account: "CSB Bank Rupay Credit Card - 55" })], [txn({})], accounts).size).toBe(0);
    // Self transfer from an account that isn't imported: attach to the credit in the receiving account.
    const self = entry({ kind: "SELF", account: "State Bank Of India - 70", payee: "Kotak Mahindra Bank - 3661" });
    expect(matchPaymentAppEntries([self], [txn({ accountId: "k1", direction: "CREDIT" })], accounts).get("e")).toBe("t");
  });
});

describe("categorizing with Paytm details", () => {
  const cat = (description: string, app: Parameters<typeof categorize>[0]["app"], direction: "DEBIT" | "CREDIT" = "DEBIT") =>
    categorize({ description, direction, amountPaise: 2_000_00, accountId: "a1", app }, testContext());
  it("maps spending-type tags to categories and ignores generic or personal ones", () => {
    expect(categoryForTags(["Money Transfer", "rapido both"])?.key).toBe("transport");
    expect(categoryForTags(["only me food"])?.key).toBe("food");
    expect(categoryForTags(["monthly FD"])?.key).toBe("invest-in");
    expect(categoryForTags(["Miscellaneous", "hisab", "Office", "Bill Payments"])).toBeUndefined();
  });
  it("uses your tag over a keyword in the note, and the payee's real name", () => {
    const r = cat("UPIOUT/600000000030/friend123@okaxis/Loan/0000", { kind: "PAID", payee: "Priya Nair", note: "Movie night", tags: ["drinks"] });
    expect(r).toMatchObject({ categoryId: "entertainment", needsReview: false, merchant: "Priya Nair" });
  });
  it("treats a Paytm self transfer as an own-account transfer", () => {
    expect(cat("UPIOUT/600000000031/9811111111@ptyes/Back/0000", { kind: "SELF", payee: "State Bank Of India - 5070", tags: [] }).categoryId).toBe("transfer");
  });
  it("applies keyword rules to your Paytm note", () => {
    expect(cat("UPIOUT/600000000040/9822222222@ptyes/NA/0000", { kind: "PAID", payee: "Ravi", note: "Rapido", tags: [] }).categoryId).toBe("transport");
  });
  it("uses the payee for payments carried by Paytm (QR codes, Paytm handles)", () => {
    expect(cat("UPIOUT/616724889233/paytmqr6vvbcj@ptys/Sent /5814", { kind: "PAID", payee: "Ekta Gurung", tags: [] }).merchant).toBe("Ekta Gurung");
    expect(cat("UPIOUT/629533562537/paytm.s33dr52@pty/Rapido/7692", { kind: "PAID", payee: "ARVIND", tags: [] }).merchant).toBe("Arvind");
  });
  it("keeps the bank's merchant name for known merchants", () => {
    expect(cat("UPIOUT/600000000041/swiggy.payu@hdfcbank/Food/5812", { kind: "PAID", payee: "Bundl Technologies", tags: [] }).merchant).toBe("Swiggy");
  });
});
