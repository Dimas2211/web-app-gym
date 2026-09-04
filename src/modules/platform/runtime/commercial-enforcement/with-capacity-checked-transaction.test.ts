// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — with-capacity-checked-transaction.test.ts
//
// Bloque B — Serializable + retry acotado: solo P2034 (conflicto de
// serialización) dispara retry, máximo 2 adicionales (3 intentos
// totales); CommercialEnforcementError nunca se reintenta.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { withCapacityCheckedTransaction } from "./with-capacity-checked-transaction";
import { CommercialEnforcementError, type CommercialEnforcementContext } from "./types";

function serializationConflictError() {
  return new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "test" });
}

const legacyCtx: CommercialEnforcementContext = {
  mode: "LEGACY_UNMANAGED",
  tenantId: "tenant-1",
  organizationId: null,
  planId: null,
  verticalId: null,
  effectiveModules: new Map(),
  effectiveEntitlements: new Map(),
};

function fakeRuntimeDb(transactionImpl: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) {
  return {
    $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>, _opts?: unknown) => transactionImpl(cb)),
  } as any;
}

describe("withCapacityCheckedTransaction", () => {
  it("ejecuta el write dentro de isolationLevel Serializable", async () => {
    const db = { $transaction: vi.fn((cb: any, opts: any) => cb({})) } as any;
    let capturedOpts: any;
    db.$transaction = vi.fn((cb: any, opts: any) => {
      capturedOpts = opts;
      return cb({});
    });

    await withCapacityCheckedTransaction(db, "commerce.products.max", 0, legacyCtx, async () => "ok");

    expect(capturedOpts).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });

  it("reintenta ante conflicto de serialización (P2034) hasta maxRetries y luego tiene éxito", async () => {
    let attempts = 0;
    const db = fakeRuntimeDb(async (cb) => {
      attempts++;
      if (attempts < 3) throw serializationConflictError();
      return cb({});
    });

    const result = await withCapacityCheckedTransaction(db, "commerce.products.max", 0, legacyCtx, async () => "done");

    expect(result).toBe("done");
    expect(attempts).toBe(3); // 2 reintentos + 1 éxito = 3 intentos totales (default maxRetries=2)
  });

  it("agota los reintentos y propaga el conflicto de serialización si persiste", async () => {
    let attempts = 0;
    const db = fakeRuntimeDb(async () => {
      attempts++;
      throw serializationConflictError();
    });

    await expect(
      withCapacityCheckedTransaction(db, "commerce.products.max", 0, legacyCtx, async () => "unreachable"),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(attempts).toBe(3); // 1 intento inicial + 2 reintentos, nunca más
  });

  it("assertCapacityAvailable interno (delta>0, MANAGED sin entitlement) bloquea sin reintentar", async () => {
    const managedNoEntitlementCtx: CommercialEnforcementContext = {
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(), // sin fila para commerce.products.max -> ENTITLEMENT_NOT_CONFIGURED
    };
    let attempts = 0;
    const db = fakeRuntimeDb(async (cb) => {
      attempts++;
      return cb({});
    });

    await expect(
      withCapacityCheckedTransaction(db, "commerce.products.max", 1, managedNoEntitlementCtx, async () => {
        throw new Error("write no debería ejecutarse si capacity falla");
      }),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_NOT_CONFIGURED" });
    expect(attempts).toBe(1); // sin reintento: ENTITLEMENT_NOT_CONFIGURED no es un conflicto de serialización
  });

  it("un error de negocio lanzado por `write` no se reintenta", async () => {
    let attempts = 0;
    const db = fakeRuntimeDb(async (cb) => {
      attempts++;
      return cb({});
    });

    await expect(
      withCapacityCheckedTransaction(db, "commerce.products.max", 0, legacyCtx, async () => {
        throw new CommercialEnforcementError("CAPACITY_LIMIT_REACHED", "límite alcanzado");
      }),
    ).rejects.toMatchObject({ code: "CAPACITY_LIMIT_REACHED" });
    expect(attempts).toBe(1);
  });
});
