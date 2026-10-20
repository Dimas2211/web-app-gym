/**
 * preflight-gym-bookings.queries.ts
 *
 * GYM-BOOKINGS 2A — catálogo de comprobaciones READ-ONLY por base.
 *
 *  - phase "pre":  se ejecuta ANTES de aplicar 20261019000000_gym_bookings_foundation.
 *                  Solo referencia columnas heredadas (válido en bases sin migrar).
 *  - phase "post": se ejecuta DESPUÉS; verifica contadores, triggers y CHECKs.
 *
 * Cada `countSql` devuelve exactamente una fila con una columna `n` (int).
 * Cada `sampleSql` devuelve como máximo 20 filas con identificadores
 * técnicos (nunca nombres, emails ni documentos de personas).
 *
 * Severidad:
 *  - BLOCKER: n > 0 detiene el despliegue en esa base (auditoría §G "Detener si").
 *  - WARNING: requiere revisión/limpieza aprobada antes de 2B (no bloquea 2A).
 *  - INFO:    dato para decisiones funcionales o de configuración.
 *
 * Sin imports y solo sintaxis TypeScript "borrable": lo consume tanto el
 * runner Prisma (preflight-gym-bookings.ts) como el arnés PGlite (.mjs).
 */

export type GymPreflightSeverity = "BLOCKER" | "WARNING" | "INFO";
export type GymPreflightPhase = "pre" | "post";

export interface GymPreflightCheck {
  id: string;
  phase: GymPreflightPhase;
  severity: GymPreflightSeverity;
  title: string;
  countSql: string;
  sampleSql?: string;
}

const nullTenantTables = [
  "clients",
  "membership_plans",
  "client_memberships",
  "trainers",
  "scheduled_classes",
  "class_types",
  "trainer_availability",
] as const;

const HHMM = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'";

export const GYM_BOOKINGS_EXPECTED_TRIGGERS = [
  "gym_class_bookings_integrity_trg",
  "gym_class_bookings_counters_trg",
  "gym_scheduled_classes_booked_count_guard_trg",
  "gym_client_memberships_sessions_used_guard_trg",
  "gym_class_attendance_integrity_trg",
  "gym_class_series_trainer_location_trg",
  "gym_trainer_time_off_trainer_location_trg",
  "gym_scheduled_classes_series_integrity_trg",
  "gym_client_memberships_trainer_integrity_trg",
  "gym_scheduled_class_activities_location_trg",
  "gym_class_attendance_activities_location_trg",
  "gym_booking_operations_append_only_trg",
  "gym_class_booking_events_append_only_trg",
  "gym_client_modality_changes_append_only_trg",
  // 2.8 — mutación posterior del padre
  "gym_trainers_branch_guard_trg",
  "gym_trainers_branch_cascade_time_off_trg",
  "gym_activities_location_guard_trg",
  "gym_class_series_dependents_guard_trg",
  "gym_scheduled_classes_dependents_guard_trg",
  "gym_clients_dependents_tenant_guard_trg",
  "gym_scheduled_classes_dependents_tenant_guard_trg",
  "gym_client_memberships_dependents_tenant_guard_trg",
  "gym_class_bookings_attendance_guard_trg",
] as const;

export const GYM_BOOKINGS_EXPECTED_CHECKS = [
  "scheduled_classes_booked_count_nonneg_chk",
  "scheduled_classes_instants_chk",
  "client_memberships_sessions_chk",
  "trainers_personalized_capacity_chk",
  "class_bookings_consumption_membership_chk",
  "gym_settings_booking_policy_chk",
  "class_series_shape_chk",
  "trainer_time_off_shape_chk",
  "gym_booking_operations_shape_chk",
] as const;

// FKs compuestas agregadas por la remediación final (H02 / H03).
export const GYM_BOOKINGS_EXPECTED_FKS = [
  "trainers_branch_id_tenant_id_fkey",
  "gym_booking_operations_location_id_tenant_id_fkey",
  "class_booking_events_client_membership_id_tenant_id_client_fkey",
] as const;

// H02 — entrenador con tenant cuya sede es de otro tenant. Solo columnas
// heredadas (válida antes y después de migrar).
const TRAINER_BRANCH_TENANT_MISMATCH = `FROM "trainers" t
      JOIN "branches" br ON br."id" = t."branch_id"
     WHERE t."tenant_id" IS NOT NULL AND br."tenant_id" IS DISTINCT FROM t."tenant_id"`;

