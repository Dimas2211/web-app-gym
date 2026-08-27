// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-territory.resolver.ts
//
// Resolver territorial único, reusado por todos los builders DTE
// (FE 01, CCFE 03, NC 05, FEX 11, FSE 14) para emisor, receptor y
// sujeto excluido.
//
// SEMÁNTICA DE Municipality (documentada aquí para no volver a
// confundirla en un builder futuro):
//
//   dept_code              → código de departamento CAT-012 ("01"–"14").
//   code                   → código DTE relativo al departamento, ya
//                            usado y aceptado por Hacienda en
//                            `direccion.municipio`. Es la ÚNICA fuente
//                            correcta para ese campo del JSON DTE.
//   dte_full_code          → dept_code + code concatenados (4 dígitos),
//                            identificador interno de conveniencia.
//                            NUNCA se envía en direccion.municipio.
//   district_code          → código de distrito de la nueva organización
//                            territorial (6 dígitos). Uso interno/
//                            informativo, NUNCA en direccion.municipio.
//   district_name          → nombre del distrito/localidad.
//   new_municipality_code  → código del municipio administrativo NUEVO
//                            (ej. "0506" La Libertad Sur). Clasificación
//                            adicional para reportes internos, NUNCA se
//                            envía en direccion.municipio.
//   new_municipality_name  → nombre del municipio administrativo nuevo.
//
// Referencia de no regresión — evidencia real de un DTE tipoDte="03"
// (codigoGeneracion 91813799-11B5-461D-836F-B4D35B3ED0FB, numeroControl
// DTE-03-M001P001-000000000000076) PROCESADO por Hacienda en TEST:
//   TrustMe / Santa Tecla → departamento "05", municipio "11"
//   Receptor / San Salvador → departamento "06", municipio "14"
// Estos valores son Municipality.code, no new_municipality_code.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface ResolvedDteMunicipality {
  departmentCode:       string;
  municipalityCode:      string; // Municipality.code — el que va en direccion.municipio
  districtName:          string | null;
  newMunicipalityCode:   string | null;
  newMunicipalityName:   string | null;
}

/**
 * Resuelve un municipio DTE a partir de (dept_code, code) contra el
 * registro real de Municipality. Devuelve null si el par no existe o
 * no está activo — el llamador decide si eso es bloqueante.
 */
export async function resolveDteMunicipality(params: {
  deptCode:          string | null | undefined;
  municipalityCode:  string | null | undefined;
}): Promise<ResolvedDteMunicipality | null> {
  const { deptCode, municipalityCode } = params;
  if (!deptCode || !municipalityCode) return null;

  const row = await prisma.municipality.findFirst({
    where: {
      dept_code: deptCode,
      code:      municipalityCode,
      status:    "active",
    },
    select: {
      dept_code:             true,
      code:                  true,
      district_name:         true,
      new_municipality_code: true,
      new_municipality_name: true,
    },
  });

  if (!row) return null;

  return {
    departmentCode:      row.dept_code,
    municipalityCode:    row.code,
    districtName:        row.district_name,
    newMunicipalityCode:  row.new_municipality_code,
    newMunicipalityName:  row.new_municipality_name,
  };
}

/**
 * Valida que (dept_code, municipality_code) correspondan a un registro
 * real y activo de Municipality antes de construir una dirección fiscal
 * DTE. Debe llamarse desde el builder ANTES de armar el bloque
 * `direccion`, para el emisor, el receptor y el sujeto excluido, siempre
 * que ambos códigos estén presentes.
 *
 * No valida cuando ambos códigos son null/undefined (dirección ausente,
 * caso legítimo p.ej. consumidor final sin dirección en FE 01) — pero
 * SÍ falla si solo uno de los dos está presente (par incompleto).
 */
export async function validateDteAddressCodes(params: {
  role:              string; // etiqueta para el mensaje de error, ej. "emisor", "receptor", "sujeto excluido"
  deptCode:          string | null | undefined;
  municipalityCode:  string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role, deptCode, municipalityCode } = params;

  if (!deptCode && !municipalityCode) {
    return { ok: true };
  }
  if (!deptCode || !municipalityCode) {
    return {
      ok:    false,
      error: `La dirección del ${role} tiene departamento o municipio incompletos (departamento="${deptCode ?? ""}", municipio="${municipalityCode ?? ""}").`,
    };
  }

  const resolved = await resolveDteMunicipality({ deptCode, municipalityCode });
  if (!resolved) {
    return {
      ok:    false,
      error: `El código territorial configurado para el ${role} (departamento="${deptCode}", municipio="${municipalityCode}") no corresponde a ningún municipio activo del catálogo. Seleccione la localidad nuevamente desde el catálogo de municipios.`,
    };
  }

  return { ok: true };
}
