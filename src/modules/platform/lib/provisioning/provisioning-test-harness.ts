// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — provisioning-test-harness.ts
//
// SHARED-PILOT-4B — SOLO TESTS. Base de datos en memoria con la
// semántica mínima que la idempotencia distribuida necesita probar de
// verdad (no "mock success twice"):
// - transacciones interactivas con rollback real (undo log);
// - unique constraints → Prisma P2002 real;
// - pg_advisory_xact_lock simulado como mutex por key, liberado al
//   commit/rollback;
// - inyección de fallos: una operación concreta (tabla.op) falla una
//   vez, o toda la base queda "caída" (simula crash del proceso /
//   Control Plane inalcanzable) — p.ej. justo después de un commit.
// - cada operación cede el event loop, para que dos requests
//   "simultáneos" realmente se intercalen.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

interface TableSpec {
  uniques: string[][];
  defaults?: () => Record<string, unknown>;
  /** FK: columna → tabla referenciada (debe existir la fila). */
  foreignKeys?: Record<string, string>;
}

interface TxContext {
  undo: Array<() => void>;
  releases: Array<() => void>;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function uniqueViolation(table: string, cols: string[]) {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (${cols.join(",")}) [${table}]`,
    { code: "P2002", clientVersion: "test", meta: { target: cols } },
  );
}

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w));
    if (key === "NOT") return !matches(row, cond as Where);
    if (cond !== null && typeof cond === "object" && "not" in (cond as object)) {
      return row[key] !== (cond as { not: unknown }).not;
    }
    return (row[key] ?? null) === cond;
  });
}

function project(row: Row, select?: Record<string, boolean>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) if (v) out[k] = row[k] ?? null;
  return out;
}

function applyData(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === "object" && "increment" in (v as object)) {
      row[k] = ((row[k] as number) ?? 0) + (v as { increment: number }).increment;
    } else {
      row[k] = v;
    }
  }
}

export class InMemoryDb {
  readonly tables: Record<string, Row[]> = {};
  /** Si está en true, TODA operación falla (proceso caído / base inalcanzable). */
  down = false;
  /** Se ejecuta después de cada commit exitoso de una transacción. */
  afterCommit: (() => void) | null = null;

  private faults: Array<{ table: string; op: string; error: Error }> = [];
  private locks = new Map<string, Promise<void>>();

  constructor(private readonly specs: Record<string, TableSpec>) {
    for (const name of Object.keys(specs)) this.tables[name] = [];
  }

  /** La próxima llamada `table.op` lanza `error` (una sola vez). */
  failNext(table: string, op: string, error: Error = new Error(`injected failure ${table}.${op}`)) {
    this.faults.push({ table, op, error });
  }

  count(table: string, where?: Where): number {
    return this.tables[table].filter((r) => matches(r, where)).length;
  }

  seed(table: string, row: Record<string, unknown>): Row {
    const full = { id: randomUUID(), ...(this.specs[table].defaults?.() ?? {}), ...row } as Row;
    this.tables[table].push(full);
    return full;
  }

  get client() {
    return this.buildClient(null);
  }

  private async guard(table: string, op: string) {
    await tick();
    if (this.down) throw new Error("simulated: database unavailable (process crashed)");
    const idx = this.faults.findIndex((f) => f.table === table && f.op === op);
    if (idx >= 0) {
      const [fault] = this.faults.splice(idx, 1);
      throw fault.error;
    }
  }

  private checkUniques(table: string, candidate: Row) {
    for (const cols of this.specs[table].uniques) {
      if (cols.some((c) => candidate[c] === null || candidate[c] === undefined)) continue;
      const clash = this.tables[table].some(
        (r) => r !== candidate && cols.every((c) => r[c] === candidate[c]),
      );
      if (clash) throw uniqueViolation(table, cols);
    }
  }

  private checkForeignKeys(table: string, row: Row) {
    for (const [col, ref] of Object.entries(this.specs[table].foreignKeys ?? {})) {
      const value = row[col];
      if (value === null || value === undefined) continue;
      if (!this.tables[ref].some((r) => r.id === value)) {
        throw new Prisma.PrismaClientKnownRequestError(`Foreign key constraint failed on ${table}.${col}`, {
          code: "P2003",
          clientVersion: "test",
        });
      }
    }
  }

  private delegate(table: string, ctx: TxContext | null) {
    const rows = () => this.tables[table];
    const recordUndo = (fn: () => void) => ctx?.undo.push(fn);

    return {
      create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        await this.guard(table, "create");
        const row = { id: randomUUID(), ...(this.specs[table].defaults?.() ?? {}), ...data } as Row;
        this.checkUniques(table, row);
        this.checkForeignKeys(table, row);
        rows().push(row);
        recordUndo(() => {
          const i = rows().indexOf(row);
          if (i >= 0) rows().splice(i, 1);
        });
        return project(row, select);
      },
      findUnique: async ({ where, select }: { where: Where; select?: Record<string, boolean> }) => {
        await this.guard(table, "findUnique");
        const row = rows().find((r) => matches(r, where));
        return row ? project(row, select) : null;
      },
      findFirst: async ({ where, select }: { where?: Where; select?: Record<string, boolean> }) => {
        await this.guard(table, "findFirst");
        const row = rows().find((r) => matches(r, where));
        return row ? project(row, select) : null;
      },
      update: async ({ where, data, select }: { where: Where; data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        await this.guard(table, "update");
        const row = rows().find((r) => matches(r, where));
        if (!row) throw new Prisma.PrismaClientKnownRequestError("Record to update not found", { code: "P2025", clientVersion: "test" });
        const before = { ...row };
        applyData(row, data);
        try {
          this.checkUniques(table, row);
        } catch (err) {
          Object.assign(row, before);
          throw err;
        }
        recordUndo(() => {
          for (const k of Object.keys(row)) delete row[k];
          Object.assign(row, before);
        });
        return project(row, select);
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        await this.guard(table, "updateMany");
        const targets = rows().filter((r) => matches(r, where));
        const befores = targets.map((r) => ({ ...r }));
        targets.forEach((r) => applyData(r, data));
        try {
          targets.forEach((r) => this.checkUniques(table, r));
        } catch (err) {
          targets.forEach((r, i) => Object.assign(r, befores[i]));
          throw err;
        }
        recordUndo(() => targets.forEach((r, i) => {
          for (const k of Object.keys(r)) delete r[k];
          Object.assign(r, befores[i]);
        }));
        return { count: targets.length };
      },
    };
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, previous.then(() => mine));
    await previous;
    return release;
  }

  private buildClient(ctx: TxContext | null): Record<string, unknown> {
    const client: Record<string, unknown> = {};
    for (const table of Object.keys(this.specs)) client[table] = this.delegate(table, ctx);

    // Solo soporta el patrón pg_advisory_xact_lock(hashtext(key)).
    client.$executeRaw = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      await this.guard("$raw", "executeRaw");
      if (!ctx) throw new Error("advisory xact lock fuera de transacción");
      ctx.releases.push(await this.acquire(String(values[0])));
      return 1;
    };

    if (!ctx) {
      client.$transaction = async (cb: (tx: unknown) => Promise<unknown>) => {
        await this.guard("$tx", "begin");
        const txCtx: TxContext = { undo: [], releases: [] };
        try {
          const result = await cb(this.buildClient(txCtx));
          if (this.down) throw new Error("simulated: database unavailable before commit");
          txCtx.releases.forEach((r) => r());
          this.afterCommit?.();
          return result;
        } catch (err) {
          for (const undo of txCtx.undo.reverse()) undo();
          txCtx.releases.forEach((r) => r());
          throw err;
        }
      };
    }
    return client;
  }
}

/** Base runtime (cliente) con las tablas que toca provisionRuntimeTenant. */
export function createRuntimeDb(): InMemoryDb {
  return new InMemoryDb({
    runtimeTenant: { uniques: [["slug"]] },
    gym:           { uniques: [["slug"], ["tenant_id"]], foreignKeys: { tenant_id: "runtimeTenant" } },
    branch:        { uniques: [], foreignKeys: { tenant_id: "runtimeTenant", gym_id: "gym" } },
    user:          { uniques: [["tenant_id", "email"]], foreignKeys: { tenant_id: "runtimeTenant", location_id: "branch" } },
    runtimeProvisioningReceipt: {
      uniques: [["idempotency_key"], ["tenant_id"], ["location_id"], ["admin_user_id"]],
      foreignKeys: { tenant_id: "runtimeTenant", location_id: "branch", admin_user_id: "user" },
    },
  });
}

/** Base Control Plane con las tablas que toca provisionSharedRuntimeOrganizationAction. */
export function createControlPlaneDb(): InMemoryDb {
  return new InMemoryDb({
    platformOrganization: {
      uniques: [["tenant_id"]],
      defaults: () => ({ tenant_id: null, shared_runtime_target_id: null, provisioning_status: "NOT_READY" }),
    },
    platformRuntimeProvisioningOperation: {
      uniques: [["organization_id"], ["idempotency_key"]],
      foreignKeys: { organization_id: "platformOrganization" },
      defaults: () => ({
        status: "PENDING",
        attempt_count: 0,
        runtime_target_kind: null,
        runtime_target_id: null,
        result_tenant_id: null,
        result_gym_id: null,
        result_location_id: null,
        result_admin_user_id: null,
        last_error: null,
        completed_at: null,
      }),
    },
    platformDeploymentLog: { uniques: [] },
  });
}
