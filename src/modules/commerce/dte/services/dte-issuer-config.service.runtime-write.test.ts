// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-issuer-config.service.runtime-write.test.ts
//
// FASE VI-E2B — createDteIssuerConfig/updateDteIssuerConfig/
// switchActiveDteEnvironment ahora aceptan un `db` explícito (por
// defecto el prisma singleton global, para no romper callers
// PLATFORM_NATIVE). Certifica que, cuando se pasa un `db` runtime
// explícito, TODAS las queries (incluida la transacción de
// createDteIssuerConfig/switchActiveDteEnvironment) corren sobre ese
// client — nunca sobre el prisma global implícito.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { globalTxSpy, globalFindFirstSpy } = vi.hoisted(() => ({
  globalTxSpy: vi.fn(),
  globalFindFirstSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: globalTxSpy,
    dteIssuerConfig: { findFirst: globalFindFirstSpy, update: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("./dte-production-preflight.service", () => ({
  getDteProductionPreflight: vi.fn(async () => ({ status: "READY", checks: [] })),
}));

import {
  createDteIssuerConfig,
  updateDteIssuerConfig,
  switchActiveDteEnvironment,
} from "./dte-issuer-config.service";

function fakeRuntimeClient() {
  const txCallback = vi.fn();
  const client = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        dteIssuerConfig: {
          findFirst: vi.fn(async () => null),
          count: vi.fn(async () => 1),
          create: vi.fn(async () => ({ id: "cfg-runtime-1" })),
          updateMany: vi.fn(async () => ({ count: 1 })),
          update: vi.fn(async () => ({ id: "cfg-runtime-1" })),
        },
        dteEnvironmentAuditLog: { create: vi.fn(async () => ({})) },
      };
      txCallback(tx);
      return cb(tx);
    }),
    dteIssuerConfig: {
      findFirst: vi.fn(async () => ({ id: "cfg-runtime-1", environment: "TEST", is_active: false })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
    },
  };
  return { client: client as unknown as PrismaClient, txCallback };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dte-issuer-config.service — runtime `db` param (FASE VI-E2B)", () => {
  it("createDteIssuerConfig con `db` runtime -> abre la transacción en el client runtime, nunca en prisma global", async () => {
    const { client, txCallback } = fakeRuntimeClient();

    const result = await createDteIssuerConfig(
      "tenant-1",
      "loc-1",
      "user-1",
      { environment: "TEST", nit: "00000000000000", name: "Emisor" } as never,
      client,
    );

    expect(result.ok).toBe(true);
    expect(txCallback).toHaveBeenCalledTimes(1);
    expect(globalTxSpy).not.toHaveBeenCalled();
  });

  it("createDteIssuerConfig sin `db` -> cae al prisma global (comportamiento PLATFORM_NATIVE sin cambios)", async () => {
    globalTxSpy.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        dteIssuerConfig: {
          findFirst: vi.fn(async () => null),
          count: vi.fn(async () => 0),
          create: vi.fn(async () => ({ id: "cfg-global-1" })),
        },
      }),
    );

    const result = await createDteIssuerConfig(
      "tenant-1",
      "loc-1",
      "user-1",
      { environment: "TEST", nit: "00000000000000", name: "Emisor" } as never,
    );

    expect(result).toEqual({ ok: true, id: "cfg-global-1" });
    expect(globalTxSpy).toHaveBeenCalledTimes(1);
  });

  it("updateDteIssuerConfig con `db` runtime -> lee y escribe sobre el client runtime, nunca prisma global", async () => {
    const { client } = fakeRuntimeClient();

    await updateDteIssuerConfig("cfg-runtime-1", "tenant-1", "loc-1", "user-1", { name: "Nuevo nombre" } as never, client);

    expect((client as unknown as { dteIssuerConfig: { findFirst: ReturnType<typeof vi.fn> } }).dteIssuerConfig.findFirst).toHaveBeenCalled();
    expect(globalFindFirstSpy).not.toHaveBeenCalled();
  });

  it("cross-tenant: updateDteIssuerConfig no encuentra el registro si tenant_id no coincide en el `where` del client runtime", async () => {
    const { client } = fakeRuntimeClient();
    // Simula que runtimeClientA no tiene ningún issuer con ese id+tenant — el where ya filtra tenant_id.
    (client as unknown as { dteIssuerConfig: { findFirst: ReturnType<typeof vi.fn> } }).dteIssuerConfig.findFirst = vi.fn(async () => null);

    const result = await updateDteIssuerConfig("cfg-of-tenant-B", "tenant-A", "loc-1", "user-1", { name: "x" } as never, client);

    expect(result).toMatchObject({ ok: false });
  });

  it("switchActiveDteEnvironment con `db` runtime -> abre la transacción en el client runtime", async () => {
    const { client, txCallback } = fakeRuntimeClient();

    const result = await switchActiveDteEnvironment(
      { tenant_id: "tenant-1", location_id: "loc-1", target_issuer_config_id: "cfg-runtime-1", user_id: "user-1" },
      client,
    );

    expect(result.ok).toBe(true);
    expect(txCallback).toHaveBeenCalledTimes(1);
    expect(globalTxSpy).not.toHaveBeenCalled();
  });
});
