-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "document_id" TEXT,
    "birth_date" DATE,
    "gender" "Gender",
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "sport_id" TEXT,
    "goal_id" TEXT,
    "assigned_trainer_id" TEXT,
    "notes" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_gym_id_idx" ON "clients"("gym_id");

-- CreateIndex
CREATE INDEX "clients_branch_id_idx" ON "clients"("branch_id");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_assigned_trainer_id_idx" ON "clients"("assigned_trainer_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_trainer_id_fkey" FOREIGN KEY ("assigned_trainer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
