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

const prisma = new PrismaClient();

interface CatalogRow {
  catalog_code: string;
  item_code:    string;
  item_label:   string;
  description?: string;
  applies_to?:  string;
  version?:     string;
  sort_order?:  number;
}

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

  // ── CAT-024: Tipo de Invalidación ────────────────────────────
  // TODO: completar con códigos oficiales cuando estén disponibles en fuentes MH.
  // Los siguientes son valores de referencia; verificar contra normativa vigente.
  { catalog_code: "CAT-024", item_code: "1", item_label: "Error en los datos",                    description: "Error en datos del documento",              sort_order: 1 },
  { catalog_code: "CAT-024", item_code: "2", item_label: "Rechazado por el receptor",             description: "Documento rechazado por el receptor",       sort_order: 2 },
  { catalog_code: "CAT-024", item_code: "3", item_label: "Otro",                                  description: "Otro motivo de invalidación",               sort_order: 3 },
];

export async function seedDteCatalogItems(prisma: PrismaClient): Promise<void> {
  console.log("\n📋 Catálogos DTE oficiales MH...");
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

  console.log(`  ✅ ${upserted} catálogos DTE insertados/actualizados.`);
}

// Ejecución directa (solo si se llama directamente, no como importado)
if (require.main === module) {
  seedDteCatalogItems(prisma)
    .then(() => prisma.$disconnect())
    .catch((err) => { console.error(err); prisma.$disconnect(); process.exit(1); });
}
