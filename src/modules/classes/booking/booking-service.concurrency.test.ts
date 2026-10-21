// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — concurrencia REAL del motor contra PostgreSQL desechable.
//
// Dos familias:
//  1. Carreras: N órdenes en paralelo (conexiones reales distintas del pool)
//     sobre el mismo recurso. Se verifica el resultado exacto (quién gana,
//     qué código reciben los demás) y los invariantes globales I1–I5.
//  2. Orden de locks (pendiente de 2A §9): una transacción externa retiene
//     un lock; se observa en pg_stat_activity que el servicio queda
//     esperando en ESE punto y, con NOWAIT, que todavía no tomó los locks
//     posteriores del orden global.
// Se omite sin GYM_BOOKING_IT_ADMIN_URL / GYM_BOOKING_IT_DATA_DIR.
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createGymBookingService } from "./booking-service";
import type { GymBookingResult, GymBookingService } from "./booking-contracts";
import { createItDatabase, disconnectAdmin, IT_ENABLED, waitForLockWaiters, type ItDatabase } from "./testing/pg-it-harness";
import { GYM_BOOKINGS_2B_MIGRATION } from "../../../../prisma/scripts/gym-bookings/preflight-gym-bookings.queries";
import {
  actor,
  createMember,
  createSession,
  invariantViolations,
  key,
  MODALITIES_ON,
  NO_VIOLATIONS,
  portalBook,
  SA1,
  seedBase,
  setPolicy,
  staffBook,
  T1,
  T1_STAFF_SCOPE,
} from "./testing/booking-fixtures";

const HOUR = 3_600_000;
const ROUNDS = 3;

const codes = <T>(rs: GymBookingResult<T>[]) =>
  rs.map((r) => (r.ok ? (r.replayed ? "REPLAY" : "OK") : r.code)).sort();
const count = (xs: string[], v: string) => xs.filter((x) => x === v).length;

/** Transacción externa que retiene locks hasta `release()`. */
function holdLocks(client: PrismaClient, sql: string[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let ready!: () => void;
  const acquired = new Promise<void>((r) => (ready = r));
  const done = client.$transaction(
    async (tx) => {
      for (const s of sql) await tx.$queryRawUnsafe(s);
      ready();
      await gate;
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
  return { acquired, release: () => release(), done };
}

/** ¿Puede otra transacción tomar este lock YA? (NOWAIT: false si alguien lo tiene). */
async function lockIsFree(client: PrismaClient, sql: string): Promise<boolean> {
  try {
    await client.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`${sql} NOWAIT`);
    });
    return true;
  } catch (err) {
    if (/55P03|could not obtain lock/i.test(String((err as Error).message))) return false;
    throw err;
  }
}

// Dos modos: con el CHECK de cupo de 2B y SIN él (solo el servicio). El
// segundo aísla la validación bajo lock: con el CHECK presente, un fallo del
// servicio quedaría oculto por el respaldo de BD (mutación medida: `>` en
// vez de `>=` solo se detecta sin el CHECK). También cubre desplegar el
// código antes que la migración de 2B.
const MODES = [
  { label: "con CHECK de cupo 2B", until: undefined },
  { label: "sin CHECK de cupo: solo el servicio", until: GYM_BOOKINGS_2B_MIGRATION },
];

