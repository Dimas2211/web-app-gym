// MH20 — Fase 9.0: el puerto runtime REAL pasa el perfil persistido de la
// corrida a los servicios DTE (override explícito). Servicios y router de
// base runtime mockeados: sin BD, sin red, sin firmador.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sign: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
  createInv: vi.fn(async (..._a: unknown[]) => ({ ok: true, invalidationEventId: "ev-1" })),
  generate: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
  prepareNc: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
  createCont: vi.fn(async (..._a: unknown[]) => ({ ok: true, contingencyEventId: "c-1" })),
}));

vi.mock("@/modules/platform/runtime/runtime-database-router", () => ({
  withOrganizationRuntimePrisma: async (_org: string, cb: (c: unknown) => unknown) =>
    cb({ user: { findFirst: async () => null } }),
}));
vi.mock("@/modules/commerce/dte/services/sign-dte-document.service", () => ({ signDteDocument: h.sign }));
vi.mock("@/modules/commerce/dte/services/create-invalidation-event.service", () => ({ createInvalidationEvent: h.createInv }));
vi.mock("@/modules/commerce/dte/services/create-contingency-event.service", () => ({ createContingencyEvent: h.createCont }));
vi.mock("@/modules/commerce/dte/mh-test-runs/mh-test-documents.service", () => ({
  generateMhTestDocumentJson: h.generate,
  prepareMhTestCreditNote: h.prepareNc,
}));

import { createRuntimeMhTestPortForRun } from "./mh-test-run.runtime-port";

const RUN = { id: "run-9", organization_id: "org-1", tenant_id: "t1", location_id: "l1", issuer_config_id: "iss-1", authorized_by: "platform-admin" };
const SNAP = { cod_estable_mh: "M001", cod_punto_venta_mh: "P001", dept_code: "05", municipality_code: "11" };
const RESP = { name: "Responsable Fixture", docTypeCode: "13" as const, documentNumber: "000000000" };

beforeEach(() => { for (const f of Object.values(h)) f.mockClear(); });

describe("Fase 9.0 — puerto runtime con perfil persistido", () => {
  it("MH_2_0: generación, NC, firma e invalidación reciben el override de la corrida; actor CP nulo en runtime", async () => {
    const port = createRuntimeMhTestPortForRun(RUN, { mh_spec_profile: "MH_2_0", issuer_snapshot: SNAP });
    const expected = { source: "MH_TEST_RUN", runId: "run-9", issuerConfigId: "iss-1", profile: "MH_2_0" };

    await port.generate({ key: "run-9:1", scenario: "FE01_IDENTIFICADO", index: 1, receptors: {} });
    expect(h.generate.mock.calls[0][2]).toMatchObject({ profile: "MH_2_0" });

    await port.prepareCreditNote("run-9:3", "run-9:2");
    expect(h.prepareNc.mock.calls[0][2]).toMatchObject({ specProfileOverride: expected });

    await port.sign("doc-1");
    expect(h.sign.mock.calls[0][0]).toMatchObject({ dteDocumentId: "doc-1", specProfileOverride: expected, userId: null });

    await port.createInvalidation("doc-1", RESP);
    expect(h.createInv.mock.calls[0][0]).toMatchObject({ dteDocumentId: "doc-1", specProfileOverride: expected });
  });

  it("MH_2_0: la contingencia queda bloqueada en el puerto (INC-005)", async () => {
    const port = createRuntimeMhTestPortForRun(RUN, { mh_spec_profile: "MH_2_0", issuer_snapshot: SNAP });
    const r = await port.createContingency(["d"], { first: "2026-11-25 10:00:00", last: "2026-11-25 10:00:00" }, { contingencyTypeCode: "1", reason: null }, RESP);
    expect(r.ok).toBe(false);
    expect(h.createCont).not.toHaveBeenCalled();
  });

  it("sin fila M4 (1.2): sin override y perfil MH_1_2 (comportamiento histórico)", async () => {
    const port = createRuntimeMhTestPortForRun(RUN, null);
    await port.generate({ key: "run-9:1", scenario: "FE01_IDENTIFICADO", index: 1, receptors: {} });
    expect(h.generate.mock.calls[0][2]).toMatchObject({ profile: "MH_1_2" });
    await port.sign("doc-1");
    expect(h.sign.mock.calls[0][0]).toMatchObject({ specProfileOverride: null });
    await port.createInvalidation("doc-1", RESP);
    expect(h.createInv.mock.calls[0][0]).toMatchObject({ specProfileOverride: null });
  });
});
