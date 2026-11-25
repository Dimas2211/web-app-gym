// MH20 (IMP20-011) — preflight PRODUCTION: codificación AT del
// establecimiento / punto de venta. Advertencia con MH 1.2, bloqueo con
// MH 2.0 activo. Sin red, base falsa.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../adapters/dte-signer.adapter", () => ({
  MhHttpDteSignerAdapter: class { checkHealth = vi.fn(async () => ({ ok: true })); },
}));

import { getDteProductionPreflight } from "./dte-production-preflight.service";

function db(issuer: Record<string, unknown>) {
  return {
    dteIssuerConfig: {
      findFirst: vi.fn(async ({ where }: { where: { environment: string } }) =>
        where.environment === "PRODUCTION" ? issuer : null),
      count: vi.fn(async () => 1),
    },
    dteCredential: { findFirst: vi.fn(async () => null) },
    dteCorrelative: { findMany: vi.fn(async () => []) },
  } as never;
}

const BASE = {
  id: "iss-prod", nit: "06140000000000", nrc: "123", name: "Emisor", activity_code: "93110", activity_name: "Gimnasios",
  establishment_code: "0001", establishment_type_code: "02", point_of_sale_code: "0001",
  dept_code: "06", municipality_code: "14",
};
const fmt = async (issuer: Record<string, unknown>) =>
  (await getDteProductionPreflight("t", "l", db(issuer))).checks.find((c) => c.code === "MH20_ESTABLISHMENT_FORMAT");

afterEach(() => { delete process.env.DTE_MH20_PROFILE_ENABLED; });

describe("preflight MH20_ESTABLISHMENT_FORMAT", () => {
  it("codificación AT válida → sin chequeo", async () => {
    expect(await fmt({ ...BASE, cod_estable_mh: "M001", cod_punto_venta_mh: "P001" })).toBeUndefined();
  });

  it("codificación no AT con MH 1.2 (interruptor apagado) → advertencia", async () => {
    const c = await fmt({ ...BASE, cod_estable_mh: "0001", cod_punto_venta_mh: "0001", mh_spec_profile: "MH_2_0" });
    expect(c?.status).toBe("warning");
  });

  it("codificación no AT con MH 2.0 activo → bloqueo", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const c = await fmt({ ...BASE, cod_estable_mh: "0001", cod_punto_venta_mh: "0001", mh_spec_profile: "MH_2_0" });
    expect(c?.status).toBe("blocked");
  });
});
