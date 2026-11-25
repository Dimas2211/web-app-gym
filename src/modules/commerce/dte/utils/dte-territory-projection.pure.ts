// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-territory-projection.pure.ts
//
// MH20 (Fase 7, IMP20-028) — parte PURA del servicio territorial canónico
// (sin Prisma), separada de dte-territory-projection.ts para poder usarla en
// componentes cliente (vista previa territorial de datos maestros) sin
// arrastrar el cliente de base de datos al bundle. dte-territory-projection.ts
// la re-exporta: el contrato de los llamadores existentes no cambia.
// Ver la cabecera de dte-territory-projection.ts para las reglas.
// ─────────────────────────────────────────────────────────────────

import type { ResolvedDteMunicipality } from "./dte-territory.resolver";
import {
  CABANAS_DEPARTMENT_CODE,
  getCat013Source,
  normalizeCat013Name,
  type Cat013Municipality,
  type Cat013Source,
} from "./cat013-municipalities";
import type { DteSpecProfile } from "../spec/dte-spec-profile";

export interface MhTerritory {
  departamento: string;
  municipio:    string;
  distrito:     string;
}

export type MhTerritoryErrorCode =
  | "NOT_FOUND"
  | "INCOMPLETE"
  | "HIERARCHY_MISMATCH"
  | "CAT013_NO_MATCH"
  | "CAT013_AMBIGUOUS"
  | "CAT_INC_001_CABANAS";

export type MhTerritoryReviewFlag = "REVIEW_LABEL" | "REVIEW_CAT013_CHANGED";

export type ProjectMhTerritoryResult =
  | { ok: true; territory: MhTerritory; review: MhTerritoryReviewFlag[] }
  | { ok: false; code: MhTerritoryErrorCode; detail: string };

/** Correspondencias que la Fase 3 dejó en revisión manual (03-catalogos-diff.json). */
const REVIEW_LABEL_KEYS: ReadonlySet<string> = new Set(["06|19"]); // Delgado → CIUDAD DELGADO (CAT20-297)

const TWO_DIGITS  = /^[0-9]{2}$/;
const FOUR_DIGITS = /^[0-9]{4}$/;
const SIX_DIGITS  = /^[0-9]{6}$/;

export interface ProjectMhTerritoryOptions {
  /** Fuente CAT-013 (por defecto V1_2) o la tabla explícita (tests / FEX). */
  cat013?:      readonly Cat013Municipality[];
  cat013Source?: Cat013Source;
  /** Bloquear Cabañas (histórico CAT-INC-001). Ningún perfil lo activa desde Fase 6.1. */
  blockCabanas?: boolean;
}

