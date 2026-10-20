-- ═════════════════════════════════════════════════════════════════════
-- REVERSIÓN REVISADA — 20261019000000_gym_bookings_foundation (GYM-BOOKINGS 2A)
--
-- NO es una migración del repo. Es el CUERPO de una migración de reversión
-- "roll-forward" que se crea solo si se aprueba revertir 2A en una base
-- (procedimiento Prisma 6 en docs/modules/gym-bookings-summary.md §7.3):
--   prisma/migrations/<timestamp>_revert_gym_bookings_foundation/migration.sql
-- junto con schema.prisma devuelto al estado previo, y `prisma migrate deploy`.
-- Así _prisma_migrations conserva el historial completo; nunca se borran
-- filas de _prisma_migrations a mano.
--
-- Sin BEGIN/COMMIT explícitos (mismo motivo que la migración 2A): Prisma lo
-- aplica como un único mensaje = transacción implícita.
--
-- Guarda: aborta (y por la transacción implícita no cambia nada) si existe
-- CUALQUIER dato nuevo distinto del default que deba conservarse. Reporta
-- todos los motivos a la vez.
--
-- Columnas DERIVADAS que se descartan sin bloquear (recalculables desde
-- datos heredados): scheduled_classes.booked_count, class_bookings.tenant_id,
-- class_attendance.tenant_id, class_attendance.booking_id.
--
-- Certificado: schema resultante idéntico al previo (PGlite y PostgreSQL 17)
-- y rechazo independiente por cada motivo de la guarda.
-- ═════════════════════════════════════════════════════════════════════


