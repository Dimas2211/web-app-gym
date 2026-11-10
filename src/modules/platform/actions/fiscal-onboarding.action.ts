"use server";

// ─────────────────────────────────────────────────────────────────
// platform — fiscal-onboarding.action.ts
//
// FISCAL-ONBOARDING — acciones del flujo Cliente -> Configuración fiscal
// -> Firmador -> MariaDB opcional -> Verificaciones -> Activación.
//
// Reglas:
//   - Todas exigen super_admin (requireSuperAdmin) y re-validan en servidor.
//   - organizationId llega del panel de la organización, pero cada
//     operación vuelve a resolver tenant/runtime desde Control Plane.
//   - Nunca devuelven secretos (API Key, contraseñas, JWS, payloads).
//   - APPLY/ROLLBACK/activación exigen confirmación textual exacta.
//   - No transmiten a Hacienda ni firman documentos.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import {
  getFiscalOnboardingStatus,
  type FiscalOnboardingStatus,
} from "../dte-onboarding/fiscal-onboarding-status.service";
import {
  upsertSignerProvisioningSpec,
  runSignerProvisioning,
  registerSignerCredentialForProvisioning,
  confirmMhProductionAuthorization,
  type FiscalEnvironment,
  type SignerProvisioningMode,
  type SignerProvisioningRunResult,
  type UpsertSignerSpecInput,
} from "../dte-onboarding/signer-provisioning.service";
import {
  upsertDteMariaDbIntegration,
  testDteMariaDbIntegration,
  setDteMariaDbIntegrationFlags,
} from "../dte-onboarding/dte-mariadb-integration.service";
import { processDueExternalDeliveryJobs, type ProcessDueJobsSummary } from "@/modules/commerce/dte/outbox/external-delivery-processor.service";
import { getExternalDeliveryLedger } from "@/modules/commerce/dte/outbox/external-delivery-ledger";
import type { ReconcileDecision } from "@/modules/commerce/dte/outbox/external-delivery-ledger.types";

type Simple = { ok: true; message?: string } | { ok: false; error: string };

function assertEnv(env: string): FiscalEnvironment {
  if (env !== "TEST" && env !== "PRODUCTION") throw new Error("Ambiente inválido.");
  return env;
}

async function assertOrganization(organizationId: string): Promise<boolean> {
  if (!organizationId || typeof organizationId !== "string") return false;
  const org = await controlPlanePrisma.platformOrganization.findUnique({ where: { id: organizationId }, select: { id: true } });
  return !!org;
}

function revalidateOrg(organizationId: string) {
  revalidatePath(`/dashboard/platform/organizations/${organizationId}`);
}

// ── Estado ─────────────────────────────────────────────────────────

export async function getFiscalOnboardingStatusAction(
  organizationId: string,
  environment: string,
  probe = false,
): Promise<{ ok: true; status: FiscalOnboardingStatus } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const status = await getFiscalOnboardingStatus(organizationId, assertEnv(environment), { probe });
  // Nunca exponer el preflight completo con detalles técnicos innecesarios: los checks ya están sanitizados.
  return { ok: true, status };
}

// ── Firmador ───────────────────────────────────────────────────────

export async function saveSignerSpecAction(
  organizationId: string,
  environment: string,
  input: UpsertSignerSpecInput,
): Promise<Simple> {
  const user = await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const res = await upsertSignerProvisioningSpec(organizationId, assertEnv(environment), {
    slug:           String(input.slug ?? "").trim().toLowerCase(),
    hostname:       String(input.hostname ?? "").trim().toLowerCase(),
    cpanelUser:     String(input.cpanelUser ?? "").trim(),
    signerNit:      String(input.signerNit ?? "").replace(/\D/g, ""),
    issuerConfigId: input.issuerConfigId ? String(input.issuerConfigId).trim() : null,
    fiscalProfile:  input.fiscalProfile ? String(input.fiscalProfile).trim().slice(0, 60) : null,
    preferredPort:  input.preferredPort ? Number(input.preferredPort) : null,
  }, user.id);
  revalidateOrg(organizationId);
  return res.ok ? { ok: true, message: `Especificación guardada (puerto ${res.port}, contenedor ${res.containerName}).` } : { ok: false, error: res.error };
}

export async function runSignerProvisioningAction(
  organizationId: string,
  environment: string,
  mode: SignerProvisioningMode,
  options: { confirm?: string; rollbackRunId?: string } = {},
): Promise<SignerProvisioningRunResult> {
  const user = await requireSuperAdmin();
  if (!["INSPECT", "PLAN", "APPLY", "VERIFY", "ROLLBACK"].includes(mode)) {
    return { ok: false, mode, runId: null, status: null, error: "Modo inválido." };
  }
  if (!(await assertOrganization(organizationId))) return { ok: false, mode, runId: null, status: null, error: "Organización no encontrada." };
  const res = await runSignerProvisioning({
    organizationId, environment: assertEnv(environment), mode, userId: user.id,
    confirm: options.confirm, rollbackRunId: options.rollbackRunId,
  });
  revalidateOrg(organizationId);
  return res;
}

export async function registerSignerCredentialAction(organizationId: string, environment: string): Promise<Simple> {
  const user = await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const res = await registerSignerCredentialForProvisioning(organizationId, assertEnv(environment), user.id);
  revalidateOrg(organizationId);
  return res.ok ? { ok: true, message: "URL y API Key del firmador registradas en la credencial del emisor." } : { ok: false, error: res.error };
}

export async function confirmMhAuthorizationAction(organizationId: string, reference: string): Promise<Simple> {
  const user = await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const res = await confirmMhProductionAuthorization(organizationId, String(reference ?? ""), user.id);
  revalidateOrg(organizationId);
  return res.ok ? { ok: true, message: "Autorización MH PRODUCTION atestada." } : res;
}

