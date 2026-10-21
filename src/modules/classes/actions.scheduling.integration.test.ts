// ─────────────────────────────────────────────────────────────────
// classes — actions.scheduling.integration.test.ts
//
// GYM-BOOKINGS 2B · auditoría H03 — R14 ("un entrenador no puede tener dos
// sesiones no canceladas que se solapen") bajo concurrencia REAL.
//
// Ejecuta las Server Actions reales (createScheduledClassAction /
// updateScheduledClassAction) contra PostgreSQL desechable con DOS
// PrismaClient independientes (dos pools/conexiones). Solo se simulan la
// sesión de Next (guards, redirect, revalidate) y el contexto operativo,
// que entrega el PrismaClient real. Se omite sin GYM_BOOKING_IT_*.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, waitForLockWaiters, type ItDatabase } from "./booking/testing/pg-it-harness";
import { dayOffset, seedBase, T1, USERS } from "./booking/testing/booking-fixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "it-user-sa1", tenant_id: "it-tenant-1", location_id: null, role: "super_admin" })),
  requireMembershipManager: vi.fn(),
  canManageClass: vi.fn(() => true),
}));

const holder = vi.hoisted(() => ({ als: null as null | { run: <T>(store: unknown, fn: () => T) => T; getStore: () => unknown } }));

vi.mock("@/modules/platform/runtime/require-operational-context", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  holder.als = new AsyncLocalStorage();
  return {
    OperationalContextError: class extends Error {},
    // Cada llamada recibe el PrismaClient atado a SU contexto asíncrono (dos pools reales).
    requireOperationalContext: vi.fn(async () => ({
      context: {
        effectiveUser: { id: "it-user-sa1", role: "super_admin", location_id: null },
        tenantId: "it-tenant-1",
        locationId: null,
        gymId: "it-tenant-1",
        client: holder.als!.getStore(),
      },
      dispose: async () => {},
    })),
  };
});

import { createScheduledClassAction, updateScheduledClassAction } from "./actions";

const ROUNDS = 8;
const PER_ROUND = 4;

