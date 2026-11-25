// ─────────────────────────────────────────────────────────────────
// commerce/dte — mh-territory-combinations.ts
//
// MH20 (Fase 6.1 / Fase 7, IMP20-028) — combinaciones válidas de
// departamento (CAT-012) → municipio (CAT-013) → distrito (CAT-008) por
// perfil normativo, derivadas EXCLUSIVAMENTE de la proyección canónica
// (projectMhTerritory) sobre el catálogo Municipality versionado en el repo.
//
// Uso:
//   - regla semántica R20-TERR-01 (jerarquía completa en el JSON 2.0);
//   - vista previa en formularios de emisor/cliente/proveedor (solo lectura,
//     sin columnas nuevas, sin reescribir códigos guardados);
//   - validación territorial de receptores del onboarding MH TEST.
//
// Puro y sin acceso a BD: no sustituye a resolveDteMunicipality en runtime
// (que lee la tabla real); el catálogo generado es la misma fuente que
// siembra esa tabla.
// ─────────────────────────────────────────────────────────────────

import { MUNICIPALITIES } from "../../../../../prisma/importers/generated/municipalities.data";
import type { DteSpecProfile } from "../spec/dte-spec-profile";
import {
  mhTerritoryOptionsForProfile,
  projectMhTerritory,
  type MhTerritory,
  type MhTerritoryErrorCode,
  type MhTerritoryReviewFlag,
} from "./dte-territory-projection.pure";

export interface MhTerritoryCombination extends MhTerritory {
  /** Clave guardada en Customer/Supplier/DteIssuerConfig (dept_code, municipality_code). */
  storedDeptCode:         string;
  storedMunicipalityCode: string;
  districtName:           string;
  municipalityName:       string;
  review:                 MhTerritoryReviewFlag[];
}

const cache = new Map<DteSpecProfile, readonly MhTerritoryCombination[]>();

export function listMhTerritoryCombinations(profile: DteSpecProfile): readonly MhTerritoryCombination[] {
  const hit = cache.get(profile);
  if (hit) return hit;
  const out: MhTerritoryCombination[] = [];
  for (const m of MUNICIPALITIES) {
    const r = projectMhTerritory(
      {
        departmentCode:      m.dept_code,
        newMunicipalityCode: m.new_municipality_code,
        newMunicipalityName: m.new_municipality_name,
        districtCode:        m.district_code,
      },
      mhTerritoryOptionsForProfile(profile),
    );
    if (!r.ok) continue;
    out.push({
      ...r.territory,
      storedDeptCode:         m.dept_code,
      storedMunicipalityCode: m.code,
      districtName:           m.district_name,
      municipalityName:       m.new_municipality_name,
      review:                 r.review,
    });
  }
  const frozen = Object.freeze(out);
  cache.set(profile, frozen);
  return frozen;
}

/** true si (dep, municipio CAT-013, distrito) es una combinación oficial del perfil. */
export function isValidMh20TerritoryCombination(dep: string, municipio: string, distrito: string): boolean {
  return listMhTerritoryCombinations("MH_2_0").some(
    (c) => c.departamento === dep && c.municipio === municipio && c.distrito === distrito,
  );
}

export type MhTerritoryPreview =
  | { status: "NO_ADDRESS" }
  | { status: "OK"; profile: DteSpecProfile; territory: MhTerritory; districtName: string; municipalityName: string; review: MhTerritoryReviewFlag[]; changedFromV1_2: boolean }
  | { status: "INVALID"; profile: DteSpecProfile; code: MhTerritoryErrorCode | "NOT_FOUND"; message: string };

/**
 * Vista previa (solo lectura) de cómo se proyectará una dirección guardada.
 * Nunca modifica el registro; un dato incompatible produce un mensaje claro
 * y no bloquea otras operaciones (la emisión 2.0 lo rechazará por sí misma).
 */
export function previewMhTerritory(
  stored: { deptCode: string | null | undefined; municipalityCode: string | null | undefined },
  profile: DteSpecProfile,
): MhTerritoryPreview {
  const { deptCode, municipalityCode } = stored;
  if (!deptCode && !municipalityCode) return { status: "NO_ADDRESS" };
  if (!deptCode || !municipalityCode) {
    return { status: "INVALID", profile, code: "INCOMPLETE", message: "Falta el departamento o el municipio/distrito." };
  }
  const row = MUNICIPALITIES.find((m) => m.dept_code === deptCode && m.code === municipalityCode);
  if (!row) {
    return {
      status: "INVALID", profile, code: "NOT_FOUND",
      message: `La combinación departamento ${deptCode} / distrito ${municipalityCode} no existe en el catálogo territorial vigente.`,
    };
  }
  const r = projectMhTerritory(
    {
      departmentCode: row.dept_code, newMunicipalityCode: row.new_municipality_code,
      newMunicipalityName: row.new_municipality_name, districtCode: row.district_code,
    },
    mhTerritoryOptionsForProfile(profile),
  );
  if (!r.ok) return { status: "INVALID", profile, code: r.code, message: r.detail };
  return {
    status: "OK", profile, territory: r.territory,
    districtName: row.district_name, municipalityName: row.new_municipality_name,
    review: r.review, changedFromV1_2: r.review.includes("REVIEW_CAT013_CHANGED"),
  };
}
