import { describe, expect, it } from "vitest";
import { evaluateSetup, HOW_IT_WORKS, type SetupFacts } from "@/lib/onboarding/steps";

const fresh: SetupFacts = {
  accounts: [], ownIdentifierCount: 0, transactionCount: 0, needsReviewCount: 0, reviewMarkedDone: false,
  paymentAppImportCount: 0, budgetCount: 0, goalCount: 0,
};
const step = (f: Partial<SetupFacts>, id: string) => evaluateSetup({ ...fresh, ...f }).steps.find((s) => s.id === id)!;
const imported = (name: string) => ({ name, hasCommittedImport: true });
const notImported = (name: string) => ({ name, hasCommittedImport: false });

describe("setup steps", () => {
  it("lists six steps, required before optional", () => {
    const p = evaluateSetup(fresh);
    expect(p.steps.map((s) => s.id)).toEqual(["accounts", "statements", "identity", "review", "paytm", "plan"]);
    expect(p.steps.map((s) => s.required)).toEqual([true, true, true, true, false, false]);
    expect(p.steps.every((s) => s.reason && s.href.startsWith("/"))).toBe(true);
  });

  it("starts at 0 of 4 with accounts as the missing prerequisite", () => {
    expect(evaluateSetup(fresh)).toMatchObject({ requiredDone: 0, requiredTotal: 4, allRequiredDone: false, nextPrerequisite: "accounts" });
  });

  it("completes the accounts step once an account exists", () => {
    expect(step({}, "accounts").done).toBe(false);
    expect(step({ accounts: [notImported("Kotak")] }, "accounts").done).toBe(true);
    expect(evaluateSetup({ ...fresh, accounts: [notImported("Kotak")] }).nextPrerequisite).toBe("statements");
  });

  it("shows per-account import progress and names what's missing", () => {
    const s = step({ accounts: [imported("Kotak"), imported("Federal"), notImported("BoM")] }, "statements");
    expect(s.done).toBe(false);
    expect(s.detail).toBe("2 of 3 accounts imported — still missing: BoM");
  });

  it("treats accounts with only previews or failed uploads as not imported", () => {
    // The server passes hasCommittedImport=false for PREVIEW, DISCARDED and FAILED imports.
    expect(step({ accounts: [notImported("Kotak")] }, "statements").done).toBe(false);
  });

  it("ignores archived accounts (they are never passed in)", () => {
    expect(step({ accounts: [imported("Kotak"), imported("Federal")] }, "statements").done).toBe(true);
  });

  it("completes identity when identifiers were learned from a statement, and invites a check", () => {
    const s = step({ ownIdentifierCount: 1 }, "identity");
    expect(s.done).toBe(true);
    expect(s.detail).toMatch(/check them and add your UPI IDs/);
  });

  it("becomes incomplete again when a new account has no statement", () => {
    const before = { accounts: [imported("Kotak")], transactionCount: 10 };
    expect(step(before, "statements").done).toBe(true);
    expect(step({ ...before, accounts: [imported("Kotak"), notImported("SBI")] }, "statements").done).toBe(false);
  });
});

describe("review step", () => {
  it("is done below 10% needing review", () => {
    expect(step({ transactionCount: 1000, needsReviewCount: 99 }, "review").done).toBe(true);
  });
  it("is not done at or above 10%, and says how many need review", () => {
    const s = step({ transactionCount: 1000, needsReviewCount: 100 }, "review");
    expect(s).toMatchObject({ done: false, detail: "100 transactions need review", canMarkDone: true });
  });
  it("can be marked done, still showing the count", () => {
    const s = step({ transactionCount: 1000, needsReviewCount: 371, reviewMarkedDone: true }, "review");
    expect(s).toMatchObject({ done: true, detail: "371 transactions need review", canMarkDone: false });
  });
  it("is not done and cannot be marked with no transactions", () => {
    expect(step({ reviewMarkedDone: true }, "review")).toMatchObject({ done: false, canMarkDone: false });
  });
});

describe("optional steps", () => {
  it("don't count toward required progress", () => {
    const p = evaluateSetup({ ...fresh, paymentAppImportCount: 1, budgetCount: 2 });
    expect(p.steps.find((s) => s.id === "paytm")!.done).toBe(true);
    expect(p.steps.find((s) => s.id === "plan")!.done).toBe(true);
    expect(p.requiredDone).toBe(0);
  });
  it("all required steps done", () => {
    const p = evaluateSetup({
      ...fresh, accounts: [imported("Kotak")], ownIdentifierCount: 2, transactionCount: 50, needsReviewCount: 0,
    });
    expect(p).toMatchObject({ requiredDone: 4, allRequiredDone: true, nextPrerequisite: null });
  });
});

describe("How Fintrack works", () => {
  it("has at most five steps", () => {
    expect(HOW_IT_WORKS.length).toBeGreaterThanOrEqual(1);
    expect(HOW_IT_WORKS.length).toBeLessThanOrEqual(5);
  });
  it("says transfers, investments, cash and lending are not spending", () => {
    const text = HOW_IT_WORKS.find((s) => /spending/i.test(s.title))!.body.join(" ").toLowerCase();
    for (const w of ["transfers between your own accounts", "investments", "cash withdrawals", "lending"]) expect(text).toContain(w);
  });
});
