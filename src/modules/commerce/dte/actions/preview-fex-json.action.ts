// ─────────────────────────────────────────────────────────────────
// commerce/dte — preview-fex-json.action.ts
//
// previewFexJsonAction — Microfase F3-C7.
//
// Action server-side AISLADA para generar y validar (solo en memoria)
// el JSON candidato de Factura de Exportación Electrónica (FEX 11) a
// partir de un DteOutgoingDocument existente.
//
// Esta action es explícitamente de solo lectura / preview:
//   - NO persiste json_document.
//   - NO actualiza DteOutgoingDocument (ni estado ni ningún campo).
//   - NO cambia el estado de la venta.
//   - NO firma.
//   - NO transmite.
//   - NO toca MariaDB / delivery externo.
//
// El tipo 11 (FEX) todavía NO está habilitado en el pipeline real:
// no en create-pending-dte-for-sale, no en transmit-dte-document, no
// en la UI. Esta action existe únicamente para poder probar el
// builder + validación AJV desde servidor con datos reales, invocada
// manualmente desde código futuro — no está conectada a ningún botón,
// selector ni flujo visible.
// ─────────────────────────────────────────────────────────────────

"use server";

import Ajv        from "ajv";
import addFormats  from "ajv-formats";
import { prisma }  from "@/lib/db/prisma";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import fexSchema from "../schemas/mh/fex-11.schema.json";
import { generateFexJsonForSale } from "../services/generate-fex-json.service";
import type { FexJsonDocument } from "../types/fex-json.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── Tipos públicos ────────────────────────────────────────────────

export interface PreviewFexJsonValidationError {
  path:    string;
  message: string;
}

export interface PreviewFexJsonSummary {
  tipoDte:             string;
  numeroControl:       string;
  codigoGeneracion:    string;
  montoTotalOperacion: number;
  totalPagar:          number;
  receptor:            string;
  cantidadLineas:      number;
}

export type PreviewFexJsonActionResult =
  | { ok: true; json: FexJsonDocument; summary: PreviewFexJsonSummary }
  | { ok: false; error: string; validation_errors?: PreviewFexJsonValidationError[] };

// Estados del DteOutgoingDocument compatibles con generación/preview.
// Cualquier estado posterior a GENERATED/SCHEMA_VALIDATED implica que
// el documento ya avanzó en el ciclo fiscal real (firmado/transmitido)
// y esta preview aislada no debe operar sobre él.
const PREVIEWABLE_STATUSES = new Set([
  "PENDING_GENERATION",
  "GENERATED",
  "SCHEMA_VALIDATED",
]);

// ── Validación AJV local (no persiste, no reutiliza el servicio que
// actualiza dte_status a SCHEMA_VALIDATED) ─────────────────────────

function validateFexAjv(
  doc: unknown,
): { ok: true } | { ok: false; errors: PreviewFexJsonValidationError[] } {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(fexSchema as object);
  const valid = validate(doc);

  if (valid) return { ok: true };

  const rawErrors = validate.errors ?? [];
  const leafErrors = rawErrors.filter((e) => e.keyword !== "if");
  const errorsToShow = leafErrors.length > 0 ? leafErrors : rawErrors;

  const errors: PreviewFexJsonValidationError[] = errorsToShow.map((err) => {
    let message = err.message ?? "Error de validación desconocido";
    if (
      err.keyword === "additionalProperties" &&
      typeof (err.params as Record<string, unknown>).additionalProperty === "string"
    ) {
      const extra = (err.params as Record<string, unknown>).additionalProperty as string;
      message = `propiedad adicional no permitida: "${extra}"`;
    }
    return { path: err.instancePath || "(raíz)", message };
  });

  return { ok: false, errors };
}

// ── Action principal ────────────────────────────────────────────────

export async function previewFexJsonAction(
  dte_document_id: string,
): Promise<PreviewFexJsonActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)       return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)     return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dte_document_id) return { ok: false, error: "El ID del documento DTE es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  // ── 1. Precondiciones sobre el DteOutgoingDocument ────────────────
  // Validaciones que generateFexJsonForSale no cubre (no está firmado,
  // no está transmitido, estado compatible con preview).
  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      id:            true,
      dte_type_code: true,
      sale_id:       true,
      signed_jws:    true,
      dte_status:    true,
    },
  });

  if (!dteDoc) {
    return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
  }
  if (dteDoc.dte_type_code !== "11") {
    return {
      ok:    false,
      error: `Esta preview solo aplica a Factura de Exportación (11). El documento es tipo "${dteDoc.dte_type_code}".`,
    };
  }
  if (!dteDoc.sale_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna venta." };
  }
  if (dteDoc.signed_jws) {
    return { ok: false, error: "El documento DTE ya está firmado. No se puede generar una preview sobre un documento firmado." };
  }
  if (!PREVIEWABLE_STATUSES.has(dteDoc.dte_status)) {
    return {
      ok:    false,
      error: `El documento DTE está en estado "${dteDoc.dte_status}", incompatible con preview/generación. Estados permitidos: ${Array.from(PREVIEWABLE_STATUSES).join(", ")}.`,
    };
  }

  // ── 2. Generar JSON candidato (sin persistir) ─────────────────────
  const buildResult = await generateFexJsonForSale({ tenant_id, location_id, dte_document_id });

  if (!buildResult.ok) {
    return { ok: false, error: buildResult.error };
  }

  // ── 3. Validar JSON candidato contra el schema oficial MH (AJV) ───
  const ajvResult = validateFexAjv(buildResult.json);

  if (!ajvResult.ok) {
    return {
      ok:                 false,
      error:              "El JSON generado no cumple el schema oficial MH para FEX 11.",
      validation_errors:  ajvResult.errors,
    };
  }

  // ── 4. Resultado estructurado (solo lectura) ───────────────────────
  const { identificacion, receptor, resumen, cuerpoDocumento } = buildResult.json;

  return {
    ok:   true,
    json: buildResult.json,
    summary: {
      tipoDte:             identificacion.tipoDte,
      numeroControl:       identificacion.numeroControl,
      codigoGeneracion:    identificacion.codigoGeneracion,
      montoTotalOperacion: resumen.montoTotalOperacion,
      totalPagar:          resumen.totalPagar,
      receptor:            receptor.nombre,
      cantidadLineas:      cuerpoDocumento.length,
    },
  };
}
