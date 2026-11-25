// ─────────────────────────────────────────────────────────────────
// commerce/dte — validate-dte-json-schema.service.ts
//
// Valida el json_document de un DteOutgoingDocument contra el schema
// JSON oficial del Ministerio de Hacienda El Salvador.
//
// Reglas:
//   - Solo opera sobre dte_status === "GENERATED".
//   - Acepta dte_type_code "01" (FE), "03" (CCFE), "05" (NC) y "11" (FEX).
//     NOTA F3-C5: "11" solo está registrado aquí para que el validador AJV
//     pueda usarse directamente contra JSON FEX. El pipeline de venta/DTE
//     (create-pending-dte-for-sale, transmit-dte-document, UI) todavía NO
//     habilita el tipo 11 — este registro no activa ningún flujo automático.
//   - Si valida: cambia dte_status a SCHEMA_VALIDATED.
//   - Si falla: mantiene GENERATED, devuelve errores legibles.
//   - NO firma. NO transmite. NO toca json_document.
// ─────────────────────────────────────────────────────────────────

import Ajv, { type ValidateFunction } from "ajv";
import addFormats  from "ajv-formats";
import type { PrismaClient } from "@prisma/client";
import { prisma }  from "@/lib/db/prisma";
import { readDteJsonVersion } from "../spec/dte-json-version";
import {
  getDteSchemaByVersion,
  inferProfileFromDocument,
  listKnownDteVersions,
  type DteSchemaId,
  type DteSpecKind,
} from "../spec/dte-spec-registry";
import { runMhSemanticRules } from "../rules/mh-semantic-rules";

// ── Tipos públicos ────────────────────────────────────────────────

export interface DteValidationError {
  path:    string;
  message: string;
}

export type ValidateDteJsonSchemaResult =
  | { ok: true }
  | { ok: false; error: string; validation_errors?: DteValidationError[] };

// ── Error de negocio interno ──────────────────────────────────────

class DteValidationBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DteValidationBusinessError";
  }
}

// ── Selección de schema por (tipo, identificacion.version) ────────
// MH20 (IMP20-002, D3): el schema se elige por la versión que el PROPIO
// documento declara, vía el registro central (spec/dte-spec-registry.ts):
//   01 FE  v1 → fe-01.schema.json          v2 → v2_0/fe-f-v2.json
//   03 CCF v3 → ccfe-03.schema.json        v4 → v2_0/fe-ccf-v4.json
//   05 NC  v3 → fe-nc-v3.json              v4 → v2_0/fe-nc-v4.json
//   11 FEX v3 → fex-11-v3.schema.json (común a MH 1.2 y 2.0)
//   14 FSE v1 → fse-14.schema.json         v2 → v2_0/fe-fse-v2.json
// El schema FEX v1 sigue solo como legacy y no se usa para validar.
// Una versión desconocida produce un error explícito; nunca se cae a un
// schema por defecto. Los compiladores AJV se cachean por schema.

const DOCUMENT_TYPE_CODES = new Set<DteSpecKind>(["01", "03", "05", "11", "14"]);

const compiledValidators = new Map<DteSchemaId, ValidateFunction>();

function getCompiledValidator(schemaId: DteSchemaId, schema: object): ValidateFunction {
  const cached = compiledValidators.get(schemaId);
  if (cached) return cached;
  //    strict: false           → no lanza error por keywords desconocidas ni formats sin registrar.
  //    allErrors: true         → recopila todos los errores en lugar de detenerse en el primero.
  //    multipleOfPrecision: 2  → evita falsos positivos de multipleOf 0.01 por precisión flotante JS.
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  compiledValidators.set(schemaId, validate);
  return validate;
}

/** Solo para tests: número de schemas compilados en caché. */
export function __compiledDteValidatorCountForTests(): number {
  return compiledValidators.size;
}

// ── Validación pura (sin base de datos) ───────────────────────────
//
// DTE-MH-TEST-RUNS — extraída sin cambio de comportamiento para que las
// pruebas MH del onboarding validen escenarios en seco (dry-run) ANTES de
// reservar correlativos. validateDteJsonSchema la usa tal cual.

export type DteJsonSchemaCheckResult =
  | { ok: true }
  | { ok: false; error: string; validation_errors?: DteValidationError[] };

export function hasOfficialDteJsonSchema(dteTypeCode: string): boolean {
  return DOCUMENT_TYPE_CODES.has(dteTypeCode as DteSpecKind);
}

