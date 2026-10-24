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
//
// ONBOARDING-5K: sin truncamiento. El resultado contiene TODAS las filas
// no vacías del archivo; si exceden DATA_ONBOARDING_MAX_IMPORT_ROWS se
// lanza DataOnboardingRowLimitError (rechazo entero, antes de cualquier
// análisis o escritura). La muestra para el navegador la arma
// data-onboarding-view.ts — el parser nunca acota filas.
// ─────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingPreviewResult,
  DataOnboardingPreviewRow,
  DataOnboardingRowError,
  DataOnboardingRowWarning,
} from "../../types/platform.types";
import {
  strVal as gymStrVal,
  normalizeKey,
  normalizeDocument,
  normalizePhone,
  normalizeOperationalCode,
  personKey,
  parseGender,
  parseBirthDate,
  parseModality,
  parseGymStatus,
  parsePersonalizedCapacity,
  isValidEmail,
  GYM_CLIENT_MAX_LENGTH,
  GYM_TRAINER_MAX_LENGTH,
  PERSONALIZED_CAPACITY_MIN,
  PERSONALIZED_CAPACITY_MAX,
} from "./gym-onboarding-fields";
import {
  DATA_ONBOARDING_MAX_IMPORT_ROWS,
  dataOnboardingRowLimitMessage,
} from "./data-onboarding-limits";

// ── Constantes ────────────────────────────────────────────────────

const DATA_SHEET_NAME = "Datos";

/** El archivo excede DATA_ONBOARDING_MAX_IMPORT_ROWS: se rechaza entero. */
export class DataOnboardingRowLimitError extends Error {
  constructor(public readonly nonEmptyRows: number) {
    super(dataOnboardingRowLimitMessage(nonEmptyRows));
    this.name = "DataOnboardingRowLimitError";
  }
}

const GYM_REQUIRED_HEADERS: Partial<Record<DataOnboardingDatasetKey, string[]>> = {
  gym_clients:  ["first_name", "last_name", "branch_name"],
  gym_trainers: ["first_name", "last_name", "branch_name"],
};

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

// ── GYM-ONBOARDING: Clientes GYM y Entrenadores ───────────────────

interface GymSeen {
  codes:    Map<string, number>; // operational_code normalizado → fila
  docs:     Map<string, number>; // document_id normalizado → fila
  emails:   Map<string, number>; // email normalizado → fila (entrenadores)
  persons:  Map<string, number>; // nombre+apellido (+dato fiable) → fila
  names:    Map<string, number>; // nombre+apellido → fila
}

function newGymSeen(): GymSeen {
  return { codes: new Map(), docs: new Map(), emails: new Map(), persons: new Map(), names: new Map() };
}

function checkMaxLengths(data: RowData, limits: Record<string, number>, errors: DataOnboardingRowError[]) {
  for (const [field, max] of Object.entries(limits)) {
    const v = gymStrVal(data[field]);
    if (v.length > max) {
      errors.push({ code: "MAX_LENGTH", field, message: `'${field}' excede ${max} caracteres (${v.length}).` });
    }
  }
}

function requireGymPersonFields(data: RowData, errors: DataOnboardingRowError[]) {
  if (isEmpty(data.first_name))  errors.push({ code: "REQUIRED_FIELD", field: "first_name",  message: "El campo 'first_name' es requerido." });
  if (isEmpty(data.last_name))   errors.push({ code: "REQUIRED_FIELD", field: "last_name",   message: "El campo 'last_name' es requerido." });
  if (isEmpty(data.branch_name)) errors.push({ code: "REQUIRED_FIELD", field: "branch_name", message: "El campo 'branch_name' es requerido (sucursal existente)." });
}

