-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('individual', 'segmented');

-- AlterTable
ALTER TABLE "client_weekly_plans" ADD COLUMN     "assignment_type" "AssignmentType" NOT NULL DEFAULT 'individual';
