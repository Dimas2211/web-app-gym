// ─────────────────────────────────────────────────────────────────
// MH20 — Fase 6.1: cierre de pendientes internos.
//
//   - Representación gráfica (modelo + PDF) de FE/CCF/NC/FSE/FEX/INV/18,
//     históricos 1.2 preservados, QR oficial MT v2 §5.
//   - Estado de entrega al receptor (generado / disponible / entregado).
//   - Política de reintentos separada de la contingencia normativa.
//   - Firma y transmisión preparada de la invalidación de Retorno (mocks).
// Sin red, sin bases reales, sin firmador real.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildMhTestScenarioJson } from "../../mh-test-runs/mh-test-scenarios";
import { resolveMhTerritory20 } from "../../utils/dte-territory-projection";
import { GOLDEN_CTX, GOLDEN_ISSUER, GOLDEN_NOW, goldenDoc, makeFakeDb } from "./mh20-fixtures";
import { buildInvalidationEventJsonV3 } from "../build-invalidation-event-json.v3";
import {
  buildDteGraphicRepresentation,
  buildMhPublicQueryUrl,
  MH_PUBLIC_QUERY_BASE_URL,
} from "../build-dte-graphic-representation.service";
import { renderDteGraphicRepresentationPdf } from "../render-dte-graphic-representation-pdf";
import { computeReceptorDeliveryStatus } from "../../utils/dte-receptor-delivery-status";
import { assessMhContingencyEligibility, decideMhRetransmission, type MhAttemptRecord } from "../../spec/mh-transmission-policy";
import {
  applyReturnInvalidationTransmissionResult,
  signReturnInvalidationEvent,
  transmitReturnInvalidationEvent,
} from "../return-invalidation-lifecycle.service";

const STAMP = "2026ABCDEF0123456789ABCDEF0123456789ABCD";
const JWS   = "eyJhbGciOiJSUzUxMiJ9.eyJ4IjoxfQ.c2lnbmF0dXJl";
const UUID  = (n: number) => `E1B2C3D4-E5F6-4234-8678-${String(n).padStart(12, "0")}`;
const ISSUER_INV = {
  nit: "06141234567890", name: "EMISOR DE PRUEBA SA DE CV", legal_name: null,
  establishment_type_code: "02", establishment_code: "M001", cod_estable_mh: "M001",
  point_of_sale_code: "P001", cod_punto_venta_mh: "P001", phone: "22223333",
  email: "facturacion@emisor.test", environment: "TEST",
};
const PERSONA = { nombre: "RESPONSABLE PRUEBA", tipoDocumento: "13", numeroDocumento: "000000000" };

let FE_V2: Record<string, any>;
let FE_V1: Record<string, any>;
let INV_V3: Record<string, any>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(GOLDEN_NOW);
  const fake = makeFakeDb({ docs: {}, issuer: {} }).db as unknown as PrismaClient;
  const e = await resolveMhTerritory20({ role: "emisor", deptCode: GOLDEN_ISSUER.dept_code, municipalityCode: GOLDEN_ISSUER.municipality_code }, fake);
  if (!e.ok) throw new Error(e.error);
  const v2 = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", { ...goldenDoc("01", 9), generation_code: UUID(1) }, 3, GOLDEN_NOW, {
    profile: "MH_2_0", territories: { emisor: e.territory, receptor: null },
  });
  if (!v2.ok) throw new Error(v2.error);
  FE_V2 = v2.json as Record<string, any>;
  const v1 = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", { ...goldenDoc("01", 10), generation_code: UUID(2) }, 3, GOLDEN_NOW);
  if (!v1.ok) throw new Error(v1.error);
  FE_V1 = v1.json as Record<string, any>;
  const inv = buildInvalidationEventJsonV3({
    issuerConfig: ISSUER_INV,
    target: { tipoDte: "01", generationCode: UUID(1), receptionStamp: STAMP, controlNumber: FE_V2.identificacion.numeroControl, fecEmi: FE_V2.identificacion.fecEmi, receptor: FE_V2.receptor },
    eventGenerationCode: UUID(3), invalidationTypeCode: "2", reason: "Error en datos", replacementGenerationCode: null,
    responsable: PERSONA, solicita: PERSONA, now: GOLDEN_NOW,
  });
  if (!inv.ok) throw new Error(inv.error);
  INV_V3 = inv.eventJson as Record<string, any>;
});
afterAll(() => vi.useRealTimers());

