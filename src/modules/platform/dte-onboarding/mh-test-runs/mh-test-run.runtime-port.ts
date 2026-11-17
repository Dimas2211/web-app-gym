// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-run.runtime-port.ts
//
// DTE-MH-TEST-RUNS — puerto del motor hacia la base RUNTIME del cliente.
// La implementación real reutiliza los servicios DTE existentes (firma,
// transmisión, conciliación, NC, invalidación, contingencia) pasando el
// cliente runtime explícito de withOrganizationRuntimePrisma. Los tests del
// motor usan un fake de este puerto (nunca red real).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
  MhTestContingencySettings,
  MhTestReceptors,
  MhTestResponsible,
  MhTestScenarioCode,
} from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";
import type {
  MhTestDocState,
  MhTestLogOperation,
  MhTestMaterializeItem,
  MhTestMaterializeResult,
  MhTestStepResult,
} from "@/modules/commerce/dte/mh-test-runs/mh-test-documents.service";
import type { TransmitDteDocumentResult } from "@/modules/commerce/dte/services/transmit-dte-document.service";
import type { ReconcileDteWithMhResult } from "@/modules/commerce/dte/services/dte-reconciliation.service";

export type PortResult = { ok: true } | { ok: false; error: string };
export type EventRef = { id: string; status: string; mh_sello_recibido: string | null };
export type EventTransmitResult =
  | { ok: true; eventStatus: "ACCEPTED" | "REJECTED"; mhEstado: string; descripcion: string | null; sello: string | null }
  | { ok: false; error: string };

export interface MhTestPreflight {
  ok:     boolean;
  errors: string[];
}

export interface MhTestRuntimePort {
  preflight(): Promise<MhTestPreflight>;
  materialize(items: MhTestMaterializeItem[], contingency: MhTestContingencySettings | null): Promise<MhTestMaterializeResult>;
  readDoc(key: string): Promise<MhTestDocState | null>;
  generate(input: { key: string; scenario: MhTestScenarioCode; index: number; receptors: MhTestReceptors }): Promise<MhTestStepResult>;
  validate(dteDocumentId: string): Promise<PortResult>;
  sign(dteDocumentId: string): Promise<PortResult>;
  transmit(dteDocumentId: string): Promise<TransmitDteDocumentResult>;
  reconcile(dteDocumentId: string): Promise<ReconcileDteWithMhResult>;
  lastLog(dteDocumentId: string, operation: MhTestLogOperation): Promise<{ attempt: number; errorCode: string | null; count: number }>;
  prepareCreditNote(ncKey: string, ccfeKey: string): Promise<MhTestStepResult>;
  cancelUnsigned(key: string): Promise<boolean>;
  findInvalidation(dteDocumentId: string, eventId: string | null): Promise<EventRef | null>;
  createInvalidation(dteDocumentId: string, responsible: MhTestResponsible): Promise<{ ok: true; eventId: string } | { ok: false; error: string }>;
  signInvalidation(eventId: string): Promise<PortResult>;
  transmitInvalidation(eventId: string): Promise<EventTransmitResult>;
  findContingency(dteDocumentIds: string[], eventId: string | null): Promise<EventRef | null>;
  emissionWindow(keys: string[]): Promise<{ ids: string[]; first: string | null; last: string | null; complete: boolean }>;
  createContingency(dteDocumentIds: string[], window: { first: string; last: string }, settings: MhTestContingencySettings, responsible: MhTestResponsible): Promise<{ ok: true; eventId: string } | { ok: false; error: string }>;
  buildContingency(eventId: string, responsible: MhTestResponsible): Promise<PortResult>;
  signContingency(eventId: string): Promise<PortResult>;
  transmitContingency(eventId: string): Promise<EventTransmitResult>;
}

export interface MhTestRuntimeScopeInput {
  organizationId: string;
  tenantId:       string;
  locationId:     string;
  issuerConfigId: string;
  /** Actor runtime (User.id existente en la base runtime). */
  userId:         string;
}

export const MH_TEST_INVALIDATION_REASON = "Prueba de certificación MH (ambiente TEST) — anulación de documento de prueba.";

function persona(r: MhTestResponsible) {
  return { nombre: r.name.trim(), tipoDocumento: r.docTypeCode, numeroDocumento: r.documentNumber.trim() };
}

/**
 * Preflight sin red: emisor TEST vigente del alcance de la corrida,
 * credencial MH propia del emisor (sin depender del fallback global de
 * TEST) y firmador resuelto desde la credencial del emisor.
 */
