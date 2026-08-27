/**
 * seed.dte-catalog-items.ts
 *
 * Catálogos DTE oficiales Ministerio de Hacienda El Salvador.
 * Idempotente: upsert por (catalog_code, item_code, version).
 *
 * Fuente: Manual Técnico DTE — MH El Salvador.
 *
 * Comando recomendado (NO ejecutar sin instrucción explícita):
 *   npx tsx prisma/seeds/seed.dte-catalog-items.ts
 */

import { PrismaClient } from "@prisma/client";
import { FEX11_CATALOG_ROWS, type CatalogRow } from "./data/fex11-catalog-rows";

const prisma = new PrismaClient();

const CATALOG_ITEMS: CatalogRow[] = [
  // ── CAT-001: Ambiente de destino ──────────────────────────────
  { catalog_code: "CAT-001", item_code: "00", item_label: "Prueba",      description: "Ambiente de pruebas MH",      sort_order: 1 },
  { catalog_code: "CAT-001", item_code: "01", item_label: "Producción",  description: "Ambiente de producción MH",   sort_order: 2 },

  // ── CAT-002: Tipo de Documento ────────────────────────────────
  { catalog_code: "CAT-002", item_code: "01", item_label: "Factura Electrónica",                      description: "FE — ventas a consumidor final",           sort_order: 1 },
  { catalog_code: "CAT-002", item_code: "03", item_label: "Comprobante de Crédito Fiscal Electrónico", description: "CCFE — ventas entre contribuyentes con NRC", sort_order: 2 },
  { catalog_code: "CAT-002", item_code: "05", item_label: "Nota de Crédito Electrónica",              description: "NCE — futuro",                             sort_order: 3 },
  { catalog_code: "CAT-002", item_code: "06", item_label: "Nota de Débito Electrónica",               description: "NDE — futuro",                             sort_order: 4 },

  // ── CAT-003: Modelo de Facturación ────────────────────────────
  { catalog_code: "CAT-003", item_code: "1", item_label: "Modelo Facturación Previo",    description: "Facturación previa a la emisión",   sort_order: 1 },
  { catalog_code: "CAT-003", item_code: "2", item_label: "Modelo Facturación Diferido",  description: "Facturación diferida post emisión",  sort_order: 2 },

  // ── CAT-004: Tipo de Transmisión ──────────────────────────────
  { catalog_code: "CAT-004", item_code: "1", item_label: "Transmisión Normal",          description: "Envío normal al MH",           sort_order: 1 },
  { catalog_code: "CAT-004", item_code: "2", item_label: "Transmisión por Contingencia", description: "Envío por contingencia al MH", sort_order: 2 },

  // ── CAT-016: Condición de la Operación ───────────────────────
  { catalog_code: "CAT-016", item_code: "1", item_label: "Contado",   description: "Pago al contado",   sort_order: 1 },
  { catalog_code: "CAT-016", item_code: "2", item_label: "A crédito", description: "Pago a crédito",    sort_order: 2 },
  { catalog_code: "CAT-016", item_code: "3", item_label: "Otro",      description: "Otra condición",    sort_order: 3 },

  // ── CAT-017: Forma de Pago ────────────────────────────────────
  { catalog_code: "CAT-017", item_code: "01", item_label: "Billetes y monedas",           sort_order: 1 },
  { catalog_code: "CAT-017", item_code: "02", item_label: "Tarjeta Débito",               sort_order: 2 },
  { catalog_code: "CAT-017", item_code: "03", item_label: "Tarjeta Crédito",              sort_order: 3 },
  { catalog_code: "CAT-017", item_code: "04", item_label: "Cheque",                       sort_order: 4 },
  { catalog_code: "CAT-017", item_code: "05", item_label: "Transferencia / Depósito Bancario", sort_order: 5 },
  { catalog_code: "CAT-017", item_code: "99", item_label: "Otros",                        sort_order: 99 },

  // ── CAT-018: Plazo ────────────────────────────────────────────
  { catalog_code: "CAT-018", item_code: "01", item_label: "Días",   sort_order: 1 },
  { catalog_code: "CAT-018", item_code: "02", item_label: "Meses",  sort_order: 2 },
  { catalog_code: "CAT-018", item_code: "03", item_label: "Años",   sort_order: 3 },

  // ── CAT-022: Tipo de Documento de Identificación del Receptor ─
  { catalog_code: "CAT-022", item_code: "00", item_label: "Consumidor final",    description: "Sin número de documento tributario", sort_order: 1 },
  { catalog_code: "CAT-022", item_code: "13", item_label: "DUI",                 description: "Documento Único de Identidad",       sort_order: 2 },
  { catalog_code: "CAT-022", item_code: "02", item_label: "Carnet de residente", description: "Carnet emitido por DGME",            sort_order: 3 },
  { catalog_code: "CAT-022", item_code: "03", item_label: "Pasaporte",           description: "Pasaporte vigente",                  sort_order: 4 },
  { catalog_code: "CAT-022", item_code: "37", item_label: "Otro",                description: "Otro tipo de documento",             sort_order: 5 },
  { catalog_code: "CAT-022", item_code: "36", item_label: "NIT",                 description: "Número de Identificación Tributaria — usado por FEX 11", sort_order: 6 },

  // ── CAT-024: Tipo de Invalidación ────────────────────────────
  // TODO: completar con códigos oficiales cuando estén disponibles en fuentes MH.
  // Los siguientes son valores de referencia; verificar contra normativa vigente.
  { catalog_code: "CAT-024", item_code: "1", item_label: "Error en los datos",                    description: "Error en datos del documento",              sort_order: 1 },
  { catalog_code: "CAT-024", item_code: "2", item_label: "Rechazado por el receptor",             description: "Documento rechazado por el receptor",       sort_order: 2 },
  { catalog_code: "CAT-024", item_code: "3", item_label: "Otro",                                  description: "Otro motivo de invalidación",               sort_order: 3 },

  // ── CAT-015, CAT-027, CAT-028, CAT-029, CAT-030, CAT-031 ──────────
  // FEX 11 (Factura de Exportación) — filas compartidas con el seed
  // runner de plataforma. Ver ./data/fex11-catalog-rows.ts para el
  // detalle completo de fuentes (auditoría F3-C23B).
  //
  // CAT-020 (País) NO está en esta lista a propósito: es exactamente
  // el mismo catálogo que el modelo `Country` ya existente en el
  // proyecto (ISO alpha-2). FEX 11 reutiliza `Country`/`getCountries()`
  // en vez de duplicarlo aquí. Ver limpieza de filas obsoletas abajo.
  ...FEX11_CATALOG_ROWS,
];

