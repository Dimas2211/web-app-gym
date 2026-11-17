// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-run.repository.ts
//
// DTE-MH-TEST-RUNS — persistencia en Control Plane con LEASE + FENCING.
//
//   - acquireLease: toma el lease solo si no hay otro vigente e incrementa
//     lease_epoch (token de fencing monotónico).
//   - Toda escritura de avance (updateItem, updateRun, claimForTransmit)
//     bloquea la fila de la corrida (SELECT … FOR UPDATE) y verifica que el
//     lease siga siendo de este proceso, con el mismo epoch y sin vencer.
//     Un proceso viejo cuyo lease fue tomado por otro NO puede reclamar un
//     ítem para transmitir → no inicia una segunda transmisión.
//   - recordTransmitOutcome: registra el resultado REAL de una transmisión
//     ya iniciada; condicionado a step=TRANSMITTING y claim_epoch del que
//     transmitió (no al lease: el resultado es un hecho, no una decisión).
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import type { MhTestRunItemRecord, MhTestRunItemStep, MhTestRunPlan, MhTestRunRecord, MhTestRunStatus, PlannedMhTestItem } from "./mh-test-run.types";
import { MH_TEST_RUN_PROCESSABLE_STATUSES } from "./mh-test-run.types";

export interface MhTestLease {
  runId: string;
  owner: string;
  epoch: number;
}

export type MhTestItemPatch = Partial<Pick<MhTestRunItemRecord,
  | "step" | "control_number" | "generation_code" | "runtime_dte_document_id" | "runtime_invalidation_event_id"
  | "runtime_contingency_event_id" | "mh_estado" | "mh_codigo_msg" | "mh_descripcion" | "reception_stamp"
  | "last_error_code" | "last_error_message" | "operator_decision" | "attempts" | "query_attempts">> & {
  evidence?: Record<string, unknown> | null;
};

export interface MhTestRunPatch {
  status?:      MhTestRunStatus;
  last_error?:  string | null;
  started_at?:  Date;
  finished_at?: Date | null;
}

export interface CreateMhTestRunInput {
  organization_id:  string;
  tenant_id:        string;
  location_id:      string;
  issuer_config_id: string;
  plan:             MhTestRunPlan;
  items:            PlannedMhTestItem[];
  created_by:       string;
  authorized_by:    string;
}

export interface MhTestRunRepository {
  createRun(input: CreateMhTestRunInput, now: Date): Promise<{ ok: true; runId: string } | { ok: false; code: "ALREADY_ACTIVE" }>;
  getRun(runId: string): Promise<MhTestRunRecord | null>;
  acquireLease(runId: string, owner: string, ttlMs: number, now: Date): Promise<MhTestLease | null>;
  releaseLease(lease: MhTestLease): Promise<void>;
  updateRun(lease: MhTestLease, patch: MhTestRunPatch, now: Date): Promise<boolean>;
  updateItem(lease: MhTestLease, itemId: string, expectedSteps: readonly MhTestRunItemStep[], patch: MhTestItemPatch, now: Date): Promise<boolean>;
  claimForTransmit(lease: MhTestLease, itemId: string, fromSteps: readonly MhTestRunItemStep[], now: Date): Promise<boolean>;
  recordTransmitOutcome(itemId: string, epoch: number, patch: MhTestItemPatch): Promise<boolean>;
  listProcessableRunIds(now: Date, limit: number): Promise<string[]>;
  /**
   * Decisión del operador sobre un ítem. Solo si NO hay lease vigente (ningún
   * tick avanzando la corrida). Si la corrida estaba en NEEDS_REVIEW vuelve a
   * RUNNING para que el siguiente tick continúe.
   */
  applyOperatorDecision(runId: string, itemId: string, fromSteps: readonly MhTestRunItemStep[], patch: MhTestItemPatch & { operator_note: string; decided_by: string }, now: Date): Promise<IdleWriteResult>;
  /** Cambia el estado de la corrida solo si no hay lease vigente. */
  setRunStatusIfIdle(runId: string, fromStatuses: readonly MhTestRunStatus[], to: MhTestRunStatus, now: Date): Promise<IdleWriteResult>;
}

export type IdleWriteResult = "OK" | "BUSY" | "NOT_FOUND" | "STATE_MISMATCH";

// ── Prisma (Control Plane) ────────────────────────────────────────

type LockedRun = { lease_owner: string | null; lease_epoch: number; lease_expires_at: Date | null; status: string };

