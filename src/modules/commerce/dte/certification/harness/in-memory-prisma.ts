// ─────────────────────────────────────────────────────────────────
// commerce/dte/certification/harness — in-memory-prisma.ts
//
// DTE-INTERNAL-CERTIFICATION — SOLO TESTS / CERTIFICACIÓN. Nunca
// importar desde código de producción.
//
// Harness en memoria derivado del schema Prisma (Prisma.dmmf.datamodel)
// que reproduce los modelos, relaciones y restricciones necesarias para
// la certificación: defaults (uuid/now/literales), @updatedAt, uniques
// simples y compuestos (P2002), FKs (P2003), registro inexistente en
// update (P2025), Decimal y Json. Permite ejecutar los servicios/actions
// DTE productivos de punta a punta sin tocar ninguna base de datos. NO
// sustituye una prueba de concurrencia/transacciones reales de PostgreSQL.
//
// Semántica relevante replicada a propósito:
// - Las operaciones devuelven promesas LAZY (como PrismaPromise): solo
//   se ejecutan al ser awaited. Así `$transaction([op1, op2])` es
//   atómico: si op2 falla, op1 se revierte.
// - `$transaction(fn)` interactivo con rollback real (snapshot/restore)
//   y un TransactionClient sin `$transaction` (igual que Prisma).
// - `$queryRaw` solo acepta SQL explícitamente conocido (correlativo
//   interno de ventas). Cualquier otro SQL falla cerrado — nunca se
//   "simula éxito" de una consulta que no se entiende.
// - Operadores/args no soportados lanzan error explícito en vez de
//   ignorarse en silencio (un filtro ignorado daría falsos PASS).
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type Args = Record<string, unknown>;
type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type DmmfField = DmmfModel["fields"][number];

export class CertificationDbUnsupportedError extends Error {
  constructor(message: string) {
    super(`[certification-db] ${message}`);
    this.name = "CertificationDbUnsupportedError";
  }
}

function knownError(code: string, message: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "certification-in-memory",
    meta,
  });
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) &&
  !(v instanceof Date) && !Prisma.Decimal.isDecimal(v);

// ── Metadata por modelo (derivada del DMMF) ──────────────────────

interface ModelMeta {
  name: string;
  fields: Map<string, DmmfField>;
  scalars: DmmfField[];
  idFields: string[];
  uniques: string[][];
  /** nombre de where compuesto → campos (p.ej. tenant_id_location_id_..._year). */
  compound: Map<string, string[]>;
}

function buildModelMeta(model: DmmfModel): ModelMeta {
  const fields = new Map(model.fields.map((f) => [f.name, f]));
  const scalars = model.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
  const idFields = model.primaryKey?.fields?.length
    ? [...model.primaryKey.fields]
    : model.fields.filter((f) => f.isId).map((f) => f.name);
  const uniques: string[][] = [
    idFields,
    ...model.fields.filter((f) => f.isUnique).map((f) => [f.name]),
    ...model.uniqueFields.map((u) => [...u]),
  ].filter((u) => u.length > 0);
  const compound = new Map<string, string[]>();
  for (const idx of model.uniqueIndexes) compound.set(idx.name ?? idx.fields.join("_"), [...idx.fields]);
  if (model.primaryKey?.fields?.length) {
    compound.set(model.primaryKey.name ?? model.primaryKey.fields.join("_"), [...model.primaryKey.fields]);
  }
  return { name: model.name, fields, scalars, idFields, uniques, compound };
}

// ── Valores ──────────────────────────────────────────────────────

function cloneValue(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (Prisma.Decimal.isDecimal(v)) return new Prisma.Decimal(v as Prisma.Decimal);
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === "object") return JSON.parse(JSON.stringify(v));
  return v;
}

function cloneRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = cloneValue(v);
  return out;
}

function isJsonNullSentinel(v: unknown): boolean {
  return v === Prisma.JsonNull || v === Prisma.DbNull || v === Prisma.AnyNull;
}

function normalizeForField(field: DmmfField, value: unknown): unknown {
  if (value === null || value === undefined || isJsonNullSentinel(value)) return null;
  switch (field.type) {
    case "Decimal":
      return new Prisma.Decimal(value as Prisma.Decimal.Value);
    case "DateTime":
      return value instanceof Date ? new Date(value.getTime()) : new Date(value as string);
    case "Json":
      return JSON.parse(JSON.stringify(value));
    case "Int":
    case "Float":
      if (typeof value !== "number") {
        throw new CertificationDbUnsupportedError(`Campo ${field.name} (${field.type}) recibió ${typeof value}.`);
      }
      return value;
    default:
      return value;
  }
}

