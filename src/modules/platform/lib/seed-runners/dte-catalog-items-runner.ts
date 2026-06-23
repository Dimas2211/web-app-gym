// ─────────────────────────────────────────────────────────────────
// platform/lib/seed-runners — dte-catalog-items-runner.ts
//
// Runner SERVER-ONLY para seed controlado de catálogos DTE.
// D1A: primer seed runner contra un PlatformDatabaseProfile.
//
// Garantías:
// - No ejecuta migraciones.
// - Solo escribe en dte_catalog_items.
// - No borra, no trunca, no toca otras tablas.
// - dry-run: solo lectura, sin efectos.
// - real run: upsert idempotente, seguro de re-ejecutar.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[dte-catalog-items-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DteCatalogItemsSeedDryRunResult,
  DteCatalogItemsSeedResult,
} from "../../types/platform.types";

// ── Catálogos DTE requeridos ──────────────────────────────────────
// Debe coincidir con REQUIRED_DTE_CATALOGS en database-preflight.ts

export const REQUIRED_DTE_CATALOG_CODES = [
  "CAT-001",
  "CAT-002",
  "CAT-016",
  "CAT-017",
  "CAT-018",
  "CAT-022",
  "CAT-024",
] as const;

// ── Datos del seed ────────────────────────────────────────────────
// Definidos aquí para evitar importar desde el script CLI
// (prisma/seeds/seed.dte-catalog-items.ts) que tiene un
// `new PrismaClient()` en module scope.

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
  { catalog_code: "CAT-001", item_code: "00", item_label: "Prueba",     description: "Ambiente de pruebas MH",    sort_order: 1 },
  { catalog_code: "CAT-001", item_code: "01", item_label: "Producción", description: "Ambiente de producción MH", sort_order: 2 },

  // ── CAT-002: Tipo de Documento ────────────────────────────────
  { catalog_code: "CAT-002", item_code: "01", item_label: "Factura Electrónica",                       description: "FE — ventas a consumidor final",            sort_order: 1 },
  { catalog_code: "CAT-002", item_code: "03", item_label: "Comprobante de Crédito Fiscal Electrónico",  description: "CCFE — ventas entre contribuyentes con NRC", sort_order: 2 },
  { catalog_code: "CAT-002", item_code: "05", item_label: "Nota de Crédito Electrónica",               description: "NCE — futuro",                              sort_order: 3 },
  { catalog_code: "CAT-002", item_code: "06", item_label: "Nota de Débito Electrónica",                description: "NDE — futuro",                              sort_order: 4 },

  // ── CAT-003: Modelo de Facturación ────────────────────────────
  { catalog_code: "CAT-003", item_code: "1", item_label: "Modelo Facturación Previo",   description: "Facturación previa a la emisión",  sort_order: 1 },
  { catalog_code: "CAT-003", item_code: "2", item_label: "Modelo Facturación Diferido", description: "Facturación diferida post emisión", sort_order: 2 },

  // ── CAT-004: Tipo de Transmisión ──────────────────────────────
  { catalog_code: "CAT-004", item_code: "1", item_label: "Transmisión Normal",          description: "Envío normal al MH",           sort_order: 1 },
  { catalog_code: "CAT-004", item_code: "2", item_label: "Transmisión por Contingencia", description: "Envío por contingencia al MH", sort_order: 2 },

  // ── CAT-016: Condición de la Operación ───────────────────────
  { catalog_code: "CAT-016", item_code: "1", item_label: "Contado",   description: "Pago al contado",  sort_order: 1 },
  { catalog_code: "CAT-016", item_code: "2", item_label: "A crédito", description: "Pago a crédito",   sort_order: 2 },
  { catalog_code: "CAT-016", item_code: "3", item_label: "Otro",      description: "Otra condición",   sort_order: 3 },

  // ── CAT-017: Forma de Pago ────────────────────────────────────
  { catalog_code: "CAT-017", item_code: "01", item_label: "Billetes y monedas",               sort_order: 1  },
  { catalog_code: "CAT-017", item_code: "02", item_label: "Tarjeta Débito",                   sort_order: 2  },
  { catalog_code: "CAT-017", item_code: "03", item_label: "Tarjeta Crédito",                  sort_order: 3  },
  { catalog_code: "CAT-017", item_code: "04", item_label: "Cheque",                           sort_order: 4  },
  { catalog_code: "CAT-017", item_code: "05", item_label: "Transferencia / Depósito Bancario", sort_order: 5  },
  { catalog_code: "CAT-017", item_code: "99", item_label: "Otros",                            sort_order: 99 },

  // ── CAT-018: Plazo ────────────────────────────────────────────
  { catalog_code: "CAT-018", item_code: "01", item_label: "Días",  sort_order: 1 },
  { catalog_code: "CAT-018", item_code: "02", item_label: "Meses", sort_order: 2 },
  { catalog_code: "CAT-018", item_code: "03", item_label: "Años",  sort_order: 3 },

  // ── CAT-022: Tipo de Documento de Identificación del Receptor ─
  { catalog_code: "CAT-022", item_code: "00", item_label: "Consumidor final",    description: "Sin número de documento tributario", sort_order: 1 },
  { catalog_code: "CAT-022", item_code: "13", item_label: "DUI",                 description: "Documento Único de Identidad",       sort_order: 2 },
  { catalog_code: "CAT-022", item_code: "02", item_label: "Carnet de residente", description: "Carnet emitido por DGME",            sort_order: 3 },
  { catalog_code: "CAT-022", item_code: "03", item_label: "Pasaporte",           description: "Pasaporte vigente",                  sort_order: 4 },
  { catalog_code: "CAT-022", item_code: "37", item_label: "Otro",                description: "Otro tipo de documento",             sort_order: 5 },

  // ── CAT-024: Tipo de Invalidación ────────────────────────────
  { catalog_code: "CAT-024", item_code: "1", item_label: "Error en los datos",          description: "Error en datos del documento",        sort_order: 1 },
  { catalog_code: "CAT-024", item_code: "2", item_label: "Rechazado por el receptor",   description: "Documento rechazado por el receptor", sort_order: 2 },
  { catalog_code: "CAT-024", item_code: "3", item_label: "Otro",                        description: "Otro motivo de invalidación",          sort_order: 3 },
];

