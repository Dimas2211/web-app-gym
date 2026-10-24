// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — gym-db-aware-analyzer.ts
//
// GYM-ONBOARDING. Análisis DB-aware de gym_clients y gym_trainers contra
// la base runtime de la organización destino (Shared o Dedicated).
//
// Reglas:
// - SOLO lecturas (findUnique/findMany). Sin escrituras.
// - gym_id se resuelve por Gym.tenant_id — nunca gym.id === tenantId.
//   Sin extensión Gym → todas las filas ERROR.
// - Sucursal: Branch del MISMO tenant (WHERE tenant_id), activa, por
//   nombre sin ambigüedad, y si tiene gym_id debe ser el gym destino.
//   Nunca se crean sucursales.
// - Deporte/objetivo: catálogos existentes y activos, sin ambigüedad.
// - Duplicados (siempre dentro del gym del tenant, nunca de otro tenant):
//   clientes: operational_code o document_id existentes, o misma persona
//   con nombre + email/teléfono/fecha de nacimiento → ERROR. Solo nombre
//   → advertencia (no se fusiona ni se asume duplicado).
//   entrenadores: mismo email o mismo nombre completo → ERROR.
// - Validación final con los schemas Zod del alta individual
//   (createClientSchema / createTrainerSchema).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingImportPolicy,
  DataOnboardingPreviewResult,
  DataOnboardingPreviewRow,
  DataOnboardingDbAwarePreviewResult,
  DataOnboardingDbAwareRow,
  DataOnboardingDependencyCheck,
  DataOnboardingRowError,
  DataOnboardingRowWarning,
} from "../../types/platform.types";
import { createClientSchema } from "@/modules/clients/schemas";
import { createTrainerSchema } from "@/modules/trainers/schemas";
import { applyImportPolicy } from "./import-policy";
import {
  strVal,
  isBlank,
  normalizeKey,
  normalizeDocument,
  normalizePhone,
  normalizeOperationalCode,
  personKey,
  parseGender,
  parseBirthDate,
  parseModality,
  parsePersonalizedCapacity,
} from "./gym-onboarding-fields";

export interface GymAnalyzerOptions {
  /** gym.classes habilitado — requisito de PERSONALIZED/GROUP (como createClientAction). Default false (fail-closed). */
  classesModuleEnabled?: boolean;
}

type Summary = DataOnboardingDbAwarePreviewResult["summary"];

function summarize(rows: DataOnboardingDbAwareRow[]): Summary {
  return {
    analyzedRows:         rows.length,
    createRows:           rows.filter((r) => r.resolution === "CREATE").length,
    updateRows:           rows.filter((r) => r.resolution === "UPDATE").length,
    skipRows:             rows.filter((r) => r.resolution === "SKIP").length,
    errorRows:            rows.filter((r) => r.resolution === "ERROR").length,
    missingDependencies:  rows.filter((r) => r.dependencyChecks.some((d) => !d.found)).length,
    duplicatesInDatabase: rows.filter((r) => r.errors.some((e) => e.code === "DUPLICATE_IN_DATABASE")).length,
  };
}

function statusOf(summary: Summary): DataOnboardingDbAwarePreviewResult["status"] {
  if (summary.errorRows > 0 || summary.missingDependencies > 0) return "BLOCKED";
  if (summary.skipRows > 0 || summary.duplicatesInDatabase > 0) return "READY_WITH_WARNINGS";
  return "READY";
}

// ── Contexto común: gym + sucursales del tenant ───────────────────

interface BranchRow { id: string; name: string; status: string; gym_id: string | null }

async function loadGymContext(db: PrismaClient, tenantId: string) {
  const [gym, branches] = await Promise.all([
    db.gym.findUnique({ where: { tenant_id: tenantId }, select: { id: true } }),
    db.branch.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true, status: true, gym_id: true },
    }) as Promise<BranchRow[]>,
  ]);
  return { gymId: gym?.id ?? null, branches };
}

function gymDependency(gymId: string | null): DataOnboardingDependencyCheck {
  return gymId
    ? { dependencyType: "gym", lookupField: "tenant_id", lookupValue: "Gym.tenant_id", found: true, foundId: gymId }
    : {
        dependencyType: "gym", lookupField: "tenant_id", lookupValue: "Gym.tenant_id", found: false,
        message: "La organización no tiene la extensión GYM (Gym) en su base runtime.",
      };
}

