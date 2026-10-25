import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { loadCategorizeContext, runLinking } from "./pipeline";
import { parseStatement, ParseError, type ColumnMapping, type ParseResult, type ParsedRow } from "@/lib/parsing";
import { parseTabular } from "@/lib/parsing";
import { validateRow } from "@/lib/parsing/validate";
import { assignDedupeKeys, sha256Hex } from "@/lib/finance/dedupe";
import { categorize } from "@/lib/categorize/engine";
import { extractCounterparty } from "@/lib/categorize/counterparty";
import { dateToIso, isoToDate } from "@/lib/dates";
import { toPaise } from "@/lib/money";

export type PreviewOutcome =
  | { ok: true; importId: string }
  | { ok: false; code: "ALREADY_IMPORTED"; importId: string; message: string }
  | { ok: false; code: string; message: string };

async function ownedAccount(userId: string, accountId: string) {
  const account = await prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new Error("Account not found");
  return account;
}

function toRowData(importId: string, r: ParsedRow): Prisma.ImportedTransactionCreateManyInput {
  return {
    importId,
    rowIndex: r.rowIndex,
    page: r.page ?? null,
    raw: r.raw,
    txnDate: r.txnDate ? isoToDate(r.txnDate) : null,
    valueDate: r.valueDate ? isoToDate(r.valueDate) : null,
    description: r.description,
    reference: r.reference ?? null,
    amountPaise: r.amountPaise === null ? null : BigInt(r.amountPaise),
    direction: r.direction,
    balancePaise: r.balancePaise == null ? null : BigInt(r.balancePaise),
    errors: r.errors,
    warnings: r.warnings,
    status: r.errors.length ? "REJECTED" : "PENDING",
  };
}

/** Never persist full account numbers: keep the last four digits only. */
function sanitizeMeta(result: ParseResult) {
  const { accountNumber, holderMobile, ...rest } = result.meta;
  return { ...rest, accountLast4: accountNumber?.slice(-4), holderMobileLast4: holderMobile?.slice(-4) };
}

