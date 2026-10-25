import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ensureUserDefaults } from "@/server/bootstrap";
import { commitImport, createPreview, deleteImport, setRowsExcluded } from "@/server/imports";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { computeSummary } from "@/lib/finance/analytics";
import { deletePaymentAppImport, importPaymentAppStatement } from "@/server/payment-app";

const dir = path.join(__dirname, "../fixtures/statements");
const file = (f: string) => new Uint8Array(readFileSync(path.join(dir, f)));

let userId = "";
const acct: Record<string, string> = {};

async function importFile(account: string, f: string) {
  const p = await createPreview({ userId, accountId: acct[account], fileName: f, bytes: file(f) });
  if (!p.ok) throw new Error(p.message);
  return { importId: p.importId, ...(await commitImport(userId, p.importId)) };
}

async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

beforeAll(async () => {
  await resetDb();
  const user = await prisma.user.create({ data: { email: "test@example.com", name: "Test" } });
  userId = user.id;
  await ensureUserDefaults(userId);
  for (const [key, bank] of [["kotak", "Kotak"], ["federal", "Federal"], ["bom", "BoM"]]) {
    acct[key] = (await prisma.bankAccount.create({ data: { userId, displayName: key, bankName: bank } })).id;
  }
});

describe("statement import pipeline", () => {
  it("imports all three banks with reconciled balances", async () => {
    expect(await importFile("kotak", "kotak-synthetic.pdf")).toMatchObject({ imported: 17, duplicates: 0 });
    expect(await importFile("federal", "federal-synthetic.pdf")).toMatchObject({ imported: 11, duplicates: 0 });
    expect(await importFile("bom", "bom-synthetic.pdf")).toMatchObject({ imported: 7, duplicates: 0 });
    const imports = await prisma.statementImport.findMany({ where: { userId } });
    expect(imports.every((i) => i.balanceCheck === "PASSED" && i.status === "COMMITTED")).toBe(true);
    const kotak = await prisma.bankAccount.findUniqueOrThrow({ where: { id: acct.kotak } });
    expect(kotak.accountLast4).toBe("2233");
    expect(kotak.openingBalancePaise).toBe(50_000_00n);
  });

  it("preserves the original imported rows", async () => {
    const raw = await prisma.importedTransaction.count({ where: { import: { userId } } });
    expect(raw).toBe(35);
  });

  it("refuses to import the exact same file twice", async () => {
    const p = await createPreview({ userId, accountId: acct.kotak, fileName: "again.pdf", bytes: file("kotak-synthetic.pdf") });
    expect(p).toMatchObject({ ok: false, code: "ALREADY_IMPORTED" });
  });

  it("skips overlapping rows but keeps legitimate identical repeats", async () => {
    const p = await createPreview({ userId, accountId: acct.federal, fileName: "overlap.pdf", bytes: file("federal-synthetic-overlap.pdf") });
    if (!p.ok) throw new Error(p.message);
    const preview = await prisma.statementImport.findUniqueOrThrow({ where: { id: p.importId } });
    expect(preview.rowsDuplicate).toBe(2);
    const result = await commitImport(userId, p.importId);
    expect(result).toMatchObject({ imported: 2, duplicates: 2 });
    const swiggyApril = await prisma.transaction.count({ where: { accountId: acct.federal, amountPaise: 640_00n } });
    expect(swiggyApril).toBe(2);
  });

  it("is idempotent when a commit is retried", async () => {
    const imp = await prisma.statementImport.findFirstOrThrow({ where: { userId, fileName: "overlap.pdf" } });
    const before = await prisma.transaction.count({ where: { userId } });
    expect(await commitImport(userId, imp.id)).toMatchObject({ alreadyCommitted: true });
    expect(await prisma.transaction.count({ where: { userId } })).toBe(before);
  });

  it("confirms transfers between own accounts by UPI reference", async () => {
    const transfers = await prisma.internalTransfer.findMany({ where: { userId }, include: { debitTxn: true, creditTxn: true } });
    const confirmed = transfers.filter((t) => t.status === "CONFIRMED");
    expect(confirmed.map((t) => Number(t.debitTxn.amountPaise)).sort()).toEqual([15_000_00, 20_000_00]);
    for (const t of confirmed) expect(t.debitTxn.accountId).not.toBe(t.creditTxn.accountId);
  });

  it("links refunds and reversals to their originals", async () => {
    const refunds = await prisma.transaction.findMany({ where: { userId, refundOfId: { not: null } }, include: { refundOf: true } });
    expect(refunds.map((r) => r.description).sort()).toEqual([
      "UPI REFUND RRC 600000000024",
      "UPI/BLINKIT/YESB/600000000011/Refund",
      "UPIR 600000000050UPIDEBITREV",
    ]);
  });

  it("detects monthly recurring payments only with enough evidence", async () => {
    const rec = await prisma.recurringTransaction.findMany({ where: { userId } });
    const labels = rec.map((r) => `${r.label}:${r.frequency}`).sort();
    expect(labels).toEqual(["Acme Technologies Pvt Ltd:MONTHLY", "Netflix:MONTHLY", "Ramesh Kumar:MONTHLY"]);
    expect(rec.every((r) => r.occurrences >= 3)).toBe(true);
  });

  it("produces Q1 totals that match an independent hand calculation", async () => {
    const txns = await getAnalyticsTxns(userId);
    const opts = await getAnalyticsOptions(userId);
    expect(opts.ccPaymentsAsExpense).toBe(true); // no card statements imported
    const s = computeSummary(txns, { from: "2026-01-01", to: "2026-03-31" }, opts);
    // Income: 3 × ₹85,000 salary + ₹42 interest.
    expect(s.income).toBe(255_042_00);
    // Expenses: rent 54,000 + groceries (900 − 450 refund + 300 − 300 refund) + Netflix 1,947 + family 5,000
    //         + Swiggy 1,250.50 + CRED bill 5,000 + Jio 799 + charges (590 + 4.20 + 0.75)
    //         + 2,000 friend payment noted "Loan" (tentatively a loan payment, flagged for review).
    expect(s.expenses).toBe(54_000_00 + 450_00 + 1_947_00 + 5_000_00 + 1_250_50 + 5_000_00 + 799_00 + 590_00 + 4_20 + 75 + 2_000_00);
    const loanNote = await prisma.transaction.findFirstOrThrow({ where: { userId, description: { contains: "friend123" } } });
    expect(loanNote.needsReview).toBe(true);
    expect(s.savings).toBe(s.income - s.expenses);
    // Investments are separate: Groww 10,000 + MF 5,000.
    expect(s.investmentsIn).toBe(15_000_00);
    expect(s.cashWithdrawals).toBe(2_000_00);
    // Unclassified person payments are excluded and surfaced: Ravi 3,000.
    expect(s.unclassifiedOut).toBe(3_000_00);
  });

  it("adds Paytm payee names, notes and tags by UPI reference without changing totals", async () => {
    const options = await getAnalyticsOptions(userId);
    const before = computeSummary(await getAnalyticsTxns(userId), { from: "2026-01-01", to: "2026-03-31" }, options);
    const r = await importPaymentAppStatement({ userId, fileName: "paytm.pdf", bytes: file("paytm-synthetic.pdf") });
    // Tea Stall was paid by credit card (not imported); the gold-coin entry has no UPI reference.
    expect(r).toMatchObject({ ok: true, entries: 4, linked: 3, unlinked: 1 });
    const priya = await prisma.transaction.findFirstOrThrow({ where: { accountId: acct.federal, bankRef: "600000000030" }, include: { category: true } });
    expect(priya).toMatchObject({ merchant: "Priya Nair", needsReview: false });
    expect(priya.category?.key).toBe("entertainment");
    const after = computeSummary(await getAnalyticsTxns(userId), { from: "2026-01-01", to: "2026-03-31" }, options);
    expect(after.totalDebits).toBe(before.totalDebits);
    expect(after.totalCredits).toBe(before.totalCredits);

    // Uploading the same history again replaces it rather than duplicating it.
    await importPaymentAppStatement({ userId, fileName: "paytm-again.pdf", bytes: file("paytm-synthetic.pdf") });
    expect(await prisma.paymentAppEntry.count({ where: { userId } })).toBe(4);
    const imports = await prisma.paymentAppImport.findMany({ where: { userId } });
    expect(imports).toHaveLength(1);

    // Removing it takes the details away again.
    await deletePaymentAppImport(userId, imports[0].id);
    const reverted = await prisma.transaction.findUniqueOrThrow({ where: { id: priya.id }, include: { category: true } });
    expect(reverted.category?.key).not.toBe("entertainment");
    expect(reverted.merchant).not.toBe("Priya Nair");
  });

  it("can exclude rows in preview", async () => {
    await prisma.bankAccount.create({ data: { userId, displayName: "csv", bankName: "Synthetic" } }).then((a) => (acct.csv = a.id));
    const p = await createPreview({ userId, accountId: acct.csv, fileName: "generic-bank.csv", bytes: file("generic-bank.csv") });
    if (!p.ok) throw new Error(p.message);
    const rows = await prisma.importedTransaction.findMany({ where: { importId: p.importId }, orderBy: { rowIndex: "asc" } });
    expect(rows.filter((r) => r.status === "REJECTED")).toHaveLength(1);
    await setRowsExcluded(userId, p.importId, [rows[0].id], true);
    expect(await commitImport(userId, p.importId)).toMatchObject({ imported: 4 });
  });

  it("deletes an import with or without its transactions", async () => {
    const imp = await prisma.statementImport.findFirstOrThrow({ where: { userId, fileName: "generic-bank.csv" } });
    expect(await deleteImport(userId, imp.id, true)).toEqual({ transactionsDeleted: 4 });
    expect(await prisma.importedTransaction.count({ where: { importId: imp.id } })).toBe(0);
    const bom = await prisma.statementImport.findFirstOrThrow({ where: { userId, accountId: acct.bom } });
    await deleteImport(userId, bom.id, false);
    expect(await prisma.transaction.count({ where: { accountId: acct.bom } })).toBe(7);
  });

  it("enforces ownership: another user cannot touch these imports", async () => {
    const other = await prisma.user.create({ data: { email: "other@example.com", name: "Other" } });
    const imp = await prisma.statementImport.findFirstOrThrow({ where: { userId } });
    await expect(commitImport(other.id, imp.id)).rejects.toThrow(/not found/);
    await expect(deleteImport(other.id, imp.id, true)).rejects.toThrow(/not found/);
    await expect(createPreview({ userId: other.id, accountId: acct.kotak, fileName: "x.pdf", bytes: file("kotak-synthetic.pdf") })).rejects.toThrow(/not found/);
  });
});
