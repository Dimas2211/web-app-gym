// ─────────────────────────────────────────────────────────────────
// platform — excel-preview-parser.ts
//
// E1B: Parser de archivos Excel para el Data Onboarding Center.
// Lee el workbook en memoria, valida la hoja "Datos", valida
// columnas requeridas y aplica reglas de negocio básicas por dataset.
//
// Reglas de seguridad E1B:
// - No importa Prisma.
// - No ejecuta queries.
// - No escribe en bases cliente.
// - No expone credenciales ni DATABASE_URL.
// - Opera solo en memoria con el buffer recibido.
// ─────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingPreviewResult,
  DataOnboardingPreviewRow,
  DataOnboardingRowError,
  DataOnboardingRowWarning,
} from "../../types/platform.types";

// ── Constantes ────────────────────────────────────────────────────

const DATA_SHEET_NAME     = "Datos";
const MAX_ROWS_TO_PROCESS = 1000;
const MAX_ROWS_IN_RESULT  = 200;

// ── Input público ─────────────────────────────────────────────────

export interface ParseDataOnboardingInput {
  datasetKey: DataOnboardingDatasetKey;
  fileBuffer: Buffer | ArrayBuffer | Uint8Array;
}

// ── Tipo interno ──────────────────────────────────────────────────

type RowData = Record<string, unknown>;

type ValidationResult = {
  errors:   DataOnboardingRowError[];
  warnings: DataOnboardingRowWarning[];
};

// ── Normalización de headers ──────────────────────────────────────
// La plantilla E1A genera headers con * para campos requeridos.
// Ejemplo: "name*" → "name", "product_code*" → "product_code"
// Normaliza también a minúsculas para comparación robusta.

function normalizeHeaderKey(h: unknown): string {
  if (typeof h !== "string") return String(h ?? "").trim().toLowerCase();
  return h.trim().replace(/\*+$/, "").trim().toLowerCase();
}

function displayHeader(h: unknown): string {
  if (typeof h !== "string") return String(h ?? "").trim();
  return h.trim().replace(/\*+$/, "").trim();
}

// ── Helpers de validación ─────────────────────────────────────────

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  return false;
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every(isEmpty);
}

function validateBoolean(val: unknown): { valid: boolean } {
  if (isEmpty(val)) return { valid: true };
  const s = String(val).trim().toLowerCase();
  return {
    valid: ["true", "false", "1", "0", "si", "sí", "no", "yes"].includes(s),
  };
}

function validateDecimal(val: unknown): { valid: boolean } {
  if (isEmpty(val)) return { valid: true };
  const n = Number(String(val).trim().replace(",", "."));
  return { valid: !isNaN(n) && n >= 0 };
}

function validateEmail(val: unknown): boolean {
  if (isEmpty(val)) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim());
}

function validateEnum(val: unknown, allowed: string[]): boolean {
  if (isEmpty(val)) return true;
  const normalized = String(val).trim().toLowerCase();
  return allowed.map((a) => a.toLowerCase()).includes(normalized);
}

function cellValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "number" || typeof val === "boolean") return val;
  return String(val).trim();
}

// ── Validadores por dataset ───────────────────────────────────────

function validateCategoriesRow(data: RowData): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.name)) {
    errors.push({ code: "REQUIRED_FIELD", field: "name", message: "El campo 'name' es requerido." });
  }
  if (!isEmpty(data.status) && !validateEnum(data.status, ["active", "inactive"])) {
    warnings.push({
      code: "INVALID_ENUM", field: "status",
      message: `Valor '${data.status}' no reconocido en 'status'. Permitidos: active, inactive.`,
    });
  }

  return { errors, warnings };
}

function validateLinesRow(data: RowData): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.name))          errors.push({ code: "REQUIRED_FIELD", field: "name",          message: "El campo 'name' es requerido." });
  if (isEmpty(data.category_name)) errors.push({ code: "REQUIRED_FIELD", field: "category_name", message: "El campo 'category_name' es requerido." });

  if (!isEmpty(data.status) && !validateEnum(data.status, ["active", "inactive"])) {
    warnings.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' no reconocido en 'status'. Permitidos: active, inactive.` });
  }

  return { errors, warnings };
}

