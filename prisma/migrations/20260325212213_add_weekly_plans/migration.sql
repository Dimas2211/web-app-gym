-- CreateEnum
CREATE TYPE "PlanLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('pending', 'completed', 'skipped', 'partial');

-- CreateTable
CREATE TABLE "weekly_plan_templates" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "target_gender" "Gender",
    "target_sport_id" TEXT,
    "target_goal_id" TEXT,
    "target_level" "PlanLevel",
    "description" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_plan_template_days" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "session_name" TEXT,
    "focus_area" TEXT,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "exercise_block" TEXT,
    "trainer_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plan_template_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_weekly_plans" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "template_id" TEXT,
    "trainer_id" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_weekly_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_weekly_plan_days" (
    "id" TEXT NOT NULL,
    "client_weekly_plan_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "session_name" TEXT,
    "focus_area" TEXT,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "exercise_block" TEXT,
    "execution_status" "ExecutionStatus" NOT NULL DEFAULT 'pending',
    "executed_at" TIMESTAMP(3),
    "trainer_feedback" TEXT,
    "client_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_weekly_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_plan_templates_gym_id_idx" ON "weekly_plan_templates"("gym_id");

-- CreateIndex
CREATE INDEX "weekly_plan_templates_branch_id_idx" ON "weekly_plan_templates"("branch_id");

-- CreateIndex
CREATE INDEX "weekly_plan_template_days_template_id_idx" ON "weekly_plan_template_days"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_plan_template_days_template_id_weekday_key" ON "weekly_plan_template_days"("template_id", "weekday");

-- CreateIndex
CREATE INDEX "client_weekly_plans_gym_id_idx" ON "client_weekly_plans"("gym_id");

-- CreateIndex
CREATE INDEX "client_weekly_plans_branch_id_idx" ON "client_weekly_plans"("branch_id");

-- CreateIndex
CREATE INDEX "client_weekly_plans_client_id_idx" ON "client_weekly_plans"("client_id");

-- CreateIndex
CREATE INDEX "client_weekly_plans_trainer_id_idx" ON "client_weekly_plans"("trainer_id");

-- CreateIndex
CREATE INDEX "client_weekly_plan_days_client_weekly_plan_id_idx" ON "client_weekly_plan_days"("client_weekly_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_weekly_plan_days_client_weekly_plan_id_weekday_key" ON "client_weekly_plan_days"("client_weekly_plan_id", "weekday");

-- AddForeignKey
ALTER TABLE "weekly_plan_templates" ADD CONSTRAINT "weekly_plan_templates_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plan_templates" ADD CONSTRAINT "weekly_plan_templates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plan_templates" ADD CONSTRAINT "weekly_plan_templates_target_sport_id_fkey" FOREIGN KEY ("target_sport_id") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plan_templates" ADD CONSTRAINT "weekly_plan_templates_target_goal_id_fkey" FOREIGN KEY ("target_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plan_templates" ADD CONSTRAINT "weekly_plan_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plan_template_days" ADD CONSTRAINT "weekly_plan_template_days_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "weekly_plan_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_weekly_plans" ADD CONSTRAINT "client_weekly_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_weekly_plans" ADD CONSTRAINT "client_weekly_plans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_weekly_plans" ADD CONSTRAINT "client_weekly_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_weekly_plans" ADD CONSTRAINT "client_weekly_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "weekly_plan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_weekly_plans" ADD CONSTRAINT "client_weekly_plans_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_weekly_plan_days" ADD CONSTRAINT "client_weekly_plan_days_client_weekly_plan_id_fkey" FOREIGN KEY ("client_weekly_plan_id") REFERENCES "client_weekly_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
