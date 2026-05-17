-- AlterTable
-- biddingHours is conceptually required at the application layer (Prisma
-- client + zod validation), but on the SQL side we add it with a temporary
-- default of 24 so the migration applies cleanly to databases that already
-- have Task rows. The default is dropped immediately afterward; new inserts
-- must supply biddingHours.
ALTER TABLE "Task" ADD COLUMN "biddingClosesAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "biddingHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Task" ALTER COLUMN "biddingHours" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Task_status_biddingClosesAt_idx" ON "Task"("status", "biddingClosesAt");