describe.skipIf(!IT_ENABLED).each(MODES)("GymBookingService — concurrencia PostgreSQL real ($label)", ({ until }) => {
  let it2b: ItDatabase;
  let db: PrismaClient;
  let svc: GymBookingService;
  /** Reintentos observados en la prueba en curso (código que los causó). */
  let retries: string[] = [];
  /** Códigos de reintento legítimos en la prueba en curso (por defecto ninguno). */
  let allowedRetries: string[] = [];

  beforeAll(async () => {
    it2b = await createItDatabase({ until });
    db = it2b.db;
    await seedBase(db);
    await setPolicy(db, T1, MODALITIES_ON);
    svc = createGymBookingService(db, { onRetry: (c) => retries.push(c) });
  }, 180_000);

  afterEach(async () => {
    const unexpected = retries.filter((c) => !allowedRetries.includes(c));
    retries = [];
    allowedRetries = [];
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
    // Sin interbloqueos (CONCURRENT_UPDATE_RETRY) ni reintentos no previstos:
    // el orden de locks evita las esperas circulares, no solo las resuelve.
    // Contrafactual medido: sin el KEY SHARE de clients en recordAttendance,
    // F11 produce 5 CONCURRENT_UPDATE_RETRY (40P01) en 6 rondas.
    expect(unexpected).toEqual([]);
  });

  afterAll(async () => {
    await it2b?.drop();
    await disconnectAdmin();
  });

  const inHours = (h: number) => new Date(Date.now() + h * HOUR);

  it.each(["OPEN", "GROUP"] as const)("F1 último cupo (%s): 12 alumnos a la vez por 1 cupo → 1 OK, 11 SESSION_FULL", async (kind) => {
    for (let round = 0; round < ROUNDS; round++) {
      const ses = await createSession(db, { kind, capacity: 1, startsAt: kind === "GROUP" ? inHours(24) : undefined });
      const members = await Promise.all(
        Array.from({ length: 12 }, () => createMember(db, { modality: kind === "GROUP" ? "GROUP" : "NORMAL", sessionsTotal: kind === "GROUP" ? 3 : null }))
      );
      const rs = await Promise.all(members.map((m) => svc.bookSession(staffBook(ses, m.clientId))));
      const c = codes(rs);
      expect(count(c, "OK")).toBe(1);
      expect(count(c, "SESSION_FULL")).toBe(11);
      const s = await db.scheduledClass.findUniqueOrThrow({ where: { id: ses } });
      expect(s.booked_count).toBe(1);
      if (kind === "GROUP") {
        const used = await db.clientMembership.aggregate({ _sum: { sessions_used: true }, where: { id: { in: members.map((m) => m.membershipId) } } });
        expect(used._sum.sessions_used).toBe(1);
      }
    }
  });

  it("F2 cupo 5, 20 alumnos simultáneos → exactamente 5 OK", async () => {
    const ses = await createSession(db, { capacity: 5 });
    const members = await Promise.all(Array.from({ length: 20 }, () => createMember(db)));
    const c = codes(await Promise.all(members.map((m) => svc.bookSession(staffBook(ses, m.clientId)))));
    expect(count(c, "OK")).toBe(5);
    expect(count(c, "SESSION_FULL")).toBe(15);
  });

  it("F3 saldo 1: el mismo alumno reserva 4 sesiones a la vez → 1 OK, 3 MEMBERSHIP_EXHAUSTED", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 1 });
      const sessions = await Promise.all([20, 22, 24, 26].map((h) => createSession(db, { kind: "GROUP", startsAt: inHours(h + round * 10) })));
      const c = codes(await Promise.all(sessions.map((s) => svc.bookSession(staffBook(s, m.clientId)))));
      expect(c).toEqual(["MEMBERSHIP_EXHAUSTED", "MEMBERSHIP_EXHAUSTED", "MEMBERSHIP_EXHAUSTED", "OK"]);
      const mem = await db.clientMembership.findUniqueOrThrow({ where: { id: m.membershipId } });
      expect(mem.sessions_used).toBe(1);
    }
  });

  it("F4 doble pestaña: mismo alumno y sesión, 6 órdenes distintas → 1 OK, 5 ALREADY_BOOKED", async () => {
    const ses = await createSession(db);
    const m = await createMember(db);
    const c = codes(await Promise.all(Array.from({ length: 6 }, () => svc.bookSession(staffBook(ses, m.clientId)))));
    expect(c).toEqual(["ALREADY_BOOKED", "ALREADY_BOOKED", "ALREADY_BOOKED", "ALREADY_BOOKED", "ALREADY_BOOKED", "OK"]);
  });

  it("F5 doble clic: la misma orden 6 veces en paralelo → 1 ejecución + 5 REPLAY, 1 operación, 1 evento", async () => {
    const ses = await createSession(db);
    const m = await createMember(db);
    const cmd = staffBook(ses, m.clientId);
    const rs = await Promise.all(Array.from({ length: 6 }, () => svc.bookSession(cmd)));
    expect(codes(rs)).toEqual(["OK", "REPLAY", "REPLAY", "REPLAY", "REPLAY", "REPLAY"]);
    const opIds = new Set(rs.map((r) => (r.ok ? r.operationId : "")));
    expect(opIds.size).toBe(1);
    expect(await db.gymBookingOperation.count({ where: { idempotency_key: cmd.idempotencyKey } })).toBe(1);
    expect(await db.classBookingEvent.count({ where: { scheduled_class_id: ses } })).toBe(1);
  });

  it("F6 cancelaciones simultáneas de la misma reserva → 1 OK, 4 ALREADY_CANCELLED; la sesión se libera una vez", async () => {
    const m = await createMember(db, { modality: "GROUP", sessionsTotal: 3, withUser: true });
    const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(30) });
    const b = await svc.bookSession(portalBook(ses, m));
    if (!b.ok) throw new Error(b.code);
    const cancel = () =>
      svc.cancelBooking({ scope: { tenantId: T1, locationId: null }, actor: actor(m.userId!, "client"), channel: "PORTAL", bookingId: b.value.bookingId, idempotencyKey: key() });
    const c = codes(await Promise.all(Array.from({ length: 5 }, cancel)));
    expect(c).toEqual(["ALREADY_CANCELLED", "ALREADY_CANCELLED", "ALREADY_CANCELLED", "ALREADY_CANCELLED", "OK"]);
    const mem = await db.clientMembership.findUniqueOrThrow({ where: { id: m.membershipId } });
    expect(mem.sessions_used).toBe(0);
    expect(await db.classBookingEvent.count({ where: { booking_id: b.value.bookingId, event_type: "CANCELLED" } })).toBe(1);
  });

  it("F7 cancelación y reserva simultáneas del último cupo: el resultado es consistente en todas las rondas", async () => {
    for (let round = 0; round < 6; round++) {
      const ses = await createSession(db, { capacity: 1 });
      const a = await createMember(db);
      const b = await createMember(db);
      const ba = await svc.bookSession(staffBook(ses, a.clientId));
      if (!ba.ok) throw new Error(ba.code);
      const [cancel, book] = await Promise.all([
        svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: ba.value.bookingId, idempotencyKey: key() }),
        svc.bookSession(staffBook(ses, b.clientId)),
      ]);
      expect(cancel.ok).toBe(true);
      expect(book.ok || (!book.ok && book.code === "SESSION_FULL")).toBe(true);
      const s = await db.scheduledClass.findUniqueOrThrow({ where: { id: ses } });
      expect(s.booked_count).toBe(book.ok ? 1 : 0);
    }
  });

  it("F8 cancelSession contra 8 reservas en curso: ninguna reserva queda confirmada en la sesión cancelada", async () => {
    // Una reserva que entra entre la lectura previa y el lock de la sesión
    // cambia el conjunto a bloquear: reintento previsto (§4), nunca interbloqueo.
    allowedRetries = ["LOCK_SET_CHANGED_RETRY"];
    for (let round = 0; round < ROUNDS; round++) {
      const ses = await createSession(db, { kind: "GROUP", capacity: 20, startsAt: inHours(40 + round) });
      const members = await Promise.all(Array.from({ length: 8 }, () => createMember(db, { modality: "GROUP", sessionsTotal: 2 })));
      const bookings = members.map((m) => svc.bookSession(staffBook(ses, m.clientId)));
      const cancelSession = svc.cancelSession({ scope: T1_STAFF_SCOPE, actor: SA1, sessionId: ses, reason: "Cierre", idempotencyKey: key() });
      const [bookRs, cancelR] = await Promise.all([Promise.all(bookings), cancelSession]);
      expect(cancelR.ok).toBe(true);
      const c = codes(bookRs);
      expect(c.every((x) => x === "OK" || x === "SESSION_NOT_BOOKABLE")).toBe(true);
      expect(await db.classBooking.count({ where: { scheduled_class_id: ses, booking_status: "confirmed" } })).toBe(0);
      const released = cancelR.ok ? cancelR.value.released.length : -1;
      expect(released).toBe(count(c, "OK"));
      const used = await db.clientMembership.aggregate({ _sum: { sessions_used: true }, where: { id: { in: members.map((m) => m.membershipId) } } });
      expect(used._sum.sessions_used ?? 0).toBe(0);
    }
  });

  it("F9 reactivación simultánea de la misma reserva → 1 OK, 4 ALREADY_BOOKED, un solo consumo", async () => {
    const m = await createMember(db, { modality: "GROUP", sessionsTotal: 5 });
    const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(60) });
    const b = await svc.bookSession(staffBook(ses, m.clientId));
    if (!b.ok) throw new Error(b.code);
    await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, reason: "x", idempotencyKey: key() });
    const c = codes(await Promise.all(Array.from({ length: 5 }, () => svc.bookSession(staffBook(ses, m.clientId)))));
    expect(c).toEqual(["ALREADY_BOOKED", "ALREADY_BOOKED", "ALREADY_BOOKED", "ALREADY_BOOKED", "OK"]);
    const mem = await db.clientMembership.findUniqueOrThrow({ where: { id: m.membershipId } });
    expect(mem.sessions_used).toBe(1);
    expect(await db.classBookingEvent.count({ where: { booking_id: b.value.bookingId, event_type: "REACTIVATED" } })).toBe(1);
  });

  it("F10 asistencia simultánea sobre la misma reserva → una fila, 1 RECORDED + 4 UPDATED", async () => {
    const ses = await createSession(db);
    const m = await createMember(db);
    const b = await svc.bookSession(staffBook(ses, m.clientId));
    if (!b.ok) throw new Error(b.code);
    const statuses = ["attended", "late", "absent", "attended", "late"] as const;
    const rs = await Promise.all(
      statuses.map((status) =>
        svc.recordAttendance({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, status, idempotencyKey: key() })
      )
    );
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(await db.classAttendance.count({ where: { scheduled_class_id: ses, client_id: m.clientId } })).toBe(1);
    expect(await db.classBookingEvent.count({ where: { booking_id: b.value.bookingId, event_type: "ATTENDANCE_RECORDED" } })).toBe(1);
    expect(await db.classBookingEvent.count({ where: { booking_id: b.value.bookingId, event_type: "ATTENDANCE_UPDATED" } })).toBe(4);
  });

  it("F11 asistencia y cancelación simultáneas: o se registra sobre la reserva confirmada o recibe NOT_CONFIRMED", async () => {
    for (let round = 0; round < 6; round++) {
      const ses = await createSession(db);
      const m = await createMember(db);
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      if (!b.ok) throw new Error(b.code);
      const [att, cancel] = await Promise.all([
        svc.recordAttendance({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, status: "attended", idempotencyKey: key() }),
        svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, idempotencyKey: key() }),
      ]);
      expect(cancel.ok).toBe(true);
      expect(att.ok || (!att.ok && att.code === "NOT_CONFIRMED")).toBe(true);
      const rows = await db.classAttendance.count({ where: { booking_id: b.value.bookingId } });
      expect(rows).toBe(att.ok ? 1 : 0);
    }
  });

  it("F12 tenants distintos no se bloquean: la misma key en paralelo en T1 y T2 ejecuta ambas", async () => {
    const k = key();
    const s1 = await createSession(db);
    const m1 = await createMember(db);
    const s2 = await createSession(db, { tenant: "it-tenant-2" });
    const m2 = await createMember(db, { tenant: "it-tenant-2" });
    const [r1, r2] = await Promise.all([
      svc.bookSession({ ...staffBook(s1, m1.clientId), idempotencyKey: k }),
      svc.bookSession({ ...staffBook(s2, m2.clientId), scope: { tenantId: "it-tenant-2", locationId: null }, actor: actor("it-user-sa2", "super_admin"), idempotencyKey: k }),
    ]);
    expect([r1.ok && !r1.replayed, r2.ok && !r2.replayed]).toEqual([true, true]);
  });

  // ── Orden de locks implementado por el servicio ────────────────
  describe("L · orden global de locks (GYM_BOOKING_LOCK_ORDER)", () => {
    it("L1 bookSession: espera en clients ANTES de tocar client_memberships / scheduled_classes", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(70) });
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 3 });
      const holder = it2b.extraClient();
      const probe = it2b.extraClient();
      const h = holdLocks(holder, [`SELECT id FROM clients WHERE id = '${m.clientId}' FOR UPDATE`]);
      await h.acquired;
      const pending = svc.bookSession(staffBook(ses, m.clientId));
      await waitForLockWaiters(it2b.name, 1);
      expect(await lockIsFree(probe, `SELECT id FROM client_memberships WHERE id = '${m.membershipId}' FOR UPDATE`)).toBe(true);
      expect(await lockIsFree(probe, `SELECT id FROM scheduled_classes WHERE id = '${ses}' FOR UPDATE`)).toBe(true);
      h.release();
      await h.done;
      expect((await pending).ok).toBe(true);
    });

    it("L2 bookSession: con el cliente ya tomado, espera en client_memberships y aún no bloqueó la sesión", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(72) });
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 3 });
      const holder = it2b.extraClient();
      const probe = it2b.extraClient();
      const h = holdLocks(holder, [`SELECT id FROM client_memberships WHERE id = '${m.membershipId}' FOR UPDATE`]);
      await h.acquired;
      const pending = svc.bookSession(staffBook(ses, m.clientId));
      await waitForLockWaiters(it2b.name, 1);
      expect(await lockIsFree(probe, `SELECT id FROM clients WHERE id = '${m.clientId}' FOR UPDATE`)).toBe(false);
      expect(await lockIsFree(probe, `SELECT id FROM scheduled_classes WHERE id = '${ses}' FOR UPDATE`)).toBe(true);
      h.release();
      await h.done;
      expect((await pending).ok).toBe(true);
    });

    it("L3 bookSession: con la sesión tomada, ya retiene clients y client_memberships (nunca al revés)", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(74) });
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 3 });
      const holder = it2b.extraClient();
      const probe = it2b.extraClient();
      const h = holdLocks(holder, [`SELECT id FROM scheduled_classes WHERE id = '${ses}' FOR UPDATE`]);
      await h.acquired;
      const pending = svc.bookSession(staffBook(ses, m.clientId));
      await waitForLockWaiters(it2b.name, 1);
      expect(await lockIsFree(probe, `SELECT id FROM clients WHERE id = '${m.clientId}' FOR UPDATE`)).toBe(false);
      expect(await lockIsFree(probe, `SELECT id FROM client_memberships WHERE id = '${m.membershipId}' FOR UPDATE`)).toBe(false);
      h.release();
      await h.done;
      expect((await pending).ok).toBe(true);
    });

    it("L4 la misma orden concurrente espera en el advisory lock (primer elemento del orden)", async () => {
      const ses = await createSession(db);
      const m = await createMember(db);
      const cmd = staffBook(ses, m.clientId);
      const holder = it2b.extraClient();
      const probe = it2b.extraClient();
      const h = holdLocks(holder, [
        `SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('gym_booking_op:${T1}:${cmd.idempotencyKey}', 0))) x`,
      ]);
      await h.acquired;
      const pending = svc.bookSession(cmd);
      await waitForLockWaiters(it2b.name, 1);
      expect(await lockIsFree(probe, `SELECT id FROM clients WHERE id = '${m.clientId}' FOR UPDATE`)).toBe(true);
      h.release();
      await h.done;
      expect((await pending).ok).toBe(true);
    });

    it("L5 cancelSession: bloquea clientes y membresías de las reservas antes que la sesión", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(76) });
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 3 });
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      expect(b.ok).toBe(true);
      const holder = it2b.extraClient();
      const probe = it2b.extraClient();
      const h = holdLocks(holder, [`SELECT id FROM client_memberships WHERE id = '${m.membershipId}' FOR UPDATE`]);
      await h.acquired;
      const pending = svc.cancelSession({ scope: T1_STAFF_SCOPE, actor: SA1, sessionId: ses, reason: "x", idempotencyKey: key() });
      await waitForLockWaiters(it2b.name, 1);
      expect(await lockIsFree(probe, `SELECT id FROM clients WHERE id = '${m.clientId}' FOR UPDATE`)).toBe(false);
      expect(await lockIsFree(probe, `SELECT id FROM scheduled_classes WHERE id = '${ses}' FOR UPDATE`)).toBe(true);
      h.release();
      await h.done;
      const r = await pending;
      expect(r.ok && r.value.released.length).toBe(1);
    });

    it("L6 recordAttendance: clients (KEY SHARE) → sesión → reserva → asistencia, sin membresías", async () => {
      const ses = await createSession(db);
      const m = await createMember(db);
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      if (!b.ok) throw new Error(b.code);
      const holder = it2b.extraClient();
      const probe = it2b.extraClient();
      const h = holdLocks(holder, [`SELECT id FROM class_bookings WHERE id = '${b.value.bookingId}' FOR UPDATE`]);
      await h.acquired;
      const pending = svc.recordAttendance({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, status: "attended", idempotencyKey: key() });
      await waitForLockWaiters(it2b.name, 1);
      expect(await lockIsFree(probe, `SELECT id FROM scheduled_classes WHERE id = '${ses}' FOR UPDATE`)).toBe(false);
      // KEY SHARE: choca con FOR UPDATE (cancelar/reservar del alumno) pero no con NO KEY UPDATE.
      expect(await lockIsFree(probe, `SELECT id FROM clients WHERE id = '${m.clientId}' FOR UPDATE`)).toBe(false);
      expect(await lockIsFree(probe, `SELECT id FROM clients WHERE id = '${m.clientId}' FOR NO KEY UPDATE`)).toBe(true);
      expect(await lockIsFree(probe, `SELECT id FROM client_memberships WHERE id = '${m.membershipId}' FOR UPDATE`)).toBe(true);
      h.release();
      await h.done;
      expect((await pending).ok).toBe(true);
    });
  });
});
