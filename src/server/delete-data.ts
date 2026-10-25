import "server-only";
import { prisma } from "./db";
import { ensureUserDefaults } from "./bootstrap";
import { runLinking } from "./pipeline";

/**
 * Permanently delete everything a user has stored: accounts, imports, transactions, Paytm
 * history, budgets, goals, rules, categories, settings and the audit trail. Built-in categories,
 * rules and default settings are recreated afterwards so the app is usable again.
 */
export async function deleteAllUserData(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.paymentAppEntry.deleteMany({ where: { userId } });
    await tx.paymentAppImport.deleteMany({ where: { userId } });
    await tx.transaction.updateMany({ where: { userId }, data: { refundOfId: null } });
    await tx.internalTransfer.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.statementImport.deleteMany({ where: { userId } });
    await tx.bankAccount.deleteMany({ where: { userId } });
    await tx.budget.deleteMany({ where: { userId } });
    await tx.financialGoal.deleteMany({ where: { userId } });
    await tx.recurringTransaction.deleteMany({ where: { userId } });
    await tx.categorizationRule.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.auditLog.deleteMany({ where: { userId } });
    await tx.userSettings.deleteMany({ where: { userId } });
  });
  await ensureUserDefaults(userId);
  await runLinking(userId);
}
