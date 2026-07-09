// ─────────────────────────────────────────────────────────────────
// platform — suppliers-import-runner.ts
//
// E1C-C: Runner SERVER-ONLY para importar proveedores desde un preview
// ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en suppliers.
// - No actualiza, no elimina, no hace upsert.
// - No toca products, inventory, sales, DTE, cash, customers ni
//   ninguna otra tabla.
// - Política fija: CREATE_ONLY.
// - Llave natural (idéntica al analizador DB-aware): nit si viene,
//   si no, nombre normalizado como llave débil.
// - Duplicados dentro del mismo archivo por esa llave → bloquean
//   toda la importación (sin import parcial).
// - supplier_code es requerido por schema y no viene en la plantilla:
//   se genera con el mismo patrón usado en quick-create de compras
//   (PROV-{slug}-{rand4}), verificando colisión contra la base y
//   dentro del mismo archivo.
// - Si cualquier fila falla la validación previa → bloquea todo.
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: dentro de $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
//
// Gaps de contrato conocidos (plantilla vs. schema Supplier real):
// - 'classification' (GRAN_CONTRIBUYENTE | MEDIANO | OTRO) no usa el
//   mismo vocabulario que el enum real TaxpayerType (LARGE_TAXPAYER |
//   SMALL_TAXPAYER | NON_TAXPAYER | FOREIGN). No se mapea en E1C-C —
//   taxpayer_type queda en su default de schema (SMALL_TAXPAYER).
// - 'city' se mapea a municipality_name (no hay columna 'city' real).
// - 'trade_name' se mapea a legal_name (columna más cercana en schema).
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[suppliers-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  SuppliersImportRowResult,
  SuppliersImportDryRunResult,
  SuppliersImportResult,
} from "../../../types/platform.types";

// ── Status válidos para importación ──────────────────────────────
// "deleted" está excluido deliberadamente en E1C-C por seguridad.

const VALID_IMPORT_STATUSES = new Set(["active", "inactive", "suspended"]);

// ── Helpers ───────────────────────────────────────────────────────

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Llave de identidad idéntica a la usada en el analizador DB-aware. */
function supplierIdentityKey(nit: string, name: string): string {
  if (nit) return `NIT:${normalizeKey(nit)}`;
  return `NAME:${normalizeKey(name)}`;
}

