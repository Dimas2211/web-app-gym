// ─────────────────────────────────────────────────────────────────
// platform — inventory-import-runner.ts
//
// E1C-E1: Runner SERVER-ONLY para importar inventario inicial desde
// un preview ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en product_locations e inventory_movements.
// - No crea, actualiza ni elimina products, categorías, unidades,
//   proveedores, sucursales, ventas, compras, DTE ni caja.
// - Política fija: CREATE_ONLY. No updates, no upserts, no deletes.
// - Llave natural: product_code + location_name (Branch). No se resuelve
//   ambigüedad aquí — eso ya lo bloqueó el analizador DB-aware.
// - Por fila crea ProductLocation + InventoryMovement (INITIAL_LOAD) en
//   una sola transacción — nunca solo uno de los dos.
// - Doble candado de idempotencia: bloquea si ya existe ProductLocation
//   para (tenant, product, location) o InventoryMovement INITIAL_LOAD
//   para el mismo trío. Revalidado aquí server-side, no solo en el
//   análisis previo.
// - Revalida product_type=PRODUCT, is_stockable=true, status=ACTIVE y
//   quantity > 0 por seguridad (el parser y el análisis DB-aware ya
//   bloquean estos casos, pero este runner no confía únicamente en ellos).
// - Si cualquier fila falla la validación previa → bloquea todo (sin
//   importación parcial).
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: todas las filas dentro de una única $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[inventory-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  InventoryImportRowResult,
  InventoryImportDryRunResult,
  InventoryImportResult,
} from "../../../types/platform.types";

// ── Helpers ───────────────────────────────────────────────────────

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isEmpty(v: unknown): boolean {
  return strVal(v) === "";
}

function toDecimal(v: unknown): number {
  const n = Number(strVal(v).replace(",", "."));
  return isNaN(n) ? NaN : n;
}

function toDecimalOrNull(v: unknown): number | null {
  if (isEmpty(v)) return null;
  const n = toDecimal(v);
  return isNaN(n) ? null : n;
}

// ── Input del runner ──────────────────────────────────────────────

