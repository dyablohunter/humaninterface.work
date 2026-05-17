-- AlterEnum
ALTER TYPE "DisputeStatus" ADD VALUE 'RESOLVING_FOR_HUMAN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SlotStatus" ADD VALUE 'PAYING';
ALTER TYPE "SlotStatus" ADD VALUE 'REFUNDING';

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELLING';

-- DropIndex
DROP INDEX "TokenTxLog_memo_idx";

-- AlterTable
ALTER TABLE "TokenTxLog" ALTER COLUMN "signature" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UsedNonce" (
    "id" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsedNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsedNonce_expiresAt_idx" ON "UsedNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsedNonce_pubkey_nonce_key" ON "UsedNonce"("pubkey", "nonce");

-- CreateIndex
CREATE INDEX "RateLimitHit_key_createdAt_idx" ON "RateLimitHit"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTxLog_memo_key" ON "TokenTxLog"("memo");

