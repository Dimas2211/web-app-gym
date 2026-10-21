// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — generación explícita de sesiones de una ClassSeries.
//
// Operación administrativa (sin cron). Una transacción READ COMMITTED:
//   trainers FOR UPDATE → class_series FOR UPDATE   (GYM_BOOKING_LOCK_ORDER)
//   → gym_settings FOR SHARE (auditoría 3A H04: timezone de los instantes)
//   → lecturas de ausencias, disponibilidad y agenda del entrenador
//   → INSERT de las sesiones nuevas (el trigger de 2A valida sede/tipo).
//
// Idempotente: una fecha que ya tiene sesión de la serie (cualquier estado)
// se omite y nunca se reescribe (reservas, asistencia y cancelaciones
// quedan intactas). @@unique([series_id, class_date]) es el respaldo y
// createMany usa skipDuplicates. La ventana es finita: hoy (fecha local
// del gimnasio) + series_generation_weeks, recortada por la vigencia.
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { dateOnly, localDate } from "../booking/booking-eligibility";
import { loadSchedulingPolicy, lockTrainerForScheduling } from "./scheduling-guards";
import {
  dbDate,
  planSeriesDates,
  resolveSessionSetup,
  timeOffCoversSlot,
} from "./scheduling-rules";

export type SeriesConflictReason = "NO_AVAILABILITY" | "OUTSIDE_AVAILABILITY" | "TRAINER_TIME_OFF" | "TRAINER_OVERLAP";

export interface SeriesGenerationReport {
  window: { from: string; to: string };
  created: string[];
  skippedExisting: string[];
  conflicts: { date: string; reason: SeriesConflictReason }[];
  generatedUntil: string | null;
}

export type SeriesGenerationResult =
  | { ok: true; report: SeriesGenerationReport }
  | { ok: false; error: string };

const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 30_000,
  maxWait: 15_000,
};

