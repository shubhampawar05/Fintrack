import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ensureUserDefaults } from "@/server/bootstrap";
import { commitImport, createPreview } from "@/server/imports";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { attributePeople } from "@/server/pipeline";
import {
  assignPerson, createPersonFromKey, deletePerson, getPerson, LinkedElsewhereError, linkKey, listPeople, mergePeople,
  setOpeningBalance, tagPersonTransactions, topUntaggedPeople, unlinkKey,
} from "@/server/people";
import { computeSummary } from "@/lib/finance/analytics";
import { personBalance } from "@/lib/finance/people";
import { toPaise } from "@/lib/money";

const fixture = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/statements", f)));
const YEAR = { from: "2026-01-01", to: "2026-12-31" };
const FRIEND = "friend123@okaxis";

let userId = "";
let accountId = "";
let n = 0;

/** A bank transaction from a person, inserted directly and attributed as the import pipeline would. */
async function personTxn(merchantKey: string, direction: "DEBIT" | "CREDIT", amountPaise: number, merchant = merchantKey) {
  const unclassified = await prisma.category.findFirstOrThrow({ where: { userId, key: "unclassified" } });
  n++;
  const t = await prisma.transaction.create({
    data: {
      userId, accountId, txnDate: new Date("2026-03-15"), description: `UPI IN/7000000000${n}/${merchantKey}/NA/0000`, amountPaise: BigInt(amountPaise),
      direction, merchantKey, merchant, categoryId: unclassified.id, categorizationMethod: "DEFAULT", needsReview: true, dedupeKey: `people-test-${n}`,
    },
  });
  await attributePeople(userId);
  return t;
}

const audits = (entity: string, entityId: string) => prisma.auditLog.count({ where: { userId, entity, entityId } });
const summary = async () => computeSummary(await getAnalyticsTxns(userId), YEAR, await getAnalyticsOptions(userId));

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `people-${Date.now()}@example.com`, name: "People" } });
  userId = user.id;
  await ensureUserDefaults(userId);
  accountId = (await prisma.bankAccount.create({ data: { userId, displayName: "Federal", bankName: "Federal" } })).id;
  const p = await createPreview({ userId, accountId, fileName: "f.pdf", bytes: fixture("federal-synthetic.pdf") });
  if (!p.ok) throw new Error(p.message);
  await commitImport(userId, p.importId);
});

describe("people and attribution", () => {
  it("suggests person counterparties that have no person yet", async () => {
    const top = await topUntaggedPeople(userId);
    expect(top.map((t) => t.merchantKey)).toContain(FRIEND);
  });

  it("creates a person from a counterparty and attributes its transactions", async () => {
    const p = await createPersonFromKey(userId, { name: "Ravi", merchantKey: FRIEND });
    const txns = await prisma.transaction.findMany({ where: { userId, merchantKey: FRIEND } });
    expect(txns.length).toBeGreaterThan(0);
    for (const t of txns) expect({ personId: t.personId, source: t.personSource }).toEqual({ personId: p.id, source: "AUTO" });
    expect(await audits("Person", p.id)).toBe(1);
    expect((await topUntaggedPeople(userId)).map((t) => t.merchantKey)).not.toContain(FRIEND);
  });

  it("rejects a duplicate name regardless of case", async () => {
    await expect(createPersonFromKey(userId, { name: "  ravi ", merchantKey: "someone@ybl" })).rejects.toThrow(/already exists/);
  });

  it("links a second counterparty to the same person", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    const t = await personTxn("ravi.alt@ybl", "CREDIT", 50_000);
    await linkKey(userId, ravi.id, "ravi.alt@ybl");
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } })).personId).toBe(ravi.id);
  });

  it("moves a linked counterparty only with confirmation, leaving hand-attributed rows in place", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    const other = await createPersonFromKey(userId, { name: "Mohan", merchantKey: "mohan@ybl" });
    const auto = await personTxn("ravi.alt@ybl", "DEBIT", 10_000);
    const manual = await personTxn("ravi.alt@ybl", "DEBIT", 20_000);
    await linkKey(userId, ravi.id, "ravi.alt@ybl");
    await assignPerson(userId, [manual.id], ravi.id);

    await expect(linkKey(userId, other.id, "ravi.alt@ybl")).rejects.toBeInstanceOf(LinkedElsewhereError);
    await linkKey(userId, other.id, "ravi.alt@ybl", true);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: auto.id } })).personId).toBe(other.id);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: manual.id } })).personId).toBe(ravi.id);

    await unlinkKey(userId, other.id, "ravi.alt@ybl");
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: auto.id } })).personId).toBeNull();
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: manual.id } })).personId).toBe(ravi.id);
  });
});

