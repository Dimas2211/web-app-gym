-- ═════════════════════════════════════════════════════════════════════
-- GYM-5A — Seguimiento individual por fecha (EXPAND-FIRST, solo aditiva)
--
-- Parte 1: DDL generado por `prisma migrate diff` (schema 4 → schema 5A).
--          Solo CREATE TYPE / CREATE TABLE / índices / FKs. Los únicos
--          objetos nuevos sobre tablas existentes son DOS índices únicos
--          (client_weekly_plans(id,tenant_id,client_id) y
--          client_weekly_plan_days(id,client_weekly_plan_id)), destino de FKs
--          compuestas: sin DROP, RENAME, ALTER COLUMN ni backfill.
-- Parte 2: SQL fuera de Prisma: CHECKs, triggers de integridad (día ∈ plan,
--          fecha dentro del período y con el weekday del día, vínculo de
--          asistencia del mismo alumno/tenant/fecha) y bitácora append-only.
--
-- NO reinterpreta datos heredados: execution_status/executed_at/feedback de
-- client_weekly_plan_days permanecen intactos y no se copian a la tabla nueva.
-- Atomicidad: igual que la migración de GYM-2A (sin control de transacción explícito ni
-- índices concurrentes). Si se aplica con psql: `psql -1 -v ON_ERROR_STOP=1 -f`.
-- Reversión (solo antes de que existan datos de producción en las tablas
-- nuevas): DROP TABLE client_plan_day_execution_events, client_plan_day_executions;
-- DROP TYPE "PlanExecutionEventKind"; DROP INDEX de los dos únicos nuevos.
-- ═════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "PlanExecutionEventKind" AS ENUM ('CLIENT_REPORT', 'TRAINER_RECORD');

-- CreateTable
CREATE TABLE "client_plan_day_executions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "plan_day_id" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "client_status" "ExecutionStatus",
    "client_comment" TEXT,
    "client_reported_at" TIMESTAMP(3),
    "client_reported_by" TEXT,
    "trainer_status" "ExecutionStatus",
    "trainer_feedback" TEXT,
    "trainer_recorded_at" TIMESTAMP(3),
    "trainer_recorded_by" TEXT,
    "trainer_recorded_role" TEXT,
    "attendance_id" TEXT,
    "attendance_linked_by" TEXT,
    "attendance_linked_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_plan_day_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_plan_day_execution_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "kind" "PlanExecutionEventKind" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "previous_status" "ExecutionStatus",
    "new_status" "ExecutionStatus" NOT NULL,
    "reason" TEXT,
    "attendance_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_plan_day_execution_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_plan_day_executions_tenant_id_client_id_local_date_idx" ON "client_plan_day_executions"("tenant_id", "client_id", "local_date");