export async function seedDteCatalogItems(prisma: PrismaClient): Promise<void> {
  console.log("\n📋 Catálogos DTE oficiales MH...");

  // Limpieza: CAT-020 se cargó erróneamente como DteCatalogItem en un
  // intento previo de F3-C23B (códigos numéricos legacy, ej. "9540") antes
  // de confirmarse que el catálogo oficial v1.2 usa códigos ISO alpha-2 y
  // ya existe como modelo `Country`. Se elimina para no dejar un catálogo
  // duplicado/incorrecto disponible en /api/dte/catalogs?catalog_code=CAT-020.
  const removedCat020 = await prisma.dteCatalogItem.deleteMany({ where: { catalog_code: "CAT-020" } });
  if (removedCat020.count > 0) {
    console.log(`  🧹 ${removedCat020.count} filas obsoletas de CAT-020 eliminadas de DteCatalogItem (ahora servido por Country).`);
  }

  let upserted = 0;

  for (const row of CATALOG_ITEMS) {
    await prisma.dteCatalogItem.upsert({
      where: {
        catalog_code_item_code_version: {
          catalog_code: row.catalog_code,
          item_code:    row.item_code,
          version:      row.version ?? "1",
        },
      },
      update: {
        item_label:  row.item_label,
        description: row.description ?? null,
        applies_to:  row.applies_to  ?? null,
        sort_order:  row.sort_order  ?? null,
        is_active:   true,
      },
      create: {
        catalog_code: row.catalog_code,
        item_code:    row.item_code,
        item_label:   row.item_label,
        description:  row.description ?? null,
        applies_to:   row.applies_to  ?? null,
        version:      row.version ?? "1",
        sort_order:   row.sort_order ?? null,
        is_active:    true,
      },
    });
    upserted++;
  }

  // Limpieza de filas obsoletas dentro de los catálogos que gestiona FEX 11
  // (CAT-015, CAT-027, CAT-028, CAT-029, CAT-030, CAT-031): elimina
  // item_code que ya no están en la fuente actual (p. ej. placeholders del
  // primer intento de F3-C23B, como el "7" de CAT-030 que no tiene nombre
  // oficial en el catálogo v1.2). No toca CAT-001..024 (fuera del alcance
  // de fex11-catalog-rows.ts).
  const fex11CodesByCatalog = new Map<string, Set<string>>();
  for (const row of FEX11_CATALOG_ROWS) {
    if (!fex11CodesByCatalog.has(row.catalog_code)) fex11CodesByCatalog.set(row.catalog_code, new Set());
    fex11CodesByCatalog.get(row.catalog_code)!.add(row.item_code);
  }
  for (const [catalog_code, validCodes] of fex11CodesByCatalog) {
    const removed = await prisma.dteCatalogItem.deleteMany({
      where: { catalog_code, item_code: { notIn: [...validCodes] } },
    });
    if (removed.count > 0) {
      console.log(`  🧹 ${removed.count} fila(s) obsoleta(s) eliminada(s) de ${catalog_code}.`);
    }
  }

  console.log(`  ✅ ${upserted} catálogos DTE insertados/actualizados.`);
}

// Ejecución directa (solo si se llama directamente, no como importado)
if (require.main === module) {
  seedDteCatalogItems(prisma)
    .then(() => prisma.$disconnect())
    .catch((err) => { console.error(err); prisma.$disconnect(); process.exit(1); });
}
