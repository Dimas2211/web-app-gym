-- CreateTable
CREATE TABLE "trainers" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "specialty" TEXT,
    "notes" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_availability" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trainers_user_id_key" ON "trainers"("user_id");

-- CreateIndex
CREATE INDEX "trainers_gym_id_idx" ON "trainers"("gym_id");

-- CreateIndex
CREATE INDEX "trainers_branch_id_idx" ON "trainers"("branch_id");

-- CreateIndex
CREATE INDEX "trainers_user_id_idx" ON "trainers"("user_id");

-- CreateIndex
CREATE INDEX "trainer_availability_gym_id_idx" ON "trainer_availability"("gym_id");

-- CreateIndex
CREATE INDEX "trainer_availability_branch_id_idx" ON "trainer_availability"("branch_id");

-- CreateIndex
CREATE INDEX "trainer_availability_trainer_id_idx" ON "trainer_availability"("trainer_id");

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