describe("6.1 Representación gráfica", () => {
  it("FE v2 sellada: Ver.2, campos obligatorios, sello, QR oficial (MT v2 §5)", () => {
    const r = buildDteGraphicRepresentation({ kind: "01", jsonDocument: FE_V2, signedJws: JWS, receptionStamp: STAMP });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    const rep = r.representation;
    expect(rep.versionLabel).toBe("Ver.2");
    expect(rep.title).toBe("FACTURA");
    expect(rep.stampStatus).toBe("SELLADO");
    const ident = Object.fromEntries(rep.sections.find((s) => s.heading === "IDENTIFICACIÓN")!.rows);
    expect(ident["Código de generación"]).toBe(UUID(1));
    expect(ident["Número de control"]).toBe(FE_V2.identificacion.numeroControl);
    expect(ident["Sello de recepción"]).toBe(STAMP);
    expect(rep.qrUrl).toBe(`${MH_PUBLIC_QUERY_BASE_URL}?ambiente=00&codGen=${UUID(1)}&fechaEmi=${FE_V2.identificacion.fecEmi}`);
    // Secciones D sin datos → nombre + guion.
    expect(rep.sections.find((s) => s.heading === "VENTA POR CUENTA DE TERCEROS")!.rows[0][1]).toBe("-");
    expect(rep.tables[0].rows.length).toBe(FE_V2.cuerpoDocumento.length);
    expect(rep.totals.map(([l]) => l)).toContain("Total a pagar");
  });

  it("FE v1 histórica (MH 1.2): se representa tal como fue firmada (Ver.1), sin regenerar", () => {
    const before = JSON.stringify(FE_V1);
    const r = buildDteGraphicRepresentation({ kind: "01", jsonDocument: FE_V1, signedJws: JWS, receptionStamp: STAMP });
    expect(r.ok && r.representation.versionLabel).toBe("Ver.1");
    expect(JSON.stringify(FE_V1)).toBe(before);
  });

  it("sin sello → TRANSITORIO con leyenda; sin firma → NOT_SIGNED; faltan campos → MISSING_FIELDS", () => {
    const t = buildDteGraphicRepresentation({ kind: "01", jsonDocument: FE_V2, signedJws: JWS, receptionStamp: null });
    expect(t.ok && t.representation.stampStatus).toBe("TRANSITORIO");
    expect(t.ok && t.representation.notes.join(" ")).toMatch(/sin Sello de Recepción/);
    expect(buildDteGraphicRepresentation({ kind: "01", jsonDocument: FE_V2, signedJws: null, receptionStamp: STAMP })).toMatchObject({ ok: false, code: "NOT_SIGNED" });
    const broken = { ...FE_V2, identificacion: { ...FE_V2.identificacion, numeroControl: undefined } };
    expect(buildDteGraphicRepresentation({ kind: "01", jsonDocument: broken, signedJws: JWS, receptionStamp: STAMP })).toMatchObject({ ok: false, code: "MISSING_FIELDS" });
    expect(buildDteGraphicRepresentation({ kind: "99", jsonDocument: FE_V2, signedJws: JWS, receptionStamp: STAMP })).toMatchObject({ ok: false, code: "UNSUPPORTED_KIND" });
  });

  it("CCF / NC / FSE / FEX: títulos y contraparte correcta (FSE = sujeto excluido)", () => {
    const base = { ...FE_V2 };
    const ccf = buildDteGraphicRepresentation({ kind: "03", jsonDocument: { ...base, identificacion: { ...base.identificacion, tipoDte: "03" } }, signedJws: JWS, receptionStamp: STAMP });
    expect(ccf.ok && ccf.representation.title).toBe("COMPROBANTE DE CRÉDITO FISCAL");
    const nc = buildDteGraphicRepresentation({
      kind: "05",
      jsonDocument: { ...base, documentoRelacionado: [{ tipoDocumento: "03", tipoGeneracion: 2, numeroDocumento: UUID(9), fechaEmision: "2026-11-10" }] },
      signedJws: JWS, receptionStamp: STAMP,
    });
    expect(nc.ok && nc.representation.sections.find((s) => s.heading === "DOCUMENTOS RELACIONADOS")!.rows[0][1]).toMatch(UUID(9));
    const fse = buildDteGraphicRepresentation({
      kind: "14", jsonDocument: { ...base, receptor: undefined, sujetoExcluido: { nombre: "SUJETO", tipoDocumento: "13", numDocumento: "012345678" } },
      signedJws: JWS, receptionStamp: STAMP,
    });
    expect(fse.ok && fse.representation.sections.map((s) => s.heading)).toContain("SUJETO EXCLUIDO");
    const fex = buildDteGraphicRepresentation({ kind: "11", jsonDocument: base, signedJws: JWS, receptionStamp: STAMP });
    expect(fex.ok && fex.representation.tables[0].columns).toContain("Ventas gravadas");
  });

  it("Invalidación v3 y Retorno: secciones del evento, sin número de control propio", () => {
    const inv = buildDteGraphicRepresentation({ kind: "INV", jsonDocument: INV_V3, signedJws: JWS, receptionStamp: STAMP });
    expect(inv.ok, inv.ok ? "" : inv.error).toBe(true);
    if (inv.ok) {
      expect(inv.representation.versionLabel).toBe("Ver.3");
      expect(inv.representation.tables[0].rows[0][1]).toBe(UUID(1));
      expect(inv.representation.sections.map((s) => s.heading)).toContain("INFORMACIÓN RELATIVA AL MOTIVO DE INVALIDACIÓN");
    }
    const ret = buildDteGraphicRepresentation({
      kind: "18",
      jsonDocument: {
        identificacion: { version: 1, ambiente: "00", codigoGeneracion: UUID(4), fecEmi: "2026-11-16", horEmi: "09:00:00", tipoModelo: 1, tipoOperacion: 1 },
        emisor: { nombre: "EMISOR", nit: "06141234567890" }, receptor: { nombre: "R" },
        cuerpoDocumento: [{ numItem: 1, codigoGeneracion: UUID(1), cantidad: 1, descripcion: "x", precioUni: 1, ventaGravada: 1 }],
        resumen: { totalPagar: 1 },
      },
      signedJws: JWS, receptionStamp: null,
    });
    expect(ret.ok && ret.representation.tables[0].columns[1]).toBe("Código de generación del DTE");
  });

  it("PDF: bytes %PDF con QR embebido; el JWS no aparece en el PDF", async () => {
    const r = buildDteGraphicRepresentation({ kind: "01", jsonDocument: FE_V2, signedJws: JWS, receptionStamp: STAMP });
    if (!r.ok) throw new Error(r.error);
    const pdf = await renderDteGraphicRepresentationPdf(r.representation);
    const head = Buffer.from(pdf.slice(0, 5)).toString("latin1");
    expect(head).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(Buffer.from(pdf).toString("latin1")).not.toContain(JWS);
  });

  it("URL de consulta pública codifica ambiente, codGen en mayúsculas y fecha", () => {
    expect(buildMhPublicQueryUrl("01", UUID(5).toLowerCase(), "2026-11-16"))
      .toBe(`${MH_PUBLIC_QUERY_BASE_URL}?ambiente=01&codGen=${UUID(5)}&fechaEmi=2026-11-16`);
  });
});

