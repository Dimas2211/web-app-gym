// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-territory.ts
//
// FEX-V3-TERRITORY-FIX — proyección territorial EXCLUSIVA de FEX 11 v3
// para emisor.direccion.{departamento, municipio, distrito}.
//
// MH TEST rechazó (codigoMsg 096) un FEX v3 con municipio="11" y
// distrito="050611" (Municipality.code / district_code completos). FEX v3
// usa la organización territorial nueva, con códigos de 2 dígitos
// relativos a su nivel superior:
//
//   departamento = dept_code                         ("05")
//   municipio    = new_municipality_code sin depto   ("0506"   → "06")
//   distrito     = district_code sin municipio nuevo ("050611" → "11")
//
// No se hace slice ciego: se exige la jerarquía
// dept(2) ⊂ new_municipality_code(4) ⊂ district_code(6). Si no se cumple,
// fail-closed antes de generar/firmar.
//
// NO cambia el contrato de resolveDteMunicipality (municipalityCode =
// Municipality.code), del que dependen FE 01 / CCFE 03 / NC 05 / FSE 14.
// El schema oficial fex-11-v3.schema.json es permisivo en estos campos;
// esta es la validación semántica server-side, no una edición del schema.
// ─────────────────────────────────────────────────────────────────

import type { ResolvedDteMunicipality } from "./dte-territory.resolver";

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
  resolved: Pick<ResolvedDteMunicipality, "departmentCode" | "newMunicipalityCode" | "districtCode">,
): ProjectFexV3TerritoryResult {
  const deptCode    = resolved.departmentCode;
  const newMuniCode = resolved.newMunicipalityCode;
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

  return {
    ok: true,
    territory: {
      departamento: deptCode,
      municipio:    newMuniCode.slice(2),
      distrito:     districtCode.slice(4),
    },
  };
}