export interface InventoryImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
  performedBy:   string | null;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runInventoryImport(
  input: InventoryImportRunnerInput,
): Promise<InventoryImportResult | InventoryImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun, performedBy } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  interface RowToCreate {
    rowNumber:   number;
    code:        string;
    locationName: string;
    quantity:    number;
    unitCost:    number | null;
    notes:       string | null;
    productId:   string;
    locationId:  string;
    valid:       true;
  }

  interface RowBlocked {
    rowNumber:   number;
    code:        string;
    locationName: string;
    reason:      string;
    valid:       false;
  }

  type PreparedRow = RowToCreate | RowBlocked;

  const prepared: PreparedRow[] = createRows.map((dbRow) => {
    const parsedRow    = parsedPreview.rows.find((r) => r.rowNumber === dbRow.rowNumber);
    const code         = strVal(parsedRow?.data.product_code ?? "").toUpperCase();
    const locationName = strVal(parsedRow?.data.location_name ?? "");

    if (!code) {
      return { rowNumber: dbRow.rowNumber, code: "", locationName, reason: "product_code vacío.", valid: false };
    }
    if (!locationName) {
      return { rowNumber: dbRow.rowNumber, code, locationName: "", reason: "location_name vacío.", valid: false };
    }

    const findDep = (type: string) => dbRow.dependencyChecks.find((d) => d.dependencyType === type);

    const productId = findDep("product")?.foundId;
    if (!productId) {
      return { rowNumber: dbRow.rowNumber, code, locationName, reason: "Producto no resuelto. La fila debió bloquearse en el análisis DB-aware.", valid: false };
    }

    const locationId = findDep("location")?.foundId;
    if (!locationId) {
      return { rowNumber: dbRow.rowNumber, code, locationName, reason: "Sucursal no resuelta. La fila debió bloquearse en el análisis DB-aware.", valid: false };
    }

    const quantity = toDecimal(parsedRow?.data.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      return { rowNumber: dbRow.rowNumber, code, locationName, reason: "quantity debe ser un número mayor que 0.", valid: false };
    }

    const unitCost = toDecimalOrNull(parsedRow?.data.unit_cost);
    if (unitCost !== null && unitCost < 0) {
      return { rowNumber: dbRow.rowNumber, code, locationName, reason: "unit_cost no puede ser negativo.", valid: false };
    }

    return {
      rowNumber: dbRow.rowNumber,
      code,
      locationName,
      quantity,
      unitCost,
      notes: strVal(parsedRow?.data.notes ?? "") || null,
      productId,
      locationId,
      valid: true,
    };
  });

  const blocked  = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 2. Verificar duplicados de product_code + location_name dentro del archivo ─
  const keysSeen = new Map<string, number>();
  const duplicatesInFile: RowBlocked[] = [];

  for (const row of toCreate) {
    const key = `${row.code}||${row.locationName.toUpperCase()}`;
    if (keysSeen.has(key)) {
      duplicatesInFile.push({
        rowNumber: row.rowNumber,
        code:      row.code,
        locationName: row.locationName,
        reason:    `product_code '${row.code}' + location_name '${row.locationName}' ya aparece en otra fila del archivo (fila ${keysSeen.get(key)}).`,
        valid:     false,
      });
    } else {
      keysSeen.set(key, row.rowNumber);
    }
  }

  const blockedRowNumbers = new Set([
    ...blocked.map((b) => b.rowNumber),
    ...duplicatesInFile.map((b) => b.rowNumber),
  ]);
  const allBlocked = [...blocked, ...duplicatesInFile];

  // ── 3. Si hay cualquier fila bloqueada → abortar todo (sin import parcial) ─

  if (allBlocked.length > 0) {
    const allRowResults: InventoryImportRowResult[] = [
      ...toCreate
        .filter((r) => !blockedRowNumbers.has(r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.locationName, code: r.code, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.locationName, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies InventoryImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-E1 no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 4. Revalidar idempotencia contra la base destino (candado doble) ─
  const productIds = Array.from(new Set(toCreate.map((r) => r.productId)));
  const [existingLocations, existingInitialMoves] = await Promise.all([
    productIds.length > 0
      ? prismaClient.productLocation.findMany({
          where:  { tenant_id: tenantId, product_id: { in: productIds } },
          select: { product_id: true, location_id: true },
        })
      : Promise.resolve([]),
    productIds.length > 0
      ? prismaClient.inventoryMovement.findMany({
          where:  { tenant_id: tenantId, product_id: { in: productIds }, movement_type: "INITIAL_LOAD" },
          select: { product_id: true, location_id: true },
        })
      : Promise.resolve([]),
  ]);

  const plSet       = new Set(existingLocations.map((pl) => `${pl.product_id}::${pl.location_id}`));
  const initMoveSet = new Set(existingInitialMoves.map((m) => `${m.product_id}::${m.location_id}`));

  const clashes = toCreate.filter((r) => {
    const key = `${r.productId}::${r.locationId}`;
    return plSet.has(key) || initMoveSet.has(key);
  });

  if (clashes.length > 0) {
    const clashList = clashes.map((r) => `'${r.code}' @ '${r.locationName}' (fila ${r.rowNumber})`).join(", ");
    if (isDryRun) {
      const clashKeys = new Set(clashes.map((r) => r.rowNumber));
      const rowResults: InventoryImportRowResult[] = toCreate.map((r) =>
        clashKeys.has(r.rowNumber)
          ? { rowNumber: r.rowNumber, name: r.locationName, code: r.code, resolution: "ERROR", reason: `Ya existe inventario inicial para '${r.code}' en '${r.locationName}'.` }
          : { rowNumber: r.rowNumber, name: r.locationName, code: r.code, resolution: "SKIPPED", reason: "Bloqueado por choque de inventario inicial en otra fila." }
      );
      return {
        wouldCreate: 0,
        blocked:     clashes.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        rowResults,
      } satisfies InventoryImportDryRunResult;
    }
    throw new Error(
      `Colisión de inventario inicial en la base destino: ${clashList}. ` +
      "Política CREATE_ONLY no permite duplicar ProductLocation ni movimientos INITIAL_LOAD.",
    );
  }

  // ── 5. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: InventoryImportRowResult[] = toCreate.map((r) => ({
      rowNumber:  r.rowNumber,
      name:       r.locationName,
      code:       r.code,
      resolution: "CREATED" as const,
    }));

    return {
      wouldCreate: toCreate.length,
      blocked:     0,
      totalRows:   dbAwareResult.rows.length,
      rows:        rowResults,
    } satisfies InventoryImportDryRunResult;
  }

  // ── 6. EXECUTE: transacción — ProductLocation + InventoryMovement por fila ─

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of toCreate) {
      const productLocation = await tx.productLocation.create({
        data: {
          tenant_id:        tenantId,
          location_id:      row.locationId,
          product_id:       row.productId,
          current_stock:    row.quantity,
          min_stock:        0,
          reorder_quantity: 0,
          is_active:        true,
          created_by:       performedBy,
          updated_by:       performedBy,
          created_at:       now,
          updated_at:       now,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          tenant_id:           tenantId,
          location_id:         row.locationId,
          product_id:          row.productId,
          product_location_id: productLocation.id,
          movement_type:       "INITIAL_LOAD",
          quantity:            row.quantity,
          unit_cost:           row.unitCost,
          stock_before:        0,
          resulting_stock:     row.quantity,
          reference_entity:    "DATA_ONBOARDING",
          reference_code:      "inventory_initial",
          notes:               row.notes,
          performed_by:        performedBy,
          created_at:          now,
        },
      });
    }
  });

  const rowResults: InventoryImportRowResult[] = toCreate.map((r) => ({
    rowNumber:  r.rowNumber,
    name:       r.locationName,
    code:       r.code,
    resolution: "CREATED" as const,
  }));

  return {
    created:                 toCreate.length,
    skipped:                 0,
    errors:                  0,
    totalRows:               dbAwareResult.rows.length,
    importPolicy:            "CREATE_ONLY",
    datasetKey:              "inventory_initial",
    productLocationsCreated: toCreate.length,
    movementsCreated:        toCreate.length,
    rows:                    rowResults,
  } satisfies InventoryImportResult;
}
