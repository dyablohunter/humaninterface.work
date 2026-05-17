-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HUMAN', 'AI');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'NORMAL', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Privacy" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('MICRO', 'TASK', 'JOB');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING_DEPOSIT', 'OPEN', 'PAUSED', 'COMPLETED', 'CANCELLED', 'PURGED', 'FAIRNESS_FLAGGED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'PENDING_DEPOSIT', 'CLAIMED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'DISPUTED', 'RESOLVED', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('MICROSURGERY', 'SURGERY_GENERAL', 'DENTAL_PROCEDURES', 'EMERGENCY_MEDICAL', 'PLUMBING', 'ELECTRICAL', 'HVAC', 'CARPENTRY', 'AUTO_MECHANIC', 'WELDING_FABRICATION', 'LOCKSMITHING', 'APPLIANCE_REPAIR', 'TAILORING', 'JEWELRY_AND_WATCH', 'POTTERY_CERAMICS', 'CDL_DRIVING', 'HEAVY_EQUIPMENT', 'AIRCRAFT_PILOTING', 'MARINE_OPERATION', 'DRONE_COMMERCIAL', 'MUSICAL_INSTRUMENT', 'VOCAL_PERFORMANCE', 'ACTING_PERFORMANCE', 'ILLUSTRATION', 'PHOTOGRAPHY', 'GRAPHIC_DESIGN', 'UX_UI_DESIGN', 'FICTION_WRITING', 'COPYWRITING', 'TECHNICAL_WRITING', 'TRANSLATION_RARE_LANGUAGE', 'PROFESSIONAL_COOKING', 'BARTENDING', 'WINE_SOMMELIER', 'COFFEE_BARISTA', 'CHILDCARE', 'ELDERCARE', 'HOSPICE_PRESENCE', 'PET_CARE', 'ACADEMIC_TUTORING', 'LANGUAGE_TUTORING', 'CONVERSATION_PARTNER', 'LICENSED_THERAPY', 'PEER_SUPPORT', 'EXECUTIVE_COACHING', 'LEGAL_ADVICE', 'NOTARY_WITNESS', 'COMPLIANCE_REVIEW', 'PUBLIC_SPEAKING', 'SALES_NEGOTIATION', 'EVENT_HOSTING', 'PRIVATE_SECURITY', 'WILDLAND_FIREFIGHTING', 'WILDERNESS_SAR', 'STUNT_PERFORMANCE', 'WEDDING_OFFICIATION', 'FUNERAL_OFFICIATION', 'COURT_TESTIMONY', 'CRISIS_CONSULTING', 'INVESTIGATIVE_RESEARCH', 'FORECASTING_ANALYSIS', 'LIVESTOCK_HANDLING', 'WORKING_DOG_TRAINING', 'BEEKEEPING', 'FORAGING_MYCOLOGY', 'COMMERCIAL_FISHING', 'ARBORIST_TREE_CLIMBING', 'MASSAGE_THERAPY', 'TATTOO_ARTISTRY', 'HAIRSTYLING', 'LOCAL_OBSERVATION', 'PHOTO_VERIFICATION', 'AUDIO_TRANSCRIPTION', 'DATA_LABELING', 'DELIVERY_RUNNER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED_FOR_HUMAN', 'RESOLVED_FOR_AI');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TokenTxKind" AS ENUM ('REGISTER_VERIFY', 'ESCROW_DEPOSIT', 'PAYOUT', 'REFUND', 'SERVICE_FEE');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'CLEARED', 'ACTIONED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ModerationKind" AS ENUM ('TASK_POST', 'DECISION_NOTE', 'HUMAN_MESSAGE', 'EVIDENCE_TEXT', 'EVIDENCE_MEDIA', 'PETITION');

