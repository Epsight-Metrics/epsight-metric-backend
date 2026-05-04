/*
  Warnings:

  - You are about to drop the `Inspection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Inspection" DROP CONSTRAINT "Inspection_batchId_fkey";

-- DropForeignKey
ALTER TABLE "Inspection" DROP CONSTRAINT "Inspection_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "Inspection" DROP CONSTRAINT "Inspection_partId_fkey";

-- DropTable
DROP TABLE "Inspection";

-- CreateTable
CREATE TABLE "inspeksi_log" (
    "id" SERIAL NOT NULL,
    "partId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "batchId" INTEGER,
    "idPart" VARCHAR(64),
    "shape" VARCHAR(32),
    "nilaiDimensi" JSONB,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "diameter" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "matchedRef" VARCHAR(128),
    "imagePath" VARCHAR(256),
    "engineerConfigVersion" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "dataHash" TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspeksi_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspeksi_log" ADD CONSTRAINT "inspeksi_log_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InspectionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
