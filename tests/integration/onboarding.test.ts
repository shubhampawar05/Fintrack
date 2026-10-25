import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ensureUserDefaults } from "@/server/bootstrap";
import { commitImport, createPreview } from "@/server/imports";
import { getSetupProgress, markGuideSeen, setChecklistHidden, setReviewDone } from "@/server/onboarding";
import { getAnalyticsOptions, getAnalyticsTxns } from "@/server/queries";
import { computeSummary } from "@/lib/finance/analytics";

const fixture = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/statements", f)));
const stepOf = async (userId: string, id: string) => (await getSetupProgress(userId)).progress.steps.find((s) => s.id === id)!;

let userId = "";

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `onboarding-${Date.now()}@example.com`, name: "Onboarding" } });
  userId = user.id;
  await ensureUserDefaults(userId);
});

describe("setup progress from data", () => {
  it("reports 0 of 4 for a fresh user", async () => {
    const s = await getSetupProgress(userId);
    expect(s).toMatchObject({ guideSeen: false, checklistHidden: false });
    expect(s.progress).toMatchObject({ requiredDone: 0, requiredTotal: 4, nextPrerequisite: "accounts" });
  });

  it("does not count a preview as imported; a commit completes accounts, statements and identity", async () => {
    const account = await prisma.bankAccount.create({ data: { userId, displayName: "Kotak", bankName: "Kotak" } });
    const preview = await createPreview({ userId, accountId: account.id, fileName: "k.pdf", bytes: fixture("kotak-synthetic.pdf") });
    if (!preview.ok) throw new Error(preview.message);
    expect(await stepOf(userId, "accounts")).toMatchObject({ done: true });
    expect(await stepOf(userId, "statements")).toMatchObject({ done: false, detail: "0 of 1 accounts imported — still missing: Kotak" });

    await commitImport(userId, preview.importId);
    expect(await stepOf(userId, "statements")).toMatchObject({ done: true });
    // The statement's holder name was learned as an own identifier.
    expect(await stepOf(userId, "identity")).toMatchObject({ done: true });
    expect((await getSetupProgress(userId)).progress.nextPrerequisite).toBeNull();
  });
});

describe("onboarding actions", () => {
  it("refuses to mark review done without transactions", async () => {
    const other = await prisma.user.create({ data: { email: `empty-${Date.now()}@example.com`, name: "Empty" } });
    await ensureUserDefaults(other.id);
    await expect(setReviewDone(other.id, true)).rejects.toThrow(/Import a statement/);
  });

  it("records each action in the audit log and never touches financial data", async () => {
    const snapshot = async () => {
      const txns = await prisma.transaction.findMany({ where: { userId }, select: { id: true, categoryId: true, needsReview: true }, orderBy: { id: "asc" } });
      const summary = computeSummary(await getAnalyticsTxns(userId), { from: "2026-01-01", to: "2026-12-31" }, await getAnalyticsOptions(userId));
      return { txns, totals: [summary.income, summary.expenses, summary.totalCredits, summary.totalDebits] };
    };
    const before = await snapshot();

    await markGuideSeen(userId);
    await setChecklistHidden(userId, true);
    await setReviewDone(userId, true);
    await markGuideSeen(userId); // already seen: no second entry

    const s = await getSetupProgress(userId);
    expect(s).toMatchObject({ guideSeen: true, checklistHidden: true });
    expect(s.progress.steps.find((x) => x.id === "review")!.done).toBe(true);
    const actions = (await prisma.auditLog.findMany({ where: { userId, action: { startsWith: "ONBOARDING_" } } })).map((a) => a.action).sort();
    expect(actions).toEqual(["ONBOARDING_CHECKLIST_HIDDEN", "ONBOARDING_GUIDE_SEEN", "ONBOARDING_REVIEW_DONE"]);

    await setChecklistHidden(userId, false);
    expect((await getSetupProgress(userId)).checklistHidden).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
});
