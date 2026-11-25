// ─────────────────────────────────────────────────────────────────
// prisma/seeds/data — dte-catalog-items-mh20.data.ts
//
// MH20 (IMP20-009) — catálogos MH 2.0 versionados (version = "2.0").
// Fuente única de datos, módulo puro (sin PrismaClient). Extraído
// programáticamente de:
//   docs/fiscal/mh-normativa-2.0/originales/Catálogos - Facturación Electrónica.xlsx
//   (Hoja1; filas indicadas por catálogo; SHA e86d7edc…, ver 03-inventario-catalogos.json)
//
// Reglas:
//   - ADITIVO: no reemplaza ni elimina filas version "1" (historial V1.2).
//   - NO se siembra todavía: list-dte-catalog-items y los selectores filtran
//     solo por catalog_code (sin version); sembrar estas filas activas las
//     expondría en flujos MH 1.2. El cableado a seed/runner queda para la
//     activación (requiere filtro por versión en las consultas).
//   - CAT-033 "TA-1": Fase 6.1 (consultas-mh-verificadas.md §15,
//     RESUELTO_DOCUMENTALMENTE). CAT-PDF p.60 muestra "TA-1" sin espacio y la
//     longitud oficial es 4 (Anexo II campo 36); el " TA-1" del Excel
//     (Hoja1!A1907) es un artefacto. Historial: hasta Fase 6 se sembraba
//     literal " TA-1" (CAT-INC-004). La fuente oficial no se modificó.
//   - CAT-028 2.0 usa formato cccc.ccc; la equivalencia EX-n.cccc.ccc →
//     cccc.ccc NO está confirmada: no se migran referencias existentes.
//   - Etiquetas: espacios finales recortados (p. ej. "Giro bancario ").
// ─────────────────────────────────────────────────────────────────

import type { CatalogRow } from "./fex11-catalog-rows";

export const DTE_CATALOG_VERSION_MH20 = "2.0";

/** Fila Excel de origen por catálogo (trazabilidad). */
export const DTE_CATALOG_MH20_SOURCE_ROWS: Readonly<Record<string, number>> = {
  "CAT-002": 12,
  "CAT-017": 524,
  "CAT-024": 1705,
  "CAT-028": 1776,
  "CAT-033": 1902,
};

/** Títulos 2.0 (CAT20-004 / CAT20-417 / CAT20-727). */
export const DTE_CATALOG_MH20_TITLES: Readonly<Record<string, string>> = {
  "CAT-002": "Tipo de Documento / Evento",
  "CAT-017": "Forma de Pago",
  "CAT-024": "Motivo del evento",
  "CAT-028": "Régimen",
  "CAT-033": "Tipo de Régimen",
};

