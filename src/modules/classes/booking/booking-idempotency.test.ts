// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — booking-idempotency.test.ts
// Idempotencia a nivel de comando: huella estable, replay, conflicto,
// aislamiento por tenant. La demostración contra BD (incluido el reintento
// concurrente con dos conexiones) está en certify-gym-bookings-foundation.pglite.mjs.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { GYM_BOOKING_LOCK_ORDER, type BookSessionCommand } from "./booking-contracts";
import {
  commandFingerprint,
  decideIdempotency,
  idempotencyLockText,
  isValidIdempotencyKey,
  type StoredOperation,
} from "./booking-idempotency";

const base: BookSessionCommand = {
  scope: { tenantId: "t1", locationId: "b1" },
  actor: { userId: "u1", role: "reception" },
  channel: "STAFF",
  sessionId: "s1",
  clientId: "c1",
  idempotencyKey: "order-0001",
  now: new Date("2030-01-01T10:00:00Z"),
};

describe("commandFingerprint", () => {
  it("es sha256 hex de 64 (formato exigido por gym_booking_operations_shape_chk)", () => {
    expect(commandFingerprint("BOOK_SESSION", base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no depende del orden de claves, de idempotencyKey ni de now (un reintento produce la misma huella)", () => {
    const reordered = {
      now: new Date("2031-05-05T00:00:00Z"),
      idempotencyKey: "otra-clave-01",
      clientId: "c1",
      sessionId: "s1",
      channel: "STAFF",
      actor: { role: "reception", userId: "u1" },
      scope: { locationId: "b1", tenantId: "t1" },
    };
    expect(commandFingerprint("BOOK_SESSION", reordered)).toBe(commandFingerprint("BOOK_SESSION", base));
  });

  it("cambia con cualquier dato que altera la orden", () => {
    const fp = commandFingerprint("BOOK_SESSION", base);
    expect(commandFingerprint("BOOK_SESSION", { ...base, sessionId: "s2" })).not.toBe(fp);
    expect(commandFingerprint("BOOK_SESSION", { ...base, actor: { userId: "u2", role: "reception" } })).not.toBe(fp);
    expect(commandFingerprint("BOOK_SESSION", { ...base, scope: { tenantId: "t2", locationId: "b1" } })).not.toBe(fp);
    expect(commandFingerprint("CANCEL_BOOKING", base)).not.toBe(fp);
  });
});

describe("decideIdempotency", () => {
  const fp = commandFingerprint("CANCEL_SESSION", { sessionId: "s1", reason: "x" });
  const stored: StoredOperation = { id: "op-1", command: "CANCEL_SESSION", request_fingerprint: fp, result: { released: ["b1", "b2", "b3"] } };

  it("sin operación previa → EXECUTE", () => {
    expect(decideIdempotency(null, "CANCEL_SESSION", fp)).toEqual({ kind: "EXECUTE" });
  });

  it("misma orden (también tras respuesta perdida) → REPLAY con el resultado guardado y el mismo operationId", () => {
    expect(decideIdempotency(stored, "CANCEL_SESSION", fp)).toEqual({ kind: "REPLAY", operationId: "op-1", result: stored.result });
  });

  it("misma clave con contenido distinto → IDEMPOTENCY_KEY_REUSED", () => {
    const other = commandFingerprint("CANCEL_SESSION", { sessionId: "s1", reason: "otro" });
    expect(decideIdempotency(stored, "CANCEL_SESSION", other)).toEqual({ kind: "CONFLICT", code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("misma clave con otro comando → IDEMPOTENCY_KEY_REUSED", () => {
    expect(decideIdempotency(stored, "RECORD_ATTENDANCE", fp)).toEqual({ kind: "CONFLICT", code: "IDEMPOTENCY_KEY_REUSED" });
  });
});

describe("serialización y claves", () => {
  it("el lock de idempotencia es el primero del orden global", () => {
    expect(GYM_BOOKING_LOCK_ORDER[0]).toBe("idempotency_advisory_lock");
  });

  it("el lock incluye el tenant: dos tenants con la misma clave no se bloquean entre sí", () => {
    expect(idempotencyLockText("t1", "order-0001")).not.toBe(idempotencyLockText("t2", "order-0001"));
  });

  it("valida el rango de la clave (8–200, sin espacios)", () => {
    expect(isValidIdempotencyKey("order-0001")).toBe(true);
    expect(isValidIdempotencyKey("3f2b9c1e-8d4a-4b7e-9a1c-2d3e4f5a6b7c")).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("con espacio 1")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(201))).toBe(false);
    expect(isValidIdempotencyKey(undefined)).toBe(false);
  });
});
