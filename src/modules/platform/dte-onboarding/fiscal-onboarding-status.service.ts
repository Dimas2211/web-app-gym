// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — fiscal-onboarding-status.service.ts
//
// FISCAL-ONBOARDING — estado consolidado por organización y ambiente:
//   DRAFT -> VALIDATING -> INFRA_READY -> SIGNER_READY -> MH_TEST_ACCEPTED
//   -> [MARIADB_READY] -> READY_TEST  |  (PROD) -> READY_PROD
//
// READY_TEST y READY_PROD son independientes: TEST listo nunca implica
// PRODUCTION. READY_PROD exige además: preflight PRODUCTION sin bloqueos
// (firmador efectivo propio) y atestación de autorización MH.
// El modelo de base runtime (SHARED o DEDICATED) no es requisito: ambos
// se admiten en TEST y PRODUCTION; RUNTIME_REACHABLE valida el runtime
// que resuelve el router de la organización.
// MariaDB es opcional: NOT_CONFIGURED nunca bloquea la emisión.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import type { DteCredentialStatus } from "@/modules/commerce/dte/services/dte-credential.service";
import type { DteProductionPreflightResult } from "@/modules/commerce/dte/services/dte-production-preflight.service";
import { getDteMariaDbIntegrationSummary, type DteMariaDbIntegrationSummary } from "./dte-mariadb-integration.service";
import { getSignerProvisioningSummary, type FiscalEnvironment, type SignerProvisioningSummary } from "./signer-provisioning.service";

export type FiscalOnboardingState =
  | "DRAFT" | "VALIDATING" | "INFRA_READY" | "SIGNER_READY" | "MH_TEST_ACCEPTED"
  | "MARIADB_READY" | "READY_TEST" | "READY_PROD";

export type OnboardingStepStatus = "done" | "pending" | "blocked" | "optional" | "warning";

export interface OnboardingStep {
  code:    string;
  label:   string;
  status:  OnboardingStepStatus;
  detail?: string;
}

export interface RuntimeFiscalFacts {
  ok:     boolean;
  error?: string;
  issuer: {
    id: string; location_id: string; nit: string | null; name: string | null;
    is_active: boolean; missing_fiscal: string[];
  } | null;
  credential:            DteCredentialStatus | null;
  effectiveSignerSource: "ISSUER_CREDENTIAL" | "GLOBAL_ENV" | "UNRESOLVED" | null;
  acceptedCount:         number;
  /** Si se informa, acceptedCount solo cuenta DTE aceptados desde este instante. */
  acceptedSince?:        Date | null;
  preflight:             DteProductionPreflightResult | null;
}

export interface FiscalOnboardingStatus {
  organizationId: string;
  environment:    FiscalEnvironment;
  state:          FiscalOnboardingState;
  readyTest:      boolean;
  readyProd:      boolean;
  canActivate:    boolean;
  steps:          OnboardingStep[];
  blockers:       string[];
  signer:         SignerProvisioningSummary;
  mariadb:        DteMariaDbIntegrationSummary;
  deliveryJobs:   { pending: number; uncertain: number; failed: number };
  runtime:        RuntimeFiscalFacts;
}

export interface OnboardingStatusDeps {
  readRuntimeFacts?: (input: { organizationId: string; tenantId: string; environment: FiscalEnvironment; probe: boolean; acceptedSince?: Date | null }) => Promise<RuntimeFiscalFacts>;
  getOrganization?: (organizationId: string) => Promise<{ tenant_id: string | null; shared_runtime_target_id: string | null } | null>;
  getSigner?:  (organizationId: string, env: FiscalEnvironment) => Promise<SignerProvisioningSummary>;
  getMariaDb?: (organizationId: string) => Promise<DteMariaDbIntegrationSummary>;
  countJobs?:  (organizationId: string, env: FiscalEnvironment) => Promise<{ pending: number; uncertain: number; failed: number }>;
}

const EMPTY_FACTS: RuntimeFiscalFacts = {
  ok: false, issuer: null, credential: null, effectiveSignerSource: null, acceptedCount: 0, preflight: null,
};

async function defaultGetOrganization(organizationId: string) {
  const org = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { tenant_id: true, shared_runtime_target_id: true },
  });
  if (!org) return null;
  return { tenant_id: org.tenant_id, shared_runtime_target_id: org.shared_runtime_target_id };
}

