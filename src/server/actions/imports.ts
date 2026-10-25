"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import * as svc from "@/server/imports";
import { deletePaymentAppImport } from "@/server/payment-app";
import type { ColumnMapping } from "@/lib/parsing";
import { isoDate, positiveRupees } from "@/lib/validation/schemas";
import { run } from "./util";

const col = z.number().int().min(0).nullable().optional();
const mappingSchema = z.object({
  date: z.number().int().min(0).nullable(),
  valueDate: col,
  description: z.number().int().min(0).nullable(),
  reference: col,
  debit: col,
  credit: col,
  amount: col,
  drCr: col,
  balance: col,
  negativeIsDebit: z.boolean().optional(),
});

export async function remapImport(importId: string, mapping: ColumnMapping, saveForAccount: boolean) {
  return run(async () => {
    const user = await requireUser();
    const m = mappingSchema.parse(mapping);
    await svc.remapPreview(user.id, importId, m);
    if (saveForAccount) {
      const imp = await prisma.statementImport.findFirstOrThrow({ where: { id: importId, userId: user.id } });
      await prisma.bankAccount.update({ where: { id: imp.accountId }, data: { columnMapping: m } });
    }
    revalidatePath(`/import/${importId}`);
  }, "Columns remapped");
}

export async function editImportRow(importId: string, rowId: string, input: { txnDate: string; description: string; amount: string; direction: "DEBIT" | "CREDIT" }) {
  return run(async () => {
    const user = await requireUser();
    const v = z.object({ txnDate: isoDate, description: z.string().trim().min(1).max(500), amount: positiveRupees, direction: z.enum(["DEBIT", "CREDIT"]) }).parse(input);
    await svc.updatePreviewRow(user.id, importId, rowId, { txnDate: v.txnDate, description: v.description, amountPaise: v.amount, direction: v.direction });
    revalidatePath(`/import/${importId}`);
  }, "Row updated");
}

export async function excludeImportRows(importId: string, rowIds: string[], excluded: boolean) {
  return run(async () => {
    const user = await requireUser();
    await svc.setRowsExcluded(user.id, importId, z.array(z.string()).max(5000).parse(rowIds), excluded);
    revalidatePath(`/import/${importId}`);
  });
}

export async function commitImportAction(importId: string) {
  return run(async () => {
    const user = await requireUser();
    const r = await svc.commitImport(user.id, importId);
    revalidatePath("/", "layout");
    return r;
  });
}

export async function discardImportAction(importId: string) {
  return run(async () => {
    const user = await requireUser();
    await svc.discardPreview(user.id, importId);
    revalidatePath("/import");
  }, "Preview discarded");
}

export async function deleteImportAction(importId: string, deleteTransactions: boolean) {
  return run(async () => {
    const user = await requireUser();
    const r = await svc.deleteImport(user.id, importId, deleteTransactions);
    revalidatePath("/", "layout");
    return r;
  }, "Import deleted");
}

export async function deletePaymentAppImportAction(importId: string) {
  z.string().min(1).parse(importId);
  return run(async () => {
    const user = await requireUser();
    await deletePaymentAppImport(user.id, importId);
    revalidatePath("/", "layout");
  }, "Paytm history removed");
}
