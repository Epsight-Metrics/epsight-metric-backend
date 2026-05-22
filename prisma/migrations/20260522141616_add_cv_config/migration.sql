-- CreateTable
CREATE TABLE "cv_config" (
    "id" SERIAL NOT NULL,
    "pixel_per_mm" DOUBLE PRECISION NOT NULL DEFAULT 9.28,
    "tolerance_mm" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "contour_thresh" INTEGER NOT NULL DEFAULT 200,
    "contour_min_area" INTEGER NOT NULL DEFAULT 1500,
    "min_feature_mm" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "roi_percent" JSONB NOT NULL DEFAULT '[0.20, 0.10, 0.80, 0.90]',
    "warning_duration" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER NOT NULL,

    CONSTRAINT "cv_config_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cv_config" ADD CONSTRAINT "cv_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
