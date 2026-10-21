// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — certificación de 20261020000000_gym_bookings_capacity_check
// contra PostgreSQL REAL desechable (se omite sin GYM_BOOKING_IT_*).
//
//  G1 aplica sobre datos limpios: CHECK presente y NOT VALID.
//  G2 se niega con sobrecupo heredado (GYM_CAPACITY_CHECK_BLOCKED) sin dejar nada.
//  G3 CONTRAFACTUAL: por qué la guarda — un NOT VALID "a secas" vuelve
//     inmutable la sesión sobre cupo (cancelar una reserva falla).
//  G4 limpieza revisada: corrige historial, deja vigentes para decisión.
//  G5 tras migrar: una escritura que se salte el servicio no puede sobrevender;
//     cancelar sigue funcionando; VALIDATE CONSTRAINT pasa.
//  G6 reversión revisada y re-aplicación.
//  G7 preflight pre2b/post2b sobre la misma base.
// ─────────────────────────────────────────────────────────────────

import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { mapGymBookingDbError } from "./booking-db-errors";
import { createGymBookingService } from "./booking-service";
import {
  createItDatabase,
  disconnectAdmin,
  IT_ENABLED,
  migrationPath,
  psqlFile,
  type ItDatabase,
} from "./testing/pg-it-harness";
import { createMember, createSession, dayOffset, key, seedBase, staffBook } from "./testing/booking-fixtures";
import {
  GYM_BOOKINGS_2B_CAPACITY_CHECK,
  GYM_BOOKINGS_2B_MIGRATION,
  gymPreflightChecksFor,
} from "../../../../prisma/scripts/gym-bookings/preflight-gym-bookings.queries";

const SCRIPTS = path.resolve(__dirname, "../../../../prisma/scripts/gym-bookings");
const MIGRATION = migrationPath(GYM_BOOKINGS_2B_MIGRATION);

async function constraint(db: PrismaClient) {
  const rows = await db.$queryRawUnsafe<{ convalidated: boolean }[]>(
    `SELECT convalidated FROM pg_constraint WHERE conname = '${GYM_BOOKINGS_2B_CAPACITY_CHECK}'`
  );
  return rows[0] ?? null;
}

/** Sobrecupo heredado: dos reservas directas (ruta heredada sin control) en una sesión de cupo 1. */
async function overbook(db: PrismaClient, date: string) {
  const ses = await createSession(db, { capacity: 1, date });
  const a = await createMember(db);
  const b = await createMember(db);
  const ba = await db.classBooking.create({ data: { scheduled_class_id: ses, client_id: a.clientId } });
  await db.classBooking.create({ data: { scheduled_class_id: ses, client_id: b.clientId } });
  return { ses, bookingA: ba.id };
}

async function preflight(db: PrismaClient, phase: "pre2b" | "post2b") {
  const out: Record<string, number> = {};
  for (const c of gymPreflightChecksFor(phase)) {
    out[c.id] = Number((await db.$queryRawUnsafe<{ n: number }[]>(c.countSql))[0].n);
  }
  return out;
}

