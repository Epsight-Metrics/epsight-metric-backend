/*
  Warnings:

  - Added the required column `part_id` to the `InspectionBatch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "InspectionBatch" ADD COLUMN     "part_id" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "InspectionBatch_part_id_idx" ON "InspectionBatch"("part_id");

-- AddForeignKey
ALTER TABLE "InspectionBatch" ADD CONSTRAINT "InspectionBatch_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
