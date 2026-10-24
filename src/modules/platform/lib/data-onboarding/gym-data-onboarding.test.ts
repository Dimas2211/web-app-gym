// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — gym-data-onboarding.test.ts
//
// GYM-ONBOARDING — gym_clients y gym_trainers de punta a punta con piezas
// REALES: plantilla → parser → analizador DB-aware → runner, sobre una
// base física en memoria (InMemoryDb: transacciones con rollback real,
// uniques P2002, advisory lock) que contiene DOS tenants (Shared).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import type { PrismaClient } from "@prisma/client";
import { InMemoryDb } from "../provisioning/provisioning-test-harness";
import { generateDataOnboardingTemplate, TEMPLATE_AVAILABLE_KEYS } from "./excel-template-generator";
import { parseDataOnboardingWorkbook } from "./excel-preview-parser";
import { analyzeDataOnboardingPreviewAgainstDatabase } from "./db-aware-preview-analyzer";
import { runGymClientsImport } from "./import-runners/gym-clients-import-runner";
import { runGymTrainersImport } from "./import-runners/gym-trainers-import-runner";
import { allocateOperationalCodes } from "./gym-onboarding-fields";
import type {
  DataOnboardingDbAwarePreviewResult,
  DataOnboardingPreviewResult,
  GymClientsImportResult,
  GymImportDryRunResult,
  GymTrainersImportResult,
} from "../../types/platform.types";

const TENANT_A = "TENANT_A";
const TENANT_B = "TENANT_B";

const CLIENT_HEADERS = [
  "first_name*", "last_name*", "branch_name*", "operational_code", "document_id", "birth_date", "gender",
  "email", "phone", "address", "emergency_contact_name", "emergency_contact_phone", "sport_name",
  "goal_name", "modality", "notes", "status",
];
const TRAINER_HEADERS = [
  "first_name*", "last_name*", "branch_name*", "email", "phone", "specialty", "personalized_capacity", "notes", "status",
];

function workbook(headers: string[], rows: Record<string, unknown>[]): Buffer {
  const keys = headers.map((h) => h.replace(/\*$/, ""));
  const aoa = [headers, ...rows.map((r) => keys.map((k) => r[k] ?? null))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Datos");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function createDb(): InMemoryDb {
  return new InMemoryDb({
    gym:              { uniques: [["tenant_id"]] },
    gymSettings:      { uniques: [["gym_id"]] },
    branch:           { uniques: [] },
    client:           { uniques: [["gym_id", "operational_code"], ["qr_token"], ["user_id"]] },
    trainer:          { uniques: [["user_id"]] },
    sport:            { uniques: [["name"]] },
    goal:             { uniques: [["name"]] },
    user:             { uniques: [] },
    clientMembership: { uniques: [] },
    payment:          { uniques: [] },
  });
}

const asClient = (db: InMemoryDb) => db.client as unknown as PrismaClient;

let db: InMemoryDb;
let gymA: { id: string };
let gymB: { id: string };
let branchA: { id: string };

function snapshot(tenantId: string) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(db.tables).map(([t, rows]) => [t, rows.filter((r) => r.tenant_id === tenantId)])),
  );
}

beforeEach(() => {
  db = createDb();
  gymA = db.seed("gym", { tenant_id: TENANT_A, name: "Power Gym", slug: "power" });
  gymB = db.seed("gym", { tenant_id: TENANT_B, name: "Otro Gym", slug: "otro" });
  branchA = db.seed("branch", { tenant_id: TENANT_A, gym_id: gymA.id, name: "Sede Central", status: "active" });
  db.seed("branch", { tenant_id: TENANT_A, gym_id: gymA.id, name: "Sede Cerrada", status: "inactive" });
  db.seed("branch", { tenant_id: TENANT_B, gym_id: gymB.id, name: "Sede Central", status: "active" });
  db.seed("branch", { tenant_id: TENANT_B, gym_id: gymB.id, name: "Solo B", status: "active" });
  db.seed("sport", { name: "Crossfit", status: "active" });
  db.seed("goal", { name: "Pérdida de peso", status: "active" });
  // Tenant B ya tiene un cliente con el mismo código/documento que A usará.
  db.seed("client", {
    tenant_id: TENANT_B, gym_id: gymB.id, branch_id: "b", first_name: "Ana", last_name: "Pérez",
    operational_code: "C1010", document_id: "01234567-8", qr_token: "qr-b",
  });
  db.seed("trainer", { tenant_id: TENANT_B, gym_id: gymB.id, branch_id: "b", first_name: "Carlos", last_name: "Ruiz", email: "carlos@x.com" });
});