export async function generateSeriesSessions(
  db: PrismaClient,
  input: { tenantId: string; gymId: string; seriesId: string; actorUserId: string; now?: Date }
): Promise<SeriesGenerationResult> {
  const now = input.now ?? new Date();
  const preview = await db.classSeries.findFirst({
    where: { id: input.seriesId, tenant_id: input.tenantId },
    select: { trainer_id: true },
  });
  if (!preview) return { ok: false, error: "Serie no encontrada." };

  return db.$transaction(async (tx): Promise<SeriesGenerationResult> => {
    await lockTrainerForScheduling(tx, preview.trainer_id, input.tenantId);
    await tx.$queryRaw`SELECT "id" FROM "class_series" WHERE "id" = ${input.seriesId} AND "tenant_id" = ${input.tenantId} FOR UPDATE`;

    const series = await tx.classSeries.findFirst({
      where: { id: input.seriesId, tenant_id: input.tenantId },
      include: {
        trainer: { select: { status: true, branch_id: true, personalized_capacity: true } },
        class_type: { select: { capacity_default: true, status: true } },
      },
    });
    if (!series) return { ok: false, error: "Serie no encontrada." };
    // El entrenador de una serie no se edita (3A); si cambió, el lock tomado no es el suyo.
    if (series.trainer_id !== preview.trainer_id) {
      return { ok: false, error: "La serie cambió mientras se generaba. Intenta nuevamente." };
    }
    if (series.status !== "active") return { ok: false, error: "La serie no está activa." };
    if (series.trainer.status !== "active") return { ok: false, error: "El entrenador de la serie no está activo." };
    if (series.class_type.status !== "active") return { ok: false, error: "El tipo de clase de la serie no está activo." };

    const policy = await loadSchedulingPolicy(tx, input.tenantId);
    const today = localDate(now, policy.timezone);
    const plan = planSeriesDates({
      weekday: series.weekday,
      validFrom: dateOnly(series.valid_from),
      validUntil: series.valid_until ? dateOnly(series.valid_until) : null,
      today,
      weeks: policy.seriesGenerationWeeks,
    });
    const report: SeriesGenerationReport = {
      window: { from: plan.from, to: plan.to },
      created: [],
      skippedExisting: [],
      conflicts: [],
      generatedUntil: series.generated_until ? dateOnly(series.generated_until) : null,
    };
    if (plan.dates.length === 0) return { ok: true, report };

    // Cupo e instantes: misma regla que el alta manual (R18/R19). Se valida
    // una vez con la primera fecha y por fecha para los instantes (DST).
    const firstSetup = resolveSessionSetup({
      kind: series.session_kind,
      policy,
      date: plan.dates[0],
      startTime: series.start_time,
      endTime: series.end_time,
      seriesCapacity: series.capacity,
      trainerPersonalizedCapacity: series.trainer.personalized_capacity,
      classTypeCapacityDefault: series.class_type.capacity_default,
    });
    if (!firstSetup.ok) return { ok: false, error: firstSetup.message };

    const windowDates = plan.dates.map(dbDate);
    const [existing, timeOff, availability, agenda] = await Promise.all([
      tx.scheduledClass.findMany({
        where: { series_id: series.id, class_date: { in: windowDates } },
        select: { class_date: true },
      }),
      tx.trainerTimeOff.findMany({
        where: {
          tenant_id: input.tenantId,
          trainer_id: series.trainer_id,
          status: "active",
          starts_on: { lte: dbDate(plan.to) },
          ends_on: { gte: dbDate(plan.from) },
        },
        select: { starts_on: true, ends_on: true, start_time: true, end_time: true },
      }),
      tx.trainerAvailability.findMany({
        where: { trainer_id: series.trainer_id, day_of_week: series.weekday, status: "active" },
        select: { start_time: true, end_time: true },
      }),
      tx.scheduledClass.findMany({
        where: { trainer_id: series.trainer_id, class_date: { in: windowDates }, status: { not: "cancelled" } },
        select: { class_date: true, start_time: true, end_time: true },
      }),
    ]);
    const existingDates = new Set(existing.map((s) => dateOnly(s.class_date)));
    const covered = availability.some((b) => b.start_time <= series.start_time && b.end_time >= series.end_time);

    const rows: Prisma.ScheduledClassCreateManyInput[] = [];
    for (const date of plan.dates) {
      if (existingDates.has(date)) {
        report.skippedExisting.push(date);
        continue;
      }
      let reason: SeriesConflictReason | null = null;
      if (availability.length === 0) reason = "NO_AVAILABILITY";
      else if (!covered) reason = "OUTSIDE_AVAILABILITY";
      else if (timeOff.some((t) => timeOffCoversSlot(t, date, series.start_time, series.end_time))) {
        reason = "TRAINER_TIME_OFF";
      } else if (
        agenda.some(
          (c) => dateOnly(c.class_date) === date && c.start_time < series.end_time && c.end_time > series.start_time
        )
      ) {
        reason = "TRAINER_OVERLAP";
      }
      if (reason) {
        report.conflicts.push({ date, reason });
        continue;
      }
      const setup = resolveSessionSetup({
        kind: series.session_kind,
        policy,
        date,
        startTime: series.start_time,
        endTime: series.end_time,
        seriesCapacity: series.capacity,
        trainerPersonalizedCapacity: series.trainer.personalized_capacity,
        classTypeCapacityDefault: series.class_type.capacity_default,
      });
      if (!setup.ok) return { ok: false, error: setup.message };
      rows.push({
        gym_id: input.gymId,
        tenant_id: input.tenantId,
        branch_id: series.location_id,
        class_type_id: series.class_type_id,
        trainer_id: series.trainer_id,
        series_id: series.id,
        session_kind: series.session_kind,
        title: series.title,
        class_date: dbDate(date),
        start_time: series.start_time,
        end_time: series.end_time,
        capacity: setup.capacity,
        room_name: series.room_name,
        starts_at: setup.startsAt,
        ends_at: setup.endsAt,
        status: "scheduled",
        created_by: input.actorUserId,
      });
      report.created.push(date);
    }

    if (rows.length > 0) {
      const inserted = await tx.scheduledClass.createMany({ data: rows, skipDuplicates: true });
      if (inserted.count !== rows.length) {
        // Otra ruta insertó la misma (serie, fecha) sin pasar por el lock de la serie.
        throw new Error("GYM_SERIES_GENERATION_RACE");
      }
    }

    const until = report.generatedUntil && report.generatedUntil > plan.to ? report.generatedUntil : plan.to;
    await tx.classSeries.update({
      where: { id: series.id },
      data: { generated_until: dbDate(until), updated_by: input.actorUserId },
    });
    report.generatedUntil = until;
    return { ok: true, report };
  }, TX);
}
