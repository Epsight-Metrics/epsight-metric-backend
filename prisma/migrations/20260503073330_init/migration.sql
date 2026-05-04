-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "batchId" INTEGER;

-- CreateTable
CREATE TABLE "InspectionBatch" (
    "id" SERIAL NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionBatch_batchNumber_key" ON "InspectionBatch"("batchNumber");

-- AddForeignKey
ALTER TABLE "InspectionBatch" ADD CONSTRAINT "InspectionBatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBatch" ADD CONSTRAINT "InspectionBatch_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InspectionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