describe.skipIf(!IT_ENABLED)("migración 2B — CHECK de cupo NOT VALID (PostgreSQL real)", () => {
  const dbs: ItDatabase[] = [];
  const fresh = async () => {
    const d = await createItDatabase({ until: GYM_BOOKINGS_2B_MIGRATION });
    dbs.push(d);
    await seedBase(d.db);
    return d;
  };

  afterAll(async () => {
    for (const d of dbs) await d.drop();
    await disconnectAdmin();
  });

  it("G1 aplica sobre datos limpios: CHECK presente y NOT VALID", async () => {
    const d = await fresh();
    await createSession(d.db, { capacity: 2 });
    expect(await constraint(d.db)).toBeNull();
    psqlFile(d.name, MIGRATION);
    expect(await constraint(d.db)).toEqual({ convalidated: false });
  }, 120_000);

  it("G2 con sobrecupo heredado se niega (GYM_CAPACITY_CHECK_BLOCKED) y no deja el CHECK", async () => {
    const d = await fresh();
    await overbook(d.db, dayOffset(-10));
    expect(() => psqlFile(d.name, MIGRATION)).toThrow(/GYM_CAPACITY_CHECK_BLOCKED: 1 scheduled_classes/);
    expect(await constraint(d.db)).toBeNull();
  }, 120_000);

  it("G3 contrafactual: un NOT VALID sin guarda deja inmutable la sesión sobre cupo", async () => {
    const d = await fresh();
    const { bookingA } = await overbook(d.db, dayOffset(3));
    const err = await d.db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE scheduled_classes ADD CONSTRAINT cf_capacity_chk CHECK (booked_count <= capacity) NOT VALID`
        );
        // Editar la sesión (cualquier UPDATE de la fila sobre cupo) ya falla.
        await tx.$executeRawUnsafe(`UPDATE scheduled_classes SET title = 'x' WHERE booked_count > capacity`);
        return null;
      })
      .catch((e: Error) => e);
    expect(String(err?.message)).toMatch(/cf_capacity_chk/);
    // Y con 3 reservas sobre cupo 1, cancelar una (3 → 2) también falla:
    const third = await createMember(d.db);
    const ses = (await d.db.classBooking.findUniqueOrThrow({ where: { id: bookingA } })).scheduled_class_id;
    await d.db.classBooking.create({ data: { scheduled_class_id: ses, client_id: third.clientId } });
    const cancelErr = await d.db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE scheduled_classes ADD CONSTRAINT cf_capacity_chk CHECK (booked_count <= capacity) NOT VALID`
        );
        await tx.classBooking.update({ where: { id: bookingA }, data: { booking_status: "cancelled" } });
        return null;
      })
      .catch((e: Error) => e);
    expect(String(cancelErr?.message)).toMatch(/cf_capacity_chk/);
  }, 120_000);

  it("G4 limpieza revisada: corrige historial (capacity := booked_count) y deja las vigentes para decisión", async () => {
    const d = await fresh();
    const past = await overbook(d.db, dayOffset(-10));
    const current = await overbook(d.db, dayOffset(2));
    expect((await preflight(d.db, "pre2b")).PRE_2B_CLASSES_OVER_CAPACITY).toBe(2);
    psqlFile(d.name, path.join(SCRIPTS, "cleanup-over-capacity-2b.sql"));
    const fixed = await d.db.scheduledClass.findUniqueOrThrow({ where: { id: past.ses } });
    expect(fixed).toMatchObject({ capacity: 2, booked_count: 2 });
    expect((await preflight(d.db, "pre2b")).PRE_2B_CLASSES_OVER_CAPACITY).toBe(1);
    expect(() => psqlFile(d.name, MIGRATION)).toThrow(/GYM_CAPACITY_CHECK_BLOCKED: 1 /);
    // Decisión del gimnasio sobre la vigente: el staff cancela una reserva con el servicio.
    const svc = createGymBookingService(d.db);
    const r = await svc.cancelBooking({
      scope: { tenantId: "it-tenant-1", locationId: null },
      actor: { userId: "it-user-sa1", role: "super_admin" },
      channel: "STAFF",
      bookingId: current.bookingA,
      idempotencyKey: key(),
    });
    expect(r.ok).toBe(true);
    expect(await preflight(d.db, "pre2b")).toMatchObject({ PRE_2B_CLASSES_OVER_CAPACITY: 0, PRE_2B_BOOKING_COUNTER_DRIFT: 0 });
    psqlFile(d.name, MIGRATION);
    expect(await constraint(d.db)).toEqual({ convalidated: false });
  }, 120_000);

  it("G5 tras migrar: escribir saltándose el servicio no sobrevende; cancelar funciona; VALIDATE pasa", async () => {
    const d = await fresh();
    psqlFile(d.name, MIGRATION);
    const ses = await createSession(d.db, { capacity: 1 });
    const a = await createMember(d.db);
    const b = await createMember(d.db);
    const svc = createGymBookingService(d.db);
    const booked = await svc.bookSession(staffBook(ses, a.clientId));
    expect(booked.ok).toBe(true);
    // Ruta heredada (sin control de cupo): el CHECK es el respaldo.
    const err = await d.db.classBooking.create({ data: { scheduled_class_id: ses, client_id: b.clientId } }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(mapGymBookingDbError(err)).toBe("SESSION_FULL");
    expect(await d.db.classBooking.count({ where: { scheduled_class_id: ses } })).toBe(1);
    if (booked.ok) {
      const c = await svc.cancelBooking({
        scope: { tenantId: "it-tenant-1", locationId: null },
        actor: { userId: "it-user-sa1", role: "super_admin" },
        channel: "STAFF",
        bookingId: booked.value.bookingId,
        idempotencyKey: key(),
      });
      expect(c.ok).toBe(true);
    }
    await d.db.$executeRawUnsafe(`ALTER TABLE scheduled_classes VALIDATE CONSTRAINT ${GYM_BOOKINGS_2B_CAPACITY_CHECK}`);
    expect(await constraint(d.db)).toEqual({ convalidated: true });
    expect(await preflight(d.db, "post2b")).toEqual({
      POST_2B_MISSING_CAPACITY_CHECK: 0,
      POST_2B_CLASSES_OVER_CAPACITY: 0,
      POST_2B_CAPACITY_CHECK_NOT_VALIDATED: 0,
    });
  }, 120_000);

  it("G6 reversión revisada (roll-forward) y re-aplicación", async () => {
    const d = await fresh();
    psqlFile(d.name, MIGRATION);
    expect((await preflight(d.db, "post2b")).POST_2B_CAPACITY_CHECK_NOT_VALIDATED).toBe(1);
    psqlFile(d.name, path.join(SCRIPTS, "rollback-gym-bookings-capacity-check.sql"));
    expect(await constraint(d.db)).toBeNull();
    expect((await preflight(d.db, "post2b")).POST_2B_MISSING_CAPACITY_CHECK).toBe(1);
    psqlFile(d.name, MIGRATION);
    expect(await constraint(d.db)).toEqual({ convalidated: false });
  }, 120_000);
});