async function pipeline(
  datasetKey: "gym_clients" | "gym_trainers",
  rows: Record<string, unknown>[],
  opts: { tenantId?: string; isDryRun?: boolean; classes?: boolean; client?: PrismaClient } = {},
) {
  const tenantId = opts.tenantId ?? TENANT_A;
  const parsed: DataOnboardingPreviewResult = parseDataOnboardingWorkbook({
    datasetKey,
    fileBuffer: workbook(datasetKey === "gym_clients" ? CLIENT_HEADERS : TRAINER_HEADERS, rows),
  });
  const analysis: DataOnboardingDbAwarePreviewResult = await analyzeDataOnboardingPreviewAgainstDatabase({
    datasetKey, parsedPreview: parsed, importPolicy: "CREATE_ONLY", prismaClient: asClient(db), tenantId,
    gymOptions: { classesModuleEnabled: opts.classes ?? false },
  });
  const run = () => (datasetKey === "gym_clients" ? runGymClientsImport : runGymTrainersImport)({
    parsedPreview: parsed, dbAwareResult: analysis, prismaClient: opts.client ?? asClient(db),
    tenantId, isDryRun: opts.isDryRun ?? false,
  });
  return { parsed, analysis, run };
}

const ANA = { first_name: "Ana", last_name: "Pérez", branch_name: "Sede Central" };

// ─────────────────────────────────────────────────────────────────

describe("plantillas", () => {
  it("ambas plantillas existen, tienen hoja Datos y su fila de ejemplo es válida para el parser", () => {
    for (const key of ["gym_clients", "gym_trainers"] as const) {
      expect(TEMPLATE_AVAILABLE_KEYS.has(key)).toBe(true);
      const buffer = generateDataOnboardingTemplate(key, "Power Gym");
      const wb = XLSX.read(buffer, { type: "buffer" });
      expect(wb.SheetNames).toEqual(["Instrucciones", "Datos", "Campos", "Dependencias"]);
      const parsed = parseDataOnboardingWorkbook({ datasetKey: key, fileBuffer: buffer });
      expect(parsed.summary.totalRows).toBe(1);
      expect(parsed.summary.invalidRows).toBe(0);
    }
  });

  it("faltan encabezados requeridos → el parser rechaza el archivo", () => {
    expect(() => parseDataOnboardingWorkbook({
      datasetKey: "gym_clients",
      fileBuffer: workbook(["first_name*", "last_name*"], [{ first_name: "Ana", last_name: "Pérez" }]),
    })).toThrow(/branch_name/);
  });
});

