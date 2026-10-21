// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — unitarias del servicio sin BD: protocolo de reintento
// acotado, traducción de errores y claves de orden. El comportamiento de
// negocio y la concurrencia se certifican contra PostgreSQL real
// (booking-service.integration.test.ts / booking-service.concurrency.test.ts).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createGymBookingService, GymBookingRejection, mapServiceError, resolveIdempotencyKey } from "./booking-service";
import { GYM_BOOKING_MAX_CONCURRENCY_RETRIES, type BookSessionCommand } from "./booking-contracts";

const cmd: BookSessionCommand = {
  scope: { tenantId: "t1", locationId: null },
  actor: { userId: "u1", role: "super_admin" },
  channel: "STAFF",
  sessionId: "s1",
  clientId: "c1",
  idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
};

function deadlock() {
  return new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock", {
    code: "P2034",
    clientVersion: "6",
  });
}

/** PrismaClient falso: $transaction ejecuta `impl` en vez de abrir una transacción. */
function fakeDb(impl: () => Promise<unknown>) {
  const $transaction = vi.fn(async () => impl());
  return { db: { $transaction } as unknown as PrismaClient, $transaction };
}

describe("createGymBookingService — reintento acotado", () => {
  it("clave inválida → INVALID_IDEMPOTENCY_KEY sin abrir transacción", async () => {
    const { db, $transaction } = fakeDb(async () => ({}));
    const r = await createGymBookingService(db).bookSession({ ...cmd, idempotencyKey: "bad key!" });
    expect(r).toEqual({ ok: false, code: "INVALID_IDEMPOTENCY_KEY" });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("interbloqueo (P2034) se reintenta completo y, si persiste, se rinde tras GYM_BOOKING_MAX_CONCURRENCY_RETRIES", async () => {
    const onRetry = vi.fn();
    const { db, $transaction } = fakeDb(async () => {
      throw deadlock();
    });
    const r = await createGymBookingService(db, { onRetry }).bookSession(cmd);
    expect(r).toEqual({ ok: false, code: "CONCURRENT_UPDATE_RETRY" });
    expect($transaction).toHaveBeenCalledTimes(GYM_BOOKING_MAX_CONCURRENCY_RETRIES + 1);
    expect(onRetry).toHaveBeenCalledTimes(GYM_BOOKING_MAX_CONCURRENCY_RETRIES);
  });

  it("un reintento que luego tiene éxito devuelve el resultado del intento bueno", async () => {
    let n = 0;
    const success = { ok: true, value: { bookingId: "b1" }, operationId: "op1", replayed: false };
    const { db, $transaction } = fakeDb(async () => {
      if (n++ === 0) throw new GymBookingRejection("LOCK_SET_CHANGED_RETRY");
      return success;
    });
    expect(await createGymBookingService(db).bookSession(cmd)).toBe(success);
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it("un rechazo de negocio no se reintenta y conserva su mensaje", async () => {
    const { db, $transaction } = fakeDb(async () => {
      throw new GymBookingRejection("SESSION_FULL", "No hay cupo");
    });
    expect(await createGymBookingService(db).bookSession(cmd)).toEqual({ ok: false, code: "SESSION_FULL", message: "No hay cupo" });
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("un error desconocido se propaga (500), nunca se convierte en éxito ni en código inventado", async () => {
    const { db } = fakeDb(async () => {
      throw new Error("connection reset");
    });
    await expect(createGymBookingService(db).bookSession(cmd)).rejects.toThrow("connection reset");
  });

  it("abre la transacción en READ COMMITTED (regla 6 del contrato)", async () => {
    const { db, $transaction } = fakeDb(async () => ({ ok: true }));
    await createGymBookingService(db).bookSession(cmd);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "ReadCommitted" }));
  });
});

describe("mapServiceError", () => {
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6", meta: { target } });

  it("P2002 por campos (forma real de Prisma en consultas de modelo)", () => {
    expect(mapServiceError(p2002(["tenant_id", "idempotency_key"]))).toBe("IDEMPOTENCY_RACE_RETRY");
    expect(mapServiceError(p2002(["scheduled_class_id", "client_id"]))).toBe("ALREADY_BOOKED");
  });

  it("delega el resto al mapeo común de 2A (triggers, CHECKs y SQLSTATE)", () => {
    expect(mapServiceError(deadlock())).toBe("CONCURRENT_UPDATE_RETRY");
    expect(mapServiceError(new Error('violates check constraint "scheduled_classes_booked_count_capacity_chk"'))).toBe("SESSION_FULL");
    expect(mapServiceError(new Error("GYM_TENANT_MISMATCH: x"))).toBe("TENANT_MISMATCH");
    expect(mapServiceError(new Error("otra cosa"))).toBeNull();
  });
});

describe("resolveIdempotencyKey", () => {
  it("conserva una clave válida del formulario y genera una nueva si falta o es inválida", () => {
    expect(resolveIdempotencyKey(cmd.idempotencyKey)).toBe(cmd.idempotencyKey);
    const fresh = resolveIdempotencyKey(null);
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveIdempotencyKey("x")).not.toBe("x");
  });
});
