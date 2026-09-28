// ─────────────────────────────────────────────────────────────────
// commerce/dte — cat013-fex-v3-municipalities.ts
//
// FEX-V3-TERRITORY-FIX-3 — CAT-013 Municipio (MH, Catálogos - Sistema de
// Transmisión v1.2, 10/2025). Artefacto runtime PRIVADO de FEX 11 v3:
// solo lo consume projectFexV3Territory (fex11-v3-territory.ts).
//
// Fuente documental: docs/dte-official/catalogs/cat-013-municipios-v1.2.csv
// (transcripción normalizada del catálogo oficial MH, ver .md adjunto).
// No se lee el CSV en runtime.
//
// 44 municipios nacionales. Se excluye "00 = Otro (Para extranjeros)":
// no participa en la resolución de la dirección nacional del emisor.
//
// El código NO es único globalmente (05/28 LA LIBERTAD SUR, 13/28
// MORAZAN SUR): la identidad es departamento + nombre normalizado.
//
// NO usar desde FE 01 / CCFE 03 / NC 05 / FSE 14 ni desde
// resolveDteMunicipality — no cambia Municipality.code.
// ─────────────────────────────────────────────────────────────────

export interface Cat013FexV3Municipality {
  readonly departmentCode:   string;
  readonly municipalityCode: string;
  readonly municipalityName: string;
}

const rows = (
  [
    ["01", "13", "AHUACHAPAN NORTE"],
    ["01", "14", "AHUACHAPAN CENTRO"],
    ["01", "15", "AHUACHAPAN SUR"],
    ["02", "14", "SANTA ANA NORTE"],
    ["02", "15", "SANTA ANA CENTRO"],
    ["02", "16", "SANTA ANA ESTE"],
    ["02", "17", "SANTA ANA OESTE"],
    ["03", "17", "SONSONATE NORTE"],
    ["03", "18", "SONSONATE CENTRO"],
    ["03", "19", "SONSONATE ESTE"],
    ["03", "20", "SONSONATE OESTE"],
    ["04", "34", "CHALATENANGO NORTE"],
    ["04", "35", "CHALATENANGO CENTRO"],
    ["04", "36", "CHALATENANGO SUR"],
    ["05", "23", "LA LIBERTAD NORTE"],
    ["05", "24", "LA LIBERTAD CENTRO"],
    ["05", "25", "LA LIBERTAD OESTE"],
    ["05", "26", "LA LIBERTAD ESTE"],
    ["05", "27", "LA LIBERTAD COSTA"],
    ["05", "28", "LA LIBERTAD SUR"],
    ["06", "20", "SAN SALVADOR NORTE"],
    ["06", "21", "SAN SALVADOR OESTE"],
    ["06", "22", "SAN SALVADOR ESTE"],
    ["06", "23", "SAN SALVADOR CENTRO"],
    ["06", "24", "SAN SALVADOR SUR"],
    ["07", "17", "CUSCATLAN NORTE"],
    ["07", "18", "CUSCATLAN SUR"],
    ["08", "23", "LA PAZ OESTE"],
    ["08", "24", "LA PAZ CENTRO"],
    ["08", "25", "LA PAZ ESTE"],
    ["09", "10", "CABAÑAS OESTE"],
    ["09", "11", "CABAÑAS ESTE"],
    ["10", "14", "SAN VICENTE NORTE"],
    ["10", "15", "SAN VICENTE SUR"],
    ["11", "24", "USULUTAN NORTE"],
    ["11", "25", "USULUTAN ESTE"],
    ["11", "26", "USULUTAN OESTE"],
    ["12", "21", "SAN MIGUEL NORTE"],
    ["12", "22", "SAN MIGUEL CENTRO"],
    ["12", "23", "SAN MIGUEL OESTE"],
    ["13", "27", "MORAZAN NORTE"],
    ["13", "28", "MORAZAN SUR"],
    ["14", "19", "LA UNION NORTE"],
    ["14", "20", "LA UNION SUR"],
  ] as const
).map(([departmentCode, municipalityCode, municipalityName]) =>
  Object.freeze({ departmentCode, municipalityCode, municipalityName }),
);

export const CAT013_FEX_V3_MUNICIPALITIES: readonly Cat013FexV3Municipality[] = Object.freeze(rows);

/**
 * Normalización SOLO para comparar nombres de municipio: trim, espacios
 * colapsados, mayúsculas y sin diacríticos ("Morazán Sur" ≡ "MORAZAN SUR",
 * "Cabañas Este" ≡ "CABAÑAS ESTE").
 */
export function normalizeCat013Name(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}