function validateGymClientsRow(data: RowData, rowNumber: number, seen: GymSeen): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  requireGymPersonFields(data, errors);
  checkMaxLengths(data, GYM_CLIENT_MAX_LENGTH, errors);

  if (!isValidEmail(data.email)) {
    errors.push({ code: "INVALID_EMAIL", field: "email", message: `Formato de email inválido: '${data.email}'.` });
  }
  if (parseGender(data.gender) === "INVALID") {
    errors.push({ code: "INVALID_ENUM", field: "gender", message: `Valor '${data.gender}' inválido en 'gender'. Permitidos: male, female, other, prefer_not_to_say.` });
  }
  if (parseBirthDate(data.birth_date) === "INVALID") {
    errors.push({ code: "INVALID_DATE", field: "birth_date", message: `Fecha '${data.birth_date}' inválida. Use AAAA-MM-DD o DD/MM/AAAA (no futura, desde 1900).` });
  }
  if (parseModality(data.modality) === "INVALID") {
    errors.push({ code: "INVALID_ENUM", field: "modality", message: `Valor '${data.modality}' inválido en 'modality'. Permitidos: NORMAL, PERSONALIZED, GROUP.` });
  }
  if (parseGymStatus(data.status) === "INVALID") {
    errors.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' inválido en 'status'. Permitidos: active, inactive.` });
  }
  if (!isEmpty(data.operational_code) && /\s/.test(gymStrVal(data.operational_code))) {
    errors.push({ code: "INVALID_VALUE", field: "operational_code", message: "'operational_code' no puede contener espacios." });
  }

  // Duplicados dentro del archivo — llaves fuertes bloquean.
  if (!isEmpty(data.operational_code)) {
    const key = normalizeOperationalCode(data.operational_code);
    const prev = seen.codes.get(key);
    if (prev) errors.push({ code: "DUPLICATE_IN_FILE", field: "operational_code", message: `'operational_code' "${data.operational_code}" repetido (fila ${prev}).` });
    else seen.codes.set(key, rowNumber);
  }
  if (!isEmpty(data.document_id)) {
    const key = normalizeDocument(data.document_id);
    const prev = seen.docs.get(key);
    if (prev) errors.push({ code: "DUPLICATE_IN_FILE", field: "document_id", message: `'document_id' "${data.document_id}" repetido (fila ${prev}).` });
    else seen.docs.set(key, rowNumber);
  }

  // Misma persona con un dato fiable (email/teléfono/fecha de nacimiento) → bloquea.
  // Solo nombre y apellido → advertencia (nunca se asume duplicado por nombre).
  if (!isEmpty(data.first_name) && !isEmpty(data.last_name)) {
    const name = personKey(data.first_name, data.last_name);
    const birth = parseBirthDate(data.birth_date);
    const strongKeys = [
      !isEmpty(data.email)      ? `${name}|email:${normalizeKey(data.email)}` : null,
      normalizePhone(data.phone) ? `${name}|phone:${normalizePhone(data.phone)}` : null,
      birth && birth !== "INVALID" ? `${name}|birth:${birth}` : null,
    ].filter((k): k is string => k !== null);

    const strongPrev = strongKeys.map((k) => seen.persons.get(k)).find((r) => r !== undefined);
    if (strongPrev) {
      errors.push({ code: "DUPLICATE_IN_FILE", field: "first_name+last_name", message: `Misma persona (nombre + email/teléfono/fecha de nacimiento) que la fila ${strongPrev}.` });
    } else {
      const namePrev = seen.names.get(name);
      if (namePrev) warnings.push({ code: "POSSIBLE_DUPLICATE_IN_FILE", field: "first_name+last_name", message: `Mismo nombre y apellido que la fila ${namePrev}. Verifique que no sea la misma persona.` });
    }
    strongKeys.forEach((k) => { if (!seen.persons.has(k)) seen.persons.set(k, rowNumber); });
    if (!seen.names.has(name)) seen.names.set(name, rowNumber);
  }

  return { errors, warnings };
}

function validateGymTrainersRow(data: RowData, rowNumber: number, seen: GymSeen): ValidationResult {
  const errors:   DataOnboardingRowError[]   = [];
  const warnings: DataOnboardingRowWarning[] = [];

  requireGymPersonFields(data, errors);
  checkMaxLengths(data, GYM_TRAINER_MAX_LENGTH, errors);

  if (!isValidEmail(data.email)) {
    errors.push({ code: "INVALID_EMAIL", field: "email", message: `Formato de email inválido: '${data.email}'.` });
  }
  if (parsePersonalizedCapacity(data.personalized_capacity) === "INVALID") {
    errors.push({
      code: "INVALID_NUMBER", field: "personalized_capacity",
      message: `'personalized_capacity' debe ser un entero entre ${PERSONALIZED_CAPACITY_MIN} y ${PERSONALIZED_CAPACITY_MAX}. Recibido: '${data.personalized_capacity}'.`,
    });
  }
  if (parseGymStatus(data.status) === "INVALID") {
    errors.push({ code: "INVALID_ENUM", field: "status", message: `Valor '${data.status}' inválido en 'status'. Permitidos: active, inactive.` });
  }

  // Entrenadores: sin código ni documento — email y nombre completo identifican.
  if (!isEmpty(data.email)) {
    const key = normalizeKey(data.email);
    const prev = seen.emails.get(key);
    if (prev) errors.push({ code: "DUPLICATE_IN_FILE", field: "email", message: `Email "${data.email}" repetido (fila ${prev}).` });
    else seen.emails.set(key, rowNumber);
  }
  if (!isEmpty(data.first_name) && !isEmpty(data.last_name)) {
    const name = personKey(data.first_name, data.last_name);
    const prev = seen.names.get(name);
    if (prev) errors.push({ code: "DUPLICATE_IN_FILE", field: "first_name+last_name", message: `Entrenador "${data.first_name} ${data.last_name}" repetido (fila ${prev}).` });
    else seen.names.set(name, rowNumber);
  }

  return { errors, warnings };
}

