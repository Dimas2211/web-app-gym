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
import type { DteSpecProfile } from "@/modules/commerce/dte/spec/dte-spec-profile";
import {
  createMhTestRunSpecProfileOverride,
  type MhTestRunSpecProfileOverride,
} from "@/modules/commerce/dte/spec/mh-test-run-profile-override";

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
  /**
   * Usuario de PLATAFORMA que autorizó la corrida (Control Plane). Es la
   * identidad de auditoría (run.authorized_by / created_by / decided_by).
   * NO se exige que exista en la base runtime: ver resolveMhTestRuntimeActor.
   */
  userId:         string;
  /**
   * MH20 (Fase 9.0): perfil PERSISTIDO de la corrida (fila M4) y snapshot del
   * emisor tomado al crearla. Ausente → MH_1_2 (comportamiento histórico).
   */
  runId?:          string;
  profile?:        DteSpecProfile;
  issuerSnapshot?: MhTestIssuerSnapshot | null;
}

export type MhTestIssuerSnapshot = Record<"cod_estable_mh" | "cod_punto_venta_mh" | "dept_code" | "municipality_code", string | null>;

/** Override del perfil 2.0 para los servicios runtime; null con MH_1_2. */
export function mhTestRunOverrideFor(scope: MhTestRuntimeScopeInput): MhTestRunSpecProfileOverride | null {
  if ((scope.profile ?? "MH_1_2") !== "MH_2_0") return null;
  if (!scope.runId) throw new Error("MH20_RUN_SCOPE_INVALID: falta runId para el perfil MH 2.0.");
  return createMhTestRunSpecProfileOverride({ runId: scope.runId, issuerConfigId: scope.issuerConfigId, profile: scope.profile });
}

const SNAPSHOT_KEYS = ["cod_estable_mh", "cod_punto_venta_mh", "dept_code", "municipality_code"] as const;

/**
 * Preflight adicional de una corrida MH_2_0 (sin red, solo lectura):
 * M1/M1b/M2 en la base runtime, schemas 2.0, catálogos 2.0 sembrados,
 * códigos AT del emisor y emisor sin cambios respecto del snapshot.
 */
