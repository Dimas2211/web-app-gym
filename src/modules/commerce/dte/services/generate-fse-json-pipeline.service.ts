// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fse-json-pipeline.service.ts
//
// Genera + persiste + valida (AJV) el JSON FSE 14 para un
// DteOutgoingDocument con origen Purchase. Espejo de
// generate-fex-json-pipeline.service.ts, sin el gating de
// fex11-feature-guard — FSE 14 es parte del flujo general, no una
// fase de pruebas controladas.
//
// Flujo:
//   - cargar DteOutgoingDocument (tenant/location explícitos);
//   - validar dte_type_code === "14";
//   - validar purchase_id presente (regla XOR ya se garantizó al crear);
//   - validar signed_jws null;
//   - validar dte_status en {PENDING_GENERATION, GENERATED, SCHEMA_VALIDATED};
//   - llamar generateFseJsonForPurchase (builder puro);
//   - si el builder falla, no persiste nada;
//   - si el builder pasa, persiste json_document y dte_status → GENERATED;
//   - llamar validateDteJsonSchema (AJV, reutilizado de FE/CCFE/NC/FEX);
//   - si AJV pasa, dte_status → SCHEMA_VALIDATED;
//   - si AJV falla, se mantiene GENERATED con json_document persistido.
// ─────────────────────────────────────────────────────────────────

import { Prisma }                 from "@prisma/client";
import { prisma }                 from "@/lib/db/prisma";
import { generateFseJsonForPurchase } from "./generate-fse-json.service";
import {
  validateDteJsonSchema,
  type DteValidationError,
} from "./validate-dte-json-schema.service";

export interface GenerateAndPersistFseJsonParams {
  tenant_id:       string;
  location_id:     string;
  dte_document_id: string;
  user_id:         string;
}

export interface GenerateAndPersistFseJsonResult {
  ok:                   boolean;
  dte_document_id?:     string;
  purchase_id?:         string;
  dte_status?:          string;
  schema_validated_at?: Date | null;
  control_number?:      string;
  generation_code?:     string;
  json_document?:       unknown;
  validation_errors?:   DteValidationError[];
  error?:               string;
}

const GENERATABLE_STATUSES = new Set([
  "PENDING_GENERATION",
  "GENERATED",
  "SCHEMA_VALIDATED",
]);

export async function generateAndPersistFseJsonForDte(
  params: GenerateAndPersistFseJsonParams,
): Promise<GenerateAndPersistFseJsonResult> {
  const { tenant_id, location_id, dte_document_id, user_id } = params;

  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      id:               true,
      dte_type_code:    true,
      purchase_id:      true,
      signed_jws:       true,
      dte_status:       true,
      environment:      true,
      control_number:   true,
      generation_code:  true,
    },
  });

  if (!dteDoc) {
    return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
  }
  if (dteDoc.dte_type_code !== "14") {
    return {
      ok:    false,
      error: `Este pipeline solo genera JSON para Factura de Sujeto Excluido (14). El documento es tipo "${dteDoc.dte_type_code}".`,
    };
  }
  if (!dteDoc.purchase_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna compra." };
  }
  if (dteDoc.signed_jws) {
    return { ok: false, error: "El documento DTE ya está firmado. No se puede regenerar el JSON de un documento firmado." };
  }
  if (!GENERATABLE_STATUSES.has(dteDoc.dte_status)) {
    return {
      ok:    false,
      error: `El documento DTE está en estado "${dteDoc.dte_status}", incompatible con generación de JSON. Estados permitidos: ${Array.from(GENERATABLE_STATUSES).join(", ")}.`,
    };
  }

  const built = await generateFseJsonForPurchase({ tenant_id, location_id, dte_document_id });

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  await prisma.dteOutgoingDocument.update({
    where: { id: dte_document_id },
    data:  {
      json_document: built.json as unknown as Prisma.InputJsonValue,
      dte_status:    "GENERATED",
      generated_at:  new Date(),
      updated_by:    user_id,
    },
  });

  const validated = await validateDteJsonSchema(dte_document_id, tenant_id, location_id, user_id);

  if (!validated.ok) {
    return {
      ok:                  true,
      dte_document_id:     dteDoc.id,
      purchase_id:         dteDoc.purchase_id,
      dte_status:          "GENERATED",
      schema_validated_at: null,
      control_number:      dteDoc.control_number ?? undefined,
      generation_code:     dteDoc.generation_code ?? undefined,
      json_document:       built.json,
      validation_errors:   validated.validation_errors ?? [],
    };
  }

  const finalDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      dte_status:          true,
      schema_validated_at: true,
    },
  });

  return {
    ok:                  true,
    dte_document_id:     dteDoc.id,
    purchase_id:         dteDoc.purchase_id,
    dte_status:          finalDoc?.dte_status ?? "SCHEMA_VALIDATED",
    schema_validated_at: finalDoc?.schema_validated_at ?? null,
    control_number:      dteDoc.control_number ?? undefined,
    generation_code:     dteDoc.generation_code ?? undefined,
    json_document:       built.json,
  };
}
