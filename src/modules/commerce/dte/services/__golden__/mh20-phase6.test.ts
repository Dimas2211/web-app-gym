// ─────────────────────────────────────────────────────────────────
// MH20 — Fase 6: eventos fiscales e integraciones externas (puro).
//
// Invalidación v3, Contingencia v4, Evento de Retorno (builder + saldo),
// Operaciones Especiales, política de transmisión MH, Archivo DTE,
// compatibilidad MariaDB e inspección de DTE recibidos.
// Cada JSON 2.0 se valida con AJV contra el schema OFICIAL (copia literal
// en schemas/mh/v2_0). Datos ficticios; nada se firma ni se transmite.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildMhTestScenarioJson } from "../../mh-test-runs/mh-test-scenarios";
import { resolveMhTerritory20 } from "../../utils/dte-territory-projection";
import type { PrismaClient } from "@prisma/client";
import { GOLDEN_CTX, GOLDEN_ISSUER, GOLDEN_NOW, goldenDoc, makeFakeDb } from "./mh20-fixtures";
import { buildInvalidationEventJsonV3, MH20_COD_ESTABLE_RE, MH20_COD_PUNTO_VENTA_RE } from "../build-invalidation-event-json.v3";
import { buildContingencyEventJsonV4 } from "../build-contingency-event-json.v4";
import { buildContingencyEventJson } from "../build-contingency-event-json.service";
import { buildReturnEventJson } from "../build-return-event-json.service";
import { buildSpecialOpsEventJson, type SpecialOpsLine } from "../build-special-ops-event-json.service";
import { buildDteArchiveFile } from "../build-dte-archive-file.service";
import { BlockedMhEventTransmissionAdapter } from "../../adapters/dte-return-transmission.adapter";
import { mhAttemptHistoryFromLogs } from "../mh-retransmission-guard";
import {
  classifyMhTransmissionOutcome,
  decideMhRetransmission,
  isMhTokenCacheTtlCompliant,
  MH_MAX_RETRANSMISSIONS,
  MH_TRANSMISSION_TIMEOUT_MS,
} from "../../spec/mh-transmission-policy";
import { evaluateInvalidationDeadline, isInvalidableDteType, resolveInvalidationEventDate } from "../../spec/dte-invalidation-deadlines";
import { validateMhEventJson } from "../../spec/validate-mh-event-json";
import { dteSpecTransmissionBlockedError } from "../../spec/dte-spec-registry";
import {
  addReturnAmounts,
  proposeProportionalReturnAmounts,
  readReturnOriginLine,
  remainingReturnAmounts,
  returnExcessFields,
  zeroReturnAmounts,
} from "../../utils/dte-return-balance";
import {
  DELIVERY_BLOCKED_CONTRACT,
  destinationAcceptsMh20,
  externalDeliveryCompatForDocument,
  externalDeliveryCompatForInvalidation,
} from "../../utils/external-delivery-mh20-compat";
import { inspectReceivedDteSpec } from "@/modules/commerce/purchases/utils/inspect-received-dte-spec";
import type { ReturnOriginDocument } from "../../types/dte-return-event-json.types";