// ── Rango efectivo de la hoja ─────────────────────────────────────
// Una hoja con formato aplicado a filas vacías puede declarar un rango
// (!ref) de cientos de miles de filas. Se recalcula el rango a partir de
// las celdas con valor real para no materializar filas inexistentes.
// No descarta datos: conserva el inicio declarado y solo recorta el final
// hasta la última fila/columna con valor dentro del rango declarado.

function trimSheetToValues(ws: XLSX.WorkSheet): void {
  const ref = ws["!ref"];
  if (!ref) return;
  const declared = XLSX.utils.decode_range(ref);
  let maxRow = -1;
  let maxCol = -1;
  for (const addr of Object.keys(ws)) {
    if (addr.charCodeAt(0) === 33 /* "!" */) continue;
    const cell = ws[addr] as XLSX.CellObject | undefined;
    if (!cell || cell.v === undefined || cell.v === null || cell.v === "") continue;
    const { r, c } = XLSX.utils.decode_cell(addr);
    if (r > declared.e.r || c > declared.e.c) continue;
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  if (maxRow < declared.s.r || maxCol < declared.s.c) return; // sin valores: se conserva el rango (hoja vacía)
  ws["!ref"] = XLSX.utils.encode_range({ s: declared.s, e: { r: maxRow, c: maxCol } });
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
  trimSheetToValues(ws);

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

  // GYM-ONBOARDING: encabezados requeridos obligatorios (solo datasets GYM;
  // los datasets Commerce conservan su contrato histórico por fila).
  const requiredHeaders = GYM_REQUIRED_HEADERS[datasetKey];
  if (requiredHeaders) {
    const missing = requiredHeaders.filter((h) => !headerKeys.includes(h));
    if (missing.length > 0) {
      throw new Error(
        `Faltan columnas requeridas en la hoja "${DATA_SHEET_NAME}": ${missing.join(", ")}. Use la plantilla oficial descargada desde el sistema.`,
      );
    }
  }

  // 5. Procesar filas de datos
  const dataRows = aoa.slice(1);

  // ONBOARDING-5K: el límite se evalúa sobre el TOTAL de filas no vacías
  // antes de validar — un archivo que excede la capacidad se rechaza
  // entero (nunca se procesa un subconjunto).
  const nonEmptyRows = dataRows.reduce<number>((n, r) => (isRowEmpty(r as unknown[]) ? n : n + 1), 0);
  if (nonEmptyRows > DATA_ONBOARDING_MAX_IMPORT_ROWS) {
    throw new DataOnboardingRowLimitError(nonEmptyRows);
  }

  let emptyRowsIgnored = 0;
  const allRows: DataOnboardingPreviewRow[] = [];

  // Conjuntos para detección de duplicados (por dataset) — cubren TODAS las filas.
  const seenCodes = new Set<string>();
  const seenKeys  = new Set<string>();
  const seenDocs  = new Set<string>();
  const seenNits  = new Set<string>();
  const seenGym   = newGymSeen();

  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i] as unknown[];

    if (isRowEmpty(rawRow)) {
      emptyRowsIgnored++;
      continue;
    }

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
      case "gym_clients":       ({ errors, warnings } = validateGymClientsRow(data, i + 2, seenGym));   break;
      case "gym_trainers":      ({ errors, warnings } = validateGymTrainersRow(data, i + 2, seenGym));  break;
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

  // 6. Calcular summary (archivo completo)
  let validRows = 0;
  let invalidRows = 0;
  let warningRows = 0;
  for (const r of allRows) {
    if (r.status === "VALID") validRows++;
    else if (r.status === "ERROR") invalidRows++;
    else warningRows++;
  }

  const status: DataOnboardingPreviewResult["status"] =
    invalidRows > 0
      ? "INVALID"
      : warningRows > 0
        ? "VALID_WITH_WARNINGS"
        : "VALID";

  // 7. ONBOARDING-5K: se devuelven TODAS las filas. La UI recibe una
  // muestra armada por data-onboarding-view.ts; el análisis DB-aware y
  // los runners operan siempre sobre el conjunto completo.
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
    columns: displayHeaders.filter(Boolean),
    rows:    allRows,
  };
}
