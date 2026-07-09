// ─────────────────────────────────────────────────────────────────
// platform — customers-import-runner.ts
//
// E1C-C: Runner SERVER-ONLY para importar clientes desde un preview
// ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en customers.
// - No actualiza, no elimina, no hace upsert.
// - No toca products, inventory, sales, DTE, cash, suppliers ni
//   ninguna otra tabla.
// - Política fija: CREATE_ONLY.
// - Llave natural (idéntica al analizador DB-aware): NIT si
//   document_type=NIT, DUI si document_type=DUI, si no hay documento
//   se usa el nombre normalizado como llave débil.
// - Duplicados dentro del mismo archivo por esa llave → bloquean
//   toda la importación (sin import parcial).
// - customer_code se usa si viene en el archivo; si no, se genera
//   secuencialmente a partir del máximo código numérico existente
//   en el tenant.
// - Si cualquier fila falla la validación previa → bloquea todo.
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: dentro de $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
//
// Gaps de contrato conocidos (plantilla vs. schema Customer real):
// - La plantilla incluye 'city', 'country_code' y 'notes', que NO
//   existen como columnas en el modelo Customer. Esos valores NO se
//   persisten en E1C-C. Ver auditoría E1C-C para detalle.
// - document_type distinto de NIT/DUI (PASAPORTE, CEDULA, OTRO) no
//   tiene campo equivalente en Customer para el número de documento
//   (a diferencia de Supplier.other_document). Solo se usa como
//   llave débil por nombre; el número no se guarda.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[customers-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  CustomersImportRowResult,
  CustomersImportDryRunResult,
  CustomersImportResult,
} from "../../../types/platform.types";

// ── Status válidos para importación ──────────────────────────────
// "deleted" está excluido deliberadamente en E1C-C por seguridad.

const VALID_IMPORT_STATUSES = new Set(["active", "inactive", "suspended"]);

// ── Mapa document_type → id_type_code (CAT-022 MH, ver schema.prisma) ─

const ID_TYPE_CODE_MAP: Record<string, string> = {
  NIT:       "36",
  DUI:       "13",
  PASAPORTE: "03",
  CEDULA:    "02",
  OTRO:      "37",
};

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
function customerIdentityKey(docType: string, docNumber: string, name: string): string {
  const docTypeUpper = docType.toUpperCase();
  if (docTypeUpper === "NIT" && docNumber) return `NIT:${normalizeKey(docNumber)}`;
  if (docTypeUpper === "DUI" && docNumber) return `DUI:${normalizeKey(docNumber)}`;
  return `NAME:${normalizeKey(name)}`;
}

// ── Input del runner ──────────────────────────────────────────────

