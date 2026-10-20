-- ═════════════════════════════════════════════════════════════════════
-- GYM-BOOKINGS 2A — Fundación de datos (EXPAND-FIRST, solo aditiva)
--
-- Parte 1: DDL generado por `prisma migrate diff` (schema origin/main →
--          schema 2A). Solo CREATE TYPE / ADD COLUMN (default o nullable)
--          / CREATE TABLE / índices / FKs. Sin DROP, RENAME ni ALTER COLUMN.
-- Parte 2: SQL fuera de Prisma: CHECKs, backfill idempotente, triggers de
--          integridad tenant/sede, contadores y append-only.
--
-- Atomicidad (certificado, no asumido — certify-gym-bookings-prisma-migrate.mjs
-- sobre PostgreSQL 17 desechable con Prisma 6.19.2):
--  * `prisma migrate deploy` y `prisma db execute` envían este archivo como
--    UN solo mensaje de "simple query"; PostgreSQL ejecuta un mensaje con
--    varias sentencias como una transacción implícita: si cualquier
--    sentencia falla no queda esquema parcial (falla inyectada a mitad y al
--    final: 0 objetos nuevos) y la migración queda "failed" con el error
--    real en _prisma_migrations.logs.
--  * SIN BEGIN/COMMIT explícitos a propósito: con BEGIN explícito la sesión
--    queda en un bloque abortado, Prisma no puede escribir
--    _prisma_migrations.logs y reporta "current transaction is aborted" en
--    lugar del error real (medido en la misma certificación).
--  * Todas las sentencias son transaccionales: sin CONCURRENTLY, sin
--    ALTER TYPE … ADD VALUE, sin VACUUM, sin control de transacción
--    (lo verifica gym-bookings-foundation.migration.test.ts).
--  * PROHIBIDO aplicarlo con ejecutores sentencia por sentencia. Si alguna
--    vez se usa psql: `psql -1 -v ON_ERROR_STOP=1 -f migration.sql`.
--
-- Contratos e invariantes: docs/modules/gym-bookings-summary.md
-- Reversión / recuperación Prisma 6: docs/modules/gym-bookings-summary.md §7.3
-- ═════════════════════════════════════════════════════════════════════


-- CreateEnum
CREATE TYPE "GymClientModality" AS ENUM ('NORMAL', 'PERSONALIZED', 'GROUP');

-- CreateEnum
CREATE TYPE "GymSessionKind" AS ENUM ('OPEN', 'GROUP', 'PERSONALIZED');

