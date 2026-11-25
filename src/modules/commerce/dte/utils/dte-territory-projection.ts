// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-territory-projection.ts
//
// MH20 (IMP20-007, D7, §3.2 del diseño) — servicio territorial canónico.
//
// Generaliza projectFexV3Territory (FEX 11 v3, ya aceptado en MH TEST):
//
//   departamento = Municipality.dept_code                         (CAT-012)
//   municipio    = CAT-013(dept_code, new_municipality_name)      (CAT-013)
//   distrito     = Municipality.district_code.slice(4)            (CAT-008)
//
// Verificado en prisma/importers/generated/municipalities.data.ts:
// district_code.slice(4) === Municipality.code (el código "antiguo" que
// FE/CCF/NC/FSE envían hoy en direccion.municipio ES el distrito CAT-008).
//
// Fail-closed (sin inferencias): jerarquía inconsistente, nombre ausente,
// CAT-013 sin coincidencia o ambiguo.
//
// Cabañas (dept 09) — Fase 6.1: RESUELTO_DOCUMENTALMENTE (CAT-013 v1.1,
// "Cambio: 2": 10 = CABAÑAS ESTE, 11 = CABAÑAS OESTE). MH_2_0 ya no bloquea:
// proyecta por nombre de municipio nuevo con la tabla V2_0 y marca
// REVIEW_CAT013_CHANGED (el código difiere del que daría V1.2) para que los
// reportes de revisión lo señalen. `blockCabanas` se conserva solo como
// opción explícita (compatibilidad); ningún perfil la activa ya.
// MH_1_2 conserva la tabla V1.2 intacta.
//
// Delgado (06|19): el código coincide y no bloquea la emisión, pero se
// marca REVIEW_LABEL (CAT20-297, distrito "Delgado" vs "CIUDAD DELGADO")
// para revisión manual antes de activar.
//
// Sin columnas nuevas: la proyección se calcula en tiempo de generación.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveDteMunicipality } from "./dte-territory.resolver";
import {
  formatMhTerritoryError,
  mhTerritoryOptionsForProfile,
  projectMhTerritory,
  type MhTerritory,
  type MhTerritoryErrorCode,
  type MhTerritoryReviewFlag,
} from "./dte-territory-projection.pure";

// Fase 7: la parte pura vive en dte-territory-projection.pure.ts (usable en
// cliente). Se re-exporta íntegra para no cambiar el contrato.
export * from "./dte-territory-projection.pure";

export type ResolveMhTerritoryResult =
  | { ok: true; territory: MhTerritory | null; review: MhTerritoryReviewFlag[] }
  | { ok: false; code: MhTerritoryErrorCode; error: string };

/**
 * Resuelve (dept_code, code) contra Municipality y proyecta con el perfil
 * MH_2_0. Dirección ausente (ambos null) → territory null (el builder
 * decide si eso es válido, p.ej. consumidor final FE). Par incompleto →
 * INCOMPLETE. Par inexistente → NOT_FOUND. Solo lectura.
 */
export async function resolveMhTerritory20(
  params: { role: string; deptCode: string | null | undefined; municipalityCode: string | null | undefined },
  db: PrismaClient = prisma,
): Promise<ResolveMhTerritoryResult> {
  const { role, deptCode, municipalityCode } = params;
  if (!deptCode && !municipalityCode) return { ok: true, territory: null, review: [] };
  if (!deptCode || !municipalityCode) {
    return {
      ok:    false,
      code:  "INCOMPLETE",
      error: formatMhTerritoryError(role, "INCOMPLETE", `departamento="${deptCode ?? ""}", municipio="${municipalityCode ?? ""}"`),
    };
  }
  const resolved = await resolveDteMunicipality({ deptCode, municipalityCode }, db);
  if (!resolved) {
    return {
      ok:    false,
      code:  "NOT_FOUND",
      error: formatMhTerritoryError(role, "NOT_FOUND", `(departamento="${deptCode}", municipio="${municipalityCode}") no existe en el catálogo activo`),
    };
  }
  const projected = projectMhTerritory(resolved, mhTerritoryOptionsForProfile("MH_2_0"));
  if (!projected.ok) {
    return { ok: false, code: projected.code, error: formatMhTerritoryError(role, projected.code, projected.detail) };
  }
  return { ok: true, territory: projected.territory, review: projected.review };
}
