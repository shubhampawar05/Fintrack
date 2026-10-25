import "server-only";
import type { CategorizationMethod, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { categorize, type CategorizeContext } from "@/lib/categorize/engine";
import { extractCounterparty, isOwnCounterparty } from "@/lib/categorize/counterparty";
import { findTransferMatches } from "@/lib/finance/transfers";
import { findRefundLinks } from "@/lib/finance/refunds";
import { detectRecurring } from "@/lib/finance/recurring";
import { matchPaymentAppEntries } from "@/lib/finance/payment-app";
import { dateToIso, isoToDate, todayIso } from "@/lib/dates";
import { toPaise } from "@/lib/money";

/** Methods that represent a human decision or a proven link — never overwritten automatically. */
export const LOCKED_METHODS: CategorizationMethod[] = ["USER", "TRANSFER_MATCH", "REFUND_MATCH"];

export async function loadCategorizeContext(userId: string): Promise<CategorizeContext> {
  const [rules, categories, settings] = await Promise.all([
    prisma.categorizationRule.findMany({ where: { userId, enabled: true } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, key: true } }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);
  const own = settings?.ownIdentifiers ?? [];
  return {
    rules: rules.map((r) => ({
      ...r,
      minAmountPaise: r.minAmountPaise === null ? null : toPaise(r.minAmountPaise),
      maxAmountPaise: r.maxAmountPaise === null ? null : toPaise(r.maxAmountPaise),
    })),
    categoryIdByKey: Object.fromEntries(categories.filter((c) => c.key).map((c) => [c.key!, c.id])),
    ownIdentifiers: own,
    holderNames: own.filter((s) => /^[a-z .]+$/i.test(s) && s.trim().includes(" ")),
  };
}

/** Re-run rules over transactions that were categorized automatically, then re-link. */
export async function recategorize(userId: string, opts: { ids?: string[] } = {}): Promise<number> {
  const changed = await applyCategorization(userId, opts);
  await runLinking(userId);
  return changed;
}

async function applyCategorization(userId: string, opts: { ids?: string[] } = {}): Promise<number> {
  const ctx = await loadCategorizeContext(userId);
  const txns = await prisma.transaction.findMany({
    where: { userId, categorizationMethod: { notIn: LOCKED_METHODS }, ...(opts.ids ? { id: { in: opts.ids } } : {}) },
    select: {
      id: true, description: true, direction: true, amountPaise: true, accountId: true, categoryId: true, merchant: true, merchantKey: true, confidence: true,
      paymentAppEntry: { select: { kind: true, payee: true, note: true, tags: true } },
    },
  });
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const t of txns) {
    const r = categorize(
      { description: t.description, direction: t.direction, amountPaise: toPaise(t.amountPaise), accountId: t.accountId, app: t.paymentAppEntry },
      ctx,
    );
    if (r.categoryId !== t.categoryId || r.merchant !== t.merchant || r.confidence !== t.confidence || r.merchantKey !== t.merchantKey) {
      updates.push(
        prisma.transaction.update({
          where: { id: t.id },
          data: { categoryId: r.categoryId, categorizationMethod: r.method, confidence: r.confidence, needsReview: r.needsReview, merchant: r.merchant, merchantKey: r.merchantKey },
        }),
      );
    }
  }
  for (let i = 0; i < updates.length; i += 200) await prisma.$transaction(updates.slice(i, i + 200));
  return updates.length;
}

/** Attach unlinked payment-app entries (Paytm) to their bank transactions. Returns the linked transaction ids. */
async function linkPaymentAppEntries(userId: string): Promise<string[]> {
  const entries = await prisma.paymentAppEntry.findMany({ where: { userId, transactionId: null } });
  if (!entries.length) return [];
  const [txns, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, bankRef: { in: [...new Set(entries.map((e) => e.upiRef))] }, paymentAppEntry: null },
      select: { id: true, accountId: true, bankRef: true, direction: true, amountPaise: true },
    }),
    prisma.bankAccount.findMany({ where: { userId }, select: { id: true, bankName: true, accountLast4: true } }),
  ]);
  const pairs = matchPaymentAppEntries(
    entries.map((e) => ({ ...e, amountPaise: toPaise(e.amountPaise) })),
    txns.map((t) => ({ ...t, amountPaise: toPaise(t.amountPaise) })),
    accounts,
  );
  const ops = [...pairs].map(([entryId, transactionId]) => prisma.paymentAppEntry.update({ where: { id: entryId }, data: { transactionId } }));
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));
  return [...pairs.values()];
}