function comparable(v: unknown): unknown {
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toNumber();
  if (v instanceof Date) return v.getTime();
  return v;
}

function operand(field: DmmfField, v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (field.type === "Decimal") return new Prisma.Decimal(v as Prisma.Decimal.Value).toNumber();
  if (field.type === "DateTime") return (v instanceof Date ? v : new Date(v as string)).getTime();
  return comparable(v);
}

// ── Promesa lazy (equivalente a PrismaPromise) ───────────────────

class LazyPrismaPromise<T> implements PromiseLike<T> {
  private promise?: Promise<T>;
  constructor(private readonly run: () => Promise<T>) {}
  private exec(): Promise<T> {
    return (this.promise ??= this.run());
  }
  then<A = T, B = never>(
    onfulfilled?: ((value: T) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.exec().then(onfulfilled, onrejected);
  }
  catch<B = never>(onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<T | B> {
    return this.exec().catch(onrejected);
  }
  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.exec().finally(onfinally);
  }
  get [Symbol.toStringTag]() {
    return "PrismaPromise";
  }
}

// ── Base de datos en memoria ─────────────────────────────────────

export interface InMemoryPrismaOptions {
  /** Etiqueta para trazabilidad/reportes (p.ej. "runtime-tenant-A"). */
  label: string;
}

export class InMemoryPrismaDb {
  readonly label: string;
  /** Contador de operaciones por "modelo.op" — evidencia de qué base se usó. */
  readonly opCounts = new Map<string, number>();
  readonly transactionLog: Array<{ kind: "interactive" | "batch"; isolationLevel: string | null; committed: boolean }> = [];
  private tables = new Map<string, Row[]>();
  private readonly models = new Map<string, ModelMeta>();
  private readonly delegateToModel = new Map<string, string>();
  readonly client: PrismaClient;

  constructor(options: InMemoryPrismaOptions) {
    this.label = options.label;
    for (const model of Prisma.dmmf.datamodel.models) {
      const meta = buildModelMeta(model);
      this.models.set(model.name, meta);
      this.delegateToModel.set(lcFirst(model.name), model.name);
      this.tables.set(model.name, []);
    }
    this.client = this.buildClient(true) as unknown as PrismaClient;
  }

  // ── API de inspección (solo para aserciones del test) ──────────

  /** Copia de las filas de un modelo (nunca referencias vivas). */
  rows(modelName: string): Row[] {
    return (this.table(modelName)).map(cloneRow);
  }

  totalOps(): number {
    let n = 0;
    for (const v of this.opCounts.values()) n += v;
    return n;
  }

  // ── Cliente ─────────────────────────────────────────────────────

  private buildClient(withTransaction: boolean): Record<string, unknown> {
    const client: Record<string, unknown> = {};
    for (const [delegate, modelName] of this.delegateToModel) {
      client[delegate] = this.buildDelegate(modelName);
    }
    client.$queryRaw = (strings: TemplateStringsArray, ...values: unknown[]) =>
      new LazyPrismaPromise(async () => this.queryRaw(strings, values));
    client.$executeRaw = () =>
      new LazyPrismaPromise(async () => {
        throw new CertificationDbUnsupportedError("$executeRaw no está soportado en la base de certificación.");
      });
    client.$queryRawUnsafe = client.$executeRaw;
    client.$executeRawUnsafe = client.$executeRaw;
    client.$connect = async () => {};
    client.$disconnect = async () => {};
    if (withTransaction) {
      client.$transaction = (arg: unknown, opts?: { isolationLevel?: string }) => this.transaction(arg, opts);
    }
    return client;
  }

