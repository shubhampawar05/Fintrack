-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SAVINGS', 'CURRENT', 'SALARY', 'CREDIT_CARD', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'CREDIT_CARD_PAYMENT', 'INVESTMENT', 'CASH', 'REFUND', 'SETTLEMENT', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "SpendGroup" AS ENUM ('ESSENTIAL', 'DISCRETIONARY', 'FAMILY');

-- CreateEnum
CREATE TYPE "CategorizationMethod" AS ENUM ('RULE', 'USER_RULE', 'MCC', 'OWN_ACCOUNT', 'TRANSFER_MATCH', 'REFUND_MATCH', 'AI', 'USER', 'DEFAULT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'FAILED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "RowStatus" AS ENUM ('PENDING', 'IMPORTED', 'DUPLICATE', 'REJECTED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RuleMatchType" AS ENUM ('CONTAINS', 'STARTS_WITH', 'EQUALS', 'REGEX');

-- CreateEnum
CREATE TYPE "RuleField" AS ENUM ('DESCRIPTION', 'MERCHANT');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurringKind" AS ENUM ('SUBSCRIPTION', 'RENT', 'SALARY', 'EMI', 'INSURANCE', 'FAMILY', 'INVESTMENT', 'BILL', 'OTHER');

-- CreateEnum
CREATE TYPE "CcPaymentTreatment" AS ENUM ('AUTO', 'EXPENSE', 'EXCLUDE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownIdentifiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transferWindowDays" INTEGER NOT NULL DEFAULT 3,
    "ccPaymentTreatment" "CcPaymentTreatment" NOT NULL DEFAULT 'AUTO',
    "aiCategorization" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'SAVINGS',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "accountLast4" TEXT,
    "ifsc" TEXT,
    "openingBalancePaise" BIGINT,
    "openingBalanceDate" DATE,
    "columnMapping" JSONB,
    "color" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "parserId" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "periodStart" DATE,
    "periodEnd" DATE,
    "statementDate" DATE,
    "openingBalancePaise" BIGINT,
    "closingBalancePaise" BIGINT,
    "balanceCheck" TEXT NOT NULL DEFAULT 'NOT_AVAILABLE',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsRejected" INTEGER NOT NULL DEFAULT 0,
    "rowsExcluded" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "rawTable" JSONB,
    "columnMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "StatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedTransaction" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "page" INTEGER,
    "raw" JSONB NOT NULL,
    "txnDate" DATE,
    "valueDate" DATE,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountPaise" BIGINT,
    "direction" "Direction",
    "balancePaise" BIGINT,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RowStatus" NOT NULL DEFAULT 'PENDING',
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "transactionId" TEXT,
    "duplicateOfId" TEXT,

    CONSTRAINT "ImportedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "importId" TEXT,
    "txnDate" DATE NOT NULL,
    "valueDate" DATE,
    "postingDate" DATE,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "bankRef" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "direction" "Direction" NOT NULL,
    "balanceAfterPaise" BIGINT,
    "channel" TEXT,
    "counterparty" TEXT,
    "merchantKey" TEXT,
    "merchant" TEXT,
    "mcc" TEXT,
    "merchantOverride" TEXT,
    "categoryId" TEXT,
    "categorizationMethod" "CategorizationMethod" NOT NULL DEFAULT 'DEFAULT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "refundOfId" TEXT,
    "recurringId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT,
    "kind" "CategoryKind" NOT NULL,
    "group" "SpendGroup",
    "parentId" TEXT,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" "RuleField" NOT NULL DEFAULT 'DESCRIPTION',
    "matchType" "RuleMatchType" NOT NULL DEFAULT 'CONTAINS',
    "pattern" TEXT NOT NULL,
    "direction" "Direction",
    "accountId" TEXT,
    "minAmountPaise" BIGINT,
    "maxAmountPaise" BIGINT,
    "categoryId" TEXT NOT NULL,
    "merchantName" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debitTxnId" TEXT NOT NULL,
    "creditTxnId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "InternalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmountPaise" BIGINT NOT NULL,
    "currentAmountPaise" BIGINT NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "kind" "RecurringKind" NOT NULL DEFAULT 'OTHER',
    "frequency" "RecurringFrequency" NOT NULL,
    "typicalAmountPaise" BIGINT NOT NULL,
    "minAmountPaise" BIGINT NOT NULL,
    "maxAmountPaise" BIGINT NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "firstDate" DATE NOT NULL,
    "lastDate" DATE NOT NULL,
    "nextExpectedDate" DATE,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_userId_displayName_key" ON "BankAccount"("userId", "displayName");

-- CreateIndex
CREATE INDEX "StatementImport_userId_createdAt_idx" ON "StatementImport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StatementImport_accountId_fileHash_idx" ON "StatementImport"("accountId", "fileHash");

-- CreateIndex
CREATE INDEX "ImportedTransaction_importId_status_idx" ON "ImportedTransaction"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedTransaction_importId_rowIndex_key" ON "ImportedTransaction"("importId", "rowIndex");

-- CreateIndex
CREATE INDEX "Transaction_userId_txnDate_idx" ON "Transaction"("userId", "txnDate");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_userId_needsReview_idx" ON "Transaction"("userId", "needsReview");

-- CreateIndex
CREATE INDEX "Transaction_userId_bankRef_idx" ON "Transaction"("userId", "bankRef");

-- CreateIndex
CREATE INDEX "Transaction_accountId_txnDate_idx" ON "Transaction"("accountId", "txnDate");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_dedupeKey_key" ON "Transaction"("accountId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_key_key" ON "Category"("userId", "key");

-- CreateIndex
CREATE INDEX "CategorizationRule_userId_enabled_priority_idx" ON "CategorizationRule"("userId", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "InternalTransfer_debitTxnId_key" ON "InternalTransfer"("debitTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalTransfer_creditTxnId_key" ON "InternalTransfer"("creditTxnId");

-- CreateIndex
CREATE INDEX "InternalTransfer_userId_status_idx" ON "InternalTransfer"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_key" ON "Budget"("userId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTransaction_userId_signature_key" ON "RecurringTransaction"("userId", "signature");

-- CreateIndex
CREATE INDEX "AuditLog_userId_entity_entityId_idx" ON "AuditLog"("userId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "StatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "StatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransfer" ADD CONSTRAINT "InternalTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransfer" ADD CONSTRAINT "InternalTransfer_debitTxnId_fkey" FOREIGN KEY ("debitTxnId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransfer" ADD CONSTRAINT "InternalTransfer_creditTxnId_fkey" FOREIGN KEY ("creditTxnId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
