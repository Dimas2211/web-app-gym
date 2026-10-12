// ─────────────────────────────────────────────────────────────────
// commerce/dte/certification — dte-internal-certification.test.ts
//
// DTE-INTERNAL-CERTIFICATION — certificación interna precomercial.
// Ejercita el flujo productivo REAL (Server Actions DTE → guards →
// services → builders → validador AJV con schemas oficiales MH →
// resolución de emisor/credencial → adapters HTTP de firma/auth/
// transmisión) sobre una base runtime sintética en memoria.
//
// Sustituido ÚNICAMENTE:
//   - sesión/auth (requireAdmin + resolución del tenant efectivo) —
//     frontera de cookies/JWT de Next, no lógica fiscal;
//   - contexto comercial del Control Plane (módulo fiscal.dte);
//   - red: firmador y MH (FakeFiscalNetwork sobre fetch);
//   - Prisma global / Control Plane / MariaDB → TRAMPAS: cualquier
//     acceso registra violación y falla la certificación.
//
// Nunca: MH real, PRODUCTION, base de datos real, secretos reales.
// Ver docs/certification/dte-internal-certification.md.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

// ── Estado compartido con los mocks (hoisted) ─────────────────────

const H = vi.hoisted(() => ({
  session: { current: null as null | { user: Record<string, unknown>; context: Record<string, unknown> } },
  commercial: { fiscalDteEnabled: true },
  globalReference: { client: null as null | Record<string, unknown> },
  globalPrismaViolations: [] as string[],
  globalReferenceReads: [] as string[],
  controlPlaneViolations: [] as string[],
  mariaDbViolations: [] as string[],
  runtimeRouterViolations: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

vi.mock("@/lib/permissions/guards", () => {
  const current = async () => {
    if (!H.session.current) throw new Error("[certification] sin sesión sintética activa");
    return H.session.current.user;
  };
  return { requireAdmin: current, requireSuperAdmin: current, getSessionOrRedirect: current };
});

vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: async () => {
    if (!H.session.current) throw new Error("[certification] sin sesión sintética activa");
    return { context: H.session.current.context, dispose: async () => {} };
  },
  resolveRuntimeFirstLocationId: async () => {
    H.runtimeRouterViolations.push("resolveRuntimeFirstLocationId");
    throw new Error("[certification] resolución runtime no permitida");
  },
  resolveEffectiveApiContext: async () => {
    H.runtimeRouterViolations.push("resolveEffectiveApiContext");
    throw new Error("[certification] resolución runtime no permitida");
  },
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement/resolve-commercial-context", () => ({
  resolveCommercialEnforcementContext: async (tenantId: string) => ({
    mode: "MANAGED",
    tenantId,
    organizationId: `cert-org-${tenantId.slice(0, 8)}`,
    planId: "cert-plan",
    verticalId: null,
    effectiveModules: new Map(
      H.commercial.fiscalDteEnabled
        ? [["fiscal.dte", { module_id: "cert", code: "fiscal.dte", name: "DTE", category: "FISCAL", is_core: false, enabled: true, source: "PLAN" }]]
        : [],
    ),
    effectiveEntitlements: new Map(),
    organizationTimezone: "America/El_Salvador",
  }),
}));

vi.mock("@/lib/db/prisma", () => {
  const trap = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "dteCatalogItem" && H.globalReference.client) {
        // GLOBAL_REFERENCE legítimo (catálogo oficial MH compartido, sin tenant_id).
        H.globalReferenceReads.push(prop);
        return H.globalReference.client[prop];
      }
      H.globalPrismaViolations.push(String(prop));
      throw new Error(`[certification] acceso a Prisma global no permitido: ${String(prop)}`);
    },
  });
  return { prisma: trap, default: trap };
});

vi.mock("@/modules/platform/runtime/control-plane-prisma", () => {
  const trap = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      H.controlPlaneViolations.push(String(prop));
      throw new Error(`[certification] acceso a Control Plane no permitido: ${String(prop)}`);
    },
  });
  return { controlPlanePrisma: trap };
});

vi.mock("@/modules/platform/runtime/runtime-database-router", () => {
  class RuntimeDatabaseRouterError extends Error {}
  const deny = (name: string) => () => {
    H.runtimeRouterViolations.push(name);
    throw new Error(`[certification] Runtime Database Router real no permitido: ${name}`);
  };
  return {
    RuntimeDatabaseRouterError,
    createRuntimePrismaClient: deny("createRuntimePrismaClient"),
    resolveRuntimeDatabaseProfileById: deny("resolveRuntimeDatabaseProfileById"),
  };
});

vi.mock("mysql2/promise", () => {
  const deny = (name: string) => () => {
    H.mariaDbViolations.push(name);
    throw new Error("[certification] conexión MariaDB externa no permitida");
  };
  return { default: { createConnection: deny("createConnection"), createPool: deny("createPool") }, createConnection: deny("createConnection"), createPool: deny("createPool") };
});

// ── Imports productivos (después de los mocks) ────────────────────

import { InMemoryPrismaDb } from "./harness/in-memory-prisma";
import { FakeFiscalNetwork } from "./harness/fake-fiscal-network";
import {
  CERT_NIT_PREFIX, ephemeralEncryptionKey, seedConfirmedPurchase, seedGlobalReferenceCatalog,
  seedReferenceCatalogs, seedSyntheticTenant, type SyntheticTenant,
} from "./harness/certification-fixtures";
import { CERT_ROOT_SUITE, CERT_SECTIONS } from "./harness/certification-catalog";

import { createSaleDraftSchema, addSaleItemSchema } from "@/modules/commerce/sales/schemas/sale.schemas";
import { createSaleDraft, addSaleItemToDraft, confirmSale } from "@/modules/commerce/sales/services/sale.service";
import { createExportSaleSchema } from "@/modules/commerce/sales/export/schemas/export-sale.schemas";
import { createExportSale } from "@/modules/commerce/sales/export/services/export-sale.service";
import { computeIncomeTaxWithholding } from "@/modules/commerce/purchases/services/income-tax-withholding.util";

import { createPendingDteSimpleAction } from "../actions/create-pending-dte-simple.action";
import { generateFeJsonForSaleAction } from "../actions/generate-fe-json-for-sale.action";
import { generateCcfeJsonForSaleAction } from "../actions/generate-ccfe-json-for-sale.action";
import { validateDteJsonSchemaAction } from "../actions/validate-dte-json-schema.action";
import { signDteDocumentAction } from "../actions/sign-dte-document.action";
import { transmitDteDocumentAction } from "../actions/transmit-dte-document.action";
import { createAndTransmitCreditNoteAction } from "../actions/create-and-transmit-credit-note.action";
import { createPendingDteForPurchaseAction } from "../actions/create-pending-dte-for-purchase.action";
import { generateFseJsonForPurchaseAction } from "../actions/generate-fse-json-for-purchase.action";
import { generateFexJsonForSaleAction } from "../actions/generate-fex-json-for-sale.action";
import { createSignTransmitInvalidationAction } from "../actions/create-sign-transmit-invalidation.action";
import { createPendingDteForSale } from "../services/dte-outgoing.service";
import { resolveDteSignerConfigForIssuer, resolveMhAuthCredentials } from "../services/dte-credential.service";
import {
  reserveDteFiscalCapacity, finalizeDteFiscalCapacityConsumed,
} from "../services/dte-fiscal-metering.service";
import { FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR } from "../utils/fex11-v3-rules";
import { RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";

import feSchema from "../schemas/mh/fe-01.schema.json";
import ccfeSchema from "../schemas/mh/ccfe-03.schema.json";
import ncSchema from "../schemas/mh/fe-nc-v3.json";
import fseSchema from "../schemas/mh/fse-14.schema.json";
import fexSchema from "../schemas/mh/fex-11-v3.schema.json";
import anulacionSchema from "../schemas/mh/anulacion-schema-v2.json";

// ── Estado de la corrida ──────────────────────────────────────────

type Json = Record<string, unknown>;

const run = {
  network: new FakeFiscalNetwork(),
  dbA: new InMemoryPrismaDb({ label: "runtime-db-tenant-A (+ intruso C)" }),
  dbB: new InMemoryPrismaDb({ label: "runtime-db-tenant-B" }),
  globalRef: new InMemoryPrismaDb({ label: "global-reference-catalog" }),
  tenantA: null as unknown as SyntheticTenant,
  tenantB: null as unknown as SyntheticTenant,
  tenantC: null as unknown as SyntheticTenant,
  docs: {} as Record<string, string>,
  sales: {} as Record<string, string>,
  consoleCapture: [] as string[],
  actionResults: [] as unknown[],
  savedEnv: {} as Record<string, string | undefined>,
  encryptionKey: "",
};

const SANDBOXED_ENV = /^(DTE_|EXTERNAL_DTE_|DATABASE_URL$|DIRECT_URL$|PLATFORM_ENCRYPTION_KEY$|SHADOW_DATABASE_URL$)/;

function sandboxEnv() {
  for (const key of Object.keys(process.env)) {
    if (SANDBOXED_ENV.test(key)) {
      run.savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }
  run.encryptionKey = ephemeralEncryptionKey();
  process.env.PLATFORM_ENCRYPTION_KEY = run.encryptionKey;
  process.env.DTE_ENVIRONMENT = "TEST";
  process.env.EXTERNAL_DTE_MARIADB_ENABLED = "false";
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) if (SANDBOXED_ENV.test(key)) delete process.env[key];
  for (const [key, value] of Object.entries(run.savedEnv)) if (value !== undefined) process.env[key] = value;
}

function captureConsole() {
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      run.consoleCapture.push(`[${level}] ${args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ")}`);
    });
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ── Sesión sintética ──────────────────────────────────────────────