function resolveBranch(
  branchName: string,
  branches:   BranchRow[],
  gymId:      string,
): { check: DataOnboardingDependencyCheck; error?: DataOnboardingRowError } {
  const key     = normalizeKey(branchName);
  const matches = branches.filter((b) => normalizeKey(b.name) === key);
  const base    = { dependencyType: "branch", lookupField: "branch_name", lookupValue: branchName };

  const fail = (code: string, message: string) => ({
    check: { ...base, found: false, message },
    error: { code, field: "branch_name", message },
  });

  if (matches.length === 0) return fail("MISSING_DEPENDENCY", `Sucursal "${branchName}" no existe en la organización destino.`);
  if (matches.length > 1)   return fail("AMBIGUOUS_DEPENDENCY", `Sucursal "${branchName}" es ambigua: existen ${matches.length} sucursales con ese nombre.`);

  const branch = matches[0];
  if (branch.status !== "active") return fail("BRANCH_NOT_ACTIVE", `Sucursal "${branchName}" no está activa (status=${branch.status}).`);
  if (branch.gym_id && branch.gym_id !== gymId) {
    return fail("BRANCH_GYM_MISMATCH", `Sucursal "${branchName}" no pertenece al gimnasio de la organización destino.`);
  }
  return { check: { ...base, found: true, foundId: branch.id } };
}

function resolveCatalog(
  type:  "sport" | "goal",
  field: "sport_name" | "goal_name",
  value: string,
  items: { id: string; name: string }[],
): { check: DataOnboardingDependencyCheck; error?: DataOnboardingRowError } {
  const label   = type === "sport" ? "Deporte" : "Objetivo";
  const matches = items.filter((i) => normalizeKey(i.name) === normalizeKey(value));
  const base    = { dependencyType: type, lookupField: field, lookupValue: value };
  if (matches.length === 1) return { check: { ...base, found: true, foundId: matches[0].id } };
  const message = matches.length === 0
    ? `${label} "${value}" no existe (o no está activo) en el catálogo. No se crea desde este import.`
    : `${label} "${value}" es ambiguo: hay ${matches.length} coincidencias en el catálogo.`;
  return {
    check: { ...base, found: false, message },
    error: { code: matches.length === 0 ? "MISSING_DEPENDENCY" : "AMBIGUOUS_DEPENDENCY", field, message },
  };
}

function errorRow(row: DataOnboardingPreviewRow, naturalKey: string, deps: DataOnboardingDependencyCheck[] = [], extra: DataOnboardingRowError[] = []): DataOnboardingDbAwareRow {
  return {
    rowNumber:        row.rowNumber,
    resolution:       "ERROR",
    naturalKey,
    existsInDb:       false,
    errors:           [...row.errors, ...extra],
    warnings:         [...row.warnings],
    dependencyChecks: deps,
  };
}

function zodErrors(issues: { path: (string | number)[]; message: string }[]): DataOnboardingRowError[] {
  return issues.map((i) => ({ code: "SCHEMA_VALIDATION", field: String(i.path[0] ?? ""), message: i.message }));
}

function nullable(v: unknown): string | null {
  const s = strVal(v);
  return s === "" ? null : s;
}

// ─────────────────────────────────────────────────────────────────
// GYM CLIENTS
// ─────────────────────────────────────────────────────────────────

export function gymClientNaturalKey(data: Record<string, unknown>): string {
  if (!isBlank(data.operational_code)) return `CODE:${normalizeOperationalCode(data.operational_code)}`;
  if (!isBlank(data.document_id))      return `DOC:${normalizeDocument(data.document_id)}`;
  return `${strVal(data.first_name)} ${strVal(data.last_name)}`.trim() || "(vacío)";
}