-- CreateEnum
CREATE TYPE "GymBookingChannel" AS ENUM ('STAFF', 'PORTAL', 'TRAINER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "GymBookingCancellationType" AS ENUM ('CLIENT_IN_POLICY', 'CLIENT_LATE', 'STAFF', 'SESSION_CANCELLED');

-- CreateEnum
CREATE TYPE "GymSessionConsumption" AS ENUM ('NOT_APPLICABLE', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "GymBookingCommand" AS ENUM ('BOOK_SESSION', 'CANCEL_BOOKING', 'CANCEL_SESSION', 'RECORD_ATTENDANCE');

-- CreateEnum
CREATE TYPE "GymBookingEventType" AS ENUM ('BOOKED', 'REACTIVATED', 'CANCELLED', 'SESSION_CANCELLED', 'ATTENDANCE_RECORDED', 'ATTENDANCE_UPDATED');

-- AlterTable
ALTER TABLE "membership_plans" ADD COLUMN     "modality" "GymClientModality" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "modality" "GymClientModality" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "modality_changed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "client_memberships" ADD COLUMN     "assigned_trainer_id" TEXT,
ADD COLUMN     "modality" "GymClientModality" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "sessions_total" INTEGER,
ADD COLUMN     "sessions_used" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "trainers" ADD COLUMN     "personalized_capacity" INTEGER;

-- AlterTable
ALTER TABLE "scheduled_classes" ADD COLUMN     "booked_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_user_id" TEXT,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completed_by_user_id" TEXT,
ADD COLUMN     "ends_at" TIMESTAMPTZ(3),
ADD COLUMN     "series_id" TEXT,
ADD COLUMN     "session_kind" "GymSessionKind" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "starts_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "class_bookings" ADD COLUMN     "booked_by_user_id" TEXT,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancellation_type" "GymBookingCancellationType",
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_user_id" TEXT,
ADD COLUMN     "channel" "GymBookingChannel",
ADD COLUMN     "client_membership_id" TEXT,
ADD COLUMN     "consumption" "GymSessionConsumption" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "class_attendance" ADD COLUMN     "booking_id" TEXT,
ADD COLUMN     "recorded_at" TIMESTAMP(3),
ADD COLUMN     "recorded_by_user_id" TEXT,
ADD COLUMN     "tenant_id" TEXT,
ADD COLUMN     "training_notes" TEXT;

-- AlterTable
ALTER TABLE "gym_settings" ADD COLUMN     "apply_policy_to_open" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attendance_edit_window_hours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "booking_horizon_days" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "booking_min_lead_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_min_lead_minutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "group_booking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "late_cancel_consumes_session" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "personalized_booking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "personalized_default_capacity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "series_generation_weeks" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "class_series" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "class_type_id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "session_kind" "GymSessionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "capacity" INTEGER,
    "room_name" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "generated_until" DATE,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_time_off" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "reason" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_class_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scheduled_class_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_class_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_attendance_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_attendance_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_modality_changes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "from_modality" "GymClientModality" NOT NULL,
    "to_modality" "GymClientModality" NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_user_id" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_modality_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_booking_operations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT,
    "command" "GymBookingCommand" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "channel" "GymBookingChannel",
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_booking_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_booking_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "scheduled_class_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_membership_id" TEXT,
    "event_type" "GymBookingEventType" NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus",
    "consumption_before" "GymSessionConsumption",
    "consumption_after" "GymSessionConsumption",
    "cancellation_type" "GymBookingCancellationType",
    "channel" "GymBookingChannel",
    "actor_user_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_series_tenant_id_location_id_status_idx" ON "class_series"("tenant_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "class_series_trainer_id_weekday_idx" ON "class_series"("trainer_id", "weekday");

-- CreateIndex
CREATE INDEX "class_series_class_type_id_idx" ON "class_series"("class_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_series_id_tenant_id_key" ON "class_series"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "trainer_time_off_trainer_id_starts_on_ends_on_idx" ON "trainer_time_off"("trainer_id", "starts_on", "ends_on");

-- CreateIndex
CREATE INDEX "trainer_time_off_tenant_id_location_id_idx" ON "trainer_time_off"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "gym_activities_tenant_id_status_sort_order_idx" ON "gym_activities"("tenant_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "gym_activities_location_id_idx" ON "gym_activities"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_activities_id_tenant_id_key" ON "gym_activities"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_activities_tenant_id_code_key" ON "gym_activities"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "gym_activities_tenant_id_name_key" ON "gym_activities"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "scheduled_class_activities_tenant_id_activity_id_idx" ON "scheduled_class_activities"("tenant_id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_class_activities_scheduled_class_id_activity_id_key" ON "scheduled_class_activities"("scheduled_class_id", "activity_id");

-- CreateIndex
CREATE INDEX "class_attendance_activities_tenant_id_activity_id_idx" ON "class_attendance_activities"("tenant_id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendance_activities_attendance_id_activity_id_key" ON "class_attendance_activities"("attendance_id", "activity_id");

-- CreateIndex
CREATE INDEX "client_modality_changes_client_id_changed_at_idx" ON "client_modality_changes"("client_id", "changed_at");

-- CreateIndex
CREATE INDEX "client_modality_changes_tenant_id_changed_at_idx" ON "client_modality_changes"("tenant_id", "changed_at");

-- CreateIndex
CREATE INDEX "gym_booking_operations_tenant_id_created_at_idx" ON "gym_booking_operations"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gym_booking_operations_tenant_id_idempotency_key_key" ON "gym_booking_operations"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "gym_booking_operations_id_tenant_id_key" ON "gym_booking_operations"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "class_booking_events_booking_id_occurred_at_idx" ON "class_booking_events"("booking_id", "occurred_at");

-- CreateIndex
CREATE INDEX "class_booking_events_tenant_id_occurred_at_idx" ON "class_booking_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "class_booking_events_tenant_id_client_id_occurred_at_idx" ON "class_booking_events"("tenant_id", "client_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_booking_events_operation_id_booking_id_key" ON "class_booking_events"("operation_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_id_tenant_id_key" ON "branches"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "membership_plans_tenant_id_modality_status_idx" ON "membership_plans"("tenant_id", "modality", "status");

-- CreateIndex
CREATE INDEX "clients_tenant_id_modality_idx" ON "clients"("tenant_id", "modality");

-- CreateIndex
CREATE UNIQUE INDEX "clients_id_tenant_id_key" ON "clients"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "client_memberships_client_id_status_end_date_idx" ON "client_memberships"("client_id", "status", "end_date");

-- CreateIndex
CREATE INDEX "client_memberships_assigned_trainer_id_idx" ON "client_memberships"("assigned_trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_memberships_id_client_id_key" ON "client_memberships"("id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_id_tenant_id_key" ON "trainers"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_types_id_tenant_id_key" ON "class_types"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "scheduled_classes_tenant_id_branch_id_class_date_idx" ON "scheduled_classes"("tenant_id", "branch_id", "class_date");

-- CreateIndex
CREATE INDEX "scheduled_classes_tenant_id_session_kind_starts_at_idx" ON "scheduled_classes"("tenant_id", "session_kind", "starts_at");

-- CreateIndex
CREATE INDEX "scheduled_classes_trainer_id_starts_at_idx" ON "scheduled_classes"("trainer_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_classes_series_id_class_date_key" ON "scheduled_classes"("series_id", "class_date");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_classes_id_tenant_id_key" ON "scheduled_classes"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "class_bookings_tenant_id_client_id_booking_status_idx" ON "class_bookings"("tenant_id", "client_id", "booking_status");

-- CreateIndex
CREATE INDEX "class_bookings_client_membership_id_idx" ON "class_bookings"("client_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_bookings_id_tenant_id_scheduled_class_id_client_id_key" ON "class_bookings"("id", "tenant_id", "scheduled_class_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendance_booking_id_key" ON "class_attendance"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendance_id_tenant_id_key" ON "class_attendance"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_memberships_id_tenant_id_client_id_key" ON "client_memberships"("id", "tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "gym_booking_operations_location_id_tenant_id_idx" ON "gym_booking_operations"("location_id", "tenant_id");

-- CreateIndex
CREATE INDEX "class_booking_events_client_membership_id_idx" ON "class_booking_events"("client_membership_id");

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_assigned_trainer_id_tenant_id_fkey" FOREIGN KEY ("assigned_trainer_id", "tenant_id") REFERENCES "trainers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_classes" ADD CONSTRAINT "scheduled_classes_series_id_tenant_id_fkey" FOREIGN KEY ("series_id", "tenant_id") REFERENCES "class_series"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_client_membership_id_client_id_fkey" FOREIGN KEY ("client_membership_id", "client_id") REFERENCES "client_memberships"("id", "client_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "class_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_location_id_tenant_id_fkey" FOREIGN KEY ("location_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_class_type_id_tenant_id_fkey" FOREIGN KEY ("class_type_id", "tenant_id") REFERENCES "class_types"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_trainer_id_tenant_id_fkey" FOREIGN KEY ("trainer_id", "tenant_id") REFERENCES "trainers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_location_id_tenant_id_fkey" FOREIGN KEY ("location_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_trainer_id_tenant_id_fkey" FOREIGN KEY ("trainer_id", "tenant_id") REFERENCES "trainers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gym_activities" ADD CONSTRAINT "gym_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gym_activities" ADD CONSTRAINT "gym_activities_location_id_tenant_id_fkey" FOREIGN KEY ("location_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_class_activities" ADD CONSTRAINT "scheduled_class_activities_scheduled_class_id_tenant_id_fkey" FOREIGN KEY ("scheduled_class_id", "tenant_id") REFERENCES "scheduled_classes"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_class_activities" ADD CONSTRAINT "scheduled_class_activities_activity_id_tenant_id_fkey" FOREIGN KEY ("activity_id", "tenant_id") REFERENCES "gym_activities"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_attendance_activities" ADD CONSTRAINT "class_attendance_activities_attendance_id_tenant_id_fkey" FOREIGN KEY ("attendance_id", "tenant_id") REFERENCES "class_attendance"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_attendance_activities" ADD CONSTRAINT "class_attendance_activities_activity_id_tenant_id_fkey" FOREIGN KEY ("activity_id", "tenant_id") REFERENCES "gym_activities"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "client_modality_changes" ADD CONSTRAINT "client_modality_changes_client_id_tenant_id_fkey" FOREIGN KEY ("client_id", "tenant_id") REFERENCES "clients"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gym_booking_operations" ADD CONSTRAINT "gym_booking_operations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_booking_events" ADD CONSTRAINT "class_booking_events_operation_id_tenant_id_fkey" FOREIGN KEY ("operation_id", "tenant_id") REFERENCES "gym_booking_operations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_booking_events" ADD CONSTRAINT "class_booking_events_booking_id_tenant_id_scheduled_class__fkey" FOREIGN KEY ("booking_id", "tenant_id", "scheduled_class_id", "client_id") REFERENCES "class_bookings"("id", "tenant_id", "scheduled_class_id", "client_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey (H03: referencias auxiliares de modelos nuevos, siempre con tenant_id)
ALTER TABLE "gym_booking_operations" ADD CONSTRAINT "gym_booking_operations_location_id_tenant_id_fkey" FOREIGN KEY ("location_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_booking_events" ADD CONSTRAINT "class_booking_events_client_membership_id_tenant_id_client_fkey" FOREIGN KEY ("client_membership_id", "tenant_id", "client_id") REFERENCES "client_memberships"("id", "tenant_id", "client_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey (H02) — editado a mano: NOT VALID. Prisma genera la FK
-- validada; NOT VALID la hace cumplir en todo INSERT y en todo UPDATE que
-- cambie (branch_id, tenant_id), y en cambios del lado branches (RESTRICT),
-- SIN revalidar filas heredadas inconsistentes (PRE_TRAINER_BRANCH_TENANT_MISMATCH).
-- MATCH SIMPLE: un entrenador heredado con tenant_id NULL no se evalúa.
-- VALIDATE CONSTRAINT se hará en una migración posterior, con preflight = 0.
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_branch_id_tenant_id_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;

-- ═════════════════════════════════════════════════════════════════════
-- PARTE 2 — SQL fuera de Prisma (Prisma no gestiona CHECKs ni triggers;
-- no generan drift en `migrate diff`).
-- ═════════════════════════════════════════════════════════════════════

-- ── 2.0 Coordinación de concurrencia padre↔hijo (H01) ────────────────
-- Una FK solo toma FOR KEY SHARE sobre el padre, que NO choca con un
-- UPDATE de columnas no clave (FOR NO KEY UPDATE). branch_id, location_id,
-- session_kind o scheduled_class_id no son clave, así que validar "leyendo"
-- el padre sin lock permite que padre e hijo confirmen a la vez dejando
-- datos inconsistentes. Protocolo (certificado con dos conexiones reales en
-- certify-gym-bookings-concurrency.mjs, ambos órdenes):
--  (1) LADO HIJO: todo trigger que valida contra un padre lo lee con lock:
--        FOR SHARE      si la columna validada no es clave (sede, modalidad);
--        FOR KEY SHARE  si solo valida tenant_id, que ES columna clave por los
--                       unique (id, tenant_id[, …]) de 2A: cambiarlo exige
--                       FOR UPDATE, que sí choca con KEY SHARE. KEY SHARE no
--                       choca con el UPDATE de contadores (NO KEY UPDATE):
--                       dos reservas concurrentes no se interbloquean.
--      Padre primero → el hijo espera y relee la versión confirmada.
--      Hijo primero  → el UPDATE del padre espera; su guarda corre después
--                      con una instantánea nueva y ve al hijo confirmado.
--  (2) LADO PADRE con dos padres de un mismo hijo (actividad y sesión de
--      scheduled_class_activities / class_attendance_activities): la guarda
--      bloquea las filas HOJA compartidas (FOR NO KEY UPDATE, ORDER BY id)
--      antes de evaluar; la segunda espera y reevalúa.
--  (3) AISLAMIENTO: (1) y (2) requieren que la guarda del padre lea con
--      instantánea nueva por sentencia = READ COMMITTED (default de
--      PostgreSQL y de Prisma). Un cambio ESTRUCTURAL de padre bajo
--      REPEATABLE READ / SERIALIZABLE no vería al hijo confirmado mientras
--      esperaba: se rechaza (GYM_ISOLATION_UNSUPPORTED, fallo cerrado).
--      Un hijo bajo REPEATABLE READ que espera a un padre modificado recibe
--      40001 de PostgreSQL (también fallo cerrado).
--  (4) ORDEN DE LOCKS (extensión de GYM_BOOKING_LOCK_ORDER):
--      advisory → trainers → class_series → trainer_time_off → clients →
--      client_memberships → scheduled_classes → class_bookings →
--      class_attendance → gym_activities → scheduled_class_activities →
--      class_attendance_activities. Las tablas nuevas cuelgan de su padre
--      (series/ausencias tras trainers; actividades y filas hoja al final).
--      Excepción inevitable: un UPDATE que re-apunta un hijo a otro padre
--      (mover una asistencia de sesión, cambiar el entrenador de una serie)
--      bloquea la fila hija antes que el padre nuevo. El llamador debe
--      bloquear antes el padre destino; si no, el peor caso es un 40P01
--      detectado por PostgreSQL (se pierde la operación, nunca la
--      integridad) → booking-db-errors lo traduce a CONCURRENT_UPDATE_RETRY.
-- Sin locks globales ni de tabla: solo filas de los padres/hojas implicados.

CREATE OR REPLACE FUNCTION "gym_require_read_committed"() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'GYM_ISOLATION_UNSUPPORTED: structural change of a gym parent row requires READ COMMITTED (current: %)',
      current_setting('transaction_isolation')
      USING ERRCODE = 'feature_not_supported';
  END IF;
END;
$$;

-- ── 2.1 CHECK constraints ────────────────────────────────────────────
-- Todas las filas existentes los cumplen por construcción (columnas nuevas
-- con default). NO se agrega `booked_count <= capacity`: el flujo heredado
-- (reactivación sin control de cupo) puede superar el cupo y 2A no cambia
-- ese comportamiento. Se agregará NOT VALID en 2B, cuando el servicio
-- transaccional reemplace a las acciones heredadas, y se validará después
-- de la limpieza aprobada por base.

ALTER TABLE "scheduled_classes"
  ADD CONSTRAINT "scheduled_classes_booked_count_nonneg_chk"
  CHECK ("booked_count" >= 0);

ALTER TABLE "scheduled_classes"
  ADD CONSTRAINT "scheduled_classes_instants_chk"
  CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");

ALTER TABLE "client_memberships"
  ADD CONSTRAINT "client_memberships_sessions_chk"
  CHECK (
    "sessions_used" >= 0
    AND ("sessions_total" IS NULL OR ("sessions_total" >= 0 AND "sessions_used" <= "sessions_total"))
  );

ALTER TABLE "trainers"
  ADD CONSTRAINT "trainers_personalized_capacity_chk"
  CHECK ("personalized_capacity" IS NULL OR "personalized_capacity" >= 1);

-- Una reserva que consume (o liberó) sesión siempre está ligada a la
-- membresía de la que consume. Las reservas heredadas son NOT_APPLICABLE.
ALTER TABLE "class_bookings"
  ADD CONSTRAINT "class_bookings_consumption_membership_chk"
  CHECK ("consumption" = 'NOT_APPLICABLE' OR "client_membership_id" IS NOT NULL);

ALTER TABLE "gym_settings"
  ADD CONSTRAINT "gym_settings_booking_policy_chk"
  CHECK (
    "personalized_default_capacity" >= 1
    AND "booking_horizon_days" BETWEEN 1 AND 365
    AND "booking_min_lead_minutes" >= 0
    AND "cancel_min_lead_minutes" >= 0
    AND "attendance_edit_window_hours" >= 0
    AND "series_generation_weeks" BETWEEN 1 AND 26
  );

ALTER TABLE "class_series"
  ADD CONSTRAINT "class_series_shape_chk"
  CHECK (
    "weekday" BETWEEN 0 AND 6
    AND ("capacity" IS NULL OR "capacity" >= 1)
    AND "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "start_time" < "end_time"
    AND ("valid_until" IS NULL OR "valid_until" >= "valid_from")
  );

ALTER TABLE "trainer_time_off"
  ADD CONSTRAINT "trainer_time_off_shape_chk"
  CHECK (
    "ends_on" >= "starts_on"
    AND (
      ("start_time" IS NULL AND "end_time" IS NULL)
      OR (
        "start_time" IS NOT NULL AND "end_time" IS NOT NULL
        AND "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND ("ends_on" > "starts_on" OR "start_time" < "end_time")
      )
    )
  );

-- Idempotencia de comando: clave acotada y huella sha256 hex.
ALTER TABLE "gym_booking_operations"
  ADD CONSTRAINT "gym_booking_operations_shape_chk"
  CHECK (
    char_length("idempotency_key") BETWEEN 8 AND 200
    AND "request_fingerprint" ~ '^[0-9a-f]{64}$'
  );

-- ── 2.2 Backfill idempotente (ANTES de crear los triggers) ───────────
-- Solo completa columnas nuevas; no modifica datos heredados existentes.
-- Las filas cuyo scheduled_class no tiene tenant_id quedan con NULL y las
-- reporta el preflight (no se inventa el tenant).

UPDATE "class_bookings" b
   SET "tenant_id" = s."tenant_id"
  FROM "scheduled_classes" s
 WHERE b."scheduled_class_id" = s."id"
   AND b."tenant_id" IS NULL
   AND s."tenant_id" IS NOT NULL;

UPDATE "class_attendance" a
   SET "tenant_id" = s."tenant_id"
  FROM "scheduled_classes" s
 WHERE a."scheduled_class_id" = s."id"
   AND a."tenant_id" IS NULL
   AND s."tenant_id" IS NOT NULL;

-- (scheduled_class_id, client_id) es único en ambas tablas → vínculo 1:1.
UPDATE "class_attendance" a
   SET "booking_id" = b."id"
  FROM "class_bookings" b
 WHERE a."booking_id" IS NULL
   AND b."scheduled_class_id" = a."scheduled_class_id"
   AND b."client_id" = a."client_id";

-- booked_count = reservas confirmadas reales (puede superar capacity en
-- datos heredados: se refleja tal cual y el preflight lo reporta).
UPDATE "scheduled_classes" s
   SET "booked_count" = c."n"
  FROM (
    SELECT "scheduled_class_id", COUNT(*)::int AS "n"
      FROM "class_bookings"
     WHERE "booking_status" = 'confirmed'
     GROUP BY "scheduled_class_id"
  ) c
 WHERE c."scheduled_class_id" = s."id"
   AND s."booked_count" IS DISTINCT FROM c."n";

-- sessions_used: todas las reservas existentes son NOT_APPLICABLE → 0
-- (sin consumo retroactivo). No requiere backfill.

-- ── 2.3 Integridad tenant de class_bookings ──────────────────────────
-- BEFORE INSERT/UPDATE de columnas de identidad:
--  * tenant_id NULL → se deriva de la sesión (o del cliente si la sesión
--    heredada no lo tiene).
--  * Rechaza si tenant_id difiere del de la sesión, del cliente o de la
--    membresía, o si la membresía es de otro cliente.
-- No se dispara en cancelaciones/reactivaciones heredadas (solo cambian
-- booking_status / booked_at).

CREATE OR REPLACE FUNCTION "gym_class_bookings_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_session_tenant TEXT;
  v_client_tenant  TEXT;
  v_m_client       TEXT;
  v_m_tenant       TEXT;
BEGIN
  -- 2.0 (1): solo se valida tenant_id (columna clave en los tres padres) →
  -- FOR KEY SHARE, en orden clients → client_memberships → scheduled_classes.
  SELECT "tenant_id" INTO v_client_tenant FROM "clients" WHERE "id" = NEW."client_id" FOR KEY SHARE;
  IF NEW."client_membership_id" IS NOT NULL THEN
    SELECT "client_id", "tenant_id" INTO v_m_client, v_m_tenant
      FROM "client_memberships" WHERE "id" = NEW."client_membership_id" FOR KEY SHARE;
  END IF;
  SELECT "tenant_id" INTO v_session_tenant FROM "scheduled_classes" WHERE "id" = NEW."scheduled_class_id" FOR KEY SHARE;

  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := COALESCE(v_session_tenant, v_client_tenant);
  END IF;

  IF v_session_tenant IS NOT NULL AND NEW."tenant_id" IS DISTINCT FROM v_session_tenant THEN
    RAISE EXCEPTION 'GYM_TENANT_MISMATCH: class_bookings.tenant_id does not match scheduled_classes.tenant_id'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_client_tenant IS NOT NULL AND NEW."tenant_id" IS DISTINCT FROM v_client_tenant THEN
    RAISE EXCEPTION 'GYM_TENANT_MISMATCH: class_bookings.tenant_id does not match clients.tenant_id'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."client_membership_id" IS NOT NULL THEN
    IF v_m_client IS DISTINCT FROM NEW."client_id" THEN
      RAISE EXCEPTION 'GYM_MEMBERSHIP_CLIENT_MISMATCH: client_membership does not belong to booking client'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_m_tenant IS NOT NULL AND NEW."tenant_id" IS DISTINCT FROM v_m_tenant THEN
      RAISE EXCEPTION 'GYM_TENANT_MISMATCH: class_bookings.tenant_id does not match client_memberships.tenant_id'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_class_bookings_integrity_trg"
  BEFORE INSERT OR UPDATE OF "scheduled_class_id", "client_id", "tenant_id", "client_membership_id"
  ON "class_bookings"
  FOR EACH ROW EXECUTE FUNCTION "gym_class_bookings_integrity"();

-- ── 2.4 Contadores (fuente única de verdad) ──────────────────────────
-- I1: scheduled_classes.booked_count  = #reservas booking_status='confirmed'
-- I2: client_memberships.sessions_used = #reservas consumption='CONSUMED'
-- Mantenidos SOLO por este trigger, para TODA ruta de escritura (acciones
-- heredadas, servicio 2B, scripts de purga). Orden de bloqueo dentro del
-- trigger: client_memberships → scheduled_classes; misma tabla por id.
-- Si sessions_used superaría sessions_total, el CHECK aborta la escritura.

CREATE OR REPLACE FUNCTION "gym_class_bookings_counters"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_seat INT := 0;
  new_seat INT := 0;
  old_use  INT := 0;
  new_use  INT := 0;
  old_s    TEXT;
  new_s    TEXT;
  old_m    TEXT;
  new_m    TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_s := OLD."scheduled_class_id";
    old_m := OLD."client_membership_id";
    IF OLD."booking_status" = 'confirmed' THEN old_seat := 1; END IF;
    IF OLD."consumption" = 'CONSUMED' AND old_m IS NOT NULL THEN old_use := 1; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_s := NEW."scheduled_class_id";
    new_m := NEW."client_membership_id";
    IF NEW."booking_status" = 'confirmed' THEN new_seat := 1; END IF;
    IF NEW."consumption" = 'CONSUMED' AND new_m IS NOT NULL THEN new_use := 1; END IF;
  END IF;

  -- 1) Membresías (sessions_used)
  IF old_m IS NOT DISTINCT FROM new_m THEN
    IF new_m IS NOT NULL AND new_use <> old_use THEN
      UPDATE "client_memberships" SET "sessions_used" = "sessions_used" + (new_use - old_use) WHERE "id" = new_m;
    END IF;
  ELSIF old_use = 1 AND new_use = 1 AND old_m < new_m THEN
    UPDATE "client_memberships" SET "sessions_used" = "sessions_used" - 1 WHERE "id" = old_m;
    UPDATE "client_memberships" SET "sessions_used" = "sessions_used" + 1 WHERE "id" = new_m;
  ELSIF old_use = 1 AND new_use = 1 THEN
    UPDATE "client_memberships" SET "sessions_used" = "sessions_used" + 1 WHERE "id" = new_m;
    UPDATE "client_memberships" SET "sessions_used" = "sessions_used" - 1 WHERE "id" = old_m;
  ELSIF old_use = 1 THEN
    UPDATE "client_memberships" SET "sessions_used" = "sessions_used" - 1 WHERE "id" = old_m;
  ELSIF new_use = 1 THEN
    UPDATE "client_memberships" SET "sessions_used" = "sessions_used" + 1 WHERE "id" = new_m;
  END IF;

  -- 2) Sesiones (booked_count)
  IF old_s IS NOT DISTINCT FROM new_s THEN
    IF new_s IS NOT NULL AND new_seat <> old_seat THEN
      UPDATE "scheduled_classes" SET "booked_count" = "booked_count" + (new_seat - old_seat) WHERE "id" = new_s;
    END IF;
  ELSIF old_seat = 1 AND new_seat = 1 AND old_s < new_s THEN
    UPDATE "scheduled_classes" SET "booked_count" = "booked_count" - 1 WHERE "id" = old_s;
    UPDATE "scheduled_classes" SET "booked_count" = "booked_count" + 1 WHERE "id" = new_s;
  ELSIF old_seat = 1 AND new_seat = 1 THEN
    UPDATE "scheduled_classes" SET "booked_count" = "booked_count" + 1 WHERE "id" = new_s;
    UPDATE "scheduled_classes" SET "booked_count" = "booked_count" - 1 WHERE "id" = old_s;
  ELSIF old_seat = 1 THEN
    UPDATE "scheduled_classes" SET "booked_count" = "booked_count" - 1 WHERE "id" = old_s;
  ELSIF new_seat = 1 THEN
    UPDATE "scheduled_classes" SET "booked_count" = "booked_count" + 1 WHERE "id" = new_s;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "gym_class_bookings_counters_trg"
  AFTER INSERT OR DELETE OR UPDATE OF "booking_status", "consumption", "scheduled_class_id", "client_membership_id"
  ON "class_bookings"
  FOR EACH ROW EXECUTE FUNCTION "gym_class_bookings_counters"();

-- Guardas: la aplicación no puede escribir los contadores directamente.
-- Solo se permiten cambios anidados desde el trigger de contadores
-- (pg_trigger_depth() >= 2) o en una reconciliación explícita dentro de
-- una transacción aprobada:
--   SELECT set_config('zolvi.gym_counters_reconcile', 'on', true);

CREATE OR REPLACE FUNCTION "gym_guard_booking_counters"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_old INT;
  v_new INT;
BEGIN
  IF COALESCE(current_setting('zolvi.gym_counters_reconcile', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  v_new := (to_jsonb(NEW) ->> v_col)::int;
  IF TG_OP = 'INSERT' THEN
    IF v_new <> 0 THEN
      RAISE EXCEPTION 'GYM_COUNTER_READONLY: %.% must start at 0', TG_TABLE_NAME, v_col
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  v_old := (to_jsonb(OLD) ->> v_col)::int;
  IF v_new IS DISTINCT FROM v_old AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'GYM_COUNTER_READONLY: %.% is maintained by gym_class_bookings_counters', TG_TABLE_NAME, v_col
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_scheduled_classes_booked_count_guard_trg"
  BEFORE INSERT OR UPDATE OF "booked_count" ON "scheduled_classes"
  FOR EACH ROW EXECUTE FUNCTION "gym_guard_booking_counters"('booked_count');

CREATE TRIGGER "gym_client_memberships_sessions_used_guard_trg"
  BEFORE INSERT OR UPDATE OF "sessions_used" ON "client_memberships"
  FOR EACH ROW EXECUTE FUNCTION "gym_guard_booking_counters"('sessions_used');

-- ── 2.5 Integridad tenant de class_attendance ────────────────────────
-- Cierra a nivel BD el hallazgo H5 de la auditoría (asistencia con
-- client_id de otro tenant en runtime Shared). Además vincula booking_id
-- automáticamente cuando existe la reserva (sesión, cliente).
-- No se dispara en el update heredado (attendance_status/notes/checked_in_at).

CREATE OR REPLACE FUNCTION "gym_class_attendance_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_session_tenant TEXT;
  v_client_tenant  TEXT;
  v_b_session      TEXT;
  v_b_client       TEXT;
  v_moved          BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_moved := NEW."scheduled_class_id" IS DISTINCT FROM OLD."scheduled_class_id";
  END IF;
  -- 2.0 (1): tenant_id es clave en clients y scheduled_classes → KEY SHARE.
  -- Mover la asistencia a otra sesión además valida la SEDE de la sesión
  -- destino frente a las actividades por alumno → FOR SHARE (branch_id no
  -- es clave) y, como padre de class_attendance_activities, bloquea esas
  -- filas hoja (2.0 (2)) y exige READ COMMITTED (2.0 (3)).
  SELECT "tenant_id" INTO v_client_tenant FROM "clients" WHERE "id" = NEW."client_id" FOR KEY SHARE;
  IF v_moved THEN
    PERFORM "gym_require_read_committed"();
    SELECT "tenant_id" INTO v_session_tenant FROM "scheduled_classes" WHERE "id" = NEW."scheduled_class_id" FOR SHARE;
    PERFORM 1 FROM "class_attendance_activities" WHERE "attendance_id" = NEW."id" ORDER BY "id" FOR NO KEY UPDATE;
  ELSE
    SELECT "tenant_id" INTO v_session_tenant FROM "scheduled_classes" WHERE "id" = NEW."scheduled_class_id" FOR KEY SHARE;
  END IF;

  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := COALESCE(v_session_tenant, v_client_tenant);
  END IF;
  IF v_session_tenant IS NOT NULL AND NEW."tenant_id" IS DISTINCT FROM v_session_tenant THEN
    RAISE EXCEPTION 'GYM_TENANT_MISMATCH: class_attendance.tenant_id does not match scheduled_classes.tenant_id'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_client_tenant IS NOT NULL AND NEW."tenant_id" IS DISTINCT FROM v_client_tenant THEN
    RAISE EXCEPTION 'GYM_TENANT_MISMATCH: class_attendance.tenant_id does not match clients.tenant_id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Mutación del "padre" de las actividades por alumno: mover la asistencia
  -- a otra sesión no puede dejar actividades de sede fuera de su sede.
  IF v_moved AND EXISTS (
       SELECT 1 FROM "class_attendance_activities" aa
         JOIN "gym_activities" ga ON ga."id" = aa."activity_id"
         JOIN "scheduled_classes" s ON s."id" = NEW."scheduled_class_id"
        WHERE aa."attendance_id" = NEW."id"
          AND ga."location_id" IS NOT NULL
          AND ga."location_id" IS DISTINCT FROM s."branch_id") THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_LOCATION_CONFLICT: class_attendance has activities of another location'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (scheduled_class_id, client_id) son columnas clave de class_bookings → KEY SHARE.
  IF NEW."booking_id" IS NULL THEN
    SELECT "id" INTO NEW."booking_id" FROM "class_bookings"
     WHERE "scheduled_class_id" = NEW."scheduled_class_id" AND "client_id" = NEW."client_id" FOR KEY SHARE;
  ELSE
    SELECT "scheduled_class_id", "client_id" INTO v_b_session, v_b_client
      FROM "class_bookings" WHERE "id" = NEW."booking_id" FOR KEY SHARE;
    IF v_b_session IS DISTINCT FROM NEW."scheduled_class_id" OR v_b_client IS DISTINCT FROM NEW."client_id" THEN
      RAISE EXCEPTION 'GYM_ATTENDANCE_BOOKING_MISMATCH: booking does not match attendance session/client'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_class_attendance_integrity_trg"
  BEFORE INSERT OR UPDATE OF "scheduled_class_id", "client_id", "tenant_id", "booking_id"
  ON "class_attendance"
  FOR EACH ROW EXECUTE FUNCTION "gym_class_attendance_integrity"();

-- ── 2.6 Tenant y sede de referencias nuevas ──────────────────────────
-- El tenant de toda referencia DESDE un modelo nuevo lo garantizan FKs
-- compuestas (parte 1). Aquí quedan las reglas que una FK no expresa:
--  (a) sede: el entrenador de una serie/ausencia pertenece a esa sede;
--  (b) referencias nuevas desde tablas heredadas con tenant_id NULLable
--      (scheduled_classes.series_id, client_memberships.assigned_trainer_id):
--      con tenant_id NULL la FK compuesta MATCH SIMPLE no se evalúa, así que
--      el trigger exige tenant_id y valida tenant + sede explícitamente;
--  (c) actividades de una sede solo en sesiones de esa sede.
-- Ninguno se dispara en escrituras heredadas: las columnas nuevas llegan
-- NULL y la función retorna de inmediato.

-- VIGENCIA (misma definición en los triggers de padre de la sección 2.8;
-- margen de 1 día por diferencia entre fecha del servidor y del gimnasio,
-- a favor del fallo cerrado):
--   serie vigente   : status = 'active' AND (valid_until IS NULL OR valid_until >= CURRENT_DATE - 1)
--   ausencia vigente: status = 'active' AND ends_on >= CURRENT_DATE - 1
-- Una fila NO vigente es historial: conserva la sede que tenía.
-- SEMÁNTICA TEMPORAL (H04): CURRENT_DATE es la fecha del INICIO de la
-- transacción en el TimeZone de la SESIÓN PostgreSQL (GUC TimeZone: default
-- del servidor, o el que fije la conexión), no la del gimnasio ni la de la
-- organización. Las fechas de fin son fechas locales del gimnasio. Con un
-- TimeZone de sesión de desfase ≤ +12 h (UTC incluido), la fecha local de
-- cualquier zona IANA (desfase ≥ −12 h) es ≥ CURRENT_DATE − 1, así que lo
-- que sigue vigente en el gimnasio NUNCA se trata como historial (fallo
-- cerrado). El costo es conservador: un registro terminado puede seguir
-- "vigente" hasta 2 días locales. El preflight PRE_DB_TIMEZONE_MARGIN_UNSAFE
-- detecta un TimeZone de sesión que rompa esa cota.

CREATE OR REPLACE FUNCTION "gym_trainer_location_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_branch        TEXT;
  v_new_effective BOOLEAN;
  v_old_effective BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'class_series' THEN
    v_new_effective := NEW."status" = 'active' AND (NEW."valid_until" IS NULL OR NEW."valid_until" >= CURRENT_DATE - 1);
  ELSE
    v_new_effective := NEW."status" = 'active' AND NEW."ends_on" >= CURRENT_DATE - 1;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."trainer_id" IS NOT DISTINCT FROM OLD."trainer_id"
     AND NEW."location_id" IS NOT DISTINCT FROM OLD."location_id" THEN
    -- Solo cambió estado/vigencia: validar únicamente si la fila PASA a ser
    -- vigente (reactivar o extender un registro histórico de otra sede).
    IF TG_TABLE_NAME = 'class_series' THEN
      v_old_effective := OLD."status" = 'active' AND (OLD."valid_until" IS NULL OR OLD."valid_until" >= CURRENT_DATE - 1);
    ELSE
      v_old_effective := OLD."status" = 'active' AND OLD."ends_on" >= CURRENT_DATE - 1;
    END IF;
    IF NOT v_new_effective OR v_old_effective THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 2.0 (1): branch_id no es clave → FOR SHARE (choca con el UPDATE del entrenador).
  SELECT "branch_id" INTO v_branch FROM "trainers" WHERE "id" = NEW."trainer_id" FOR SHARE;
  IF v_branch IS DISTINCT FROM NEW."location_id" THEN
    RAISE EXCEPTION 'GYM_LOCATION_MISMATCH: %.location_id does not match trainers.branch_id', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_class_series_trainer_location_trg"
  BEFORE INSERT OR UPDATE OF "trainer_id", "location_id", "status", "valid_until" ON "class_series"
  FOR EACH ROW EXECUTE FUNCTION "gym_trainer_location_matches"();

CREATE TRIGGER "gym_trainer_time_off_trainer_location_trg"
  BEFORE INSERT OR UPDATE OF "trainer_id", "location_id", "status", "ends_on" ON "trainer_time_off"
  FOR EACH ROW EXECUTE FUNCTION "gym_trainer_location_matches"();

CREATE OR REPLACE FUNCTION "gym_scheduled_classes_series_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant   TEXT;
  v_location TEXT;
  v_kind     "GymSessionKind";
BEGIN
  IF NEW."series_id" IS NULL THEN
    RETURN NEW;
  END IF;
  -- UPDATE sin cambio real de identidad: una sesión HISTÓRICA (pasada,
  -- cancelada o completada) conserva los valores con que se generó aunque la
  -- serie haya cambiado después. Solo se revalida si la sesión vuelve a ser
  -- futura y programada (reactivación o reprogramación).
  IF TG_OP = 'UPDATE'
     AND NEW."series_id" IS NOT DISTINCT FROM OLD."series_id"
     AND NEW."tenant_id" IS NOT DISTINCT FROM OLD."tenant_id"
     AND NEW."branch_id" IS NOT DISTINCT FROM OLD."branch_id"
     AND NEW."session_kind" IS NOT DISTINCT FROM OLD."session_kind"
     AND NOT (
       NEW."status" IN ('scheduled', 'in_progress') AND NEW."class_date" >= CURRENT_DATE - 1
       AND NOT (OLD."status" IN ('scheduled', 'in_progress') AND OLD."class_date" >= CURRENT_DATE - 1)
     ) THEN
    RETURN NEW;
  END IF;
  -- 2.0 (1): location_id / session_kind no son clave → FOR SHARE.
  SELECT "tenant_id", "location_id", "session_kind" INTO v_tenant, v_location, v_kind
    FROM "class_series" WHERE "id" = NEW."series_id" FOR SHARE;
  IF NEW."tenant_id" IS NULL OR v_tenant IS DISTINCT FROM NEW."tenant_id" THEN
    RAISE EXCEPTION 'GYM_TENANT_MISMATCH: scheduled_classes.tenant_id must equal class_series.tenant_id'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_location IS DISTINCT FROM NEW."branch_id" THEN
    RAISE EXCEPTION 'GYM_LOCATION_MISMATCH: scheduled_classes.branch_id does not match class_series.location_id'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind IS DISTINCT FROM NEW."session_kind" THEN
    RAISE EXCEPTION 'GYM_SERIES_KIND_MISMATCH: scheduled_classes.session_kind does not match class_series.session_kind'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_scheduled_classes_series_integrity_trg"
  BEFORE INSERT OR UPDATE OF "series_id", "tenant_id", "branch_id", "session_kind", "status", "class_date" ON "scheduled_classes"
  FOR EACH ROW EXECUTE FUNCTION "gym_scheduled_classes_series_integrity"();

CREATE OR REPLACE FUNCTION "gym_client_memberships_trainer_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant TEXT;
  v_branch TEXT;
BEGIN
  IF NEW."assigned_trainer_id" IS NULL THEN
    RETURN NEW;
  END IF;
  -- UPDATE heredado que reenvía los mismos valores (p. ej. editar notas o
  -- estado): no revalida. La coherencia ante cambios del ENTRENADOR la
  -- garantiza gym_trainers_branch_guard (sección 2.8).
  -- Membresía vigente: status IN ('active','suspended') AND end_date >= CURRENT_DATE - 1.
  -- Reactivar o extender una membresía histórica sí revalida.
  IF TG_OP = 'UPDATE'
     AND NEW."assigned_trainer_id" IS NOT DISTINCT FROM OLD."assigned_trainer_id"
     AND NEW."tenant_id" IS NOT DISTINCT FROM OLD."tenant_id"
     AND NEW."branch_id" IS NOT DISTINCT FROM OLD."branch_id"
     AND NOT (
       NEW."status" IN ('active', 'suspended') AND NEW."end_date" >= CURRENT_DATE - 1
       AND NOT (OLD."status" IN ('active', 'suspended') AND OLD."end_date" >= CURRENT_DATE - 1)
     ) THEN
    RETURN NEW;
  END IF;
  -- 2.0 (1): branch_id no es clave → FOR SHARE.
  SELECT "tenant_id", "branch_id" INTO v_tenant, v_branch FROM "trainers" WHERE "id" = NEW."assigned_trainer_id" FOR SHARE;
  IF NEW."tenant_id" IS NULL OR v_tenant IS DISTINCT FROM NEW."tenant_id" THEN
    RAISE EXCEPTION 'GYM_TENANT_MISMATCH: client_memberships.tenant_id must equal assigned trainer tenant'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_branch IS DISTINCT FROM NEW."branch_id" THEN
    RAISE EXCEPTION 'GYM_LOCATION_MISMATCH: assigned trainer does not belong to the membership branch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_client_memberships_trainer_integrity_trg"
  BEFORE INSERT OR UPDATE OF "assigned_trainer_id", "tenant_id", "branch_id", "status", "end_date" ON "client_memberships"
  FOR EACH ROW EXECUTE FUNCTION "gym_client_memberships_trainer_integrity"();

CREATE OR REPLACE FUNCTION "gym_activity_location_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_activity_location TEXT;
  v_session_branch    TEXT;
  v_session           TEXT;
  v_session_locked    TEXT;
BEGIN
  -- 2.0 (1)/(4): FOR SHARE sobre cada padre en orden scheduled_classes →
  -- class_attendance → gym_activities, aunque la actividad sea global (el
  -- lock impide que pase a una sede mientras este hijo no confirma).
  IF TG_TABLE_NAME = 'scheduled_class_activities' THEN
    SELECT "branch_id" INTO v_session_branch FROM "scheduled_classes" WHERE "id" = NEW."scheduled_class_id" FOR SHARE;
  ELSE
    -- La sesión se conoce por la asistencia: se lee sin lock, se bloquea la
    -- sesión y luego la asistencia; si entretanto la asistencia cambió de
    -- sesión, reintento (40001) en vez de invertir el orden de locks.
    SELECT "scheduled_class_id" INTO v_session FROM "class_attendance" WHERE "id" = NEW."attendance_id";
    SELECT "branch_id" INTO v_session_branch FROM "scheduled_classes" WHERE "id" = v_session FOR SHARE;
    SELECT "scheduled_class_id" INTO v_session_locked FROM "class_attendance" WHERE "id" = NEW."attendance_id" FOR SHARE;
    IF v_session_locked IS DISTINCT FROM v_session THEN
      RAISE EXCEPTION 'GYM_CONCURRENT_PARENT_CHANGE: class_attendance moved to another session while adding activities'
        USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;
  SELECT "location_id" INTO v_activity_location FROM "gym_activities" WHERE "id" = NEW."activity_id" FOR SHARE;
  IF v_activity_location IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_session_branch IS DISTINCT FROM v_activity_location THEN
    RAISE EXCEPTION 'GYM_LOCATION_MISMATCH: activity location does not match session branch (%)', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_scheduled_class_activities_location_trg"
  BEFORE INSERT OR UPDATE ON "scheduled_class_activities"
  FOR EACH ROW EXECUTE FUNCTION "gym_activity_location_matches"();

CREATE TRIGGER "gym_class_attendance_activities_location_trg"
  BEFORE INSERT OR UPDATE ON "class_attendance_activities"
  FOR EACH ROW EXECUTE FUNCTION "gym_activity_location_matches"();

-- ── 2.7 Append-only ──────────────────────────────────────────────────
-- Operaciones idempotentes, eventos de reserva y cambios de modalidad
-- nunca se actualizan ni se borran (TRUNCATE no dispara triggers de fila:
-- solo DBA).

CREATE OR REPLACE FUNCTION "gym_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GYM_APPEND_ONLY: % is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "gym_booking_operations_append_only_trg"
  BEFORE UPDATE OR DELETE ON "gym_booking_operations"
  FOR EACH ROW EXECUTE FUNCTION "gym_reject_mutation"();

CREATE TRIGGER "gym_class_booking_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "class_booking_events"
  FOR EACH ROW EXECUTE FUNCTION "gym_reject_mutation"();

CREATE TRIGGER "gym_client_modality_changes_append_only_trg"
  BEFORE UPDATE OR DELETE ON "client_modality_changes"
  FOR EACH ROW EXECUTE FUNCTION "gym_reject_mutation"();

-- ── 2.8 Integridad dinámica: mutación posterior del PADRE ────────────
-- Las secciones 2.3–2.6 validan al escribir el HIJO. Aquí se valida al
-- cambiar el PADRE cuando ya existen hijos dependientes. Política:
--  * trainers.branch_id
--      - series VIGENTES en otra sede            → RECHAZO (la serie es la
--        agenda de esa sede: desactivarla/reasignarla primero);
--      - membresías VIGENTES con ese entrenador
--        asignado en otra sede (R10)              → RECHAZO (reasignar primero);
--      - ausencias VIGENTES en la sede anterior   → CASCADA: siguen al
--        entrenador a la nueva sede (la ausencia es de la persona);
--      - series/ausencias/membresías HISTÓRICAS   → se conservan intactas.
--  * gym_activities.location_id: cambiar a una sede concreta se rechaza si
--    la actividad ya se usó (historial incluido) en sesiones de otra sede;
--    pasar a global (NULL) siempre se permite.
--  * class_series.location_id / session_kind: rechazo si hay sesiones
--    generadas FUTURAS y programadas; las históricas conservan sus valores.
--  * scheduled_classes.branch_id: rechazo si la sesión tiene actividades de
--    sede (comunes o por alumno) de otra sede.
--  * tenant_id de clients / scheduled_classes / client_memberships: rechazo
--    si quedaría distinto del tenant (no NULL) de sus reservas/asistencias.
--    El backfill NULL → tenant coherente sigue permitido.
--  * class_bookings.(scheduled_class_id, client_id) con asistencia vinculada
--    (booking_id) que dejaría de coincidir → RECHAZO (H05). La FK
--    class_attendance_booking_id_fkey solo referencia id.
--  * client_memberships.(id, client_id) referenciada: FK compuesta RESTRICT.
--  * trainers.(branch_id, tenant_id): FK compuesta NOT VALID (H02, parte 1):
--    un entrenador con tenant no puede pasar a una sede de otro tenant, aun
--    sin hijos; branches no puede cambiar id/tenant con entrenadores.
-- Todos los guardas retornan de inmediato si el valor no cambia, así que los
-- UPDATE heredados que reenvían los mismos valores no se ven afectados.
-- Concurrencia: protocolo de la sección 2.0 (READ COMMITTED + locks del
-- lado hijo + locks de filas hoja compartidas).

CREATE OR REPLACE FUNCTION "gym_trainers_branch_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."branch_id" IS NOT DISTINCT FROM OLD."branch_id" THEN
    RETURN NEW;
  END IF;
  -- 2.0: los hijos (series/ausencias/membresías) bloquean al entrenador
  -- FOR SHARE; esta fila ya está bloqueada por el UPDATE, así que el EXISTS
  -- ve todo hijo confirmado mientras se esperaba.
  PERFORM "gym_require_read_committed"();
  IF EXISTS (
    SELECT 1 FROM "class_series"
     WHERE "trainer_id" = NEW."id"
       AND "location_id" IS DISTINCT FROM NEW."branch_id"
       AND "status" = 'active'
       AND ("valid_until" IS NULL OR "valid_until" >= CURRENT_DATE - 1)) THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_LOCATION_CONFLICT: trainer has active class_series in another location'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "client_memberships"
     WHERE "assigned_trainer_id" = NEW."id"
       AND "branch_id" IS DISTINCT FROM NEW."branch_id"
       AND "status" IN ('active', 'suspended')
       AND "end_date" >= CURRENT_DATE - 1) THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_LOCATION_CONFLICT: trainer is assigned to active memberships of another location'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_trainers_branch_guard_trg"
  BEFORE UPDATE OF "branch_id" ON "trainers"
  FOR EACH ROW EXECUTE FUNCTION "gym_trainers_branch_guard"();

-- AFTER: la fila del entrenador ya tiene la nueva sede, así que el trigger
-- hijo de trainer_time_off valida contra ella. Si la nueva sede es de otro
-- tenant, la FK compuesta (location_id, tenant_id) rechaza todo el UPDATE.
CREATE OR REPLACE FUNCTION "gym_trainers_branch_cascade_time_off"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."branch_id" IS DISTINCT FROM OLD."branch_id" THEN
    UPDATE "trainer_time_off"
       SET "location_id" = NEW."branch_id", "updated_at" = now()
     WHERE "trainer_id" = NEW."id"
       AND "location_id" IS NOT DISTINCT FROM OLD."branch_id"
       AND "status" = 'active'
       AND "ends_on" >= CURRENT_DATE - 1;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "gym_trainers_branch_cascade_time_off_trg"
  AFTER UPDATE OF "branch_id" ON "trainers"
  FOR EACH ROW EXECUTE FUNCTION "gym_trainers_branch_cascade_time_off"();

CREATE OR REPLACE FUNCTION "gym_activities_location_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."location_id" IS NOT DISTINCT FROM OLD."location_id" OR NEW."location_id" IS NULL THEN
    RETURN NEW;
  END IF;
  -- 2.0 (2): la sesión es el otro padre de estas filas hoja; ambos lados las
  -- bloquean (mismo orden: comunes → por alumno, ORDER BY id).
  PERFORM "gym_require_read_committed"();
  PERFORM 1 FROM "scheduled_class_activities" WHERE "activity_id" = NEW."id" ORDER BY "id" FOR NO KEY UPDATE;
  PERFORM 1 FROM "class_attendance_activities" WHERE "activity_id" = NEW."id" ORDER BY "id" FOR NO KEY UPDATE;
  IF EXISTS (
       SELECT 1 FROM "scheduled_class_activities" sa
         JOIN "scheduled_classes" s ON s."id" = sa."scheduled_class_id"
        WHERE sa."activity_id" = NEW."id" AND s."branch_id" IS DISTINCT FROM NEW."location_id")
     OR EXISTS (
       SELECT 1 FROM "class_attendance_activities" aa
         JOIN "class_attendance" a ON a."id" = aa."attendance_id"
         JOIN "scheduled_classes" s ON s."id" = a."scheduled_class_id"
        WHERE aa."activity_id" = NEW."id" AND s."branch_id" IS DISTINCT FROM NEW."location_id") THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_LOCATION_CONFLICT: gym_activity is used in sessions of another location (create a new activity instead)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_activities_location_guard_trg"
  BEFORE UPDATE OF "location_id" ON "gym_activities"
  FOR EACH ROW EXECUTE FUNCTION "gym_activities_location_guard"();

CREATE OR REPLACE FUNCTION "gym_class_series_dependents_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."location_id" IS NOT DISTINCT FROM OLD."location_id"
     AND NEW."session_kind" IS NOT DISTINCT FROM OLD."session_kind" THEN
    RETURN NEW;
  END IF;
  -- 2.0: las sesiones generadas bloquean la serie FOR SHARE.
  PERFORM "gym_require_read_committed"();
  IF EXISTS (
    SELECT 1 FROM "scheduled_classes"
     WHERE "series_id" = NEW."id"
       AND "status" IN ('scheduled', 'in_progress')
       AND "class_date" >= CURRENT_DATE - 1) THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_SESSIONS_CONFLICT: class_series has future scheduled sessions (cancel or regenerate them first)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_class_series_dependents_guard_trg"
  BEFORE UPDATE OF "location_id", "session_kind" ON "class_series"
  FOR EACH ROW EXECUTE FUNCTION "gym_class_series_dependents_guard"();

CREATE OR REPLACE FUNCTION "gym_scheduled_classes_dependents_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."branch_id" IS NOT DISTINCT FROM OLD."branch_id" THEN
    RETURN NEW;
  END IF;
  -- 2.0 (2): la actividad es el otro padre de estas filas hoja.
  PERFORM "gym_require_read_committed"();
  PERFORM 1 FROM "scheduled_class_activities" WHERE "scheduled_class_id" = NEW."id" ORDER BY "id" FOR NO KEY UPDATE;
  PERFORM 1 FROM "class_attendance_activities" aa
    JOIN "class_attendance" a ON a."id" = aa."attendance_id"
   WHERE a."scheduled_class_id" = NEW."id"
   ORDER BY aa."id" FOR NO KEY UPDATE OF aa;
  IF (
       EXISTS (
         SELECT 1 FROM "scheduled_class_activities" sa
           JOIN "gym_activities" ga ON ga."id" = sa."activity_id"
          WHERE sa."scheduled_class_id" = NEW."id"
            AND ga."location_id" IS NOT NULL AND ga."location_id" IS DISTINCT FROM NEW."branch_id")
       OR EXISTS (
         SELECT 1 FROM "class_attendance" a
           JOIN "class_attendance_activities" aa ON aa."attendance_id" = a."id"
           JOIN "gym_activities" ga ON ga."id" = aa."activity_id"
          WHERE a."scheduled_class_id" = NEW."id"
            AND ga."location_id" IS NOT NULL AND ga."location_id" IS DISTINCT FROM NEW."branch_id")) THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_LOCATION_CONFLICT: scheduled_class has activities of another location'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_scheduled_classes_dependents_guard_trg"
  BEFORE UPDATE OF "branch_id" ON "scheduled_classes"
  FOR EACH ROW EXECUTE FUNCTION "gym_scheduled_classes_dependents_guard"();

-- tenant_id del padre frente al tenant (no NULL) de reservas/asistencias.
CREATE OR REPLACE FUNCTION "gym_dependents_tenant_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conflict BOOLEAN := false;
BEGIN
  IF NEW."tenant_id" IS NOT DISTINCT FROM OLD."tenant_id" THEN
    RETURN NEW;
  END IF;
  -- 2.0: reservas/asistencias bloquean estos padres FOR KEY SHARE; tenant_id
  -- es clave aquí, así que este UPDATE (FOR UPDATE) espera a esos hijos.
  PERFORM "gym_require_read_committed"();
  IF TG_TABLE_NAME = 'clients' THEN
    v_conflict := EXISTS (SELECT 1 FROM "class_bookings" WHERE "client_id" = NEW."id"
                            AND "tenant_id" IS NOT NULL AND "tenant_id" IS DISTINCT FROM NEW."tenant_id")
               OR EXISTS (SELECT 1 FROM "class_attendance" WHERE "client_id" = NEW."id"
                            AND "tenant_id" IS NOT NULL AND "tenant_id" IS DISTINCT FROM NEW."tenant_id");
  ELSIF TG_TABLE_NAME = 'scheduled_classes' THEN
    v_conflict := EXISTS (SELECT 1 FROM "class_bookings" WHERE "scheduled_class_id" = NEW."id"
                            AND "tenant_id" IS NOT NULL AND "tenant_id" IS DISTINCT FROM NEW."tenant_id")
               OR EXISTS (SELECT 1 FROM "class_attendance" WHERE "scheduled_class_id" = NEW."id"
                            AND "tenant_id" IS NOT NULL AND "tenant_id" IS DISTINCT FROM NEW."tenant_id");
  ELSE
    v_conflict := EXISTS (SELECT 1 FROM "class_bookings" WHERE "client_membership_id" = NEW."id"
                            AND "tenant_id" IS NOT NULL AND "tenant_id" IS DISTINCT FROM NEW."tenant_id");
  END IF;
  IF v_conflict THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_TENANT_CONFLICT: %.tenant_id would differ from dependent bookings/attendance', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_clients_dependents_tenant_guard_trg"
  BEFORE UPDATE OF "tenant_id" ON "clients"
  FOR EACH ROW EXECUTE FUNCTION "gym_dependents_tenant_guard"();

CREATE TRIGGER "gym_scheduled_classes_dependents_tenant_guard_trg"
  BEFORE UPDATE OF "tenant_id" ON "scheduled_classes"
  FOR EACH ROW EXECUTE FUNCTION "gym_dependents_tenant_guard"();

CREATE TRIGGER "gym_client_memberships_dependents_tenant_guard_trg"
  BEFORE UPDATE OF "tenant_id" ON "client_memberships"
  FOR EACH ROW EXECUTE FUNCTION "gym_dependents_tenant_guard"();

-- H05: la reserva es el padre de class_attendance.booking_id. Cambiar su
-- sesión o su cliente con una asistencia vinculada la dejaría apuntando a una
-- reserva de otro alumno u otra sesión. Sin asistencia vinculada el cambio se
-- permite (sin regresión). Cancelar/reactivar no cambia estas columnas.
-- Concurrencia (2.0): scheduled_class_id y client_id son columnas clave de
-- class_bookings (unique (scheduled_class_id, client_id) y (id, tenant_id,
-- scheduled_class_id, client_id)), así que este UPDATE toma FOR UPDATE y choca
-- con el FOR KEY SHARE que gym_class_attendance_integrity toma al vincular.
-- Asistencia primero → este UPDATE espera y el EXISTS (instantánea nueva) la
-- ve. Reserva primero → la asistencia espera, relee la reserva ya cambiada y
-- se rechaza (GYM_ATTENDANCE_BOOKING_MISMATCH) o no se vincula.
-- OLD.id: si el mismo UPDATE cambiara id, la cascada a booking_id ocurre después.
CREATE OR REPLACE FUNCTION "gym_class_bookings_attendance_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."scheduled_class_id" IS NOT DISTINCT FROM OLD."scheduled_class_id"
     AND NEW."client_id" IS NOT DISTINCT FROM OLD."client_id" THEN
    RETURN NEW;
  END IF;
  PERFORM "gym_require_read_committed"();
  IF EXISTS (
    SELECT 1 FROM "class_attendance"
     WHERE "booking_id" = OLD."id"
       AND ("scheduled_class_id" IS DISTINCT FROM NEW."scheduled_class_id"
            OR "client_id" IS DISTINCT FROM NEW."client_id")) THEN
    RAISE EXCEPTION 'GYM_DEPENDENT_ATTENDANCE_CONFLICT: class_booking has linked attendance of another session/client'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_class_bookings_attendance_guard_trg"
  BEFORE UPDATE OF "scheduled_class_id", "client_id" ON "class_bookings"
  FOR EACH ROW EXECUTE FUNCTION "gym_class_bookings_attendance_guard"();
