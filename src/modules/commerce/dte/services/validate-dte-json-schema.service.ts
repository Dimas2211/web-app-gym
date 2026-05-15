// ─────────────────────────────────────────────────────────────────
// commerce/dte — validate-dte-json-schema.service.ts
//
// Valida el json_document de un DteOutgoingDocument contra el schema
// JSON oficial del Ministerio de Hacienda El Salvador.
//
// Reglas:
//   - Solo opera sobre dte_status === "GENERATED".
//   - Solo acepta dte_type_code "01" (FE) y "03" (CCFE).
//   - Si valida: cambia dte_status a SCHEMA_VALIDATED.
//   - Si falla: mantiene GENERATED, devuelve errores legibles.
//   - NO firma. NO transmite. NO toca json_document.
// ─────────────────────────────────────────────────────────────────

import Ajv         from "ajv";
import addFormats  from "ajv-formats";
import { prisma }  from "@/lib/db/prisma";
import feSchema    from "../schemas/mh/fe-01.schema.json";
import ccfeSchema  from "../schemas/mh/ccfe-03.schema.json";

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

// ── Mapa de schemas por dte_type_code ─────────────────────────────
// "01" = Factura Electrónica   → fe-01.schema.json  (fe-fc-v1.json del ZIP MH)
// "03" = Comprobante de Crédito Fiscal → ccfe-03.schema.json (fe-ccf-v3.json del ZIP MH)

const SCHEMA_MAP: Record<string, object> = {
  "01": feSchema   as object,
  "03": ccfeSchema as object,
};

// ── Función principal ─────────────────────────────────────────────

export async function validateDteJsonSchema(
  dte_document_id: string,
  tenant_id:       string,
  location_id:     string,
  user_id:         string,
): Promise<ValidateDteJsonSchemaResult> {
  try {
    // 1. Cargar documento con validación tenant/location
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
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
    const schema = SCHEMA_MAP[dteDoc.dte_type_code];
    if (!schema) {
      throw new DteValidationBusinessError(
        `No existe schema oficial MH para el tipo DTE "${dteDoc.dte_type_code}". Solo se admiten "01" (FE) y "03" (CCFE).`,
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

    // 6. Validar con AJV
    //    strict: false           → no lanza error por keywords desconocidas ni formats sin registrar.
    //    allErrors: true         → recopila todos los errores en lugar de detenerse en el primero.
    //    multipleOfPrecision: 2  → evita falsos positivos de multipleOf 0.01 por precisión flotante JS.
    const ajv      = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
    addFormats(ajv);
    const validate = ajv.compile(schema);
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

    // 7. Actualizar estado → SCHEMA_VALIDATED
    await prisma.dteOutgoingDocument.update({
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
