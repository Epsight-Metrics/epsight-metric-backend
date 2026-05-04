/*
  Warnings:

  - Made the column `part_id` on table `inspeksi_log` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_part_id_fkey";

-- AlterTable
ALTER TABLE "inspeksi_log" ALTER COLUMN "part_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
