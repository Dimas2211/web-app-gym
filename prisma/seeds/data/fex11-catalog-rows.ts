// ─────────────────────────────────────────────────────────────────
// prisma/seeds/data — fex11-catalog-rows.ts
//
// F3-C23B (corregido) — Filas de catálogo DTE específicas de FEX 11
// (Factura de Exportación), compartidas entre el seed CLI
// (prisma/seeds/seed.dte-catalog-items.ts) y el seed runner de
// plataforma (src/modules/platform/lib/seed-runners/dte-catalog-items-runner.ts).
//
// Sin dependencias de Prisma — módulo de datos puro.
//
// ═════════════════════════════════════════════════════════════════
// FUENTE OFICIAL CONFIRMADA (corrección tras hallazgo tardío del PDF)
// ═════════════════════════════════════════════════════════════════
//
// El PDF "Catálogo - Sistema de Transmisión (1).pdf" v1.2 SÍ existe en
// el repositorio (no se encontró en la primera pasada de auditoría de
// F3-C23B por estar fuera de docs/): `database/catalogs/`. Junto a él
// hay una versión estructurada en Excel, "Catálogos del Sistema de
// Transmisión V 1.2.xlsx", con el mismo contenido en formato tabular
// — esa es la fuente real usada para generar estas filas (parseada
// programáticamente con la librería `xlsx`, ya dependencia del
// proyecto — ver prisma/importers/import-excel-catalogs.ts).
//
// ERRATA — CAT-020 (País): el primer intento de F3-C23B concluyó que
// codPais usaba una numeración propia MH de 4 dígitos (p. ej. "9540"),
// basado en el enum del schema JSON local (fe-fex-v1.json, 275
// códigos). Esa conclusión era INCORRECTA. El catálogo oficial v1.2
// (Excel/PDF reales) usa códigos ISO 3166-1 alpha-2 de 2 letras —
// exactamente la hipótesis "US" que el usuario planteó como Opción 1,
// confirmada: US = "Estados Unidos". El schema JSON local
// (fe-fex-v1.json) está desalineado con el catálogo v1.2 — es una
// versión de schema más vieja con una lista de códigos legacy que ya
// no corresponde a la numeración vigente. "9540" NO aparece en el
// catálogo oficial v1.2 en absoluto.
//
// CAT-020 YA NO se carga aquí como filas de DteCatalogItem: es
// exactamente el mismo catálogo que el modelo `Country` ya existente
// en este proyecto (ISO alpha-2, 249 registros, cargado por
// prisma/seeds/seed.commerce-catalogs.ts desde el mismo Excel oficial
// — confirmado código por código). Cargar una copia paralela en
// DteCatalogItem habría sido duplicar un catálogo ya existente (regla
// explícita del proyecto). FEX 11 ahora reutiliza `Country` /
// `getCountries()` directamente para el campo país. Ver
// docs/dte-official/extracts/fex11-catalogs-operational.md.
//
// ERRATA — CAT-029 (Tipo de persona): el primer intento de F3-C23B
// heredó de F3-C23 el mapeo "1 = jurídica, 2 = natural". El catálogo
// oficial v1.2 es el INVERSO: "1 = Persona Natural, 2 = Persona
// Jurídica". Corregido aquí. La transmisión histórica ACEPTADA en MH
// TEST usó customer_person_type="2" pensando que significaba
// "natural" — según el catálogo real, ese valor significa "Jurídica".
// MH aceptó el documento de todas formas porque el schema solo valida
// que sea 1 o 2 (entero), no la semántica declarada — no se reescribe
// ese registro histórico, pero se documenta la corrección.
//
// CAT-028 (Régimen) y CAT-031 (INCOTERMS): con el Excel oficial ya
// disponible, ambos catálogos quedan COMPLETOS (ya no bloqueados/
// parciales como en el primer intento de F3-C23B).
//
// CAT-030 (Transporte): el Excel oficial define 6 códigos con nombre
// real (el schema JSON permitía un 7º valor sin nombre documentado en
// el catálogo v1.2 — se deja fuera, no se inventa).
//
// ═════════════════════════════════════════════════════════════════
// F3-C23D — Restauración de transmisión FEX 11 (versión actual, sin
// migrar a FEX v3)
// ═════════════════════════════════════════════════════════════════
//
// El Ministerio publicó en julio 2026 schemas nuevos (FEX ahora aparece
// como v3), pero esta fase NO migra a esos schemas — queda para una fase
// futura. Mientras tanto, la versión actual (schema local
// `fex-11.schema.json`, FEX v1) debe seguir pudiendo transmitir.
//
// El bloqueo introducido en F3-C23C (arriba) era correcto — CAT-020
// (ISO alpha-2) y el enum receptor.codPais del schema v1 (numérico
// legado) son en efecto incompatibles — pero dejaba FEX 11 sin ninguna
// forma de operar, porque la UI solo ofrecía CAT-020. La corrección de
// esta fase NO es tocar el schema ni CAT-020: es agregar un catálogo de
// COMPATIBILIDAD específico para receptor.codPais de FEX v1, separado de
// CAT-020, que la UI de /dashboard/sales/export usa mientras sigamos en
// v1.
//
// catalog_code = "FEX-11-V1-CODPAIS" (NO "CAT-020" — no se disfraza como
// catálogo oficial v1.2). Filas generadas programáticamente desde el
// propio enum de `fex-11.schema.json` (275 códigos), para no duplicar a
// mano una lista que ya vive en el schema y no desincronizarse de él.
//
// El repo no tiene una fuente oficial con nombres reales para esos 275
// códigos legados (el catálogo v1.2 real usa ISO alpha-2, no esta
// numeración) — no se inventan nombres. El único código con nombre
// confirmado es "9540" = Estados Unidos, porque fue la única
// transmisión FEX 11 ACCEPTED en MH TEST hasta la fecha. El resto usa un
// label conservador "Código país FEX v1 <código>".
// ─────────────────────────────────────────────────────────────────

