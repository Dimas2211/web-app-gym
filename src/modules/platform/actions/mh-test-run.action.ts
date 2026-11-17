"use server";

// ─────────────────────────────────────────────────────────────────
// platform/actions — mh-test-run.action.ts
//
// DTE-MH-TEST-RUNS — acciones del Control Plane (Organización → Onboarding
// fiscal → Pruebas de Hacienda).
//
//   - Solo Platform Admin (requireSuperAdmin: auth_scope PLATFORM). Una
//     sesión RUNTIME_CLIENT nunca llega aquí.
//   - Escrituras bloqueadas en modo "operar como cliente" de solo lectura.
//   - Ambiente forzado TEST: no existe parámetro de ambiente; PRODUCTION
//     es imposible por construcción (y por CHECK en ambas bases).
//   - Flag DTE_MH_TEST_RUNS_ENABLED requerido para crear/avanzar/decidir.
//   - Escenarios y receptores se validan (perfiles + catálogos + dry-run
//     contra schema oficial) ANTES de reservar correlativos.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { isMhTestRunsEnabled, MH_TEST_RUN_CONFIRM_TEXT, MH_TEST_RUNS_DISABLED_MESSAGE } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.flags";
import { planMhTestRun } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.planner";
import { createPrismaMhTestRunRepository } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.repository";
import { planOperatorDecision } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.service";
import { advanceMhTestRun } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.engine";
import { createRuntimeMhTestPort, runMhTestPreflight } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.runtime-port";
import type { MhTestOperatorDecision, MhTestRunRecord, MhTestRunStatus, PlannedMhTestRange } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.types";
import { MH_TEST_DTE_TYPE_CODES, MH_TEST_SCENARIOS, type MhTestDteTypeCode } from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";

type Simple = { ok: true; message?: string } | { ok: false; error: string };

async function orgTenant(organizationId: string): Promise<string | null> {
  if (!organizationId || typeof organizationId !== "string") return null;
  const org = await controlPlanePrisma.platformOrganization.findUnique({ where: { id: organizationId }, select: { tenant_id: true } });
  return org?.tenant_id ?? null;
}

function revalidateOrg(organizationId: string) {
  revalidatePath(`/dashboard/platform/organizations/${organizationId}`);
}

async function writeGuard(): Promise<string | null> {
  if (await isRuntimeReadOnlyActive()) return RUNTIME_READONLY_MESSAGE;
  if (!isMhTestRunsEnabled()) return MH_TEST_RUNS_DISABLED_MESSAGE;
  return null;
}