export async function analyzeGymClients(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
  options:      GymAnalyzerOptions = {},
): Promise<DataOnboardingDbAwarePreviewResult> {
  const { gymId, branches } = await loadGymContext(db, tenantId);

  const [existing, sports, goals] = gymId
    ? await Promise.all([
        db.client.findMany({
          where:  { gym_id: gymId },
          select: {
            first_name: true, last_name: true, document_id: true, operational_code: true,
            email: true, phone: true, birth_date: true,
          },
        }),
        db.sport.findMany({ where: { status: "active" }, select: { id: true, name: true } }),
        db.goal.findMany({ where: { status: "active" }, select: { id: true, name: true } }),
      ])
    : [[], [], []];

  const codes   = new Set<string>();
  const docs    = new Set<string>();
  const strong  = new Set<string>();
  const names   = new Set<string>();
  for (const c of existing) {
    if (c.operational_code) codes.add(normalizeOperationalCode(c.operational_code));
    if (c.document_id)      docs.add(normalizeDocument(c.document_id));
    const name = personKey(c.first_name, c.last_name);
    names.add(name);
    if (c.email)                 strong.add(`${name}|email:${normalizeKey(c.email)}`);
    if (normalizePhone(c.phone)) strong.add(`${name}|phone:${normalizePhone(c.phone)}`);
    if (c.birth_date)            strong.add(`${name}|birth:${new Date(c.birth_date).toISOString().slice(0, 10)}`);
  }

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const data       = row.data;
    const naturalKey = gymClientNaturalKey(data);

    if (row.status === "ERROR") { dbRows.push(errorRow(row, naturalKey)); continue; }

    const deps: DataOnboardingDependencyCheck[] = [gymDependency(gymId)];
    if (!gymId) {
      dbRows.push(errorRow(row, naturalKey, deps, [{
        code: "GYM_EXTENSION_MISSING", message: "La organización no tiene la extensión GYM configurada. No se pueden importar clientes GYM.",
      }]));
      continue;
    }

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];

    const branch = resolveBranch(strVal(data.branch_name), branches, gymId);
    deps.push(branch.check);
    if (branch.error) errors.push(branch.error);

    let sportId: string | null = null;
    if (!isBlank(data.sport_name)) {
      const r = resolveCatalog("sport", "sport_name", strVal(data.sport_name), sports);
      deps.push(r.check);
      if (r.error) errors.push(r.error); else sportId = r.check.foundId ?? null;
    }
    let goalId: string | null = null;
    if (!isBlank(data.goal_name)) {
      const r = resolveCatalog("goal", "goal_name", strVal(data.goal_name), goals);
      deps.push(r.check);
      if (r.error) errors.push(r.error); else goalId = r.check.foundId ?? null;
    }

    const modality = parseModality(data.modality);
    if (modality !== "INVALID" && modality !== "NORMAL" && !options.classesModuleEnabled) {
      errors.push({
        code: "MODULE_NOT_ENABLED", field: "modality",
        message: `La modalidad ${modality} requiere el módulo de clases (gym.classes) habilitado para la organización.`,
      });
    }

    // Duplicados contra el gimnasio destino.
    const duplicateErrors: DataOnboardingRowError[] = [];
    if (!isBlank(data.operational_code) && codes.has(normalizeOperationalCode(data.operational_code))) {
      duplicateErrors.push({ code: "DUPLICATE_IN_DATABASE", field: "operational_code", message: `El código operativo "${strVal(data.operational_code)}" ya existe en el gimnasio.` });
    }
    if (!isBlank(data.document_id) && docs.has(normalizeDocument(data.document_id))) {
      duplicateErrors.push({ code: "DUPLICATE_IN_DATABASE", field: "document_id", message: `Ya existe un cliente con el documento "${strVal(data.document_id)}".` });
    }
    const name  = personKey(data.first_name, data.last_name);
    const birth = parseBirthDate(data.birth_date);
    const strongMatch = [
      !isBlank(data.email)       ? `${name}|email:${normalizeKey(data.email)}` : null,
      normalizePhone(data.phone) ? `${name}|phone:${normalizePhone(data.phone)}` : null,
      birth && birth !== "INVALID" ? `${name}|birth:${birth}` : null,
    ].some((k) => k !== null && strong.has(k));
    if (strongMatch) {
      duplicateErrors.push({
        code: "DUPLICATE_IN_DATABASE", field: "first_name+last_name",
        message: "Posible duplicado: ya existe un cliente con el mismo nombre y el mismo email, teléfono o fecha de nacimiento. No se fusionan registros.",
      });
    } else if (names.has(name)) {
      warnings.push({
        code: "POSSIBLE_DUPLICATE_NAME", field: "first_name+last_name",
        message: `Ya existe un cliente llamado "${strVal(data.first_name)} ${strVal(data.last_name)}". Verifique que no sea la misma persona.`,
      });
    }

    // Validación final con el schema del alta individual.
    if (branch.check.foundId) {
      const gender = parseGender(data.gender);
      const parsed = createClientSchema.safeParse({
        first_name:              strVal(data.first_name),
        last_name:               strVal(data.last_name),
        document_id:             nullable(data.document_id),
        birth_date:              birth === "INVALID" ? "INVALID" : birth,
        gender:                  gender === "INVALID" ? "INVALID" : gender,
        email:                   nullable(data.email),
        phone:                   nullable(data.phone),
        address:                 nullable(data.address),
        emergency_contact_name:  nullable(data.emergency_contact_name),
        emergency_contact_phone: nullable(data.emergency_contact_phone),
        sport_id:                sportId,
        goal_id:                 goalId,
        assigned_trainer_id:     null,
        notes:                   nullable(data.notes),
        branch_id:               branch.check.foundId,
        modality:                modality === "INVALID" ? "INVALID" : modality,
      });
      if (!parsed.success) errors.push(...zodErrors(parsed.error.issues));
    }

    const existsInDb = duplicateErrors.length > 0;
    const policy     = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...(existsInDb ? duplicateErrors : policy.errors));
    warnings.push(...policy.warnings);

    dbRows.push({
      rowNumber:        row.rowNumber,
      resolution:       errors.length > 0 ? "ERROR" : policy.resolution,
      naturalKey,
      existsInDb,
      errors,
      warnings,
      dependencyChecks: deps,
    });
  }

  const summary = summarize(dbRows);
  return { datasetKey: "gym_clients", importPolicy, status: statusOf(summary), summary, rows: dbRows };
}