describe("6.1 Entrega al receptor: generado ≠ disponible ≠ entregado", () => {
  it("sin canal: disponible solo internamente y nunca entregado", () => {
    const s = computeReceptorDeliveryStatus({ archiveOk: true, representationOk: true });
    expect(s).toMatchObject({ archiveGenerated: true, availableInternally: true, availableToReceptor: false, delivered: false, channel: "INTERNAL_DOWNLOAD" });
    expect(s.pending.join(" ")).toMatch(/Sin canal/);
  });
  it("con evidencia de canal → entregado; MH 1.2 sin archivo → representación sola", () => {
    expect(computeReceptorDeliveryStatus({ archiveOk: true, representationOk: true, receptorChannels: ["EMAIL"], evidence: { channel: "EMAIL", deliveredAt: GOLDEN_NOW, reference: "msg-1" } }))
      .toMatchObject({ delivered: true, channel: "EMAIL" });
    expect(computeReceptorDeliveryStatus({ archiveOk: false, representationOk: true })).toMatchObject({ archiveGenerated: false, availableInternally: true, delivered: false });
    expect(computeReceptorDeliveryStatus({ archiveOk: false, representationOk: false })).toMatchObject({ channel: "NONE", availableInternally: false });
  });
});

describe("6.1 Reintentos técnicos ≠ contingencia normativa", () => {
  const t = (s: number) => new Date(GOLDEN_NOW.getTime() + s * 1000);
  const loop = (n: number): MhAttemptRecord[] => Array.from({ length: n }, (_, i) => [
    { kind: "SEND" as const, outcome: "UNCERTAIN" as const, at: t(i * 2) },
    { kind: "QUERY" as const, received: false, at: t(i * 2 + 1) },
  ]).flat();

  it("agotados los reintentos → RETRIES_EXHAUSTED (candidato), nunca contingencia automática", () => {
    const d = decideMhRetransmission(loop(3));
    expect(d).toMatchObject({ action: "RETRIES_EXHAUSTED", contingencyCandidate: true });
    expect(d.action).not.toBe("CONTINGENCY");
  });
  it("incierto sin consulta → QUERY_FIRST; consulta 'recibido' → RECONCILE (sin duplicar)", () => {
    expect(decideMhRetransmission([{ kind: "SEND", outcome: "UNCERTAIN", at: t(0) }]).action).toBe("QUERY_FIRST");
    expect(decideMhRetransmission([{ kind: "SEND", outcome: "UNCERTAIN", at: t(0) }, { kind: "QUERY", received: true, at: t(1) }]).action).toBe("RECONCILE");
  });
  it("elegibilidad normativa separada: MH_2_0 bloqueada, tipo CAT-005 obligatorio, tipo 1 exige reintentos agotados", () => {
    const exhausted = decideMhRetransmission(loop(3));
    const transmit  = decideMhRetransmission([]);
    expect(assessMhContingencyEligibility({ profile: "MH_2_0", hasReceptionStamp: false, contingencyTypeCode: "1", decision: exhausted }))
      .toMatchObject({ eligible: false, code: "CONTINGENCY_MH20_BLOCKED" });
    expect(assessMhContingencyEligibility({ profile: "MH_1_2", hasReceptionStamp: false, contingencyTypeCode: null, decision: exhausted }))
      .toMatchObject({ eligible: false, code: "CONTINGENCY_TYPE_REQUIRED" });
    expect(assessMhContingencyEligibility({ profile: "MH_1_2", hasReceptionStamp: false, contingencyTypeCode: "1", decision: transmit }))
      .toMatchObject({ eligible: false, code: "CONTINGENCY_NOT_RETRY_EXHAUSTED" });
    expect(assessMhContingencyEligibility({ profile: "MH_1_2", hasReceptionStamp: false, contingencyTypeCode: "1", decision: exhausted })).toEqual({ eligible: true });
    expect(assessMhContingencyEligibility({ profile: "MH_1_2", hasReceptionStamp: true, contingencyTypeCode: "1", decision: exhausted }))
      .toMatchObject({ eligible: false, code: "CONTINGENCY_ALREADY_ACCEPTED" });
  });
});