-- CreateEnum
CREATE TYPE "PetitionStatus" AS ENUM ('OPEN', 'QUALIFIED', 'CLOSED', 'IMPLEMENTED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "solanaPubkey" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "txVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyNonce" TEXT,
    "tosAcceptedAt" TIMESTAMP(3),
    "tosVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanProfile" (
    "userId" TEXT NOT NULL,
    "categories" "Category"[],
    "bio" TEXT,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "microPaid" INTEGER NOT NULL DEFAULT 0,
    "taskPaid" INTEGER NOT NULL DEFAULT 0,
    "jobPaid" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "disputed" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,

    CONSTRAINT "HumanProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "posterId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "privacy" "Privacy" NOT NULL,
    "slotCount" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "statedPriceUsdt" DECIMAL(20,6) NOT NULL,
    "instantAcceptUsdt" DECIMAL(20,6) NOT NULL,
    "minReputation" DOUBLE PRECISION,
    "deadlineAt" TIMESTAMP(3),
    "totalUsdt" DECIMAL(20,6) NOT NULL,
    "escrowTxSig" TEXT,
    "status" "TaskStatus" NOT NULL,
    "fairnessFlags" INTEGER NOT NULL DEFAULT 0,
    "invitedHumanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fundedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "amountUsdt" DECIMAL(20,6) NOT NULL,
    "message" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "slotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "humanId" TEXT,
    "status" "SlotStatus" NOT NULL,
    "awardedUsdt" DECIMAL(20,6),
    "claimedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidTxSig" TEXT,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "sequenceNum" INTEGER NOT NULL,
    "hoursForDay" DOUBLE PRECISION NOT NULL,
    "status" "SlotStatus" NOT NULL,
    "perMilestoneUsdt" DECIMAL(20,6),
    "usdtAmount" DECIMAL(20,6),
    "escrowTxSig" TEXT,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidTxSig" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "slotId" TEXT,
    "milestoneId" TEXT,
    "type" "EvidenceType" NOT NULL,
    "bodyText" TEXT,
    "sourcePath" TEXT,
    "pathPrimary" TEXT,
    "pathFallback" TEXT,
    "mimePrimary" TEXT,
    "mimeFallback" TEXT,
    "sizeBytes" INTEGER,
    "durationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "transcodedAt" TIMESTAMP(3),
    "transcodeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "slotId" TEXT,
    "milestoneId" TEXT,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Petition" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "PetitionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),

    CONSTRAINT "Petition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetitionVote" (
    "id" TEXT NOT NULL,
    "petitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetitionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "readByHuman" BOOLEAN NOT NULL DEFAULT false,
    "readByAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTxLog" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "kind" "TokenTxKind" NOT NULL,
    "fromAddr" TEXT NOT NULL,
    "toAddr" TEXT NOT NULL,
    "amountUsdt" DECIMAL(20,6) NOT NULL,
    "memo" TEXT,
    "taskId" TEXT,
    "slotId" TEXT,
    "milestoneId" TEXT,
    "userId" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTxLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedIdentity" (
    "id" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detail" TEXT,
    "bannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "pubkey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "kind" "ModerationKind" NOT NULL,
    "targetId" TEXT,
    "content" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "category" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_solanaPubkey_key" ON "User"("solanaPubkey");

-- CreateIndex
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Task_status_privacy_createdAt_idx" ON "Task"("status", "privacy", "createdAt");

-- CreateIndex
CREATE INDEX "Task_category_idx" ON "Task"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_slotId_key" ON "Bid"("slotId");

-- CreateIndex
CREATE INDEX "Bid_taskId_status_idx" ON "Bid"("taskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_taskId_humanId_key" ON "Bid"("taskId", "humanId");

-- CreateIndex
CREATE INDEX "Slot_taskId_idx" ON "Slot"("taskId");

-- CreateIndex
CREATE INDEX "Slot_humanId_idx" ON "Slot"("humanId");

-- CreateIndex
CREATE INDEX "Slot_status_idx" ON "Slot"("status");

-- CreateIndex
CREATE INDEX "Milestone_taskId_idx" ON "Milestone"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_slotId_sequenceNum_key" ON "Milestone"("slotId", "sequenceNum");

-- CreateIndex
CREATE INDEX "Evidence_slotId_idx" ON "Evidence"("slotId");

-- CreateIndex
CREATE INDEX "Evidence_milestoneId_idx" ON "Evidence"("milestoneId");

-- CreateIndex
CREATE INDEX "Evidence_transcodedAt_idx" ON "Evidence"("transcodedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_taskId_humanId_key" ON "Application"("taskId", "humanId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_slotId_key" ON "Dispute"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_milestoneId_key" ON "Dispute"("milestoneId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Report_taskId_userId_key" ON "Report"("taskId", "userId");

-- CreateIndex
CREATE INDEX "Petition_status_createdAt_idx" ON "Petition"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PetitionVote_petitionId_idx" ON "PetitionVote"("petitionId");

-- CreateIndex
CREATE UNIQUE INDEX "PetitionVote_petitionId_userId_key" ON "PetitionVote"("petitionId", "userId");

-- CreateIndex
CREATE INDEX "Message_taskId_humanId_createdAt_idx" ON "Message"("taskId", "humanId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTxLog_signature_key" ON "TokenTxLog"("signature");

-- CreateIndex
CREATE INDEX "TokenTxLog_taskId_idx" ON "TokenTxLog"("taskId");

-- CreateIndex
CREATE INDEX "TokenTxLog_fromAddr_idx" ON "TokenTxLog"("fromAddr");

-- CreateIndex
CREATE INDEX "TokenTxLog_memo_idx" ON "TokenTxLog"("memo");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BannedIdentity_pubkey_key" ON "BannedIdentity"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "BannedIdentity_username_key" ON "BannedIdentity"("username");

-- CreateIndex
CREATE INDEX "BannedIdentity_bannedAt_idx" ON "BannedIdentity"("bannedAt");

-- CreateIndex
CREATE INDEX "ModerationReview_status_createdAt_idx" ON "ModerationReview"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "HumanProfile" ADD CONSTRAINT "HumanProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_humanId_fkey" FOREIGN KEY ("humanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_humanId_fkey" FOREIGN KEY ("humanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_humanId_fkey" FOREIGN KEY ("humanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Petition" ADD CONSTRAINT "Petition_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetitionVote" ADD CONSTRAINT "PetitionVote_petitionId_fkey" FOREIGN KEY ("petitionId") REFERENCES "Petition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetitionVote" ADD CONSTRAINT "PetitionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_humanId_fkey" FOREIGN KEY ("humanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
