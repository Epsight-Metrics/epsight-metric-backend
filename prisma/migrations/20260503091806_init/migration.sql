/*
  Warnings:

  - You are about to drop the column `batch_id` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `data_hash` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `diameter` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `engineer_config_version` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `length` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `operator_id` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `part_id` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `session_id` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to drop the column `width` on the `inspeksi_log` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `inspeksi_log` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(16)`.

*/
-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_operator_id_fkey";

-- DropForeignKey
ALTER TABLE "inspeksi_log" DROP CONSTRAINT "inspeksi_log_part_id_fkey";

-- AlterTable
ALTER TABLE "inspeksi_log" DROP COLUMN "batch_id",
DROP COLUMN "data_hash",
DROP COLUMN "diameter",
DROP COLUMN "engineer_config_version",
DROP COLUMN "length",
DROP COLUMN "operator_id",
DROP COLUMN "part_id",
DROP COLUMN "quantity",
DROP COLUMN "session_id",
DROP COLUMN "width",
ALTER COLUMN "status" SET DATA TYPE VARCHAR(16);
