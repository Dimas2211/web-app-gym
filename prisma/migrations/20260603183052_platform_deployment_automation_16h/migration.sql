-- CreateEnum
CREATE TYPE "PlatformDeploymentJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'SIMULATED');

-- CreateEnum
CREATE TYPE "PlatformDeploymentJobEnvironment" AS ENUM ('LOCAL', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PlatformDeploymentJobMode" AS ENUM ('SIMULATION', 'MANUAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "PlatformDeploymentStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "platform_deployment_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bundle_export_id" TEXT,
    "job_status" "PlatformDeploymentJobStatus" NOT NULL DEFAULT 'PENDING',
    "target_environment" "PlatformDeploymentJobEnvironment" NOT NULL DEFAULT 'LOCAL',
    "deployment_mode" "PlatformDeploymentJobMode" NOT NULL DEFAULT 'SIMULATION',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_by" TEXT,
    "notes" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_deployment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_deployment_steps" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "status" "PlatformDeploymentStepStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_deployment_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_deployment_jobs_organization_id_idx" ON "platform_deployment_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "platform_deployment_jobs_job_status_idx" ON "platform_deployment_jobs"("job_status");

-- CreateIndex
CREATE INDEX "platform_deployment_jobs_target_environment_idx" ON "platform_deployment_jobs"("target_environment");

-- CreateIndex
CREATE INDEX "platform_deployment_jobs_created_at_idx" ON "platform_deployment_jobs"("created_at");

-- CreateIndex
CREATE INDEX "platform_deployment_steps_job_id_idx" ON "platform_deployment_steps"("job_id");

-- CreateIndex
CREATE INDEX "platform_deployment_steps_step_order_idx" ON "platform_deployment_steps"("step_order");

-- AddForeignKey
ALTER TABLE "platform_deployment_jobs" ADD CONSTRAINT "platform_deployment_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_deployment_steps" ADD CONSTRAINT "platform_deployment_steps_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "platform_deployment_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