const V2_DIR = join(__dirname, "..", "..", "schemas", "mh", "v2_0");
function officialErrors(file: string, json: unknown): string[] {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const v = ajv.compile(JSON.parse(readFileSync(join(V2_DIR, file), "utf8")));
  return v(json) ? [] : (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

const STAMP = "2026ABCDEF0123456789ABCDEF0123456789ABCD";
const JWS   = "eyJhbGciOiJSUzUxMiJ9.eyJ4IjoxfQ.c2lnbmF0dXJl";
const UUID  = (n: number) => `B1B2C3D4-E5F6-4234-8678-${String(n).padStart(12, "0")}`;

const ISSUER_INV = {
  nit: "06141234567890", name: "EMISOR DE PRUEBA SA DE CV", legal_name: null,
  establishment_type_code: "02", establishment_code: "M001", cod_estable_mh: "M001",
  point_of_sale_code: "P001", cod_punto_venta_mh: "P001", phone: "22223333",
  email: "facturacion@emisor.test", environment: "TEST",
};
const PERSONA = { nombre: "RESPONSABLE PRUEBA", tipoDocumento: "13", numeroDocumento: "000000000" };

const fakeDb = makeFakeDb({ docs: {}, issuer: {} }).db as unknown as PrismaClient;

/** FE v2 identificado (fixture 2.0 real del builder de onboarding). */
async function feV2(generation: string): Promise<Record<string, any>> {
  const e = await resolveMhTerritory20({ role: "emisor", deptCode: GOLDEN_ISSUER.dept_code, municipalityCode: GOLDEN_ISSUER.municipality_code }, fakeDb);
  if (!e.ok) throw new Error(e.error);
  const built = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", { ...goldenDoc("01", 9), generation_code: generation }, 3, GOLDEN_NOW, {
    profile: "MH_2_0", territories: { emisor: e.territory, receptor: null },
  });
  if (!built.ok) throw new Error(built.error);
  return built.json as Record<string, any>;
}