describe("clientes GYM — importación válida", () => {
  it("crea clientes con gym_id de Gym.tenant_id, sucursal de A, códigos únicos y qr_token; sin User ni membresías", async () => {
    db.seed("client", {
      tenant_id: TENANT_A, gym_id: gymA.id, branch_id: branchA.id, first_name: "Previo", last_name: "Uno",
      operational_code: "C1012", qr_token: "qr-a",
    });
    const before = { users: db.count("user"), memberships: db.count("clientMembership"), payments: db.count("payment") };

    const { analysis, run } = await pipeline("gym_clients", [
      { ...ANA, birth_date: "1990-05-21", gender: "F", email: "ana@x.com", sport_name: "crossfit", goal_name: "Perdida de peso" },
      { first_name: "Luis", last_name: "Gómez", branch_name: "sede central" },
      { first_name: "Eva", last_name: "Díaz", branch_name: "Sede Central", operational_code: "VIP-1" },
      { first_name: "Leo", last_name: "Mora", branch_name: "Sede Central" },
    ]);
    expect(analysis.status).toBe("READY");
    expect(analysis.rows.every((r) => r.resolution === "CREATE")).toBe(true);

    const result = await run() as GymClientsImportResult;
    expect(result.created).toBe(4);

    const created = db.tables.client.filter((c) => c.tenant_id === TENANT_A && c.first_name !== "Previo");
    expect(created).toHaveLength(4);
    expect(created.every((c) => c.gym_id === gymA.id && c.branch_id === branchA.id)).toBe(true);
    expect(created.every((c) => c.user_id === null && c.assigned_trainer_id === null)).toBe(true);
    expect(created.map((c) => c.operational_code).sort()).toEqual(["C1013", "C1014", "C1015", "VIP-1"]);
    expect(new Set(created.map((c) => c.qr_token)).size).toBe(4);

    const ana = created.find((c) => c.first_name === "Ana")!;
    expect(ana).toMatchObject({ gender: "female", email: "ana@x.com", modality: "NORMAL", status: "active" });
    expect((ana.birth_date as Date).toISOString().slice(0, 10)).toBe("1990-05-21");
    expect(ana.sport_id).toBe(db.tables.sport[0].id);
    expect(ana.goal_id).toBe(db.tables.goal[0].id);

    expect({ users: db.count("user"), memberships: db.count("clientMembership"), payments: db.count("payment") }).toEqual(before);
  });

  it("datos opcionales ausentes → defaults (NORMAL, active, nulls)", async () => {
    const { run } = await pipeline("gym_clients", [ANA]);
    await run();
    const ana = db.tables.client.find((c) => c.tenant_id === TENANT_A)!;
    expect(ana).toMatchObject({
      modality: "NORMAL", status: "active", document_id: null, email: null, birth_date: null,
      gender: null, sport_id: null, goal_id: null, notes: null, operational_code: "C1010",
    });
  });

  it("respeta la configuración de códigos del gimnasio (GymSettings)", async () => {
    db.seed("gymSettings", { gym_id: gymA.id, client_code_prefix: "PG", client_code_digits: 5, client_code_start: 1 });
    const { run } = await pipeline("gym_clients", [ANA, { first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central" }]);
    const result = await run() as GymClientsImportResult;
    expect(result.rows.map((r) => r.code)).toEqual(["PG00001", "PG00002"]);
  });

  it("PERSONALIZED/GROUP sin gym.classes → ERROR; con gym.classes → CREATE", async () => {
    const without = await pipeline("gym_clients", [{ ...ANA, modality: "PERSONALIZED" }]);
    expect(without.analysis.rows[0].resolution).toBe("ERROR");
    expect(without.analysis.rows[0].errors.map((e) => e.code)).toContain("MODULE_NOT_ENABLED");

    const withClasses = await pipeline("gym_clients", [{ ...ANA, modality: "GROUP" }], { classes: true });
    expect(withClasses.analysis.rows[0].resolution).toBe("CREATE");
  });
});

describe("clientes GYM — validación y duplicados", () => {
  it("duplicados dentro del Excel: código, documento y misma persona bloquean; solo nombre advierte", async () => {
    const { parsed } = await pipeline("gym_clients", [
      { ...ANA, operational_code: "X1", document_id: "111" },
      { first_name: "Otro", last_name: "Uno", branch_name: "Sede Central", operational_code: "x1" },
      { first_name: "Otra", last_name: "Dos", branch_name: "Sede Central", document_id: "1-1-1" },
      { ...ANA, email: "ana@x.com" },
      { ...ANA, email: "ANA@x.com" },
      { first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central" },
      { first_name: "luis", last_name: "gomez", branch_name: "Sede Central" },
    ]);
    const byRow = (n: number) => parsed.rows.find((r) => r.rowNumber === n)!;
    expect(byRow(3).errors.map((e) => e.field)).toContain("operational_code");
    expect(byRow(4).errors.map((e) => e.field)).toContain("document_id");
    expect(byRow(6).status).toBe("ERROR");
    expect(byRow(8).status).toBe("WARNING");
    expect(byRow(8).warnings[0].code).toBe("POSSIBLE_DUPLICATE_IN_FILE");
  });

  it("tipos y obligatoriedad: requeridos, email, fecha, género, modalidad, status", async () => {
    const { parsed } = await pipeline("gym_clients", [
      { first_name: "", last_name: "X", branch_name: "" },
      { ...ANA, email: "no-es-email", birth_date: "2999-01-01", gender: "x", modality: "VIP", status: "deleted" },
    ]);
    expect(parsed.rows[0].errors.map((e) => e.field)).toEqual(expect.arrayContaining(["first_name", "branch_name"]));
    expect(parsed.rows[1].errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["email", "birth_date", "gender", "modality", "status"]),
    );
  });

  it("duplicados contra la BD del gimnasio: código y documento → ERROR; nombre+teléfono → ERROR; solo nombre → advertencia", async () => {
    db.seed("client", {
      tenant_id: TENANT_A, gym_id: gymA.id, branch_id: branchA.id, first_name: "Ana", last_name: "Pérez",
      operational_code: "C2000", document_id: "999", phone: "7777-1234", qr_token: "qr-a1",
    });
    const { analysis } = await pipeline("gym_clients", [
      { first_name: "Zoe", last_name: "Q", branch_name: "Sede Central", operational_code: "c2000" },
      { first_name: "Zoe", last_name: "R", branch_name: "Sede Central", document_id: "9 9 9" },
      { ...ANA, phone: "77771234" },
      { ...ANA },
    ]);
    expect(analysis.rows.map((r) => r.resolution)).toEqual(["ERROR", "ERROR", "ERROR", "CREATE"]);
    expect(analysis.summary.duplicatesInDatabase).toBe(3);
    expect(analysis.rows[3].warnings.map((w) => w.code)).toContain("POSSIBLE_DUPLICATE_NAME");
  });

  it("sucursal inexistente, inactiva o de otro tenant → ERROR (nunca resuelve la de B)", async () => {
    const { analysis } = await pipeline("gym_clients", [
      { ...ANA, branch_name: "No Existe" },
      { ...ANA, first_name: "B", branch_name: "Sede Cerrada" },
      { ...ANA, first_name: "C", branch_name: "Solo B" },
    ]);
    expect(analysis.rows.every((r) => r.resolution === "ERROR")).toBe(true);
    expect(analysis.rows[1].errors.map((e) => e.code)).toContain("BRANCH_NOT_ACTIVE");
    const branchIds = analysis.rows.flatMap((r) => r.dependencyChecks.filter((d) => d.foundId && d.dependencyType === "branch"));
    expect(branchIds).toEqual([]);
  });

  it("sucursal del tenant pero de otro gimnasio → BRANCH_GYM_MISMATCH", async () => {
    db.seed("branch", { tenant_id: TENANT_A, gym_id: gymB.id, name: "Rara", status: "active" });
    const { analysis } = await pipeline("gym_clients", [{ ...ANA, branch_name: "Rara" }]);
    expect(analysis.rows[0].errors.map((e) => e.code)).toContain("BRANCH_GYM_MISMATCH");
  });

  it("deporte u objetivo inexistente → ERROR (no se crean catálogos)", async () => {
    const { analysis } = await pipeline("gym_clients", [{ ...ANA, sport_name: "Ajedrez", goal_name: "Volar" }]);
    expect(analysis.rows[0].resolution).toBe("ERROR");
    expect(db.count("sport")).toBe(1);
    expect(db.count("goal")).toBe(1);
  });

  it("organización Commerce-only (sin extensión Gym) → todas las filas ERROR GYM_EXTENSION_MISSING", async () => {
    db.seed("branch", { tenant_id: "TENANT_COMMERCE", gym_id: null, name: "Sede Central", status: "active" });
    const { analysis } = await pipeline("gym_clients", [ANA], { tenantId: "TENANT_COMMERCE" });
    expect(analysis.status).toBe("BLOCKED");
    expect(analysis.rows[0].errors.map((e) => e.code)).toContain("GYM_EXTENSION_MISSING");
  });
});

describe("clientes GYM — dry-run, atomicidad y reintentos", () => {
  it("dry-run no escribe y anticipa los códigos que se asignarían", async () => {
    const before = JSON.stringify(db.tables);
    const { run } = await pipeline("gym_clients", [ANA, { first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central" }], { isDryRun: true });
    const dry = await run() as GymImportDryRunResult;
    expect(dry).toMatchObject({ wouldCreate: 2, blocked: 0 });
    expect(dry.rows.map((r) => r.code)).toEqual(["C1010", "C1011"]);
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it("fallo a mitad de la transacción → rollback completo (cero filas)", async () => {
    const base = asClient(db) as unknown as Record<string, unknown> & {
      $transaction: (cb: (tx: Record<string, Record<string, (a: unknown) => Promise<unknown>>>) => Promise<unknown>, o?: unknown) => Promise<unknown>;
    };
    const failing = {
      ...base,
      $transaction: (cb: (tx: unknown) => Promise<unknown>, o?: unknown) => base.$transaction(async (tx) => cb({
        ...tx,
        client: {
          ...tx.client,
          createMany: async (args: unknown) => {
            await tx.client.createMany(args);
            throw new Error("simulated crash after insert");
          },
        },
      }), o),
    } as unknown as PrismaClient;

    const { run } = await pipeline("gym_clients", [ANA, { first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central" }], { client: failing });
    await expect(run()).rejects.toThrow(/simulated crash/);
    expect(db.count("client", { tenant_id: TENANT_A })).toBe(0);
  });

  it("código explícito tomado por otro proceso entre análisis y ejecución → aborta sin escribir", async () => {
    const { run } = await pipeline("gym_clients", [{ ...ANA, operational_code: "C5000" }, { first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central" }]);
    db.seed("client", { tenant_id: TENANT_A, gym_id: gymA.id, branch_id: branchA.id, first_name: "Z", last_name: "Z", operational_code: "C5000", qr_token: "qr-z" });
    await expect(run()).rejects.toThrow(/C5000/);
    expect(db.count("client", { tenant_id: TENANT_A })).toBe(1);
  });

  it("reintento de un archivo ya aplicado (con código o documento) → todas las filas ERROR", async () => {
    const rows = [{ ...ANA, document_id: "555" }, { first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central", operational_code: "L-1" }];
    await (await pipeline("gym_clients", rows)).run();
    const retry = await pipeline("gym_clients", rows);
    expect(retry.analysis.rows.every((r) => r.resolution === "ERROR")).toBe(true);
    await expect(retry.run()).rejects.toThrow();
    expect(db.count("client", { tenant_id: TENANT_A })).toBe(2);
  });

  it("dos importaciones concurrentes del mismo gimnasio no repiten códigos (lock por gym)", async () => {
    const one = await pipeline("gym_clients", [ANA]);
    const two = await pipeline("gym_clients", [{ first_name: "Luis", last_name: "Gómez", branch_name: "Sede Central" }]);
    await Promise.all([one.run(), two.run()]);
    const codes = db.tables.client.filter((c) => c.tenant_id === TENANT_A).map((c) => c.operational_code);
    expect(new Set(codes).size).toBe(2);
  });
});

describe("Shared — aislamiento entre organizaciones", () => {
  it("el código/documento de B no bloquea a A; A solo escribe en su tenant y gym", async () => {
    const snapB = snapshot(TENANT_B);
    const { analysis, run } = await pipeline("gym_clients", [{ ...ANA, operational_code: "C1010", document_id: "01234567-8" }]);
    expect(analysis.rows[0].resolution).toBe("CREATE");
    await run();
    expect(db.tables.client.filter((c) => c.tenant_id === TENANT_A).every((c) => c.gym_id === gymA.id)).toBe(true);
    expect(snapshot(TENANT_B)).toBe(snapB);
  });

  it("control: el mismo archivo para B sí es duplicado", async () => {
    const { analysis } = await pipeline("gym_clients", [{ ...ANA, operational_code: "C1010" }], { tenantId: TENANT_B });
    expect(analysis.rows[0].resolution).toBe("ERROR");
  });

  it("entrenador de B con el mismo nombre/email no bloquea a A", async () => {
    const snapB = snapshot(TENANT_B);
    const { analysis, run } = await pipeline("gym_trainers", [{ first_name: "Carlos", last_name: "Ruiz", branch_name: "Sede Central", email: "carlos@x.com" }]);
    expect(analysis.rows[0].resolution).toBe("CREATE");
    await run();
    expect(db.count("trainer", { tenant_id: TENANT_A })).toBe(1);
    expect(snapshot(TENANT_B)).toBe(snapB);
  });
});

describe("entrenadores", () => {
  it("importación válida: user_id null, sucursal de A, capacidad opcional; sin User", async () => {
    const usersBefore = db.count("user");
    const { analysis, run } = await pipeline("gym_trainers", [
      { first_name: "Carlos", last_name: "Martínez", branch_name: "Sede Central", personalized_capacity: 3, specialty: "Funcional" },
      { first_name: "Marta", last_name: "Sol", branch_name: "Sede Central" },
    ]);
    expect(analysis.status).toBe("READY");
    const result = await run() as GymTrainersImportResult;
    expect(result.created).toBe(2);
    const created = db.tables.trainer.filter((t) => t.tenant_id === TENANT_A);
    expect(created.every((t) => t.user_id === null && t.gym_id === gymA.id && t.branch_id === branchA.id && t.status === "active")).toBe(true);
    expect(created.find((t) => t.first_name === "Carlos")!.personalized_capacity).toBe(3);
    expect(created.find((t) => t.first_name === "Marta")!.personalized_capacity).toBeNull();
    expect(db.count("user")).toBe(usersBefore);
  });

  it("personalized_capacity fuera de 1–50 o no entero → ERROR", async () => {
    const { parsed } = await pipeline("gym_trainers", [
      { first_name: "A", last_name: "A", branch_name: "Sede Central", personalized_capacity: 0 },
      { first_name: "B", last_name: "B", branch_name: "Sede Central", personalized_capacity: 51 },
      { first_name: "C", last_name: "C", branch_name: "Sede Central", personalized_capacity: "2.5" },
    ]);
    expect(parsed.rows.every((r) => r.errors.some((e) => e.field === "personalized_capacity"))).toBe(true);
  });

  it("duplicados en Excel (email / nombre) y en BD → ERROR; reintento bloqueado sin escribir", async () => {
    const { parsed } = await pipeline("gym_trainers", [
      { first_name: "A", last_name: "A", branch_name: "Sede Central", email: "a@x.com" },
      { first_name: "B", last_name: "B", branch_name: "Sede Central", email: "A@X.com" },
      { first_name: "a", last_name: "a", branch_name: "Sede Central" },
    ]);
    expect(parsed.rows[1].status).toBe("ERROR");
    expect(parsed.rows[2].status).toBe("ERROR");

    const rows = [{ first_name: "Marta", last_name: "Sol", branch_name: "Sede Central" }];
    await (await pipeline("gym_trainers", rows)).run();
    const retry = await pipeline("gym_trainers", rows);
    expect(retry.analysis.rows[0].resolution).toBe("ERROR");
    expect(retry.analysis.summary.duplicatesInDatabase).toBe(1);
    expect(db.count("trainer", { tenant_id: TENANT_A })).toBe(1);
  });

  it("dry-run sin escrituras", async () => {
    const before = JSON.stringify(db.tables);
    const { run } = await pipeline("gym_trainers", [{ first_name: "Marta", last_name: "Sol", branch_name: "Sede Central" }], { isDryRun: true });
    expect(await run()).toMatchObject({ wouldCreate: 1, blocked: 0 });
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it("sin extensión Gym → ERROR", async () => {
    const { analysis } = await pipeline("gym_trainers", [{ first_name: "M", last_name: "S", branch_name: "Sede Central" }], { tenantId: "TENANT_COMMERCE" });
    expect(analysis.rows[0].errors.map((e) => e.code)).toContain("GYM_EXTENSION_MISSING");
  });
});

describe("allocateOperationalCodes", () => {
  it("genera N códigos únicos a partir del máximo usado, saltando ocupados", () => {
    const used = new Set(["C1010", "C1013", "X99", "C10AB"]);
    expect(allocateOperationalCodes({ prefix: "C", digits: 4, start: 1010, usedCodes: used, count: 3 }))
      .toEqual(["C1014", "C1015", "C1016"]);
    expect(allocateOperationalCodes({ prefix: "C", digits: 4, start: 1010, usedCodes: new Set(), count: 2 }))
      .toEqual(["C1010", "C1011"]);
  });
});