export interface CatalogRow {
  catalog_code: string;
  item_code:    string;
  item_label:   string;
  description?: string;
  applies_to?:  string;
  version?:     string;
  sort_order?:  number;
}

// ── CAT-015: Tributos ─────────────────────────────────────────────
// Subset operativo intencional: FEX 11 solo usa C3. Etiqueta ajustada
// para coincidir EXACTAMENTE con el Excel oficial v1.2.
const CAT_015_ROWS: CatalogRow[] = [
  { catalog_code: "CAT-015", item_code: "C3", item_label: "Impuesto al Valor Agregado (exportaciones) 0%", description: "Tributo fijo usado por líneas FEX 11. Fuente: Catálogos del Sistema de Transmisión V 1.2.xlsx (database/catalogs/).", applies_to: "FEX-11", sort_order: 1 },
];

// ── CAT-027: Recinto fiscal — catálogo completo (46 ítems) ──────────
// Verificado byte a byte contra el Excel oficial en esta fase — coincide
// exactamente con la transcripción del usuario en F3-C23. Sin cambios.
const CAT_027_ROWS: CatalogRow[] = [
  { catalog_code: "CAT-027", item_code: "01", item_label: "Terrestre San Bartolo",     applies_to: "FEX-11", sort_order: 1 },
  { catalog_code: "CAT-027", item_code: "02", item_label: "Marítima de Acajutla",      description: "Confirmado ACCEPTED en MH TEST (FEX 11)", applies_to: "FEX-11", sort_order: 2 },
  { catalog_code: "CAT-027", item_code: "03", item_label: "Aérea De Comalapa",         applies_to: "FEX-11", sort_order: 3 },
  { catalog_code: "CAT-027", item_code: "04", item_label: "Terrestre Las Chinamas",    applies_to: "FEX-11", sort_order: 4 },
  { catalog_code: "CAT-027", item_code: "05", item_label: "Terrestre La Hachadura",    applies_to: "FEX-11", sort_order: 5 },
  { catalog_code: "CAT-027", item_code: "06", item_label: "Terrestre Santa Ana",       applies_to: "FEX-11", sort_order: 6 },
  { catalog_code: "CAT-027", item_code: "07", item_label: "Terrestre San Cristóbal",   applies_to: "FEX-11", sort_order: 7 },
  { catalog_code: "CAT-027", item_code: "08", item_label: "Terrestre Anguiatú",        applies_to: "FEX-11", sort_order: 8 },
  { catalog_code: "CAT-027", item_code: "09", item_label: "Terrestre El Amatillo",     applies_to: "FEX-11", sort_order: 9 },
  { catalog_code: "CAT-027", item_code: "10", item_label: "Marítima La Unión",         description: "Valor válido documentado — no usado en el caso ACCEPTED de referencia", applies_to: "FEX-11", sort_order: 10 },
  { catalog_code: "CAT-027", item_code: "11", item_label: "Terrestre El Poy",          applies_to: "FEX-11", sort_order: 11 },
  { catalog_code: "CAT-027", item_code: "12", item_label: "Terrestre Metalío",         applies_to: "FEX-11", sort_order: 12 },
  { catalog_code: "CAT-027", item_code: "15", item_label: "Fardos Postales",           applies_to: "FEX-11", sort_order: 13 },
  { catalog_code: "CAT-027", item_code: "16", item_label: "Z.F. San Marcos",           applies_to: "FEX-11", sort_order: 14 },
  { catalog_code: "CAT-027", item_code: "17", item_label: "Z.F. El Pedregal",          applies_to: "FEX-11", sort_order: 15 },
  { catalog_code: "CAT-027", item_code: "18", item_label: "Z.F. San Bartolo",          applies_to: "FEX-11", sort_order: 16 },
  { catalog_code: "CAT-027", item_code: "20", item_label: "Z.F. Exportsalva",          applies_to: "FEX-11", sort_order: 17 },
  { catalog_code: "CAT-027", item_code: "21", item_label: "Z.F. American Park",        applies_to: "FEX-11", sort_order: 18 },
  { catalog_code: "CAT-027", item_code: "23", item_label: "Z.F. Internacional",        applies_to: "FEX-11", sort_order: 19 },
  { catalog_code: "CAT-027", item_code: "24", item_label: "Z.F. Diez",                 applies_to: "FEX-11", sort_order: 20 },
  { catalog_code: "CAT-027", item_code: "26", item_label: "Z.F. Miramar",              applies_to: "FEX-11", sort_order: 21 },
  { catalog_code: "CAT-027", item_code: "27", item_label: "Z.F. Santo Tomas",          applies_to: "FEX-11", sort_order: 22 },
  { catalog_code: "CAT-027", item_code: "28", item_label: "Z.F. Santa Tecla",          applies_to: "FEX-11", sort_order: 23 },
  { catalog_code: "CAT-027", item_code: "29", item_label: "Z.F. Santa Ana",            applies_to: "FEX-11", sort_order: 24 },
  { catalog_code: "CAT-027", item_code: "30", item_label: "Z.F. La Concordia",         applies_to: "FEX-11", sort_order: 25 },
  { catalog_code: "CAT-027", item_code: "31", item_label: "Aérea Ilopango",            applies_to: "FEX-11", sort_order: 26 },
  { catalog_code: "CAT-027", item_code: "32", item_label: "Z.F. Pipil",                applies_to: "FEX-11", sort_order: 27 },
  { catalog_code: "CAT-027", item_code: "33", item_label: "Puerto Barillas",           applies_to: "FEX-11", sort_order: 28 },
  { catalog_code: "CAT-027", item_code: "34", item_label: "Z.F. Calvo Conservas",      applies_to: "FEX-11", sort_order: 29 },
  { catalog_code: "CAT-027", item_code: "35", item_label: "Feria Internacional",       applies_to: "FEX-11", sort_order: 30 },
  { catalog_code: "CAT-027", item_code: "36", item_label: "Aduana El Papalón",         applies_to: "FEX-11", sort_order: 31 },
  { catalog_code: "CAT-027", item_code: "37", item_label: "Z.F. Sam-Li",               applies_to: "FEX-11", sort_order: 32 },
  { catalog_code: "CAT-027", item_code: "38", item_label: "Z.F. San José",             applies_to: "FEX-11", sort_order: 33 },
  { catalog_code: "CAT-027", item_code: "39", item_label: "Z.F. Las Mercedes",         applies_to: "FEX-11", sort_order: 34 },
  { catalog_code: "CAT-027", item_code: "40", item_label: "Z.F. EMCO",                 applies_to: "FEX-11", sort_order: 35 },
  { catalog_code: "CAT-027", item_code: "41", item_label: "Z.F. Gigante",              applies_to: "FEX-11", sort_order: 36 },
  { catalog_code: "CAT-027", item_code: "71", item_label: "Aldesa",                    applies_to: "FEX-11", sort_order: 37 },
  { catalog_code: "CAT-027", item_code: "72", item_label: "Agdosa Merliot",            applies_to: "FEX-11", sort_order: 38 },
  { catalog_code: "CAT-027", item_code: "73", item_label: "Bodesa",                    applies_to: "FEX-11", sort_order: 39 },
  { catalog_code: "CAT-027", item_code: "76", item_label: "Delegacion DHL",            applies_to: "FEX-11", sort_order: 40 },
  { catalog_code: "CAT-027", item_code: "77", item_label: "Transauto",                 applies_to: "FEX-11", sort_order: 41 },
  { catalog_code: "CAT-027", item_code: "80", item_label: "Nejapa",                    applies_to: "FEX-11", sort_order: 42 },
  { catalog_code: "CAT-027", item_code: "81", item_label: "Almaconsa",                 applies_to: "FEX-11", sort_order: 43 },
  { catalog_code: "CAT-027", item_code: "83", item_label: "Agdosa Apopa",              applies_to: "FEX-11", sort_order: 44 },
  { catalog_code: "CAT-027", item_code: "85", item_label: "Gutiérrez Courier Y Cargo", applies_to: "FEX-11", sort_order: 45 },
  { catalog_code: "CAT-027", item_code: "99", item_label: "San Bartolo Envío Hn/Gt",   applies_to: "FEX-11", sort_order: 46 },
];

