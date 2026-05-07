// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-outgoing.service.ts
//
// Operaciones:
//   createPendingDteForSale — crea un DteOutgoingDocument en estado
//                             PENDING_GENERATION vinculado a una Sale.
//
// Reglas críticas:
//   - NO genera el JSON DTE real.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO llama al firmador local.
//   - Solo crea el registro de seguimiento con estado PENDING_GENERATION.
//   - Solo acepta dte_type_code "01" (FE) y "03" (CCFE).
//   - La Sale debe existir y pertenecer al tenant+location.
//   - La DteIssuerConfig debe existir, estar activa y coincidir en environment.
//   - Sale.status y DteOutgoingDocument.dte_status son independientes.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CreateDteOutgoingDocumentDraftInput } from "../schemas/dte-issuer-config.schemas";
import type { CreatePendingDteResult } from "../types/dte.types";
import { DTE_MVP_TYPE_CODES } from "../types/dte.types";

export async function createPendingDteForSale(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreateDteOutgoingDocumentDraftInput,
): Promise<CreatePendingDteResult> {
  // Validar tipo DTE dentro del MVP
  if (!DTE_MVP_TYPE_CODES.includes(input.dte_type_code as typeof DTE_MVP_TYPE_CODES[number])) {
    return {
      ok:    false,
      error: `Tipo DTE "${input.dte_type_code}" está fuera del MVP. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  // Verificar que la Sale existe y pertenece al tenant+location
  const sale = await prisma.sale.findFirst({
    where:  { id: input.sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return {
      ok:    false,
      error: "La venta no existe o no pertenece a la location activa.",
    };
  }

  // Verificar que la DteIssuerConfig existe, está activa y coincide en environment
  const issuerConfig = await prisma.dteIssuerConfig.findFirst({
    where: {
      id:          input.issuer_config_id,
      tenant_id,
      location_id,
      environment: input.environment,
      is_active:   true,
    },
    select: { id: true },
  });
  if (!issuerConfig) {
    return {
      ok:    false,
      error: "La configuración DTE del emisor no existe, está inactiva o no corresponde al ambiente indicado.",
    };
  }

  // Verificar que no exista ya un documento DTE activo para esta venta del mismo tipo
  // (no INVALIDATED — puede haber múltiples registros por reintentos, pero solo uno activo)
  const activeDte = await prisma.dteOutgoingDocument.findFirst({
    where: {
      sale_id:      input.sale_id,
      tenant_id,
      dte_type_code: input.dte_type_code,
      dte_status:   { notIn: ["NOT_REQUIRED", "INVALIDATED"] },
    },
    select: { id: true, dte_status: true },
  });
  if (activeDte) {
    return {
      ok:    false,
      error: `Ya existe un documento DTE de tipo "${input.dte_type_code}" activo para esta venta (estado: ${activeDte.dte_status}).`,
    };
  }

  const doc = await prisma.dteOutgoingDocument.create({
    data: {
      tenant_id,
      location_id,
      sale_id:          input.sale_id,
      issuer_config_id: input.issuer_config_id,
      dte_type_code:    input.dte_type_code,
      environment:      input.environment,
      dte_status:       "PENDING_GENERATION",
      retry_count:      0,
      created_by:       user_id,
      updated_by:       user_id,
    },
    select: { id: true },
  });

  return { ok: true, dte_document_id: doc.id };
}