function validateSublinesRow(data: RowData): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.name))      errors.push({ code: "REQUIRED_FIELD", field: "name",      message: "El campo 'name' es requerido." });
  if (isEmpty(data.line_name)) errors.push({ code: "REQUIRED_FIELD", field: "line_name", message: "El campo 'line_name' es requerido." });

  if (!isEmpty(data.status) && !validateEnum(data.status, ["active", "inactive"])) {
    warnings.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' no reconocido en 'status'. Permitidos: active, inactive.` });
  }

  return { errors, warnings };
}

function validateProductsRow(data: RowData, seenCodes: Set<string>): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.product_code))  errors.push({ code: "REQUIRED_FIELD", field: "product_code",  message: "El campo 'product_code' es requerido." });
  if (isEmpty(data.name))          errors.push({ code: "REQUIRED_FIELD", field: "name",           message: "El campo 'name' es requerido." });
  if (isEmpty(data.product_type))  errors.push({ code: "REQUIRED_FIELD", field: "product_type",   message: "El campo 'product_type' es requerido." });
  if (isEmpty(data.category_name)) errors.push({ code: "REQUIRED_FIELD", field: "category_name",  message: "El campo 'category_name' es requerido." });
  if (isEmpty(data.unit_name))     errors.push({ code: "REQUIRED_FIELD", field: "unit_name",      message: "El campo 'unit_name' es requerido." });

  if (isEmpty(data.is_stockable)) {
    errors.push({ code: "REQUIRED_FIELD", field: "is_stockable", message: "El campo 'is_stockable' es requerido (true/false)." });
  } else if (!validateBoolean(data.is_stockable).valid) {
    errors.push({ code: "INVALID_BOOLEAN", field: "is_stockable", message: `Valor '${data.is_stockable}' inválido. Use: true o false.` });
  }

  if (isEmpty(data.allow_purchase)) {
    errors.push({ code: "REQUIRED_FIELD", field: "allow_purchase", message: "El campo 'allow_purchase' es requerido (true/false)." });
  } else if (!validateBoolean(data.allow_purchase).valid) {
    errors.push({ code: "INVALID_BOOLEAN", field: "allow_purchase", message: `Valor '${data.allow_purchase}' inválido. Use: true o false.` });
  }

  if (isEmpty(data.allow_sale)) {
    errors.push({ code: "REQUIRED_FIELD", field: "allow_sale", message: "El campo 'allow_sale' es requerido (true/false)." });
  } else if (!validateBoolean(data.allow_sale).valid) {
    errors.push({ code: "INVALID_BOOLEAN", field: "allow_sale", message: `Valor '${data.allow_sale}' inválido. Use: true o false.` });
  }

  if (!isEmpty(data.product_type) && !validateEnum(data.product_type, ["PRODUCT", "SERVICE"])) {
    errors.push({ code: "INVALID_ENUM", field: "product_type", message: `Valor '${data.product_type}' inválido. Permitidos: PRODUCT, SERVICE.` });
  }

  if (!isEmpty(data.cost_price) && !validateDecimal(data.cost_price).valid) {
    errors.push({ code: "INVALID_DECIMAL", field: "cost_price", message: `Valor '${data.cost_price}' inválido para 'cost_price'. Use decimal >= 0 con punto.` });
  }
  if (!isEmpty(data.sale_price) && !validateDecimal(data.sale_price).valid) {
    errors.push({ code: "INVALID_DECIMAL", field: "sale_price", message: `Valor '${data.sale_price}' inválido para 'sale_price'. Use decimal >= 0 con punto.` });
  }

  if (!isEmpty(data.status) && !validateEnum(data.status, ["ACTIVE", "INACTIVE", "DISCONTINUED"])) {
    warnings.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' no reconocido en 'status'. Permitidos: ACTIVE, INACTIVE, DISCONTINUED.` });
  }

  if (!isEmpty(data.product_code)) {
    const key = String(data.product_code).trim().toUpperCase();
    if (seenCodes.has(key)) {
      errors.push({ code: "DUPLICATE_IN_FILE", field: "product_code", message: `'product_code' "${data.product_code}" ya aparece en otra fila del archivo.` });
    } else {
      seenCodes.add(key);
    }
  }

  return { errors, warnings };
}