  private buildDelegate(modelName: string) {
    const op = <T>(name: string, fn: () => T) =>
      new LazyPrismaPromise(async () => {
        const key = `${lcFirst(modelName)}.${name}`;
        this.opCounts.set(key, (this.opCounts.get(key) ?? 0) + 1);
        return fn();
      });
    return {
      findMany: (a: Args = {}) => op("findMany", () => this.findMany(modelName, a)),
      findFirst: (a: Args = {}) => op("findFirst", () => this.findMany(modelName, { ...a, take: 1 })[0] ?? null),
      findFirstOrThrow: (a: Args = {}) => op("findFirstOrThrow", () => this.orThrow(this.findMany(modelName, { ...a, take: 1 })[0])),
      findUnique: (a: Args) => op("findUnique", () => this.findMany(modelName, { ...a, take: 1 })[0] ?? null),
      findUniqueOrThrow: (a: Args) => op("findUniqueOrThrow", () => this.orThrow(this.findMany(modelName, { ...a, take: 1 })[0])),
      create: (a: Args) => op("create", () => this.create(modelName, a)),
      createMany: (a: Args) => op("createMany", () => this.createMany(modelName, a)),
      update: (a: Args) => op("update", () => this.update(modelName, a)),
      updateMany: (a: Args) => op("updateMany", () => this.updateMany(modelName, a)),
      upsert: (a: Args) => op("upsert", () => this.upsert(modelName, a)),
      delete: (a: Args) => op("delete", () => this.delete(modelName, a)),
      deleteMany: (a: Args = {}) => op("deleteMany", () => this.deleteMany(modelName, a)),
      count: (a: Args = {}) => op("count", () => this.count(modelName, a)),
      aggregate: (a: Args) => op("aggregate", () => this.aggregate(modelName, a)),
      groupBy: () => op("groupBy", () => {
        throw new CertificationDbUnsupportedError(`${modelName}.groupBy no está soportado.`);
      }),
    };
  }

  private orThrow<T>(v: T | undefined): T {
    if (v === undefined || v === null) throw knownError("P2025", "No record was found for a query.");
    return v;
  }

  // ── Transacciones ───────────────────────────────────────────────

  private async transaction(arg: unknown, opts?: { isolationLevel?: string }) {
    const snapshot = this.snapshot();
    const entry = {
      kind: (Array.isArray(arg) ? "batch" : "interactive") as "batch" | "interactive",
      isolationLevel: opts?.isolationLevel ?? null,
      committed: false,
    };
    this.transactionLog.push(entry);
    try {
      let result: unknown;
      if (Array.isArray(arg)) {
        const results: unknown[] = [];
        for (const pending of arg) results.push(await pending);
        result = results;
      } else if (typeof arg === "function") {
        result = await (arg as (tx: unknown) => Promise<unknown>)(this.buildClient(false));
      } else {
        throw new CertificationDbUnsupportedError("$transaction requiere un array o una función.");
      }
      entry.committed = true;
      return result;
    } catch (err) {
      this.tables = snapshot;
      throw err;
    }
  }

  private snapshot(): Map<string, Row[]> {
    const copy = new Map<string, Row[]>();
    for (const [k, rows] of this.tables) copy.set(k, rows.map(cloneRow));
    return copy;
  }

  // ── SQL crudo conocido ──────────────────────────────────────────

  private queryRaw(strings: TemplateStringsArray, values: unknown[]): unknown {
    const sql = strings.join("?").replace(/\s+/g, " ").trim();
    // sales/utils/sale-correlative.ts — getNextSaleSequence
    if (/^SELECT MAX\("sale_sequence"\) AS max_seq FROM "sales" WHERE "tenant_id" = \? AND "location_id" = \? AND "sale_year" = \? AND "sale_month" = \?$/.test(sql)) {
      const [tenant_id, location_id, year, month] = values;
      const seqs = this.table("Sale")
        .filter((r) => r.tenant_id === tenant_id && r.location_id === location_id && r.sale_year === year && r.sale_month === month)
        .map((r) => r.sale_sequence as number);
      return [{ max_seq: seqs.length ? Math.max(...seqs) : null }];
    }
    throw new CertificationDbUnsupportedError(`SQL crudo no reconocido por la base de certificación: ${sql.slice(0, 120)}`);
  }

  // ── Lectura ─────────────────────────────────────────────────────

  private table(modelName: string): Row[] {
    const t = this.tables.get(modelName);
    if (!t) throw new CertificationDbUnsupportedError(`Modelo desconocido: ${modelName}`);
    return t;
  }

  private meta(modelName: string): ModelMeta {
    const m = this.models.get(modelName);
    if (!m) throw new CertificationDbUnsupportedError(`Modelo desconocido: ${modelName}`);
    return m;
  }

  private assertKnownArgs(modelName: string, args: Args, allowed: string[]) {
    for (const k of Object.keys(args)) {
      if (args[k] === undefined) continue;
      if (!allowed.includes(k)) {
        throw new CertificationDbUnsupportedError(`${modelName}: argumento "${k}" no soportado.`);
      }
    }
  }

