// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-run.types.ts
//
// DTE-MH-TEST-RUNS — tipos del Control Plane para las corridas de pruebas
// de Hacienda (solo ambiente TEST) del onboarding fiscal.
// ─────────────────────────────────────────────────────────────────

import type {
  MhTestContingencySettings,
  MhTestDteTypeCode,
  MhTestReceptors,
  MhTestResponsible,
  MhTestScenarioCode,
} from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";

export interface MhTestRunPlanBlock {
  dteTypeCode:   MhTestDteTypeCode;
  firstSequence: number;
  scenarios:     Array<{ scenarioCode: MhTestScenarioCode; count: number }>;
}

/** MH20 (Fase 8): segmento de una cadena de corridas (límite de 200 ítems). */
export interface MhTestRunChainRef {
  chainId: string;
  index:   number;
  total:   number;
}

export interface MhTestRunPlan {
  /** 1 = histórico (implica MH_1_2). 2 = perfil normativo explícito y cadena opcional. */
  version:       1 | 2;
  /** Perfil normativo de la corrida; estable aunque el emisor cambie después. Ausente → MH_1_2. */
  specProfile?:  "MH_1_2" | "MH_2_0";
  chain?:        MhTestRunChainRef | null;
  blocks:        MhTestRunPlanBlock[];
  invalidations: Array<{ targetScenarioCode: MhTestScenarioCode; count: number }>;
  receptors:     MhTestReceptors;
  responsible:   MhTestResponsible | null;
  contingency:   MhTestContingencySettings | null;
}

/** Estados de la corrida. Activos = QUEUED | RUNNING | PAUSED | NEEDS_REVIEW (índice único parcial). */
export type MhTestRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "NEEDS_REVIEW"
  | "COMPLETED"
  | "COMPLETED_WITH_FAILURES"
  | "CANCELLED";

export const MH_TEST_RUN_ACTIVE_STATUSES: readonly MhTestRunStatus[] = ["QUEUED", "RUNNING", "PAUSED", "NEEDS_REVIEW"];
/** Estados que el tick procesa automáticamente. */
export const MH_TEST_RUN_PROCESSABLE_STATUSES: readonly MhTestRunStatus[] = ["QUEUED", "RUNNING"];

export type MhTestRunItemKind = "DTE" | "INVALIDATION" | "CONTINGENCY_EVENT";

/**
 * Pasos de un ítem.
 *   DTE:               PLANNED → MATERIALIZED → GENERATED → VALIDATED → SIGNED → TRANSMITTING → ACCEPTED|OBSERVED|REJECTED
 *   INVALIDATION:      PLANNED → EVENT_CREATED → EVENT_SIGNED → TRANSMITTING → ACCEPTED|REJECTED
 *   CONTINGENCY_EVENT: PLANNED → EVENT_CREATED → EVENT_BUILT → EVENT_SIGNED → TRANSMITTING → ACCEPTED|REJECTED
 * Transversales: UNCERTAIN (transmisión con resultado desconocido; solo
 * consulta, nunca retransmite), NEEDS_REVIEW (decisión del operador),
 * FAILED (error de negocio previo al envío), SKIPPED (dependencia no
 * cumplida), ABANDONED (decisión del operador).
 */
export type MhTestRunItemStep =
  | "PLANNED"
  | "MATERIALIZED"
  | "GENERATED"
  | "VALIDATED"
  | "SIGNED"
  | "EVENT_CREATED"
  | "EVENT_BUILT"
  | "EVENT_SIGNED"
  | "TRANSMITTING"
  | "UNCERTAIN"
  | "ACCEPTED"
  | "OBSERVED"
  | "REJECTED"
  | "NEEDS_REVIEW"
  | "FAILED"
  | "SKIPPED"
  | "ABANDONED";

export const MH_TEST_ITEM_TERMINAL_STEPS: readonly MhTestRunItemStep[] = ["ACCEPTED", "OBSERVED", "REJECTED", "SKIPPED", "ABANDONED"];
export const MH_TEST_ITEM_SUCCESS_STEPS: readonly MhTestRunItemStep[] = ["ACCEPTED", "OBSERVED"];
/** Pasos que requieren al operador (no avanzan solos). */
export const MH_TEST_ITEM_REVIEW_STEPS: readonly MhTestRunItemStep[] = ["NEEDS_REVIEW", "FAILED"];

export type MhTestOperatorDecision = "RETRANSMIT_SAME" | "RETRY_STEP" | "ABANDON";

export interface MhTestRunItemRecord {
  id:                            string;
  run_id:                        string;
  seq:                           number;
  kind:                          MhTestRunItemKind;
  dte_type_code:                 string | null;
  scenario_code:                 string;
  depends_on_item_id:            string | null;
  planned_sequence:              number | null;
  control_number:                string | null;
  generation_code:               string | null;
  runtime_dte_document_id:       string | null;
  runtime_invalidation_event_id: string | null;
  runtime_contingency_event_id:  string | null;
  step:                          MhTestRunItemStep;
  claim_epoch:                   number | null;
  attempts:                      number;
  query_attempts:                number;
  mh_estado:                     string | null;
  mh_codigo_msg:                 string | null;
  mh_descripcion:                string | null;
  reception_stamp:               string | null;
  last_error_code:               string | null;
  last_error_message:            string | null;
  operator_decision:             string | null;
}

export interface MhTestRunRecord {
  id:               string;
  organization_id:  string;
  tenant_id:        string;
  location_id:      string;
  issuer_config_id: string;
  environment:      string;
  status:           MhTestRunStatus;
  plan:             MhTestRunPlan;
  authorized_by:    string | null;
  lease_owner:      string | null;
  lease_epoch:      number;
  lease_expires_at: Date | null;
  last_error:       string | null;
  items:            MhTestRunItemRecord[];
}

/** Ítem planificado (salida pura del planner, antes de persistir). */
export interface PlannedMhTestItem {
  seq:             number;
  kind:            MhTestRunItemKind;
  dteTypeCode:     MhTestDteTypeCode | null;
  scenarioCode:    string;
  plannedSequence: number | null;
  dependsOnSeq:    number | null;
}

export interface PlannedMhTestRange {
  dteTypeCode: MhTestDteTypeCode;
  first:       number;
  last:        number;
  count:       number;
}
