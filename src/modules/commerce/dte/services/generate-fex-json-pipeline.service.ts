// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json-pipeline.service.ts
//
// Microfase F3-C10B — extrae la lógica core de F3-C10 (generación +
// persistencia + validación AJV de JSON FEX 11) a un service que no
// depende de sesión/request, para poder invocarla tanto desde la
// server action real como desde un script dev-only con PrismaClient
// directo.
//
// generateAndPersistFexJsonForDte implementa exactamente el flujo ya
// definido en F3-C10:
//   - cargar DteOutgoingDocument (tenant/location explícitos);
//   - validar dte_type_code === "11";
//   - validar environment === "TEST";
//   - validar sale_id presente;
//   - validar signed_jws null;
//   - validar dte_status en {PENDING_GENERATION, GENERATED, SCHEMA_VALIDATED};
//   - llamar generateFexJsonForSale (builder puro, F3-C4);
//   - si el builder falla, no persiste nada;
//   - si el builder pasa, persiste json_document y dte_status → GENERATED;
//   - llamar validateDteJsonSchema (AJV, reutilizado de FE/CCFE/NC);
//   - si AJV pasa, dte_status → SCHEMA_VALIDATED (lo hace el propio servicio);
//   - si AJV falla, se mantiene GENERATED con json_document persistido.
//
// FEX 11 está habilitado solo para generación/validación de JSON.
// Firma, transmisión, UI y MariaDB siguen bloqueados — este service NO
// importa ningún adaptador de firma, transmisión ni MariaDB.
// ─────────────────────────────────────────────────────────────────

import { Prisma }                 from "@prisma/client";
import { prisma }                 from "@/lib/db/prisma";
import { generateFexJsonForSale } from "./generate-fex-json.service";
import {
  validateDteJsonSchema,
  type DteValidationError,
} from "./validate-dte-json-schema.service";

// ── Tipos públicos ────────────────────────────────────────────────

export interface GenerateAndPersistFexJsonParams {
  tenant_id:       string;
  location_id:     string;
  dte_document_id: string;
  user_id:         string;
}

export interface GenerateAndPersistFexJsonResult {
  ok:                   boolean;
  dte_document_id?:     string;
  sale_id?:             string;
  dte_status?:          string;
  schema_validated_at?: Date | null;
  control_number?:      string;
  generation_code?:     string;
  json_document?:       unknown;
  validation_errors?:   DteValidationError[];
  error?:               string;
}

// Estados del DteOutgoingDocument compatibles con (re)generación.
// Cualquier estado posterior implica que el documento ya avanzó en el
// ciclo fiscal real (firmado/transmitido) y este pipeline no debe operar.
const GENERATABLE_STATUSES = new Set([
  "PENDING_GENERATION",
  "GENERATED",
  "SCHEMA_VALIDATED",
]);

// ── Función principal ─────────────────────────────────────────────

export async function generateAndPersistFexJsonForDte(
  params: GenerateAndPersistFexJsonParams,
): Promise<GenerateAndPersistFexJsonResult> {
  const { tenant_id, location_id, dte_document_id, user_id } = params;

  // ── 1. Precondiciones sobre el DteOutgoingDocument ────────────────
  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      id:               true,
      dte_type_code:    true,
      sale_id:          true,
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
  if (dteDoc.dte_type_code !== "11") {
    return {
      ok:    false,
      error: `Este pipeline solo genera JSON para Factura de Exportación (11). El documento es tipo "${dteDoc.dte_type_code}".`,
    };
  }
  if (!dteDoc.sale_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna venta." };
  }
  if (dteDoc.environment !== "TEST") {
    return {
      ok:    false,
      error: "La generación controlada de FEX 11 solo está habilitada en ambiente TEST en esta microfase.",
    };
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

  // ── 2. Construir el JSON candidato (builder puro, no persiste) ────
  const built = await generateFexJsonForSale({ tenant_id, location_id, dte_document_id });

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  // ── 3. Persistir json_document y avanzar a GENERATED ──────────────
  await prisma.dteOutgoingDocument.update({
    where: { id: dte_document_id },
    data:  {
      json_document: built.json as unknown as Prisma.InputJsonValue,
      dte_status:    "GENERATED",
      generated_at:  new Date(),
      updated_by:    user_id,
    },
  });

  // ── 4. Validar contra el schema oficial MH (AJV) ───────────────────
  // Reutiliza el mismo servicio que FE/CCFE/NC: si pasa, avanza a
  // SCHEMA_VALIDATED y guarda schema_validated_at; si falla, mantiene
  // GENERATED (con el json_document ya persistido) y no toca el estado.
  const validated = await validateDteJsonSchema(dte_document_id, tenant_id, location_id, user_id);

  if (!validated.ok) {
    return {
      ok:                  true,
      dte_document_id:     dteDoc.id,
      sale_id:             dteDoc.sale_id,
      dte_status:          "GENERATED",
      schema_validated_at: null,
      control_number:      dteDoc.control_number ?? undefined,
      generation_code:     dteDoc.generation_code ?? undefined,
      json_document:       built.json,
      validation_errors:   validated.validation_errors ?? [],
    };
  }

  // ── 5. Releer estado final persistido ──────────────────────────────
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
    sale_id:             dteDoc.sale_id,
    dte_status:          finalDoc?.dte_status ?? "SCHEMA_VALIDATED",
    schema_validated_at: finalDoc?.schema_validated_at ?? null,
    control_number:      dteDoc.control_number ?? undefined,
    generation_code:     dteDoc.generation_code ?? undefined,
    json_document:       built.json,
  };
}