  private findMany(modelName: string, args: Args): Row[] {
    this.assertKnownArgs(modelName, args, ["where", "select", "include", "orderBy", "take", "skip"]);
    this.validateWhere(modelName, args.where);
    let rows = this.table(modelName).filter((r) => this.matches(modelName, r, args.where as Where | undefined));
    rows = this.sortRows(modelName, rows, args.orderBy);
    if (typeof args.skip === "number") rows = rows.slice(args.skip);
    if (typeof args.take === "number") rows = rows.slice(0, args.take);
    return rows.map((r) => this.project(modelName, r, args.select as Args | undefined, args.include as Args | undefined));
  }

  private count(modelName: string, args: Args): number {
    this.assertKnownArgs(modelName, args, ["where"]);
    this.validateWhere(modelName, args.where);
    return this.table(modelName).filter((r) => this.matches(modelName, r, args.where as Where | undefined)).length;
  }

  private aggregate(modelName: string, args: Args) {
    this.assertKnownArgs(modelName, args, ["where", "_max", "_min", "_sum", "_count"]);
    this.validateWhere(modelName, args.where);
    const meta = this.meta(modelName);
    const rows = this.table(modelName).filter((r) => this.matches(modelName, r, args.where as Where | undefined));
    const out: Record<string, unknown> = {};
    for (const agg of ["_max", "_min", "_sum"] as const) {
      const spec = args[agg] as Record<string, boolean> | undefined;
      if (!spec) continue;
      const res: Record<string, unknown> = {};
      for (const [field, on] of Object.entries(spec)) {
        if (!on) continue;
        const f = meta.fields.get(field);
        if (!f) throw new CertificationDbUnsupportedError(`${modelName}.aggregate: campo ${field} desconocido.`);
        const vals = rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined);
        if (vals.length === 0) { res[field] = null; continue; }
        if (agg === "_sum") {
          res[field] = f.type === "Decimal"
            ? vals.reduce<Prisma.Decimal>((s, v) => s.plus(v as Prisma.Decimal), new Prisma.Decimal(0))
            : (vals as number[]).reduce((s, v) => s + v, 0);
        } else {
          const sorted = [...vals].sort((a, b) => (comparable(a) as number) - (comparable(b) as number));
          res[field] = cloneValue(agg === "_max" ? sorted[sorted.length - 1] : sorted[0]);
        }
      }
      out[agg] = res;
    }
    if (args._count) out._count = typeof args._count === "object" ? { _all: rows.length } : rows.length;
    return out;
  }

  private sortRows(modelName: string, rows: Row[], orderBy: unknown): Row[] {
    if (!orderBy) return rows;
    const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, unknown>[];
    const meta = this.meta(modelName);
    const keys: Array<{ field: string; dir: number }> = [];
    for (const spec of specs) {
      for (const [field, dirRaw] of Object.entries(spec)) {
        const f = meta.fields.get(field);
        if (!f || f.kind === "object") {
          throw new CertificationDbUnsupportedError(`${modelName}.orderBy por "${field}" no soportado.`);
        }
        const dir = typeof dirRaw === "string" ? dirRaw : (dirRaw as { sort?: string })?.sort;
        keys.push({ field, dir: dir === "desc" ? -1 : 1 });
      }
    }
    return [...rows].sort((a, b) => {
      for (const { field, dir } of keys) {
        const va = comparable(a[field]);
        const vb = comparable(b[field]);
        if (va === vb) continue;
        // Postgres: NULLS LAST en ASC, NULLS FIRST en DESC.
        if (va === null || va === undefined) return dir;
        if (vb === null || vb === undefined) return -dir;
        return (va as number) < (vb as number) ? -dir : dir;
      }
      return 0;
    });
  }

  // ── Filtros ─────────────────────────────────────────────────────