export const DTE_CATALOG_ITEMS_MH20: readonly CatalogRow[] = Object.freeze([
  // ── CAT-002 Tipo de Documento / Evento (Hoja1!A12, 13 filas) ──
  { catalog_code: "CAT-002", item_code: "01", item_label: "Factura", version: DTE_CATALOG_VERSION_MH20, sort_order: 1 },
  { catalog_code: "CAT-002", item_code: "03", item_label: "Comprobante de crédito fiscal", version: DTE_CATALOG_VERSION_MH20, sort_order: 2 },
  { catalog_code: "CAT-002", item_code: "04", item_label: "Nota de remisión", version: DTE_CATALOG_VERSION_MH20, sort_order: 3 },
  { catalog_code: "CAT-002", item_code: "05", item_label: "Nota de crédito", version: DTE_CATALOG_VERSION_MH20, sort_order: 4 },
  { catalog_code: "CAT-002", item_code: "06", item_label: "Nota de débito", version: DTE_CATALOG_VERSION_MH20, sort_order: 5 },
  { catalog_code: "CAT-002", item_code: "07", item_label: "Comprobante de retención", version: DTE_CATALOG_VERSION_MH20, sort_order: 6 },
  { catalog_code: "CAT-002", item_code: "08", item_label: "Comprobante de liquidación", version: DTE_CATALOG_VERSION_MH20, sort_order: 7 },
  { catalog_code: "CAT-002", item_code: "09", item_label: "Documento contable de liquidación", version: DTE_CATALOG_VERSION_MH20, sort_order: 8 },
  { catalog_code: "CAT-002", item_code: "11", item_label: "Facturas de exportación", version: DTE_CATALOG_VERSION_MH20, sort_order: 9 },
  { catalog_code: "CAT-002", item_code: "14", item_label: "Factura de sujeto excluido", version: DTE_CATALOG_VERSION_MH20, sort_order: 10 },
  { catalog_code: "CAT-002", item_code: "15", item_label: "Comprobante de donación", version: DTE_CATALOG_VERSION_MH20, sort_order: 11 },
  { catalog_code: "CAT-002", item_code: "17", item_label: "Evento de Operaciones Especiales", version: DTE_CATALOG_VERSION_MH20, sort_order: 12 },
  { catalog_code: "CAT-002", item_code: "18", item_label: "Evento de Retorno", version: DTE_CATALOG_VERSION_MH20, sort_order: 13 },
  // ── CAT-017 Forma de Pago (Hoja1!A524, 12 filas) ──
  { catalog_code: "CAT-017", item_code: "01", item_label: "Billetes y monedas", version: DTE_CATALOG_VERSION_MH20, sort_order: 1 },
  { catalog_code: "CAT-017", item_code: "02", item_label: "Tarjeta Débito", version: DTE_CATALOG_VERSION_MH20, sort_order: 2 },
  { catalog_code: "CAT-017", item_code: "03", item_label: "Tarjeta Crédito", version: DTE_CATALOG_VERSION_MH20, sort_order: 3 },
  { catalog_code: "CAT-017", item_code: "04", item_label: "Cheque", version: DTE_CATALOG_VERSION_MH20, sort_order: 4 },
  { catalog_code: "CAT-017", item_code: "05", item_label: "Transferencia-Depósito Bancario", version: DTE_CATALOG_VERSION_MH20, sort_order: 5 },
  { catalog_code: "CAT-017", item_code: "08", item_label: "Dinero electrónico", version: DTE_CATALOG_VERSION_MH20, sort_order: 6 },
  { catalog_code: "CAT-017", item_code: "09", item_label: "Monedero electrónico", version: DTE_CATALOG_VERSION_MH20, sort_order: 7 },
  { catalog_code: "CAT-017", item_code: "11", item_label: "Bitcoin", version: DTE_CATALOG_VERSION_MH20, sort_order: 8 },
  { catalog_code: "CAT-017", item_code: "12", item_label: "Otras Criptomonedas", version: DTE_CATALOG_VERSION_MH20, sort_order: 9 },
  { catalog_code: "CAT-017", item_code: "13", item_label: "Cuentas por pagar del receptor", version: DTE_CATALOG_VERSION_MH20, sort_order: 10 },
  { catalog_code: "CAT-017", item_code: "14", item_label: "Giro bancario", version: DTE_CATALOG_VERSION_MH20, sort_order: 11 },
  { catalog_code: "CAT-017", item_code: "99", item_label: "Otros (se debe indicar el medio de pago)", version: DTE_CATALOG_VERSION_MH20, sort_order: 12 },
  // ── CAT-024 Motivo del evento (Hoja1!A1705, 3 filas) ──
  { catalog_code: "CAT-024", item_code: "1", item_label: "Error en la Información del Documento Tributario Electrónico a invalidar.", version: DTE_CATALOG_VERSION_MH20, sort_order: 1 },
  { catalog_code: "CAT-024", item_code: "2", item_label: "Rescindir de la operación realizada.", version: DTE_CATALOG_VERSION_MH20, sort_order: 2 },
  { catalog_code: "CAT-024", item_code: "3", item_label: "Otro", version: DTE_CATALOG_VERSION_MH20, sort_order: 3 },
  // ── CAT-028 Régimen (Hoja1!A1776, 90 filas) ──
  { catalog_code: "CAT-028", item_code: "1000.000", item_label: "Exportación Definitiva, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 1 },
  { catalog_code: "CAT-028", item_code: "1040.000", item_label: "Exportación Definitiva Sustitución de Mercancías, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 2 },
  { catalog_code: "CAT-028", item_code: "1041.020", item_label: "Exportación Definitiva Proveniente de Franquicia Provisional, Franq. Presidenciales exento de DAI", version: DTE_CATALOG_VERSION_MH20, sort_order: 3 },
  { catalog_code: "CAT-028", item_code: "1041.021", item_label: "Exportación Definitiva Proveniente de Franquicia Provisional, Franq. Presidenciales exento de DAI e IVA", version: DTE_CATALOG_VERSION_MH20, sort_order: 4 },
  { catalog_code: "CAT-028", item_code: "1048.025", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Maquinaria y Equipo LZF. DPA", version: DTE_CATALOG_VERSION_MH20, sort_order: 5 },
  { catalog_code: "CAT-028", item_code: "1048.031", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Distribución Internacional", version: DTE_CATALOG_VERSION_MH20, sort_order: 6 },
  { catalog_code: "CAT-028", item_code: "1048.032", item_label: "Exportación Definitiva Proveniente. de Franquicia Definitiva, Operaciones Internacionales de Logística", version: DTE_CATALOG_VERSION_MH20, sort_order: 7 },
  { catalog_code: "CAT-028", item_code: "1048.033", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Centro Internacional de llamadas(Call Center)", version: DTE_CATALOG_VERSION_MH20, sort_order: 8 },
  { catalog_code: "CAT-028", item_code: "1048.034", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Tecnologias de Información LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 9 },
  { catalog_code: "CAT-028", item_code: "1048.035", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Investigación y Desarrollo LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 10 },
  { catalog_code: "CAT-028", item_code: "1048.036", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Embarcaciones Marítimas LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 11 },
  { catalog_code: "CAT-028", item_code: "1048.037", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Aeronaves LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 12 },
  { catalog_code: "CAT-028", item_code: "1048.038", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Procesos Empresariales LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 13 },
  { catalog_code: "CAT-028", item_code: "1048.039", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Servicios Medico-Hospitalarios LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 14 },
  { catalog_code: "CAT-028", item_code: "1048.040", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Servicios Financieros Internacionales LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 15 },
  { catalog_code: "CAT-028", item_code: "1048.043", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Contenedores LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 16 },
  { catalog_code: "CAT-028", item_code: "1048.044", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación de Equipos Tecnológicos LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 17 },
  { catalog_code: "CAT-028", item_code: "1048.054", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Atención Ancianos y Convalecientes LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 18 },
  { catalog_code: "CAT-028", item_code: "1048.055", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Telemedicina LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 19 },
  { catalog_code: "CAT-028", item_code: "1048.056", item_label: "Exportación Definitiva Proveniente de Franquicia Definitiva, Cinematografía LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 20 },
  { catalog_code: "CAT-028", item_code: "1052.000", item_label: "Exportación Definitiva de DPA con origen en Compras Locales, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 21 },
  { catalog_code: "CAT-028", item_code: "1054.000", item_label: "Exportación Definitiva de Zona Franca con origen en Compras Locales, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 22 },
  { catalog_code: "CAT-028", item_code: "1100.000", item_label: "Exportación Definitiva de Envíos de Socorro , Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 23 },
  { catalog_code: "CAT-028", item_code: "1200.000", item_label: "Exportación Definitiva de Envíos Postales, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 24 },
  { catalog_code: "CAT-028", item_code: "1300.000", item_label: "Exportación Definitiva Envíos que  requieren despacho urgente, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 25 },
  { catalog_code: "CAT-028", item_code: "1400.000", item_label: "Exportación Definitiva  Courier, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 26 },
  { catalog_code: "CAT-028", item_code: "1400.011", item_label: "Exportación Definitiva  Courier, Muestras Sin Valor Comercial", version: DTE_CATALOG_VERSION_MH20, sort_order: 27 },
  { catalog_code: "CAT-028", item_code: "1400.012", item_label: "Exportación Definitiva  Courier, Material Publicitario", version: DTE_CATALOG_VERSION_MH20, sort_order: 28 },
  { catalog_code: "CAT-028", item_code: "1400.017", item_label: "Exportación Definitiva  Courier, Declaración de Documentos", version: DTE_CATALOG_VERSION_MH20, sort_order: 29 },
  { catalog_code: "CAT-028", item_code: "1500.000", item_label: "Exportación Definitiva Menaje de casa, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 30 },
  { catalog_code: "CAT-028", item_code: "2100.000", item_label: "Exportación Temporal para Perfeccionamiento Pasivo, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 31 },
  { catalog_code: "CAT-028", item_code: "2100.065", item_label: "Exportación Temporal para Perfeccionamiento Pasivo, De Mercado Nacional a ZF o DPA", version: DTE_CATALOG_VERSION_MH20, sort_order: 32 },
  { catalog_code: "CAT-028", item_code: "2200.000", item_label: "Exportación Temporal con Reimportación en el mismo estado, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 33 },
  { catalog_code: "CAT-028", item_code: "2200.065", item_label: "Exportación Temporal con Reimportación en el mismo estado, De Mercado Nacional a ZF o DPA", version: DTE_CATALOG_VERSION_MH20, sort_order: 34 },
  { catalog_code: "CAT-028", item_code: "2400.000", item_label: "Traslados Definitivos", version: DTE_CATALOG_VERSION_MH20, sort_order: 35 },
  { catalog_code: "CAT-028", item_code: "3050.000", item_label: "Reexportación Proveniente de Importación Temporal, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 36 },
  { catalog_code: "CAT-028", item_code: "3051.000", item_label: "Reexportación Proveniente de Tiendas Libres, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 37 },
  { catalog_code: "CAT-028", item_code: "3052.000", item_label: "Reexportación Proveniente de Admisión Temporal para Perfeccionamiento Activo, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 38 },
  { catalog_code: "CAT-028", item_code: "3053.000", item_label: "Reexportación Proveniente de Admisión Temporal, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 39 },
  { catalog_code: "CAT-028", item_code: "3054.000", item_label: "Reexportación Proveniente de Régimen de Zona Franca, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 40 },
  { catalog_code: "CAT-028", item_code: "3055.000", item_label: "Reexportación Proveniente de Admisión Temporal para Perfeccionamiento Activo con Garantía, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 41 },
  { catalog_code: "CAT-028", item_code: "3056.000", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 42 },
  { catalog_code: "CAT-028", item_code: "3056.047", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión a Departamento de Subastas", version: DTE_CATALOG_VERSION_MH20, sort_order: 43 },
  { catalog_code: "CAT-028", item_code: "3056.057", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios", version: DTE_CATALOG_VERSION_MH20, sort_order: 44 },
  { catalog_code: "CAT-028", item_code: "3056.058", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios", version: DTE_CATALOG_VERSION_MH20, sort_order: 45 },
  { catalog_code: "CAT-028", item_code: "3056.072", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Decreto 738 Eléctricos e Híbridos", version: DTE_CATALOG_VERSION_MH20, sort_order: 46 },
  { catalog_code: "CAT-028", item_code: "3056.081", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 47 },
  { catalog_code: "CAT-028", item_code: "3056.084", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, De una LSI para un DPA", version: DTE_CATALOG_VERSION_MH20, sort_order: 48 },
  { catalog_code: "CAT-028", item_code: "3056.085", item_label: "Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, De una LSI para una ZF", version: DTE_CATALOG_VERSION_MH20, sort_order: 49 },
  { catalog_code: "CAT-028", item_code: "3057.000", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 50 },
  { catalog_code: "CAT-028", item_code: "3057.047", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión a Departamento de Subastas", version: DTE_CATALOG_VERSION_MH20, sort_order: 51 },
  { catalog_code: "CAT-028", item_code: "3057.057", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios", version: DTE_CATALOG_VERSION_MH20, sort_order: 52 },
  { catalog_code: "CAT-028", item_code: "3057.058", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios", version: DTE_CATALOG_VERSION_MH20, sort_order: 53 },
  { catalog_code: "CAT-028", item_code: "3057.081", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 54 },
  { catalog_code: "CAT-028", item_code: "3057.084", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, De una LSI para un DPA", version: DTE_CATALOG_VERSION_MH20, sort_order: 55 },
  { catalog_code: "CAT-028", item_code: "3057.085", item_label: "Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, De una LSI para una ZF", version: DTE_CATALOG_VERSION_MH20, sort_order: 56 },
  { catalog_code: "CAT-028", item_code: "3058.033", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Centro Internacional de llamadas(Call Center)", version: DTE_CATALOG_VERSION_MH20, sort_order: 57 },
  { catalog_code: "CAT-028", item_code: "3058.034", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Tecnologías de Información LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 58 },
  { catalog_code: "CAT-028", item_code: "3058.035", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Investigación y Desarrollo LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 59 },
  { catalog_code: "CAT-028", item_code: "3058.036", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Embarcaciones Marítimas LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 60 },
  { catalog_code: "CAT-028", item_code: "3058.037", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Aeronaves LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 61 },
  { catalog_code: "CAT-028", item_code: "3058.038", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Procesos Empresariales LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 62 },
  { catalog_code: "CAT-028", item_code: "3058.039", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Servicios Medico-Hospitalarios LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 63 },
  { catalog_code: "CAT-028", item_code: "3058.040", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Servicios Financieros Internacionales LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 64 },
  { catalog_code: "CAT-028", item_code: "3058.043", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Contenedores LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 65 },
  { catalog_code: "CAT-028", item_code: "3058.044", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación de Equipos Tecnológicos LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 66 },
  { catalog_code: "CAT-028", item_code: "3058.054", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Atención Ancianos y Convalecientes LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 67 },
  { catalog_code: "CAT-028", item_code: "3058.055", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Telemedicina LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 68 },
  { catalog_code: "CAT-028", item_code: "3058.056", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Cinematografía LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 69 },
  { catalog_code: "CAT-028", item_code: "3058.082", item_label: "Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Remisión entre Centros de Servicios LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 70 },
  { catalog_code: "CAT-028", item_code: "3059.000", item_label: "Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 71 },
  { catalog_code: "CAT-028", item_code: "3059.057", item_label: "Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios", version: DTE_CATALOG_VERSION_MH20, sort_order: 72 },
  { catalog_code: "CAT-028", item_code: "3059.058", item_label: "Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios", version: DTE_CATALOG_VERSION_MH20, sort_order: 73 },
  { catalog_code: "CAT-028", item_code: "3059.033", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Centro Internacional de llamadas(Call Center)", version: DTE_CATALOG_VERSION_MH20, sort_order: 74 },
  { catalog_code: "CAT-028", item_code: "3059.034", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Tecnologías de Información LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 75 },
  { catalog_code: "CAT-028", item_code: "3059.035", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Investigación y Desarrollo LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 76 },
  { catalog_code: "CAT-028", item_code: "3059.038", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Procesos Empresariales LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 77 },
  { catalog_code: "CAT-028", item_code: "3059.039", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Servicios Medico-Hospitalarios LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 78 },
  { catalog_code: "CAT-028", item_code: "3059.040", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Servicios Financieros Internacionales LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 79 },
  { catalog_code: "CAT-028", item_code: "3059.044", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Reparación de Equipos Tecnológicos LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 80 },
  { catalog_code: "CAT-028", item_code: "3059.047", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Remisión a Departamento de Subastas", version: DTE_CATALOG_VERSION_MH20, sort_order: 81 },
  { catalog_code: "CAT-028", item_code: "3059.054", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Atención Ancianos y Convalecientes LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 82 },
  { catalog_code: "CAT-028", item_code: "3059.055", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Telemedicina LS", version: DTE_CATALOG_VERSION_MH20, sort_order: 83 },
  { catalog_code: "CAT-028", item_code: "3059.056", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Cinematografía LSI", version: DTE_CATALOG_VERSION_MH20, sort_order: 84 },
  { catalog_code: "CAT-028", item_code: "3059.081", item_label: "Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Remisión entre Usuarios Directos", version: DTE_CATALOG_VERSION_MH20, sort_order: 85 },
  { catalog_code: "CAT-028", item_code: "3070.000", item_label: "Reexportación Proveniente de Depósito., Régimen Común", version: DTE_CATALOG_VERSION_MH20, sort_order: 86 },
  { catalog_code: "CAT-028", item_code: "3070.047", item_label: "Reexportación Proveniente de Depósito., Remisión a Departamento de Subastas", version: DTE_CATALOG_VERSION_MH20, sort_order: 87 },
  { catalog_code: "CAT-028", item_code: "3070.072", item_label: "Reexportación Proveniente de Depósito., Decreto 738 Eléctricos e Híbridos", version: DTE_CATALOG_VERSION_MH20, sort_order: 88 },
  { catalog_code: "CAT-028", item_code: "3071.000", item_label: "Reexp. Prov. de Deposito.", version: DTE_CATALOG_VERSION_MH20, sort_order: 89 },
  { catalog_code: "CAT-028", item_code: "0000.000", item_label: "Tránsito Aduanero", version: DTE_CATALOG_VERSION_MH20, sort_order: 90 },
  // ── CAT-033 Tipo de Régimen (Hoja1!A1902, 4 filas) ──
  { catalog_code: "CAT-033", item_code: "EX-1", item_label: "Exportación Definitiva", version: DTE_CATALOG_VERSION_MH20, sort_order: 1 },
  { catalog_code: "CAT-033", item_code: "EX-2", item_label: "Exportación Temporal", version: DTE_CATALOG_VERSION_MH20, sort_order: 2 },
  { catalog_code: "CAT-033", item_code: "EX-3", item_label: "Reexportación", version: DTE_CATALOG_VERSION_MH20, sort_order: 3 },
  { catalog_code: "CAT-033", item_code: "TA-1", item_label: "Tránsito Aduanero", version: DTE_CATALOG_VERSION_MH20, sort_order: 4 },
]);
