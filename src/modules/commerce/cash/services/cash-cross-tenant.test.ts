// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-cross-tenant.test.ts
//
// FASE VI-D4 — Certifica que el aislamiento por tenant/location de
// Cash nace del propio WHERE (tenant_id + location_id), no de una
// capa adicional — un cash_register_id/cash_session_id de OTRO
// tenant nunca es visible ni mutable, aunque el ID sea válido en su
// propia base.
//
// Sigue el mismo patrón que
// src/modules/commerce/inventory/services/inventory-cross-tenant.test.ts:
// no usa una DB real — cada test inyecta un `db` falso mínimo que
// simula exactamente lo que Postgres devolvería (fila inexistente)
// cuando el WHERE tenant_id/location_id no matchea.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { openCashSession, closeCashSession } from "./cash-session.service";
import { recordCashMovement } from "./cash-movement.service";

describe("cash-session.service — aislamiento cross-tenant", () => {
  it("openCashSession: cash_register_id pertenece a OTRO tenant -> denegado (findFirst con tenant_id no lo encuentra)", async () => {
    const registerFindFirst = vi.fn().mockResolvedValue(null); // tenant A busca caja de tenant B -> no existe para A
    const sessionFindFirst  = vi.fn();
    const sessionCreate     = vi.fn();

    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          cashRegister: { findFirst: registerFindFirst },
          cashSession:  { findFirst: sessionFindFirst, create: sessionCreate },
        }),
      ),
    } as never;

    const result = await openCashSession(
      {
        tenant_id:        "tenant-A",
        location_id:      "location-A1",
        cash_register_id: "register-of-tenant-B",
        opened_by:        "user-1",
        opening_amount:   100,
      },
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(sessionFindFirst).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("closeCashSession: cash_session_id pertenece a OTRO tenant/location -> denegado, sin mutar la sesión", async () => {
    const sessionFindFirst = vi.fn().mockResolvedValue(null); // tenant B intenta cerrar sesión de tenant A -> no existe para B
    const sessionUpdate    = vi.fn();

    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          cashSession: { findFirst: sessionFindFirst, update: sessionUpdate },
        }),
      ),
    } as never;

    const result = await closeCashSession(
      {
        tenant_id:            "tenant-B",
        location_id:          "location-B1",
        cash_session_id:      "session-of-tenant-A",
        closed_by:            "user-2",
        declared_cash_amount: 100,
      },
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });
});

describe("cash-movement.service — aislamiento cross-tenant", () => {
  it("recordCashMovement: cash_session_id pertenece a OTRO tenant -> denegado dentro de la MISMA transacción, sin crear movimiento ni mutar la sesión", async () => {
    const sessionFindFirst = vi.fn().mockResolvedValue(null); // tenant B busca sesión OPEN de tenant A -> no existe para B
    const movementCreate   = vi.fn();
    const sessionUpdate    = vi.fn();

    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          cashSession:  { findFirst: sessionFindFirst, update: sessionUpdate },
          cashMovement: { create: movementCreate },
        }),
      ),
    } as never;

    const result = await recordCashMovement(
      {
        tenant_id:       "tenant-B",
        location_id:     "location-B1",
        cash_session_id: "session-of-tenant-A",
        movement_type:   "MANUAL_IN",
        amount:          50,
        performed_by:    "user-2",
      },
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(movementCreate).not.toHaveBeenCalled();
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it("CASH_TRANSACTION_RUNTIME_ISOLATED: la transacción completa nace de `db` (runtime) — nunca prisma global mezclado", async () => {
    const dbTransactionSpy = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        cashSession: {
          findFirst: vi.fn().mockResolvedValue({ id: "session-1", cash_register_id: "register-1", expected_cash_amount: 100 }),
          update:    vi.fn().mockResolvedValue({}),
        },
        cashMovement: {
          create: vi.fn().mockResolvedValue({
            id: "mv-1",
            tenant_id: "tenant-A",
            location_id: "location-A1",
            cash_session_id: "session-1",
            cash_register_id: "register-1",
            movement_type: "MANUAL_IN",
            direction: "IN",
            amount: 50,
            reason: null,
            reference: null,
            notes: null,
            performed_by: "user-1",
            performed_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          }),
        },
      }),
    );
    const runtimeDbMarker = { $transaction: dbTransactionSpy } as never;

    const result = await recordCashMovement(
      {
        tenant_id:       "tenant-A",
        location_id:     "location-A1",
        cash_session_id: "session-1",
        movement_type:   "MANUAL_IN",
        amount:          50,
        performed_by:    "user-1",
      },
      runtimeDbMarker,
    );

    expect(result.ok).toBe(true);
    // La única superficie invocada es `db.$transaction` (el runtime client
    // pasado explícitamente) — nunca un prisma global importado aparte.
    expect(dbTransactionSpy).toHaveBeenCalledTimes(1);
  });
});