  /** Valida la forma del where aunque no haya filas (Prisma valida la query siempre). */
  private validateWhere(modelName: string, where: unknown): void {
    if (where === undefined || where === null) return;
    if (!isPlainObject(where)) throw new CertificationDbUnsupportedError(`${modelName}.where inválido.`);
    const meta = this.meta(modelName);
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === "AND" || key === "OR" || key === "NOT") {
        for (const w of Array.isArray(cond) ? cond : [cond]) this.validateWhere(modelName, w);
        continue;
      }
      const field = meta.fields.get(key);
      if (field?.kind === "object") {
        if (cond === null || !isPlainObject(cond)) continue;
        const nestedKeys = field.isList ? ["some", "every", "none"] : ["is", "isNot"];
        const usesOperators = Object.keys(cond).some((k) => nestedKeys.includes(k));
        if (field.isList && !usesOperators) {
          throw new CertificationDbUnsupportedError(`${modelName}.${key}: filtro de lista requiere some/every/none.`);
        }
        if (usesOperators) {
          for (const [op, w] of Object.entries(cond)) {
            if (!nestedKeys.includes(op)) throw new CertificationDbUnsupportedError(`${modelName}.${key}: operador "${op}" no soportado.`);
            this.validateWhere(field.type, w);
          }
        } else {
          this.validateWhere(field.type, cond);
        }
        continue;
      }
      if (field || meta.compound.has(key)) continue;
      throw new CertificationDbUnsupportedError(`${modelName}.where: clave "${key}" no soportada.`);
    }
  }

  private matches(modelName: string, row: Row, where: Where | undefined): boolean {
    if (!where) return true;
    const meta = this.meta(modelName);
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === "AND") {
        const list = Array.isArray(cond) ? cond : [cond];
        if (!list.every((w) => this.matches(modelName, row, w as Where))) return false;
        continue;
      }
      if (key === "OR") {
        if (!(cond as Where[]).some((w) => this.matches(modelName, row, w))) return false;
        continue;
      }
      if (key === "NOT") {
        const list = Array.isArray(cond) ? cond : [cond];
        if (list.some((w) => this.matches(modelName, row, w as Where))) return false;
        continue;
      }
      const field = meta.fields.get(key);
      if (field) {
        if (field.kind === "object") {
          if (!this.matchRelation(modelName, row, field, cond)) return false;
        } else if (!this.matchScalar(field, row[key], cond)) {
          return false;
        }
        continue;
      }
      const compoundFields = meta.compound.get(key);
      if (compoundFields && isPlainObject(cond)) {
        for (const f of compoundFields) {
          if (!this.matchScalar(meta.fields.get(f)!, row[f], cond[f])) return false;
        }
        continue;
      }
      throw new CertificationDbUnsupportedError(`${modelName}.where: clave "${key}" no soportada.`);
    }
    return true;
  }

  private matchScalar(field: DmmfField, value: unknown, cond: unknown): boolean {
    if (cond === null) return value === null || value === undefined;
    if (!isPlainObject(cond) || field.type === "Json") {
      if (field.type === "Json" && isPlainObject(cond)) {
        throw new CertificationDbUnsupportedError(`Filtro sobre Json (${field.name}) no soportado.`);
      }
      return comparable(value ?? null) === operand(field, cond);
    }
    const insensitive = cond.mode === "insensitive";
    const str = (v: unknown) => (insensitive && typeof v === "string" ? v.toLowerCase() : v);
    const v = comparable(value ?? null);
    for (const [op, raw] of Object.entries(cond)) {
      if (raw === undefined || op === "mode") continue;
      switch (op) {
        case "equals":
          if (raw === null ? v !== null : str(v) !== str(operand(field, raw))) return false;
          break;
        case "in":
          if (!(raw as unknown[]).map((x) => str(operand(field, x))).includes(str(v))) return false;
          break;
        case "notIn":
          if ((raw as unknown[]).map((x) => str(operand(field, x))).includes(str(v))) return false;
          break;
        case "not":
          if (isPlainObject(raw) ? this.matchScalar(field, value, raw) : this.matchScalar(field, value, raw ?? null)) return false;
          break;
        case "lt": if (!(v !== null && (v as number) < (operand(field, raw) as number))) return false; break;
        case "lte": if (!(v !== null && (v as number) <= (operand(field, raw) as number))) return false; break;
        case "gt": if (!(v !== null && (v as number) > (operand(field, raw) as number))) return false; break;
        case "gte": if (!(v !== null && (v as number) >= (operand(field, raw) as number))) return false; break;
        case "contains": if (typeof v !== "string" || !(str(v) as string).includes(str(raw) as string)) return false; break;
        case "startsWith": if (typeof v !== "string" || !(str(v) as string).startsWith(str(raw) as string)) return false; break;
        case "endsWith": if (typeof v !== "string" || !(str(v) as string).endsWith(str(raw) as string)) return false; break;
        default:
          throw new CertificationDbUnsupportedError(`Operador "${op}" no soportado en ${field.name}.`);
      }
    }
    return true;
  }

  private matchRelation(modelName: string, row: Row, field: DmmfField, cond: unknown): boolean {
    const related = this.related(modelName, row, field);
    if (field.isList) {
      const list = related as Row[];
      if (!isPlainObject(cond)) throw new CertificationDbUnsupportedError(`Filtro de lista ${field.name} inválido.`);
      for (const [op, w] of Object.entries(cond)) {
        if (w === undefined) continue;
        if (op === "some" && !list.some((r) => this.matches(field.type, r, w as Where))) return false;
        if (op === "every" && !list.every((r) => this.matches(field.type, r, w as Where))) return false;
        if (op === "none" && list.some((r) => this.matches(field.type, r, w as Where))) return false;
        if (!["some", "every", "none"].includes(op)) {
          throw new CertificationDbUnsupportedError(`Operador de relación "${op}" no soportado.`);
        }
      }
      return true;
    }
    const target = related as Row | null;
    if (cond === null) return target === null;
    if (isPlainObject(cond) && ("is" in cond || "isNot" in cond)) {
      if ("is" in cond) {
        const w = cond.is;
        if (w === null ? target !== null : !(target && this.matches(field.type, target, w as Where))) return false;
      }
      if ("isNot" in cond) {
        const w = cond.isNot;
        if (w === null ? target === null : !!(target && this.matches(field.type, target, w as Where))) return false;
      }
      return true;
    }
    return !!target && this.matches(field.type, target, cond as Where);
  }

  private related(modelName: string, row: Row, field: DmmfField): Row[] | Row | null {
    const targetRows = this.table(field.type);
    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const from = field.relationFromFields;
      const to = field.relationToFields ?? [];
      if (from.some((f) => row[f] === null || row[f] === undefined)) return null;
      return targetRows.find((t) => from.every((f, i) => t[to[i]] === row[f])) ?? null;
    }
    const targetMeta = this.meta(field.type);
    const opposite = [...targetMeta.fields.values()].find(
      (f) => f.kind === "object" && f.relationName === field.relationName && f.type === modelName &&
        !(field.type === modelName && f.name === field.name) && (f.relationFromFields?.length ?? 0) > 0,
    );
    if (!opposite) throw new CertificationDbUnsupportedError(`No se pudo resolver la relación ${modelName}.${field.name}.`);
    const from = opposite.relationFromFields!;
    const to = opposite.relationToFields ?? [];
    const matched = targetRows.filter((t) => from.every((f, i) => t[f] === row[to[i]]));
    return field.isList ? matched : (matched[0] ?? null);
  }

  // ── Proyección (select/include/_count) ─────────────────────────

  private project(modelName: string, row: Row, select?: Args, include?: Args): Row {
    const meta = this.meta(modelName);
    const out: Row = {};
    if (select) {
      for (const [key, spec] of Object.entries(select)) {
        if (!spec) continue;
        if (key === "_count") { out._count = this.projectCount(modelName, row, spec); continue; }
        const f = meta.fields.get(key);
        if (!f) throw new CertificationDbUnsupportedError(`${modelName}.select: campo "${key}" desconocido.`);
        out[key] = f.kind === "object" ? this.projectRelation(modelName, row, f, spec) : cloneValue(row[key] ?? null);
      }
      return out;
    }
    for (const f of meta.scalars) out[f.name] = cloneValue(row[f.name] ?? null);
    if (include) {
      for (const [key, spec] of Object.entries(include)) {
        if (!spec) continue;
        if (key === "_count") { out._count = this.projectCount(modelName, row, spec); continue; }
        const f = meta.fields.get(key);
        if (!f || f.kind !== "object") throw new CertificationDbUnsupportedError(`${modelName}.include: "${key}" no es relación.`);
        out[key] = this.projectRelation(modelName, row, f, spec);
      }
    }
    return out;
  }

  private projectRelation(modelName: string, row: Row, field: DmmfField, spec: unknown): unknown {
    const nested = (isPlainObject(spec) ? spec : {}) as Args;
    const related = this.related(modelName, row, field);
    if (field.isList) {
      let list = (related as Row[]).filter((r) => this.matches(field.type, r, nested.where as Where | undefined));
      list = this.sortRows(field.type, list, nested.orderBy);
      if (typeof nested.skip === "number") list = list.slice(nested.skip);
      if (typeof nested.take === "number") list = list.slice(0, nested.take);
      return list.map((r) => this.project(field.type, r, nested.select as Args | undefined, nested.include as Args | undefined));
    }
    const target = related as Row | null;
    return target ? this.project(field.type, target, nested.select as Args | undefined, nested.include as Args | undefined) : null;
  }

  private projectCount(modelName: string, row: Row, spec: unknown): Row {
    const meta = this.meta(modelName);
    const sel = isPlainObject(spec) && isPlainObject(spec.select)
      ? (spec.select as Args)
      : Object.fromEntries([...meta.fields.values()].filter((f) => f.kind === "object" && f.isList).map((f) => [f.name, true]));
    const out: Row = {};
    for (const [rel, s] of Object.entries(sel)) {
      if (!s) continue;
      const f = meta.fields.get(rel);
      if (!f || !f.isList) throw new CertificationDbUnsupportedError(`_count sobre "${rel}" no soportado.`);
      const where = isPlainObject(s) ? (s.where as Where | undefined) : undefined;
      out[rel] = (this.related(modelName, row, f) as Row[]).filter((r) => this.matches(f.type, r, where)).length;
    }
    return out;
  }

  // ── Escritura ───────────────────────────────────────────────────

  private applyScalarData(modelName: string, current: Row, data: Args, isCreate: boolean): Row {
    const meta = this.meta(modelName);
    const next: Row = { ...current };
    for (const [key, raw] of Object.entries(data)) {
      if (raw === undefined) continue;
      const f = meta.fields.get(key);
      if (!f) throw new CertificationDbUnsupportedError(`${modelName}.data: campo "${key}" desconocido.`);
      if (f.kind === "object") {
        this.applyRelationWrite(modelName, next, f, raw);
        continue;
      }
      if (isPlainObject(raw) && f.type !== "Json") {
        const [op, val] = Object.entries(raw)[0] ?? [];
        if (isCreate || !op) throw new CertificationDbUnsupportedError(`${modelName}.${key}: operación de escritura inválida.`);
        const cur = current[key];
        if (op === "set") { next[key] = normalizeForField(f, val); continue; }
        if (f.type === "Decimal") {
          const base = new Prisma.Decimal((cur ?? 0) as Prisma.Decimal.Value);
          const d = new Prisma.Decimal(val as Prisma.Decimal.Value);
          next[key] = op === "increment" ? base.plus(d) : op === "decrement" ? base.minus(d)
            : op === "multiply" ? base.times(d) : op === "divide" ? base.div(d) : (() => {
              throw new CertificationDbUnsupportedError(`Operación ${op} no soportada.`);
            })();
        } else {
          const base = (cur ?? 0) as number;
          const n = val as number;
          next[key] = op === "increment" ? base + n : op === "decrement" ? base - n
            : op === "multiply" ? base * n : op === "divide" ? base / n : (() => {
              throw new CertificationDbUnsupportedError(`Operación ${op} no soportada.`);
            })();
        }
        continue;
      }
      next[key] = normalizeForField(f, raw);
    }
    return next;
  }

  private applyRelationWrite(modelName: string, row: Row, field: DmmfField, raw: unknown) {
    if (!isPlainObject(raw) || !("connect" in raw) || Object.keys(raw).length !== 1 || !field.relationFromFields?.length) {
      throw new CertificationDbUnsupportedError(`${modelName}.${field.name}: escritura anidada no soportada (solo connect to-one).`);
    }
    const target = this.table(field.type).find((t) => this.matches(field.type, t, raw.connect as Where));
    if (!target) throw knownError("P2025", `No related ${field.type} found for connect.`);
    field.relationFromFields.forEach((from, i) => { row[from] = target[field.relationToFields![i]]; });
  }

  private applyDefaults(modelName: string, row: Row): Row {
    const meta = this.meta(modelName);
    for (const f of meta.scalars) {
      if (row[f.name] !== undefined) continue;
      if (f.isUpdatedAt) { row[f.name] = new Date(); continue; }
      const def = f.default as unknown;
      if (def !== undefined) {
        if (isPlainObject(def) && typeof def.name === "string") {
          if (def.name === "uuid" || def.name === "cuid") row[f.name] = randomUUID();
          else if (def.name === "now") row[f.name] = new Date();
          else if (def.name === "autoincrement") {
            const max = this.table(modelName).reduce((m, r) => Math.max(m, (r[f.name] as number) ?? 0), 0);
            row[f.name] = max + 1;
          } else {
            throw new CertificationDbUnsupportedError(`Default ${def.name} no soportado (${modelName}.${f.name}).`);
          }
        } else {
          row[f.name] = normalizeForField(f, def);
        }
        continue;
      }
      if (f.isRequired) {
        throw new Prisma.PrismaClientValidationError(
          `Argument \`${f.name}\` is missing. (${modelName}, certification in-memory)`,
          { clientVersion: "certification-in-memory" },
        );
      }
      row[f.name] = null;
    }
    return row;
  }

  private assertConstraints(modelName: string, row: Row, selfIndex: number | null) {
    const meta = this.meta(modelName);
    const rows = this.table(modelName);
    for (const fields of meta.uniques) {
      if (fields.some((f) => row[f] === null || row[f] === undefined)) continue; // NULL ≠ NULL en Postgres
      const clash = rows.findIndex((r, i) => i !== selfIndex && fields.every((f) => comparable(r[f]) === comparable(row[f])));
      if (clash >= 0) {
        throw knownError("P2002", `Unique constraint failed on the fields: (${fields.map((f) => `\`${f}\``).join(",")})`, {
          modelName,
          target: fields,
        });
      }
    }
    for (const f of meta.fields.values()) {
      if (f.kind !== "object" || !f.relationFromFields?.length) continue;
      const from = f.relationFromFields;
      if (from.some((c) => row[c] === null || row[c] === undefined)) continue;
      const to = f.relationToFields ?? [];
      const exists = this.table(f.type).some((t) => from.every((c, i) => t[to[i]] === row[c]));
      if (!exists) {
        throw knownError("P2003", `Foreign key constraint violated: ${modelName}.${from.join("+")} → ${f.type}`, {
          modelName,
          field_name: from.join(","),
        });
      }
    }
  }

  private create(modelName: string, args: Args): Row {
    this.assertKnownArgs(modelName, args, ["data", "select", "include"]);
    const row = this.applyDefaults(modelName, this.applyScalarData(modelName, {}, args.data as Args, true));
    this.assertConstraints(modelName, row, null);
    this.table(modelName).push(row);
    return this.project(modelName, row, args.select as Args | undefined, args.include as Args | undefined);
  }

  private createMany(modelName: string, args: Args) {
    this.assertKnownArgs(modelName, args, ["data", "skipDuplicates"]);
    const list = (Array.isArray(args.data) ? args.data : [args.data]) as Args[];
    let count = 0;
    for (const data of list) {
      try {
        this.create(modelName, { data });
        count++;
      } catch (err) {
        if (args.skipDuplicates && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    return { count };
  }

  private updateRowAt(modelName: string, index: number, data: Args): Row {
    const rows = this.table(modelName);
    const next = this.applyScalarData(modelName, rows[index], data, false);
    for (const f of this.meta(modelName).scalars) {
      if (f.isUpdatedAt && data[f.name] === undefined) next[f.name] = new Date();
    }
    this.assertConstraints(modelName, next, index);
    rows[index] = next;
    return next;
  }

  private update(modelName: string, args: Args): Row {
    this.assertKnownArgs(modelName, args, ["where", "data", "select", "include"]);
    this.validateWhere(modelName, args.where);
    const rows = this.table(modelName);
    const index = rows.findIndex((r) => this.matches(modelName, r, args.where as Where));
    if (index < 0) throw knownError("P2025", "Record to update not found.", { modelName });
    const next = this.updateRowAt(modelName, index, args.data as Args);
    return this.project(modelName, next, args.select as Args | undefined, args.include as Args | undefined);
  }

  private updateMany(modelName: string, args: Args) {
    this.assertKnownArgs(modelName, args, ["where", "data"]);
    this.validateWhere(modelName, args.where);
    const rows = this.table(modelName);
    const indexes = rows.map((r, i) => (this.matches(modelName, r, args.where as Where | undefined) ? i : -1)).filter((i) => i >= 0);
    for (const i of indexes) this.updateRowAt(modelName, i, args.data as Args);
    return { count: indexes.length };
  }

  private upsert(modelName: string, args: Args): Row {
    this.assertKnownArgs(modelName, args, ["where", "create", "update", "select", "include"]);
    this.validateWhere(modelName, args.where);
    const rows = this.table(modelName);
    const index = rows.findIndex((r) => this.matches(modelName, r, args.where as Where));
    if (index < 0) return this.create(modelName, { data: args.create, select: args.select, include: args.include });
    const next = this.updateRowAt(modelName, index, (args.update ?? {}) as Args);
    return this.project(modelName, next, args.select as Args | undefined, args.include as Args | undefined);
  }

  private delete(modelName: string, args: Args): Row {
    this.assertKnownArgs(modelName, args, ["where", "select"]);
    const rows = this.table(modelName);
    const index = rows.findIndex((r) => this.matches(modelName, r, args.where as Where));
    if (index < 0) throw knownError("P2025", "Record to delete does not exist.", { modelName });
    const [removed] = rows.splice(index, 1);
    return this.project(modelName, removed, args.select as Args | undefined);
  }

  private deleteMany(modelName: string, args: Args) {
    this.assertKnownArgs(modelName, args, ["where"]);
    const rows = this.table(modelName);
    const keep = rows.filter((r) => !this.matches(modelName, r, args.where as Where | undefined));
    const count = rows.length - keep.length;
    this.tables.set(modelName, keep);
    return { count };
  }
}
