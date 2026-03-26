-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('confirmed', 'cancelled', 'waitlisted');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('attended', 'absent', 'late', 'cancelled');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "class_types" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_duration_minutes" INTEGER,
    "capacity_default" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_classes" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_type_id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "class_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "room_name" TEXT,
    "is_personalized" BOOLEAN NOT NULL DEFAULT false,
    "status" "ClassStatus" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_bookings" (
    "id" TEXT NOT NULL,
    "scheduled_class_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "booking_status" "BookingStatus" NOT NULL DEFAULT 'confirmed',
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_attendance" (
    "id" TEXT NOT NULL,
    "scheduled_class_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "attendance_status" "AttendanceStatus" NOT NULL DEFAULT 'attended',
    "checked_in_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_types_gym_id_idx" ON "class_types"("gym_id");

-- CreateIndex
CREATE INDEX "scheduled_classes_gym_id_idx" ON "scheduled_classes"("gym_id");

-- CreateIndex
CREATE INDEX "scheduled_classes_branch_id_idx" ON "scheduled_classes"("branch_id");

-- CreateIndex
CREATE INDEX "scheduled_classes_class_type_id_idx" ON "scheduled_classes"("class_type_id");

-- CreateIndex
CREATE INDEX "scheduled_classes_trainer_id_idx" ON "scheduled_classes"("trainer_id");

-- CreateIndex
CREATE INDEX "scheduled_classes_class_date_idx" ON "scheduled_classes"("class_date");

-- CreateIndex
CREATE INDEX "class_bookings_scheduled_class_id_idx" ON "class_bookings"("scheduled_class_id");

-- CreateIndex
CREATE INDEX "class_bookings_client_id_idx" ON "class_bookings"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_bookings_scheduled_class_id_client_id_key" ON "class_bookings"("scheduled_class_id", "client_id");

-- CreateIndex
CREATE INDEX "class_attendance_scheduled_class_id_idx" ON "class_attendance"("scheduled_class_id");

-- CreateIndex
CREATE INDEX "class_attendance_client_id_idx" ON "class_attendance"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendance_scheduled_class_id_client_id_key" ON "class_attendance"("scheduled_class_id", "client_id");

-- AddForeignKey
ALTER TABLE "class_types" ADD CONSTRAINT "class_types_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_class_type_id_fkey" FOREIGN KEY ("class_type_id") REFERENCES "class_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_scheduled_class_id_fkey" FOREIGN KEY ("scheduled_class_id") REFERENCES "scheduled_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_scheduled_class_id_fkey" FOREIGN KEY ("scheduled_class_id") REFERENCES "scheduled_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
