-- CreateEnum
CREATE TYPE "PaymentAppKind" AS ENUM ('PAID', 'RECEIVED', 'SELF');

-- CreateTable
CREATE TABLE "PaymentAppImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "entriesTotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAppImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAppEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "upiRef" TEXT NOT NULL,
    "txnDate" DATE NOT NULL,
    "kind" "PaymentAppKind" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "payee" TEXT NOT NULL,
    "upiId" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "account" TEXT NOT NULL,
    "transactionId" TEXT,

    CONSTRAINT "PaymentAppEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAppImport_userId_idx" ON "PaymentAppImport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAppEntry_transactionId_key" ON "PaymentAppEntry"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentAppEntry_userId_upiRef_idx" ON "PaymentAppEntry"("userId", "upiRef");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAppEntry_userId_source_upiRef_kind_key" ON "PaymentAppEntry"("userId", "source", "upiRef", "kind");

-- AddForeignKey
ALTER TABLE "PaymentAppImport" ADD CONSTRAINT "PaymentAppImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAppEntry" ADD CONSTRAINT "PaymentAppEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAppEntry" ADD CONSTRAINT "PaymentAppEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PaymentAppImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAppEntry" ADD CONSTRAINT "PaymentAppEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