function actAs(
  db: InMemoryPrismaDb,
  tenant: SyntheticTenant,
  locationKey: string | null,
  mode: "RUNTIME_CLIENT" | "SUPPORT_RUNTIME" = "RUNTIME_CLIENT",
) {
  const locationId = locationKey ? tenant.locations[locationKey].locationId : null;
  H.session.current = {
    user: {
      id: tenant.userId, tenant_id: tenant.tenantId, location_id: locationId, role: "super_admin",
      auth_scope: mode === "RUNTIME_CLIENT" ? "RUNTIME_CLIENT" : "PLATFORM", organization_id: `cert-org-${tenant.key}`,
      email: `cert-admin-${tenant.key.toLowerCase()}@example.com`, name: `Admin CERT-${tenant.key}`,
    },
    context: {
      tenantId: tenant.tenantId, client: db.client, runtime: null, locationId,
      runtimeMode: mode, readOnly: mode === "SUPPORT_RUNTIME", effectiveRole: "super_admin",
    },
  };
}

function record<T>(result: T): T {
  run.actionResults.push(result);
  return result;
}

function expectOk<T extends { ok: boolean }>(result: T, step: string): asserts result is Extract<T, { ok: true }> {
  if (!result.ok) {
    throw new Error(`${step} falló: ${safeStringify(result)}`);
  }
}

function doc(db: InMemoryPrismaDb, id: string): Json {
  const row = db.rows("DteOutgoingDocument").find((r) => r.id === id);
  if (!row) throw new Error(`DteOutgoingDocument ${id} no existe en ${db.label}`);
  return row;
}

function decodeJwsPayload(jws: string): Json {
  return JSON.parse(Buffer.from(jws.split(".")[1], "base64url").toString("utf8"));
}

function ajvValidate(schema: object, data: unknown): string[] {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

const today = () => new Date().toLocaleString("sv-SE", { timeZone: "America/El_Salvador" }).slice(0, 10);

/** Venta real vía commerce/sales (DRAFT → línea → CONFIRMED). */
async function confirmedSale(
  db: InMemoryPrismaDb,
  tenant: SyntheticTenant,
  locationKey: string,
  opts: { dteType: "01" | "03"; customerId: string | null; productId: string; quantity: number; unitPrice: number },
): Promise<string> {
  const t = tenant.tenantId;
  const l = tenant.locations[locationKey].locationId;
  const u = tenant.userId;
  const draftInput = createSaleDraftSchema.parse({
    sale_date: today(), customer_id: opts.customerId, primary_dte_type_code: opts.dteType,
    payment_method_code: "01", condition_operation_code: "1",
  });
  const draft = await createSaleDraft(t, l, u, draftInput, db.client);
  expectOk(draft, "createSaleDraft");
  const item = await addSaleItemToDraft(draft.id, t, l, u, addSaleItemSchema.parse({
    product_id: opts.productId, quantity: opts.quantity, unit_price: opts.unitPrice, discount_amount: 0,
  }), db.client);
  expectOk(item, "addSaleItemToDraft");
  const confirmed = await confirmSale(draft.id, t, l, u, db.client);
  expectOk(confirmed, "confirmSale");
  return draft.id;
}

/** FE/CCFE: venta → DTE pendiente → JSON → schema → firma (todo por Server Actions reales). */
async function saleDteToSigned(
  db: InMemoryPrismaDb, tenant: SyntheticTenant, locationKey: string,
  opts: { dteType: "01" | "03"; customerId: string | null; quantity?: number; unitPrice?: number },
): Promise<{ saleId: string; dteId: string }> {
  const saleId = await confirmedSale(db, tenant, locationKey, {
    dteType: opts.dteType, customerId: opts.customerId, productId: tenant.productServiceId,
    quantity: opts.quantity ?? 1, unitPrice: opts.unitPrice ?? 113,
  });
  actAs(db, tenant, locationKey);
  const pending = record(await createPendingDteSimpleAction(saleId));
  expectOk(pending, "createPendingDteSimpleAction");
  const gen = record(opts.dteType === "01"
    ? await generateFeJsonForSaleAction(pending.dte_document_id)
    : await generateCcfeJsonForSaleAction(pending.dte_document_id));
  expectOk(gen, "generate JSON");
  expectOk(record(await validateDteJsonSchemaAction(pending.dte_document_id)), "validate schema");
  expectOk(record(await signDteDocumentAction(pending.dte_document_id)), "sign");
  return { saleId, dteId: pending.dte_document_id };
}

function controlSequence(controlNumber: unknown): number {
  return Number.parseInt(String(controlNumber).slice(-15), 10);
}

function allSyntheticSecrets(): string[] {
  const out = [run.encryptionKey];
  for (const t of [run.tenantA, run.tenantB, run.tenantC]) {
    for (const loc of Object.values(t.locations)) {
      if (loc.identity) out.push(loc.identity.signerPrivateKeyPassword, loc.identity.mhPassword);
    }
  }
  return out.filter(Boolean);
}

// ── Ciclo de vida ─────────────────────────────────────────────────

beforeAll(async () => {
  sandboxEnv();
  captureConsole();
  run.network.install();

  H.globalReference.client = run.globalRef.client as unknown as Record<string, unknown>;
  await seedGlobalReferenceCatalog(run.globalRef);

  await seedReferenceCatalogs(run.dbA);
  await seedReferenceCatalogs(run.dbB);
  run.tenantA = await seedSyntheticTenant(run.dbA, "A", ["L1", "L2", "L3"], { withoutIssuer: ["L3"] });
  run.tenantC = await seedSyntheticTenant(run.dbA, "C", ["L1"]); // intruso lógico en la MISMA base
  run.tenantB = await seedSyntheticTenant(run.dbB, "B", ["L1"]); // base dedicada separada

  for (const t of [run.tenantA, run.tenantB, run.tenantC]) {
    for (const loc of Object.values(t.locations)) if (loc.identity) run.network.registerIdentity(loc.identity);
  }
});

afterAll(() => {
  run.network.uninstall();
  H.session.current = null;
  const evidenceFile = run.savedEnv["DTE_CERT_EVIDENCE_FILE"];
  if (evidenceFile) {
    const docsSummary = [run.dbA, run.dbB].flatMap((db) =>
      db.rows("DteOutgoingDocument").map((d) => ({
        db: db.label, dte_type_code: d.dte_type_code, environment: d.environment, dte_status: d.dte_status,
        control_number: d.control_number, generation_code: d.generation_code, has_signed_jws: !!d.signed_jws,
        reception_stamp_prefix: typeof d.reception_stamp === "string" ? d.reception_stamp.slice(0, 4) : null,
      })),
    );
    const evidence = {
      databases: [run.dbA, run.dbB, run.globalRef].map((db) => ({ label: db.label, totalOps: db.totalOps(), transactions: db.transactionLog.length })),
      documents: docsSummary,
      invalidationEvents: run.dbA.rows("DteInvalidationEvent").map((e) => ({ status: e.status, has_signed_jws: !!e.signed_jws })),
      documentRelations: run.dbA.rows("DteDocumentRelation").map((r) => ({ relation_type: r.relation_type, amount: String(r.amount) })),
      correlatives: [run.dbA, run.dbB].flatMap((db) => db.rows("DteCorrelative").map((c) => ({
        db: db.label, dte_type_code: c.dte_type_code, environment: c.environment, last_sequence: c.last_sequence,
      }))),
      network: {
        calls: run.network.calls.map((c) => ({ ...c, authorizedAs: c.authorizedAs ? `${String(c.authorizedAs).slice(0, 4)}…` : null })),
        violations: run.network.violations,
      },
      traps: {
        globalPrismaViolations: H.globalPrismaViolations,
        globalReferenceReads: H.globalReferenceReads.length,
        controlPlaneViolations: H.controlPlaneViolations,
        mariaDbViolations: H.mariaDbViolations,
        runtimeRouterViolations: H.runtimeRouterViolations,
      },
    };
    writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), "utf8");
  }
  vi.restoreAllMocks();
  restoreEnv();
});

// ═════════════════════════════════════════════════════════════════

