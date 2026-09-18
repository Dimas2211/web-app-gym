// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-correlative.service.baseline-runtime-write.test.ts
//
// FASE VI-E2B — alignDteCorrelativeBaseline ahora acepta un `db`
// explícito (por defecto prisma global). Certifica que:
//   1. Con `db` runtime, la lectura de estado interna
//      (getDteCorrelativeStatus) y el upsert final corren AMBOS sobre
//      ese client — el gap detectado en el inventario (la llamada
//      interna no forwardeaba `db`) queda cerrado.
//   2. Sin `db`, cae al prisma global (PLATFORM_NATIVE sin cambios).
//   3. Runtime A y runtime B están físicamente aislados: nunca se
//      cruzan queries entre clients.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { globalCorrelativeFindUniqueSpy, globalOutgoingFindManySpy, globalCorrelativeUpsertSpy } = vi.hoisted(() => ({
  globalCorrelativeFindUniqueSpy: vi.fn(),
  globalOutgoingFindManySpy: vi.fn(),
  globalCorrelativeUpsertSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteCorrelative: { findUnique: globalCorrelativeFindUniqueSpy, upsert: globalCorrelativeUpsertSpy },
    dteOutgoingDocument: { findMany: globalOutgoingFindManySpy },
  },
}));

import { alignDteCorrelativeBaseline } from "./dte-correlative.service";

function fakeRuntimeClient() {
  const findUnique = vi.fn(async () => null);
  const findMany = vi.fn(async () => []);
  const upsert = vi.fn(async () => ({}));
  const client = {
    dteCorrelative: { findUnique, upsert },
    dteOutgoingDocument: { findMany },
  };
  return { client: client as unknown as PrismaClient, findUnique, findMany, upsert };
}

const BASE_INPUT = {
  tenant_id: "tenant-1",
  location_id: "loc-1",
  issuer_config_id: "issuer-1",
  environment: "PRODUCTION" as const,
  dte_type_code: "01",
  cod_estable_mh: "M001",
  cod_punto_venta_mh: "P001",
  last_used_sequence: 10,
  source: "MIGRATION",
  notes: "Alineación de prueba.",
  user_id: "user-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("alignDteCorrelativeBaseline — runtime `db` param (FASE VI-E2B)", () => {
  it("con `db` runtime -> el chequeo interno de estado Y el upsert final corren en el mismo client, nunca en prisma global", async () => {
    const { client, findUnique, findMany, upsert } = fakeRuntimeClient();

    const result = await alignDteCorrelativeBaseline(BASE_INPUT, client);

    expect(result.ok).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1); // getDteCorrelativeStatus interno, forwardeado
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(globalCorrelativeFindUniqueSpy).not.toHaveBeenCalled();
    expect(globalOutgoingFindManySpy).not.toHaveBeenCalled();
    expect(globalCorrelativeUpsertSpy).not.toHaveBeenCalled();
  });

  it("sin `db` -> cae al prisma global (comportamiento PLATFORM_NATIVE sin cambios)", async () => {
    globalCorrelativeFindUniqueSpy.mockResolvedValue(null);
    globalOutgoingFindManySpy.mockResolvedValue([]);
    globalCorrelativeUpsertSpy.mockResolvedValue({});

    const result = await alignDteCorrelativeBaseline(BASE_INPUT);

    expect(result.ok).toBe(true);
    expect(globalCorrelativeFindUniqueSpy).toHaveBeenCalledTimes(1);
    expect(globalCorrelativeUpsertSpy).toHaveBeenCalledTimes(1);
  });

  it("runtime A y runtime B -> aislamiento físico: el upsert de A nunca toca el client de B", async () => {
    const runtimeA = fakeRuntimeClient();
    const runtimeB = fakeRuntimeClient();

    await alignDteCorrelativeBaseline(BASE_INPUT, runtimeA.client);

    expect(runtimeA.upsert).toHaveBeenCalledTimes(1);
    expect(runtimeB.upsert).not.toHaveBeenCalled();
    expect(runtimeB.findUnique).not.toHaveBeenCalled();
  });
});