// ── CAT-028: Régimen — catálogo COMPLETO (56 ítems únicos) ──────────
// Fuente: Excel oficial v1.2 (database/catalogs/). El Excel trae 61 filas
// crudas, 5 de ellas repiten un código ya listado con una etiqueta corta
// alternativa (probable artefacto de una revisión previa mezclada en el
// mismo libro) — se conservó la primera aparición (etiqueta larga,
// consistente con el resto del catálogo) y se descartó el duplicado corto.
// Códigos duplicados descartados (ya cubiertos arriba con su etiqueta
// larga): EX-3.3052.000, EX-3.3054.000, EX-3.3055.000, EX-3.3056.000,
// EX-3.3057.000.
const CAT_028_ROWS: CatalogRow[] = [
  { catalog_code: "CAT-028", item_code: "EX-1.1000.000", item_label: "Exportación Definitiva, Exportación Definitiva, Régimen Común", description: "Confirmado ACCEPTED en MH TEST (FEX 11).", applies_to: "FEX-11", sort_order: 1 },
  { catalog_code: "CAT-028", item_code: "EX-1.1040.000", item_label: "Exportación Definitiva, Exportación Definitiva Sustitución de Mercancías, Régimen Común", applies_to: "FEX-11", sort_order: 2 },
  { catalog_code: "CAT-028", item_code: "EX-1.1041.020", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Provisional, Franq. Presidenciales exento de DAI", applies_to: "FEX-11", sort_order: 3 },
  { catalog_code: "CAT-028", item_code: "EX-1.1041.021", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Provisional, Franq. Presidenciales exento de DAI e IVA", applies_to: "FEX-11", sort_order: 4 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.025", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Maquinaria y Equipo LZF. DPA", applies_to: "FEX-11", sort_order: 5 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.031", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Distribución Internacional", applies_to: "FEX-11", sort_order: 6 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.032", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente. de Franquicia Definitiva, Operaciones Internacionales de Logística", applies_to: "FEX-11", sort_order: 7 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.033", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Centro Internacional de llamadas (Call Center)", applies_to: "FEX-11", sort_order: 8 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.034", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Tecnologías de Información LSI", applies_to: "FEX-11", sort_order: 9 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.035", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Investigación y Desarrollo LSI", applies_to: "FEX-11", sort_order: 10 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.036", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Embarcaciones Marítimas LSI", applies_to: "FEX-11", sort_order: 11 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.037", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Aeronaves LSI", applies_to: "FEX-11", sort_order: 12 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.038", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Procesos Empresariales LSI", applies_to: "FEX-11", sort_order: 13 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.039", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Servicios Medico-Hospitalarios LSI", applies_to: "FEX-11", sort_order: 14 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.040", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Servicios Financieros Internacionales LSI", applies_to: "FEX-11", sort_order: 15 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.043", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Contenedores LSI", applies_to: "FEX-11", sort_order: 16 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.044", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación de Equipos Tecnológicos LSI", applies_to: "FEX-11", sort_order: 17 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.054", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Atención Ancianos y Convalecientes LSI", applies_to: "FEX-11", sort_order: 18 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.055", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Telemedicina LSI", applies_to: "FEX-11", sort_order: 19 },
  { catalog_code: "CAT-028", item_code: "EX-1.1048.056", item_label: "Exportación Definitiva, Exportación Definitiva Proveniente de Franquicia Definitiva, Cinematografía LSI", applies_to: "FEX-11", sort_order: 20 },
  { catalog_code: "CAT-028", item_code: "EX-1.1052.000", item_label: "Exportación Definitiva, Exportación Definitiva de DPA con origen en Compras Locales, Régimen Común", applies_to: "FEX-11", sort_order: 21 },
  { catalog_code: "CAT-028", item_code: "EX-1.1054.000", item_label: "Exportación Definitiva, Exportación Definitiva de Zona Franca con origen en Compras Locales, Régimen Común", applies_to: "FEX-11", sort_order: 22 },
  { catalog_code: "CAT-028", item_code: "EX-1.1100.000", item_label: "Exportación Definitiva, Exportación Definitiva de Envíos de Socorro, Régimen Común", applies_to: "FEX-11", sort_order: 23 },
  { catalog_code: "CAT-028", item_code: "EX-1.1200.000", item_label: "Exportación Definitiva, Exportación Definitiva de Envíos Postales, Régimen Común", applies_to: "FEX-11", sort_order: 24 },
  { catalog_code: "CAT-028", item_code: "EX-1.1300.000", item_label: "Exportación Definitiva, Exportación Definitiva Envíos que requieren despacho urgente, Régimen Común", applies_to: "FEX-11", sort_order: 25 },
  { catalog_code: "CAT-028", item_code: "EX-1.1400.000", item_label: "Exportación Definitiva, Exportación Definitiva Courier, Régimen Común", applies_to: "FEX-11", sort_order: 26 },
  { catalog_code: "CAT-028", item_code: "EX-1.1400.011", item_label: "Exportación Definitiva, Exportación Definitiva Courier, Muestras Sin Valor Comercial", applies_to: "FEX-11", sort_order: 27 },
  { catalog_code: "CAT-028", item_code: "EX-1.1400.012", item_label: "Exportación Definitiva, Exportación Definitiva Courier, Material Publicitario", applies_to: "FEX-11", sort_order: 28 },
  { catalog_code: "CAT-028", item_code: "EX-1.1400.017", item_label: "Exportación Definitiva, Exportación Definitiva Courier, Declaración de Documentos", applies_to: "FEX-11", sort_order: 29 },
  { catalog_code: "CAT-028", item_code: "EX-1.1500.000", item_label: "Exportación Definitiva, Exportación Definitiva Menaje de casa, Régimen Común", applies_to: "FEX-11", sort_order: 30 },
  { catalog_code: "CAT-028", item_code: "EX-2.2100.000", item_label: "Exportación Temporal, Exportación Temporal para Perfeccionamiento Pasivo, Régimen Común", applies_to: "FEX-11", sort_order: 31 },
  { catalog_code: "CAT-028", item_code: "EX-2.2200.000", item_label: "Exportación Temporal, Exportación Temporal con Reimportación en el mismo estado, Régimen Común", applies_to: "FEX-11", sort_order: 32 },
  { catalog_code: "CAT-028", item_code: "EX-2.2400.000", item_label: "Traslados Definitivos", applies_to: "FEX-11", sort_order: 33 },
  { catalog_code: "CAT-028", item_code: "EX-3.3050.000", item_label: "Re-Exportación, Reexportación Proveniente de Importación Temporal, Régimen Común", applies_to: "FEX-11", sort_order: 34 },
  { catalog_code: "CAT-028", item_code: "EX-3.3051.000", item_label: "Re-Exportación, Reexportación Proveniente de Tiendas Libres, Régimen Común", applies_to: "FEX-11", sort_order: 35 },
  { catalog_code: "CAT-028", item_code: "EX-3.3052.000", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal para Perfeccionamiento Activo, Régimen Común", applies_to: "FEX-11", sort_order: 36 },
  { catalog_code: "CAT-028", item_code: "EX-3.3053.000", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal, Régimen Común", applies_to: "FEX-11", sort_order: 37 },
  { catalog_code: "CAT-028", item_code: "EX-3.3054.000", item_label: "Re-Exportación, Reexportación Proveniente de Régimen de Zona Franca, Régimen Común", applies_to: "FEX-11", sort_order: 38 },
  { catalog_code: "CAT-028", item_code: "EX-3.3055.000", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal para Perfeccionamiento Activo con Garantía, Régimen Común", applies_to: "FEX-11", sort_order: 39 },
  { catalog_code: "CAT-028", item_code: "EX-3.3056.000", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Régimen Común", applies_to: "FEX-11", sort_order: 40 },
  { catalog_code: "CAT-028", item_code: "EX-3.3056.057", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios", applies_to: "FEX-11", sort_order: 41 },
  { catalog_code: "CAT-028", item_code: "EX-3.3056.058", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios", applies_to: "FEX-11", sort_order: 42 },
  { catalog_code: "CAT-028", item_code: "EX-3.3056.072", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Decreto 738 Eléctricos e Híbridos", applies_to: "FEX-11", sort_order: 43 },
  { catalog_code: "CAT-028", item_code: "EX-3.3057.000", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Régimen Común", applies_to: "FEX-11", sort_order: 44 },
  { catalog_code: "CAT-028", item_code: "EX-3.3057.057", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios", applies_to: "FEX-11", sort_order: 45 },
  { catalog_code: "CAT-028", item_code: "EX-3.3057.058", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios", applies_to: "FEX-11", sort_order: 46 },
  { catalog_code: "CAT-028", item_code: "EX-3.3058.033", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Centro Internacional de llamadas (Call Center)", applies_to: "FEX-11", sort_order: 47 },
  { catalog_code: "CAT-028", item_code: "EX-3.3058.036", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Embarcaciones Marítimas LSI", applies_to: "FEX-11", sort_order: 48 },
  { catalog_code: "CAT-028", item_code: "EX-3.3058.037", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Aeronaves LSI", applies_to: "FEX-11", sort_order: 49 },
  { catalog_code: "CAT-028", item_code: "EX-3.3058.043", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Contenedores LSI", applies_to: "FEX-11", sort_order: 50 },
  { catalog_code: "CAT-028", item_code: "EX-3.3059.000", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Régimen Común", applies_to: "FEX-11", sort_order: 51 },
  { catalog_code: "CAT-028", item_code: "EX-3.3059.057", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios", applies_to: "FEX-11", sort_order: 52 },
  { catalog_code: "CAT-028", item_code: "EX-3.3059.058", item_label: "Re-Exportación, Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios", applies_to: "FEX-11", sort_order: 53 },
  { catalog_code: "CAT-028", item_code: "EX-3.3070.000", item_label: "Re-Exportación, Reexportación Proveniente de Depósito., Régimen Común", applies_to: "FEX-11", sort_order: 54 },
  { catalog_code: "CAT-028", item_code: "EX-3.3070.072", item_label: "Re-Exportación, Reexportación Proveniente de Depósito., Decreto 738 Eléctricos e Híbridos", applies_to: "FEX-11", sort_order: 55 },
  { catalog_code: "CAT-028", item_code: "EX-3.3071.000", item_label: "Reexp. Prov. de Deposito.", applies_to: "FEX-11", sort_order: 56 },
];

// ── CAT-029: Tipo de persona — completo (2 ítems) ────────────────────
// CORREGIDO en esta fase: el catálogo oficial es 1=Natural, 2=Jurídica
// (antes se tenía invertido: 1=jurídica, 2=natural). Ver errata arriba.
const CAT_029_ROWS: CatalogRow[] = [
  { catalog_code: "CAT-029", item_code: "1", item_label: "Persona Natural",  description: "Usado en transmisión ACCEPTED de MH TEST — ver errata sobre el mapeo corregido en el header de este archivo.", applies_to: "FEX-11", sort_order: 1 },
  { catalog_code: "CAT-029", item_code: "2", item_label: "Persona Jurídica", applies_to: "FEX-11", sort_order: 2 },
];

// ── CAT-030: Transporte — completo (6 ítems con nombre real) ─────────
// El schema JSON permite un 7º código (entero 7) sin nombre documentado
// en el catálogo oficial v1.2 — no se carga (no inventar).
const CAT_030_ROWS: CatalogRow[] = [
  { catalog_code: "CAT-030", item_code: "1", item_label: "TERRESTRE",  applies_to: "FEX-11", sort_order: 1 },
  { catalog_code: "CAT-030", item_code: "2", item_label: "AÉREO",      applies_to: "FEX-11", sort_order: 2 },
  { catalog_code: "CAT-030", item_code: "3", item_label: "MARÍTIMO",   applies_to: "FEX-11", sort_order: 3 },
  { catalog_code: "CAT-030", item_code: "4", item_label: "FERREO",     applies_to: "FEX-11", sort_order: 4 },
  { catalog_code: "CAT-030", item_code: "5", item_label: "MULTIMODAL", applies_to: "FEX-11", sort_order: 5 },
  { catalog_code: "CAT-030", item_code: "6", item_label: "CORREO",     applies_to: "FEX-11", sort_order: 6 },
];
// CAT-030 no está integrado a la UI de FEX 11: generate-fex-json.service.ts
// fija `otrosDocumentos: null` siempre (ese bloque del schema no está
// implementado en el builder todavía). Disponible en el catálogo central
// para cuando se implemente.

// ── CAT-031: INCOTERMS — catálogo COMPLETO (11 ítems) ─────────────────
// Ya no bloqueado: el Excel oficial v1.2 trae la lista completa.
const CAT_031_ROWS: CatalogRow[] = [
  { catalog_code: "CAT-031", item_code: "01", item_label: "EXW-En fabrica",                        applies_to: "FEX-11", sort_order: 1 },
  { catalog_code: "CAT-031", item_code: "02", item_label: "FCA-Libre transportista",                applies_to: "FEX-11", sort_order: 2 },
  { catalog_code: "CAT-031", item_code: "03", item_label: "CPT-Transporte pagado hasta",            applies_to: "FEX-11", sort_order: 3 },
  { catalog_code: "CAT-031", item_code: "04", item_label: "CIP-Transporte y seguro pagado hasta",   applies_to: "FEX-11", sort_order: 4 },
  { catalog_code: "CAT-031", item_code: "05", item_label: "DAP-Entrega en el lugar",                applies_to: "FEX-11", sort_order: 5 },
  { catalog_code: "CAT-031", item_code: "06", item_label: "DPU-Entregado en el lugar descargado",   applies_to: "FEX-11", sort_order: 6 },
  { catalog_code: "CAT-031", item_code: "07", item_label: "DDP-Entrega con impuestos pagados",      applies_to: "FEX-11", sort_order: 7 },
  { catalog_code: "CAT-031", item_code: "08", item_label: "FAS-Libre al costado del buque",         applies_to: "FEX-11", sort_order: 8 },
  { catalog_code: "CAT-031", item_code: "09", item_label: "FOB-Libre a bordo",                      description: "Confirmado ACCEPTED en MH TEST (FEX 11).", applies_to: "FEX-11", sort_order: 9 },
  { catalog_code: "CAT-031", item_code: "10", item_label: "CFR-Costo y flete",                      applies_to: "FEX-11", sort_order: 10 },
  { catalog_code: "CAT-031", item_code: "11", item_label: "CIF- Costo seguro y flete",               applies_to: "FEX-11", sort_order: 11 },
];

// ── FEX-11-V1-CODPAIS: catálogo de compatibilidad de país para FEX v1 ──
// Generado desde el enum real receptor.codPais de fex-11.schema.json —
// ver header F3-C23D arriba. NO es CAT-020 oficial v1.2.
import fexSchemaV1 from "../../../src/modules/commerce/dte/schemas/mh/fex-11.schema.json";

const FEX_V1_CODPAIS_ENUM: string[] = (fexSchemaV1 as unknown as {
  properties: { receptor: { properties: { codPais: { enum: string[] } } } };
}).properties.receptor.properties.codPais.enum;

// Único nombre confirmado por transmisión real ACCEPTED en MH TEST.
// No agregar más entradas aquí sin una fuente oficial que confirme el
// nombre real de un código — el resto debe quedar con el label
// conservador (no inventar nombres, ver header F3-C23D).
const FEX_V1_CODPAIS_KNOWN_NAMES: Record<string, string> = {
  "9540": "Estados Unidos",
};

// F3-C23E — Países confirmados van primero (sort_order bajo) para que el
// combobox de /dashboard/sales/export los muestre arriba de la lista; el
// resto queda con label explícito "(nombre no confirmado)" — antes decía
// solo "Código país FEX v1 <código>", que un usuario podía leer como si
// fuera simplemente un identificador técnico en vez de una advertencia de
// que el nombre real no se pudo verificar contra una fuente oficial.
const CAT_FEX_V1_CODPAIS_ROWS: CatalogRow[] = [...FEX_V1_CODPAIS_ENUM]
  .sort((a, b) => {
    const aKnown = a in FEX_V1_CODPAIS_KNOWN_NAMES;
    const bKnown = b in FEX_V1_CODPAIS_KNOWN_NAMES;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return a.localeCompare(b);
  })
  .map((code, i) => {
    const knownName = FEX_V1_CODPAIS_KNOWN_NAMES[code];
    return {
      catalog_code: "FEX-11-V1-CODPAIS",
      item_code:    code,
      item_label:   knownName ?? `Código país FEX v1 ${code} (nombre no confirmado)`,
      description:  knownName
        ? "Probado y ACCEPTED en MH TEST (FEX 11). Código de compatibilidad legado del schema fex-11.schema.json (FEX v1) — NO es CAT-020 oficial v1.2 (ISO alpha-2)."
        : "Código numérico legado del enum receptor.codPais de fex-11.schema.json (FEX v1). Nombre oficial no disponible en el repo — no inventado. Verifique el código contra el catálogo MH antes de transmitir.",
      applies_to:   "FEX-11",
      sort_order:   i + 1,
    };
  });

export const FEX11_CATALOG_ROWS: CatalogRow[] = [
  ...CAT_015_ROWS,
  ...CAT_027_ROWS,
  ...CAT_028_ROWS,
  ...CAT_029_ROWS,
  ...CAT_030_ROWS,
  ...CAT_031_ROWS,
  ...CAT_FEX_V1_CODPAIS_ROWS,
];