async function defaultCountJobs(organizationId: string, environment: FiscalEnvironment) {
  const rows = await controlPlanePrisma.platformDteExternalDeliveryJob.groupBy({
    by: ["status"], where: { organization_id: organizationId, environment }, _count: { _all: true },
  });
  const c = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { pending: c("PENDING") + c("IN_PROGRESS"), uncertain: c("UNCERTAIN"), failed: c("FAILED_RETRYABLE") };
}

export async function defaultReadRuntimeFacts(input: { organizationId: string; tenantId: string; environment: FiscalEnvironment; probe: boolean; acceptedSince?: Date | null }): Promise<RuntimeFiscalFacts> {
  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  const { getDteCredentialStatus, resolveDteSignerConfigForIssuer } = await import("@/modules/commerce/dte/services/dte-credential.service");
  const { getDteProductionPreflight } = await import("@/modules/commerce/dte/services/dte-production-preflight.service");
  try {
    return await withOrganizationRuntimePrisma(input.organizationId, async (client: PrismaClient) => {
      const issuer = await client.dteIssuerConfig.findFirst({
        where:   { tenant_id: input.tenantId, environment: input.environment },
        orderBy: [{ is_active: "desc" }, { created_at: "asc" }],
        select:  { id: true, location_id: true, nit: true, name: true, is_active: true, activity_code: true, activity_name: true,
                   establishment_code: true, point_of_sale_code: true, cod_estable_mh: true, cod_punto_venta_mh: true },
      });
      if (!issuer) return { ...EMPTY_FACTS, ok: true };

      const missing = (Object.entries({
        nit: issuer.nit, name: issuer.name, activity_code: issuer.activity_code, activity_name: issuer.activity_name,
        establishment_code: issuer.establishment_code, point_of_sale_code: issuer.point_of_sale_code,
        cod_estable_mh: issuer.cod_estable_mh, cod_punto_venta_mh: issuer.cod_punto_venta_mh,
      }) as Array<[string, string | null]>).filter(([, v]) => !v?.trim()).map(([k]) => k);

      const credential = await getDteCredentialStatus(issuer.id, client);
      let effectiveSignerSource: RuntimeFiscalFacts["effectiveSignerSource"] = "UNRESOLVED";
      const r = await resolveDteSignerConfigForIssuer({ issuerConfigId: issuer.id, environment: input.environment, client });
      if (r.ok) effectiveSignerSource = r.source;

      // Con firmador administrado, solo cuentan aceptaciones posteriores al
      // registro de SU credencial: un DTE firmado por otro firmador (p.ej. el
      // anterior o el global) no prueba que el nuevo funcione.
      const acceptedCount = await client.dteOutgoingDocument.count({
        where: {
          tenant_id: input.tenantId, environment: input.environment, dte_status: "ACCEPTED",
          ...(input.acceptedSince ? { accepted_at: { gte: input.acceptedSince } } : {}),
        },
      });

      const preflight = input.environment === "PRODUCTION" && input.probe
        ? await getDteProductionPreflight(input.tenantId, issuer.location_id, client)
        : null;

      return {
        ok: true,
        issuer: { id: issuer.id, location_id: issuer.location_id, nit: issuer.nit, name: issuer.name, is_active: issuer.is_active, missing_fiscal: missing },
        credential, effectiveSignerSource, acceptedCount, acceptedSince: input.acceptedSince ?? null, preflight,
      };
    });
  } catch (err) {
    return { ...EMPTY_FACTS, error: err instanceof Error ? `Runtime no disponible (${err.name}).` : "Runtime no disponible." };
  }
}

