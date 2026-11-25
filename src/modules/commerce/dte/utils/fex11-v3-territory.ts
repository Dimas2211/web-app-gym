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
  type Cat013FexV3Municipality,
} from "./cat013-fex-v3-municipalities";
import { projectMhTerritory } from "./dte-territory-projection";

export interface FexV3Territory {
  departamento: string;
  municipio:    string;
  distrito:     string;
}

export type ProjectFexV3TerritoryResult =
  | { ok: true; territory: FexV3Territory }
  | { ok: false; error: string };

export function projectFexV3Territory(
  resolved: Pick<ResolvedDteMunicipality, "departmentCode" | "newMunicipalityCode" | "newMunicipalityName" | "districtCode">,
  cat013: readonly Cat013FexV3Municipality[] = CAT013_FEX_V3_MUNICIPALITIES,
): ProjectFexV3TerritoryResult {
  // MH20 (IMP20-007): delega en el servicio territorial canónico con la
  // fuente CAT-013 V1.2 y SIN bloqueo de Cabañas (comportamiento FEX
  // vigente). La salida y los mensajes son idénticos a la versión previa.
  const projected = projectMhTerritory(resolved, { cat013, blockCabanas: false });
  if (!projected.ok) {
    return {
      ok:    false,
      error: `El código territorial del emisor no es válido para FEX 11 v3: ${projected.detail}. Revise el municipio/distrito configurado en el emisor DTE.`,
    };
  }
  return { ok: true, territory: projected.territory };
}
