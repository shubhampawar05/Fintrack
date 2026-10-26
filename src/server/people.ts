import "server-only";
import { prisma } from "./db";
import { audit } from "./audit";
import { attributePeople, runLinking } from "./pipeline";
import { extractCounterparty } from "@/lib/categorize/counterparty";
import { personBalance, personNameKey, tagForCategory, tagToCategoryKey, type PersonTag } from "@/lib/finance/people";
import { dateToIso, isoToDate } from "@/lib/dates";
import { toPaise, type Paise } from "@/lib/money";

const txnSelect = {
  id: true, txnDate: true, direction: true, amountPaise: true, description: true, merchant: true, merchantOverride: true, merchantKey: true,
  personId: true, personSource: true, needsReview: true,
  category: { select: { id: true, name: true, key: true, kind: true } },
  account: { select: { displayName: true } },
} as const;

export interface PersonSummary {
  id: string;
  name: string;
  balance: Paise;
  openingBalancePaise: Paise;
  untaggedCount: number;
  untaggedPaise: Paise;
  txnCount: number;
}

async function ownedPerson(userId: string, personId: string) {
  const p = await prisma.person.findFirst({ where: { id: personId, userId } });
  if (!p) throw new Error("Person not found");
  return p;
}

/** Every person with a balance derived from their tagged transactions (balances are never stored). */
export async function listPeople(userId: string) {
  const [people, txns, first] = await Promise.all([
    prisma.person.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { userId, personId: { not: null } },
      select: { personId: true, direction: true, amountPaise: true, category: { select: { kind: true } } },
    }),
    prisma.transaction.findFirst({ where: { userId }, orderBy: { txnDate: "asc" }, select: { txnDate: true } }),
  ]);
  const byPerson = new Map<string, typeof txns>();
  for (const t of txns) byPerson.set(t.personId!, [...(byPerson.get(t.personId!) ?? []), t]);
  const rows: PersonSummary[] = people.map((p) => {
    const list = byPerson.get(p.id) ?? [];
    const b = personBalance(
      toPaise(p.openingBalancePaise),
      list.map((t) => ({ direction: t.direction, amountPaise: toPaise(t.amountPaise), categoryKind: t.category?.kind ?? "UNCLASSIFIED" })),
    );
    return { id: p.id, name: p.name, openingBalancePaise: toPaise(p.openingBalancePaise), txnCount: list.length, ...b };
  });
  rows.sort((a, b) => b.untaggedPaise - a.untaggedPaise || Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
  return {
    people: rows,
    owedToMe: rows.reduce((t, r) => t + Math.max(r.balance, 0), 0),
    iOwe: rows.reduce((t, r) => t + Math.max(-r.balance, 0), 0),
    firstDate: first ? dateToIso(first.txnDate) : null,
  };
}

/** One person's balance, linked counterparties and full history across accounts (oldest first). */
export async function getPerson(userId: string, personId: string) {
  const person = await ownedPerson(userId, personId);
  const [keys, txns, cardAccounts] = await Promise.all([
    prisma.personKey.findMany({ where: { personId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { userId, personId }, select: txnSelect, orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }] }),
    prisma.bankAccount.count({ where: { userId, accountType: "CREDIT_CARD", archived: false } }),
  ]);
  const labels = await prisma.transaction.findMany({
    where: { userId, merchantKey: { in: keys.map((k) => k.merchantKey) } },
    select: { merchantKey: true, merchant: true },
    orderBy: { txnDate: "desc" },
    distinct: ["merchantKey"],
  });
  const labelOf = new Map(labels.map((l) => [l.merchantKey, l.merchant]));
  const history = txns.map((t) => ({
    id: t.id,
    date: dateToIso(t.txnDate),
    direction: t.direction,
    amountPaise: toPaise(t.amountPaise),
    merchant: t.merchantOverride || t.merchant || t.description.slice(0, 40),
    description: t.description,
    account: t.account.displayName,
    categoryName: t.category?.name ?? "Unclassified",
    categoryKind: t.category?.kind ?? "UNCLASSIFIED",
    tag: tagForCategory(t.category?.kind ?? "UNCLASSIFIED", t.category?.key ?? null),
    needsReview: t.needsReview,
    personSource: t.personSource,
  }));
  return {
    person: { id: person.id, name: person.name, notes: person.notes, openingBalancePaise: toPaise(person.openingBalancePaise), openingAsOf: person.openingAsOf ? dateToIso(person.openingAsOf) : null },
    keys: keys.map((k) => ({ merchantKey: k.merchantKey, label: labelOf.get(k.merchantKey) ?? k.merchantKey })),
    history,
    cardsImported: cardAccounts > 0,
    ...personBalance(toPaise(person.openingBalancePaise), history),
  };
}

/**
 * Counterparties that look like people, with payments still to decide (unclassified, or a guess flagged
 * for review such as a "Loan" note) and no person yet — largest first.
 */