export async function getFiscalOnboardingStatus(
  organizationId: string,
  environment: FiscalEnvironment,
  opts: { probe?: boolean } = {},
  deps: OnboardingStatusDeps = {},
): Promise<FiscalOnboardingStatus> {
  const org = await (deps.getOrganization ?? defaultGetOrganization)(organizationId);
  const [signer, mariadb, deliveryJobs] = await Promise.all([
    (deps.getSigner ?? getSignerProvisioningSummary)(organizationId, environment),
    (deps.getMariaDb ?? getDteMariaDbIntegrationSummary)(organizationId),
    (deps.countJobs ?? defaultCountJobs)(organizationId, environment),
  ]);

  const runtime = org?.tenant_id
    ? await (deps.readRuntimeFacts ?? defaultReadRuntimeFacts)({
        organizationId, tenantId: org.tenant_id, environment, probe: !!opts.probe,
        acceptedSince: signer.exists ? signer.credential_registered_at : null,
      })
    : EMPTY_FACTS;

  const steps: OnboardingStep[] = [];
  const add = (s: OnboardingStep) => steps.push(s);
  const isProd = environment === "PRODUCTION";

  add({ code: "ORG_TENANT", label: "Organización vinculada a tenant", status: org?.tenant_id ? "done" : "blocked",
        detail: org?.tenant_id ? undefined : "La organización no tiene tenant_id vinculado." });

  // Sin paso de base dedicada: SHARED y DEDICATED se admiten en ambos
  // ambientes. El runtime real (el que resuelve el router) se valida aquí.
  add({
    code: "RUNTIME_REACHABLE", label: "Runtime fiscal accesible",
    status: runtime.ok ? "done" : "blocked",
    detail: runtime.ok ? undefined : runtime.error ?? "No se pudo leer el runtime de la organización.",
  });

  const issuer = runtime.issuer;
  add({
    code: "ISSUER_CONFIG", label: `Emisor ${environment} registrado (DteIssuerConfig)`,
    status: !issuer ? "blocked" : issuer.missing_fiscal.length ? "blocked" : "done",
    detail: !issuer ? `No existe DteIssuerConfig ${environment}.` : issuer.missing_fiscal.length ? `Faltan: ${issuer.missing_fiscal.join(", ")}.` : `${issuer.name ?? ""}`,
  });

  const cred = runtime.credential;
  add({
    code: "MH_CREDENTIALS", label: "Credenciales MH propias del emisor",
    status: cred?.configured && cred.is_active && cred.has_api_user && cred.has_api_password ? "done" : "blocked",
    detail: cred?.configured ? undefined : "Sin DteCredential: nunca se usan credenciales globales de otro cliente.",
  });

  const collisions = (cred?.secret_collisions ?? []).filter((c) => c.blocking);
  const ownSigner =
    runtime.effectiveSignerSource === "ISSUER_CREDENTIAL" && !!cred?.has_signer_url && !!cred?.has_signer_api_key && collisions.length === 0;
  const signerHostMatches = !signer.exists || !signer.hostname || cred?.signer_host === signer.hostname;
  const infraStatus: OnboardingStepStatus =
    signer.status === "SIGNER_READY" || signer.status === "INFRA_READY" ? "done"
    : !signer.exists ? (ownSigner ? "done" : "pending")
    : signer.status === "FAILED" ? "blocked" : "pending";
  add({
    code: "SIGNER_INFRA", label: "Infraestructura del firmador (Docker/HTTPS/API Key)",
    status: infraStatus,
    detail: !signer.exists ? (ownSigner ? "Firmador existente registrado manualmente (no administrado por el aprovisionador)." : "Sin firmador registrado.")
      : `${signer.status}${signer.last_error ? ` — último error registrado (APPLY/VERIFY/ROLLBACK): ${signer.last_error}` : ""}`,
  });
  // Firmador administrado: INFRA_READY solo refleja lo que reportó el
  // ejecutor tras APPLY. Para contar como firmador efectivo verificado hace
  // falta VERIFY exitoso (SIGNER_READY): DNS, TLS, 403 sin clave, acceso con
  // clave y huellas VPS = Zolvi = DteCredential.
  const managedVerified = !signer.exists || signer.status === "SIGNER_READY";
  add({
    code: "SIGNER_CREDENTIAL", label: "Firmador efectivo propio (URL + API Key del emisor)",
    status: ownSigner && signerHostMatches && managedVerified ? "done" : "blocked",
    detail: collisions.length ? "La API Key del firmador coincide con otra contraseña (secretos confundidos)."
      : runtime.effectiveSignerSource === "GLOBAL_ENV" ? "Se resolvería el firmador GLOBAL del proceso (posible otro cliente)."
      : !cred?.has_signer_api_key ? "Falta signerApiKey propia."
      : !signerHostMatches ? `DteCredential apunta a ${cred?.signer_host ?? "—"}, no a ${signer.hostname}.`
      : !managedVerified ? `Firmador en ${signer.status}: ejecute VERIFY (verificación remota real) tras registrar la credencial.` : undefined,
  });

  if (!isProd) {
    const since = runtime.acceptedSince ?? null;
    add({
      code: "MH_TEST_ACCEPTED", label: "DTE TEST aceptado por Hacienda",
      status: runtime.acceptedCount > 0 ? "done" : "pending",
      detail: runtime.acceptedCount > 0
        ? `${runtime.acceptedCount} DTE ACCEPTED en TEST${since ? " desde el registro de la credencial del firmador" : ""}.`
        : since
          ? "Ningún DTE TEST aceptado desde que se registró este firmador: emita y transmita uno de prueba (acción manual autorizada)."
          : "Emita y transmita un DTE de prueba (acción manual autorizada).",
    });
  }

  // MariaDB opcional
  const mdbStatus: OnboardingStepStatus = !mariadb.configured ? "optional"
    : !mariadb.is_active ? "optional"
    : mariadb.last_test_status === "SUCCESS" ? (deliveryJobs.uncertain > 0 ? "warning" : "done")
    : "blocked";
  add({
    code: "MARIADB", label: "Entrega MariaDB (opcional)",
    status: mdbStatus,
    detail: !mariadb.configured ? "NOT_CONFIGURED — no bloquea la emisión."
      : !mariadb.is_active ? "Configurada pero deshabilitada."
      : mariadb.last_test_status !== "SUCCESS" ? `Habilitada sin prueba exitosa (${mariadb.last_test_status}).`
      : deliveryJobs.uncertain > 0 ? `${deliveryJobs.uncertain} entrega(s) con resultado incierto requieren conciliación.` : `${mariadb.database}.${mariadb.table}${mariadb.auto_delivery_enabled ? " · automática" : " · manual"}`,
  });

  if (isProd) {
    const pf = runtime.preflight;
    // El preflight trata un health check fallido como "warning"; para
    // READY_PROD el firmador PRODUCTION debe haber respondido de verdad.
    const reach = pf?.checks.find((c) => c.code === "SIGNER_REACHABLE");
    const unreachable = !!pf && pf.status !== "BLOCKED" && reach?.status !== "ok";
    add({
      code: "PROD_PREFLIGHT", label: "Preflight PRODUCTION (firmador efectivo, credenciales, aislamiento)",
      status: !pf ? "pending" : pf.status === "BLOCKED" || unreachable ? "blocked" : "done",
      detail: !pf ? "Ejecute 'Verificar PRODUCCIÓN' (no firma ni transmite)."
        : pf.status === "BLOCKED" ? pf.checks.filter((c) => c.status === "blocked").map((c) => `${c.label}: ${c.detail ?? "bloqueado"}`).join(" · ")
        : unreachable ? `Firmador PRODUCTION no verificado como accesible: ${reach?.detail ?? "sin health check"}.`
        : `Preflight ${pf.status}.`,
    });
    add({
      code: "MH_PROD_AUTHORIZATION", label: "Autorización productiva de Hacienda (atestada)",
      status: signer.mh_authorization_confirmed_at ? "done" : "blocked",
      detail: signer.mh_authorization_confirmed_at ? `Ref: ${signer.mh_authorization_reference ?? "—"}` : "No automatizable: requiere autorización MH y atestación de un super_admin.",
    });
  }

  const mandatory = steps.filter((s) => s.status !== "optional");
  const allMandatoryDone = mandatory.every((s) => s.status === "done" || s.status === "warning");
  const done = (code: string) => steps.find((s) => s.code === code)?.status === "done";

  let state: FiscalOnboardingState = "DRAFT";
  if (done("ORG_TENANT") && done("RUNTIME_REACHABLE")) state = "VALIDATING";
  if (state === "VALIDATING" && done("ISSUER_CONFIG") && done("SIGNER_INFRA")) state = "INFRA_READY";
  if (state === "INFRA_READY" && done("MH_CREDENTIALS") && done("SIGNER_CREDENTIAL")) state = "SIGNER_READY";
  if (!isProd && state === "SIGNER_READY" && done("MH_TEST_ACCEPTED")) state = "MH_TEST_ACCEPTED";
  if (!isProd && state === "MH_TEST_ACCEPTED" && mdbStatus === "done") state = "MARIADB_READY";
  const readyTest = !isProd && allMandatoryDone && (state === "MH_TEST_ACCEPTED" || state === "MARIADB_READY");
  const readyProd = isProd && allMandatoryDone && state === "SIGNER_READY";
  if (readyTest) state = "READY_TEST";
  if (readyProd) state = "READY_PROD";

  const blockers = steps.filter((s) => s.status === "blocked").map((s) => `${s.label}: ${s.detail ?? "bloqueado"}`);

  return {
    organizationId, environment, state, readyTest, readyProd,
    canActivate: isProd ? readyProd : (state === "SIGNER_READY" || state === "MH_TEST_ACCEPTED" || state === "MARIADB_READY" || readyTest),
    steps, blockers, signer, mariadb, deliveryJobs, runtime,
  };
}
