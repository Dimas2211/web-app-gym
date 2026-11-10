// ─────────────────────────────────────────────────────────────────
// commerce/dte/outbox — external-delivery-ledger.types.ts
//
// FISCAL-ONBOARDING — contrato del ledger (outbox) de entregas MariaDB.
// Sin dependencias de Prisma para que las reglas sean testeables con la
// implementación en memoria y la implementación Prisma (Control Plane).
// ─────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

export type ExternalDeliveryJobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "FAILED_RETRYABLE"
  | "UNCERTAIN"
  | "RECONCILED_DELIVERED"
  | "CANCELLED";

export type ExternalDeliveryTrigger = "AUTO" | "MANUAL";

export interface ExternalDeliveryJob {
  id:               string;
  organization_id:  string;
  tenant_id:        string;
  location_id:      string;
  environment:      string;
  document_kind:    string;
  dte_document_id:  string;
  generation_code:  string | null;
  idempotency_key:  string;
  integration_id:   string | null;
  target_host:      string | null;
  target_database:  string | null;
  target_table:     string | null;
  status:           ExternalDeliveryJobStatus;
  trigger:          string;
  attempts:         number;
  max_attempts:     number;
  next_attempt_at:  Date | null;
  lease_owner:      string | null;
  lease_expires_at: Date | null;
  last_error_code:    string | null;
  last_error_message: string | null;
  insert_id:          string | null;
  affected_rows:      number | null;
  delivered_at:       Date | null;
  reconciled_by:       string | null;
  reconciled_at:       Date | null;
  reconciliation_note: string | null;
}

export interface EnsureExternalDeliveryJobInput {
  organizationId:  string;
  tenantId:        string;
  locationId:      string;
  environment:     string;
  dteDocumentId:   string;
  generationCode?: string | null;
  trigger:         ExternalDeliveryTrigger;
  userId?:         string | null;
  destination: {
    integrationId?: string | null;
    host:           string;
    database:       string;
    table:          string;
  };
}

export interface ClaimOptions {
  owner:   string;
  leaseMs: number;
  now:     Date;
  /** Manual (admin) ignora backoff y tope de intentos automáticos; nunca reclama UNCERTAIN/IN_PROGRESS. */
  manual:  boolean;
}

export type ReconcileDecision =
  /** El receptor confirmó que el documento está persistido -> no reenviar nunca. */
  | "CONFIRMED_DELIVERED"
  /** El receptor confirmó que NO existe -> vuelve a PENDING para un único reenvío controlado. */
  | "CONFIRMED_NOT_DELIVERED"
  /** Se descarta la entrega (p.ej. organización desactiva el servicio). */
  | "CANCEL";

export interface ExternalDeliveryLedger {
  /** Crea (o devuelve) la fila única por org+ambiente+documento. Nunca duplica. */
  ensureJob(input: EnsureExternalDeliveryJobInput): Promise<ExternalDeliveryJob>;
  /** Subconjunto de dteDocumentIds que ya tienen fila (cualquier estado) para la organización. */
  listKnownDocumentIds(organizationId: string, dteDocumentIds: string[]): Promise<Set<string>>;
  get(jobId: string): Promise<ExternalDeliveryJob | null>;
  /** Reclamo atómico. null si otro proceso la tiene o su estado no permite envío. */
  claim(jobId: string, opts: ClaimOptions): Promise<ExternalDeliveryJob | null>;
  markDelivered(jobId: string, owner: string, data: { insertId: string | null; affectedRows: number; note?: string | null; now: Date }): Promise<boolean>;
  markFailedRetryable(jobId: string, owner: string, data: { code: string; message: string; nextAttemptAt: Date | null; now: Date }): Promise<boolean>;
  markUncertain(jobId: string, owner: string, data: { code: string; message: string; now: Date }): Promise<boolean>;
  /** Fila marcada como entregada por evidencia previa (log EXTERNAL_DELIVERY ok=true anterior al ledger). */
  markDeliveredFromLegacyEvidence(jobId: string, note: string, now: Date): Promise<boolean>;
  markUncertainFromLegacyEvidence(jobId: string, note: string, now: Date): Promise<boolean>;
  /** IN_PROGRESS con lease vencido -> UNCERTAIN (el proceso pudo morir después del INSERT). */
  expireStaleLeases(now: Date): Promise<number>;
  listDue(now: Date, limit: number, organizationId?: string): Promise<ExternalDeliveryJob[]>;
  reconcile(jobId: string, decision: ReconcileDecision, userId: string, note: string, now: Date): Promise<ExternalDeliveryJob | null>;
}

// ── Reglas compartidas por ambas implementaciones ────────────────────

export const CLAIMABLE_STATUSES: ExternalDeliveryJobStatus[] = ["PENDING", "FAILED_RETRYABLE"];
export const TERMINAL_DELIVERED_STATUSES: ExternalDeliveryJobStatus[] = ["DELIVERED", "RECONCILED_DELIVERED"];

/** Identificador estable por documento, organización y ambiente. */
export function buildExternalDeliveryIdempotencyKey(input: {
  organizationId: string;
  environment:    string;
  documentKind:   string;
  dteDocumentId:  string;
}): string {
  const raw = [input.organizationId, input.environment, input.documentKind, input.dteDocumentId].join("|");
  return `dte-ext:${createHash("sha256").update(raw).digest("hex")}`;
}

/** Backoff exponencial acotado: 1, 2, 4, 8 … min, máx 60 min. */
export function computeNextAttemptAt(now: Date, attempts: number): Date {
  const minutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

export function isClaimable(job: ExternalDeliveryJob, opts: Pick<ClaimOptions, "now" | "manual">): boolean {
  if (!CLAIMABLE_STATUSES.includes(job.status)) return false;
  if (opts.manual) return true;
  if (job.attempts >= job.max_attempts) return false;
  if (job.next_attempt_at && job.next_attempt_at.getTime() > opts.now.getTime()) return false;
  return true;
}