// ── MariaDB ────────────────────────────────────────────────────────

export async function saveMariaDbIntegrationAction(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<Simple & { fieldErrors?: Record<string, string[]> }> {
  const user = await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const res = await upsertDteMariaDbIntegration(organizationId, input, user.id);
  revalidateOrg(organizationId);
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, message: res.created ? "Integración creada (inactiva hasta probar y habilitar)." : "Integración actualizada." };
}

export async function testMariaDbIntegrationAction(organizationId: string): Promise<Simple> {
  await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const res = await testDteMariaDbIntegration(organizationId);
  revalidateOrg(organizationId);
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.message };
}

export async function setMariaDbFlagsAction(
  organizationId: string,
  flags: { is_active?: boolean; auto_delivery_enabled?: boolean },
): Promise<Simple> {
  const user = await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const res = await setDteMariaDbIntegrationFlags(organizationId, {
    ...(typeof flags.is_active === "boolean" ? { is_active: flags.is_active } : {}),
    ...(typeof flags.auto_delivery_enabled === "boolean" ? { auto_delivery_enabled: flags.auto_delivery_enabled } : {}),
  }, user.id);
  revalidateOrg(organizationId);
  return res.ok ? { ok: true } : res;
}

export interface DeliveryJobRow {
  id: string; environment: string; dte_document_id: string; generation_code: string | null;
  status: string; trigger: string; attempts: number; target_table: string | null;
  last_error_code: string | null; last_error_message: string | null; updated_at: Date;
}

export async function listDeliveryJobsAction(organizationId: string): Promise<DeliveryJobRow[]> {
  await requireSuperAdmin();
  return controlPlanePrisma.platformDteExternalDeliveryJob.findMany({
    where:   { organization_id: organizationId },
    orderBy: { updated_at: "desc" },
    take:    20,
    select:  {
      id: true, environment: true, dte_document_id: true, generation_code: true, status: true, trigger: true,
      attempts: true, target_table: true, last_error_code: true, last_error_message: true, updated_at: true,
    },
  });
}

export async function processDeliveryOutboxAction(organizationId: string): Promise<{ ok: true; summary: ProcessDueJobsSummary } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const summary = await processDueExternalDeliveryJobs({ organizationId, limit: 10 });
  revalidateOrg(organizationId);
  return { ok: true, summary };
}

export async function reconcileDeliveryJobAction(
  organizationId: string,
  jobId: string,
  decision: ReconcileDecision,
  note: string,
): Promise<Simple> {
  const user = await requireSuperAdmin();
  if (!["CONFIRMED_DELIVERED", "CONFIRMED_NOT_DELIVERED", "CANCEL"].includes(decision)) return { ok: false, error: "Decisión inválida." };
  if (String(note ?? "").trim().length < 10) return { ok: false, error: "Describa la evidencia del receptor (mínimo 10 caracteres)." };
  const job = await controlPlanePrisma.platformDteExternalDeliveryJob.findFirst({ where: { id: jobId, organization_id: organizationId }, select: { id: true } });
  if (!job) return { ok: false, error: "La entrega no pertenece a esta organización." };
  const res = await getExternalDeliveryLedger().reconcile(jobId, decision, user.id, String(note).trim(), new Date());
  revalidateOrg(organizationId);
  return res ? { ok: true, message: `Entrega conciliada: ${res.status}.` } : { ok: false, error: "El estado actual de la entrega no permite esa conciliación." };
}

// ── Activación ─────────────────────────────────────────────────────

export async function activateFiscalEnvironmentAction(
  organizationId: string,
  environment: string,
  confirm: string,
): Promise<Simple> {
  const user = await requireSuperAdmin();
  if (!(await assertOrganization(organizationId))) return { ok: false, error: "Organización no encontrada." };
  const env = assertEnv(environment);
  const expected = env === "PRODUCTION" ? "PRODUCCION" : "ACTIVAR TEST";
  if (confirm !== expected) return { ok: false, error: `Confirmación exacta requerida: "${expected}".` };

  const status = await getFiscalOnboardingStatus(organizationId, env, { probe: env === "PRODUCTION" });
  if (!status.canActivate || !status.runtime.issuer) {
    return { ok: false, error: `No corresponde activar ${env}: ${status.blockers.join(" · ") || status.state}` };
  }

  const org = await controlPlanePrisma.platformOrganization.findUnique({ where: { id: organizationId }, select: { tenant_id: true } });
  const tenantId = org?.tenant_id;
  if (!tenantId) return { ok: false, error: "Organización sin tenant." };
  const issuer = status.runtime.issuer;

  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  const { switchActiveDteEnvironment } = await import("@/modules/commerce/dte/services/dte-issuer-config.service");
  const res = await withOrganizationRuntimePrisma(organizationId, async (client) => {
    const actor = await client.user.findFirst({ where: { id: user.id, tenant_id: tenantId }, select: { id: true } });
    if (!actor) {
      return { ok: false as const, error: "Su usuario no existe en el runtime del cliente; active desde 'Operar como cliente' → Configuración DTE (mismo preflight)." };
    }
    // switchActiveDteEnvironment vuelve a ejecutar el preflight PRODUCTION (defensa en profundidad).
    return switchActiveDteEnvironment({ tenant_id: tenantId, location_id: issuer.location_id, target_issuer_config_id: issuer.id, user_id: actor.id }, client);
  });
  revalidateOrg(organizationId);
  return res.ok ? { ok: true, message: `Ambiente ${env} activo para el emisor.` } : { ok: false, error: res.error };
}