-- CreateIndex
CREATE INDEX "client_plan_day_executions_plan_id_local_date_idx" ON "client_plan_day_executions"("plan_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "client_plan_day_executions_plan_day_id_local_date_key" ON "client_plan_day_executions"("plan_day_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "client_plan_day_executions_attendance_id_key" ON "client_plan_day_executions"("attendance_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_plan_day_executions_id_tenant_id_key" ON "client_plan_day_executions"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "client_plan_day_execution_events_execution_id_created_at_idx" ON "client_plan_day_execution_events"("execution_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_weekly_plans_id_tenant_id_client_id_key" ON "client_weekly_plans"("id", "tenant_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_weekly_plan_days_id_client_weekly_plan_id_key" ON "client_weekly_plan_days"("id", "client_weekly_plan_id");

-- AddForeignKey
ALTER TABLE "client_plan_day_executions" ADD CONSTRAINT "client_plan_day_executions_plan_id_tenant_id_client_id_fkey" FOREIGN KEY ("plan_id", "tenant_id", "client_id") REFERENCES "client_weekly_plans"("id", "tenant_id", "client_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "client_plan_day_executions" ADD CONSTRAINT "client_plan_day_executions_plan_day_id_plan_id_fkey" FOREIGN KEY ("plan_day_id", "plan_id") REFERENCES "client_weekly_plan_days"("id", "client_weekly_plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "client_plan_day_executions" ADD CONSTRAINT "client_plan_day_executions_attendance_id_tenant_id_fkey" FOREIGN KEY ("attendance_id", "tenant_id") REFERENCES "class_attendance"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "client_plan_day_execution_events" ADD CONSTRAINT "client_plan_day_execution_events_execution_id_tenant_id_fkey" FOREIGN KEY ("execution_id", "tenant_id") REFERENCES "client_plan_day_executions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═════════════════════════════════════════════════════════════════════
-- Parte 2 — Integridad fuera de Prisma
-- ═════════════════════════════════════════════════════════════════════

-- 2.1 CHECKs de coherencia ------------------------------------------------

ALTER TABLE "client_plan_day_executions"
  ADD CONSTRAINT "client_plan_day_executions_client_status_chk"
    CHECK ("client_status" IS NULL OR "client_status" <> 'pending'),
  ADD CONSTRAINT "client_plan_day_executions_trainer_status_chk"
    CHECK ("trainer_status" IS NULL OR "trainer_status" <> 'pending'),
  ADD CONSTRAINT "client_plan_day_executions_has_status_chk"
    CHECK ("client_status" IS NOT NULL OR "trainer_status" IS NOT NULL),
  ADD CONSTRAINT "client_plan_day_executions_client_actor_chk"
    CHECK (("client_status" IS NULL) = ("client_reported_by" IS NULL)
       AND ("client_status" IS NULL) = ("client_reported_at" IS NULL)),
  ADD CONSTRAINT "client_plan_day_executions_trainer_actor_chk"
    CHECK (("trainer_status" IS NULL) = ("trainer_recorded_by" IS NULL)
       AND ("trainer_status" IS NULL) = ("trainer_recorded_at" IS NULL)
       AND ("trainer_status" IS NULL) = ("trainer_recorded_role" IS NULL)),
  ADD CONSTRAINT "client_plan_day_executions_attendance_link_chk"
    CHECK (("attendance_id" IS NULL) = ("attendance_linked_by" IS NULL)
       AND ("attendance_id" IS NULL) = ("attendance_linked_at" IS NULL)
       AND ("attendance_id" IS NULL OR "trainer_status" IS NOT NULL)),
  ADD CONSTRAINT "client_plan_day_executions_revision_chk" CHECK ("revision" >= 1);

ALTER TABLE "client_plan_day_execution_events"
  ADD CONSTRAINT "client_plan_day_execution_events_status_chk" CHECK ("new_status" <> 'pending');

-- 2.2 Integridad de la ejecución -------------------------------------------
-- INSERT: el día pertenece al plan (FK compuesta), la fecha cae dentro del
-- período del plan y su día de la semana coincide con el weekday del día
-- (0 = domingo, igual que Date.getDay()). UPDATE: la identidad es inmutable.
-- Vínculo de asistencia: misma persona y tenant, estado attended/late y la
-- fecha de la clase es la fecha local de la ejecución. El vínculo es siempre
-- explícito; nunca se infiere por coincidencia de fecha o nombre.

CREATE OR REPLACE FUNCTION "gym_plan_execution_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_start date;
  v_end date;
  v_weekday integer;
  v_ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p."start_date", p."end_date", d."weekday"
      INTO v_start, v_end, v_weekday
      FROM "client_weekly_plans" p
      JOIN "client_weekly_plan_days" d ON d."client_weekly_plan_id" = p."id"
     WHERE p."id" = NEW."plan_id" AND d."id" = NEW."plan_day_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GYM_PLAN_EXECUTION: day/plan not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW."local_date" < v_start OR NEW."local_date" > v_end THEN
      RAISE EXCEPTION 'GYM_PLAN_EXECUTION_DATE: % outside plan period', NEW."local_date"
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXTRACT(DOW FROM NEW."local_date")::integer <> v_weekday THEN
      RAISE EXCEPTION 'GYM_PLAN_EXECUTION_WEEKDAY: % is not weekday %', NEW."local_date", v_weekday
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW."tenant_id" <> OLD."tenant_id" OR NEW."client_id" <> OLD."client_id"
       OR NEW."plan_id" <> OLD."plan_id" OR NEW."plan_day_id" <> OLD."plan_day_id"
       OR NEW."local_date" <> OLD."local_date" OR NEW."timezone" <> OLD."timezone" THEN
      RAISE EXCEPTION 'GYM_PLAN_EXECUTION_IMMUTABLE: identity columns cannot change'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW."attendance_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."attendance_id" IS DISTINCT FROM OLD."attendance_id") THEN
    SELECT TRUE INTO v_ok
      FROM "class_attendance" a
      JOIN "scheduled_classes" s ON s."id" = a."scheduled_class_id"
     WHERE a."id" = NEW."attendance_id"
       AND a."tenant_id" = NEW."tenant_id"
       AND a."client_id" = NEW."client_id"
       AND a."attendance_status" IN ('attended', 'late')
       AND s."class_date" = NEW."local_date";
    IF v_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'GYM_PLAN_EXECUTION_ATTENDANCE: attendance does not match client, status or date'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_plan_execution_integrity_trg"
  BEFORE INSERT OR UPDATE ON "client_plan_day_executions"
  FOR EACH ROW EXECUTE FUNCTION "gym_plan_execution_integrity"();

-- 2.3 Historia inmutable ---------------------------------------------------
-- Las ejecuciones no se borran (corregir = UPDATE + evento) y la bitácora es
-- append-only. gym_reject_mutation() viene de GYM-2A.

CREATE TRIGGER "gym_plan_executions_no_delete_trg"
  BEFORE DELETE ON "client_plan_day_executions"
  FOR EACH ROW EXECUTE FUNCTION "gym_reject_mutation"();

CREATE TRIGGER "gym_plan_execution_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "client_plan_day_execution_events"
  FOR EACH ROW EXECUTE FUNCTION "gym_reject_mutation"();