/** Parse an uploaded statement into a persisted preview. The file itself is never stored. */
export async function createPreview(input: {
  userId: string;
  accountId: string;
  fileName: string;
  bytes: Uint8Array;
  password?: string;
}): Promise<PreviewOutcome> {
  const account = await ownedAccount(input.userId, input.accountId);
  const fileHash = sha256Hex(input.bytes);
  const committed = await prisma.statementImport.findFirst({
    where: { accountId: account.id, fileHash, status: "COMMITTED" },
  });
  if (committed) {
    return { ok: false, code: "ALREADY_IMPORTED", importId: committed.id, message: "This exact file was already imported into this account." };
  }

  let result: ParseResult;
  try {
    result = await parseStatement({
      bytes: input.bytes,
      fileName: input.fileName,
      password: input.password,
      mapping: (account.columnMapping as ColumnMapping | null) ?? undefined,
    });
  } catch (e) {
    if (e instanceof ParseError) {
      if (e.code !== "PASSWORD_REQUIRED" && e.code !== "PASSWORD_INCORRECT") {
        await prisma.statementImport.create({
          data: {
            userId: input.userId, accountId: account.id, fileName: input.fileName, fileHash, fileType: "UNKNOWN",
            fileSize: input.bytes.byteLength, parserId: "none", parserVersion: "0", status: "FAILED", errors: [e.message],
          },
        });
      }
      return { ok: false, code: e.code, message: e.message };
    }
    throw e;
  }

  const warnings = [...result.warnings];
  const last4 = result.meta.accountNumber?.slice(-4);
  if (last4 && account.accountLast4 && last4 !== account.accountLast4) {
    warnings.unshift(`This statement is for account ending ${last4}, but "${account.displayName}" ends with ${account.accountLast4}. Check you picked the right account.`);
  }
  const bankWord = (b: string) => b.toLowerCase().replace(/\b(bank|of|the|ltd|limited)\b/g, "").trim().split(/\s+/)[0] ?? "";
  if (result.meta.bankName && bankWord(result.meta.bankName) && !account.bankName.toLowerCase().includes(bankWord(result.meta.bankName))) {
    warnings.unshift(`This looks like a ${result.meta.bankName} statement, but you're importing it into "${account.displayName}" (${account.bankName}). Check you picked the right account.`);
  }
  if (last4) {
    const other = await prisma.bankAccount.findFirst({ where: { userId: input.userId, accountLast4: last4, id: { not: account.id } } });
    if (other) warnings.unshift(`Account ending ${last4} is already set up as "${other.displayName}". Did you mean to import it there?`);
  }

  // Discard any earlier unfinished preview of the same file.
  await prisma.statementImport.deleteMany({ where: { accountId: account.id, fileHash, status: "PREVIEW" } });

  const imp = await prisma.statementImport.create({
    data: {
      userId: input.userId,
      accountId: account.id,
      fileName: input.fileName.slice(0, 200),
      fileHash,
      fileType: result.fileType,
      fileSize: input.bytes.byteLength,
      parserId: result.parserId,
      parserVersion: result.parserVersion,
      status: result.needsOcr ? "FAILED" : "PREVIEW",
      periodStart: result.meta.periodStart ? isoToDate(result.meta.periodStart) : null,
      periodEnd: result.meta.periodEnd ? isoToDate(result.meta.periodEnd) : null,
      statementDate: result.meta.statementDate ? isoToDate(result.meta.statementDate) : null,
      openingBalancePaise: result.meta.openingBalancePaise != null ? BigInt(result.meta.openingBalancePaise) : null,
      closingBalancePaise: result.meta.closingBalancePaise != null ? BigInt(result.meta.closingBalancePaise) : null,
      balanceCheck: result.balanceCheck.status,
      rowsTotal: result.rows.length,
      rowsRejected: result.rows.filter((r) => r.errors.length).length,
      warnings,
      errors: result.errors,
      meta: sanitizeMeta(result),
      rawTable: result.table ? (result.table as unknown as Prisma.InputJsonValue) : undefined,
      columnMapping: result.mapping ? (result.mapping as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  if (result.rows.length) {
    await prisma.importedTransaction.createMany({ data: result.rows.map((r) => toRowData(imp.id, r)) });
  }
  await markPreviewDuplicates(imp.id);
  // Holder identity is used only to recognise transfers between your own accounts.
  await rememberOwnIdentity(input.userId, result.meta.holderName, result.meta.holderMobile);
  return { ok: true, importId: imp.id };
}

async function rememberOwnIdentity(userId: string, name?: string, mobile?: string) {
  const s = await prisma.userSettings.findUnique({ where: { userId } });
  if (!s) return;
  const ids = new Set(s.ownIdentifiers.map((x) => x.toUpperCase()));
  // Only plausible personal names and 10-digit mobiles; never statement labels.
  const okName = name && /^[A-Za-z .]{4,60}$/.test(name.trim()) && name.trim().includes(" ") && !/account|branch|statement|type|savings|balance|customer/i.test(name) ? name.trim() : undefined;
  const okMobile = mobile && /^\d{10}$/.test(mobile.trim()) ? mobile.trim() : undefined;
  const add = [okName, okMobile].filter((x): x is string => !!x && !ids.has(x.toUpperCase()));
  if (add.length) {
    await prisma.userSettings.update({ where: { userId }, data: { ownIdentifiers: [...s.ownIdentifiers, ...add.map((x) => (/\d/.test(x) ? x : x.toUpperCase()))] } });
  }
}

/** Valid rows in statement order with their dedupe keys. */
async function keyedRows(importId: string) {
  const rows = await prisma.importedTransaction.findMany({ where: { importId }, orderBy: { rowIndex: "asc" } });
  const valid = rows.filter((r) => r.errors.length === 0 && r.txnDate && r.amountPaise !== null && r.direction);
  const keys = assignDedupeKeys(
    valid.map((r) => ({
      txnDate: dateToIso(r.txnDate!), direction: r.direction!, amountPaise: toPaise(r.amountPaise), description: r.description, reference: r.reference,
    })),
  );
  return { rows, valid: valid.map((r, i) => ({ row: r, key: keys[i] })) };
}

/**
 * Find rows already present in the account: exact dedupe key, or (when no key match) the same
 * date + amount + direction + running balance, which catches the same statement exported in
 * a different format. Legit repeated payments differ in running balance, so they stay distinct.
 */
async function findDuplicates(accountId: string, valid: Awaited<ReturnType<typeof keyedRows>>["valid"]) {
  const existing = await prisma.transaction.findMany({
    where: { accountId, OR: [{ dedupeKey: { in: valid.map((v) => v.key) } }, { txnDate: { in: [...new Set(valid.map((v) => v.row.txnDate!))] } }] },
    select: { id: true, dedupeKey: true, txnDate: true, amountPaise: true, direction: true, balanceAfterPaise: true },
  });
  const byKey = new Map(existing.map((e) => [e.dedupeKey, e.id]));
  const used = new Set<string>();
  const dup = new Map<string, string>();
  for (const v of valid) {
    let match = byKey.get(v.key);
    if (!match && v.row.balancePaise !== null) {
      match = existing.find(
        (e) =>
          !used.has(e.id) &&
          e.txnDate.getTime() === v.row.txnDate!.getTime() &&
          e.amountPaise === v.row.amountPaise &&
          e.direction === v.row.direction &&
          e.balanceAfterPaise !== null &&
          e.balanceAfterPaise === v.row.balancePaise,
      )?.id;
    }
    if (match) {
      used.add(match);
      dup.set(v.row.id, match);
    }
  }
  return dup;
}

async function markPreviewDuplicates(importId: string) {
  const imp = await prisma.statementImport.findUniqueOrThrow({ where: { id: importId } });
  const { valid } = await keyedRows(importId);
  const dup = await findDuplicates(imp.accountId, valid);
  await prisma.$transaction([
    prisma.importedTransaction.updateMany({ where: { importId, status: "DUPLICATE" }, data: { status: "PENDING", duplicateOfId: null } }),
    ...[...dup.entries()].map(([rowId, txnId]) =>
      prisma.importedTransaction.update({ where: { id: rowId }, data: { status: "DUPLICATE", duplicateOfId: txnId } }),
    ),
  ]);
  await prisma.statementImport.update({ where: { id: importId }, data: { rowsDuplicate: dup.size } });
}

async function ownedPreview(userId: string, importId: string) {
  const imp = await prisma.statementImport.findFirst({ where: { id: importId, userId } });
  if (!imp) throw new Error("Import not found");
  if (imp.status !== "PREVIEW") throw new Error("This import is no longer editable.");
  return imp;
}

export async function updatePreviewRow(
  userId: string,
  importId: string,
  rowId: string,
  patch: { txnDate: string; description: string; amountPaise: number; direction: "DEBIT" | "CREDIT" },
) {
  await ownedPreview(userId, importId);
  const row = await prisma.importedTransaction.findFirstOrThrow({ where: { id: rowId, importId } });
  const draft: ParsedRow = {
    rowIndex: row.rowIndex, txnDate: patch.txnDate, description: patch.description, amountPaise: patch.amountPaise,
    direction: patch.direction, raw: {}, errors: [], warnings: [],
  };
  validateRow(draft);
  await prisma.importedTransaction.update({
    where: { id: rowId },
    data: {
      txnDate: isoToDate(patch.txnDate), description: patch.description, amountPaise: BigInt(patch.amountPaise), direction: patch.direction,
      errors: draft.errors, edited: true,
      status: draft.errors.length ? "REJECTED" : row.status === "EXCLUDED" ? "EXCLUDED" : "PENDING",
      // The original running balance no longer applies to an edited row.
      warnings: [...row.warnings.filter((w) => !w.startsWith("Edited")), "Edited manually in preview"],
    },
  });
  await refreshCounts(importId);
  await markPreviewDuplicates(importId);
}

export async function setRowsExcluded(userId: string, importId: string, rowIds: string[], excluded: boolean) {
  await ownedPreview(userId, importId);
  await prisma.importedTransaction.updateMany({
    where: { importId, id: { in: rowIds }, status: excluded ? { in: ["PENDING", "DUPLICATE"] } : "EXCLUDED" },
    data: { status: excluded ? "EXCLUDED" : "PENDING" },
  });
  if (!excluded) await markPreviewDuplicates(importId);
  await refreshCounts(importId);
}

async function refreshCounts(importId: string) {
  const counts = await prisma.importedTransaction.groupBy({ by: ["status"], where: { importId }, _count: true });
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  await prisma.statementImport.update({
    where: { id: importId },
    data: { rowsRejected: c("REJECTED"), rowsExcluded: c("EXCLUDED"), rowsDuplicate: c("DUPLICATE") },
  });
}

/** Re-parse a CSV/XLSX preview with a corrected column mapping (no re-upload needed). */
export async function remapPreview(userId: string, importId: string, mapping: ColumnMapping) {
  const imp = await ownedPreview(userId, importId);
  const table = imp.rawTable as { rows: string[][] } | null;
  if (!table || (imp.fileType !== "CSV" && imp.fileType !== "XLSX")) throw new Error("Only CSV/XLSX imports can be remapped.");
  const result = parseTabular(imp.fileType, table.rows, mapping);
  await prisma.$transaction([
    prisma.importedTransaction.deleteMany({ where: { importId } }),
    prisma.importedTransaction.createMany({ data: result.rows.map((r) => toRowData(importId, r)) }),
    prisma.statementImport.update({
      where: { id: importId },
      data: {
        columnMapping: mapping as unknown as Prisma.InputJsonValue, errors: result.errors, warnings: result.warnings,
        rowsTotal: result.rows.length, rowsRejected: result.rows.filter((r) => r.errors.length).length,
        balanceCheck: result.balanceCheck.status,
        openingBalancePaise: result.meta.openingBalancePaise != null ? BigInt(result.meta.openingBalancePaise) : null,
        closingBalancePaise: result.meta.closingBalancePaise != null ? BigInt(result.meta.closingBalancePaise) : null,
      },
    }),
  ]);
  await markPreviewDuplicates(importId);
}

/**
 * Commit a preview. Idempotent: the PREVIEW→COMMITTED transition is guarded, and
 * transactions use an account-scoped unique dedupe key, so retries never duplicate data.
 */
export async function commitImport(userId: string, importId: string) {
  const imp = await prisma.statementImport.findFirst({ where: { id: importId, userId }, include: { account: true } });
  if (!imp) throw new Error("Import not found");
  if (imp.status === "COMMITTED") return { imported: imp.rowsImported, duplicates: imp.rowsDuplicate, alreadyCommitted: true };
  if (imp.status !== "PREVIEW") throw new Error("This import cannot be committed.");
  const errors = imp.errors as string[];
  if (errors.length) throw new Error(errors[0]);

  const ctx = await loadCategorizeContext(userId);
  const { valid } = await keyedRows(importId);

  const outcome = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.statementImport.updateMany({ where: { id: importId, status: "PREVIEW" }, data: { status: "COMMITTED", committedAt: new Date() } });
      if (claimed.count === 0) return { imported: imp.rowsImported, duplicates: imp.rowsDuplicate, alreadyCommitted: true };

      const rowsNow = await tx.importedTransaction.findMany({ where: { importId }, select: { id: true, status: true } });
      const statusById = new Map(rowsNow.map((r) => [r.id, r.status]));
      const candidates = valid.filter((v) => statusById.get(v.row.id) !== "EXCLUDED");
      const dup = await findDuplicates(imp.accountId, candidates);
      const fresh = candidates.filter((v) => !dup.has(v.row.id));

      const created = await tx.transaction.createManyAndReturn({
        data: fresh.map(({ row, key }) => {
          const amount = toPaise(row.amountPaise);
          const c = categorize({ description: row.description, direction: row.direction!, amountPaise: amount, accountId: imp.accountId }, ctx);
          const cp = extractCounterparty(row.description);
          return {
            userId, accountId: imp.accountId, importId, txnDate: row.txnDate!, valueDate: row.valueDate, description: row.description,
            reference: row.reference, bankRef: cp.bankRef ?? null, amountPaise: row.amountPaise!, direction: row.direction!,
            balanceAfterPaise: row.edited ? null : row.balancePaise, channel: cp.channel, counterparty: cp.name ?? cp.vpa ?? null,
            merchantKey: cp.key, merchant: c.merchant, mcc: cp.mcc ?? null, categoryId: c.categoryId, categorizationMethod: c.method,
            confidence: c.confidence, needsReview: c.needsReview, dedupeKey: key,
          };
        }),
        skipDuplicates: true,
        select: { id: true, dedupeKey: true },
      });
      const idByKey = new Map(created.map((c) => [c.dedupeKey, c.id]));

      const rowUpdates = [
        ...fresh.map((v) => tx.importedTransaction.update({ where: { id: v.row.id }, data: { status: idByKey.has(v.key) ? "IMPORTED" : "DUPLICATE", dedupeKey: v.key, transactionId: idByKey.get(v.key) ?? null } })),
        ...[...dup.entries()].map(([rowId, txnId]) => tx.importedTransaction.update({ where: { id: rowId }, data: { status: "DUPLICATE", duplicateOfId: txnId } })),
      ];
      for (const u of rowUpdates) await u;

      const duplicates = candidates.length - created.length;
      await tx.statementImport.update({
        where: { id: importId },
        data: { rowsImported: created.length, rowsDuplicate: duplicates, rawTable: Prisma.DbNull },
      });

      // Learn account details from the statement when they are not set yet.
      const meta = imp.meta as { accountLast4?: string; ifsc?: string };
      const acct = imp.account;
      const earlier = !acct.openingBalanceDate || (imp.periodStart && imp.periodStart < acct.openingBalanceDate);
      await tx.bankAccount.update({
        where: { id: acct.id },
        data: {
          accountLast4: acct.accountLast4 ?? meta.accountLast4 ?? null,
          ifsc: acct.ifsc ?? meta.ifsc ?? null,
          ...(earlier && imp.openingBalancePaise !== null && imp.periodStart && imp.balanceCheck === "PASSED"
            ? { openingBalancePaise: imp.openingBalancePaise, openingBalanceDate: imp.periodStart }
            : {}),
        },
      });
      await audit(tx, userId, "StatementImport", importId, "COMMIT", null, { imported: created.length, duplicates, rows: imp.rowsTotal });
      return { imported: created.length, duplicates, alreadyCommitted: false };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  if (!outcome.alreadyCommitted) await runLinking(userId);
  return outcome;
}

export async function discardPreview(userId: string, importId: string) {
  await ownedPreview(userId, importId);
  await prisma.$transaction([
    prisma.importedTransaction.deleteMany({ where: { importId } }),
    prisma.statementImport.update({ where: { id: importId }, data: { status: "DISCARDED", rawTable: Prisma.DbNull } }),
  ]);
}

/**
 * Delete an import's stored data. Transactions created by this import are deleted only when
 * `deleteTransactions` is true; otherwise they remain (with no link to the import).
 */
export async function deleteImport(userId: string, importId: string, deleteTransactions: boolean) {
  const imp = await prisma.statementImport.findFirst({ where: { id: importId, userId } });
  if (!imp) throw new Error("Import not found");
  const result = await prisma.$transaction(async (tx) => {
    let removed = 0;
    if (deleteTransactions) {
      const ids = (await tx.transaction.findMany({ where: { importId, userId }, select: { id: true } })).map((t) => t.id);
      await tx.transaction.updateMany({ where: { refundOfId: { in: ids } }, data: { refundOfId: null } });
      removed = (await tx.transaction.deleteMany({ where: { id: { in: ids } } })).count;
    }
    await tx.statementImport.delete({ where: { id: importId } });
    await audit(tx, userId, "StatementImport", importId, "DELETE", { fileName: imp.fileName, rows: imp.rowsImported }, { transactionsDeleted: removed });
    return removed;
  });
  if (deleteTransactions) await runLinking(userId);
  return { transactionsDeleted: result };
}