// ─────────────────────────────────────────────────────────────────
// GYM TRAINERS
// ─────────────────────────────────────────────────────────────────

export function gymTrainerNaturalKey(data: Record<string, unknown>): string {
  return `${strVal(data.first_name)} ${strVal(data.last_name)}`.trim() || "(vacío)";
}

export async function analyzeGymTrainers(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const { gymId, branches } = await loadGymContext(db, tenantId);

  const existing = gymId
    ? await db.trainer.findMany({
        where:  { gym_id: gymId },
        select: { first_name: true, last_name: true, email: true },
      })
    : [];
  const emails = new Set(existing.map((t) => normalizeKey(t.email)).filter(Boolean));
  const names  = new Set(existing.map((t) => personKey(t.first_name, t.last_name)));

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const data       = row.data;
    const naturalKey = gymTrainerNaturalKey(data);

    if (row.status === "ERROR") { dbRows.push(errorRow(row, naturalKey)); continue; }

    const deps: DataOnboardingDependencyCheck[] = [gymDependency(gymId)];
    if (!gymId) {
      dbRows.push(errorRow(row, naturalKey, deps, [{
        code: "GYM_EXTENSION_MISSING", message: "La organización no tiene la extensión GYM configurada. No se pueden importar entrenadores.",
      }]));
      continue;
    }

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];

    const branch = resolveBranch(strVal(data.branch_name), branches, gymId);
    deps.push(branch.check);
    if (branch.error) errors.push(branch.error);

    const duplicateErrors: DataOnboardingRowError[] = [];
    if (!isBlank(data.email) && emails.has(normalizeKey(data.email))) {
      duplicateErrors.push({ code: "DUPLICATE_IN_DATABASE", field: "email", message: `Ya existe un entrenador con el email "${strVal(data.email)}".` });
    }
    if (names.has(personKey(data.first_name, data.last_name))) {
      duplicateErrors.push({ code: "DUPLICATE_IN_DATABASE", field: "first_name+last_name", message: `Ya existe un entrenador llamado "${naturalKey}" en el gimnasio. No se modifican entrenadores existentes.` });
    }

    if (branch.check.foundId) {
      const capacity = parsePersonalizedCapacity(data.personalized_capacity);
      const parsed = createTrainerSchema.safeParse({
        first_name:            strVal(data.first_name),
        last_name:             strVal(data.last_name),
        email:                 nullable(data.email),
        phone:                 nullable(data.phone),
        specialty:             nullable(data.specialty),
        notes:                 nullable(data.notes),
        branch_id:             branch.check.foundId,
        user_id:               null,
        personalized_capacity: capacity === "INVALID" ? "INVALID" : capacity,
      });
      if (!parsed.success) errors.push(...zodErrors(parsed.error.issues));
    }

    const existsInDb = duplicateErrors.length > 0;
    const policy     = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...(existsInDb ? duplicateErrors : policy.errors));
    warnings.push(...policy.warnings);

    dbRows.push({
      rowNumber:        row.rowNumber,
      resolution:       errors.length > 0 ? "ERROR" : policy.resolution,
      naturalKey,
      existsInDb,
      errors,
      warnings,
      dependencyChecks: deps,
    });
  }

  const summary = summarize(dbRows);
  return { datasetKey: "gym_trainers", importPolicy, status: statusOf(summary), summary, rows: dbRows };
}
