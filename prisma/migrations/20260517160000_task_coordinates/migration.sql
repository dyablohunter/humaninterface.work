-- AlterTable: add optional decimal-degree coordinates for precise task pinning.
-- Both nullable; the application layer enforces the pair-or-null rule.
ALTER TABLE "Task" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
