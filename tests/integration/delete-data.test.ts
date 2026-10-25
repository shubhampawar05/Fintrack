import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ensureUserDefaults } from "@/server/bootstrap";
import { commitImport, createPreview } from "@/server/imports";
import { importPaymentAppStatement } from "@/server/payment-app";
import { deleteAllUserData } from "@/server/delete-data";

const fixture = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/statements", f)));

/** Every table that holds per-user rows — read from the schema so new tables are covered automatically. */
const USER_TABLES = Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === "userId")).map((m) => m.name);
/** Recreated as defaults after deletion. */
const DEFAULTS = ["UserSettings", "Category", "CategorizationRule"];

async function countsFor(userId: string) {
  const out: Record<string, number> = {};
  for (const model of USER_TABLES) {
    const delegate = (prisma as unknown as Record<string, { count: (a: object) => Promise<number> }>)[model[0].toLowerCase() + model.slice(1)];
    out[model] = await delegate.count({ where: { userId } });
  }
  return out;
}

async function seededUser(email: string) {
  const user = await prisma.user.create({ data: { email: `${email}-${Date.now()}@example.com`, name: email } });
  await ensureUserDefaults(user.id);
  const account = await prisma.bankAccount.create({ data: { userId: user.id, displayName: "Federal", bankName: "Federal" } });
  const p = await createPreview({ userId: user.id, accountId: account.id, fileName: "f.pdf", bytes: fixture("federal-synthetic.pdf") });
  if (!p.ok) throw new Error(p.message);
  await commitImport(user.id, p.importId);
  await importPaymentAppStatement({ userId: user.id, fileName: "paytm.pdf", bytes: fixture("paytm-synthetic.pdf") });
  return user.id;
}

describe("delete everything", () => {
  it("removes every user-owned row, including Paytm history, and leaves other users untouched", async () => {
    const userId = await seededUser("delete-me");
    const otherId = await seededUser("keep-me");
    const before = await countsFor(userId);
    expect(before.PaymentAppEntry).toBeGreaterThan(0);
    expect(before.Transaction).toBeGreaterThan(0);
    const otherBefore = await countsFor(otherId);

    await deleteAllUserData(userId);

    const after = await countsFor(userId);
    for (const model of USER_TABLES.filter((m) => !DEFAULTS.includes(m))) expect({ model, rows: after[model] }).toEqual({ model, rows: 0 });
    expect(after.UserSettings).toBe(1);
    expect(after.Category).toBeGreaterThan(0);
    expect(await countsFor(otherId)).toEqual(otherBefore);
  });
});