function sqlList(values: readonly string[]): string {
  return values.map((v) => `('${v}')`).join(", ");
}

export const GYM_BOOKINGS_PREFLIGHT_CHECKS: GymPreflightCheck[] = [
  // ── PRE ───────────────────────────────────────────────────────────
  ...nullTenantTables.map(
    (table): GymPreflightCheck => ({
      id: `PRE_NULL_TENANT_${table.toUpperCase()}`,
      phase: "pre",
      severity: "WARNING",
      title: `Filas de ${table} con tenant_id NULL (invisibles para consultas filtradas por tenant)`,
      countSql: `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "tenant_id" IS NULL`,
      sampleSql: `SELECT "id" FROM "${table}" WHERE "tenant_id" IS NULL ORDER BY "id" LIMIT 20`,
    })
  ),
  {
    id: "PRE_CROSS_TENANT_BOOKINGS",
    phase: "pre",
    severity: "BLOCKER",
    title: "Reservas cuyo cliente pertenece a otro tenant que la clase",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "class_bookings" b
      JOIN "scheduled_classes" s ON s."id" = b."scheduled_class_id"
      JOIN "clients" c ON c."id" = b."client_id"
     WHERE s."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND s."tenant_id" <> c."tenant_id"`,
    sampleSql: `SELECT b."id" AS booking_id, s."tenant_id" AS class_tenant, c."tenant_id" AS client_tenant
      FROM "class_bookings" b
      JOIN "scheduled_classes" s ON s."id" = b."scheduled_class_id"
      JOIN "clients" c ON c."id" = b."client_id"
     WHERE s."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND s."tenant_id" <> c."tenant_id"
     ORDER BY b."id" LIMIT 20`,
  },
  {
    id: "PRE_CROSS_TENANT_ATTENDANCE",
    phase: "pre",
    severity: "BLOCKER",
    title: "Asistencias cuyo cliente pertenece a otro tenant que la clase",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "class_attendance" a
      JOIN "scheduled_classes" s ON s."id" = a."scheduled_class_id"
      JOIN "clients" c ON c."id" = a."client_id"
     WHERE s."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND s."tenant_id" <> c."tenant_id"`,
    sampleSql: `SELECT a."id" AS attendance_id
      FROM "class_attendance" a
      JOIN "scheduled_classes" s ON s."id" = a."scheduled_class_id"
      JOIN "clients" c ON c."id" = a."client_id"
     WHERE s."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND s."tenant_id" <> c."tenant_id"
     ORDER BY a."id" LIMIT 20`,
  },
  {
    id: "PRE_CROSS_TENANT_MEMBERSHIPS",
    phase: "pre",
    severity: "BLOCKER",
    title: "Membresías cuyo tenant difiere del tenant del cliente",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "client_memberships" m
      JOIN "clients" c ON c."id" = m."client_id"
     WHERE m."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND m."tenant_id" <> c."tenant_id"`,
    sampleSql: `SELECT m."id" AS membership_id
      FROM "client_memberships" m
      JOIN "clients" c ON c."id" = m."client_id"
     WHERE m."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND m."tenant_id" <> c."tenant_id"
     ORDER BY m."id" LIMIT 20`,
  },
  {
    id: "PRE_CROSS_BRANCH_BOOKINGS",
    phase: "pre",
    severity: "WARNING",
    title: "Reservas de clientes de otra sucursal que la clase (v1 no permite reservas entre sedes)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "class_bookings" b
      JOIN "scheduled_classes" s ON s."id" = b."scheduled_class_id"
      JOIN "clients" c ON c."id" = b."client_id"
     WHERE s."branch_id" <> c."branch_id"`,
    sampleSql: `SELECT b."id" AS booking_id
      FROM "class_bookings" b
      JOIN "scheduled_classes" s ON s."id" = b."scheduled_class_id"
      JOIN "clients" c ON c."id" = b."client_id"
     WHERE s."branch_id" <> c."branch_id"
     ORDER BY b."id" LIMIT 20`,
  },
  {
    id: "PRE_BOOKINGS_WITHOUT_RESOLVABLE_TENANT",
    phase: "pre",
    severity: "WARNING",
    title: "Reservas donde ni la clase ni el cliente tienen tenant_id (quedarán con tenant_id NULL)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "class_bookings" b
      JOIN "scheduled_classes" s ON s."id" = b."scheduled_class_id"
      JOIN "clients" c ON c."id" = b."client_id"
     WHERE s."tenant_id" IS NULL AND c."tenant_id" IS NULL`,
  },
  {
    id: "PRE_CLASSES_OVER_CAPACITY",
    phase: "pre",
    severity: "WARNING",
    title: "Clases con más reservas confirmadas que su capacidad (bypass de reactivación heredado)",
    countSql: `SELECT COUNT(*)::int AS n FROM (
      SELECT s."id"
        FROM "scheduled_classes" s
        JOIN "class_bookings" b ON b."scheduled_class_id" = s."id" AND b."booking_status" = 'confirmed'
       GROUP BY s."id", s."capacity"
      HAVING COUNT(*) > s."capacity") x`,
    sampleSql: `SELECT s."id" AS class_id, s."capacity", COUNT(*)::int AS confirmed
        FROM "scheduled_classes" s
        JOIN "class_bookings" b ON b."scheduled_class_id" = s."id" AND b."booking_status" = 'confirmed'
       GROUP BY s."id", s."capacity"
      HAVING COUNT(*) > s."capacity"
       ORDER BY s."id" LIMIT 20`,
  },
  {
    id: "PRE_CLASS_CAPACITY_INVALID",
    phase: "pre",
    severity: "WARNING",
    title: "Clases con capacity < 1",
    countSql: `SELECT COUNT(*)::int AS n FROM "scheduled_classes" WHERE "capacity" < 1`,
  },
  {
    id: "PRE_LEGACY_PERSONALIZED_CLASSES",
    phase: "pre",
    severity: "INFO",
    title: "Clases heredadas con is_personalized = true (se mantienen OPEN, sin reclasificar)",
    countSql: `SELECT COUNT(*)::int AS n FROM "scheduled_classes" WHERE "is_personalized" = true`,
  },
  {
    id: "PRE_LEGACY_PERSONALIZED_CLASSES_WITH_BOOKINGS",
    phase: "pre",
    severity: "INFO",
    title: "Clases is_personalized = true con reservas (se conservan intactas)",
    countSql: `SELECT COUNT(DISTINCT s."id")::int AS n
      FROM "scheduled_classes" s
      JOIN "class_bookings" b ON b."scheduled_class_id" = s."id"
     WHERE s."is_personalized" = true`,
  },
  {
    id: "PRE_ATTENDANCE_WITHOUT_CONFIRMED_BOOKING",
    phase: "pre",
    severity: "WARNING",
    title: "Asistencias sin reserva confirmada correspondiente",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "class_attendance" a
      LEFT JOIN "class_bookings" b
        ON b."scheduled_class_id" = a."scheduled_class_id"
       AND b."client_id" = a."client_id"
       AND b."booking_status" = 'confirmed'
     WHERE b."id" IS NULL`,
  },
  {
    id: "PRE_OVERLAPPING_ACTIVE_MEMBERSHIPS",
    phase: "pre",
    severity: "INFO",
    title: "Clientes con varias membresías activas con vigencias solapadas",
    countSql: `SELECT COUNT(DISTINCT m1."client_id")::int AS n
      FROM "client_memberships" m1
      JOIN "client_memberships" m2
        ON m2."client_id" = m1."client_id"
       AND m2."id" > m1."id"
       AND m2."status" = 'active'
       AND m2."start_date" <= m1."end_date"
       AND m2."end_date" >= m1."start_date"
     WHERE m1."status" = 'active'`,
  },
  {
    id: "PRE_MEMBERSHIP_DATES_INVERTED",
    phase: "pre",
    severity: "WARNING",
    title: "Membresías con start_date > end_date",
    countSql: `SELECT COUNT(*)::int AS n FROM "client_memberships" WHERE "start_date" > "end_date"`,
  },
  {
    id: "PRE_CLIENT_ASSIGNED_TRAINER_INVALID",
    phase: "pre",
    severity: "INFO",
    title: "clients.assigned_trainer_id que apunta a usuarios sin rol trainer o sin Trainer vinculado",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "clients" c
      JOIN "users" u ON u."id" = c."assigned_trainer_id"
      LEFT JOIN "trainers" t ON t."user_id" = u."id"
     WHERE u."role" <> 'trainer' OR t."id" IS NULL`,
  },
  {
    id: "PRE_ACTIVE_TRAINERS_WITHOUT_USER",
    phase: "pre",
    severity: "INFO",
    title: "Trainers activos sin user_id (no podrán usar el portal de entrenador)",
    countSql: `SELECT COUNT(*)::int AS n FROM "trainers" WHERE "status" = 'active' AND "user_id" IS NULL`,
  },
  {
    id: "PRE_INVALID_HHMM_SCHEDULED_CLASSES",
    phase: "pre",
    severity: "WARNING",
    title: "scheduled_classes con start_time/end_time fuera de HH:mm o invertidos",
    countSql: `SELECT COUNT(*)::int AS n FROM "scheduled_classes"
     WHERE "start_time" !~ ${HHMM} OR "end_time" !~ ${HHMM} OR "start_time" >= "end_time"`,
    sampleSql: `SELECT "id" FROM "scheduled_classes"
     WHERE "start_time" !~ ${HHMM} OR "end_time" !~ ${HHMM} OR "start_time" >= "end_time"
     ORDER BY "id" LIMIT 20`,
  },
  {
    id: "PRE_INVALID_HHMM_TRAINER_AVAILABILITY",
    phase: "pre",
    severity: "WARNING",
    title: "trainer_availability con start_time/end_time fuera de HH:mm o invertidos",
    countSql: `SELECT COUNT(*)::int AS n FROM "trainer_availability"
     WHERE "start_time" !~ ${HHMM} OR "end_time" !~ ${HHMM} OR "start_time" >= "end_time"`,
  },
  {
    id: "PRE_TRAINER_BRANCH_TENANT_MISMATCH",
    phase: "pre",
    severity: "WARNING",
    title:
      "Entrenadores cuya sede es de otro tenant (historial: la FK trainers_branch_id_tenant_id_fkey queda NOT VALID; limpiar antes de VALIDATE CONSTRAINT)",
    countSql: `SELECT COUNT(*)::int AS n
      ${TRAINER_BRANCH_TENANT_MISMATCH}`,
    sampleSql: `SELECT t."id" AS trainer_id, t."tenant_id" AS trainer_tenant, br."tenant_id" AS branch_tenant
      ${TRAINER_BRANCH_TENANT_MISMATCH}
     ORDER BY t."id" LIMIT 20`,
  },
  {
    id: "PRE_DB_TIMEZONE_MARGIN_UNSAFE",
    phase: "pre",
    severity: "WARNING",
    title:
      "TimeZone de la sesión PostgreSQL con desfase > +12 h: el margen CURRENT_DATE - 1 de vigencia deja de ser fallo cerrado para gimnasios en UTC-12",
    countSql: `SELECT (EXTRACT(TIMEZONE FROM now()) > 43200)::int AS n`,
    sampleSql: `SELECT current_setting('TimeZone') AS session_timezone, EXTRACT(TIMEZONE FROM now())::int AS utc_offset_seconds`,
  },
  {
    id: "PRE_GYMS_WITHOUT_SETTINGS",
    phase: "pre",
    severity: "INFO",
    title: "Gimnasios sin fila gym_settings (la política usará defaults; timezone NULL)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "gyms" g LEFT JOIN "gym_settings" gs ON gs."gym_id" = g."id"
     WHERE gs."id" IS NULL`,
  },
  {
    id: "PRE_ORGANIZATIONS_TIMEZONE_INVALID",
    phase: "pre",
    severity: "INFO",
    title: "platform_organizations sin timezone IANA válido (solo relevante en Control Plane)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "platform_organizations" o
     WHERE o."timezone" IS NULL
        OR NOT EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z."name" = o."timezone")`,
  },

  // ── POST ──────────────────────────────────────────────────────────
  {
    id: "POST_BOOKED_COUNT_DRIFT",
    phase: "post",
    severity: "BLOCKER",
    title: "Sesiones donde booked_count ≠ reservas confirmadas (invariante I1)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "scheduled_classes" s
      LEFT JOIN (
        SELECT "scheduled_class_id", COUNT(*)::int AS c
          FROM "class_bookings" WHERE "booking_status" = 'confirmed'
         GROUP BY "scheduled_class_id") x ON x."scheduled_class_id" = s."id"
     WHERE s."booked_count" <> COALESCE(x.c, 0)`,
    sampleSql: `SELECT s."id" AS class_id, s."booked_count", COALESCE(x.c, 0) AS confirmed
      FROM "scheduled_classes" s
      LEFT JOIN (
        SELECT "scheduled_class_id", COUNT(*)::int AS c
          FROM "class_bookings" WHERE "booking_status" = 'confirmed'
         GROUP BY "scheduled_class_id") x ON x."scheduled_class_id" = s."id"
     WHERE s."booked_count" <> COALESCE(x.c, 0)
     ORDER BY s."id" LIMIT 20`,
  },
  {
    id: "POST_SESSIONS_USED_DRIFT",
    phase: "post",
    severity: "BLOCKER",
    title: "Membresías donde sessions_used ≠ reservas CONSUMED (invariante I2)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM "client_memberships" m
      LEFT JOIN (
        SELECT "client_membership_id", COUNT(*)::int AS c
          FROM "class_bookings" WHERE "consumption" = 'CONSUMED'
         GROUP BY "client_membership_id") x ON x."client_membership_id" = m."id"
     WHERE m."sessions_used" <> COALESCE(x.c, 0)`,
  },
  {
    id: "POST_MISSING_TRIGGERS",
    phase: "post",
    severity: "BLOCKER",
    title: "Triggers GYM-BOOKINGS ausentes o deshabilitados",
    countSql: `SELECT COUNT(*)::int AS n
      FROM (VALUES ${sqlList(GYM_BOOKINGS_EXPECTED_TRIGGERS)}) AS e(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgname = e.name AND NOT t.tgisinternal AND t.tgenabled <> 'D')`,
  },
  {
    id: "POST_MISSING_CHECKS",
    phase: "post",
    severity: "BLOCKER",
    title: "CHECK constraints GYM-BOOKINGS ausentes",
    countSql: `SELECT COUNT(*)::int AS n
      FROM (VALUES ${sqlList(GYM_BOOKINGS_EXPECTED_CHECKS)}) AS e(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = e.name AND c.contype = 'c')`,
  },
  {
    id: "POST_MISSING_FOREIGN_KEYS",
    phase: "post",
    severity: "BLOCKER",
    title: "FKs compuestas por tenant de la remediación final ausentes (H02 / H03)",
    countSql: `SELECT COUNT(*)::int AS n
      FROM (VALUES ${sqlList(GYM_BOOKINGS_EXPECTED_FKS)}) AS e(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = e.name AND c.contype = 'f')`,
  },
  {
    id: "POST_TRAINER_BRANCH_TENANT_MISMATCH",
    phase: "post",
    severity: "WARNING",
    title: "Entrenadores heredados con sede de otro tenant (bloquean VALIDATE de trainers_branch_id_tenant_id_fkey)",
    countSql: `SELECT COUNT(*)::int AS n
      ${TRAINER_BRANCH_TENANT_MISMATCH}`,
  },
  {
    id: "POST_LEGACY_DEFAULTS_ALTERED",
    phase: "post",
    severity: "BLOCKER",
    title: "Reservas heredadas (channel NULL) con consumo o membresía vinculada (sin consumo retroactivo)",
    countSql: `SELECT COUNT(*)::int AS n FROM "class_bookings"
     WHERE "channel" IS NULL AND ("consumption" <> 'NOT_APPLICABLE' OR "client_membership_id" IS NOT NULL)`,
  },
  {
    id: "POST_BOOKINGS_TENANT_NULL",
    phase: "post",
    severity: "WARNING",
    title: "Reservas con tenant_id NULL tras el backfill",
    countSql: `SELECT COUNT(*)::int AS n FROM "class_bookings" WHERE "tenant_id" IS NULL`,
  },
  {
    id: "POST_ATTENDANCE_TENANT_NULL",
    phase: "post",
    severity: "WARNING",
    title: "Asistencias con tenant_id NULL tras el backfill",
    countSql: `SELECT COUNT(*)::int AS n FROM "class_attendance" WHERE "tenant_id" IS NULL`,
  },
  {
    id: "POST_CLASSES_OVER_CAPACITY",
    phase: "post",
    severity: "WARNING",
    title: "Sesiones con booked_count > capacity (bloquea el CHECK de cupo previsto para 2B)",
    countSql: `SELECT COUNT(*)::int AS n FROM "scheduled_classes" WHERE "booked_count" > "capacity"`,
  },
];

export function gymPreflightChecksFor(phase: GymPreflightPhase): GymPreflightCheck[] {
  return GYM_BOOKINGS_PREFLIGHT_CHECKS.filter((c) => c.phase === phase);
}