export interface CustomersImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runCustomersImport(
  input: CustomersImportRunnerInput,
): Promise<CustomersImportResult | CustomersImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  interface RowToCreate {
    rowNumber:      number;
    name:           string;
    customerCode:   string;    // "" si debe auto-generarse
    email:          string | null;
    phone:          string | null;
    nit:            string | null;
    dui:            string | null;
    idTypeCode:     string | null;
    addressComplement: string | null;
    status:         string;
    identityKey:    string;
    valid:          true;
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
    const name       = strVal(parsedRow?.data.name ?? "");
    const customerCode = strVal(parsedRow?.data.customer_code ?? "");

    if (!name) {
      return { rowNumber: dbRow.rowNumber, name, code: customerCode, reason: "Nombre vacío.", valid: false };
    }

    const rawStatus = strVal(parsedRow?.data.status ?? "");
    const status     = rawStatus === "" ? "active" : rawStatus.toLowerCase();

    if (rawStatus !== "" && !VALID_IMPORT_STATUSES.has(status)) {
      return {
        rowNumber: dbRow.rowNumber,
        name,
        code: customerCode,
        reason: `Status '${rawStatus}' no es válido para importación. Valores aceptados: active, inactive, suspended.`,
        valid:  false,
      };
    }

    const docType   = strVal(parsedRow?.data.document_type ?? "").toUpperCase();
    const docNumber = strVal(parsedRow?.data.document_number ?? "");

    let nit: string | null = null;
    let dui: string | null = null;
    if (docType === "NIT" && docNumber) nit = docNumber;
    if (docType === "DUI" && docNumber) dui = docNumber;

    const idTypeCode = docType && ID_TYPE_CODE_MAP[docType] ? ID_TYPE_CODE_MAP[docType] : null;

    const identityKey = customerIdentityKey(docType, docNumber, name);

    return {
      rowNumber:         dbRow.rowNumber,
      name,
      customerCode,
      email:             strVal(parsedRow?.data.email ?? "") || null,
      phone:             strVal(parsedRow?.data.phone ?? "") || null,
      nit,
      dui,
      idTypeCode,
      addressComplement: strVal(parsedRow?.data.address ?? "") || null,
      status,
      identityKey,
      valid: true,
    };
  });

  const blocked  = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 2. Verificar duplicados dentro del archivo por llave de identidad ─
  const identitySeen = new Map<string, number>(); // identityKey → rowNumber
  const identityDuplicates: RowBlocked[] = [];

  for (const row of toCreate) {
    if (identitySeen.has(row.identityKey)) {
      identityDuplicates.push({
        rowNumber: row.rowNumber,
        name:      row.name,
        code:      row.customerCode,
        reason:    `Llave de identificación '${row.identityKey}' duplicada dentro del archivo (fila ${identitySeen.get(row.identityKey)}).`,
        valid:     false,
      });
    } else {
      identitySeen.set(row.identityKey, row.rowNumber);
    }
  }

  // ── 3. Verificar duplicados dentro del archivo por customer_code explícito ─
  const codeSeen = new Map<string, number>();
  const codeDuplicates: RowBlocked[] = [];

  for (const row of toCreate) {
    if (!row.customerCode) continue;
    if (codeSeen.has(row.customerCode)) {
      codeDuplicates.push({
        rowNumber: row.rowNumber,
        name:      row.name,
        code:      row.customerCode,
        reason:    `customer_code '${row.customerCode}' duplicado dentro del archivo (fila ${codeSeen.get(row.customerCode)}).`,
        valid:     false,
      });
    } else {
      codeSeen.set(row.customerCode, row.rowNumber);
    }
  }

  const allBlockedRowNumbers = new Set([
    ...blocked.map((b) => b.rowNumber),
    ...identityDuplicates.map((b) => b.rowNumber),
    ...codeDuplicates.map((b) => b.rowNumber),
  ]);
  const allBlocked = [...blocked, ...identityDuplicates, ...codeDuplicates];

  // ── 4. Si hay cualquier fila bloqueada → abortar todo (sin import parcial) ─

  if (allBlocked.length > 0) {
    const allRowResults: CustomersImportRowResult[] = [
      ...toCreate
        .filter((r) => !allBlockedRowNumbers.has(r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.customerCode, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies CustomersImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-C no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 5. Verificar colisión de customer_code explícito contra la base destino ─
  const explicitCodes = Array.from(new Set(toCreate.filter((r) => r.customerCode).map((r) => r.customerCode)));

  const existingByCode = explicitCodes.length > 0
    ? await prismaClient.customer.findMany({
        where:  { tenant_id: tenantId, customer_code: { in: explicitCodes } },
        select: { customer_code: true },
      })
    : [];

  const existingCodeSet = new Set(existingByCode.map((c) => c.customer_code));
  const codeClashes = toCreate.filter((r) => r.customerCode && existingCodeSet.has(r.customerCode));

  if (codeClashes.length > 0) {
    const clashList = codeClashes.map((r) => `'${r.customerCode}' (fila ${r.rowNumber})`).join(", ");
    if (isDryRun) {
      const rowResults: CustomersImportRowResult[] = toCreate.map((r) =>
        r.customerCode && existingCodeSet.has(r.customerCode)
          ? { rowNumber: r.rowNumber, name: r.name, code: r.customerCode, resolution: "ERROR", reason: `customer_code '${r.customerCode}' ya existe en la base destino.` }
          : { rowNumber: r.rowNumber, name: r.name, code: r.customerCode, resolution: "SKIPPED", reason: "Bloqueado por choque de código en otra fila." }
      );
      return {
        wouldCreate: 0,
        blocked:     codeClashes.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        rowResults,
      } satisfies CustomersImportDryRunResult;
    }
    throw new Error(
      `Colisión de customer_code en la base destino: ${clashList}. ` +
      "Revise el archivo o quite el customer_code para que se genere automáticamente.",
    );
  }

  // ── 6. Generar customer_code para filas sin código explícito ──────
  const existingCustomers = await prismaClient.customer.findMany({
    where:  { tenant_id: tenantId },
    select: { customer_code: true },
  });
  const usedCodes = new Set(existingCustomers.map((c) => c.customer_code));
  explicitCodes.forEach((c) => usedCodes.add(c));

  let maxNumeric = 0;
  for (const c of usedCodes) {
    if (/^[0-9]+$/.test(c)) maxNumeric = Math.max(maxNumeric, Number(c));
  }

  const finalRows = toCreate.map((row) => {
    if (row.customerCode) return { ...row, finalCode: row.customerCode };
    let candidate: string;
    do {
      maxNumeric += 1;
      candidate = String(maxNumeric).padStart(6, "0");
    } while (usedCodes.has(candidate));
    usedCodes.add(candidate);
    return { ...row, finalCode: candidate };
  });

  // ── 7. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: CustomersImportRowResult[] = finalRows.map((r) => ({
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
    } satisfies CustomersImportDryRunResult;
  }

  // ── 8. EXECUTE: transacción ───────────────────────────────────

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of finalRows) {
      await tx.customer.create({
        data: {
          tenant_id:          tenantId,
          customer_code:      row.finalCode,
          name:               row.name,
          nit:                row.nit,
          dui:                row.dui,
          id_type_code:       row.idTypeCode,
          address_complement: row.addressComplement,
          phone:              row.phone,
          email:              row.email,
          status:             row.status as "active" | "inactive" | "suspended" | "deleted",
          created_at:         now,
          updated_at:         now,
        },
      });
    }
  });

  const rowResults: CustomersImportRowResult[] = finalRows.map((r) => ({
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
    datasetKey:   "customers",
    rows:         rowResults,
  } satisfies CustomersImportResult;
}
