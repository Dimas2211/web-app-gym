// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-external-dte-payload.service.test.ts
//
// FSE14-DUAL-SIGNER / cierre FSE 14 — cubre el caso de un DTE
// originado en Purchase (tipoDte 14, purchase_id != null, sale_id ===
// null) para confirmar que el delivery externo no depende de Sale.
// No conecta a MariaDB real — solo prueba buildExternalDtePayload,
// función pura sin I/O.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildExternalDtePayload,
  type DteDocumentForExternalPayload,
} from "./build-external-dte-payload.service";

function baseFse14Doc(overrides: Partial<DteDocumentForExternalPayload> = {}): DteDocumentForExternalPayload {
  return {
    id:              "doc-fse-1",
    tenant_id:       "tenant-1",
    location_id:     "location-1",
    sale_id:         null,
    purchase_id:     "purchase-1",
    dte_type_code:   "14",
    control_number:  "DTE-14-M001P001-000000000020001",
    generation_code: "DC22651E-85B4-43AF-91F0-4F14548331A0",
    environment:     "TEST",
    dte_status:      "ACCEPTED",
    accepted_at:     new Date("2026-08-25T12:11:34Z"),
    json_document:   {
      identificacion: { tipoDte: "14", ambiente: "00" },
      emisor:         { nrc: "123456" },
    },
    signed_jws:      "header.payload.signature",
    reception_stamp: "2026407BF0413AB54B138E5CF2F1DB9A85EBF5WP",
    mh_response:     { estado: "PROCESADO", codigoMsg: "001", descripcionMsg: "RECIBIDO" },
    ...overrides,
  };
}

describe("buildExternalDtePayload — FSE 14 (origen Purchase)", () => {
  it("FSE ACCEPTED + purchase_id + sale_id null → construye payload sin depender de sale_id", () => {
    const result = buildExternalDtePayload(baseFse14Doc());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.codigoEmpresa).toBe("123456");
    expect(result.payload.responseMH.codigoGeneracion).toBe("DC22651E-85B4-43AF-91F0-4F14548331A0");
    expect(result.payload.responseMH.selloRecibido).toBe("2026407BF0413AB54B138E5CF2F1DB9A85EBF5WP");
    expect(result.payload.token).toBe("header.payload.signature");
  });

  it("FSE REJECTED → delivery bloqueado", () => {
    const result = buildExternalDtePayload(baseFse14Doc({ dte_status: "REJECTED", reception_stamp: null }));

    expect(result.ok).toBe(false);
  });

  it("FSE ACCEPTED sin reception_stamp → bloqueado (sello obligatorio)", () => {
    const result = buildExternalDtePayload(baseFse14Doc({ reception_stamp: null }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/recibido fiscalmente/i);
  });

  it("FSE OBSERVED con reception_stamp → elegible igual que ACCEPTED", () => {
    const result = buildExternalDtePayload(baseFse14Doc({ dte_status: "OBSERVED" }));

    expect(result.ok).toBe(true);
  });

  it("tipoDte 14 permitido explícitamente en SUPPORTED_TYPES", () => {
    const result = buildExternalDtePayload(baseFse14Doc());
    expect(result.ok).toBe(true);
  });

  it("json_document con tipoDte distinto de 14 → rechazado por inconsistencia", () => {
    const result = buildExternalDtePayload(
      baseFse14Doc({ json_document: { identificacion: { tipoDte: "01" }, emisor: { nrc: "123456" } } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tipoDte 14/);
  });

  it("no exige sale_id — sale_id null es válido para FSE 14", () => {
    const doc = baseFse14Doc();
    expect(doc.sale_id).toBeNull();
    expect(doc.purchase_id).not.toBeNull();

    const result = buildExternalDtePayload(doc);
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// FEX-PROD-1 — guard FEX 11 de delivery externo por ambiente. Función
// pura: no ejecuta MariaDB.
// ─────────────────────────────────────────────────────────────────

describe("buildExternalDtePayload — FEX 11 TEST/PRODUCTION (FEX-PROD-1)", () => {
  function fexDoc(environment: "TEST" | "PRODUCTION", ambiente = environment === "PRODUCTION" ? "01" : "00") {
    return baseFse14Doc({
      id:             "doc-fex-1",
      sale_id:        "sale-1",
      purchase_id:    null,
      dte_type_code:  "11",
      control_number: "DTE-11-M001P001-000000000000001",
      environment,
      json_document:  { identificacion: { tipoDte: "11", ambiente, version: 3 }, emisor: { nrc: "123456" } },
    });
  }

  beforeEach(() => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
    vi.stubEnv("DTE_FEX11_ENABLED", "");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("FEX PROD sin flag PROD -> bloqueado", () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    const result = buildExternalDtePayload(fexDoc("PRODUCTION"));
    expect(result.ok).toBe(false);
  });

  it("FEX PROD con flag PROD y estado fiscal válido -> construye payload con ambiente 01", () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const result = buildExternalDtePayload(fexDoc("PRODUCTION"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.responseMH.ambiente).toBe("01");
  });

  it("FEX PROD con flag PROD pero sin sello MH -> bloqueado", () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const result = buildExternalDtePayload({ ...fexDoc("PRODUCTION"), reception_stamp: null });
    expect(result.ok).toBe(false);
  });

  it("FEX PROD con JSON ambiente 00 (mezcla) -> bloqueado", () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const result = buildExternalDtePayload(fexDoc("PRODUCTION", "00"));
    expect(result.ok).toBe(false);
  });

  it("FEX TEST con flag TEST -> construye payload; con solo flag PROD -> bloqueado", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    expect(buildExternalDtePayload(fexDoc("TEST")).ok).toBe(true);

    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    expect(buildExternalDtePayload(fexDoc("TEST")).ok).toBe(false);
  });

  it("flags FEX no alteran FSE 14", () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    expect(buildExternalDtePayload(baseFse14Doc()).ok).toBe(true);
  });
});