function validateCustomersRow(data: RowData, seenDocs: Set<string>): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.name)) errors.push({ code: "REQUIRED_FIELD", field: "name", message: "El campo 'name' es requerido." });

  if (!isEmpty(data.email) && !validateEmail(data.email)) {
    errors.push({ code: "INVALID_EMAIL", field: "email", message: `Formato de email inválido: '${data.email}'.` });
  }

  if (!isEmpty(data.status) && !validateEnum(data.status, ["active", "inactive"])) {
    warnings.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' no reconocido en 'status'. Permitidos: active, inactive.` });
  }

  if (!isEmpty(data.document_type) && !validateEnum(data.document_type, ["NIT", "DUI", "PASAPORTE", "CEDULA", "OTRO"])) {
    warnings.push({ code: "INVALID_ENUM", field: "document_type", message: `Valor '${data.document_type}' no reconocido. Permitidos: NIT, DUI, PASAPORTE, CEDULA, OTRO.` });
  }

  if (!isEmpty(data.document_number)) {
    const key = String(data.document_number).trim().toUpperCase();
    if (seenDocs.has(key)) {
      warnings.push({ code: "DUPLICATE_IN_FILE", field: "document_number", message: `'document_number' "${data.document_number}" ya aparece en otra fila.` });
    } else {
      seenDocs.add(key);
    }
  }

  return { errors, warnings };
}

function validateSuppliersRow(data: RowData, seenNits: Set<string>): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.name)) errors.push({ code: "REQUIRED_FIELD", field: "name", message: "El campo 'name' es requerido." });

  if (!isEmpty(data.email) && !validateEmail(data.email)) {
    errors.push({ code: "INVALID_EMAIL", field: "email", message: `Formato de email inválido: '${data.email}'.` });
  }

  if (!isEmpty(data.status) && !validateEnum(data.status, ["active", "inactive"])) {
    warnings.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' no reconocido en 'status'. Permitidos: active, inactive.` });
  }

  if (!isEmpty(data.classification) && !validateEnum(data.classification, ["GRAN_CONTRIBUYENTE", "MEDIANO", "OTRO"])) {
    warnings.push({ code: "INVALID_ENUM", field: "classification", message: `Valor '${data.classification}' no reconocido. Permitidos: GRAN_CONTRIBUYENTE, MEDIANO, OTRO.` });
  }

  if (!isEmpty(data.nit)) {
    const key = String(data.nit).trim().toUpperCase().replace(/[-\s]/g, "");
    if (seenNits.has(key)) {
      warnings.push({ code: "DUPLICATE_IN_FILE", field: "nit", message: `'nit' "${data.nit}" ya aparece en otra fila del archivo.` });
    } else {
      seenNits.add(key);
    }
  }

  return { errors, warnings };
}

function validateInventoryInitialRow(data: RowData, seenKeys: Set<string>): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  if (isEmpty(data.product_code))  errors.push({ code: "REQUIRED_FIELD", field: "product_code",  message: "El campo 'product_code' es requerido." });
  if (isEmpty(data.location_name)) errors.push({ code: "REQUIRED_FIELD", field: "location_name", message: "El campo 'location_name' es requerido." });

  if (isEmpty(data.quantity)) {
    errors.push({ code: "REQUIRED_FIELD", field: "quantity", message: "El campo 'quantity' es requerido (número mayor que 0)." });
  } else {
    const n = Number(String(data.quantity).trim());
    if (isNaN(n)) {
      errors.push({ code: "INVALID_NUMBER", field: "quantity", message: `Valor '${data.quantity}' inválido. 'quantity' debe ser un número.` });
    } else if (n <= 0) {
      errors.push({ code: "INVALID_VALUE", field: "quantity", message: `'quantity' debe ser mayor que 0. No se permite cero ni negativos. Recibido: ${n}.` });
    }
  }

  if (!isEmpty(data.unit_cost) && !validateDecimal(data.unit_cost).valid) {
    errors.push({ code: "INVALID_DECIMAL", field: "unit_cost", message: `Valor '${data.unit_cost}' inválido para 'unit_cost'. Use decimal >= 0.` });
  }

  if (!isEmpty(data.product_code) && !isEmpty(data.location_name)) {
    const key = `${String(data.product_code).trim().toUpperCase()}||${String(data.location_name).trim().toUpperCase()}`;
    if (seenKeys.has(key)) {
      errors.push({
        code: "DUPLICATE_IN_FILE", field: "product_code+location_name",
        message: `Combinación product_code='${data.product_code}' + location_name='${data.location_name}' ya aparece en otra fila.`,
      });
    } else {
      seenKeys.add(key);
    }
  }

  return { errors, warnings };
}

// ── Parser principal ──────────────────────────────────────────────

