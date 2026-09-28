// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-territory.ts
//
// FEX-V3-TERRITORY-FIX — proyección territorial EXCLUSIVA de FEX 11 v3
// para emisor.direccion.{departamento, municipio, distrito}.
//
// Evidencia MH TEST (codigoMsg 096, Santa Tecla):
//   05 / 11 / 050611 → rechazó municipio y distrito.
//   05 / 06 / 11     → rechazó solo municipio (distrito "11" aceptado).
// FEX v3 exige municipio = código CAT-013 (Catálogos MH v1.2, 10/2025):
//
//   departamento = dept_code                                  ("05")
//   municipio    = CAT-013 de (dept_code, new_municipality_name) ("28")
//   distrito     = district_code sin municipio nuevo           ("11")
//
// new_municipality_code ya no se envía, pero sigue validando la
// jerarquía dept(2) ⊂ new_municipality_code(4) ⊂ district_code(6).
// Cualquier inconsistencia, nombre ausente o CAT-013 sin coincidencia
// única → fail-closed antes de generar/firmar. Sin fallback a
// Municipality.code ni a new_municipality_code.
//
// NO cambia el contrato de resolveDteMunicipality (municipalityCode =
// Municipality.code), del que dependen FE 01 / CCFE 03 / NC 05 / FSE 14.
// El schema oficial fex-11-v3.schema.json es permisivo en estos campos;
// esta es la validación semántica server-side, no una edición del schema.
// ─────────────────────────────────────────────────────────────────

import type { ResolvedDteMunicipality } from "./dte-territory.resolver";
import {
  CAT013_FEX_V3_MUNICIPALITIES,
  normalizeCat013Name,
  type Cat013FexV3Municipality,
} from "./cat013-fex-v3-municipalities";

export interface FexV3Territory {
  departamento: string;
  municipio:    string;
  distrito:     string;
}

export type ProjectFexV3TerritoryResult =
  | { ok: true; territory: FexV3Territory }
  | { ok: false; error: string };

const TWO_DIGITS  = /^[0-9]{2}$/;
const FOUR_DIGITS = /^[0-9]{4}$/;
const SIX_DIGITS  = /^[0-9]{6}$/;

export function projectFexV3Territory(
  resolved: Pick<ResolvedDteMunicipality, "departmentCode" | "newMunicipalityCode" | "newMunicipalityName" | "districtCode">,
  cat013: readonly Cat013FexV3Municipality[] = CAT013_FEX_V3_MUNICIPALITIES,
): ProjectFexV3TerritoryResult {
  const deptCode     = resolved.departmentCode;
  const newMuniCode  = resolved.newMunicipalityCode;
  const newMuniName  = resolved.newMunicipalityName?.trim() ?? "";
  const districtCode = resolved.districtCode;
  const fail = (detail: string): ProjectFexV3TerritoryResult => ({
    ok:    false,
    error: `El código territorial del emisor no es válido para FEX 11 v3: ${detail}. Revise el municipio/distrito configurado en el emisor DTE.`,
  });

  if (!deptCode || !TWO_DIGITS.test(deptCode)) {
    return fail(`departamento "${deptCode ?? ""}" debe tener 2 dígitos`);
  }
  if (!newMuniCode || !FOUR_DIGITS.test(newMuniCode)) {
    return fail(`municipio nuevo "${newMuniCode ?? ""}" debe tener 4 dígitos`);
  }
  if (!newMuniCode.startsWith(deptCode)) {
    return fail(`municipio nuevo "${newMuniCode}" no pertenece al departamento "${deptCode}"`);
  }
  if (!districtCode || !SIX_DIGITS.test(districtCode)) {
    return fail(`distrito "${districtCode ?? ""}" debe tener 6 dígitos`);
  }
  if (!districtCode.startsWith(newMuniCode)) {
    return fail(`distrito "${districtCode}" no pertenece al municipio nuevo "${newMuniCode}"`);
  }
  if (!newMuniName) {
    return fail("falta el nombre del municipio nuevo (requerido para resolver CAT-013)");
  }

  const wanted  = normalizeCat013Name(newMuniName);
  const matches = cat013.filter(
    (m) => m.departmentCode === deptCode && normalizeCat013Name(m.municipalityName) === wanted,
  );
  if (matches.length === 0) {
    return fail(`el municipio "${newMuniName}" del departamento "${deptCode}" no existe en CAT-013`);
  }
  if (matches.length > 1) {
    return fail(`el municipio "${newMuniName}" del departamento "${deptCode}" es ambiguo en CAT-013 (${matches.length} coincidencias)`);
  }
  const cat013Code = matches[0].municipalityCode;
  if (!TWO_DIGITS.test(cat013Code)) {
    return fail(`código CAT-013 "${cat013Code}" debe tener 2 dígitos`);
  }

  return {
    ok: true,
    territory: {
      departamento: deptCode,
      municipio:    cat013Code,
      distrito:     districtCode.slice(4),
    },
  };
}