describe(CERT_ROOT_SUITE, () => {
  const S = CERT_SECTIONS;

  // ── FE01 ────────────────────────────────────────────────────────
  describe("FE01", () => {
    it(S.FE01[0], async () => {
      const { tenantA: A, dbA } = run;
      const saleId = await confirmedSale(dbA, A, "L1", {
        dteType: "01", customerId: null, productId: A.productServiceId, quantity: 2, unitPrice: 113,
      });
      run.sales.fe = saleId;
      actAs(dbA, A, "L1");
      const result = record(await createPendingDteSimpleAction(saleId));
      expectOk(result, "createPendingDteSimpleAction");
      run.docs.fe = result.dte_document_id;
      const d = doc(dbA, run.docs.fe);
      expect(d).toMatchObject({
        tenant_id: A.tenantId, location_id: A.locations.L1.locationId, sale_id: saleId,
        issuer_config_id: A.locations.L1.issuerConfigId, dte_type_code: "01", environment: "TEST",
        dte_status: "PENDING_GENERATION", transmission_type_code: "1",
      });
      expect(String(d.generation_code)).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
    });

    it(S.FE01[1], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await generateFeJsonForSaleAction(run.docs.fe)), "generateFeJsonForSaleAction");
      const d = doc(run.dbA, run.docs.fe);
      const json = d.json_document as Json;
      expect(d.dte_status).toBe("GENERATED");
      expect(json.identificacion).toMatchObject({
        version: 1, ambiente: "00", tipoDte: "01", numeroControl: d.control_number, codigoGeneracion: d.generation_code,
        tipoModelo: 1, tipoOperacion: 1, tipoMoneda: "USD",
      });
      expect((json.receptor as Json).nombre).toBe("CONSUMIDOR FINAL");
      expect((json.emisor as Json).nit).toBe(run.tenantA.locations.L1.issuerNit);
      expect((json.cuerpoDocumento as Json[])[0]).toMatchObject({ tipoItem: 2, uniMedida: 59, cantidad: 2 });
    });

    it(S.FE01[2], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await validateDteJsonSchemaAction(run.docs.fe)), "validateDteJsonSchemaAction");
      const d = doc(run.dbA, run.docs.fe);
      expect(d.dte_status).toBe("SCHEMA_VALIDATED");
      expect(ajvValidate(feSchema, d.json_document)).toEqual([]);
    });

    it(S.FE01[3], () => {
      const json = doc(run.dbA, run.docs.fe).json_document as Json;
      const item = (json.cuerpoDocumento as Json[])[0];
      const resumen = json.resumen as Json;
      // 2 × $113.00 con IVA incluido → gravado 226.00, IVA extraído 26.00.
      expect(item).toMatchObject({ precioUni: 113, ventaGravada: 226, ivaItem: 26, ventaExenta: 0, tributos: null });
      expect(resumen).toMatchObject({
        totalGravada: 226, subTotalVentas: 226, subTotal: 226, montoTotalOperacion: 226, totalPagar: 226,
        totalIva: 26, tributos: null, ivaRete1: 0, reteRenta: 0, condicionOperacion: 1,
        totalLetras: "DOSCIENTOS VEINTISEIS 00/100 DOLARES",
      });
      expect((resumen.pagos as Json[])[0]).toMatchObject({ codigo: "01", montoPago: 226 });
      const sale = run.dbA.rows("Sale").find((s) => s.id === run.sales.fe)!;
      expect(Number(sale.total_amount)).toBe(226);
      expect(Number(sale.tax_amount)).toBe(26);
    });

    it(S.FE01[4], async () => {
      const first = doc(run.dbA, run.docs.fe);
      expect(first.control_number).toBe("DTE-01-M001P001-000000000000001");
      // Segunda FE en la misma location → siguiente secuencia del mismo correlativo.
      // Receptor identificado con DUI (se reutiliza luego para invalidación).
      const second = await saleDteToSigned(run.dbA, run.tenantA, "L1", { dteType: "01", customerId: run.tenantA.customerConsumerDuiId });
      run.docs.fe2 = second.dteId;
      expect(doc(run.dbA, second.dteId).control_number).toBe("DTE-01-M001P001-000000000000002");
      const corr = run.dbA.rows("DteCorrelative").filter((c) =>
        c.tenant_id === run.tenantA.tenantId && c.location_id === run.tenantA.locations.L1.locationId && c.dte_type_code === "01");
      expect(corr).toHaveLength(1);
      expect(corr[0]).toMatchObject({ environment: "TEST", last_sequence: 2, issuer_config_id: run.tenantA.locations.L1.issuerConfigId });
    });

    it(S.FE01[5], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const before = run.network.callsOf("SIGNER").length;
      const result = record(await signDteDocumentAction(run.docs.fe));
      expectOk(result, "signDteDocumentAction");
      const d = doc(run.dbA, run.docs.fe);
      expect(d.dte_status).toBe("SIGNED");
      expect(typeof d.signed_jws).toBe("string");
      // Lo firmado es exactamente el JSON persistido del documento esperado.
      expect(decodeJwsPayload(d.signed_jws as string)).toEqual(d.json_document);
      const call = run.network.callsOf("SIGNER")[before];
      expect(call).toMatchObject({
        codigoGeneracion: d.generation_code, numeroControl: d.control_number, tipoDte: "01",
        authorizedAs: run.tenantA.locations.L1.issuerNit, scenario: "OK",
      });
      // El resultado al frontend no expone el JWS; el log de firma tampoco.
      expect(safeStringify(result)).not.toContain(d.signed_jws as string);
      const logs = run.dbA.rows("DteTransmissionLog").filter((l) => l.dte_document_id === run.docs.fe);
      expect(logs.map((l) => l.operation_type)).toEqual(["SIGN"]);
      expect(safeStringify(logs)).not.toContain(d.signed_jws as string);
    });

    it(S.FE01[6], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      run.network.enqueueReception("PROCESADO");
      const result = record(await transmitDteDocumentAction(run.docs.fe));
      expectOk(result, "transmitDteDocumentAction");
      expect(result.dteStatus).toBe("ACCEPTED");
      const d = doc(run.dbA, run.docs.fe);
      expect(d.dte_status).toBe("ACCEPTED");
      expect(String(d.reception_stamp)).toMatch(/^CERT[0-9A-F]{36}$/);
      expect(run.network.callsOf("MH_RECEPTION").at(-1)).toMatchObject({
        ambiente: "00", tipoDte: "01", version: 1, codigoGeneracion: d.generation_code,
        authorizedAs: run.tenantA.locations.L1.issuerNit,
      });
      // TEST nunca consume ledger comercial.
      expect(run.dbA.rows("DteFiscalMeteringReservation")).toHaveLength(0);
    });
  });

  // ── CCFE03 ──────────────────────────────────────────────────────
  describe("CCFE03", () => {
    it(S.CCFE03[0], async () => {
      const { tenantA: A, dbA } = run;
      const saleId = await confirmedSale(dbA, A, "L1", {
        dteType: "03", customerId: A.customerContributorId, productId: A.productServiceId, quantity: 2, unitPrice: 113,
      });
      run.sales.ccfe = saleId;
      actAs(dbA, A, "L1");
      const result = record(await createPendingDteSimpleAction(saleId));
      expectOk(result, "createPendingDteSimpleAction CCFE");
      run.docs.ccfe = result.dte_document_id;
      expect(doc(dbA, run.docs.ccfe)).toMatchObject({ dte_type_code: "03", control_number: "DTE-03-M001P001-000000000000001" });
    });

    it(S.CCFE03[1], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await generateCcfeJsonForSaleAction(run.docs.ccfe)), "generateCcfeJsonForSaleAction");
      const json = doc(run.dbA, run.docs.ccfe).json_document as Json;
      const customer = run.dbA.rows("Customer").find((c) => c.id === run.tenantA.customerContributorId)!;
      expect(json.identificacion).toMatchObject({ version: 3, tipoDte: "03", ambiente: "00" });
      expect(json.receptor).toMatchObject({ nit: customer.nit, nrc: customer.nrc, codActividad: "62010" });
    });

    it(S.CCFE03[2], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await validateDteJsonSchemaAction(run.docs.ccfe)), "validateDteJsonSchemaAction CCFE");
      const d = doc(run.dbA, run.docs.ccfe);
      expect(d.dte_status).toBe("SCHEMA_VALIDATED");
      expect(ajvValidate(ccfeSchema, d.json_document)).toEqual([]);
    });

    it(S.CCFE03[3], () => {
      const json = doc(run.dbA, run.docs.ccfe).json_document as Json;
      const item = (json.cuerpoDocumento as Json[])[0];
      const resumen = json.resumen as Json;
      // CCFE: precio SIN IVA (100.00), IVA separado en tributo "20" (26.00).
      expect(item).toMatchObject({ precioUni: 100, ventaGravada: 200, tributos: ["20"] });
      expect(resumen).toMatchObject({
        totalGravada: 200, subTotalVentas: 200, subTotal: 200, montoTotalOperacion: 226, totalPagar: 226,
        ivaPerci1: 0, ivaRete1: 0, reteRenta: 0,
      });
      expect(resumen.tributos).toEqual([{ codigo: "20", descripcion: expect.any(String), valor: 26 }]);
    });

    it(S.CCFE03[4], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await signDteDocumentAction(run.docs.ccfe)), "sign CCFE");
      const d = doc(run.dbA, run.docs.ccfe);
      expect(d.dte_status).toBe("SIGNED");
      expect(decodeJwsPayload(d.signed_jws as string)).toEqual(d.json_document);
    });

    it(S.CCFE03[5], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      run.network.enqueueReception("PROCESADO");
      const result = record(await transmitDteDocumentAction(run.docs.ccfe));
      expectOk(result, "transmit CCFE");
      expect(result.dteStatus).toBe("ACCEPTED");
      expect(run.network.callsOf("MH_RECEPTION").at(-1)).toMatchObject({ tipoDte: "03", version: 3 });
    });
  });

  // ── NC05 ────────────────────────────────────────────────────────
  describe("NC05", () => {
    const ncInput = (source: string) => ({ sourceDteDocumentId: source, reasonText: "Devolución sintética de certificación interna" });

    it(S.NC05[0], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const ncBefore = run.dbA.rows("DteOutgoingDocument").filter((d) => d.dte_type_code === "05").length;
      // FE01 ACCEPTED no es fuente válida de NC 05.
      const result = record(await createAndTransmitCreditNoteAction(ncInput(run.docs.fe)));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/solo puede emitirse sobre un CCFE tipo "03"/);
      expect(run.dbA.rows("DteOutgoingDocument").filter((d) => d.dte_type_code === "05")).toHaveLength(ncBefore);
    });

    it(S.NC05[1], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      run.network.enqueueReception("PROCESADO");
      const result = record(await createAndTransmitCreditNoteAction(ncInput(run.docs.ccfe)));
      expectOk(result, "createAndTransmitCreditNoteAction");
      expect(result.finalStatus).toBe("ACCEPTED");
      run.docs.nc = result.creditNoteDteId;
      const relations = run.dbA.rows("DteDocumentRelation");
      expect(relations).toHaveLength(1);
      expect(relations[0]).toMatchObject({
        source_dte_document_id: run.docs.nc, related_dte_document_id: run.docs.ccfe, relation_type: "CREDIT_NOTE_OF",
        tenant_id: run.tenantA.tenantId, location_id: run.tenantA.locations.L1.locationId,
      });
      expect(Number(relations[0].amount)).toBe(226);
      const ccfe = doc(run.dbA, run.docs.ccfe);
      const json = doc(run.dbA, run.docs.nc).json_document as Json;
      expect((json.documentoRelacionado as Json[])[0]).toMatchObject({ tipoDocumento: "03", numeroDocumento: ccfe.generation_code });
    });

    it(S.NC05[2], () => {
      const d = doc(run.dbA, run.docs.nc);
      expect(d).toMatchObject({ dte_type_code: "05", control_number: "DTE-05-M001P001-000000000000001", sale_id: run.sales.ccfe });
      expect((d.json_document as Json).identificacion).toMatchObject({ version: 3, tipoDte: "05", ambiente: "00" });
    });

    it(S.NC05[3], () => {
      const d = doc(run.dbA, run.docs.nc);
      expect(d.schema_validated_at).toBeInstanceOf(Date);
      expect(ajvValidate(ncSchema, d.json_document)).toEqual([]);
    });

    it(S.NC05[4], () => {
      const d = doc(run.dbA, run.docs.nc);
      expect(d.dte_status).toBe("ACCEPTED");
      expect(decodeJwsPayload(d.signed_jws as string)).toEqual(d.json_document);
      expect(run.network.callsOf("SIGNER").some((c) => c.tipoDte === "05" && c.codigoGeneracion === d.generation_code)).toBe(true);
      expect(run.network.callsOf("MH_RECEPTION").at(-1)).toMatchObject({ tipoDte: "05", version: 3, codigoGeneracion: d.generation_code });
    });

    it(S.NC05[5], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const before = run.dbA.rows("DteOutgoingDocument").length;
      const result = record(await createAndTransmitCreditNoteAction(ncInput(run.docs.ccfe)));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/Ya existe una Nota de Crédito activa/);
      expect(run.dbA.rows("DteOutgoingDocument")).toHaveLength(before);
      expect(run.dbA.rows("DteDocumentRelation")).toHaveLength(1);
    });
  });

  // ── FSE14 ───────────────────────────────────────────────────────
  describe("FSE14", () => {
    const withholding = (nature: "SERVICES" | "GOODS", total: number) => {
      const r = computeIncomeTaxWithholding({ paymentNature: nature, supplierPersonType: "NATURAL_PERSON", totalCompra: total });
      if (!r.ok) throw new Error(r.error);
      return r.result;
    };

    it(S.FSE14[0], async () => {
      const { tenantA: A, dbA } = run;
      // Compra COV (no FSE) no habilita FSE 14.
      const covId = await seedConfirmedPurchase(dbA, A, "L1", {
        supplierId: A.supplierExcludedNaturalId, productId: A.productServiceId, quantity: 1, unitCost: 100,
        paymentNature: "GOODS", withholding: withholding("GOODS", 100), documentType: "COV",
      });
      actAs(dbA, A, "L1");
      const blocked = record(await createPendingDteForPurchaseAction(covId));
      expect(blocked.ok).toBe(false);
      expect(!blocked.ok && blocked.error).toMatch(/no está marcada para emisión de FSE 14/);

      const services = withholding("SERVICES", 333.33);
      run.sales.fsePurchase = await seedConfirmedPurchase(dbA, A, "L1", {
        supplierId: A.supplierExcludedNaturalId, productId: A.productServiceId, quantity: 1, unitCost: 333.33,
        paymentNature: "SERVICES", withholding: services,
      });
      const result = record(await createPendingDteForPurchaseAction(run.sales.fsePurchase));
      expectOk(result, "createPendingDteForPurchaseAction");
      run.docs.fse = result.dte_document_id;
      expect(doc(dbA, run.docs.fse)).toMatchObject({
        dte_type_code: "14", purchase_id: run.sales.fsePurchase, sale_id: null, environment: "TEST",
        control_number: "DTE-14-M001P001-000000000000001",
      });
    });

    it(S.FSE14[1], async () => {
      const { tenantA: A, dbA } = run;
      const purchaseId = await seedConfirmedPurchase(dbA, A, "L1", {
        supplierId: A.supplierRegisteredId, productId: A.productServiceId, quantity: 1, unitCost: 50,
        paymentNature: "GOODS", withholding: withholding("GOODS", 50),
      });
      actAs(dbA, A, "L1");
      const result = record(await createPendingDteForPurchaseAction(purchaseId));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/no está clasificado como sujeto excluido/);
    });

    it(S.FSE14[4], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const result = record(await generateFseJsonForPurchaseAction(run.docs.fse));
      expectOk(result, "generateFseJsonForPurchaseAction");
      const json = doc(run.dbA, run.docs.fse).json_document as Json;
      expect(json.identificacion).toMatchObject({ version: 1, tipoDte: "14", ambiente: "00" });
      expect(json.sujetoExcluido).toMatchObject({ tipoDocumento: "13" });
    });

    it(S.FSE14[2], () => {
      const json = doc(run.dbA, run.docs.fse).json_document as Json;
      const text = safeStringify(json);
      for (const ivaKey of ["totalIva", "ivaItem", "ivaPerci1", "tributos", "totalGravada"]) expect(text).not.toContain(`"${ivaKey}"`);
      expect((json.cuerpoDocumento as Json[])[0]).toMatchObject({ compra: 333.33, precioUni: 333.33, tipoItem: 2, uniMedida: 59 });
    });

    it(S.FSE14[3], async () => {
      // SERVICES + persona natural → 10% renta; totalPagar = compra − renta.
      const json = doc(run.dbA, run.docs.fse).json_document as Json;
      expect(json.resumen).toMatchObject({ totalCompra: 333.33, ivaRete1: 0, reteRenta: 33.33, totalPagar: 300 });
      // GOODS → sin retención.
      const { tenantA: A, dbA } = run;
      const goodsPurchase = await seedConfirmedPurchase(dbA, A, "L1", {
        supplierId: A.supplierExcludedNaturalId, productId: A.productServiceId, quantity: 2, unitCost: 25,
        paymentNature: "GOODS", withholding: withholding("GOODS", 50),
      });
      actAs(dbA, A, "L1");
      const pending = record(await createPendingDteForPurchaseAction(goodsPurchase));
      expectOk(pending, "FSE sin retención");
      expectOk(record(await generateFseJsonForPurchaseAction(pending.dte_document_id)), "generate FSE sin retención");
      const goods = doc(dbA, pending.dte_document_id);
      expect(goods.dte_status).toBe("SCHEMA_VALIDATED");
      expect((goods.json_document as Json).resumen).toMatchObject({ totalCompra: 50, reteRenta: 0, totalPagar: 50 });
      expect(goods.control_number).toBe("DTE-14-M001P001-000000000000002");
    });

    it(S.FSE14[5], () => {
      const d = doc(run.dbA, run.docs.fse);
      expect(d.dte_status).toBe("SCHEMA_VALIDATED");
      expect(ajvValidate(fseSchema, d.json_document)).toEqual([]);
    });

    it(S.FSE14[6], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await signDteDocumentAction(run.docs.fse)), "sign FSE");
      const d = doc(run.dbA, run.docs.fse);
      expect(d.dte_status).toBe("SIGNED");
      expect(decodeJwsPayload(d.signed_jws as string)).toEqual(d.json_document);
      run.network.enqueueReception("PROCESADO");
      const sent = record(await transmitDteDocumentAction(run.docs.fse));
      expectOk(sent, "transmit FSE");
      expect(sent.dteStatus).toBe("ACCEPTED");
      expect(run.network.callsOf("MH_RECEPTION").at(-1)).toMatchObject({ tipoDte: "14", version: 1 });
    });
  });

  // ── FEX11 (solo servicios) ──────────────────────────────────────
  describe("FEX11 SERVICES", () => {
    const exportInput = (customerId: string, productId: string, itemType: 1 | 2 | 3 = 2) =>
      createExportSaleSchema.parse({
        sale_date: today(), customer_id: customerId, condition_operation_code: "1", payment_method_code: "01",
        items: [{ product_id: productId, quantity: 1, unit_price: 450, discount_amount: 0 }],
        item_type_export: itemType, insurance_amount: 0, freight_amount: 0,
      });
    const exportSale = (customerId: string, productId: string, itemType: 1 | 2 | 3 = 2) => {
      const A = run.tenantA;
      return createExportSale(A.tenantId, A.locations.L1.locationId, A.userId, exportInput(customerId, productId, itemType), run.dbA.client);
    };

    it(S["FEX11 SERVICES"][0], async () => {
      const A = run.tenantA;
      const salesBefore = run.dbA.rows("Sale").length;
      const notForeign = record(await exportSale(A.customerContributorId, A.productExportServiceId));
      expect(notForeign.ok).toBe(false);
      expect(!notForeign.ok && notForeign.error).toMatch(/debe estar marcado como extranjero/);
      expect(run.dbA.rows("Sale")).toHaveLength(salesBefore);

      const ok = record(await exportSale(A.customerForeignId, A.productExportServiceId));
      expectOk(ok, "createExportSale");
      run.sales.fex = ok.sale_id;
      run.docs.fex = ok.dte_document_id;
      expect(doc(run.dbA, run.docs.fex)).toMatchObject({
        dte_type_code: "11", environment: "TEST", dte_status: "PENDING_GENERATION", control_number: "DTE-11-M001P001-000000000000001",
      });
    });

    it(S["FEX11 SERVICES"][4], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const result = record(await generateFexJsonForSaleAction(run.docs.fex));
      expectOk(result, "generateFexJsonForSaleAction");
      expect(result).toMatchObject({ schema_validated: true });
      const json = doc(run.dbA, run.docs.fex).json_document as Json;
      expect(json.identificacion).toMatchObject({ version: 3, tipoDte: "11", ambiente: "00" });
      expect(json.emisor).toMatchObject({ tipoItemExpor: 2, recintoFiscal: null, regimen: null });
    });

    it(S["FEX11 SERVICES"][1], async () => {
      const json = doc(run.dbA, run.docs.fex).json_document as Json;
      expect(json.receptor).toMatchObject({ codPais: "US", nombrePais: "Estados Unidos" });
      const A = run.tenantA;
      const legacy = record(await exportSale(A.customerForeignLegacyCountryId, A.productExportServiceId));
      expect(!legacy.ok && legacy.error).toMatch(/código de la versión anterior/);
      const sv = record(await exportSale(A.customerForeignSvId, A.productExportServiceId));
      expect(!sv.ok && sv.error).toMatch(/no puede ser El Salvador/);
    });

    it(S["FEX11 SERVICES"][2], () => {
      const json = doc(run.dbA, run.docs.fex).json_document as Json;
      // 05 / 0506 / 050611 + "LA LIBERTAD SUR" → CAT-013 municipio 28, distrito 11.
      expect((json.emisor as Json).direccion).toMatchObject({ departamento: "05", municipio: "28", distrito: "11" });
    });

    it(S["FEX11 SERVICES"][3], async () => {
      const json = doc(run.dbA, run.docs.fex).json_document as Json;
      expect((json.cuerpoDocumento as Json[])[0]).toMatchObject({ uniMedida: 59 });
      const A = run.tenantA;
      const blocked = record(await exportSale(A.customerForeignId, A.productNoMhUnitId));
      expect(blocked.ok).toBe(false);
      expect(safeStringify(blocked)).toMatch(/sin código MH \(CAT-014\)/);
    });

    it(S["FEX11 SERVICES"][5], () => {
      const d = doc(run.dbA, run.docs.fex);
      expect(d.dte_status).toBe("SCHEMA_VALIDATED");
      expect(ajvValidate(fexSchema, d.json_document)).toEqual([]);
    });

    it(S["FEX11 SERVICES"][6], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      expectOk(record(await signDteDocumentAction(run.docs.fex)), "sign FEX");
      const d = doc(run.dbA, run.docs.fex);
      expect(d.dte_status).toBe("SIGNED");
      expect(decodeJwsPayload(d.signed_jws as string)).toEqual(d.json_document);
      run.network.enqueueReception("PROCESADO");
      const sent = record(await transmitDteDocumentAction(run.docs.fex));
      expectOk(sent, "transmit FEX");
      expect(sent.dteStatus).toBe("ACCEPTED");
      expect(run.network.callsOf("MH_RECEPTION").at(-1)).toMatchObject({ tipoDte: "11", version: 3 });
    });

    it(S["FEX11 SERVICES"][7], async () => {
      const A = run.tenantA;
      const salesBefore = run.dbA.rows("Sale").length;
      for (const itemType of [1, 3] as const) {
        const result = record(await exportSale(A.customerForeignId, A.productExportServiceId, itemType));
        expect(result.ok).toBe(false);
        expect((result as { errors?: string[] }).errors).toContain(FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR);
      }
      expect(run.dbA.rows("Sale")).toHaveLength(salesBefore);
    });
  });

  // ── INVALIDATION ────────────────────────────────────────────────
  describe("INVALIDATION", () => {
    const persona = { nombre: "RESPONSABLE SINTETICO CERT", tipoDocumento: "36", numeroDocumento: `${CERT_NIT_PREFIX}1234567890` };
    const input = (dteDocumentId: string) => ({
      dteDocumentId, invalidationTypeCode: "2" as const, reason: "Rescisión sintética de certificación interna",
      responsable: persona, solicita: persona,
    });

    it(S.INVALIDATION[0], async () => {
      // Elegible: FE01 ACCEPTED con sello de 40 caracteres.
      const d = doc(run.dbA, run.docs.fe2);
      expect(d.dte_status).toBe("SIGNED");
      actAs(run.dbA, run.tenantA, "L1");
      run.network.enqueueReception("PROCESADO");
      expectOk(record(await transmitDteDocumentAction(run.docs.fe2)), "transmit FE2");
      expect(doc(run.dbA, run.docs.fe2)).toMatchObject({ dte_status: "ACCEPTED" });
      expect(String(doc(run.dbA, run.docs.fe2).reception_stamp)).toHaveLength(40);
    });

    it(S.INVALIDATION[1], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      run.network.enqueueAnular("PROCESADO");
      const result = record(await createSignTransmitInvalidationAction(input(run.docs.fe2)));
      expectOk(result, "createSignTransmitInvalidationAction");
      expect(result).toMatchObject({ eventStatus: "ACCEPTED", dteStatus: "INVALIDATED" });
      run.docs.invalidationEvent = result.invalidationEventId;
      const event = run.dbA.rows("DteInvalidationEvent").find((e) => e.id === result.invalidationEventId)!;
      const fe2 = doc(run.dbA, run.docs.fe2);
      expect(event).toMatchObject({ dte_document_id: run.docs.fe2, invalidation_type_code: "2", status: "ACCEPTED" });
      expect((event.event_json as Json).documento).toMatchObject({
        tipoDte: "01", codigoGeneracion: fe2.generation_code, selloRecibido: fe2.reception_stamp, numeroControl: fe2.control_number,
      });
    });

    it(S.INVALIDATION[2], () => {
      const event = run.dbA.rows("DteInvalidationEvent").find((e) => e.id === run.docs.invalidationEvent)!;
      expect(ajvValidate(anulacionSchema, event.event_json)).toEqual([]);
      expect((event.event_json as Json).identificacion).toMatchObject({ version: 2, ambiente: "00" });
    });

    it(S.INVALIDATION[3], () => {
      const event = run.dbA.rows("DteInvalidationEvent").find((e) => e.id === run.docs.invalidationEvent)!;
      expect(decodeJwsPayload(event.signed_jws as string)).toEqual(event.event_json);
      const anular = run.network.callsOf("MH_ANULAR").at(-1)!;
      expect(anular).toMatchObject({ ambiente: "00", version: 2, tipoDte: "01", authorizedAs: run.tenantA.locations.L1.issuerNit });
    });

    it(S.INVALIDATION[4], () => {
      const fe2 = doc(run.dbA, run.docs.fe2);
      expect(fe2.dte_status).toBe("INVALIDATED");
      expect(fe2.invalidated_at).toBeInstanceOf(Date);
    });

    it(S.INVALIDATION[5], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const eventsBefore = run.dbA.rows("DteInvalidationEvent").length;
      // Ya INVALIDATED → no elegible.
      const again = record(await createSignTransmitInvalidationAction(input(run.docs.fe2)));
      expect(!again.ok && again.error).toMatch(/debe estar en estado ACCEPTED/);
      // FEX 11 no está habilitado para invalidación (regla vigente: 01/03/05).
      const fex = record(await createSignTransmitInvalidationAction(input(run.docs.fex)));
      expect(!fex.ok && fex.error).toMatch(/no está habilitado para invalidación/);
      expect(run.dbA.rows("DteInvalidationEvent")).toHaveLength(eventsBefore);
    });
  });

  // ── MH RESPONSES ────────────────────────────────────────────────
  describe("MH RESPONSES", () => {
    const M = S["MH RESPONSES"];
    const signedFe = async () => (await saleDteToSigned(run.dbA, run.tenantA, "L1", { dteType: "01", customerId: null })).dteId;

    it(M[0], async () => {
      const id = await signedFe();
      run.network.enqueueReception("PROCESADO");
      const r = record(await transmitDteDocumentAction(id));
      expectOk(r, "PROCESADO");
      expect(doc(run.dbA, id)).toMatchObject({ dte_status: "ACCEPTED", observations: null });
    });

    it(M[1], async () => {
      const id = await signedFe();
      run.network.enqueueReception("PROCESADO_EMPTY_OBSERVATIONS");
      const r = record(await transmitDteDocumentAction(id));
      expectOk(r, "PROCESADO observaciones vacías");
      expect(r.dteStatus).toBe("ACCEPTED");
      expect(doc(run.dbA, id).dte_status).toBe("ACCEPTED");
    });

    it(M[2], async () => {
      const id = await signedFe();
      run.network.enqueueReception("PROCESADO_OBSERVED");
      const r = record(await transmitDteDocumentAction(id));
      expectOk(r, "PROCESADO con observaciones");
      expect(r.dteStatus).toBe("OBSERVED");
      expect(doc(run.dbA, id)).toMatchObject({ dte_status: "OBSERVED", observations: ["CERT: observación fiscal simulada."] });
    });

    it(M[3], async () => {
      const id = await signedFe();
      run.network.enqueueReception("RECHAZADO");
      const r = record(await transmitDteDocumentAction(id));
      expectOk(r, "RECHAZADO");
      expect(r.dteStatus).toBe("REJECTED");
      expect(doc(run.dbA, id)).toMatchObject({ dte_status: "REJECTED", rejection_reason: "CERT: rechazo fiscal simulado.", reception_stamp: null });
      run.docs.rejected = id;
    });

    it(M[4], async () => {
      const id = await signedFe();
      const before = doc(run.dbA, id);
      run.network.enqueueReception("TIMEOUT");
      const r = record(await transmitDteDocumentAction(id));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/no respondió en el tiempo configurado/);
      const after = doc(run.dbA, id);
      expect(after).toMatchObject({
        dte_status: "SIGNED", retry_count: (before.retry_count as number) + 1,
        control_number: before.control_number, generation_code: before.generation_code, signed_jws: before.signed_jws,
      });
      run.docs.timeout = id;
    });

    it(M[5], async () => {
      const id = await signedFe();
      run.network.enqueueReception("UNEXPECTED_ESTADO");
      const r = record(await transmitDteDocumentAction(id));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/estado inesperado/);
      expect(doc(run.dbA, id).dte_status).toBe("SIGNED");
      run.docs.unexpected = id;
    });
  });

  // ── GUARDS ──────────────────────────────────────────────────────
  describe("GUARDS", () => {
    const G = S.GUARDS;

    it(G[0], async () => {
      const A = run.tenantA;
      const saleId = await confirmedSale(run.dbA, A, "L3", { dteType: "01", customerId: null, productId: A.productServiceId, quantity: 1, unitPrice: 10 });
      actAs(run.dbA, A, "L3");
      const before = run.dbA.rows("DteOutgoingDocument").length;
      const r = record(await createPendingDteSimpleAction(saleId));
      expect(!r.ok && r.error).toMatch(/No existe una configuración DTE activa/);
      expect(run.dbA.rows("DteOutgoingDocument")).toHaveLength(before);
    });

    it(G[1], async () => {
      const A = run.tenantA;
      const saleId = await confirmedSale(run.dbA, A, "L2", { dteType: "01", customerId: null, productId: A.productServiceId, quantity: 1, unitPrice: 10 });
      // Fila sintética PRODUCTION activa SOLO en memoria para probar el guard — nunca se usa para emitir.
      const prod = await run.dbA.client.dteIssuerConfig.create({
        data: {
          tenant_id: A.tenantId, location_id: A.locations.L2.locationId, environment: "PRODUCTION",
          nit: `${CERT_NIT_PREFIX}9999999999`, name: "EMISOR SINTETICO PRODUCTION (GUARD)", is_active: true,
        },
        select: { id: true },
      });
      actAs(run.dbA, A, "L2");
      const before = run.dbA.rows("DteOutgoingDocument").length;
      const r = record(await createPendingDteSimpleAction(saleId));
      expect(!r.ok && r.error).toMatch(/más de una configuración DTE activa/);
      expect(run.dbA.rows("DteOutgoingDocument")).toHaveLength(before);
      await run.dbA.client.dteIssuerConfig.update({ where: { id: prod.id }, data: { is_active: false } });
      run.sales.l2 = saleId;
    });

    it(G[2], async () => {
      // Sesión en L2 intentando firmar/transmitir/invalidar un documento de L1.
      actAs(run.dbA, run.tenantA, "L2");
      const target = run.docs.timeout; // SIGNED en L1
      const signerBefore = run.network.calls.length;
      for (const r of [
        record(await signDteDocumentAction(target)),
        record(await transmitDteDocumentAction(target)),
        record(await generateFeJsonForSaleAction(target)),
      ]) {
        expect(!r.ok && r.error).toMatch(/no existe o no pertenece a la location activa/);
      }
      expect(run.network.calls.length).toBe(signerBefore);
      expect(doc(run.dbA, target).dte_status).toBe("SIGNED");
    });

    it(G[3], async () => {
      const target = run.docs.timeout;
      const callsBefore = run.network.calls.length;
      // Tenant C comparte la MISMA base física que A.
      actAs(run.dbA, run.tenantC, "L1");
      const c1 = record(await transmitDteDocumentAction(target));
      expect(!c1.ok && c1.error).toMatch(/no existe o no pertenece a la location activa/);
      const nc = record(await createAndTransmitCreditNoteAction({ sourceDteDocumentId: run.docs.ccfe, reasonText: "Intento cruzado" }));
      expect(!nc.ok && nc.error).toMatch(/no existe o no pertenece a la location activa/);
      // Tenant B opera sobre su propia base dedicada: el id de A ni siquiera existe allí.
      actAs(run.dbB, run.tenantB, "L1");
      const b1 = record(await signDteDocumentAction(target));
      expect(!b1.ok && b1.error).toMatch(/no existe o no pertenece a la location activa/);
      expect(run.network.calls.length).toBe(callsBefore);
    });

    it(G[4], async () => {
      const A = run.tenantA;
      actAs(run.dbA, A, "L1", "SUPPORT_RUNTIME");
      const opsBefore = run.dbA.totalOps();
      const callsBefore = run.network.calls.length;
      const results = [
        record(await createPendingDteSimpleAction(run.sales.fe)),
        record(await generateFeJsonForSaleAction(run.docs.fe)),
        record(await validateDteJsonSchemaAction(run.docs.fe)),
        record(await signDteDocumentAction(run.docs.timeout)),
        record(await transmitDteDocumentAction(run.docs.timeout)),
        record(await createAndTransmitCreditNoteAction({ sourceDteDocumentId: run.docs.ccfe, reasonText: "Soporte" })),
        record(await createPendingDteForPurchaseAction(run.sales.fsePurchase)),
        record(await generateFseJsonForPurchaseAction(run.docs.fse)),
        record(await generateFexJsonForSaleAction(run.docs.fex)),
        record(await createSignTransmitInvalidationAction({
          dteDocumentId: run.docs.fe, invalidationTypeCode: "2", reason: "Soporte",
          responsable: { nombre: "X", tipoDocumento: "36", numeroDocumento: "00000000000000" },
          solicita: { nombre: "X", tipoDocumento: "36", numeroDocumento: "00000000000000" },
        })),
      ];
      for (const r of results) expect(r).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
      expect(run.dbA.totalOps()).toBe(opsBefore);
      expect(run.network.calls.length).toBe(callsBefore);
    });

    it(G[5], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      H.commercial.fiscalDteEnabled = false;
      try {
        const opsBefore = run.dbA.totalOps();
        const r = record(await signDteDocumentAction(run.docs.timeout));
        expect(!r.ok && r.error).toMatch(/no está habilitado para tu organización/);
        expect(run.dbA.totalOps()).toBe(opsBefore);
      } finally {
        H.commercial.fiscalDteEnabled = true;
      }
    });

    it(G[6], async () => {
      const A = run.tenantA;
      const saleId = await confirmedSale(run.dbA, A, "L1", { dteType: "03", customerId: A.customerContributorNoNrcId, productId: A.productServiceId, quantity: 1, unitPrice: 10 });
      actAs(run.dbA, A, "L1");
      const before = run.dbA.rows("DteCorrelative").find((c) => c.dte_type_code === "03" && c.location_id === A.locations.L1.locationId)!.last_sequence;
      const r = record(await createPendingDteSimpleAction(saleId));
      expect(!r.ok && r.error).toMatch(/NIT y NRC/);
      // Rollback: el correlativo CCFE no avanzó.
      expect(run.dbA.rows("DteCorrelative").find((c) => c.dte_type_code === "03" && c.location_id === A.locations.L1.locationId)!.last_sequence).toBe(before);
    });

    it(G[7], async () => {
      // CCFE en estado SIGNED (no ACCEPTED) → NC bloqueada; también desde REJECTED.
      const { dteId } = await saleDteToSigned(run.dbA, run.tenantA, "L1", { dteType: "03", customerId: run.tenantA.customerContributorId });
      actAs(run.dbA, run.tenantA, "L1");
      const before = run.dbA.rows("DteOutgoingDocument").length;
      const r = record(await createAndTransmitCreditNoteAction({ sourceDteDocumentId: dteId, reasonText: "NC sobre CCFE no aceptado" }));
      expect(!r.ok && r.error).toMatch(/debe estar en estado ACCEPTED/);
      expect(run.dbA.rows("DteOutgoingDocument")).toHaveLength(before);
      run.docs.ccfeSigned = dteId;
    });

    it(G[8], async () => {
      const A = run.tenantA;
      const before = run.dbA.rows("Sale").length;
      for (const customerId of [A.customerContributorId, A.customerForeignLegacyCountryId, A.customerForeignSvId]) {
        const r = record(await createExportSale(A.tenantId, A.locations.L1.locationId, A.userId, createExportSaleSchema.parse({
          sale_date: today(), customer_id: customerId, condition_operation_code: "1",
          items: [{ product_id: A.productExportServiceId, quantity: 1, unit_price: 10, discount_amount: 0 }],
          item_type_export: 2, insurance_amount: 0, freight_amount: 0,
        }), run.dbA.client));
        expect(r.ok).toBe(false);
      }
      expect(run.dbA.rows("Sale")).toHaveLength(before);
    });

    it(G[9], async () => {
      const A = run.tenantA;
      // FEX: unidad sin CAT-014 bloquea antes de crear la venta.
      const before = run.dbA.rows("Sale").length;
      const fex = record(await createExportSale(A.tenantId, A.locations.L1.locationId, A.userId, createExportSaleSchema.parse({
        sale_date: today(), customer_id: A.customerForeignId, condition_operation_code: "1",
        items: [{ product_id: A.productNoMhUnitId, quantity: 1, unit_price: 10, discount_amount: 0 }],
        item_type_export: 2, insurance_amount: 0, freight_amount: 0,
      }), run.dbA.client));
      expect(safeStringify(fex)).toMatch(/sin código MH \(CAT-014\)/);
      expect(run.dbA.rows("Sale")).toHaveLength(before);
      // FSE: unidad sin código MH bloquea la generación del JSON.
      const purchaseId = await seedConfirmedPurchase(run.dbA, A, "L1", {
        supplierId: A.supplierExcludedNaturalId, productId: A.productNoMhUnitId, quantity: 1, unitCost: 20,
        paymentNature: "GOODS", withholding: { applies: false, rate: null, base: 0, amount: 0 },
      });
      actAs(run.dbA, A, "L1");
      const pending = record(await createPendingDteForPurchaseAction(purchaseId));
      expectOk(pending, "FSE pendiente con unidad inválida");
      const gen = record(await generateFseJsonForPurchaseAction(pending.dte_document_id));
      expect(!gen.ok && gen.error).toMatch(/sin código MH configurado/);
      expect(doc(run.dbA, pending.dte_document_id).dte_status).toBe("PENDING_GENERATION");
    });

    it(G[10], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const before = run.dbA.rows("DteOutgoingDocument").length;
      const corrBefore = run.dbA.rows("DteCorrelative").find((c) => c.dte_type_code === "01" && c.location_id === run.tenantA.locations.L1.locationId)!.last_sequence;
      const r = record(await createPendingDteSimpleAction(run.sales.fe));
      expect(!r.ok && r.error).toMatch(/ya tiene un documento DTE de tipo "01" activo/);
      expect(run.dbA.rows("DteOutgoingDocument")).toHaveLength(before);
      expect(run.dbA.rows("DteCorrelative").find((c) => c.dte_type_code === "01" && c.location_id === run.tenantA.locations.L1.locationId)!.last_sequence).toBe(corrBefore);
    });

    it(G[11], async () => {
      actAs(run.dbA, run.tenantA, "L1");
      const callsBefore = run.network.calls.length;
      const accepted = doc(run.dbA, run.docs.fe);
      const t = record(await transmitDteDocumentAction(run.docs.fe));
      expect(!t.ok && t.error).toMatch(/Solo se pueden transmitir documentos firmados. Estado actual: ACCEPTED/);
      const s = record(await signDteDocumentAction(run.docs.fe));
      expect(!s.ok && s.error).toMatch(/Estado actual: ACCEPTED/);
      expect(run.network.calls.length).toBe(callsBefore);
      expect(doc(run.dbA, run.docs.fe)).toEqual(accepted);
    });
  });

  // ── ISOLATION & IDEMPOTENCY ────────────────────────────────────
  describe("ISOLATION & IDEMPOTENCY", () => {
    const I = S["ISOLATION & IDEMPOTENCY"];

    it(I[0], async () => {
      const opsB = run.dbB.totalOps();
      // Flujo completo de B en su base dedicada; su correlativo arranca en 1.
      const { dteId } = await saleDteToSigned(run.dbB, run.tenantB, "L1", { dteType: "01", customerId: null });
      actAs(run.dbB, run.tenantB, "L1");
      run.network.enqueueReception("PROCESADO");
      expectOk(record(await transmitDteDocumentAction(dteId)), "transmit B");
      const d = doc(run.dbB, dteId);
      expect(d).toMatchObject({ tenant_id: run.tenantB.tenantId, dte_status: "ACCEPTED", control_number: "DTE-01-M001P001-000000000000001" });
      expect(run.network.callsOf("MH_RECEPTION").at(-1)?.authorizedAs).toBe(run.tenantB.locations.L1.issuerNit);
      expect(run.dbB.totalOps()).toBeGreaterThan(opsB);
      // Ninguna fila de A en B ni de B en A.
      expect(run.dbB.rows("DteOutgoingDocument").every((r) => r.tenant_id === run.tenantB.tenantId)).toBe(true);
      expect(run.dbA.rows("DteOutgoingDocument").some((r) => r.tenant_id === run.tenantB.tenantId)).toBe(false);
      // Intruso C (misma base física que A) no tiene documentos ni correlativos.
      expect(run.dbA.rows("DteOutgoingDocument").some((r) => r.tenant_id === run.tenantC.tenantId)).toBe(false);
    });

    it(I[1], async () => {
      const A = run.tenantA;
      actAs(run.dbA, A, "L2");
      const r = record(await createPendingDteSimpleAction(run.sales.l2));
      expectOk(r, "FE en L2");
      const d = doc(run.dbA, r.dte_document_id);
      // L2 usa su propio emisor y establecimiento, con su propia secuencia.
      expect(d).toMatchObject({ location_id: A.locations.L2.locationId, issuer_config_id: A.locations.L2.issuerConfigId, control_number: "DTE-01-M002P002-000000000000001" });
      actAs(run.dbA, A, "L1");
      const fromL1 = record(await validateDteJsonSchemaAction(r.dte_document_id));
      expect(!fromL1.ok && fromL1.error).toMatch(/no existe o no pertenece a la location activa/);
      run.docs.l2 = r.dte_document_id;
    });

    it(I[2], async () => {
      const A = run.tenantA;
      const saleId = await confirmedSale(run.dbA, A, "L1", { dteType: "01", customerId: null, productId: A.productServiceId, quantity: 1, unitPrice: 10 });
      const r = await createPendingDteForSale(A.tenantId, A.locations.L1.locationId, A.userId, {
        sale_id: saleId, dte_type_code: "01", issuer_config_id: A.locations.L2.issuerConfigId!, environment: "TEST",
      }, run.dbA.client);
      expect(!r.ok && r.error).toMatch(/no existe, está inactiva o no corresponde/);
      // Emisor de otro tenant en la misma base física.
      const c = await createPendingDteForSale(A.tenantId, A.locations.L1.locationId, A.userId, {
        sale_id: saleId, dte_type_code: "01", issuer_config_id: run.tenantC.locations.L1.issuerConfigId!, environment: "TEST",
      }, run.dbA.client);
      expect(c.ok).toBe(false);
    });

    it(I[3], async () => {
      const A = run.tenantA;
      const l1 = await resolveDteSignerConfigForIssuer({ issuerConfigId: A.locations.L1.issuerConfigId, environment: "TEST", client: run.dbA.client });
      const l2 = await resolveDteSignerConfigForIssuer({ issuerConfigId: A.locations.L2.issuerConfigId, environment: "TEST", client: run.dbA.client });
      expectOk(l1, "signer L1");
      expectOk(l2, "signer L2");
      expect(l1).toMatchObject({ source: "ISSUER_CREDENTIAL", nit: A.locations.L1.issuerNit });
      expect(l2).toMatchObject({ source: "ISSUER_CREDENTIAL", nit: A.locations.L2.issuerNit });
      expect(l1.config.signerUrl).not.toBe(l2.config.signerUrl);
      // Credencial de L2 desactivada → NO toma prestada la de L1 ni la de otro tenant (sin fallback global).
      await run.dbA.client.dteCredential.updateMany({ where: { issuer_config_id: A.locations.L2.issuerConfigId! }, data: { is_active: false } });
      try {
        actAs(run.dbA, A, "L2");
        expectOk(record(await generateFeJsonForSaleAction(run.docs.l2)), "FE L2 JSON");
        expectOk(record(await validateDteJsonSchemaAction(run.docs.l2)), "FE L2 schema");
        const callsBefore = run.network.calls.length;
        const s = record(await signDteDocumentAction(run.docs.l2));
        // Sin credencial propia y sin firmador/credenciales globales → falla cerrado.
        expect(!s.ok && s.error).toMatch(/No hay firmador configurado para el ambiente TEST|Credenciales del firmador DTE no configuradas/);
        expect(run.network.calls.length).toBe(callsBefore);
        const mh = await resolveMhAuthCredentials({ issuerConfigId: A.locations.L2.issuerConfigId!, environment: "TEST", client: run.dbA.client });
        expect(mh.ok).toBe(false);
      } finally {
        await run.dbA.client.dteCredential.updateMany({ where: { issuer_config_id: A.locations.L2.issuerConfigId! }, data: { is_active: true } });
      }
      actAs(run.dbA, A, "L2");
      expectOk(record(await signDteDocumentAction(run.docs.l2)), "sign L2 con su propia credencial");
      expect(run.network.callsOf("SIGNER").at(-1)?.authorizedAs).toBe(A.locations.L2.issuerNit);
    });

    it(I[4], () => {
      const rows = [run.dbA, run.dbB].flatMap((db) => db.rows("DteCorrelative"));
      const keys = rows.map((c) => `${c.tenant_id}|${c.location_id}|${c.issuer_config_id}|${c.environment}|${c.dte_type_code}|${c.year}`);
      expect(new Set(keys).size).toBe(keys.length);
      // Ningún numeroControl repetido dentro de un mismo tenant/ambiente.
      for (const db of [run.dbA, run.dbB]) {
        const docs = db.rows("DteOutgoingDocument").map((d) => `${d.tenant_id}|${d.environment}|${d.control_number}`);
        expect(new Set(docs).size).toBe(docs.length);
      }
      // Cada correlativo coincide con la mayor secuencia emitida para su partición.
      for (const c of rows) {
        const db = c.tenant_id === run.tenantB.tenantId ? run.dbB : run.dbA;
        const max = Math.max(0, ...db.rows("DteOutgoingDocument")
          .filter((d) => d.tenant_id === c.tenant_id && d.location_id === c.location_id && d.dte_type_code === c.dte_type_code && d.environment === c.environment)
          .map((d) => controlSequence(d.control_number)));
        expect(c.last_sequence).toBe(max);
      }
    });

    it(I[5], () => {
      expect(H.globalPrismaViolations).toEqual([]);
      expect(H.controlPlaneViolations).toEqual([]);
      expect(H.runtimeRouterViolations).toEqual([]);
      expect(run.dbA.totalOps()).toBeGreaterThan(0);
      expect(run.dbB.totalOps()).toBeGreaterThan(0);
      // El único acceso al Prisma global es el catálogo oficial compartido (GLOBAL_REFERENCE).
      expect(new Set(H.globalReferenceReads)).toEqual(new Set(["dteCatalogItem"]));
      expect(run.globalRef.totalOps()).toBe(run.globalRef.opCounts.get("dteCatalogItem.findMany")! + run.globalRef.opCounts.get("dteCatalogItem.create")!);
    });

    it(I[6], async () => {
      const id = run.docs.timeout;
      const before = doc(run.dbA, id);
      const docsBefore = run.dbA.rows("DteOutgoingDocument").length;
      const corrBefore = run.dbA.rows("DteCorrelative").map((c) => c.last_sequence);
      actAs(run.dbA, run.tenantA, "L1");
      run.network.enqueueReception("PROCESADO");
      const r = record(await transmitDteDocumentAction(id));
      expectOk(r, "reintento técnico");
      const after = doc(run.dbA, id);
      expect(after).toMatchObject({
        dte_status: "ACCEPTED", control_number: before.control_number, generation_code: before.generation_code, signed_jws: before.signed_jws,
      });
      expect(run.dbA.rows("DteOutgoingDocument")).toHaveLength(docsBefore);
      expect(run.dbA.rows("DteCorrelative").map((c) => c.last_sequence)).toEqual(corrBefore);
      // Ambos envíos usaron el MISMO JWS firmado.
      const sends = run.network.callsOf("MH_RECEPTION").filter((c) => c.codigoGeneracion === before.generation_code);
      expect(sends).toHaveLength(2);
      expect(new Set(sends.map((c) => c.jwsSha256)).size).toBe(1);
      const logs = run.dbA.rows("DteTransmissionLog").filter((l) => l.dte_document_id === id && l.operation_type === "SEND");
      expect(logs.map((l) => l.attempt_number)).toEqual([1, 2]);
    });

    it(I[7], async () => {
      const rejected = doc(run.dbA, run.docs.rejected);
      const saleId = rejected.sale_id as string;
      actAs(run.dbA, run.tenantA, "L1");
      const r = record(await createPendingDteSimpleAction(saleId));
      expectOk(r, "regenerar tras REJECTED");
      const fresh = doc(run.dbA, r.dte_document_id);
      expect(fresh.generation_code).not.toBe(rejected.generation_code);
      expect(controlSequence(fresh.control_number)).toBeGreaterThan(controlSequence(rejected.control_number));
      expect(doc(run.dbA, run.docs.rejected)).toEqual(rejected);
      // Mientras el nuevo está activo, un tercero queda bloqueado.
      const dup = record(await createPendingDteSimpleAction(saleId));
      expect(dup.ok).toBe(false);
    });

    it(I[8], async () => {
      // TEST nunca crea filas de ledger (bypass por diseño).
      expect(run.dbA.rows("DteFiscalMeteringReservation")).toHaveLength(0);
      expect(run.dbB.rows("DteFiscalMeteringReservation")).toHaveLength(0);
      // Semántica del ledger PRODUCTION verificada SOLO a nivel ledger, en memoria:
      // sin firma, sin red, sin documento PRODUCTION emitido.
      const ctx = {
        mode: "MANAGED" as const, tenantId: run.tenantA.tenantId, organizationId: "cert-org-A", planId: "cert-plan", verticalId: null,
        effectiveModules: new Map(), organizationTimezone: "America/El_Salvador",
        effectiveEntitlements: new Map([["fiscal.dte.monthly_issued", {
          entitlement_definition_id: "cert", code: "fiscal.dte.monthly_issued", name: "DTE mensual", category: "FISCAL",
          value_type: "NUMERIC", period_type: "MONTHLY", numeric_value: 100, is_unlimited: false, source: "PLAN",
        }]]),
      } as unknown as Parameters<typeof reserveDteFiscalCapacity>[0]["commercialCtx"];
      const params = { dteDocumentId: run.docs.unexpected, tenantId: run.tenantA.tenantId, environment: "PRODUCTION" as const, commercialCtx: ctx, runtimeDb: run.dbA.client };
      const first = await reserveDteFiscalCapacity(params);
      const second = await reserveDteFiscalCapacity(params);
      expectOk(first, "reserva 1");
      expectOk(second, "reserva 2");
      expect(first.token).toMatchObject({ mode: "RESERVED" });
      expect(second.token).toEqual(first.token);
      expect(run.dbA.rows("DteFiscalMeteringReservation")).toHaveLength(1);
      await run.dbA.client.$transaction(async (tx) => finalizeDteFiscalCapacityConsumed(tx, first.token));
      const third = await reserveDteFiscalCapacity(params);
      expectOk(third, "reserva 3");
      expect(third.token).toMatchObject({ mode: "ALREADY_CONSUMED" });
      expect(run.dbA.rows("DteFiscalMeteringReservation")).toHaveLength(1);
      expect(run.dbA.rows("DteFiscalMeteringReservation")[0]).toMatchObject({ status: "CONSUMED" });
      // Limpieza del artefacto ledger-only.
      await run.dbA.client.dteFiscalMeteringReservation.deleteMany({});
    });
  });

  // ── CONFIGURATION ───────────────────────────────────────────────
  describe("CONFIGURATION", () => {
    const C = S.CONFIGURATION;

    it(C[0], async () => {
      // Lecturas de configuración scopeadas por tenant aun compartiendo base física.
      const A = run.tenantA;
      const cfgs = await run.dbA.client.dteIssuerConfig.findMany({ where: { tenant_id: run.tenantC.tenantId, is_active: true } });
      expect(cfgs.every((c) => c.tenant_id === run.tenantC.tenantId)).toBe(true);
      actAs(run.dbA, run.tenantC, "L1");
      const r = record(await createPendingDteSimpleAction(run.sales.fe)); // venta de A
      expect(!r.ok && r.error).toMatch(/no existe o no pertenece a la location activa/);
      expect(run.dbA.rows("DteOutgoingDocument").filter((d) => d.sale_id === run.sales.fe).every((d) => d.tenant_id === A.tenantId)).toBe(true);
    });

    it(C[1], async () => {
      actAs(run.dbA, run.tenantA, "L2");
      const r = record(await createPendingDteSimpleAction(run.sales.fe)); // venta de L1
      expect(!r.ok && r.error).toMatch(/no existe o no pertenece a la location activa/);
    });

    it(C[2], () => {
      const A = run.tenantA;
      for (const [key, id] of [["L1", run.docs.fe], ["L1", run.docs.ccfe], ["L1", run.docs.nc], ["L1", run.docs.fse], ["L1", run.docs.fex], ["L2", run.docs.l2]] as const) {
        expect(doc(run.dbA, id).issuer_config_id).toBe(A.locations[key].issuerConfigId);
      }
      // Emisor resuelto = único activo de la location (TEST), nunca PRODUCTION.
      expect(run.dbA.rows("DteOutgoingDocument").every((d) => d.environment === "TEST")).toBe(true);
      expect(run.dbB.rows("DteOutgoingDocument").every((d) => d.environment === "TEST")).toBe(true);
    });

    it(C[3], () => {
      // Probado operativamente en GUARDS (cero / dos activos). Aquí: invariante de datos.
      for (const db of [run.dbA, run.dbB]) {
        const active = db.rows("DteIssuerConfig").filter((c) => c.is_active);
        const perLocation = new Map<string, number>();
        for (const c of active) perLocation.set(`${c.tenant_id}|${c.location_id}`, (perLocation.get(`${c.tenant_id}|${c.location_id}`) ?? 0) + 1);
        expect([...perLocation.values()].every((n) => n === 1)).toBe(true);
      }
    });

    it(C[4], async () => {
      for (const t of [run.tenantA, run.tenantB]) {
        const db = t === run.tenantB ? run.dbB : run.dbA;
        for (const loc of Object.values(t.locations)) {
          if (!loc.issuerConfigId) continue;
          const signer = await resolveDteSignerConfigForIssuer({ issuerConfigId: loc.issuerConfigId, environment: "TEST", client: db.client });
          const mh = await resolveMhAuthCredentials({ issuerConfigId: loc.issuerConfigId, environment: "TEST", client: db.client });
          expectOk(signer, "signer");
          expectOk(mh, "mh");
          expect(signer).toMatchObject({ source: "ISSUER_CREDENTIAL", nit: loc.issuerNit });
          expect(mh.user).toBe(loc.identity!.mhUser);
        }
      }
      // Sin credencial de emisor y sin env global, PRODUCTION nunca resuelve credenciales.
      const prod = await resolveMhAuthCredentials({ environment: "PRODUCTION", client: run.dbA.client });
      expect(prod.ok).toBe(false);
    });
  });

  // ── SAFETY ──────────────────────────────────────────────────────
  describe("SAFETY", () => {
    const X = S.SAFETY;

    it(X[0], () => {
      expect(run.network.violations).toEqual([]);
      const hosts = new Set(run.network.calls.map((c) => new URL(c.endpoint).host));
      for (const host of hosts) expect(host === "apitest.dtes.mh.gob.sv" || host.endsWith(".dte-cert.invalid")).toBe(true);
      expect(run.network.calls.every((c) => c.ambiente === null || c.ambiente === "00")).toBe(true);
    });

    it(X[1], () => {
      expect(H.mariaDbViolations).toEqual([]);
      expect(run.dbA.rows("DteDelivery")).toHaveLength(0);
    });

    it(X[2], () => {
      expect(H.globalPrismaViolations).toEqual([]);
      expect(H.controlPlaneViolations).toEqual([]);
      expect(H.runtimeRouterViolations).toEqual([]);
    });

    it(X[3], () => {
      const secrets = allSyntheticSecrets();
      expect(secrets.length).toBeGreaterThan(4);
      const surfaces: Record<string, string> = {
        console: run.consoleCapture.join("\n"),
        actionResults: safeStringify(run.actionResults),
        networkLog: safeStringify(run.network.calls),
      };
      for (const db of [run.dbA, run.dbB]) {
        for (const model of ["DteOutgoingDocument", "DteTransmissionLog", "DteInvalidationEvent", "DteDocumentRelation", "DteIssuerConfig", "DteCredential", "Sale", "Purchase"]) {
          surfaces[`${db.label}:${model}`] = safeStringify(db.rows(model));
        }
      }
      for (const [surface, text] of Object.entries(surfaces)) {
        for (const s of secrets) expect(text.includes(s), `secreto expuesto en ${surface}`).toBe(false);
      }
      // signed_jws nunca en logs de transmisión ni en resultados de actions.
      const jwsList = [run.dbA, run.dbB].flatMap((db) => db.rows("DteOutgoingDocument").map((d) => d.signed_jws).filter(Boolean)) as string[];
      for (const jws of jwsList) {
        expect(surfaces.actionResults.includes(jws)).toBe(false);
        expect(surfaces[`${run.dbA.label}:DteTransmissionLog`].includes(jws)).toBe(false);
        expect(surfaces.console.includes(jws)).toBe(false);
      }
    });

    it(X[4], () => {
      for (const db of [run.dbA, run.dbB]) {
        const tenants = new Set(db.rows("RuntimeTenant").map((t) => t.id));
        expect(db.rows("DteOutgoingDocument").every((d) => tenants.has(d.tenant_id as string))).toBe(true);
        for (const cfg of db.rows("DteIssuerConfig")) expect(String(cfg.nit).startsWith(CERT_NIT_PREFIX)).toBe(true);
        for (const t of db.rows("RuntimeTenant")) expect(String(t.name)).toMatch(/^TENANT SINTETICO CERT-/);
      }
      for (const key of ["DATABASE_URL", "DIRECT_URL", "DTE_MH_USER", "DTE_MH_PASSWORD", "DTE_SIGNER_PASSWORD"]) {
        expect(process.env[key]).toBeUndefined();
      }
      expect(process.env.PLATFORM_ENCRYPTION_KEY).toBe(run.encryptionKey);
    });
  });
});