/** Refund linking, internal-transfer matching and recurring detection over all of a user's data. */
export async function runLinking(userId: string): Promise<{ refunds: number; transfers: number; recurring: number }> {
  const [categories, settings] = await Promise.all([
    prisma.category.findMany({ where: { userId } }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const refundCat = categories.find((c) => c.key === "refund")!;
  const transferCat = categories.find((c) => c.key === "transfer")!;
  const own = settings?.ownIdentifiers ?? [];

  // 0) Payment-app details (payee, note, tags) can change how a transaction is categorized.
  const appLinked = await linkPaymentAppEntries(userId);
  if (appLinked.length) await applyCategorization(userId, { ids: appLinked });

  const load = () =>
    prisma.transaction.findMany({
      where: { userId },
      select: {
        id: true, accountId: true, txnDate: true, direction: true, amountPaise: true, description: true, bankRef: true,
        merchantKey: true, merchant: true, merchantOverride: true, categoryId: true, categorizationMethod: true, refundOfId: true,
        paymentAppEntry: { select: { kind: true } },
      },
      orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
    });

  // 1) Refunds & reversals
  let txns = await load();
  const links = findRefundLinks(
    txns.map((t) => ({
      id: t.id, accountId: t.accountId, date: dateToIso(t.txnDate), direction: t.direction, amountPaise: toPaise(t.amountPaise),
      description: t.description, bankRef: t.bankRef, merchantKey: t.merchantKey,
      isReversalNarration: extractCounterparty(t.description).isReversal, refundOfId: t.refundOfId,
    })),
  );
  const txById = new Map(txns.map((t) => [t.id, t]));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const l of links) {
    const refund = txById.get(l.refundId)!;
    const original = txById.get(l.originalId)!;
    const refundLocked = refund.categorizationMethod === "USER";
    ops.push(
      prisma.transaction.update({
        where: { id: refund.id },
        data: {
          refundOfId: original.id,
          ...(refundLocked ? {} : { categoryId: refundCat.id, categorizationMethod: "REFUND_MATCH", confidence: 0.95, needsReview: false }),
        },
      }),
    );
    // A reversed non-expense (e.g. a failed transfer) nets to zero: mark the original too.
    const origKind = original.categoryId ? byId.get(original.categoryId)?.kind : "UNCLASSIFIED";
    if (origKind !== "EXPENSE" && origKind !== "CREDIT_CARD_PAYMENT" && original.categorizationMethod !== "USER" && toPaise(original.amountPaise) === toPaise(refund.amountPaise)) {
      ops.push(
        prisma.transaction.update({
          where: { id: original.id },
          data: { categoryId: refundCat.id, categorizationMethod: "REFUND_MATCH", confidence: 0.95, needsReview: false },
        }),
      );
    }
  }
  if (ops.length) await prisma.$transaction(ops);

  // 2) Internal transfers between tracked accounts
  txns = await load();
  const existing = await prisma.internalTransfer.findMany({ where: { userId } });
  const paired = new Set(existing.filter((e) => e.status !== "REJECTED").flatMap((e) => [e.debitTxnId, e.creditTxnId]));
  const rejected = existing.filter((e) => e.status === "REJECTED").map((e) => ({ debitId: e.debitTxnId, creditId: e.creditTxnId }));
  const matches = findTransferMatches(
    txns
      .filter((t) => !paired.has(t.id))
      .map((t) => ({
        id: t.id, accountId: t.accountId, date: dateToIso(t.txnDate), direction: t.direction, amountPaise: toPaise(t.amountPaise),
        bankRef: t.bankRef, kind: (t.categoryId && byId.get(t.categoryId)?.kind) || "UNCLASSIFIED",
        ownCounterparty: isOwnCounterparty(extractCounterparty(t.description), own) || t.paymentAppEntry?.kind === "SELF",
        userLocked: t.categorizationMethod === "USER",
      })),
    settings?.transferWindowDays ?? 3,
    rejected,
  );
  const tOps: Prisma.PrismaPromise<unknown>[] = [];
  for (const m of matches) {
    tOps.push(
      prisma.internalTransfer.create({
        data: { userId, debitTxnId: m.debitId, creditTxnId: m.creditId, status: m.status, confidence: m.confidence, reason: m.reason, decidedAt: m.status === "CONFIRMED" ? new Date() : null },
      }),
    );
    if (m.status === "CONFIRMED") {
      tOps.push(
        prisma.transaction.updateMany({
          where: { id: { in: [m.debitId, m.creditId] }, categorizationMethod: { not: "USER" } },
          data: { categoryId: transferCat.id, categorizationMethod: "TRANSFER_MATCH", confidence: m.confidence, needsReview: false, merchant: "Own account" },
        }),
      );
    }
  }
  if (tOps.length) await prisma.$transaction(tOps);

  // 3) Recurring payments
  const recurringCount = await refreshRecurring(userId);
  return { refunds: links.length, transfers: matches.length, recurring: recurringCount };
}

export async function refreshRecurring(userId: string): Promise<number> {
  const [txns, categories, current] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      select: { id: true, txnDate: true, direction: true, amountPaise: true, merchantKey: true, merchant: true, merchantOverride: true, categoryId: true },
    }),
    prisma.category.findMany({ where: { userId } }),
    prisma.recurringTransaction.findMany({ where: { userId } }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const suggestions = detectRecurring(
    txns.map((t) => {
      const c = t.categoryId ? byId.get(t.categoryId) : undefined;
      return {
        id: t.id, date: dateToIso(t.txnDate), direction: t.direction, amountPaise: toPaise(t.amountPaise),
        merchantKey: t.merchantKey, merchant: t.merchantOverride || t.merchant || "Unknown",
        categoryKey: c?.key ?? null, categoryKind: c?.kind ?? "UNCLASSIFIED",
      };
    }),
    todayIso(),
  );
  const bySig = new Map(current.map((r) => [r.signature, r]));
  for (const s of suggestions) {
    const prev = bySig.get(s.signature);
    if (prev?.status === "REJECTED") continue; // dismissed by the user
    const catId = txns.find((t) => t.id === s.transactionIds[0])?.categoryId ?? null;
    const data = {
      label: prev?.status === "CONFIRMED" ? prev.label : s.label,
      merchantKey: s.merchantKey, direction: s.direction, frequency: s.frequency,
      kind: prev?.status === "CONFIRMED" ? prev.kind : s.kind,
      typicalAmountPaise: BigInt(s.typicalAmountPaise), minAmountPaise: BigInt(s.minAmountPaise), maxAmountPaise: BigInt(s.maxAmountPaise),
      occurrences: s.occurrences, firstDate: isoToDate(s.firstDate), lastDate: isoToDate(s.lastDate),
      nextExpectedDate: s.nextExpectedDate ? isoToDate(s.nextExpectedDate) : null, confidence: s.confidence,
      categoryId: prev?.categoryId ?? catId,
    };
    const rec = await prisma.recurringTransaction.upsert({
      where: { userId_signature: { userId, signature: s.signature } },
      update: data,
      create: { userId, signature: s.signature, ...data },
    });
    await prisma.transaction.updateMany({ where: { userId, id: { in: s.transactionIds } }, data: { recurringId: rec.id } });
  }
  return suggestions.length;
}
