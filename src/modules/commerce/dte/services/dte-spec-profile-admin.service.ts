// ─────────────────────────────────────────────────────────────────
// commerce/dte — services/dte-spec-profile-admin.service.ts
//
// MH20 (Fase 5.1E, IMP20-004) — cambio ADMINISTRATIVO del perfil normativo
// (DteIssuerConfig.mh_spec_profile) de UN emisor en UN ambiente.
//
// Única vía de escritura de mh_spec_profile en dte_issuer_configs (las
// acciones de create/update del emisor usan listas blancas sin ese campo).
//
// Verificaciones (en orden, todas server-side, fail-closed):
//   1. Perfil destino conocido; motivo ≥ 10 caracteres.
//   2. Interruptor global: MH_2_0 exige DTE_MH20_PROFILE_ENABLED = "true".
//      Volver a MH_1_2 (rollback) se permite siempre.
//   3. Persistencia compatible: columna M1 y tabla de auditoría M1b.
//   4. Aislamiento: el emisor debe pertenecer a tenant_id/location_id de la
//      sesión (nunca del formulario). TEST y PRODUCTION son filas distintas
//      (@@unique tenant+location+environment): se cambia solo la indicada.
//   5. MH_2_0: schemas del registro disponibles (01/03/05/14), catálogos 2.0
//      sembrados completos, territorio del emisor proyectable a 2.0.
//   6. MH_2_0 en PRODUCTION: rechazado mientras existan bloqueos P0.
//   7. Escritura atómica con control de concurrencia (valor anterior
//      esperado) + registro inmutable en dte_spec_profile_audit_logs.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isDteMh20ProfileEnabled } from "../config/dte-mh20.flags";
import { isDteSpecProfile, type DteSpecProfile } from "../spec/dte-spec-profile";
import { getDteSchemaByVersion, getDteSpec, type DteSpecKind } from "../spec/dte-spec-registry";
import { DTE_CATALOGS_VERSIONED_MH20, DTE_CATALOG_VERSION_MH20 } from "../spec/dte-catalog-version";
import { openMh20ProductionBlockers } from "../spec/mh20-activation-blockers";
import { resolveMhTerritory20 } from "../utils/dte-territory-projection";
import { DTE_CATALOG_ITEMS_MH20 } from "../../../../../prisma/seeds/data/dte-catalog-items-mh20.data";

type Env = Readonly<Record<string, string | undefined>>;

/** Tipos que deben tener schema 2.0 disponible y no bloqueado para activar. */
const MH20_REQUIRED_KINDS: readonly DteSpecKind[] = ["01", "03", "05", "14"];

export const DTE_SPEC_PROFILE_REASON_MIN = 10;

export interface SetDteSpecProfileInput {
  tenant_id:        string;
  location_id:      string;
  issuer_config_id: string;
  target_profile:   string;
  reason:           string;
  actor_id:         string;
  actor_scope?:     string | null;
}

export type SetDteSpecProfileErrorCode =
  | "INVALID_INPUT"
  | "GLOBAL_SWITCH_OFF"
  | "PERSISTENCE_INCOMPATIBLE"
  | "NOT_FOUND"
  | "SCHEMA_UNAVAILABLE"
  | "CATALOGS_MISSING"
  | "TERRITORY_INVALID"
  | "PRODUCTION_BLOCKED"
  | "CONFLICT";

export type SetDteSpecProfileResult =
  | { ok: true; changed: boolean; previous_profile: DteSpecProfile; new_profile: DteSpecProfile; environment: string; warnings: string[] }
  | { ok: false; code: SetDteSpecProfileErrorCode; error: string; details?: string[] };

const fail = (code: SetDteSpecProfileErrorCode, error: string, details?: string[]): SetDteSpecProfileResult =>
  ({ ok: false, code, error, ...(details ? { details } : {}) });