describe("tagging and balances", () => {
  it("a loan tag moves the balance and is neither income nor spending", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    const before = await summary();
    // The note "Loan" made the rules guess "Loan payments" (spending) at low confidence; tagging corrects it.
    const loan = await prisma.transaction.findFirstOrThrow({ where: { userId, merchantKey: FRIEND, direction: "DEBIT" }, include: { category: true } });
    expect({ key: loan.category?.key, review: loan.needsReview }).toEqual({ key: "loans", review: true });
    await tagPersonTransactions(userId, [loan.id], "loan");

    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: loan.id }, include: { category: true } });
    expect({ key: t.category?.key, method: t.categorizationMethod, review: t.needsReview }).toEqual({ key: "lending", method: "USER", review: false });
    expect(await audits("Transaction", loan.id)).toBeGreaterThanOrEqual(1);
    const after = await summary();
    expect([after.income, after.expenses]).toEqual([before.income, before.expenses - toPaise(loan.amountPaise)]);

    const detail = await getPerson(userId, ravi.id);
    const expected = personBalance(0, detail.history);
    expect(detail.balance).toBe(expected.balance);
    expect(detail.balance).toBe(toPaise(loan.amountPaise));
    const listed = (await listPeople(userId)).people.find((p) => p.id === ravi.id)!;
    expect(listed.balance).toBe(detail.balance);
  });

  it("a card repayment from a friend reduces card-bill spending", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    const credit = await personTxn("ravi.card@ybl", "CREDIT", 300_000);
    await linkKey(userId, ravi.id, "ravi.card@ybl");
    const before = await summary();
    await tagPersonTransactions(userId, [credit.id], "card");
    const after = await summary();
    expect(before.expenses - after.expenses).toBe(300_000);
    expect(after.income).toBe(before.income);
    // Card money doesn't change who owes whom.
    expect((await getPerson(userId, ravi.id)).balance).toBe(200_000);
  });

  it("a shared-expense credit lowers that category", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    const credit = await personTxn("ravi.card@ybl", "CREDIT", 120_000);
    await linkKey(userId, ravi.id, "ravi.card@ybl");
    const groceries = await prisma.category.findFirstOrThrow({ where: { userId, key: "groceries" } });
    const before = await summary();
    await tagPersonTransactions(userId, [credit.id], "shared", groceries.id);
    const after = await summary();
    expect(before.expenses - after.expenses).toBe(120_000);
  });

  it("refuses invalid tags", async () => {
    const debit = await prisma.transaction.findFirstOrThrow({ where: { userId, merchantKey: FRIEND, direction: "DEBIT" } });
    await expect(tagPersonTransactions(userId, [debit.id], "card")).rejects.toThrow(/received/);
    const transfer = await prisma.transaction.findFirstOrThrow({ where: { userId, category: { kind: "TRANSFER" } } });
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    await assignPerson(userId, [transfer.id], ravi.id);
    await expect(tagPersonTransactions(userId, [transfer.id], "loan")).rejects.toThrow(/own accounts/);
    await assignPerson(userId, [transfer.id], null);
    const groceries = await prisma.category.findFirstOrThrow({ where: { userId, key: "salary" } });
    await expect(tagPersonTransactions(userId, [debit.id], "shared", groceries.id)).rejects.toThrow(/spending category/);
  });

  it("starts from an opening balance", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    await setOpeningBalance(userId, ravi.id, 1_000_000, "2025-10-01");
    expect((await getPerson(userId, ravi.id)).balance).toBe(1_200_000);
    expect(await audits("Person", ravi.id)).toBe(2);
  });
});

describe("merging and deleting", () => {
  it("merges two people", async () => {
    const a = await createPersonFromKey(userId, { name: "Ann", merchantKey: "ann@ybl" });
    const b = await createPersonFromKey(userId, { name: "Ann Two", merchantKey: "ann2@ybl" });
    await setOpeningBalance(userId, a.id, 500, null);
    await setOpeningBalance(userId, b.id, 700, null);
    const t = await personTxn("ann2@ybl", "DEBIT", 1_000);
    await attributeCheck(t.id, b.id);
    await mergePeople(userId, b.id, a.id);
    expect(await prisma.person.findUnique({ where: { id: b.id } })).toBeNull();
    expect((await prisma.person.findUniqueOrThrow({ where: { id: a.id } })).openingBalancePaise).toBe(1_200n);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } })).personId).toBe(a.id);
    expect(await prisma.personKey.count({ where: { personId: a.id } })).toBe(2);
  });

  it("deleting a person removes links and opening balance but no transaction", async () => {
    const ravi = await prisma.person.findFirstOrThrow({ where: { userId, name: "Ravi" } });
    const txns = await prisma.transaction.findMany({ where: { userId, personId: ravi.id }, select: { id: true, categoryId: true } });
    const count = await prisma.transaction.count({ where: { userId } });
    await deletePerson(userId, ravi.id);
    expect(await prisma.personKey.count({ where: { personId: ravi.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId } })).toBe(count);
    const after = await prisma.transaction.findMany({ where: { id: { in: txns.map((t) => t.id) } }, select: { id: true, categoryId: true, personId: true } });
    for (const t of after) {
      expect(t.personId).toBeNull();
      expect(t.categoryId).toBe(txns.find((x) => x.id === t.id)!.categoryId);
    }
    expect(await audits("Person", ravi.id)).toBe(3);
  });
});

async function attributeCheck(txnId: string, personId: string) {
  expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txnId } })).personId).toBe(personId);
}
