-- AlterTable
ALTER TABLE "platform_organizations" ADD COLUMN     "deployment_url" TEXT,
ADD COLUMN     "instance_identifier" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" TEXT;