DO $$
DECLARE
  r        RECORD;
  v_found  BOOLEAN;
  v_blockers TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- tablas nuevas: cualquier fila
    ('gym_booking_operations',                  'SELECT 1 FROM "gym_booking_operations"'),
    ('class_booking_events',                    'SELECT 1 FROM "class_booking_events"'),
    ('client_modality_changes',                 'SELECT 1 FROM "client_modality_changes"'),
    ('scheduled_class_activities',              'SELECT 1 FROM "scheduled_class_activities"'),
    ('class_attendance_activities',             'SELECT 1 FROM "class_attendance_activities"'),
    ('gym_activities',                          'SELECT 1 FROM "gym_activities"'),
    ('class_series',                            'SELECT 1 FROM "class_series"'),
    ('trainer_time_off',                        'SELECT 1 FROM "trainer_time_off"'),
    -- gym_settings: política configurada (≠ default de columna)
    ('gym_settings.timezone',                      'SELECT 1 FROM "gym_settings" WHERE "timezone" IS NOT NULL'),
    ('gym_settings.personalized_booking_enabled',  'SELECT 1 FROM "gym_settings" WHERE "personalized_booking_enabled" IS DISTINCT FROM false'),
    ('gym_settings.group_booking_enabled',         'SELECT 1 FROM "gym_settings" WHERE "group_booking_enabled" IS DISTINCT FROM false'),
    ('gym_settings.personalized_default_capacity', 'SELECT 1 FROM "gym_settings" WHERE "personalized_default_capacity" IS DISTINCT FROM 1'),
    ('gym_settings.booking_horizon_days',          'SELECT 1 FROM "gym_settings" WHERE "booking_horizon_days" IS DISTINCT FROM 14'),
    ('gym_settings.booking_min_lead_minutes',      'SELECT 1 FROM "gym_settings" WHERE "booking_min_lead_minutes" IS DISTINCT FROM 0'),
    ('gym_settings.cancel_min_lead_minutes',       'SELECT 1 FROM "gym_settings" WHERE "cancel_min_lead_minutes" IS DISTINCT FROM 120'),
    ('gym_settings.late_cancel_consumes_session',  'SELECT 1 FROM "gym_settings" WHERE "late_cancel_consumes_session" IS DISTINCT FROM true'),
    ('gym_settings.apply_policy_to_open',          'SELECT 1 FROM "gym_settings" WHERE "apply_policy_to_open" IS DISTINCT FROM false'),
    ('gym_settings.attendance_edit_window_hours',  'SELECT 1 FROM "gym_settings" WHERE "attendance_edit_window_hours" IS DISTINCT FROM 48'),
    ('gym_settings.series_generation_weeks',       'SELECT 1 FROM "gym_settings" WHERE "series_generation_weeks" IS DISTINCT FROM 4'),
    -- trainers
    ('trainers.personalized_capacity',          'SELECT 1 FROM "trainers" WHERE "personalized_capacity" IS NOT NULL'),
    -- modalidades
    ('clients.modality',                        'SELECT 1 FROM "clients" WHERE "modality" <> ''NORMAL'''),
    ('clients.modality_changed_at',             'SELECT 1 FROM "clients" WHERE "modality_changed_at" IS NOT NULL'),
    ('membership_plans.modality',               'SELECT 1 FROM "membership_plans" WHERE "modality" <> ''NORMAL'''),
    ('client_memberships.modality',             'SELECT 1 FROM "client_memberships" WHERE "modality" <> ''NORMAL'''),
    ('client_memberships.sessions_total',       'SELECT 1 FROM "client_memberships" WHERE "sessions_total" IS NOT NULL'),
    ('client_memberships.sessions_used',        'SELECT 1 FROM "client_memberships" WHERE "sessions_used" <> 0'),
    ('client_memberships.assigned_trainer_id',  'SELECT 1 FROM "client_memberships" WHERE "assigned_trainer_id" IS NOT NULL'),
    -- sesiones
    ('scheduled_classes.session_kind',          'SELECT 1 FROM "scheduled_classes" WHERE "session_kind" <> ''OPEN'''),
    ('scheduled_classes.series_id',             'SELECT 1 FROM "scheduled_classes" WHERE "series_id" IS NOT NULL'),
    ('scheduled_classes.starts_at',             'SELECT 1 FROM "scheduled_classes" WHERE "starts_at" IS NOT NULL'),
    ('scheduled_classes.ends_at',               'SELECT 1 FROM "scheduled_classes" WHERE "ends_at" IS NOT NULL'),
    ('scheduled_classes.cancelled_at',          'SELECT 1 FROM "scheduled_classes" WHERE "cancelled_at" IS NOT NULL'),
    ('scheduled_classes.cancelled_by_user_id',  'SELECT 1 FROM "scheduled_classes" WHERE "cancelled_by_user_id" IS NOT NULL'),
    ('scheduled_classes.cancel_reason',         'SELECT 1 FROM "scheduled_classes" WHERE "cancel_reason" IS NOT NULL'),
    ('scheduled_classes.completed_at',          'SELECT 1 FROM "scheduled_classes" WHERE "completed_at" IS NOT NULL'),
    ('scheduled_classes.completed_by_user_id',  'SELECT 1 FROM "scheduled_classes" WHERE "completed_by_user_id" IS NOT NULL'),
    -- reservas
    ('class_bookings.client_membership_id',     'SELECT 1 FROM "class_bookings" WHERE "client_membership_id" IS NOT NULL'),
    ('class_bookings.channel',                  'SELECT 1 FROM "class_bookings" WHERE "channel" IS NOT NULL'),
    ('class_bookings.booked_by_user_id',        'SELECT 1 FROM "class_bookings" WHERE "booked_by_user_id" IS NOT NULL'),
    ('class_bookings.consumption',              'SELECT 1 FROM "class_bookings" WHERE "consumption" <> ''NOT_APPLICABLE'''),
    ('class_bookings.cancelled_at',             'SELECT 1 FROM "class_bookings" WHERE "cancelled_at" IS NOT NULL'),
    ('class_bookings.cancelled_by_user_id',     'SELECT 1 FROM "class_bookings" WHERE "cancelled_by_user_id" IS NOT NULL'),
    ('class_bookings.cancellation_type',        'SELECT 1 FROM "class_bookings" WHERE "cancellation_type" IS NOT NULL'),
    ('class_bookings.cancel_reason',            'SELECT 1 FROM "class_bookings" WHERE "cancel_reason" IS NOT NULL'),
    -- asistencia
    ('class_attendance.recorded_by_user_id',    'SELECT 1 FROM "class_attendance" WHERE "recorded_by_user_id" IS NOT NULL'),
    ('class_attendance.recorded_at',            'SELECT 1 FROM "class_attendance" WHERE "recorded_at" IS NOT NULL'),
    ('class_attendance.training_notes',         'SELECT 1 FROM "class_attendance" WHERE "training_notes" IS NOT NULL')
  ) AS v(label, probe) LOOP
    EXECUTE 'SELECT EXISTS (' || r.probe || ')' INTO v_found;
    IF v_found THEN
      v_blockers := array_append(v_blockers, r.label);
    END IF;
  END LOOP;

  IF array_length(v_blockers, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'GYM_ROLLBACK_BLOCKED: datos nuevos presentes en: %', array_to_string(v_blockers, ', ');
  END IF;
END;
$$;

-- 1. Triggers
DROP TRIGGER IF EXISTS "gym_class_bookings_attendance_guard_trg" ON "class_bookings";
DROP TRIGGER IF EXISTS "gym_client_memberships_dependents_tenant_guard_trg" ON "client_memberships";
DROP TRIGGER IF EXISTS "gym_scheduled_classes_dependents_tenant_guard_trg" ON "scheduled_classes";
DROP TRIGGER IF EXISTS "gym_clients_dependents_tenant_guard_trg" ON "clients";
DROP TRIGGER IF EXISTS "gym_scheduled_classes_dependents_guard_trg" ON "scheduled_classes";
DROP TRIGGER IF EXISTS "gym_class_series_dependents_guard_trg" ON "class_series";
DROP TRIGGER IF EXISTS "gym_activities_location_guard_trg" ON "gym_activities";
DROP TRIGGER IF EXISTS "gym_trainers_branch_cascade_time_off_trg" ON "trainers";
DROP TRIGGER IF EXISTS "gym_trainers_branch_guard_trg" ON "trainers";
DROP TRIGGER IF EXISTS "gym_client_modality_changes_append_only_trg" ON "client_modality_changes";
DROP TRIGGER IF EXISTS "gym_class_booking_events_append_only_trg" ON "class_booking_events";
DROP TRIGGER IF EXISTS "gym_booking_operations_append_only_trg" ON "gym_booking_operations";
DROP TRIGGER IF EXISTS "gym_class_attendance_activities_location_trg" ON "class_attendance_activities";
DROP TRIGGER IF EXISTS "gym_scheduled_class_activities_location_trg" ON "scheduled_class_activities";
DROP TRIGGER IF EXISTS "gym_client_memberships_trainer_integrity_trg" ON "client_memberships";
DROP TRIGGER IF EXISTS "gym_scheduled_classes_series_integrity_trg" ON "scheduled_classes";
DROP TRIGGER IF EXISTS "gym_trainer_time_off_trainer_location_trg" ON "trainer_time_off";
DROP TRIGGER IF EXISTS "gym_class_series_trainer_location_trg" ON "class_series";
DROP TRIGGER IF EXISTS "gym_class_attendance_integrity_trg" ON "class_attendance";
DROP TRIGGER IF EXISTS "gym_client_memberships_sessions_used_guard_trg" ON "client_memberships";
DROP TRIGGER IF EXISTS "gym_scheduled_classes_booked_count_guard_trg" ON "scheduled_classes";
DROP TRIGGER IF EXISTS "gym_class_bookings_counters_trg" ON "class_bookings";
DROP TRIGGER IF EXISTS "gym_class_bookings_integrity_trg" ON "class_bookings";

-- 2. Funciones
DROP FUNCTION IF EXISTS "gym_class_bookings_attendance_guard"();
DROP FUNCTION IF EXISTS "gym_dependents_tenant_guard"();
DROP FUNCTION IF EXISTS "gym_scheduled_classes_dependents_guard"();
DROP FUNCTION IF EXISTS "gym_class_series_dependents_guard"();
DROP FUNCTION IF EXISTS "gym_activities_location_guard"();
DROP FUNCTION IF EXISTS "gym_trainers_branch_cascade_time_off"();
DROP FUNCTION IF EXISTS "gym_trainers_branch_guard"();
DROP FUNCTION IF EXISTS "gym_reject_mutation"();
DROP FUNCTION IF EXISTS "gym_activity_location_matches"();
DROP FUNCTION IF EXISTS "gym_client_memberships_trainer_integrity"();
DROP FUNCTION IF EXISTS "gym_scheduled_classes_series_integrity"();
DROP FUNCTION IF EXISTS "gym_trainer_location_matches"();
DROP FUNCTION IF EXISTS "gym_class_attendance_integrity"();
DROP FUNCTION IF EXISTS "gym_guard_booking_counters"();
DROP FUNCTION IF EXISTS "gym_class_bookings_counters"();
DROP FUNCTION IF EXISTS "gym_class_bookings_integrity"();
DROP FUNCTION IF EXISTS "gym_require_read_committed"();

-- 3. FKs nuevas en tablas existentes (antes de los índices únicos que referencian)
ALTER TABLE "trainers"           DROP CONSTRAINT IF EXISTS "trainers_branch_id_tenant_id_fkey";
ALTER TABLE "class_attendance"   DROP CONSTRAINT IF EXISTS "class_attendance_booking_id_fkey";
ALTER TABLE "class_bookings"     DROP CONSTRAINT IF EXISTS "class_bookings_client_membership_id_client_id_fkey";
ALTER TABLE "scheduled_classes"  DROP CONSTRAINT IF EXISTS "scheduled_classes_series_id_tenant_id_fkey";
ALTER TABLE "client_memberships" DROP CONSTRAINT IF EXISTS "client_memberships_assigned_trainer_id_tenant_id_fkey";

-- 4. Tablas nuevas (hijas primero; arrastran sus índices, FKs y CHECKs)
DROP TABLE IF EXISTS "class_booking_events";
DROP TABLE IF EXISTS "gym_booking_operations";
DROP TABLE IF EXISTS "client_modality_changes";
DROP TABLE IF EXISTS "class_attendance_activities";
DROP TABLE IF EXISTS "scheduled_class_activities";
DROP TABLE IF EXISTS "gym_activities";
DROP TABLE IF EXISTS "trainer_time_off";
DROP TABLE IF EXISTS "class_series";

-- 5. CHECKs nuevos en tablas existentes
ALTER TABLE "gym_settings"       DROP CONSTRAINT IF EXISTS "gym_settings_booking_policy_chk";
ALTER TABLE "class_bookings"     DROP CONSTRAINT IF EXISTS "class_bookings_consumption_membership_chk";
ALTER TABLE "trainers"           DROP CONSTRAINT IF EXISTS "trainers_personalized_capacity_chk";
ALTER TABLE "client_memberships" DROP CONSTRAINT IF EXISTS "client_memberships_sessions_chk";
ALTER TABLE "scheduled_classes"  DROP CONSTRAINT IF EXISTS "scheduled_classes_instants_chk";
ALTER TABLE "scheduled_classes"  DROP CONSTRAINT IF EXISTS "scheduled_classes_booked_count_nonneg_chk";

-- 6. Índices nuevos en tablas existentes
DROP INDEX IF EXISTS "class_attendance_id_tenant_id_key";
DROP INDEX IF EXISTS "class_attendance_booking_id_key";
DROP INDEX IF EXISTS "class_bookings_id_tenant_id_scheduled_class_id_client_id_key";
DROP INDEX IF EXISTS "class_bookings_client_membership_id_idx";
DROP INDEX IF EXISTS "class_bookings_tenant_id_client_id_booking_status_idx";
DROP INDEX IF EXISTS "scheduled_classes_id_tenant_id_key";
DROP INDEX IF EXISTS "scheduled_classes_series_id_class_date_key";
DROP INDEX IF EXISTS "scheduled_classes_trainer_id_starts_at_idx";
DROP INDEX IF EXISTS "scheduled_classes_tenant_id_session_kind_starts_at_idx";
DROP INDEX IF EXISTS "scheduled_classes_tenant_id_branch_id_class_date_idx";
DROP INDEX IF EXISTS "class_types_id_tenant_id_key";
DROP INDEX IF EXISTS "trainers_id_tenant_id_key";
DROP INDEX IF EXISTS "client_memberships_id_tenant_id_client_id_key";
DROP INDEX IF EXISTS "client_memberships_id_client_id_key";
DROP INDEX IF EXISTS "client_memberships_assigned_trainer_id_idx";
DROP INDEX IF EXISTS "client_memberships_client_id_status_end_date_idx";
DROP INDEX IF EXISTS "clients_id_tenant_id_key";
DROP INDEX IF EXISTS "clients_tenant_id_modality_idx";
DROP INDEX IF EXISTS "membership_plans_tenant_id_modality_status_idx";
DROP INDEX IF EXISTS "branches_id_tenant_id_key";

-- 7. Columnas nuevas en tablas existentes
ALTER TABLE "gym_settings"
  DROP COLUMN IF EXISTS "apply_policy_to_open",
  DROP COLUMN IF EXISTS "attendance_edit_window_hours",
  DROP COLUMN IF EXISTS "booking_horizon_days",
  DROP COLUMN IF EXISTS "booking_min_lead_minutes",
  DROP COLUMN IF EXISTS "cancel_min_lead_minutes",
  DROP COLUMN IF EXISTS "group_booking_enabled",
  DROP COLUMN IF EXISTS "late_cancel_consumes_session",
  DROP COLUMN IF EXISTS "personalized_booking_enabled",
  DROP COLUMN IF EXISTS "personalized_default_capacity",
  DROP COLUMN IF EXISTS "series_generation_weeks",
  DROP COLUMN IF EXISTS "timezone";

ALTER TABLE "class_attendance"
  DROP COLUMN IF EXISTS "booking_id",
  DROP COLUMN IF EXISTS "recorded_at",
  DROP COLUMN IF EXISTS "recorded_by_user_id",
  DROP COLUMN IF EXISTS "tenant_id",
  DROP COLUMN IF EXISTS "training_notes";

ALTER TABLE "class_bookings"
  DROP COLUMN IF EXISTS "booked_by_user_id",
  DROP COLUMN IF EXISTS "cancel_reason",
  DROP COLUMN IF EXISTS "cancellation_type",
  DROP COLUMN IF EXISTS "cancelled_at",
  DROP COLUMN IF EXISTS "cancelled_by_user_id",
  DROP COLUMN IF EXISTS "channel",
  DROP COLUMN IF EXISTS "client_membership_id",
  DROP COLUMN IF EXISTS "consumption",
  DROP COLUMN IF EXISTS "tenant_id";

ALTER TABLE "scheduled_classes"
  DROP COLUMN IF EXISTS "booked_count",
  DROP COLUMN IF EXISTS "cancel_reason",
  DROP COLUMN IF EXISTS "cancelled_at",
  DROP COLUMN IF EXISTS "cancelled_by_user_id",
  DROP COLUMN IF EXISTS "completed_at",
  DROP COLUMN IF EXISTS "completed_by_user_id",
  DROP COLUMN IF EXISTS "ends_at",
  DROP COLUMN IF EXISTS "series_id",
  DROP COLUMN IF EXISTS "session_kind",
  DROP COLUMN IF EXISTS "starts_at";

ALTER TABLE "trainers" DROP COLUMN IF EXISTS "personalized_capacity";

ALTER TABLE "client_memberships"
  DROP COLUMN IF EXISTS "assigned_trainer_id",
  DROP COLUMN IF EXISTS "modality",
  DROP COLUMN IF EXISTS "sessions_total",
  DROP COLUMN IF EXISTS "sessions_used";

ALTER TABLE "clients"
  DROP COLUMN IF EXISTS "modality",
  DROP COLUMN IF EXISTS "modality_changed_at";

ALTER TABLE "membership_plans" DROP COLUMN IF EXISTS "modality";

-- 8. Enums
DROP TYPE IF EXISTS "GymBookingEventType";
DROP TYPE IF EXISTS "GymBookingCommand";
DROP TYPE IF EXISTS "GymSessionConsumption";
DROP TYPE IF EXISTS "GymBookingCancellationType";
DROP TYPE IF EXISTS "GymBookingChannel";
DROP TYPE IF EXISTS "GymSessionKind";
DROP TYPE IF EXISTS "GymClientModality";
