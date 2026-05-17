-- Ensure that deleting a Slot (or Milestone) cascades to its Dispute row, so
-- that hard-deleting a Task whose auction got zero qualifying bids cleans up
-- every dependent row in one statement. All other Task back-references
-- (Slot, Bid, Milestone, Application, Report, Message, Evidence-via-Slot,
-- Evidence-via-Milestone) already have ON DELETE CASCADE from prior
-- migrations; only Dispute -> Slot and Dispute -> Milestone were NoAction.

-- DropForeignKey
ALTER TABLE "Dispute" DROP CONSTRAINT "Dispute_slotId_fkey";

-- DropForeignKey
ALTER TABLE "Dispute" DROP CONSTRAINT "Dispute_milestoneId_fkey";

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
