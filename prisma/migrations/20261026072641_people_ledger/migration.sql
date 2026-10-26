-- CreateEnum
CREATE TYPE "PersonSource" AS ENUM ('AUTO', 'USER');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "personId" TEXT,
ADD COLUMN     "personSource" "PersonSource";

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "openingBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "openingAsOf" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_userId_nameKey_key" ON "Person"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "PersonKey_personId_idx" ON "PersonKey"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonKey_userId_merchantKey_key" ON "PersonKey"("userId", "merchantKey");

-- CreateIndex
CREATE INDEX "Transaction_userId_personId_idx" ON "Transaction"("userId", "personId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonKey" ADD CONSTRAINT "PersonKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonKey" ADD CONSTRAINT "PersonKey_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
