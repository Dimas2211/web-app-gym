// ─────────────────────────────────────────────────────────────────
// commerce/dte/outbox — external-delivery-ledger.memory.ts
//
// Implementación en memoria del ledger con la MISMA semántica de reclamo
// condicional que la versión Prisma. Uso: tests y dry-runs locales. Cada
// operación es síncrona dentro de la promesa, por lo que la comparación
// y el cambio de estado son atómicos frente a llamadas concurrentes
// (equivalente al UPDATE ... WHERE status IN (...) de PostgreSQL).
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import {
  buildExternalDeliveryIdempotencyKey,
  CLAIMABLE_STATUSES,
  isClaimable,
  type ClaimOptions,
  type EnsureExternalDeliveryJobInput,
  type ExternalDeliveryJob,
  type ExternalDeliveryLedger,
  type ReconcileDecision,
} from "./external-delivery-ledger.types";

export class InMemoryExternalDeliveryLedger implements ExternalDeliveryLedger {
  readonly rows = new Map<string, ExternalDeliveryJob>();

  private byKey(key: string) {
    for (const r of this.rows.values()) if (r.idempotency_key === key) return r;
    return null;
  }

  async ensureJob(input: EnsureExternalDeliveryJobInput): Promise<ExternalDeliveryJob> {
    const key = buildExternalDeliveryIdempotencyKey({
      organizationId: input.organizationId, environment: input.environment,
      documentKind: "DTE", dteDocumentId: input.dteDocumentId,
    });
    const existing = this.byKey(key);
    if (existing) {
      if (CLAIMABLE_STATUSES.includes(existing.status)) {
        existing.target_host     = input.destination.host;
        existing.target_database = input.destination.database;
        existing.target_table    = input.destination.table;
        existing.integration_id  = input.destination.integrationId ?? null;
      }
      return { ...existing };
    }
    const row: ExternalDeliveryJob = {
      id: randomUUID(), organization_id: input.organizationId, tenant_id: input.tenantId,
      location_id: input.locationId, environment: input.environment, document_kind: "DTE",
      dte_document_id: input.dteDocumentId, generation_code: input.generationCode ?? null,
      idempotency_key: key, integration_id: input.destination.integrationId ?? null,
      target_host: input.destination.host, target_database: input.destination.database,
      target_table: input.destination.table, status: "PENDING", trigger: input.trigger,
      attempts: 0, max_attempts: 5, next_attempt_at: null, lease_owner: null, lease_expires_at: null,
      last_error_code: null, last_error_message: null, insert_id: null, affected_rows: null,
      delivered_at: null, reconciled_by: null, reconciled_at: null, reconciliation_note: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async listKnownDocumentIds(organizationId: string, dteDocumentIds: string[]) {
    const wanted = new Set(dteDocumentIds);
    const known = new Set<string>();
    for (const r of this.rows.values()) {
      if (r.organization_id === organizationId && wanted.has(r.dte_document_id)) known.add(r.dte_document_id);
    }
    return known;
  }

  async get(jobId: string) {
    const r = this.rows.get(jobId);
    return r ? { ...r } : null;
  }

  async claim(jobId: string, opts: ClaimOptions) {
    const r = this.rows.get(jobId);
    if (!r || !isClaimable(r, opts)) return null;
    r.status = "IN_PROGRESS";
    r.lease_owner = opts.owner;
    r.lease_expires_at = new Date(opts.now.getTime() + opts.leaseMs);
    r.attempts += 1;
    return { ...r };
  }

  private owned(jobId: string, owner: string) {
    const r = this.rows.get(jobId);
    return r && r.status === "IN_PROGRESS" && r.lease_owner === owner ? r : null;
  }

  async markDelivered(jobId: string, owner: string, data: { insertId: string | null; affectedRows: number; note?: string | null; now: Date }) {
    const r = this.owned(jobId, owner);
    if (!r) return false;
    Object.assign(r, {
      status: "DELIVERED", delivered_at: data.now, insert_id: data.insertId, affected_rows: data.affectedRows,
      lease_owner: null, lease_expires_at: null, last_error_code: null, last_error_message: data.note ?? null,
    });
    return true;
  }

  async markFailedRetryable(jobId: string, owner: string, data: { code: string; message: string; nextAttemptAt: Date | null; now: Date }) {
    const r = this.owned(jobId, owner);
    if (!r) return false;
    Object.assign(r, {
      status: "FAILED_RETRYABLE", next_attempt_at: data.nextAttemptAt, lease_owner: null, lease_expires_at: null,
      last_error_code: data.code, last_error_message: data.message,
    });
    return true;
  }

  async markUncertain(jobId: string, owner: string, data: { code: string; message: string; now: Date }) {
    const r = this.owned(jobId, owner);
    if (!r) return false;
    Object.assign(r, {
      status: "UNCERTAIN", lease_owner: null, lease_expires_at: null, next_attempt_at: null,
      last_error_code: data.code, last_error_message: data.message,
    });
    return true;
  }

  async markDeliveredFromLegacyEvidence(jobId: string, note: string, now: Date) {
    const r = this.rows.get(jobId);
    if (!r || !CLAIMABLE_STATUSES.includes(r.status)) return false;
    Object.assign(r, { status: "DELIVERED", delivered_at: now, last_error_code: "LEGACY_DELIVERY_LOG", last_error_message: note });
    return true;
  }

  async markUncertainFromLegacyEvidence(jobId: string, note: string) {
    const r = this.rows.get(jobId);
    if (!r || !CLAIMABLE_STATUSES.includes(r.status)) return false;
    Object.assign(r, { status: "UNCERTAIN", last_error_code: "LEGACY_UNCERTAIN_LOG", last_error_message: note });
    return true;
  }

  async expireStaleLeases(now: Date) {
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.status === "IN_PROGRESS" && r.lease_expires_at && r.lease_expires_at.getTime() < now.getTime()) {
        Object.assign(r, { status: "UNCERTAIN", lease_owner: null, lease_expires_at: null, last_error_code: "LEASE_EXPIRED" });
        n++;
      }
    }
    return n;
  }

  async listDue(now: Date, limit: number, organizationId?: string) {
    return [...this.rows.values()]
      .filter((r) => (!organizationId || r.organization_id === organizationId) && isClaimable(r, { now, manual: false }))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async reconcile(jobId: string, decision: ReconcileDecision, userId: string, note: string, now: Date) {
    const r = this.rows.get(jobId);
    if (!r) return null;
    const allowed = decision === "CANCEL" ? ["PENDING", "FAILED_RETRYABLE", "UNCERTAIN"] : ["UNCERTAIN"];
    if (!allowed.includes(r.status)) return null;
    r.status = decision === "CONFIRMED_DELIVERED" ? "RECONCILED_DELIVERED" : decision === "CANCEL" ? "CANCELLED" : "PENDING";
    Object.assign(r, { reconciled_by: userId, reconciled_at: now, reconciliation_note: note, next_attempt_at: null });
    return { ...r };
  }
}