async function lockRun(tx: Prisma.TransactionClient, runId: string): Promise<LockedRun | null> {
  const rows = await tx.$queryRaw<LockedRun[]>`
    SELECT lease_owner, lease_epoch, lease_expires_at, status
    FROM platform_dte_mh_test_runs WHERE id = ${runId} FOR UPDATE`;
  return rows[0] ?? null;
}

function leaseValid(run: LockedRun | null, lease: MhTestLease, now: Date): boolean {
  return !!run && run.lease_owner === lease.owner && run.lease_epoch === lease.epoch && !!run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime();
}

function toItemData(patch: MhTestItemPatch): Prisma.PlatformDteMhTestRunItemUpdateManyMutationInput {
  const { evidence, ...rest } = patch;
  return {
    ...rest,
    ...(evidence !== undefined ? { evidence: evidence === null ? Prisma.DbNull : (evidence as Prisma.InputJsonValue) } : {}),
  };
}

export function createPrismaMhTestRunRepository(db: PrismaClient): MhTestRunRepository {
  return {
    async createRun(input, now) {
      try {
        const runId = await db.$transaction(async (tx) => {
          const run = await tx.platformDteMhTestRun.create({
            data: {
              organization_id: input.organization_id, tenant_id: input.tenant_id, location_id: input.location_id,
              issuer_config_id: input.issuer_config_id, environment: "TEST", status: "QUEUED",
              plan: input.plan as unknown as Prisma.InputJsonValue,
              created_by: input.created_by, authorized_by: input.authorized_by, authorized_at: now,
            },
            select: { id: true },
          });
          const idBySeq = new Map<number, string>();
          for (const it of input.items) {
            const created = await tx.platformDteMhTestRunItem.create({
              data: {
                run_id: run.id, seq: it.seq, kind: it.kind, dte_type_code: it.dteTypeCode, scenario_code: it.scenarioCode,
                planned_sequence: it.plannedSequence, step: "PLANNED",
              },
              select: { id: true },
            });
            idBySeq.set(it.seq, created.id);
          }
          for (const it of input.items) {
            if (it.dependsOnSeq != null) {
              await tx.platformDteMhTestRunItem.update({ where: { id: idBySeq.get(it.seq)! }, data: { depends_on_item_id: idBySeq.get(it.dependsOnSeq)! } });
            }
          }
          return run.id;
        });
        return { ok: true, runId };
      } catch (err) {
        // Índice único parcial platform_dte_mh_test_runs_one_active.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, code: "ALREADY_ACTIVE" };
        throw err;
      }
    },

    async getRun(runId) {
      const run = await db.platformDteMhTestRun.findUnique({
        where: { id: runId },
        include: { items: { orderBy: { seq: "asc" } } },
      });
      return run as unknown as MhTestRunRecord | null;
    },

    async acquireLease(runId, owner, ttlMs, now) {
      return db.$transaction(async (tx) => {
        const run = await lockRun(tx, runId);
        if (!run || !(MH_TEST_RUN_PROCESSABLE_STATUSES as readonly string[]).includes(run.status)) return null;
        if (run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime()) return null;
        const updated = await tx.platformDteMhTestRun.update({
          where: { id: runId },
          data:  { lease_owner: owner, lease_epoch: { increment: 1 }, lease_expires_at: new Date(now.getTime() + ttlMs) },
          select: { lease_epoch: true },
        });
        return { runId, owner, epoch: updated.lease_epoch };
      });
    },

    async releaseLease(lease) {
      await db.platformDteMhTestRun.updateMany({
        where: { id: lease.runId, lease_owner: lease.owner, lease_epoch: lease.epoch },
        data:  { lease_expires_at: null, lease_owner: null },
      });
    },

    async updateRun(lease, patch, now) {
      return db.$transaction(async (tx) => {
        if (!leaseValid(await lockRun(tx, lease.runId), lease, now)) return false;
        await tx.platformDteMhTestRun.update({ where: { id: lease.runId }, data: patch });
        return true;
      });
    },

    async updateItem(lease, itemId, expectedSteps, patch, now) {
      return db.$transaction(async (tx) => {
        if (!leaseValid(await lockRun(tx, lease.runId), lease, now)) return false;
        const res = await tx.platformDteMhTestRunItem.updateMany({
          where: { id: itemId, run_id: lease.runId, step: { in: [...expectedSteps] } },
          data:  toItemData(patch),
        });
        return res.count === 1;
      });
    },

    async claimForTransmit(lease, itemId, fromSteps, now) {
      return db.$transaction(async (tx) => {
        if (!leaseValid(await lockRun(tx, lease.runId), lease, now)) return false;
        const res = await tx.platformDteMhTestRunItem.updateMany({
          where: { id: itemId, run_id: lease.runId, step: { in: [...fromSteps] } },
          data:  { step: "TRANSMITTING", claim_epoch: lease.epoch, attempts: { increment: 1 } },
        });
        return res.count === 1;
      });
    },

    async recordTransmitOutcome(itemId, epoch, patch) {
      const res = await db.platformDteMhTestRunItem.updateMany({
        where: { id: itemId, step: "TRANSMITTING", claim_epoch: epoch },
        data:  toItemData(patch),
      });
      return res.count === 1;
    },

    async applyOperatorDecision(runId, itemId, fromSteps, patch, now) {
      return db.$transaction(async (tx) => {
        const run = await lockRun(tx, runId);
        if (!run) return "NOT_FOUND";
        if (run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime()) return "BUSY";
        const { operator_note, decided_by, ...rest } = patch;
        const res = await tx.platformDteMhTestRunItem.updateMany({
          where: { id: itemId, run_id: runId, step: { in: [...fromSteps] } },
          data:  { ...toItemData(rest), operator_note, decided_by, decided_at: now },
        });
        if (res.count !== 1) return "STATE_MISMATCH";
        if (run.status === "NEEDS_REVIEW") {
          await tx.platformDteMhTestRun.update({ where: { id: runId }, data: { status: "RUNNING", last_error: null } });
        }
        return "OK";
      });
    },

    async setRunStatusIfIdle(runId, fromStatuses, to, now) {
      return db.$transaction(async (tx) => {
        const run = await lockRun(tx, runId);
        if (!run) return "NOT_FOUND";
        if (run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime()) return "BUSY";
        if (!(fromStatuses as readonly string[]).includes(run.status)) return "STATE_MISMATCH";
        await tx.platformDteMhTestRun.update({
          where: { id: runId },
          data:  { status: to, ...(to === "CANCELLED" ? { finished_at: now } : {}), ...(to === "RUNNING" ? { last_error: null } : {}) },
        });
        return "OK";
      });
    },

    async listProcessableRunIds(now, limit) {
      const rows = await db.platformDteMhTestRun.findMany({
        where: {
          status: { in: [...MH_TEST_RUN_PROCESSABLE_STATUSES] },
          OR: [{ lease_expires_at: null }, { lease_expires_at: { lt: now } }],
        },
        orderBy: { created_at: "asc" },
        take: limit,
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },
  };
}

// ── En memoria (tests) — misma semántica de lease/fencing ─────────

export function createInMemoryMhTestRunRepository(seed: MhTestRunRecord[] = []): MhTestRunRepository & { runs: Map<string, MhTestRunRecord> } {
  const runs = new Map(seed.map((r) => [r.id, structuredClone(r)]));
  const valid = (run: MhTestRunRecord | undefined, lease: MhTestLease, now: Date) =>
    !!run && run.lease_owner === lease.owner && run.lease_epoch === lease.epoch && !!run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime();
  const findItem = (itemId: string) => {
    for (const run of runs.values()) {
      const item = run.items.find((i) => i.id === itemId);
      if (item) return { run, item };
    }
    return null;
  };
  const apply = (item: MhTestRunItemRecord, patch: MhTestItemPatch) => {
    const rest: Partial<MhTestItemPatch> = { ...patch };
    delete rest.evidence; // el registro en memoria no guarda evidencia
    Object.assign(item, rest);
  };
  let n = 0;
  return {
    runs,
    async createRun(input) {
      for (const r of runs.values()) {
        if (r.organization_id === input.organization_id && ["QUEUED", "RUNNING", "PAUSED", "NEEDS_REVIEW"].includes(r.status)) return { ok: false, code: "ALREADY_ACTIVE" };
      }
      const id = `run-${++n}`;
      const ids = new Map(input.items.map((it) => [it.seq, `${id}-item-${it.seq}`]));
      runs.set(id, {
        id, organization_id: input.organization_id, tenant_id: input.tenant_id, location_id: input.location_id,
        issuer_config_id: input.issuer_config_id, environment: "TEST", status: "QUEUED", plan: input.plan,
        authorized_by: input.authorized_by, lease_owner: null, lease_epoch: 0, lease_expires_at: null, last_error: null,
        items: input.items.map((it) => ({
          id: ids.get(it.seq)!, run_id: id, seq: it.seq, kind: it.kind, dte_type_code: it.dteTypeCode, scenario_code: it.scenarioCode,
          depends_on_item_id: it.dependsOnSeq != null ? ids.get(it.dependsOnSeq)! : null, planned_sequence: it.plannedSequence,
          control_number: null, generation_code: null, runtime_dte_document_id: null, runtime_invalidation_event_id: null,
          runtime_contingency_event_id: null, step: "PLANNED", claim_epoch: null, attempts: 0, query_attempts: 0,
          mh_estado: null, mh_codigo_msg: null, mh_descripcion: null, reception_stamp: null, last_error_code: null,
          last_error_message: null, operator_decision: null,
        })),
      });
      return { ok: true, runId: id };
    },
    async getRun(runId) {
      const r = runs.get(runId);
      return r ? structuredClone(r) : null;
    },
    async acquireLease(runId, owner, ttlMs, now) {
      const run = runs.get(runId);
      if (!run || !(MH_TEST_RUN_PROCESSABLE_STATUSES as readonly string[]).includes(run.status)) return null;
      if (run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime()) return null;
      run.lease_owner = owner;
      run.lease_epoch += 1;
      run.lease_expires_at = new Date(now.getTime() + ttlMs);
      return { runId, owner, epoch: run.lease_epoch };
    },
    async releaseLease(lease) {
      const run = runs.get(lease.runId);
      if (run && run.lease_owner === lease.owner && run.lease_epoch === lease.epoch) {
        run.lease_expires_at = null;
        run.lease_owner = null;
      }
    },
    async updateRun(lease, patch, now) {
      const run = runs.get(lease.runId);
      if (!valid(run, lease, now)) return false;
      if (patch.status) run!.status = patch.status;
      if (patch.last_error !== undefined) run!.last_error = patch.last_error;
      return true;
    },
    async updateItem(lease, itemId, expectedSteps, patch, now) {
      const run = runs.get(lease.runId);
      if (!valid(run, lease, now)) return false;
      const item = run!.items.find((i) => i.id === itemId);
      if (!item || !expectedSteps.includes(item.step)) return false;
      apply(item, patch);
      return true;
    },
    async claimForTransmit(lease, itemId, fromSteps, now) {
      const run = runs.get(lease.runId);
      if (!valid(run, lease, now)) return false;
      const item = run!.items.find((i) => i.id === itemId);
      if (!item || !fromSteps.includes(item.step)) return false;
      item.step = "TRANSMITTING";
      item.claim_epoch = lease.epoch;
      item.attempts += 1;
      return true;
    },
    async recordTransmitOutcome(itemId, epoch, patch) {
      const found = findItem(itemId);
      if (!found || found.item.step !== "TRANSMITTING" || found.item.claim_epoch !== epoch) return false;
      apply(found.item, patch);
      return true;
    },
    async applyOperatorDecision(runId, itemId, fromSteps, patch, now) {
      const run = runs.get(runId);
      if (!run) return "NOT_FOUND";
      if (run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime()) return "BUSY";
      const item = run.items.find((i) => i.id === itemId);
      if (!item || !fromSteps.includes(item.step)) return "STATE_MISMATCH";
      const rest: Partial<typeof patch> = { ...patch };
      delete rest.operator_note;
      delete rest.decided_by;
      apply(item, rest);
      if (run.status === "NEEDS_REVIEW") run.status = "RUNNING";
      return "OK";
    },
    async setRunStatusIfIdle(runId, fromStatuses, to, now) {
      const run = runs.get(runId);
      if (!run) return "NOT_FOUND";
      if (run.lease_expires_at && run.lease_expires_at.getTime() > now.getTime()) return "BUSY";
      if (!fromStatuses.includes(run.status)) return "STATE_MISMATCH";
      run.status = to;
      return "OK";
    },
    async listProcessableRunIds(now) {
      return [...runs.values()]
        .filter((r) => (MH_TEST_RUN_PROCESSABLE_STATUSES as readonly string[]).includes(r.status) && (!r.lease_expires_at || r.lease_expires_at.getTime() < now.getTime()))
        .map((r) => r.id);
    },
  };
}
