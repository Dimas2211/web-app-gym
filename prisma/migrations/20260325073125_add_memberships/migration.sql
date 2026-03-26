-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'partial', 'overdue', 'refunded');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'expired', 'cancelled', 'suspended');

-- AlterTable
ALTER TABLE "membership_plans" ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "sessions_limit" INTEGER;

-- CreateTable
CREATE TABLE "client_memberships" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "membership_plan_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "price_at_sale" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(10,2) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "sold_by_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_memberships_gym_id_idx" ON "client_memberships"("gym_id");

-- CreateIndex
CREATE INDEX "client_memberships_branch_id_idx" ON "client_memberships"("branch_id");

-- CreateIndex
CREATE INDEX "client_memberships_client_id_idx" ON "client_memberships"("client_id");

-- CreateIndex
CREATE INDEX "client_memberships_membership_plan_id_idx" ON "client_memberships"("membership_plan_id");

-- CreateIndex
CREATE INDEX "client_memberships_end_date_idx" ON "client_memberships"("end_date");

-- CreateIndex
CREATE INDEX "membership_plans_branch_id_idx" ON "membership_plans"("branch_id");

-- AddForeignKey
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_membership_plan_id_fkey" FOREIGN KEY ("membership_plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_sold_by_user_id_fkey" FOREIGN KEY ("sold_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