/** Emisor TEST del tenant (mismo criterio que el diagnóstico del onboarding). */
async function resolveTestIssuer(client: import("@prisma/client").PrismaClient, tenantId: string) {
  return client.dteIssuerConfig.findFirst({
    where:   { tenant_id: tenantId, environment: "TEST" },
    orderBy: [{ is_active: "desc" }, { created_at: "asc" }],
    select:  { id: true, location_id: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
}

// ── Panel ─────────────────────────────────────────────────────────

export interface MhTestRunPanelData {
  enabled:     boolean;
  issuer:      { id: string; location_id: string } | null;
  nextByType:  Partial<Record<MhTestDteTypeCode, number>>;
  scenarios:   Array<{ code: string; dteTypeCode: string; label: string }>;
  runs:        Array<{
    id: string; status: MhTestRunStatus; created_at: string; last_error: string | null;
    items: Array<{ id: string; seq: number; kind: string; scenario_code: string; dte_type_code: string | null; control_number: string | null;
      step: string; mh_estado: string | null; reception_stamp: string | null; last_error_code: string | null; last_error_message: string | null;
      attempts: number; query_attempts: number }>;
  }>;
  error?: string;
}

export async function getMhTestRunPanelAction(organizationId: string): Promise<MhTestRunPanelData> {
  await requireSuperAdmin();
  const enabled = isMhTestRunsEnabled();
  const scenarios = Object.entries(MH_TEST_SCENARIOS).map(([code, s]) => ({ code, dteTypeCode: s.dteTypeCode, label: s.label }));
  const empty: MhTestRunPanelData = { enabled, issuer: null, nextByType: {}, scenarios, runs: [] };
  const tenantId = await orgTenant(organizationId);
  if (!tenantId) return { ...empty, error: "Organización sin tenant." };

  const rows = await controlPlanePrisma.platformDteMhTestRun.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    take: 5,
    include: { items: { orderBy: { seq: "asc" } } },
  });
  const runs = rows.map((r) => ({
    id: r.id, status: r.status as MhTestRunStatus, created_at: r.created_at.toISOString(), last_error: r.last_error,
    items: r.items.map((i) => ({
      id: i.id, seq: i.seq, kind: i.kind, scenario_code: i.scenario_code, dte_type_code: i.dte_type_code, control_number: i.control_number,
      step: i.step, mh_estado: i.mh_estado, reception_stamp: i.reception_stamp, last_error_code: i.last_error_code,
      last_error_message: i.last_error_message, attempts: i.attempts, query_attempts: i.query_attempts,
    })),
  }));

  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  const { getDteCorrelativeStatus } = await import("@/modules/commerce/dte/services/dte-correlative.service");
  try {
    return await withOrganizationRuntimePrisma(organizationId, async (client) => {
      const issuer = await resolveTestIssuer(client, tenantId);
      if (!issuer) return { ...empty, runs, error: "No existe configuración de emisor TEST." };
      const nextByType: MhTestRunPanelData["nextByType"] = {};
      if (issuer.cod_estable_mh && issuer.cod_punto_venta_mh) {
        for (const type of MH_TEST_DTE_TYPE_CODES) {
          const st = await getDteCorrelativeStatus({
            tenant_id: tenantId, location_id: issuer.location_id, issuer_config_id: issuer.id, environment: "TEST",
            dte_type_code: type, cod_estable_mh: issuer.cod_estable_mh, cod_punto_venta_mh: issuer.cod_punto_venta_mh,
          }, client);
          nextByType[type] = st.next_sequence;
        }
      }
      return { ...empty, issuer: { id: issuer.id, location_id: issuer.location_id }, nextByType, runs };
    });
  } catch (err) {
    return { ...empty, runs, error: err instanceof Error ? `Runtime no disponible (${err.name}).` : "Runtime no disponible." };
  }
}

// ── Validación previa (sin escrituras) ────────────────────────────

export type MhTestPreviewResult =
  | { ok: true; ranges: PlannedMhTestRange[]; itemCount: number }
  | { ok: false; errors: string[] };

async function validatePlanAgainstRuntime(organizationId: string, tenantId: string, planInput: unknown, actorId: string) {
  const planned = planMhTestRun(planInput);
  if (!planned.ok) return { ok: false as const, errors: planned.errors };

  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  const { getDteCorrelativeStatus } = await import("@/modules/commerce/dte/services/dte-correlative.service");
  const { loadMhTestIssuer } = await import("@/modules/commerce/dte/mh-test-runs/mh-test-documents.service");
  const { resolveMhTestBuildContext, dryRunMhTestScenarios } = await import("@/modules/commerce/dte/mh-test-runs/mh-test-scenarios");

  return withOrganizationRuntimePrisma(organizationId, async (client) => {
    const issuerRef = await resolveTestIssuer(client, tenantId);
    if (!issuerRef) return { ok: false as const, errors: ["No existe configuración de emisor TEST."] };
    const scope = { organizationId, tenantId, locationId: issuerRef.location_id, issuerConfigId: issuerRef.id, userId: actorId };

    const pre = await runMhTestPreflight(client, scope);
    const issuer = await loadMhTestIssuer(client, scope);
    if (!issuer) return { ok: false as const, errors: ["Emisor TEST no encontrado."] };
    const resolved = await resolveMhTestBuildContext(client, issuer, planned.scenarios, planned.plan.receptors);
    const errors = [...pre.errors, ...(resolved.ok ? [] : resolved.errors)];
    if (resolved.ok) errors.push(...dryRunMhTestScenarios(resolved.context, planned.scenarios, planned.plan.contingency, new Date()));

    // Rango visible vs. siguiente correlativo disponible (la reserva en bloque
    // vuelve a verificarlo bajo lock: esto es solo un aviso temprano).
    for (const r of planned.ranges) {
      const st = await getDteCorrelativeStatus({
        tenant_id: tenantId, location_id: issuer.location_id, issuer_config_id: issuer.id, environment: "TEST",
        dte_type_code: r.dteTypeCode, cod_estable_mh: issuer.cod_estable_mh!, cod_punto_venta_mh: issuer.cod_punto_venta_mh!,
      }, client);
      if (r.first < st.next_sequence) errors.push(`Tipo ${r.dteTypeCode}: el primer correlativo ${r.first} ya fue usado; siguiente disponible ${st.next_sequence}.`);
    }
    if (errors.length > 0) return { ok: false as const, errors };
    return { ok: true as const, planned, scope };
  });
}

export async function previewMhTestRunAction(organizationId: string, planInput: unknown): Promise<MhTestPreviewResult> {
  const user = await requireSuperAdmin();
  const tenantId = await orgTenant(organizationId);
  if (!tenantId) return { ok: false, errors: ["Organización no encontrada o sin tenant."] };
  try {
    const v = await validatePlanAgainstRuntime(organizationId, tenantId, planInput, user.id);
    return v.ok ? { ok: true, ranges: v.planned.ranges, itemCount: v.planned.items.length } : { ok: false, errors: v.errors };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? `Runtime no disponible (${err.name}).` : "Runtime no disponible."] };
  }
}