export async function topUntaggedPeople(userId: string, limit = 10) {
  const [linked, txns] = await Promise.all([
    prisma.personKey.findMany({ where: { userId }, select: { merchantKey: true } }),
    prisma.transaction.findMany({
      where: {
        userId, merchantKey: { not: null }, personId: null,
        OR: [{ category: { kind: "UNCLASSIFIED" } }, { categoryId: null }, { needsReview: true, categorizationMethod: { notIn: ["USER", "TRANSFER_MATCH", "REFUND_MATCH", "OWN_ACCOUNT"] } }],
      },
      select: { merchantKey: true, merchant: true, merchantOverride: true, description: true, amountPaise: true, direction: true, paymentAppEntry: { select: { kind: true } } },
    }),
  ]);
  const taken = new Set(linked.map((k) => k.merchantKey));
  const groups = new Map<string, { merchantKey: string; label: string; count: number; outPaise: Paise; inPaise: Paise }>();
  for (const t of txns) {
    if (taken.has(t.merchantKey!)) continue;
    const isPerson = extractCounterparty(t.description).isPerson || (t.paymentAppEntry !== null && t.paymentAppEntry.kind !== "SELF");
    if (!isPerson) continue;
    const g = groups.get(t.merchantKey!) ?? { merchantKey: t.merchantKey!, label: t.merchantOverride || t.merchant || t.merchantKey!, count: 0, outPaise: 0, inPaise: 0 };
    g.count++;
    if (t.direction === "DEBIT") g.outPaise += toPaise(t.amountPaise);
    else g.inPaise += toPaise(t.amountPaise);
    groups.set(t.merchantKey!, g);
  }
  return [...groups.values()].sort((a, b) => b.outPaise + b.inPaise - (a.outPaise + a.inPaise)).slice(0, limit);
}

/** The person each counterparty is linked to (for "Make a person" vs "Open person" in review lists). */
export async function personByKey(userId: string, merchantKeys: string[]) {
  const keys = await prisma.personKey.findMany({ where: { userId, merchantKey: { in: merchantKeys } }, select: { merchantKey: true, personId: true } });
  return new Map(keys.map((k) => [k.merchantKey, k.personId]));
}