export function parseDataOnboardingWorkbook(
  input: ParseDataOnboardingInput,
): DataOnboardingPreviewResult {
  const { datasetKey, fileBuffer } = input;

  // 1. Leer workbook
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(fileBuffer, { type: "buffer", raw: true });
  } catch {
    throw new Error("El archivo no es un Excel válido o está dañado.");
  }

  // 2. Verificar hoja "Datos"
  if (!wb.SheetNames.includes(DATA_SHEET_NAME)) {
    throw new Error(
      `El archivo no contiene la hoja "${DATA_SHEET_NAME}". Use la plantilla oficial descargada desde el sistema.`,
    );
  }

  const ws = wb.Sheets[DATA_SHEET_NAME];

  // 3. Leer como array de arrays (raw: true para tipos nativos de Excel)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw:    true,
  });

  if (aoa.length === 0) {
    throw new Error(`La hoja "${DATA_SHEET_NAME}" está vacía.`);
  }

  // 4. Normalizar headers
  const rawHeaders       = aoa[0] as unknown[];
  const headerKeys       = rawHeaders.map(normalizeHeaderKey);  // para lookup interno
  const displayHeaders   = rawHeaders.map(displayHeader);       // para mostrar en UI

  // 5. Procesar filas de datos
  const dataRows = aoa.slice(1);

  let emptyRowsIgnored = 0;
  let truncated        = false;
  const allRows: DataOnboardingPreviewRow[] = [];

  // Conjuntos para detección de duplicados (por dataset)
  const seenCodes = new Set<string>();
  const seenKeys  = new Set<string>();
  const seenDocs  = new Set<string>();
  const seenNits  = new Set<string>();

  let processedCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i] as unknown[];

    if (isRowEmpty(rawRow)) {
      emptyRowsIgnored++;
      continue;
    }

    if (processedCount >= MAX_ROWS_TO_PROCESS) {
      truncated = true;
      break;
    }
    processedCount++;

    // Construir objeto con keys normalizados
    const data: RowData = {};
    headerKeys.forEach((key, idx) => {
      if (key) data[key] = cellValue(rawRow[idx]);
    });

    // Validar según dataset
    let errors:   DataOnboardingRowError[]   = [];
    let warnings: DataOnboardingRowWarning[] = [];

    switch (datasetKey) {
      case "categories":        ({ errors, warnings } = validateCategoriesRow(data));                    break;
      case "lines":             ({ errors, warnings } = validateLinesRow(data));                         break;
      case "sublines":          ({ errors, warnings } = validateSublinesRow(data));                      break;
      case "products":          ({ errors, warnings } = validateProductsRow(data, seenCodes));           break;
      case "customers":         ({ errors, warnings } = validateCustomersRow(data, seenDocs));           break;
      case "suppliers":         ({ errors, warnings } = validateSuppliersRow(data, seenNits));           break;
      case "inventory_initial": ({ errors, warnings } = validateInventoryInitialRow(data, seenKeys));   break;
      default:
        warnings.push({ code: "NO_VALIDATION", message: `No hay validaciones específicas para '${datasetKey}'.` });
    }

    const status: DataOnboardingPreviewRow["status"] =
      errors.length   > 0 ? "ERROR"   :
      warnings.length > 0 ? "WARNING" :
                            "VALID";

    allRows.push({
      rowNumber: i + 2, // +2: fila 1 = headers, índice 0-based
      status,
      data,
      errors,
      warnings,
    });
  }

  // 6. Calcular summary
  const validRows   = allRows.filter((r) => r.status === "VALID").length;
  const invalidRows = allRows.filter((r) => r.status === "ERROR").length;
  const warningRows = allRows.filter((r) => r.status === "WARNING").length;

  const status: DataOnboardingPreviewResult["status"] =
    invalidRows > 0
      ? "INVALID"
      : warningRows > 0
        ? "VALID_WITH_WARNINGS"
        : "VALID";

  // 7. Truncar filas en el resultado (MAX_ROWS_IN_RESULT)
  const isTruncated = truncated || allRows.length > MAX_ROWS_IN_RESULT;
  const rowsForResult = isTruncated
    ? allRows.slice(0, MAX_ROWS_IN_RESULT)
    : allRows;

  return {
    datasetKey,
    status,
    summary: {
      totalRows:        allRows.length,
      validRows,
      invalidRows,
      warningRows,
      emptyRowsIgnored,
    },
    columns:   displayHeaders.filter(Boolean),
    rows:      rowsForResult,
    truncated: isTruncated,
  };
}