/** Columna M1 + tabla M1b presentes en la base runtime. Solo lectura. */
export async function checkSpecProfilePersistence(db: PrismaClient): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const rows = await db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND ((table_name = 'dte_issuer_configs' AND column_name = 'mh_spec_profile')
        OR (table_name = 'dte_spec_profile_audit_logs' AND column_name = 'new_profile'))`;
  const found = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing: string[] = [];
  if (!found.has("dte_issuer_configs.mh_spec_profile")) missing.push("M1: dte_issuer_configs.mh_spec_profile");
  if (!found.has("dte_spec_profile_audit_logs.new_profile")) missing.push("M1b: dte_spec_profile_audit_logs");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** Schemas 2.0 de los tipos requeridos disponibles y no bloqueados. Puro. */
export function checkMh20SchemasAvailable(): string[] {
  const problems: string[] = [];
  for (const kind of MH20_REQUIRED_KINDS) {
    const spec = getDteSpec("MH_2_0", kind);
    if (!spec) { problems.push(`${kind}: sin entrada en el registro MH_2_0`); continue; }
    if (spec.blocked) { problems.push(`${kind}: bloqueado (${spec.blocked})`); continue; }
    if (!getDteSchemaByVersion(kind, spec.version)) problems.push(`${kind}: schema v${spec.version} no disponible`);
  }
  return problems;
}

/** Catálogos 2.0 sembrados completos (version "2.0"). Solo lectura. */
export async function checkMh20CatalogsSeeded(db: PrismaClient): Promise<string[]> {
  const expected = new Map<string, number>();
  for (const r of DTE_CATALOG_ITEMS_MH20) expected.set(r.catalog_code, (expected.get(r.catalog_code) ?? 0) + 1);
  const problems: string[] = [];
  for (const catalog_code of DTE_CATALOGS_VERSIONED_MH20) {
    const count = await db.dteCatalogItem.count({
      where: { catalog_code, version: DTE_CATALOG_VERSION_MH20, is_active: true },
    });
    const want = expected.get(catalog_code) ?? 0;
    if (count < want) problems.push(`${catalog_code}: ${count}/${want} filas version ${DTE_CATALOG_VERSION_MH20}`);
  }
  return problems;
}

export async function setDteIssuerSpecProfile(
  input: SetDteSpecProfileInput,
  db: PrismaClient = prisma,
  env: Env = process.env,
): Promise<SetDteSpecProfileResult> {
  const { tenant_id, location_id, issuer_config_id, actor_id } = input;
  const reason = (input.reason ?? "").trim();

  // 1. Entrada
  if (!isDteSpecProfile(input.target_profile)) {
    return fail("INVALID_INPUT", "Perfil normativo desconocido. Valores admitidos: MH_1_2, MH_2_0.");
  }
  const target: DteSpecProfile = input.target_profile;
  if (reason.length < DTE_SPEC_PROFILE_REASON_MIN) {
    return fail("INVALID_INPUT", `El motivo del cambio es obligatorio (mínimo ${DTE_SPEC_PROFILE_REASON_MIN} caracteres).`);
  }
  if (!tenant_id || !location_id || !issuer_config_id || !actor_id) {
    return fail("INVALID_INPUT", "Faltan datos de contexto (tenant, location, emisor o actor).");
  }

  // 2. Interruptor global
  if (target === "MH_2_0" && !isDteMh20ProfileEnabled(env)) {
    return fail("GLOBAL_SWITCH_OFF", "El perfil MH 2.0 está desactivado globalmente (DTE_MH20_PROFILE_ENABLED).");
  }

  // 3. Persistencia compatible
  const persistence = await checkSpecProfilePersistence(db);
  if (!persistence.ok) {
    return fail("PERSISTENCE_INCOMPATIBLE", "La base runtime no tiene las migraciones del perfil normativo aplicadas.", persistence.missing);
  }

  // 4. Aislamiento por organización / emisor / ambiente
  const issuer = await db.dteIssuerConfig.findFirst({
    where:  { id: issuer_config_id, tenant_id, location_id },
    select: { id: true, environment: true, mh_spec_profile: true, dept_code: true, municipality_code: true },
  });
  if (!issuer) {
    return fail("NOT_FOUND", "La configuración DTE indicada no existe o no pertenece a esta organización y sucursal.");
  }
  const previousRaw = issuer.mh_spec_profile ?? null;
  if (previousRaw !== null && !isDteSpecProfile(previousRaw)) {
    return fail("INVALID_INPUT", `El emisor tiene un perfil persistido desconocido ("${previousRaw}"); requiere revisión manual.`);
  }
  const previous: DteSpecProfile = (previousRaw as DteSpecProfile | null) ?? "MH_1_2";
  const environment = String(issuer.environment);
  const warnings: string[] = [];

  if (target === "MH_2_0") {
    // 5a. Schemas
    const schemaProblems = checkMh20SchemasAvailable();
    if (schemaProblems.length > 0) {
      return fail("SCHEMA_UNAVAILABLE", "Schemas MH 2.0 requeridos no disponibles.", schemaProblems);
    }
    // 5b. Catálogos 2.0
    const catalogProblems = await checkMh20CatalogsSeeded(db);
    if (catalogProblems.length > 0) {
      return fail("CATALOGS_MISSING", "Los catálogos MH 2.0 no están sembrados en esta base.", catalogProblems);
    }
    // 5c. Territorio del emisor
    const territory = await resolveMhTerritory20(
      { role: "emisor", deptCode: issuer.dept_code, municipalityCode: issuer.municipality_code }, db,
    );
    if (!territory.ok) return fail("TERRITORY_INVALID", territory.error);
    if (!territory.territory) {
      return fail("TERRITORY_INVALID", "El emisor no tiene departamento/municipio configurado (requerido en MH 2.0).");
    }
    if (territory.review.length > 0) {
      warnings.push(`Territorio del emisor con revisión pendiente (${territory.review.join(", ")}); el código no cambia.`);
    }
    // 6. PRODUCTION
    if (environment === "PRODUCTION") {
      const open = openMh20ProductionBlockers();
      if (open.length > 0) {
        return fail(
          "PRODUCTION_BLOCKED",
          "No se permite activar MH 2.0 en PRODUCTION mientras existan bloqueos P0 abiertos.",
          open.map((b) => `${b.id}: ${b.title}`),
        );
      }
    }
  }

  if (previousRaw === target) {
    return { ok: true, changed: false, previous_profile: previous, new_profile: target, environment, warnings };
  }

  // 7. Escritura atómica + auditoría.
  // updated_by tiene FK a users: solo se escribe si el actor existe como
  // usuario del tenant (un Platform Admin del Control Plane puede no existir
  // en el runtime, mismo criterio que b682b70). La identidad completa queda
  // siempre en dte_spec_profile_audit_logs.changed_by.
  const runtimeActor = await db.user.findFirst({ where: { id: actor_id, tenant_id }, select: { id: true } });
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.dteIssuerConfig.updateMany({
        where: { id: issuer.id, tenant_id, location_id, mh_spec_profile: previousRaw },
        data:  { mh_spec_profile: target, ...(runtimeActor ? { updated_by: runtimeActor.id } : {}) },
      });
      if (updated.count !== 1) throw new SpecProfileConflictError();
      await tx.dteSpecProfileAuditLog.create({
        data: {
          tenant_id,
          location_id,
          issuer_config_id: issuer.id,
          environment:      issuer.environment,
          previous_profile: previousRaw,
          new_profile:      target,
          changed_by:       actor_id,
          changed_by_scope: input.actor_scope ?? null,
          reason,
          warnings:         warnings.length > 0 ? warnings : undefined,
        },
      });
    });
  } catch (err) {
    if (err instanceof SpecProfileConflictError) {
      return fail("CONFLICT", "El perfil del emisor cambió durante la operación; vuelva a intentarlo.");
    }
    throw err;
  }

  return { ok: true, changed: true, previous_profile: previous, new_profile: target, environment, warnings };
}

class SpecProfileConflictError extends Error {
  constructor() { super("spec profile conflict"); }
}
