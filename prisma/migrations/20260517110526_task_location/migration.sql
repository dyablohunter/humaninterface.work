-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "Task_country_status_privacy_createdAt_idx" ON "Task"("country", "status", "privacy", "createdAt");

-- CreateIndex
CREATE INDEX "Task_country_city_idx" ON "Task"("country", "city");