export async function runMh20RuntimePreflight(db: PrismaClient, scope: MhTestRuntimeScopeInput): Promise<string[]> {
  const errors: string[] = [];
  if (!scope.runId) errors.push("Corrida MH 2.0 sin identificador.");
  if (!scope.issuerSnapshot) errors.push("Corrida MH 2.0 sin snapshot del emisor (fila M4).");
  const admin = await import("@/modules/commerce/dte/services/dte-spec-profile-admin.service");
  const persistence = await admin.checkSpecProfilePersistence(db);
  if (!persistence.ok) errors.push(`Base runtime sin migraciones MH 2.0: ${persistence.missing.join(", ")}.`);
  const m2 = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'dte_return_events'`;
  if (m2.length === 0) errors.push("Base runtime sin M2 (dte_return_events): la invalidación 2.0 la consulta.");
  errors.push(...admin.checkMh20SchemasAvailable().map((p) => `Schemas 2.0: ${p}.`));
  if (persistence.ok) errors.push(...(await admin.checkMh20CatalogsSeeded(db)).map((p) => `Catálogos 2.0: ${p}.`));

  const issuer = await db.dteIssuerConfig.findFirst({
    where:  { id: scope.issuerConfigId, tenant_id: scope.tenantId, location_id: scope.locationId },
    select: { environment: true, cod_estable_mh: true, cod_punto_venta_mh: true, dept_code: true, municipality_code: true },
  });
  if (issuer) {
    const { MH20_COD_ESTABLE_RE, MH20_COD_PUNTO_VENTA_RE } = await import("@/modules/commerce/dte/services/build-invalidation-event-json.v3");
    if (!MH20_COD_ESTABLE_RE.test(issuer.cod_estable_mh ?? "") || !MH20_COD_PUNTO_VENTA_RE.test(issuer.cod_punto_venta_mh ?? "")) {
      errors.push("El emisor no tiene códigos AT válidos para MH 2.0 (M|S|B|P + 3 dígitos / P + 3 dígitos).");
    }
    if (scope.issuerSnapshot) {
      const changed = SNAPSHOT_KEYS.filter((k) => (issuer[k] ?? null) !== (scope.issuerSnapshot![k] ?? null));
      if (changed.length > 0) errors.push(`El emisor cambió desde la creación de la corrida (${changed.join(", ")}). Cree una corrida nueva.`);
    }
  }
  return errors;
}

/**
 * Actor para las columnas de auditoría del runtime (created_by, updated_by,
 * requested_by → FK a User de la base runtime). Mismo mecanismo que el
 * registro de credenciales del onboarding (signer-provisioning.service):
 * el mismo id si ese usuario existe en el runtime del tenant; si no, null.
 * Nunca se crean usuarios ni se suplanta a un usuario del cliente; la
 * identidad real queda auditada en el Control Plane.
 */
export async function resolveMhTestRuntimeActor(db: PrismaClient, scope: Pick<MhTestRuntimeScopeInput, "userId" | "tenantId">): Promise<string | null> {
  if (!scope.userId) return null;
  const actor = await db.user.findFirst({ where: { id: scope.userId, tenant_id: scope.tenantId }, select: { id: true } });
  return actor?.id ?? null;
}

/**
 * Los servicios DTE existentes tipan userId como string, pero solo lo
 * escriben en columnas FK NULLABLES (updated_by / requested_by; verificado
 * por mh-test-run.runtime-port.test.ts contra el schema). null = "sin actor
 * runtime", igual que upsertDteCredential(user_id: null).
 */
function serviceActor(actor: string | null): string {
  return actor as string;
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

  // MH20 (Fase 9.0): guardias adicionales del perfil 2.0.
  if ((scope.profile ?? "MH_1_2") === "MH_2_0") errors.push(...(await runMh20RuntimePreflight(db, scope)));

  // El usuario de plataforma no necesita existir en el runtime (ver resolveMhTestRuntimeActor).
  return { ok: errors.length === 0, errors };
}

export function createRuntimeMhTestPort(scope: MhTestRuntimeScopeInput): MhTestRuntimePort {
  // Actor runtime resuelto una vez por puerto (un tick) contra la propia base runtime.
  let actor: Promise<string | null> | null = null;
  type Rt = { ctx: { tenantId: string; locationId: string; issuerConfigId: string; userId: string | null }; svcParams: { userId: string; tenantId: string; locationId: string }; actorId: string | null };

  async function rt<T>(fn: (db: PrismaClient, a: Rt) => Promise<T>): Promise<T> {
    const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
    return withOrganizationRuntimePrisma(scope.organizationId, async (client) => {
      actor ??= resolveMhTestRuntimeActor(client, scope);
      const actorId = await actor;
      return fn(client, {
        actorId,
        ctx:       { tenantId: scope.tenantId, locationId: scope.locationId, issuerConfigId: scope.issuerConfigId, userId: actorId },
        svcParams: { userId: serviceActor(actorId), tenantId: scope.tenantId, locationId: scope.locationId },
      });
    });
  }
  const docs = () => import("@/modules/commerce/dte/mh-test-runs/mh-test-documents.service");
  // MH20 (Fase 9.0): perfil persistido de la corrida → override explícito por servicio.
  const override = mhTestRunOverrideFor(scope);
  const profile: DteSpecProfile = scope.profile ?? "MH_1_2";

  return {
    preflight: () => rt((db) => runMhTestPreflight(db, scope)),

    materialize: async (items, contingency) => {
      const m = await docs();
      return rt((db, { ctx }) => m.materializeMhTestDocuments(db, { ...ctx, contingency }, items));
    },
    readDoc: async (key) => {
      const m = await docs();
      return rt((db, { ctx }) => m.readMhTestDocByKey(db, ctx, key));
    },
    generate: async (input) => {
      const m = await docs();
      return rt((db, { ctx }) => m.generateMhTestDocumentJson(db, ctx, { ...input, profile }));
    },
    validate: async (id) => {
      const { validateDteJsonSchema } = await import("@/modules/commerce/dte/services/validate-dte-json-schema.service");
      const r = await rt((db, { actorId }) => validateDteJsonSchema(id, scope.tenantId, scope.locationId, serviceActor(actorId), db));
      if (r.ok) return { ok: true };
      const detail = (r.validation_errors ?? []).slice(0, 5).map((e) => `${e.path} ${e.message}`).join("; ");
      return { ok: false, error: detail ? `${r.error} (${detail})` : r.error };
    },
    sign: async (id) => {
      const { signDteDocument } = await import("@/modules/commerce/dte/services/sign-dte-document.service");
      const r = await rt((db, { svcParams }) => signDteDocument({ dteDocumentId: id, ...svcParams, specProfileOverride: override }, db));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    transmit: async (id) => {
      const { transmitDteDocument } = await import("@/modules/commerce/dte/services/transmit-dte-document.service");
      return rt((db, { svcParams }) => transmitDteDocument({ dteDocumentId: id, ...svcParams }, db));
    },
    reconcile: async (id) => {
      const { reconcileDteWithMh } = await import("@/modules/commerce/dte/services/dte-reconciliation.service");
      return rt((db, { actorId }) => reconcileDteWithMh({ dteDocumentId: id, tenantId: scope.tenantId, locationId: scope.locationId, runtimeDb: db, userId: actorId }));
    },
    lastLog: async (id, op) => {
      const m = await docs();
      return rt((db) => m.readLastMhLog(db, id, op));
    },
    prepareCreditNote: async (ncKey, ccfeKey) => {
      const m = await docs();
      return rt((db, { ctx }) => m.prepareMhTestCreditNote(db, ctx, { ncKey, ccfeKey, specProfileOverride: override }));
    },
    cancelUnsigned: async (key) => {
      const m = await docs();
      return rt((db, { ctx }) => m.cancelUnsignedMhTestDocument(db, ctx, key));
    },
    findInvalidation: async (docId, eventId) => {
      const m = await docs();
      return rt((db, { ctx }) => m.findMhTestInvalidationEvent(db, ctx, docId, eventId));
    },
    createInvalidation: async (docId, responsible) => {
      const { createInvalidationEvent } = await import("@/modules/commerce/dte/services/create-invalidation-event.service");
      const r = await rt((db, { svcParams }) => createInvalidationEvent({
        dteDocumentId: docId, invalidationTypeCode: "2", reason: MH_TEST_INVALIDATION_REASON, replacementGenerationCode: null,
        responsable: persona(responsible), solicita: persona(responsible), ...svcParams, specProfileOverride: override,
      }, db));
      return r.ok ? { ok: true, eventId: r.invalidationEventId } : { ok: false, error: r.message };
    },
    signInvalidation: async (eventId) => {
      const { signInvalidationEvent } = await import("@/modules/commerce/dte/services/sign-invalidation-event.service");
      const r = await rt((db, { svcParams }) => signInvalidationEvent({ invalidationEventId: eventId, ...svcParams }, db));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    transmitInvalidation: async (eventId) => {
      const { transmitInvalidationEvent } = await import("@/modules/commerce/dte/services/transmit-invalidation-event.service");
      const r = await rt((db, { actorId }) => transmitInvalidationEvent({ invalidationEventId: eventId, userId: actorId, tenantId: scope.tenantId, locationId: scope.locationId }, db));
      return r.ok
        ? { ok: true, eventStatus: r.eventStatus, mhEstado: r.mhEstado, descripcion: r.descripcionMsg, sello: r.selloRecibido }
        : { ok: false, error: r.error };
    },
    findContingency: async (ids, eventId) => {
      const m = await docs();
      return rt((db, { ctx }) => m.findMhTestContingencyEvent(db, ctx, ids, eventId));
    },
    emissionWindow: async (keys) => {
      const m = await docs();
      return rt((db, { ctx }) => m.readMhTestEmissionWindow(db, ctx, keys));
    },
    createContingency: async (ids, window, settings, responsible) => {
      if (profile === "MH_2_0") return { ok: false, error: "Contingencia v4 bloqueada con MH 2.0 (INC-005 / R20-PEND-01)." };
      const { createContingencyEvent } = await import("@/modules/commerce/dte/services/create-contingency-event.service");
      const [fDate, fTime] = window.first.split(" ");
      const [lDate, lTime] = window.last.split(" ");
      const r = await rt((db, { svcParams }) => createContingencyEvent({
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

/**
 * MH20 (Fase 9.0) — puerto de una corrida concreta. El perfil sale de la
 * fila M4 PERSISTIDA (no del plan ni del emisor actual); sin fila → MH_1_2.
 * Único constructor usado por el tick y por el avance manual.
 */
export function createRuntimeMhTestPortForRun(
  run: { id: string; organization_id: string; tenant_id: string; location_id: string; issuer_config_id: string; authorized_by: string | null },
  runProfile?: { mh_spec_profile: "MH_1_2" | "MH_2_0"; issuer_snapshot: Record<string, string | null> } | null,
): MhTestRuntimePort {
  const profile: DteSpecProfile = runProfile?.mh_spec_profile ?? "MH_1_2";
  const snap = runProfile?.issuer_snapshot ?? null;
  return createRuntimeMhTestPort({
    organizationId: run.organization_id, tenantId: run.tenant_id, locationId: run.location_id,
    issuerConfigId: run.issuer_config_id, userId: run.authorized_by ?? "",
    runId: run.id, profile,
    issuerSnapshot: snap ? {
      cod_estable_mh: snap.cod_estable_mh ?? null, cod_punto_venta_mh: snap.cod_punto_venta_mh ?? null,
      dept_code: snap.dept_code ?? null, municipality_code: snap.municipality_code ?? null,
    } : null,
  });
}