export async function listPeopleOptions(userId: string) {
  return prisma.person.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

// ---------------------------------------------------------------------------------------------
// Changes. Each one is audited in the same database transaction as its write.

async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const clash = await prisma.person.findFirst({ where: { userId, nameKey: personNameKey(name), ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw new Error(`A person named "${clash.name}" already exists — link this counterparty to them instead.`);
}

/** Create a person from a counterparty and attribute all of that counterparty's transactions to them. */
export async function createPersonFromKey(userId: string, input: { name: string; merchantKey: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter a name.");
  await assertNameFree(userId, name);
  const existing = await prisma.personKey.findUnique({ where: { userId_merchantKey: { userId, merchantKey: input.merchantKey } }, include: { person: true } });
  if (existing) throw new Error(`This counterparty already belongs to ${existing.person.name}.`);
  const person = await prisma.$transaction(async (tx) => {
    const p = await tx.person.create({ data: { userId, name, nameKey: personNameKey(name), keys: { create: { userId, merchantKey: input.merchantKey } } } });
    await audit(tx, userId, "Person", p.id, "CREATE", null, { name, merchantKey: input.merchantKey });
    return p;
  });
  await attributePeople(userId);
  return person;
}

export class LinkedElsewhereError extends Error {
  constructor(public personName: string) {
    super(`This counterparty belongs to ${personName}. Confirm to move it.`);
  }
}

/**
 * Link another counterparty to a person. If it already belongs to someone else, `move` must be set;
 * then the link and its automatically attributed transactions move, and hand-attributed ones stay.
 */
export async function linkKey(userId: string, personId: string, merchantKey: string, move = false) {
  await ownedPerson(userId, personId);
  const existing = await prisma.personKey.findUnique({ where: { userId_merchantKey: { userId, merchantKey } }, include: { person: true } });
  if (existing?.personId === personId) return;
  if (existing && !move) throw new LinkedElsewhereError(existing.person.name);
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.personKey.update({ where: { id: existing.id }, data: { personId } });
      await audit(tx, userId, "PersonKey", existing.id, "MOVE", { personId: existing.personId, merchantKey }, { personId, merchantKey });
    } else {
      const k = await tx.personKey.create({ data: { userId, personId, merchantKey } });
      await audit(tx, userId, "PersonKey", k.id, "CREATE", null, { personId, merchantKey });
    }
  });
  await attributePeople(userId);
}

export async function unlinkKey(userId: string, personId: string, merchantKey: string) {
  await ownedPerson(userId, personId);
  const k = await prisma.personKey.findFirst({ where: { userId, personId, merchantKey } });
  if (!k) return;
  await prisma.$transaction(async (tx) => {
    await tx.personKey.delete({ where: { id: k.id } });
    await audit(tx, userId, "PersonKey", k.id, "DELETE", { personId, merchantKey }, null);
  });
  await attributePeople(userId);
}

export async function renamePerson(userId: string, personId: string, name: string) {
  const p = await ownedPerson(userId, personId);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Enter a name.");
  await assertNameFree(userId, clean, personId);
  await prisma.$transaction(async (tx) => {
    await tx.person.update({ where: { id: personId }, data: { name: clean, nameKey: personNameKey(clean) } });
    await audit(tx, userId, "Person", personId, "RENAME", { name: p.name }, { name: clean });
  });
}

/** Merge `fromId` into `intoId`: links, transactions and opening balance move; `fromId` is deleted. */
export async function mergePeople(userId: string, fromId: string, intoId: string) {
  if (fromId === intoId) throw new Error("Choose a different person to merge into.");
  const [from, into] = await Promise.all([ownedPerson(userId, fromId), ownedPerson(userId, intoId)]);
  await prisma.$transaction(async (tx) => {
    await tx.personKey.updateMany({ where: { personId: fromId }, data: { personId: intoId } });
    await tx.transaction.updateMany({ where: { userId, personId: fromId }, data: { personId: intoId } });
    await tx.person.update({ where: { id: intoId }, data: { openingBalancePaise: into.openingBalancePaise + from.openingBalancePaise } });
    await tx.person.delete({ where: { id: fromId } });
    await audit(tx, userId, "Person", fromId, "MERGE", { name: from.name }, { into: intoId, name: into.name });
  });
}

/** Delete a person: links and opening balance go; transactions keep their categories and lose the person. */
export async function deletePerson(userId: string, personId: string) {
  const p = await ownedPerson(userId, personId);
  await prisma.$transaction(async (tx) => {
    await tx.transaction.updateMany({ where: { userId, personId }, data: { personId: null, personSource: null } });
    await tx.person.delete({ where: { id: personId } });
    await audit(tx, userId, "Person", personId, "DELETE", { name: p.name, openingBalancePaise: p.openingBalancePaise }, null);
  });
}

export async function setOpeningBalance(userId: string, personId: string, openingBalancePaise: Paise, asOf: string | null) {
  const p = await ownedPerson(userId, personId);
  await prisma.$transaction(async (tx) => {
    await tx.person.update({ where: { id: personId }, data: { openingBalancePaise: BigInt(openingBalancePaise), openingAsOf: asOf ? isoToDate(asOf) : null } });
    await audit(
      tx, userId, "Person", personId, "OPENING_BALANCE",
      { openingBalancePaise: p.openingBalancePaise, openingAsOf: p.openingAsOf },
      { openingBalancePaise, openingAsOf: asOf },
    );
  });
}

/** Attribute transactions to a person by hand (or remove the person with null). Automatic linking never changes these. */
export async function assignPerson(userId: string, txnIds: string[], personId: string | null) {
  if (personId) await ownedPerson(userId, personId);
  const txns = await prisma.transaction.findMany({ where: { userId, id: { in: txnIds } }, select: { id: true, personId: true } });
  await prisma.$transaction(async (tx) => {
    await tx.transaction.updateMany({ where: { id: { in: txns.map((t) => t.id) } }, data: { personId, personSource: "USER" } });
    for (const t of txns) await audit(tx, userId, "Transaction", t.id, "ASSIGN_PERSON", { personId: t.personId }, { personId });
  });
  return txns.length;
}

/**
 * Record what person payments were. The tag sets the category as a user decision (never overwritten by
 * re-running rules) and creates no rule: one friend's payments vary between loans, card money and shares.
 */
export async function tagPersonTransactions(userId: string, txnIds: string[], tag: PersonTag, categoryId?: string) {
  const txns = await prisma.transaction.findMany({
    where: { userId, id: { in: txnIds } },
    select: { id: true, direction: true, personId: true, categoryId: true, category: { select: { kind: true } } },
  });
  if (txns.length !== new Set(txnIds).size) throw new Error("Transaction not found");
  const categories = await prisma.category.findMany({ where: { userId }, select: { id: true, key: true, kind: true } });
  const byKey = new Map(categories.map((c) => [c.key, c]));
  let chosen: (typeof categories)[number] | undefined;
  if (tag === "shared") {
    chosen = categories.find((c) => c.id === categoryId);
    if (!chosen || chosen.kind !== "EXPENSE") throw new Error("Choose a spending category for the shared expense.");
  }

  const target = new Map<string, string>();
  for (const t of txns) {
    if (!t.personId) throw new Error("Only payments with a person can be tagged here.");
    const r = tagToCategoryKey(tag, t.direction, t.category?.kind ?? "UNCLASSIFIED");
    if (!r.ok) throw new Error(r.error);
    const cat = r.categoryKey ? byKey.get(r.categoryKey) : chosen;
    if (!cat) throw new Error("Category not found");
    target.set(t.id, cat.id);
  }

  await prisma.$transaction(async (tx) => {
    for (const catId of new Set(target.values())) {
      const ids = [...target].filter(([, c]) => c === catId).map(([id]) => id);
      await tx.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId: catId, categorizationMethod: "USER", confidence: 1, needsReview: false } });
    }
    for (const t of txns) {
      await audit(tx, userId, "Transaction", t.id, "TAG_PERSON", { categoryId: t.categoryId, personId: t.personId }, { categoryId: target.get(t.id), personId: t.personId, tag });
    }
  });
  await runLinking(userId);
  return txns.length;
}