export function validateDteJsonAgainstOfficialSchema(
  dteTypeCode:  string,
  documentData: unknown,
): DteJsonSchemaCheckResult {
  if (!hasOfficialDteJsonSchema(dteTypeCode)) {
    return {
      ok:    false,
      error: `No existe schema oficial MH para el tipo DTE "${dteTypeCode}". Solo se admiten "01" (FE), "03" (CCFE), "05" (NC), "11" (FEX) y "14" (FSE).`,
    };
  }
  const kind    = dteTypeCode as DteSpecKind;
  const version = readDteJsonVersion(documentData);
  if (version === null) {
    return {
      ok:    false,
      error: "El documento no declara identificacion.version; no se puede seleccionar el schema oficial MH.",
      validation_errors: [{ path: "/identificacion/version", message: "versión ausente o no entera" }],
    };
  }
  const selected = getDteSchemaByVersion(kind, version);
  if (!selected) {
    return {
      ok:    false,
      error:
        `No existe schema oficial MH para el tipo DTE "${dteTypeCode}" versión ${version} ` +
        `(versiones conocidas: ${listKnownDteVersions(kind).join(", ")}).`,
      validation_errors: [{ path: "/identificacion/version", message: `versión ${version} desconocida` }],
    };
  }

  const validate = getCompiledValidator(selected.schemaId, selected.schema);
  const valid    = validate(documentData);

  if (!valid && validate.errors && validate.errors.length > 0) {
    // Filtrar errores genéricos de wrapper if/then/else — los errores hoja son más específicos.
    const leafErrors = validate.errors.filter((e) => e.keyword !== "if");
    const errorsToShow = leafErrors.length > 0 ? leafErrors : validate.errors;

    const validationErrors: DteValidationError[] = errorsToShow.map((err) => {
      let message = err.message ?? "Error de validación desconocido";
      if (
        err.keyword === "additionalProperties" &&
        typeof (err.params as Record<string, unknown>).additionalProperty === "string"
      ) {
        const extra = (err.params as Record<string, unknown>).additionalProperty as string;
        message = `propiedad adicional no permitida: "${extra}"`;
      }
      return {
        path:    err.instancePath || "(raíz)",
        message,
      };
    });
    return {
      ok:               false,
      error:            "El documento no cumple el schema oficial MH.",
      validation_errors: validationErrors,
    };
  }

  // MH20 (IMP20-020, D8): reglas semánticas Zolvi para restricciones que el
  // schema 2.0 ya no expresa. Solo para versiones exclusivas de MH_2_0; los
  // documentos MH_1_2 conservan exactamente su validación histórica (AJV).
  if (inferProfileFromDocument(kind, version) === "MH_2_0") {
    const semantic = runMhSemanticRules(kind, documentData);
    if (semantic.errors.length > 0) {
      return {
        ok:    false,
        error: "El documento no cumple las reglas de negocio MH 2.0 confirmadas.",
        validation_errors: semantic.errors.map((e) => ({ path: e.path, message: `[${e.ruleId}] ${e.message}` })),
      };
    }
  }
  return { ok: true };
}

// ── Función principal ─────────────────────────────────────────────

export async function validateDteJsonSchema(
  dte_document_id: string,
  tenant_id:       string,
  location_id:     string,
  user_id:         string,
  db: PrismaClient = prisma,
): Promise<ValidateDteJsonSchemaResult> {
  try {
    // 1. Cargar documento con validación tenant/location
    const dteDoc = await db.dteOutgoingDocument.findFirst({
      where: { id: dte_document_id, tenant_id, location_id },
      select: {
        id:            true,
        dte_status:    true,
        dte_type_code: true,
        json_document: true,
      },
    });

    if (!dteDoc) {
      throw new DteValidationBusinessError(
        "El documento DTE no existe o no pertenece a la location activa.",
      );
    }

    // 2. Estado debe ser GENERATED
    if (dteDoc.dte_status !== "GENERATED") {
      throw new DteValidationBusinessError(
        `Solo se puede validar el schema de documentos en estado GENERATED. Estado actual: ${dteDoc.dte_status}.`,
      );
    }

    // 3. json_document debe existir
    if (!dteDoc.json_document) {
      throw new DteValidationBusinessError(
        "El documento DTE no tiene JSON generado. Genera el JSON antes de validar.",
      );
    }

    // 4. Verificar que existe schema para el tipo
    if (!hasOfficialDteJsonSchema(dteDoc.dte_type_code)) {
      throw new DteValidationBusinessError(
        `No existe schema oficial MH para el tipo DTE "${dteDoc.dte_type_code}". Solo se admiten "01" (FE), "03" (CCFE), "05" (NC), "11" (FEX) y "14" (FSE).`,
      );
    }

    // 5. Parsear json_document (puede venir como string o como objeto Prisma Json)
    let documentData: unknown;
    try {
      documentData =
        typeof dteDoc.json_document === "string"
          ? JSON.parse(dteDoc.json_document as string)
          : dteDoc.json_document;
    } catch {
      throw new DteValidationBusinessError(
        "El JSON almacenado no es parseable. El documento puede estar corrupto.",
      );
    }

    // 6. Validar con AJV (validateDteJsonAgainstOfficialSchema — misma configuración)
    const check = validateDteJsonAgainstOfficialSchema(dteDoc.dte_type_code, documentData);
    if (!check.ok) return check;

    // 7. Actualizar estado → SCHEMA_VALIDATED
    await db.dteOutgoingDocument.update({
      where: { id: dte_document_id },
      data:  {
        dte_status:          "SCHEMA_VALIDATED",
        schema_validated_at: new Date(),
        updated_by:          user_id,
      },
    });

    return { ok: true };

  } catch (error) {
    if (error instanceof DteValidationBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