// ── Crear corrida ─────────────────────────────────────────────────

export async function createMhTestRunAction(organizationId: string, planInput: unknown, confirm: string): Promise<Simple & { runId?: string }> {
  const user = await requireSuperAdmin();
  const guard = await writeGuard();
  if (guard) return { ok: false, error: guard };
  if (confirm !== MH_TEST_RUN_CONFIRM_TEXT) return { ok: false, error: `Confirmación exacta requerida: "${MH_TEST_RUN_CONFIRM_TEXT}".` };
  const tenantId = await orgTenant(organizationId);
  if (!tenantId) return { ok: false, error: "Organización no encontrada o sin tenant." };

  let v: Awaited<ReturnType<typeof validatePlanAgainstRuntime>>;
  try {
    v = await validatePlanAgainstRuntime(organizationId, tenantId, planInput, user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Runtime no disponible (${err.name}).` : "Runtime no disponible." };
  }
  if (!v.ok) return { ok: false, error: v.errors.join(" · ") };

  const repo = createPrismaMhTestRunRepository(controlPlanePrisma);
  const created = await repo.createRun({
    organization_id: organizationId, tenant_id: tenantId, location_id: v.scope.locationId, issuer_config_id: v.scope.issuerConfigId,
    plan: v.planned.plan, items: v.planned.items, created_by: user.id, authorized_by: user.id,
  }, new Date());
  revalidateOrg(organizationId);
  if (!created.ok) return { ok: false, error: "Ya existe una corrida de pruebas activa para esta organización." };
  return { ok: true, runId: created.runId, message: `Corrida creada con ${v.planned.items.length} ítems. La procesará el tick programado.` };
}

// ── Avance manual (mismo motor y lease que el tick) ───────────────

export async function advanceMhTestRunNowAction(organizationId: string, runId: string): Promise<Simple> {
  await requireSuperAdmin();
  const guard = await writeGuard();
  if (guard) return { ok: false, error: guard };
  const run = await controlPlanePrisma.platformDteMhTestRun.findFirst({ where: { id: runId, organization_id: organizationId }, select: { id: true } });
  if (!run) return { ok: false, error: "Corrida no encontrada." };
  const repo = createPrismaMhTestRunRepository(controlPlanePrisma);
  const outcome = await advanceMhTestRun(runId, {
    repo,
    runtime: runtimeFor,
    owner: `manual:${runId}:${Date.now()}`,
  });
  revalidateOrg(organizationId);
  return { ok: true, message: `Resultado: ${outcome.status}${"actions" in outcome ? ` (${outcome.actions} acciones)` : ""}.` };
}

function runtimeFor(run: MhTestRunRecord) {
  return createRuntimeMhTestPort({
    organizationId: run.organization_id, tenantId: run.tenant_id, locationId: run.location_id,
    issuerConfigId: run.issuer_config_id, userId: run.authorized_by ?? "",
  });
}

// ── Decisiones del operador ───────────────────────────────────────

export async function decideMhTestRunItemAction(
  organizationId: string, runId: string, itemId: string, decision: MhTestOperatorDecision, note: string,
): Promise<Simple> {
  const user = await requireSuperAdmin();
  const guard = await writeGuard();
  if (guard) return { ok: false, error: guard };
  if (!["RETRANSMIT_SAME", "RETRY_STEP", "ABANDON"].includes(decision)) return { ok: false, error: "Decisión inválida." };
  if (!note || note.trim().length < 10) return { ok: false, error: "La nota del operador es obligatoria (mínimo 10 caracteres)." };

  const item = await controlPlanePrisma.platformDteMhTestRunItem.findFirst({ where: { id: itemId, run_id: runId, run: { organization_id: organizationId } } });
  if (!item) return { ok: false, error: "Ítem no encontrado." };
  const plan = planOperatorDecision(item as never, decision);
  if (!plan.ok) return { ok: false, error: plan.error };

  const repo = createPrismaMhTestRunRepository(controlPlanePrisma);
  const res = await repo.applyOperatorDecision(runId, itemId, plan.fromSteps, { ...plan.patch, operator_note: note.trim().slice(0, 500), decided_by: user.id }, new Date());
  revalidateOrg(organizationId);
  if (res === "BUSY") return { ok: false, error: "La corrida se está procesando. Intente en unos segundos." };
  if (res !== "OK") return { ok: false, error: "El ítem cambió de estado. Recargue el panel." };
  return { ok: true, message: "Decisión registrada." };
}

export async function setMhTestRunStatusAction(organizationId: string, runId: string, op: "PAUSE" | "RESUME" | "CANCEL", confirm?: string): Promise<Simple> {
  await requireSuperAdmin();
  if (await isRuntimeReadOnlyActive()) return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  // Pausar/cancelar se permite aun con el flag apagado (detener es siempre seguro); reanudar exige el flag.
  if (op === "RESUME" && !isMhTestRunsEnabled()) return { ok: false, error: MH_TEST_RUNS_DISABLED_MESSAGE };
  if (op === "CANCEL" && confirm !== "CANCELAR") return { ok: false, error: 'Confirmación exacta requerida: "CANCELAR".' };
  const run = await controlPlanePrisma.platformDteMhTestRun.findFirst({ where: { id: runId, organization_id: organizationId }, select: { id: true } });
  if (!run) return { ok: false, error: "Corrida no encontrada." };

  const repo = createPrismaMhTestRunRepository(controlPlanePrisma);
  const transitions: Record<typeof op, { from: MhTestRunStatus[]; to: MhTestRunStatus }> = {
    PAUSE:  { from: ["QUEUED", "RUNNING", "NEEDS_REVIEW"], to: "PAUSED" },
    RESUME: { from: ["PAUSED", "NEEDS_REVIEW"], to: "RUNNING" },
    CANCEL: { from: ["QUEUED", "RUNNING", "PAUSED", "NEEDS_REVIEW"], to: "CANCELLED" },
  };
  const t = transitions[op];
  const res = await repo.setRunStatusIfIdle(runId, t.from, t.to, new Date());
  revalidateOrg(organizationId);
  if (res === "BUSY") return { ok: false, error: "La corrida se está procesando. Intente en unos segundos." };
  if (res !== "OK") return { ok: false, error: "Estado de la corrida no permite esta operación." };
  return { ok: true, message: `Corrida ${t.to}.` };
}