/** Código provisional — idéntico al patrón usado en quickCreateSupplier (compras). */
function generateProvisionalSupplierCode(name: string): string {
  const slug = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 15);

  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROV-${slug}-${rand}`;
}

// ── Input del runner ──────────────────────────────────────────────

export interface SuppliersImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runSuppliersImport(
  input: SuppliersImportRunnerInput,
): Promise<SuppliersImportResult | SuppliersImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  interface RowToCreate {
    rowNumber:         number;
    name:              string;
    legalName:         string | null;
    nit:               string | null;
    nrc:               string | null;
    email:             string | null;
    phone:             string | null;
    addressComplement: string | null;
    municipalityName:  string | null;
    countryCode:       string | null;
    activityCode:      string | null;
    contactName:       string | null;
    status:            string;
    identityKey:       string;
    valid:             true;
  }

  interface RowBlocked {
    rowNumber: number;
    name:      string;
    code:      string;
    reason:    string;
    valid:     false;
  }

  type PreparedRow = RowToCreate | RowBlocked;

  const prepared: PreparedRow[] = createRows.map((dbRow) => {
    const parsedRow = parsedPreview.rows.find((r) => r.rowNumber === dbRow.rowNumber);
    const name = strVal(parsedRow?.data.name ?? "");

    if (!name) {
      return { rowNumber: dbRow.rowNumber, name, code: "", reason: "Nombre vacío.", valid: false };
    }

    const rawStatus = strVal(parsedRow?.data.status ?? "");
    const status     = rawStatus === "" ? "active" : rawStatus.toLowerCase();

    if (rawStatus !== "" && !VALID_IMPORT_STATUSES.has(status)) {
      return {
        rowNumber: dbRow.rowNumber,
        name,
        code: "",
        reason: `Status '${rawStatus}' no es válido para importación. Valores aceptados: active, inactive, suspended.`,
        valid:  false,
      };
    }

    const nit = strVal(parsedRow?.data.nit ?? "").replace(/[-\s]/g, "");
    const identityKey = supplierIdentityKey(nit, name);

    return {
      rowNumber:         dbRow.rowNumber,
      name,
      legalName:         strVal(parsedRow?.data.trade_name ?? "") || null,
      nit:               strVal(parsedRow?.data.nit ?? "") || null,
      nrc:               strVal(parsedRow?.data.nrc ?? "") || null,
      email:             strVal(parsedRow?.data.email ?? "") || null,
      phone:             strVal(parsedRow?.data.phone ?? "") || null,
      addressComplement: strVal(parsedRow?.data.address ?? "") || null,
      municipalityName:  strVal(parsedRow?.data.city ?? "") || null,
      countryCode:       strVal(parsedRow?.data.country_code ?? "") || null,
      activityCode:      strVal(parsedRow?.data.economic_activity ?? "") || null,
      contactName:       strVal(parsedRow?.data.contact_name ?? "") || null,
      status,
      identityKey,
      valid: true,
    };
  });

  const blocked  = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 2. Verificar duplicados dentro del archivo por llave de identidad ─
  const identitySeen = new Map<string, number>();
  const identityDuplicates: RowBlocked[] = [];

  for (const row of toCreate) {
    if (identitySeen.has(row.identityKey)) {
      identityDuplicates.push({
        rowNumber: row.rowNumber,
        name:      row.name,
        code:      "",
        reason:    `Llave de identificación '${row.identityKey}' duplicada dentro del archivo (fila ${identitySeen.get(row.identityKey)}).`,
        valid:     false,
      });
    } else {
      identitySeen.set(row.identityKey, row.rowNumber);
    }
  }

  const allBlockedRowNumbers = new Set([
    ...blocked.map((b) => b.rowNumber),
    ...identityDuplicates.map((b) => b.rowNumber),
  ]);
  const allBlocked = [...blocked, ...identityDuplicates];

  // ── 3. Si hay cualquier fila bloqueada → abortar todo (sin import parcial) ─

  if (allBlocked.length > 0) {
    const allRowResults: SuppliersImportRowResult[] = [
      ...toCreate
        .filter((r) => !allBlockedRowNumbers.has(r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: "", resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies SuppliersImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-C no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 4. Generar supplier_code único (PROV-{slug}-{rand4}) ──────────
  const existingSuppliers = await prismaClient.supplier.findMany({
    where:  { tenant_id: tenantId },
    select: { supplier_code: true },
  });
  const usedCodes = new Set(existingSuppliers.map((s) => s.supplier_code));

  const finalRows = toCreate.map((row) => {
    let candidate = generateProvisionalSupplierCode(row.name);
    let attempts = 0;
    while (usedCodes.has(candidate) && attempts < 10) {
      candidate = generateProvisionalSupplierCode(row.name);
      attempts += 1;
    }
    usedCodes.add(candidate);
    return { ...row, finalCode: candidate };
  });

  // ── 5. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: SuppliersImportRowResult[] = finalRows.map((r) => ({
      rowNumber:  r.rowNumber,
      name:       r.name,
      code:       r.finalCode,
      resolution: "CREATED" as const,
    }));

    return {
      wouldCreate: finalRows.length,
      blocked:     0,
      totalRows:   dbAwareResult.rows.length,
      rows:        rowResults,
    } satisfies SuppliersImportDryRunResult;
  }

  // ── 6. EXECUTE: transacción ───────────────────────────────────

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of finalRows) {
      await tx.supplier.create({
        data: {
          tenant_id:          tenantId,
          supplier_code:      row.finalCode,
          name:               row.name,
          legal_name:         row.legalName,
          nit:                row.nit,
          nrc:                row.nrc,
          email:              row.email,
          phone:              row.phone,
          address_complement: row.addressComplement,
          municipality_name:  row.municipalityName,
          country_code:       row.countryCode,
          activity_code:      row.activityCode,
          contact_name:       row.contactName,
          status:             row.status as "active" | "inactive" | "suspended" | "deleted",
          created_at:         now,
          updated_at:         now,
        },
      });
    }
  });

  const rowResults: SuppliersImportRowResult[] = finalRows.map((r) => ({
    rowNumber:  r.rowNumber,
    name:       r.name,
    code:       r.finalCode,
    resolution: "CREATED" as const,
  }));

  return {
    created:      finalRows.length,
    skipped:      0,
    errors:       0,
    totalRows:    dbAwareResult.rows.length,
    importPolicy: "CREATE_ONLY",
    datasetKey:   "suppliers",
    rows:         rowResults,
  } satisfies SuppliersImportResult;
}
