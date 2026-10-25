import "server-only";
import { prisma } from "./db";
import { audit } from "./audit";
import { recategorize } from "./pipeline";
import { parsePaymentAppStatement, ParseError } from "@/lib/parsing";
import { sha256Hex } from "@/lib/finance/dedupe";
import { isoToDate } from "@/lib/dates";

export type PaymentAppOutcome =
  | { ok: true; importId: string; entries: number; linked: number; unlinked: number; periodStart?: string; periodEnd?: string; warnings: string[] }
  | { ok: false; code?: string; message: string };

/**
 * Import a Paytm UPI statement. Entries are stored (keyed by UPI reference, so overlapping
 * statements are safe) and attached to matching bank transactions; nothing is added to totals.
 */
export async function importPaymentAppStatement(input: { userId: string; fileName: string; bytes: Uint8Array; password?: string }): Promise<PaymentAppOutcome> {
  let parsed;
  try {
    parsed = await parsePaymentAppStatement(input);
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
  if (parsed.totalsCheck === "FAILED") {
    return { ok: false, code: "TOTALS_MISMATCH", message: "The entries don't add up to the totals printed by Paytm, so nothing was saved. The statement layout may have changed." };
  }
  const withRef = parsed.entries.filter((e) => e.upiRef);
  const fileHash = sha256Hex(input.bytes);

  const imp = await prisma.$transaction(async (tx) => {
    const imp = await tx.paymentAppImport.create({
      data: {
        userId: input.userId, source: "PAYTM", fileName: input.fileName, fileHash, parserVersion: parsed.parserVersion,
        periodStart: parsed.summary.periodStart ? isoToDate(parsed.summary.periodStart) : null,
        periodEnd: parsed.summary.periodEnd ? isoToDate(parsed.summary.periodEnd) : null,
        entriesTotal: withRef.length,
      },
    });
    for (const e of withRef) {
      const data = {
        importId: imp.id, txnDate: isoToDate(e.date), amountPaise: BigInt(e.amountPaise), payee: e.payee, upiId: e.upiId ?? null,
        note: e.note ?? null, tags: e.tags, account: e.account,
      };
      await tx.paymentAppEntry.upsert({
        where: { userId_source_upiRef_kind: { userId: input.userId, source: "PAYTM", upiRef: e.upiRef!, kind: e.kind } },
        create: { ...data, userId: input.userId, source: "PAYTM", upiRef: e.upiRef!, kind: e.kind },
        update: data,
      });
    }
    // Earlier uploads whose entries were all superseded by this one are now empty.
    await tx.paymentAppImport.deleteMany({ where: { userId: input.userId, id: { not: imp.id }, entries: { none: {} } } });
    await audit(tx, input.userId, "PaymentAppImport", imp.id, "IMPORT", null, {
      source: "PAYTM", period: [parsed.summary.periodStart, parsed.summary.periodEnd], entries: withRef.length,
    });
    return imp;
  }, { timeout: 60_000 });

  // Linking attaches entries to bank transactions and re-categorizes the ones it touched.
  await recategorize(input.userId);
  const linked = await prisma.paymentAppEntry.count({ where: { importId: imp.id, transactionId: { not: null } } });
  return {
    ok: true, importId: imp.id, entries: withRef.length, linked, unlinked: withRef.length - linked,
    periodStart: parsed.summary.periodStart, periodEnd: parsed.summary.periodEnd, warnings: parsed.warnings,
  };
}

/** Remove an uploaded payment-app history and its details; bank transactions are untouched. */
export async function deletePaymentAppImport(userId: string, importId: string) {
  const imp = await prisma.paymentAppImport.findFirst({ where: { id: importId, userId } });
  if (!imp) throw new Error("Import not found");
  const linkedIds = (await prisma.paymentAppEntry.findMany({ where: { importId, transactionId: { not: null } }, select: { transactionId: true } })).map((e) => e.transactionId!);
  await prisma.$transaction(async (tx) => {
    await tx.paymentAppImport.delete({ where: { id: imp.id } });
    await audit(tx, userId, "PaymentAppImport", imp.id, "DELETE", { fileName: imp.fileName, entries: imp.entriesTotal }, null);
  });
  if (linkedIds.length) await recategorize(userId, { ids: linkedIds });
}