export async function runMhTestPreflight(db: PrismaClient, scope: MhTestRuntimeScopeInput): Promise<MhTestPreflight> {
  const { getDteCredentialStatus, resolveDteSignerConfigForIssuer } = await import("@/modules/commerce/dte/services/dte-credential.service");
  const errors: string[] = [];
  const issuer = await db.dteIssuerConfig.findFirst({
    where:  { id: scope.issuerConfigId, tenant_id: scope.tenantId, location_id: scope.locationId },
    select: { environment: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
  if (!issuer) return { ok: false, errors: ["El emisor de la corrida ya no existe en el runtime."] };
  if (issuer.environment !== "TEST") errors.push("El emisor de la corrida no es del ambiente TEST.");
  if (!issuer.cod_estable_mh || !issuer.cod_punto_venta_mh) errors.push("El emisor no tiene cod_estable_mh / cod_punto_venta_mh.");

  const cred = await getDteCredentialStatus(scope.issuerConfigId, db);
  if (!cred.configured || !cred.is_active) errors.push("El emisor no tiene credencial DTE activa.");
  if (!cred.has_api_user || !cred.has_api_password) errors.push("La credencial del emisor no tiene usuario/contraseña de API MH (no se usa el fallback global).");
  if ((cred.secret_collisions ?? []).some((c) => c.blocking)) errors.push("La credencial del emisor tiene secretos repetidos que bloquean su uso.");

  const signer = await resolveDteSignerConfigForIssuer({ issuerConfigId: scope.issuerConfigId, environment: "TEST", client: db });
  if (!signer.ok || signer.source !== "ISSUER_CREDENTIAL") errors.push("El firmador no se resuelve desde la credencial del emisor (ISSUER_CREDENTIAL).");

  const actor = await db.user.findFirst({ where: { id: scope.userId, tenant_id: scope.tenantId }, select: { id: true } });
  if (!actor) errors.push("El actor autorizado no existe en el runtime del cliente.");
  return { ok: errors.length === 0, errors };
}

export function createRuntimeMhTestPort(scope: MhTestRuntimeScopeInput): MhTestRuntimePort {
  const ctx = { tenantId: scope.tenantId, locationId: scope.locationId, issuerConfigId: scope.issuerConfigId, userId: scope.userId };
  const svcParams = { userId: scope.userId, tenantId: scope.tenantId, locationId: scope.locationId };

  async function rt<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
    const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
    return withOrganizationRuntimePrisma(scope.organizationId, (client) => fn(client));
  }
  const docs = () => import("@/modules/commerce/dte/mh-test-runs/mh-test-documents.service");

  return {
    preflight: () => rt((db) => runMhTestPreflight(db, scope)),

    materialize: async (items, contingency) => {
      const m = await docs();
      return rt((db) => m.materializeMhTestDocuments(db, { ...ctx, contingency }, items));
    },
    readDoc: async (key) => {
      const m = await docs();
      return rt((db) => m.readMhTestDocByKey(db, ctx, key));
    },
    generate: async (input) => {
      const m = await docs();
      return rt((db) => m.generateMhTestDocumentJson(db, ctx, input));
    },
    validate: async (id) => {
      const { validateDteJsonSchema } = await import("@/modules/commerce/dte/services/validate-dte-json-schema.service");
      const r = await rt((db) => validateDteJsonSchema(id, scope.tenantId, scope.locationId, scope.userId, db));
      if (r.ok) return { ok: true };
      const detail = (r.validation_errors ?? []).slice(0, 5).map((e) => `${e.path} ${e.message}`).join("; ");
      return { ok: false, error: detail ? `${r.error} (${detail})` : r.error };
    },
    sign: async (id) => {
      const { signDteDocument } = await import("@/modules/commerce/dte/services/sign-dte-document.service");
      const r = await rt((db) => signDteDocument({ dteDocumentId: id, ...svcParams }, db));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    transmit: async (id) => {
      const { transmitDteDocument } = await import("@/modules/commerce/dte/services/transmit-dte-document.service");
      return rt((db) => transmitDteDocument({ dteDocumentId: id, ...svcParams }, db));
    },
    reconcile: async (id) => {
      const { reconcileDteWithMh } = await import("@/modules/commerce/dte/services/dte-reconciliation.service");
      return rt((db) => reconcileDteWithMh({ dteDocumentId: id, tenantId: scope.tenantId, locationId: scope.locationId, runtimeDb: db, userId: scope.userId }));
    },
    lastLog: async (id, op) => {
      const m = await docs();
      return rt((db) => m.readLastMhLog(db, id, op));
    },
    prepareCreditNote: async (ncKey, ccfeKey) => {
      const m = await docs();
      return rt((db) => m.prepareMhTestCreditNote(db, ctx, { ncKey, ccfeKey }));
    },
    cancelUnsigned: async (key) => {
      const m = await docs();
      return rt((db) => m.cancelUnsignedMhTestDocument(db, ctx, key));
    },
    findInvalidation: async (docId, eventId) => {
      const m = await docs();
      return rt((db) => m.findMhTestInvalidationEvent(db, ctx, docId, eventId));
    },
    createInvalidation: async (docId, responsible) => {
      const { createInvalidationEvent } = await import("@/modules/commerce/dte/services/create-invalidation-event.service");
      const r = await rt((db) => createInvalidationEvent({
        dteDocumentId: docId, invalidationTypeCode: "2", reason: MH_TEST_INVALIDATION_REASON, replacementGenerationCode: null,
        responsable: persona(responsible), solicita: persona(responsible), ...svcParams,
      }, db));
      return r.ok ? { ok: true, eventId: r.invalidationEventId } : { ok: false, error: r.message };
    },
    signInvalidation: async (eventId) => {
      const { signInvalidationEvent } = await import("@/modules/commerce/dte/services/sign-invalidation-event.service");
      const r = await rt((db) => signInvalidationEvent({ invalidationEventId: eventId, ...svcParams }, db));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    transmitInvalidation: async (eventId) => {
      const { transmitInvalidationEvent } = await import("@/modules/commerce/dte/services/transmit-invalidation-event.service");
      const r = await rt((db) => transmitInvalidationEvent({ invalidationEventId: eventId, ...svcParams }, db));
      return r.ok
        ? { ok: true, eventStatus: r.eventStatus, mhEstado: r.mhEstado, descripcion: r.descripcionMsg, sello: r.selloRecibido }
        : { ok: false, error: r.error };
    },
    findContingency: async (ids, eventId) => {
      const m = await docs();
      return rt((db) => m.findMhTestContingencyEvent(db, ctx, ids, eventId));
    },
    emissionWindow: async (keys) => {
      const m = await docs();
      return rt((db) => m.readMhTestEmissionWindow(db, ctx, keys));
    },
    createContingency: async (ids, window, settings, responsible) => {
      const { createContingencyEvent } = await import("@/modules/commerce/dte/services/create-contingency-event.service");
      const [fDate, fTime] = window.first.split(" ");
      const [lDate, lTime] = window.last.split(" ");
      const r = await rt((db) => createContingencyEvent({
        dteDocumentIds: ids, contingencyTypeCode: settings.contingencyTypeCode, reason: settings.reason,
        periodStartDate: new Date(`${fDate}T00:00:00Z`), periodStartTime: fTime,
        periodEndDate: new Date(`${lDate}T00:00:00Z`), periodEndTime: lTime,
        responsable: persona(responsible), ...svcParams,
      }, db));
      return r.ok ? { ok: true, eventId: r.contingencyEventId } : { ok: false, error: r.message };
    },
    buildContingency: async (eventId, responsible) => {
      const { buildAndPersistContingencyEventJson } = await import("@/modules/commerce/dte/services/persist-contingency-event-json.service");
      const r = await rt((db) => buildAndPersistContingencyEventJson({ contingencyEventId: eventId, tenantId: scope.tenantId, locationId: scope.locationId, responsable: persona(responsible) }, db));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    signContingency: async (eventId) => {
      const { signContingencyEvent } = await import("@/modules/commerce/dte/services/sign-contingency-event.service");
      const r = await rt((db) => signContingencyEvent({ contingencyEventId: eventId, tenantId: scope.tenantId, locationId: scope.locationId }, db));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    transmitContingency: async (eventId) => {
      const { transmitContingencyEvent } = await import("@/modules/commerce/dte/services/transmit-contingency-event.service");
      const r = await rt((db) => transmitContingencyEvent({ contingencyEventId: eventId, tenantId: scope.tenantId, locationId: scope.locationId }, db));
      return r.ok
        ? { ok: true, eventStatus: r.eventStatus, mhEstado: r.mhEstado, descripcion: r.mensaje, sello: r.selloRecibido }
        : { ok: false, error: r.error };
    },
  };
}
