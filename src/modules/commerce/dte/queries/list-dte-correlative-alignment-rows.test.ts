// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-correlative-alignment-rows.test.ts
//
// Bug residual post FASE IV-A.3: /dashboard/dte/correlatives mostraba
// "No hay configuración de emisor DTE activa" para TrustMe porque esta
// query usaba el prisma singleton global. Certifica que, con un `db`
// runtime explícito, TODAS las queries (issuerConfigs, branches, y el
// status por fila) usan ese mismo client — nunca el singleton normal.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getDteCorrelativeStatusSpy } = vi.hoisted(() => ({ getDteCorrelativeStatusSpy: vi.fn() }));
vi.mock("../services/dte-correlative.service", () => ({ getDteCorrelativeStatus: getDteCorrelativeStatusSpy }));
vi.mock("../constants/dte-type-codes-for-alignment", () => ({
  DTE_TYPE_CODES_FOR_ALIGNMENT: [{ code: "01", label: "FE" }],
}));

import { listDteCorrelativeAlignmentRows } from "./list-dte-correlative-alignment-rows";

beforeEach(() => {
  getDteCorrelativeStatusSpy.mockReset();
  getDteCorrelativeStatusSpy.mockResolvedValue({
    local_last_sequence: 0, max_used_in_outgoing: 0, baseline_last_used_sequence: null,
    baseline_source: null, baseline_notes: null, baseline_evidence_ref: null, baseline_set_at: null, next_sequence: 1,
  });
});

function fakeRuntimeClient() {
  return {
    dteIssuerConfig: {
      findMany: vi.fn().mockResolvedValue([
        { id: "issuer-1", location_id: "branch-trustme", environment: "PRODUCTION", cod_estable_mh: "M001", cod_punto_venta_mh: "P001" },
      ]),
    },
    branch: {
      findMany: vi.fn().mockResolvedValue([{ id: "branch-trustme", name: "TrustMe HQ" }]),
    },
  };
}

describe("listDteCorrelativeAlignmentRows — db explícita (runtime-aware)", () => {
  it("con db explícita (runtime TrustMe) -> issuerConfigs, branches y getDteCorrelativeStatus usan ese client, nunca el prisma global", async () => {
    const runtimeClient = fakeRuntimeClient();

    const rows = await listDteCorrelativeAlignmentRows("tenant-trustme", runtimeClient as never);

    expect(runtimeClient.dteIssuerConfig.findMany).toHaveBeenCalledTimes(1);
    expect(runtimeClient.branch.findMany).toHaveBeenCalledTimes(1);
    expect(getDteCorrelativeStatusSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-trustme", location_id: "branch-trustme" }),
      runtimeClient,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.location_name).toBe("TrustMe HQ"); // nunca "Sucursal Central" ni otra sucursal de otro tenant
  });
});