export function projectMhTerritory(
  resolved: Pick<
    ResolvedDteMunicipality,
    "departmentCode" | "newMunicipalityCode" | "newMunicipalityName" | "districtCode"
  > & { municipalityCode?: string | null },
  options: ProjectMhTerritoryOptions = {},
): ProjectMhTerritoryResult {
  const cat013       = options.cat013 ?? getCat013Source(options.cat013Source ?? "V1_2");
  const deptCode     = resolved.departmentCode;
  const newMuniCode  = resolved.newMunicipalityCode;
  const newMuniName  = resolved.newMunicipalityName?.trim() ?? "";
  const districtCode = resolved.districtCode;
  const fail = (code: MhTerritoryErrorCode, detail: string): ProjectMhTerritoryResult => ({ ok: false, code, detail });

  if (!deptCode || !TWO_DIGITS.test(deptCode)) {
    return fail("INCOMPLETE", `departamento "${deptCode ?? ""}" debe tener 2 dígitos`);
  }
  if (!newMuniCode || !FOUR_DIGITS.test(newMuniCode)) {
    return fail("INCOMPLETE", `municipio nuevo "${newMuniCode ?? ""}" debe tener 4 dígitos`);
  }
  if (!newMuniCode.startsWith(deptCode)) {
    return fail("HIERARCHY_MISMATCH", `municipio nuevo "${newMuniCode}" no pertenece al departamento "${deptCode}"`);
  }
  if (!districtCode || !SIX_DIGITS.test(districtCode)) {
    return fail("INCOMPLETE", `distrito "${districtCode ?? ""}" debe tener 6 dígitos`);
  }
  if (!districtCode.startsWith(newMuniCode)) {
    return fail("HIERARCHY_MISMATCH", `distrito "${districtCode}" no pertenece al municipio nuevo "${newMuniCode}"`);
  }
  if (!newMuniName) {
    return fail("INCOMPLETE", "falta el nombre del municipio nuevo (requerido para resolver CAT-013)");
  }
  if (options.blockCabanas && deptCode === CABANAS_DEPARTMENT_CODE) {
    return fail(
      "CAT_INC_001_CABANAS",
      "los códigos CAT-013 de Cabañas Este/Oeste están intercambiados entre los catálogos V1.2 y 2.0 " +
        "(CAT-INC-001, pendiente de confirmación de MH); no se infiere el código",
    );
  }

  const wanted  = normalizeCat013Name(newMuniName);
  const matches = cat013.filter(
    (m) => m.departmentCode === deptCode && normalizeCat013Name(m.municipalityName) === wanted,
  );
  if (matches.length === 0) {
    return fail("CAT013_NO_MATCH", `el municipio "${newMuniName}" del departamento "${deptCode}" no existe en CAT-013`);
  }
  if (matches.length > 1) {
    return fail(
      "CAT013_AMBIGUOUS",
      `el municipio "${newMuniName}" del departamento "${deptCode}" es ambiguo en CAT-013 (${matches.length} coincidencias)`,
    );
  }
  const cat013Code = matches[0].municipalityCode;
  if (!TWO_DIGITS.test(cat013Code)) {
    return fail("CAT013_NO_MATCH", `código CAT-013 "${cat013Code}" debe tener 2 dígitos`);
  }

  const distrito = districtCode.slice(4);
  const review: MhTerritoryReviewFlag[] = REVIEW_LABEL_KEYS.has(`${deptCode}|${distrito}`) ? ["REVIEW_LABEL"] : [];
  if (matches[0].changedFromV1_2) review.push("REVIEW_CAT013_CHANGED");

  return {
    ok: true,
    territory: { departamento: deptCode, municipio: cat013Code, distrito },
    review,
  };
}

/** Opciones canónicas por perfil para FE / CCF / NC / FSE. */
export function mhTerritoryOptionsForProfile(profile: DteSpecProfile): ProjectMhTerritoryOptions {
  return profile === "MH_2_0"
    ? { cat013Source: "V2_0", blockCabanas: false }
    : { cat013Source: "V1_2", blockCabanas: false };
}

/**
 * MH20 (Fase 5.1B → Fase 6.1) — correspondencias territoriales ambiguas por perfil.
 *
 * Fase 5.1B bloqueaba Cabañas (dept 09) con MH_2_0 (CAT-INC-001). En Fase 6.1
 * quedó RESUELTO_DOCUMENTALMENTE (CAT-013 v1.1 "Cambio: 2"; ver
 * consultas-mh-verificadas.md §13): el código se resuelve por nombre con la
 * tabla V2_0, así que ya no hay correspondencias ambiguas conocidas y la
 * función devuelve null. Se conserva como punto único por si MH publica otra
 * contradicción (los llamadores no cambian).
 */
export function mh20TerritoryAmbiguityError(
  profile: DteSpecProfile,
  deptCode: string | null | undefined,
  role: string,
): string | null {
  void profile; void deptCode; void role;
  return null;
}

/** Mensaje accionable para el builder. */
export function formatMhTerritoryError(role: string, code: MhTerritoryErrorCode, detail: string): string {
  return (
    `La dirección del ${role} no puede proyectarse a la organización territorial MH 2.0 ` +
    `(${code}): ${detail}. Revise el departamento/municipio/distrito configurado.`
  );
}