describe("MH20 Fase 6 — eventos y entregas (puro)", () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(GOLDEN_NOW); });
  afterAll(() => vi.useRealTimers());

  // ── 6A Invalidación v3 ───────────────────────────────────────────
  describe("6A Invalidación v3", () => {
    const base = {
      issuerConfig: ISSUER_INV,
      target: {
        tipoDte: "01", generationCode: UUID(1), receptionStamp: STAMP,
        controlNumber: "DTE-01-M001P001-000000000000009", fecEmi: "2026-11-15",
        receptor: { tipoDocumento: "13", numDocumento: "00000000-0", nombre: "RECEPTOR", correo: "r@x.test", telefono: "22220000" },
      },
      eventGenerationCode: UUID(2),
      invalidationTypeCode: "2" as const,
      reason: "Error en datos del receptor",
      replacementGenerationCode: null,
      responsable: PERSONA, solicita: PERSONA, now: GOLDEN_NOW,
    };

    it("FE 01 → v3 válida contra invalidacion-schema-v3 oficial", () => {
      const r = buildInvalidationEventJsonV3(base);
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (!r.ok) return;
      const j = r.eventJson as Record<string, any>;
      expect(j.identificacion.version).toBe(3);
      expect(j.emisor).not.toHaveProperty("tipoEstablecimiento");
      expect(j.documento).not.toHaveProperty("montoIva");
      expect(officialErrors("invalidacion-schema-v3.json", j)).toEqual([]);
      expect(validateMhEventJson("INV", j).ok).toBe(true);
    });

    it("Retorno 18 → numeroControl null y solo tipoAnulacion 2", () => {
      const t18 = { ...base, target: { ...base.target, tipoDte: "18", controlNumber: null } };
      const ok = buildInvalidationEventJsonV3(t18);
      expect(ok.ok, ok.ok ? "" : ok.error).toBe(true);
      if (ok.ok) {
        expect((ok.eventJson as any).documento.numeroControl).toBeNull();
        expect(officialErrors("invalidacion-schema-v3.json", ok.eventJson)).toEqual([]);
      }
      expect(buildInvalidationEventJsonV3({ ...t18, invalidationTypeCode: "1", replacementGenerationCode: UUID(3) }).ok).toBe(false);
    });

    it("sin códigos MH (MH20-006) → error explícito", () => {
      const r = buildInvalidationEventJsonV3({ ...base, issuerConfig: { ...ISSUER_INV, cod_estable_mh: "0001" } });
      expect(r.ok).toBe(false);
      expect(MH20_COD_ESTABLE_RE.test("M001")).toBe(true);
      expect(MH20_COD_PUNTO_VENTA_RE.test("0001")).toBe(false);
    });

    it("plazos: MH_1_2 no se aplica; 2.0 PRODUCTION fail-closed; TEST con advertencia", () => {
      const p = { environment: "TEST", targetType: "03", stampedAt: GOLDEN_NOW, targetFecEmi: "2026-11-16", now: GOLDEN_NOW };
      expect(evaluateInvalidationDeadline({ ...p, profile: "MH_1_2", environment: "PRODUCTION" })).toEqual({ ok: true, enforced: false, warnings: [] });
      const prod = evaluateInvalidationDeadline({ ...p, profile: "MH_2_0", environment: "PRODUCTION" });
      expect(prod.ok).toBe(false);
      if (!prod.ok) expect(prod.code).toBe("INV_DEADLINE_UNSET");
      const inTime = evaluateInvalidationDeadline({ ...p, profile: "MH_2_0" });
      expect(inTime).toEqual({ ok: true, enforced: false, warnings: [] });
      const late = evaluateInvalidationDeadline({
        ...p, profile: "MH_2_0", stampedAt: new Date(GOLDEN_NOW.getTime() - 3 * 86_400_000), targetFecEmi: "2026-11-13",
      });
      expect(late.ok).toBe(true);
      // Fase 6.1: la advertencia de fecha (INC-006) se sustituyó por la regla
      // del builder; queda la de plazo de transmisión (INC-004).
      if (late.ok) expect(late.warnings.join(" ")).toMatch(/PROVISIONAL[\s\S]*INC-004/);
      if (late.ok) expect(late.warnings.join(" ")).not.toMatch(/INC-006/);
    });

    it("Fase 6.1 fecha del evento: CCF/NC/18 = misma fecha; FE/FEX/FSE ≤ 3 meses (consultas §8)", () => {
      const now = new Date("2026-11-16T15:00:00Z");
      for (const t of ["03", "05", "18", "17"]) {
        expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2026-11-10", now }))
          .toEqual({ ok: true, fecEmi: "2026-11-10", rule: "SAME_AS_TARGET" });
      }
      for (const t of ["01", "11", "14"]) {
        expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2026-09-01", now }))
          .toEqual({ ok: true, fecEmi: "2026-11-16", rule: "WITHIN_3_MONTHS" });
        expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2026-08-15", now }))
          .toMatchObject({ ok: false, code: "INV_EVENT_DATE_OUT_OF_WINDOW" });
        expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2026-11-17", now }))
          .toMatchObject({ ok: false, code: "INV_EVENT_DATE_BEFORE_TARGET" });
      }
      // Builder: CCF generado días antes → fecEmi del evento = fecEmi del CCF.
      const ccf = buildInvalidationEventJsonV3({
        ...base, target: { ...base.target, tipoDte: "03", fecEmi: "2026-11-12", controlNumber: "DTE-03-M001P001-000000000000009" },
      });
      expect(ccf.ok && (ccf.eventJson as any).identificacion.fecEmi).toBe("2026-11-12");
      const fe = buildInvalidationEventJsonV3(base);
      expect(fe.ok && (fe.eventJson as any).identificacion.fecEmi).toBe("2026-11-16");
    });

    // Fase 6.1: cambio de expectativa justificado (Cuadro 6 lista FSEE).
    it("invalidabilidad por tipo: FSE 14 solo con MH_2_0 (Cuadro 6); MH_1_2 sin cambios", () => {
      for (const t of ["01", "03", "05", "11", "14"]) expect(isInvalidableDteType("MH_2_0", t)).toBe(true);
      expect(isInvalidableDteType("MH_1_2", "14")).toBe(false);
    });

    it("FSE 14 → v3 válida con el sujeto excluido como contraparte", () => {
      const r = buildInvalidationEventJsonV3({
        ...base,
        target: {
          ...base.target, tipoDte: "14", controlNumber: "DTE-14-M001P001-000000000000003",
          receptor: { tipoDocumento: "13", numDocumento: "01234567-8", nombre: "SUJETO EXCLUIDO", correo: null, telefono: null },
        },
      });
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (r.ok) {
        expect((r.eventJson as any).documento.tipoDte).toBe("14");
        expect(officialErrors("invalidacion-schema-v3.json", r.eventJson)).toEqual([]);
      }
    });
  });

  // ── 6B Contingencia v4 ───────────────────────────────────────────
  describe("6B Contingencia v4", () => {
    const params = {
      issuerConfig: ISSUER_INV,
      responsable: PERSONA,
      eventGenerationCode: UUID(10),
      contingencyTypeCode: "1" as const,
      reason: null,
      periodStartDate: new Date("2026-11-15T00:00:00Z"), periodStartTime: "08:00:00",
      periodEndDate: new Date("2026-11-15T00:00:00Z"), periodEndTime: "10:00:00",
      items: [{ no_item: 1, generation_code: UUID(11), dte_type_code: "01" }, { no_item: 2, generation_code: UUID(12), dte_type_code: "18" }],
      now: GOLDEN_NOW,
    };

    it("v4 válida contra contingencia-schema-v4 oficial (codPuntoVentaMH, Retorno 18)", () => {
      const r = buildContingencyEventJsonV4(params);
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (!r.ok) return;
      const j = r.eventJson as Record<string, any>;
      expect(j.identificacion.version).toBe(4);
      expect(j.emisor.codPuntoVentaMH).toBe("P001");
      expect(j.emisor).not.toHaveProperty("codPuntoVenta");
      expect(officialErrors("contingencia-schema-v4.json", j)).toEqual([]);
    });

    it("dispatcher: sin perfil → v3 histórica; MH_2_0 → v4", () => {
      const v3 = buildContingencyEventJson({ ...params, items: [params.items[0]] });
      expect(v3.ok && (v3.eventJson as any).identificacion.version).toBe(3);
      const v4 = buildContingencyEventJson({ ...params, profile: "MH_2_0" });
      expect(v4.ok && (v4.eventJson as any).identificacion.version).toBe(4);
    });

    it("transmisión 2.0 bloqueada por registro (INC-005); 1.2 libre", () => {
      expect(dteSpecTransmissionBlockedError("MH_2_0", "CONT")).toMatch(/INC-005/);
      expect(dteSpecTransmissionBlockedError("MH_1_2", "CONT")).toBeNull();
    });
  });

  // ── 6C Evento de Retorno ─────────────────────────────────────────
  describe("6C Evento de Retorno", () => {
    async function origin(n: number): Promise<ReturnOriginDocument> {
      const json = await feV2(UUID(100 + n));
      return { dteDocumentId: `doc-${n}`, dteTypeCode: "01", generationCode: UUID(100 + n), receptionStamp: STAMP, jsonDocument: json };
    }
    const issuer = {
      nit: "06141234567890", name: "EMISOR DE PRUEBA SA DE CV", establishment_code: "M001",
      cod_estable_mh: "M001", point_of_sale_code: "P001", cod_punto_venta_mh: "P001", environment: "TEST",
    };

    it("Retorno total de una línea → válido contra fe-eret-v1 oficial y JSON original intacto", async () => {
      const d = await origin(1);
      const before = JSON.stringify(d.jsonDocument);
      const line = readReturnOriginLine(d.jsonDocument, 1)!;
      expect(line).not.toBeNull();
      const amounts = proposeProportionalReturnAmounts(line, zeroReturnAmounts(), line.quantity);
      const r = buildReturnEventJson({
        issuerConfig: issuer, originType: "01", documents: [d],
        lines: [{ dteDocumentId: d.dteDocumentId, sourceItemNo: 1, amounts }],
        eventGenerationCode: UUID(200), now: GOLDEN_NOW,
      });
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (!r.ok) return;
      expect(officialErrors("fe-eret-v1.json", r.eventJson)).toEqual([]);
      expect(JSON.stringify(d.jsonDocument)).toBe(before);
      expect(r.totalReturned).toBeGreaterThan(0);
    });

    it("excede el saldo elegible → R20-RET-08", async () => {
      const d = await origin(2);
      const line = readReturnOriginLine(d.jsonDocument, 1)!;
      const amounts = { ...proposeProportionalReturnAmounts(line, zeroReturnAmounts(), line.quantity) };
      amounts.quantity = line.quantity + 1;
      const r = buildReturnEventJson({
        issuerConfig: issuer, originType: "01", documents: [d],
        lines: [{ dteDocumentId: d.dteDocumentId, sourceItemNo: 1, amounts }],
        eventGenerationCode: UUID(201), now: GOLDEN_NOW,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("R20-RET-08");
    });

    it("tipo no elegible, sello inválido, código repetido y > 50 documentos", async () => {
      const d = await origin(3);
      const line = readReturnOriginLine(d.jsonDocument, 1)!;
      const lines = [{ dteDocumentId: d.dteDocumentId, sourceItemNo: 1, amounts: line }];
      const common = { issuerConfig: issuer, lines, eventGenerationCode: UUID(202), now: GOLDEN_NOW };
      expect(buildReturnEventJson({ ...common, originType: "03", documents: [{ ...d, dteTypeCode: "03" }] })).toMatchObject({ ok: false, code: "R20-RET-01" });
      expect(buildReturnEventJson({ ...common, originType: "01", documents: [{ ...d, receptionStamp: "corto" }] })).toMatchObject({ ok: false, code: "R20-RET-01" });
      expect(buildReturnEventJson({ ...common, originType: "01", documents: [d, { ...d, dteDocumentId: "x" }] })).toMatchObject({ ok: false, code: "R20-RET-02" });
      const many = Array.from({ length: 51 }, (_, i) => ({ ...d, dteDocumentId: `m${i}`, generationCode: UUID(300 + i) }));
      expect(buildReturnEventJson({ ...common, originType: "01", documents: many })).toMatchObject({ ok: false, code: "R20-RET-02" });
    });

    it("saldo: retornos previos reducen el remanente; nunca negativo", () => {
      const orig = { quantity: 2, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 20, compra: 0, ivaItem: 2.3, noGravado: 0 };
      const first = proposeProportionalReturnAmounts(orig, zeroReturnAmounts(), 1);
      expect(first.ventaGravada).toBe(10);
      const returned = addReturnAmounts(zeroReturnAmounts(), first);
      const rem = remainingReturnAmounts(orig, returned);
      expect(rem.quantity).toBe(1);
      expect(returnExcessFields({ ...first, quantity: 1.5 }, rem)).toEqual([expect.stringMatching(/^quantity /)]);
      expect(remainingReturnAmounts(orig, addReturnAmounts(returned, orig)).ventaGravada).toBe(0);
    });

    it("adaptador productivo: bloqueo explícito MT-GAP-001 sin red", async () => {
      const r = await new BlockedMhEventTransmissionAdapter().transmit({
        environment: "TEST", eventType: "18", signedJws: JWS, version: 1, codigoGeneracion: UUID(1),
      } as never);
      expect(r).toMatchObject({ ok: false, errorCode: "MH_EVENT_ENDPOINT_UNDOCUMENTED", uncertain: false });
      expect(dteSpecTransmissionBlockedError("MH_2_0", "18")).toMatch(/MT-GAP-001/);
    });
  });

  // ── 6D Operaciones Especiales ────────────────────────────────────
  describe("6D Operaciones Especiales", () => {
    const line: SpecialOpsLine = {
      codigoGeneracionRef: null, tipoDocumento: "01", numDocumento: "FVS-0001", fechaEmision: "2026-11-15",
      cantidad: 1, descripcion: "Venta en formulario autorizado", docDel: "0001", docAl: "0010",
      precioUni: 10, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 10, tributos: null,
    };
    const params = {
      issuer: { nit: "06141234567890", name: "EMISOR DE PRUEBA SA DE CV", environment: "TEST" },
      eventGenerationCode: UUID(400), lines: [line], resumenTributos: null, now: GOLDEN_NOW,
    };

    it("sin autorización verificada → OE_NOT_AUTHORIZED", () => {
      expect(buildSpecialOpsEventJson({ ...params, authorization: null })).toMatchObject({ ok: false, code: "OE_NOT_AUTHORIZED" });
      expect(buildSpecialOpsEventJson({ ...params, authorization: { type: "FVS", reference: "R-1", verified: false, validUntil: null } }))
        .toMatchObject({ ok: false, code: "OE_NOT_AUTHORIZED" });
      expect(buildSpecialOpsEventJson({ ...params, authorization: { type: "FVS", reference: "R-1", verified: true, validUntil: "2026-01-01" } }))
        .toMatchObject({ ok: false, code: "OE_NOT_AUTHORIZED" });
    });

    it("con autorización → válido contra fe-eop-v1 oficial; transmisión bloqueada", () => {
      const r = buildSpecialOpsEventJson({ ...params, authorization: { type: "FVS", reference: "R-1", verified: true, validUntil: null } });
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (r.ok) expect(officialErrors("fe-eop-v1.json", r.eventJson)).toEqual([]);
      expect(dteSpecTransmissionBlockedError("MH_2_0", "17")).toMatch(/MT-GAP-001/);
    });
  });

  // ── 6E Política de transmisión MH ────────────────────────────────
  describe("6E Política de transmisión", () => {
    const t = (m: number) => new Date(GOLDEN_NOW.getTime() + m * 60_000);

    it("constantes MT v2 §3.3 y TTL de token", () => {
      expect(MH_TRANSMISSION_TIMEOUT_MS).toBe(8000);
      expect(MH_MAX_RETRANSMISSIONS).toBe(2);
      expect(isMhTokenCacheTtlCompliant(50 * 60_000, "PRODUCTION")).toBe(true);
      expect(isMhTokenCacheTtlCompliant(25 * 3_600_000, "PRODUCTION")).toBe(false);
      expect(isMhTokenCacheTtlCompliant(25 * 3_600_000, "TEST")).toBe(true);
    });

    it("clasifica aceptado, rechazo, no enviado e incierto", () => {
      expect(classifyMhTransmissionOutcome({ ok: true, mhEstado: "PROCESADO" })).toBe("ACCEPTED");
      expect(classifyMhTransmissionOutcome({ ok: true, mhEstado: "RECHAZADO" })).toBe("REJECTED");
      expect(classifyMhTransmissionOutcome({ ok: false, errorCode: "MH_TRANSMISSION_AUTH_FAILED" })).toBe("NOT_SENT");
      expect(classifyMhTransmissionOutcome({ ok: false, errorCode: "MH_TRANSMISSION_TIMEOUT" })).toBe("UNCERTAIN");
      expect(classifyMhTransmissionOutcome({ ok: true, mhEstado: "OTRO" })).toBe("UNCERTAIN");
    });

    it("incierto → consultar antes de reenviar; recibido → conciliar; > 2 → contingencia", () => {
      expect(decideMhRetransmission([]).action).toBe("TRANSMIT");
      const u1 = [{ kind: "SEND" as const, outcome: "UNCERTAIN" as const, at: t(0) }];
      expect(decideMhRetransmission(u1).action).toBe("QUERY_FIRST");
      expect(decideMhRetransmission([...u1, { kind: "QUERY", received: true, at: t(1) }]).action).toBe("RECONCILE");
      const loop = (n: number) => Array.from({ length: n }, (_, i) => [
        { kind: "SEND" as const, outcome: "UNCERTAIN" as const, at: t(i * 2) },
        { kind: "QUERY" as const, received: false, at: t(i * 2 + 1) },
      ]).flat();
      expect(decideMhRetransmission(loop(2)).action).toBe("TRANSMIT");
      // Fase 6.1: límite técnico separado de la contingencia normativa.
      expect(decideMhRetransmission(loop(3))).toMatchObject({ action: "RETRIES_EXHAUSTED", contingencyCandidate: true });
      expect(decideMhRetransmission([{ kind: "SEND", outcome: "ACCEPTED", at: t(0) }]).action).toBe("RECONCILE");
      expect(decideMhRetransmission([{ kind: "SEND", outcome: "REJECTED", at: t(0) }]).action).toBe("TRANSMIT");
    });

    it("historial desde DteTransmissionLog (SEND/QUERY)", () => {
      const h = mhAttemptHistoryFromLogs([
        { operation_type: "SEND", response_body: { errorCode: "MH_TRANSMISSION_TIMEOUT" }, created_at: t(0) },
        { operation_type: "QUERY", response_body: { kind: "QUERY_NOT_FOUND" }, created_at: t(1) },
        { operation_type: "EXTERNAL_DELIVERY", response_body: { ok: true }, created_at: t(2) },
      ]);
      expect(h).toEqual([
        { kind: "SEND", outcome: "UNCERTAIN", at: t(0) },
        { kind: "QUERY", received: false, at: t(1) },
      ]);
    });
  });

  // ── 6F Archivo DTE ───────────────────────────────────────────────
  describe("6F Archivo DTE (receptor)", () => {
    it("FE v2 sellado → <codigoGeneracion>.json con firmaElectronica y selloRecibido; original intacto", async () => {
      const json = await feV2(UUID(500));
      const before = JSON.stringify(json);
      const r = buildDteArchiveFile({ kind: "01", jsonDocument: json, signedJws: JWS, receptionStamp: STAMP, environment: "TEST" });
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (!r.ok) return;
      expect(r.fileName).toBe(`${UUID(500)}.json`);
      expect(JSON.parse(r.content)).toMatchObject({ firmaElectronica: JWS, selloRecibido: STAMP });
      expect(JSON.stringify(json)).toBe(before);
      expect(r.warnings.join(" ")).toMatch(/PRUEBAS/);
    });

    it("FE v1 (MH 1.2) → conserva entrega histórica; sin sello / firma / colisión → error", async () => {
      const v1 = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", goldenDoc("01", 9), 3, GOLDEN_NOW);
      if (!v1.ok) throw new Error(v1.error);
      expect(buildDteArchiveFile({ kind: "01", jsonDocument: v1.json, signedJws: JWS, receptionStamp: STAMP, environment: "TEST" }))
        .toMatchObject({ ok: false, code: "MH12_LEGACY_FORMAT" });
      const json = await feV2(UUID(501));
      expect(buildDteArchiveFile({ kind: "01", jsonDocument: json, signedJws: JWS, receptionStamp: null, environment: "TEST" }))
        .toMatchObject({ ok: false, code: "NOT_STAMPED" });
      expect(buildDteArchiveFile({ kind: "01", jsonDocument: json, signedJws: "x", receptionStamp: STAMP, environment: "TEST" }))
        .toMatchObject({ ok: false, code: "INVALID_SIGNATURE" });
      expect(buildDteArchiveFile({ kind: "01", jsonDocument: { ...json, selloRecibido: "X" }, signedJws: JWS, receptionStamp: STAMP, environment: "TEST" }))
        .toMatchObject({ ok: false, code: "ROOT_COLLISION" });
    });

    it("Invalidación v3 → archivo; v2 → histórico", () => {
      const inv = buildInvalidationEventJsonV3({
        issuerConfig: ISSUER_INV,
        target: { tipoDte: "18", generationCode: UUID(1), receptionStamp: STAMP, controlNumber: null, fecEmi: "2026-11-15", receptor: null },
        eventGenerationCode: UUID(502), invalidationTypeCode: "2", reason: "Retorno erróneo",
        replacementGenerationCode: null, responsable: PERSONA, solicita: PERSONA, now: GOLDEN_NOW,
      });
      if (!inv.ok) throw new Error(inv.error);
      const r = buildDteArchiveFile({ kind: "INV", jsonDocument: inv.eventJson, signedJws: JWS, receptionStamp: STAMP, environment: "TEST" });
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
    });
  });

  // ── 6G MariaDB ───────────────────────────────────────────────────
  describe("6G Compatibilidad MariaDB", () => {
    it("2.0 sin declaración → DELIVERY_BLOCKED_CONTRACT; con declaración → ok; 1.2 nunca bloquea", async () => {
      const v2 = await feV2(UUID(600));
      expect(externalDeliveryCompatForDocument({ kind: "01", jsonDocument: v2, persistedProfile: null, acceptsMh20: undefined }))
        .toMatchObject({ ok: false, code: DELIVERY_BLOCKED_CONTRACT });
      expect(externalDeliveryCompatForDocument({ kind: "01", jsonDocument: v2, persistedProfile: null, acceptsMh20: true }))
        .toEqual({ ok: true, profile: "MH_2_0" });
      const v1 = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", goldenDoc("01", 9), 3, GOLDEN_NOW);
      if (!v1.ok) throw new Error(v1.error);
      expect(externalDeliveryCompatForDocument({ kind: "01", jsonDocument: v1.json, persistedProfile: null, acceptsMh20: false }))
        .toEqual({ ok: true, profile: "MH_1_2" });
      expect(externalDeliveryCompatForInvalidation({ eventJson: { identificacion: { version: 3 } }, acceptsMh20: false }).ok).toBe(false);
      expect(externalDeliveryCompatForInvalidation({ eventJson: { identificacion: { version: 2 } }, acceptsMh20: false }).ok).toBe(true);
    });

    it("capacidad por destino: organización por payload; legado por env", () => {
      expect(destinationAcceptsMh20({ source: "ORGANIZATION", config: {} }, {})).toBe(false);
      expect(destinationAcceptsMh20({ source: "ORGANIZATION", config: { acceptsMh20: true } }, {})).toBe(true);
      expect(destinationAcceptsMh20({ source: "PLATFORM_NATIVE_LEGACY_ENV", config: { acceptsMh20: true } }, {})).toBe(false);
      expect(destinationAcceptsMh20({ source: "PLATFORM_NATIVE_LEGACY_ENV", config: {} }, { EXTERNAL_DTE_MARIADB_ACCEPTS_MH20: "true" })).toBe(true);
    });
  });

  // ── 6H Importación de recibidos ──────────────────────────────────
  describe("6H Importación de DTE recibidos", () => {
    it("FE v2 en formato Archivo DTE → MH_2_0 con advertencias, sin bloquear", async () => {
      const json = { ...(await feV2(UUID(700))), firmaElectronica: JWS, selloRecibido: STAMP };
      const r = inspectReceivedDteSpec(json, STAMP);
      expect(r.profile).toBe("MH_2_0");
      expect(r.archiveFormat).toBe(true);
      expect(r.warnings.some((w) => /firma no se verifica/.test(w))).toBe(true);
    });

    it("FE v1 → MH_1_2; versión desconocida y NC v4 sin subTotal advierten", () => {
      const v1 = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", goldenDoc("01", 9), 3, GOLDEN_NOW);
      if (!v1.ok) throw new Error(v1.error);
      expect(inspectReceivedDteSpec(v1.json as Record<string, unknown>, STAMP)).toMatchObject({ profile: "MH_1_2", warnings: [] });
      expect(inspectReceivedDteSpec({ identificacion: { tipoDte: "01", version: 9 } }, null).profile).toBe("UNKNOWN");
      const nc = inspectReceivedDteSpec({ identificacion: { tipoDte: "05", version: 4 }, resumen: { ivaRete: 1 } }, STAMP);
      expect(nc.profile).toBe("MH_2_0");
      expect(nc.warnings.join(" ")).toMatch(/subTotal/);
      expect(nc.warnings.join(" ")).toMatch(/ivaRete/);
    });
  });
});