describe.skipIf(!IT_ENABLED)("H03 · R14 bajo concurrencia real en alta/edición de clases", () => {
  let it2b: ItDatabase;
  let a: PrismaClient;
  let b: PrismaClient;
  // Los esquemas de las acciones exigen UUID: entidades propias con ids UUID.
  const BRANCH = randomUUID();
  const TRAINER = randomUUID();
  const CLASS_TYPE = randomUUID();

  beforeAll(async () => {
    it2b = await createItDatabase();
    a = it2b.db;
    b = it2b.extraClient();
    await seedBase(a);
    await a.branch.create({ data: { id: BRANCH, gym_id: T1, tenant_id: T1, name: "Sede UUID" } });
    await a.trainer.create({ data: { id: TRAINER, gym_id: T1, tenant_id: T1, branch_id: BRANCH, first_name: "T", last_name: "UUID" } });
    await a.classType.create({ data: { id: CLASS_TYPE, gym_id: T1, tenant_id: T1, name: "Funcional UUID" } });
    await a.trainerAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        gym_id: T1,
        tenant_id: T1,
        branch_id: BRANCH,
        trainer_id: TRAINER,
        day_of_week: d,
        start_time: "00:00",
        end_time: "23:59",
      })),
    });
    expect(USERS.sa1).toBe("it-user-sa1");
  }, 180_000);

  afterAll(async () => {
    await it2b?.drop();
    await disconnectAdmin();
  });

  const form = (date: string, start: string, end: string, extra: Record<string, string> = {}) => {
    const f = new FormData();
    const fields: Record<string, string> = {
      branch_id: BRANCH,
      class_type_id: CLASS_TYPE,
      trainer_id: TRAINER,
      title: "Clase",
      class_date: date,
      start_time: start,
      end_time: end,
      capacity: "10",
      ...extra,
    };
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  /** Ejecuta la acción con el PrismaClient indicado (una conexión real distinta por cliente). */
  function onClient<T>(client: PrismaClient, run: () => Promise<T>): Promise<T> {
    return holder.als!.run(client, run);
  }

  const nonCancelledOn = (date: string) =>
    a.scheduledClass.findMany({
      where: { trainer_id: TRAINER, class_date: new Date(`${date}T00:00:00.000Z`), status: { not: "cancelled" } },
      select: { id: true, start_time: true, end_time: true },
    });

  it("H03-1 altas solapadas simultáneas desde dos conexiones → exactamente una por ronda", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const date = dayOffset(30 + round);
      const results = await Promise.all(
        Array.from({ length: PER_ROUND }, (_, i) =>
          onClient(i % 2 === 0 ? a : b, () => createScheduledClassAction(undefined, form(date, i % 2 ? "07:30" : "07:00", i % 2 ? "08:30" : "08:00")))
        )
      );
      const rows = await nonCancelledOn(date);
      expect(rows, `ronda ${round}`).toHaveLength(1);
      const rejected = results.filter((r) => r && "errors" in r && r.errors?.start_time);
      expect(rejected, `ronda ${round}`).toHaveLength(PER_ROUND - 1);
    }
  }, 120_000);

  it("H03-2 ediciones simultáneas que mueven dos clases al mismo horario → solo una", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const date = dayOffset(60 + round);
      const ids = [randomUUID(), randomUUID()];
      for (const [i, id] of ids.entries()) {
        await a.scheduledClass.create({
          data: {
            id,
            gym_id: T1,
            tenant_id: T1,
            branch_id: BRANCH,
            class_type_id: CLASS_TYPE,
            trainer_id: TRAINER,
            title: "Base",
            class_date: new Date(`${date}T00:00:00.000Z`),
            start_time: i === 0 ? "05:00" : "06:00",
            end_time: i === 0 ? "05:30" : "06:30",
            capacity: 10,
          },
        });
      }
      await Promise.all([
        onClient(a, () => updateScheduledClassAction(undefined, form(date, "09:00", "10:00", { id: ids[0] }))),
        onClient(b, () => updateScheduledClassAction(undefined, form(date, "09:30", "10:30", { id: ids[1] }))),
      ]);
      const rows = await nonCancelledOn(date);
      const at9 = rows.filter((r) => r.start_time >= "09:00");
      expect(at9, `ronda ${round}`).toHaveLength(1);
    }
  }, 120_000);

  it("H03-3 la acción bloquea al entrenador ANTES de validar y escribir (espera un lock externo)", async () => {
    const date = dayOffset(90);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let ready!: () => void;
    const acquired = new Promise<void>((r) => (ready = r));
    const holder = b.$transaction(
      async (tx) => {
        // NO KEY UPDATE: no choca con el KEY SHARE de la FK del INSERT (el código
        // anterior validaba y escribía sin esperar), sí con el FOR UPDATE del fix.
        await tx.$queryRawUnsafe(`SELECT id FROM trainers WHERE id = '${TRAINER}' FOR NO KEY UPDATE`);
        ready();
        await gate;
      },
      { timeout: 60_000 }
    );
    await acquired;
    let done = false;
    const pending = onClient(a, () => createScheduledClassAction(undefined, form(date, "07:00", "08:00"))).then((r) => {
      done = true;
      return r;
    });
    await waitForLockWaiters(it2b.name, 1, 10_000);
    expect(done).toBe(false);
    expect(await nonCancelledOn(date)).toHaveLength(0);
    release();
    await holder;
    await pending;
    expect(await nonCancelledOn(date)).toHaveLength(1);
  }, 60_000);

  it("H03-4 regresión: validaciones existentes intactas (disponibilidad, solapamiento secuencial, entrenador de otro tenant)", async () => {
    const date = dayOffset(100);
    await onClient(a, () => createScheduledClassAction(undefined, form(date, "07:00", "08:00")));
    const overlap = await onClient(a, () => createScheduledClassAction(undefined, form(date, "07:30", "08:30")));
    expect(overlap).toMatchObject({ errors: { start_time: [expect.stringContaining("ya tiene una clase programada")] } });
    const contiguous = await onClient(a, () => createScheduledClassAction(undefined, form(date, "08:00", "09:00")));
    expect(contiguous).toBeUndefined();
    await a.trainerAvailability.updateMany({ where: { trainer_id: TRAINER, day_of_week: new Date(`${date}T00:00:00Z`).getUTCDay() }, data: { status: "inactive" } });
    const noAvail = await onClient(a, () => createScheduledClassAction(undefined, form(date, "12:00", "13:00")));
    expect(noAvail).toMatchObject({ errors: { start_time: ["El entrenador no tiene disponibilidad registrada para ese día."] } });
    await a.trainerAvailability.updateMany({ where: { trainer_id: TRAINER }, data: { status: "active" } });
    const foreign = await onClient(a, () =>
      createScheduledClassAction(undefined, form(date, "15:00", "16:00", { trainer_id: randomUUID() }))
    );
    expect(foreign).toEqual({ error: "Entrenador no encontrado." });
    expect(await nonCancelledOn(date)).toHaveLength(2);
  }, 60_000);
});
