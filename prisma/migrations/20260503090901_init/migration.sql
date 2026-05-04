/*
  Warnings:

  - You are about to drop the column `createdAt` on the `ActivityLog` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ActivityLog` table. All the data in the column will be lost.
  - You are about to drop the column `batchNumber` on the `InspectionBatch` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `InspectionBatch` table. All the data in the column will be lost.
  - You are about to drop the column `operatorId` on the `InspectionBatch` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `InspectionBatch` table. All the data in the column will be lost.
  - You are about to drop the column `totalQuantity` on the `InspectionBatch` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Part` table. All the data in the column will be lost.
  - You are about to drop the column `partCode` on the `Part` table. All the data in the column will be lost.
  - You are about to drop the column `partName` on the `Part` table. All the data in the column will be lost.
  - You are about to drop the column `vendorName` on the `Part` table. All the data in the column will be lost.
  - You are about to drop the column `endedAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `operatorId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `batchId` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `dataHash` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `engineerConfigVersion` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `idPart` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `imagePath` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `matchedRef` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `nilaiDimensi` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `operatorId` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `partId` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `inspeksi_log` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[batch_number]` on the table `InspectionBatch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[part_code]` on the table `Part` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[session_id]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `batch_number` to the `InspectionBatch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `operator_id` to the `InspectionBatch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `session_id` to the `InspectionBatch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_quantity` to the `InspectionBatch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `part_code` to the `Part` table without a default value. This is not possible if the table is not empty.
  - Added the required column `part_name` to the `Part` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vendor_name` to the `Part` table without a default value. This is not possible if the table is not empty.
  - Added the required column `operator_id` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `session_id` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `operator_id` to the `inspeksi_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `part_id` to the `inspeksi_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `session_id` to the `inspeksi_log` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionBatch" DROP CONSTRAINT "InspectionBatch_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionBatch" DROP CONSTRAINT "InspectionBatch_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_batchId_fkey";

-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_partId_fkey";

-- DropIndex
DROP INDEX "InspectionBatch_batchNumber_key";

-- DropIndex
DROP INDEX "Part_partCode_key";

-- DropIndex
DROP INDEX "Session_sessionId_key";

-- AlterTable
ALTER TABLE "ActivityLog" DROP COLUMN "createdAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "InspectionBatch" DROP COLUMN "batchNumber",
DROP COLUMN "createdAt",
DROP COLUMN "operatorId",
DROP COLUMN "sessionId",
DROP COLUMN "totalQuantity",
ADD COLUMN     "batch_number" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "operator_id" INTEGER NOT NULL,
ADD COLUMN     "session_id" TEXT NOT NULL,
ADD COLUMN     "total_quantity" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Part" DROP COLUMN "createdAt",
DROP COLUMN "partCode",
DROP COLUMN "partName",
DROP COLUMN "vendorName",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "part_code" TEXT NOT NULL,
ADD COLUMN     "part_name" TEXT NOT NULL,
ADD COLUMN     "vendor_name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "endedAt",
DROP COLUMN "operatorId",
DROP COLUMN "sessionId",
DROP COLUMN "startedAt",
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "operator_id" INTEGER NOT NULL,
ADD COLUMN     "session_id" TEXT NOT NULL,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "createdAt",
DROP COLUMN "isActive",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "inspeksi_log" DROP COLUMN "batchId",
DROP COLUMN "dataHash",
DROP COLUMN "engineerConfigVersion",
DROP COLUMN "idPart",
DROP COLUMN "imagePath",
DROP COLUMN "matchedRef",
DROP COLUMN "nilaiDimensi",
DROP COLUMN "operatorId",
DROP COLUMN "partId",
DROP COLUMN "sessionId",
ADD COLUMN     "batch_id" INTEGER,
ADD COLUMN     "data_hash" TEXT,
ADD COLUMN     "engineer_config_version" TEXT,
ADD COLUMN     "id_part" VARCHAR(64),
ADD COLUMN     "image_path" VARCHAR(256),
ADD COLUMN     "matched_ref" VARCHAR(128),
ADD COLUMN     "nilai_dimensi" JSONB,
ADD COLUMN     "operator_id" INTEGER NOT NULL,
ADD COLUMN     "part_id" INTEGER NOT NULL,
ADD COLUMN     "session_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InspectionBatch_batch_number_key" ON "InspectionBatch"("batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "Part_part_code_key" ON "Part"("part_code");

-- CreateIndex
CREATE UNIQUE INDEX "Session_session_id_key" ON "Session"("session_id");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBatch" ADD CONSTRAINT "InspectionBatch_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "Session"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBatch" ADD CONSTRAINT "InspectionBatch_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "InspectionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
