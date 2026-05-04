/*
  Warnings:

  - You are about to drop the column `operator_id` on the `InspectionBatch` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_user_id_fkey";

-- DropForeignKey
ALTER TABLE "InspectionBatch" DROP CONSTRAINT "InspectionBatch_operator_id_fkey";

-- DropForeignKey
ALTER TABLE "InspectionBatch" DROP CONSTRAINT "InspectionBatch_session_id_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_operator_id_fkey";

-- AlterTable
ALTER TABLE "InspectionBatch" DROP COLUMN "operator_id";

-- AlterTable
ALTER TABLE "inspeksi_log" ADD COLUMN     "batch_id" INTEGER,
ADD COLUMN     "operator_id" INTEGER,
ADD COLUMN     "part_id" INTEGER,
ADD COLUMN     "session_id" TEXT;

-- CreateIndex
CREATE INDEX "ActivityLog_user_id_idx" ON "ActivityLog"("user_id");

-- CreateIndex
CREATE INDEX "ActivityLog_created_at_idx" ON "ActivityLog"("created_at");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "InspectionBatch_session_id_idx" ON "InspectionBatch"("session_id");

-- CreateIndex
CREATE INDEX "InspectionBatch_created_at_idx" ON "InspectionBatch"("created_at");

-- CreateIndex
CREATE INDEX "Part_part_code_idx" ON "Part"("part_code");

-- CreateIndex
CREATE INDEX "Part_vendor_name_idx" ON "Part"("vendor_name");

-- CreateIndex
CREATE INDEX "Session_operator_id_idx" ON "Session"("operator_id");

-- CreateIndex
CREATE INDEX "Session_session_id_idx" ON "Session"("session_id");

-- CreateIndex
CREATE INDEX "Session_started_at_idx" ON "Session"("started_at");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "inspeksi_log_part_id_idx" ON "inspeksi_log"("part_id");

-- CreateIndex
CREATE INDEX "inspeksi_log_operator_id_idx" ON "inspeksi_log"("operator_id");

-- CreateIndex
CREATE INDEX "inspeksi_log_session_id_idx" ON "inspeksi_log"("session_id");

-- CreateIndex
CREATE INDEX "inspeksi_log_batch_id_idx" ON "inspeksi_log"("batch_id");

-- CreateIndex
CREATE INDEX "inspeksi_log_status_idx" ON "inspeksi_log"("status");

-- CreateIndex
CREATE INDEX "inspeksi_log_timestamp_idx" ON "inspeksi_log"("timestamp");

-- CreateIndex
CREATE INDEX "inspeksi_log_timestamp_status_idx" ON "inspeksi_log"("timestamp", "status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBatch" ADD CONSTRAINT "InspectionBatch_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "Session"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "Session"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "InspectionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