// Items que pertenecen a los catálogos requeridos (para dry-run)
const REQUIRED_CATALOG_ITEMS = CATALOG_ITEMS.filter((item) =>
  (REQUIRED_DTE_CATALOG_CODES as readonly string[]).includes(item.catalog_code),
);

// ── Dry-run ───────────────────────────────────────────────────────
//
// Solo lectura — no escribe nada.
// Determina qué catálogos faltan y cuántos items se crearían.

export async function runDteCatalogItemsSeedDryRun(
  prismaClient: PrismaClient,
): Promise<DteCatalogItemsSeedDryRunResult> {
  const counts = await Promise.all(
    REQUIRED_DTE_CATALOG_CODES.map((cat) =>
      prismaClient.dteCatalogItem
        .count({ where: { catalog_code: cat, is_active: true } })
        .then((count) => ({ cat, count })),
    ),
  );

  const missingCatalogs: string[] = counts.filter(({ count }) => count === 0).map(({ cat }) => cat);
  const existingCatalogsCount     = counts.filter(({ count }) => count > 0).length;

  const itemsToCreate = REQUIRED_CATALOG_ITEMS.filter((item) =>
    missingCatalogs.includes(item.catalog_code),
  ).length;

  return {
    totalExpected:         CATALOG_ITEMS.length,
    missingCatalogs,
    existingCatalogsCount,
    itemsToCreate,
  };
}

// ── Seed real — idempotente ───────────────────────────────────────
//
// Upsert por (catalog_code, item_code, version).
// No borra. No trunca. No toca otras tablas.
// Seguro de re-ejecutar: segunda ejecución → todo queda en "updated".

export async function runDteCatalogItemsSeed(
  prismaClient: PrismaClient,
): Promise<DteCatalogItemsSeedResult> {
  let created = 0;
  let updated = 0;

  for (const row of CATALOG_ITEMS) {
    const version = row.version ?? "1";
    const uniqueKey = {
      catalog_code_item_code_version: {
        catalog_code: row.catalog_code,
        item_code:    row.item_code,
        version,
      },
    };

    const existing = await prismaClient.dteCatalogItem.findUnique({
      where:  uniqueKey,
      select: { id: true },
    });

    await prismaClient.dteCatalogItem.upsert({
      where:  uniqueKey,
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
        version,
        sort_order:   row.sort_order ?? null,
        is_active:    true,
      },
    });

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  const totalAfter = await prismaClient.dteCatalogItem.count({
    where: { is_active: true },
  });

  return {
    created,
    updated,
    totalExpected: CATALOG_ITEMS.length,
    totalAfter,
  };
}
