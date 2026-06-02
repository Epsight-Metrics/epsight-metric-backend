-- AlterEnum: Remove ENGINEER from Role enum
ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('OPERATOR_QC', 'QUALITY_MANAGER', 'AUDIT', 'ADMIN');

-- Update any remaining ENGINEER users (safety check)
UPDATE "User" SET role = 'OPERATOR_QC'::text::"Role_old" WHERE role = 'ENGINEER'::text::"Role_old";

-- Alter User table to use new enum
ALTER TABLE "User" ALTER COLUMN role TYPE "Role" USING role::text::"Role";

-- Drop old enum
DROP TYPE "Role_old";
