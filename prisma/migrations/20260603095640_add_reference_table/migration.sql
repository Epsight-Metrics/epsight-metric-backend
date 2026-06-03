-- CreateTable
CREATE TABLE "reference" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "shape" VARCHAR(32) NOT NULL,
    "vertices" INTEGER NOT NULL,
    "diameter_mm" DOUBLE PRECISION NOT NULL,
    "width_mm" DOUBLE PRECISION NOT NULL,
    "height_mm" DOUBLE PRECISION NOT NULL,
    "tolerance_mm" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_name_key" ON "reference"("name");

-- CreateIndex
CREATE INDEX "reference_name_idx" ON "reference"("name");

-- CreateIndex
CREATE INDEX "reference_shape_idx" ON "reference"("shape");
