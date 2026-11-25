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
import {
  isMhTestRunsEnabled, isMhTestRunsM4Applied, MH20_TEST_RUNS_BLOCKED_MESSAGE, MH_TEST_RUN_CONFIRM_TEXT,
  MH20_TEST_RUN_CONFIRM_TEXT, evaluateMh20RunGate,
  MH_TEST_RUNS_DISABLED_MESSAGE, MH_TEST_RUNS_M4_REQUIRED_MESSAGE,
} from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.flags";
import {
  buildMhTestQuantityPlan, chainMhTestPlan, listMhTestScenarioReadiness, validateMhTestRunProfileReadiness,
  type MhTestChainSegment, type MhTestDocKind, type MhTestQuantityPlan, type MhTestScenarioReadiness,
} from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-minimums";
import { planMhTestRun } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.planner";
import { createPrismaMhTestRunRepository, type MhTestRunProfileRecord } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.repository";
import { planOperatorDecision } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.service";
import { advanceMhTestRun } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.engine";
import { createRuntimeMhTestPortForRun, runMh20RuntimePreflight, runMhTestPreflight } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.runtime-port";
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
  /** MH20 (Fase 8): readiness por perfil (derivada del registro normativo). */
  readiness:   Record<"MH_1_2" | "MH_2_0", MhTestScenarioReadiness[]>;
  m4Applied:   boolean;
  /** MH20 (Fase 9.0): motivos por los que la ejecución 2.0 está cerrada (vacío = abierta). */
  mh20Gate:    string[];
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
  const readiness = { MH_1_2: listMhTestScenarioReadiness("MH_1_2"), MH_2_0: listMhTestScenarioReadiness("MH_2_0") };
  const empty: MhTestRunPanelData = { enabled, readiness, m4Applied: isMhTestRunsM4Applied(),
    mh20Gate: evaluateMh20RunGate({ organizationId, environment: "TEST", planProfile: "MH_2_0", requireRunProfile: false }), issuer: null, nextByType: {}, scenarios, runs: [] };
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
    // MH20 (Fase 8): perfil de la corrida (v1 → MH_1_2). Con MH_2_0 se valida
    // AT + territorio 2.0 de emisor/receptores y el dry-run usa los builders 2.0.
    const profile = planned.profile;
    const issuerSnapshot = {
      cod_estable_mh: issuer.cod_estable_mh ?? null, cod_punto_venta_mh: issuer.cod_punto_venta_mh ?? null,
      dept_code: issuer.dept_code ?? null, municipality_code: issuer.municipality_code ?? null,
    };
    const resolved = await resolveMhTestBuildContext(client, issuer, planned.scenarios, planned.plan.receptors, profile);
    // MH20 (Fase 9.0): mismas guardias runtime 2.0 que el motor (M1/M1b/M2,
    // schemas, catálogos, códigos AT). El snapshot es el emisor actual.
    const mh20Errors = profile === "MH_2_0"
      ? await runMh20RuntimePreflight(client, { ...scope, runId: "creacion", profile, issuerSnapshot })
      : [];
    const errors = [
      ...pre.errors,
      ...mh20Errors,
      ...validateMhTestRunProfileReadiness({ profile, issuer: issuerSnapshot, receptors: planned.plan.receptors }),
      ...(resolved.ok ? [] : resolved.errors),
    ];
    if (resolved.ok) errors.push(...dryRunMhTestScenarios(resolved.context, planned.scenarios, planned.plan.contingency, new Date(), profile));

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
    return { ok: true as const, planned, scope, issuerSnapshot };
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
  if (confirm !== MH_TEST_RUN_CONFIRM_TEXT && confirm !== MH20_TEST_RUN_CONFIRM_TEXT) {
    return { ok: false, error: `Confirmación exacta requerida: "${MH_TEST_RUN_CONFIRM_TEXT}".` };
  }
  const tenantId = await orgTenant(organizationId);
  if (!tenantId) return { ok: false, error: "Organización no encontrada o sin tenant." };

  let v: Awaited<ReturnType<typeof validatePlanAgainstRuntime>>;
  try {
    v = await validatePlanAgainstRuntime(organizationId, tenantId, planInput, user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Runtime no disponible (${err.name}).` : "Runtime no disponible." };
  }
  if (!v.ok) return { ok: false, error: v.errors.join(" · ") };

  // MH20 (Fase 8): MH_2_0 solo dry-run en esta fase; v2 exige M4; un
  // segmento de cadena > 1 exige el anterior terminado con el mismo perfil.
  const plan = v.planned.plan;
  // MH20 (Fase 9.0): MH_2_0 solo con la puerta del CP abierta (flags +
  // organización autorizada) y la confirmación 2.0 exacta. 1.2 sin cambios.
  if (v.planned.profile === "MH_2_0") {
    const gate = evaluateMh20RunGate({ organizationId, environment: "TEST", planProfile: "MH_2_0", requireRunProfile: false });
    if (gate.length > 0) return { ok: false, error: `${MH20_TEST_RUNS_BLOCKED_MESSAGE} (${gate.join(" · ")})` };
    if (confirm !== MH20_TEST_RUN_CONFIRM_TEXT) return { ok: false, error: `Confirmación exacta requerida para MH 2.0: "${MH20_TEST_RUN_CONFIRM_TEXT}".` };
  } else if (confirm !== MH_TEST_RUN_CONFIRM_TEXT) {
    return { ok: false, error: `Confirmación exacta requerida: "${MH_TEST_RUN_CONFIRM_TEXT}".` };
  }
  if (plan.version === 2 && !isMhTestRunsM4Applied()) return { ok: false, error: MH_TEST_RUNS_M4_REQUIRED_MESSAGE };
  if (plan.chain && plan.chain.index > 1) {
    const prev = await controlPlanePrisma.platformDteMhTestRunProfile.findFirst({
      where:  { organization_id: organizationId, chain_id: plan.chain.chainId, chain_index: plan.chain.index - 1 },
      select: { mh_spec_profile: true, chain_total: true, run: { select: { status: true } } },
    });
    if (!prev) return { ok: false, error: `Cadena: falta la corrida ${plan.chain.index - 1} de ${plan.chain.total}.` };
    if (prev.mh_spec_profile !== v.planned.profile || prev.chain_total !== plan.chain.total) {
      return { ok: false, error: "Cadena: el perfil o el total no coinciden con la corrida anterior." };
    }
    if (!["COMPLETED", "COMPLETED_WITH_FAILURES"].includes(prev.run.status)) {
      return { ok: false, error: `Cadena: la corrida ${plan.chain.index - 1} aún no terminó (${prev.run.status}).` };
    }
  }

  const repo = createPrismaMhTestRunRepository(controlPlanePrisma);
  const created = await repo.createRun({
    organization_id: organizationId, tenant_id: tenantId, location_id: v.scope.locationId, issuer_config_id: v.scope.issuerConfigId,
    plan, items: v.planned.items, created_by: user.id, authorized_by: user.id,
    runProfile: plan.version === 2 ? {
      mh_spec_profile: v.planned.profile,
      chain_id: plan.chain?.chainId ?? null, chain_index: plan.chain?.index ?? null, chain_total: plan.chain?.total ?? null,
      issuer_snapshot: v.issuerSnapshot,
    } : null,
  }, new Date());
  revalidateOrg(organizationId);
  if (!created.ok) {
    return { ok: false, error: created.code === "CHAIN_SEGMENT_EXISTS" ? "Ese segmento de la cadena ya fue creado." : "Ya existe una corrida de pruebas activa para esta organización." };
  }
  return { ok: true, runId: created.runId, message: `Corrida creada con ${v.planned.items.length} ítems. La procesará el tick programado.` };
}

// ── Preset MH 2.0 y cadena (puro, sin escrituras) ─────────────────

export interface MhTestPresetInput {
  profile:             "MH_1_2" | "MH_2_0";
  applicableDocs:      MhTestDocKind[];
  quantities?:         Partial<Record<MhTestDocKind, number>>;
  eventsPerApplicable?: number;
  firstSequenceByType: Partial<Record<MhTestDteTypeCode, number>>;
}

export type MhTestPresetResult =
  | { ok: true; quantities: MhTestQuantityPlan; segments: MhTestChainSegment[] }
  | { ok: false; errors: string[]; quantities?: MhTestQuantityPlan };

export async function previewMhTestPresetAction(input: MhTestPresetInput): Promise<MhTestPresetResult> {
  await requireSuperAdmin();
  const profile = input?.profile === "MH_2_0" ? "MH_2_0" : "MH_1_2";
  const q = buildMhTestQuantityPlan({
    profile, applicableDocs: Array.isArray(input?.applicableDocs) ? input.applicableDocs : [],
    quantities: input?.quantities, eventsPerApplicable: input?.eventsPerApplicable,
  });
  const chain = chainMhTestPlan(q, input?.firstSequenceByType ?? {});
  return chain.ok ? { ok: true, quantities: q, segments: chain.segments } : { ok: false, errors: chain.errors, quantities: q };
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

function runtimeFor(run: MhTestRunRecord, runProfile?: MhTestRunProfileRecord | null) {
  // MH20 (Fase 9.0): mismo constructor que el tick (perfil de la fila M4).
  return createRuntimeMhTestPortForRun(run, runProfile);
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
