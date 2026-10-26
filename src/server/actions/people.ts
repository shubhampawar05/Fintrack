"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import * as svc from "@/server/people";
import { isoDate } from "@/lib/validation/schemas";
import { rupeesInputToPaise } from "@/lib/money";
import { run } from "./util";

const id = z.string().min(1).max(100);
const key = z.string().min(1).max(200);
const name = z.string().trim().min(1, "Enter a name").max(80);
const txnIds = z.array(id).min(1).max(2000);
const tag = z.enum(["loan", "card", "shared", "gift"]);

export async function createPersonAction(merchantKey: string, personName: string) {
  return run(async () => {
    const user = await requireUser();
    const p = await svc.createPersonFromKey(user.id, { merchantKey: key.parse(merchantKey), name: name.parse(personName) });
    revalidatePath("/", "layout");
    return { id: p.id };
  }, "Person created");
}

/** Returns `{ needsMove }` instead of failing when the counterparty belongs to someone else. */
export async function linkKeyAction(personId: string, merchantKey: string, move: boolean) {
  return run(async () => {
    const user = await requireUser();
    try {
      await svc.linkKey(user.id, id.parse(personId), key.parse(merchantKey), z.boolean().parse(move));
    } catch (e) {
      if (e instanceof svc.LinkedElsewhereError) return { needsMove: e.personName };
      throw e;
    }
    revalidatePath("/", "layout");
    return { needsMove: null };
  });
}

export async function unlinkKeyAction(personId: string, merchantKey: string) {
  return run(async () => {
    const user = await requireUser();
    await svc.unlinkKey(user.id, id.parse(personId), key.parse(merchantKey));
    revalidatePath("/", "layout");
  }, "Unlinked");
}

export async function renamePersonAction(personId: string, newName: string) {
  return run(async () => {
    const user = await requireUser();
    await svc.renamePerson(user.id, id.parse(personId), name.parse(newName));
    revalidatePath("/", "layout");
  }, "Renamed");
}

export async function mergePeopleAction(fromId: string, intoId: string) {
  return run(async () => {
    const user = await requireUser();
    await svc.mergePeople(user.id, id.parse(fromId), id.parse(intoId));
    revalidatePath("/", "layout");
  }, "Merged");
}

export async function deletePersonAction(personId: string) {
  return run(async () => {
    const user = await requireUser();
    await svc.deletePerson(user.id, id.parse(personId));
    revalidatePath("/", "layout");
  }, "Person deleted");
}

export async function setOpeningBalanceAction(personId: string, input: { amount: string; owesMe: boolean; asOf: string }) {
  return run(async () => {
    const user = await requireUser();
    const paise = input.amount.trim() === "" ? 0 : rupeesInputToPaise(input.amount);
    if (paise === null || paise < 0) throw new Error("Enter an amount like 10000 or 10,000.50");
    const asOf = input.asOf ? isoDate.parse(input.asOf) : null;
    await svc.setOpeningBalance(user.id, id.parse(personId), z.boolean().parse(input.owesMe) ? paise : -paise, asOf);
    revalidatePath("/", "layout");
  }, "Opening balance saved");
}

export async function assignPersonAction(ids: string[], personId: string | null) {
  return run(async () => {
    const user = await requireUser();
    const n = await svc.assignPerson(user.id, txnIds.parse(ids), personId === null ? null : id.parse(personId));
    revalidatePath("/", "layout");
    return { updated: n };
  });
}

export async function tagPersonTransactionsAction(ids: string[], t: string, categoryId?: string) {
  return run(async () => {
    const user = await requireUser();
    const n = await svc.tagPersonTransactions(user.id, txnIds.parse(ids), tag.parse(t), categoryId ? id.parse(categoryId) : undefined);
    revalidatePath("/", "layout");
    return { updated: n };
  });
}