describe("6.1 Invalidación de Retorno: firma y transmisión preparada (mocks)", () => {
  const T = "tenant-a", L = "loc-a";
  let RET_INV_JSON: Record<string, any>;
  beforeAll(() => {
    const r = buildInvalidationEventJsonV3({
      issuerConfig: ISSUER_INV,
      target: { tipoDte: "18", generationCode: UUID(7), receptionStamp: STAMP, controlNumber: null, fecEmi: "2026-11-15", receptor: null },
      eventGenerationCode: UUID(8), invalidationTypeCode: "2", reason: "Retorno con error", replacementGenerationCode: null,
      responsable: PERSONA, solicita: PERSONA, now: GOLDEN_NOW,
    });
    if (!r.ok) throw new Error(r.error);
    RET_INV_JSON = r.eventJson as Record<string, any>;
  });
  const ISSUER_ROW = { ...ISSUER_INV, id: "iss-1", mh_spec_profile: "MH_2_0" };
  function db(row: Record<string, unknown>, retStatus = "ACCEPTED", env = "TEST") {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const update = vi.fn(async () => ({}));
    const d = {
      dteReturnInvalidationEvent: {
        findFirst: vi.fn(async () => ({
          id: "rinv-1", status: "DRAFT", event_json: RET_INV_JSON, signed_jws: null, mh_sello_recibido: null, last_error: null,
          return_event: { id: "ret-1", status: retStatus, issuer_config_id: "iss-1", environment: env, tenant_id: T, location_id: L },
          ...row,
        })),
        updateMany, update,
      },
      dteIssuerConfig: { findFirst: vi.fn(async () => ISSUER_ROW) },
    };
    return { d: d as unknown as PrismaClient, updateMany, update, raw: d };
  }
  const scope = { returnInvalidationEventId: "rinv-1", userId: "u1", tenantId: T, locationId: L };
  const signer = { sign: vi.fn(async () => ({ ok: true as const, signedJws: JWS })) };
  const resolveSigner = vi.fn(async () => ({ ok: true as const, config: {} as never, nit: "06141234567890", passwordPri: "x" }));

  it("firma DRAFT → SIGNED con transición condicionada; scope tenant/location", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const { d, updateMany, raw } = db({});
    const r = await signReturnInvalidationEvent(scope, d, { signer: signer as never, resolveSigner: resolveSigner as never });
    expect(r).toEqual({ ok: true, status: "SIGNED" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT", signed_jws: null }) }));
    expect((raw.dteReturnInvalidationEvent.findFirst.mock.calls as any)[0][0].where).toMatchObject({ tenant_id: T, location_id: L });
    delete process.env.DTE_MH20_PROFILE_ENABLED;
  });

  it("firma bloqueada si el Retorno ya no está ACCEPTED o el JSON no es de tipo 18", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    expect((await signReturnInvalidationEvent(scope, db({}, "SIGNED").d, { signer: signer as never, resolveSigner: resolveSigner as never })).ok).toBe(false);
    const other = { ...RET_INV_JSON, documento: { ...RET_INV_JSON.documento, tipoDte: "01" } };
    expect((await signReturnInvalidationEvent(scope, db({ event_json: other }).d, { signer: signer as never, resolveSigner: resolveSigner as never })).ok).toBe(false);
    delete process.env.DTE_MH20_PROFILE_ENABLED;
  });

  it("transmisión: sin adaptador → NO_ADAPTER (no toca red); PRODUCTION bloqueada; ACCEPTED idempotente", async () => {
    const signed = { status: "SIGNED", signed_jws: JWS };
    expect(await transmitReturnInvalidationEvent(scope, db(signed).d)).toMatchObject({ ok: false, code: "NO_ADAPTER" });
    expect(await transmitReturnInvalidationEvent(scope, db(signed, "ACCEPTED", "PRODUCTION").d, { adapter: { transmit: vi.fn() } }))
      .toMatchObject({ ok: false, code: "PRODUCTION_BLOCKED" });
    const adapter = { transmit: vi.fn() };
    expect(await transmitReturnInvalidationEvent(scope, db({ status: "ACCEPTED" }).d, { adapter })).toEqual({ ok: true, status: "ACCEPTED", idempotent: true });
    expect(adapter.transmit).not.toHaveBeenCalled();
    expect(await transmitReturnInvalidationEvent(scope, db({ status: "SENT", signed_jws: JWS }).d, { adapter }))
      .toMatchObject({ code: "REQUIRES_RECONCILIATION" });
  });

  it("transmisión con adaptador simulado: reserva SIGNED→SENT, PROCESADO → ACCEPTED", async () => {
    const { d, updateMany, update } = db({ status: "SIGNED", signed_jws: JWS });
    const adapter = { transmit: vi.fn(async () => ({ ok: true as const, mhEstado: "PROCESADO", selloRecibido: STAMP, codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [] })) };
    expect(await transmitReturnInvalidationEvent(scope, d, { adapter, now: GOLDEN_NOW })).toEqual({ ok: true, status: "ACCEPTED" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "rinv-1", status: "SIGNED" }, data: expect.objectContaining({ status: "SENT" }) }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED", mh_sello_recibido: STAMP }) }));
    expect((adapter.transmit.mock.calls as any)[0][0]).toMatchObject({ version: 3, codigoGeneracion: UUID(8) });
  });

  it("respuestas: incierta → SENT + conciliación; técnica → SIGNED; RECHAZADO → REJECTED", async () => {
    const update = vi.fn(async () => ({}));
    const d = { dteReturnInvalidationEvent: { update } } as never;
    expect(await applyReturnInvalidationTransmissionResult(d, { id: "x", result: { ok: false, message: "timeout", uncertain: true } })).toMatchObject({ code: "REQUIRES_RECONCILIATION" });
    expect((update.mock.calls as any).at(-1)?.[0]).toMatchObject({ data: { status: "SENT" } });
    expect(await applyReturnInvalidationTransmissionResult(d, { id: "x", result: { ok: false, message: "auth", uncertain: false } })).toMatchObject({ code: "TECHNICAL" });
    expect(await applyReturnInvalidationTransmissionResult(d, { id: "x", result: { ok: true, mhEstado: "RECHAZADO", selloRecibido: null, codigoMsg: "099", descripcionMsg: "x", observaciones: null } }))
      .toEqual({ ok: true, status: "REJECTED" });
  });
});
