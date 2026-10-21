// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3C — certificación: generación concurrente de una serie
// contra PostgreSQL REAL desechable (mismo arnés que 2B/3A/3B: 127.0.0.1,
// puerto ≠ 5432, data_directory verificado; sin .env ni DATABASE_URL).
// Se omite sin GYM_BOOKING_IT_*.
//
// 3A certificó la repetición SECUENCIAL (R2). Aquí la misma serie se genera
// a la vez desde conexiones PrismaClient independientes, sin sleeps: el
// lock trainers FOR UPDATE → class_series FOR UPDATE serializa las
// transacciones; la segunda ve las fechas ya creadas y las omite.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import {
  B1,
  CLASS_TYPE_1,
  invariantViolations,
  MODALITIES_ON,
  NO_VIOLATIONS,
  seedBase,
  setPolicy,
  T1,
  TRAINER_A,
  USERS,
} from "../booking/testing/booking-fixtures";
import { generateSeriesSessions } from "./series-service";

// Reloj controlado: miércoles 2026-10-21 09:00 en El Salvador (UTC−6).
const NOW = new Date("2026-10-21T15:00:00Z");
const WEDNESDAY = 3;

describe.skipIf(!IT_ENABLED)("GYM-3C series concurrentes — integración PostgreSQL real", () => {
  let it3c: ItDatabase;
  let db: PrismaClient;

  beforeAll(async () => {
    it3c = await createItDatabase();
    db = it3c.db;
    await seedBase(db);
    await setPolicy(db, T1, MODALITIES_ON);
    await db.trainerAvailability.create({
      data: { gym_id: T1, tenant_id: T1, branch_id: B1, trainer_id: TRAINER_A, day_of_week: WEDNESDAY, start_time: "06:00", end_time: "21:00" },
    });
  }, 180_000);

  afterAll(async () => {
    await it3c?.drop();
    await disconnectAdmin();
  }, 180_000);

  async function newSeries(title: string, start: string, end: string): Promise<string> {
    const s = await db.classSeries.create({
      data: {
        tenant_id: T1,
        location_id: B1,
        class_type_id: CLASS_TYPE_1,
        trainer_id: TRAINER_A,
        session_kind: "GROUP",
        title,
        weekday: WEDNESDAY,
        start_time: start,
        end_time: end,
        capacity: 6,
        valid_from: new Date("2026-10-21T00:00:00Z"),
      },
    });
    return s.id;
  }

  const generate = (client: PrismaClient, seriesId: string) =>
    generateSeriesSessions(client, { tenantId: T1, gymId: T1, seriesId, actorUserId: USERS.sa1, now: NOW });

  // Horarios distintos por caso: las dos series comparten entrenador y día.
  it.each([
    { lanes: 2, start: "18:00", end: "19:00", utc: "00:00" },
    { lanes: 4, start: "19:00", end: "20:00", utc: "01:00" },
  ])("I$lanes generaciones simultáneas de la misma serie → 4 sesiones, cero duplicados, una sola transacción crea", async ({ lanes, start, end, utc }) => {
    const seriesId = await newSeries(`3C-concurrente-${lanes}`, start, end);
    const clients = Array.from({ length: lanes }, () => it3c.extraClient());
    const results = await Promise.all(clients.map((c) => generate(c, seriesId)));

    expect(results.every((r) => r.ok)).toBe(true);
    const reports = results.map((r) => (r.ok ? r.report : null)!);
    const created = reports.flatMap((r) => r.created);
    // Cada fecha la crea exactamente una transacción; las demás la omiten.
    expect([...created].sort()).toEqual(["2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11"]);
    expect(reports.filter((r) => r.created.length > 0)).toHaveLength(1);
    expect(reports.filter((r) => r.skippedExisting.length === 4)).toHaveLength(lanes - 1);

    const rows = await db.scheduledClass.findMany({ where: { series_id: seriesId }, orderBy: { class_date: "asc" } });
    expect(rows).toHaveLength(4);
    // El Salvador (UTC−6, sin DST): 18:00/19:00 locales = 00:00Z/01:00Z del día siguiente.
    expect(rows.map((r) => r.starts_at?.toISOString())).toEqual(
      ["2026-10-22", "2026-10-29", "2026-11-05", "2026-11-12"].map((d) => `${d}T${utc}:00.000Z`)
    );
    expect(rows.every((r) => r.booked_count === 0 && r.capacity === 6 && r.session_kind === "GROUP")).toBe(true);
  });

  it("I-Z invariantes de contadores intactos", async () => {
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
  });
});
