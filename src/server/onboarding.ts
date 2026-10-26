import "server-only";
import { prisma } from "./db";
import { audit } from "./audit";
import { evaluateSetup, type SetupProgress } from "@/lib/onboarding/steps";

export interface OnboardingState {
  progress: SetupProgress;
  guideSeen: boolean;
  checklistHidden: boolean;
}

/** Gather the facts behind every setup step. Counts only — no amounts are read. */
export async function getSetupProgress(userId: string): Promise<OnboardingState> {
  const [accounts, transactionCount, needsReviewCount, paymentAppImportCount, budgetCount, goalCount, settings] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "asc" },
      select: { displayName: true, _count: { select: { imports: { where: { status: "COMMITTED" } } } } },
    }),
    prisma.transaction.count({ where: { userId } }),
    prisma.transaction.count({ where: { userId, needsReview: true } }),
    prisma.paymentAppImport.count({ where: { userId } }),
    prisma.budget.count({ where: { userId } }),
    prisma.financialGoal.count({ where: { userId } }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);
  const progress = evaluateSetup({
    accounts: accounts.map((a) => ({ name: a.displayName, hasCommittedImport: a._count.imports > 0 })),
    ownIdentifierCount: settings?.ownIdentifiers.length ?? 0,
    transactionCount,
    needsReviewCount,
    reviewMarkedDone: !!settings?.onboardingReviewDoneAt,
    paymentAppImportCount,
    budgetCount,
    goalCount,
  });
  return { progress, guideSeen: !!settings?.onboardingGuideSeenAt, checklistHidden: !!settings?.onboardingChecklistHiddenAt };
}

type OnboardingField = "onboardingGuideSeenAt" | "onboardingChecklistHiddenAt" | "onboardingReviewDoneAt";

/** Set or clear one onboarding timestamp on the user's own settings row, with an audit entry. */
async function setOnboardingFlag(userId: string, field: OnboardingField, on: boolean, action: string) {
  const before = await prisma.userSettings.findUniqueOrThrow({ where: { userId } });
  if (!!before[field] === on) return;
  const value = on ? new Date() : null;
  await prisma.$transaction(async (tx) => {
    await tx.userSettings.update({ where: { userId }, data: { [field]: value } });
    await audit(tx, userId, "UserSettings", before.id, action, { [field]: before[field] }, { [field]: value });
  });
}

export async function markGuideSeen(userId: string) {
  await setOnboardingFlag(userId, "onboardingGuideSeenAt", true, "ONBOARDING_GUIDE_SEEN");
}

export async function setChecklistHidden(userId: string, hidden: boolean) {
  await setOnboardingFlag(userId, "onboardingChecklistHiddenAt", hidden, hidden ? "ONBOARDING_CHECKLIST_HIDDEN" : "ONBOARDING_CHECKLIST_SHOWN");
}

export async function setReviewDone(userId: string, done: boolean) {
  if (done && (await prisma.transaction.count({ where: { userId } })) === 0) {
    throw new Error("Import a statement before marking review as done.");
  }
  await setOnboardingFlag(userId, "onboardingReviewDoneAt", done, done ? "ONBOARDING_REVIEW_DONE" : "ONBOARDING_REVIEW_REOPENED");
}

/** The setup step that leaves data pages empty (no accounts, or nothing imported yet), if any. */
export async function getSetupPrerequisite(userId: string): Promise<"accounts" | "statements" | null> {
  const [accounts, transactions] = await Promise.all([
    prisma.bankAccount.count({ where: { userId, archived: false } }),
    prisma.transaction.count({ where: { userId } }),
  ]);
  return accounts === 0 ? "accounts" : transactions === 0 ? "statements" : null;
}
