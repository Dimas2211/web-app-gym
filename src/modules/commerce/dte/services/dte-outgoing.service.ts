// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-outgoing.service.ts
//
// createPendingDteForSale — crea DteOutgoingDocument en estado
// PENDING_GENERATION con generation_code y control_number reservados
// dentro de una transacción atómica.
//
// Reglas críticas:
//   - NO genera el JSON DTE real.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario.
//   - Solo acepta dte_type_code "01" (FE) y "03" (CCFE).
//   - CCFE requiere cliente con NIT y NRC.
//   - El correlativo (DteCorrelative.last_sequence) se incrementa de
//     forma atómica dentro de la misma transacción Prisma.
//   - Si la transacción falla, el correlativo hace rollback.
// ─────────────────────────────────────────────────────────────────

import { randomUUID }     from "crypto";
import { prisma }         from "@/lib/db/prisma";
import { buildControlNumber } from "../utils/dte-control-number";
import type { CreatePendingDteResult } from "../types/dte.types";
import { DTE_MVP_TYPE_CODES } from "../types/dte.types";

// Error de negocio interno — distinguido de errores técnicos inesperados
class DteBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DteBusinessError";
  }
}

export async function createPendingDteForSale(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input: {
    sale_id:          string;
    dte_type_code:    "01" | "03";
    issuer_config_id: string;
    environment:      "TEST" | "PRODUCTION";
  },
): Promise<CreatePendingDteResult> {
  if (!DTE_MVP_TYPE_CODES.includes(input.dte_type_code as typeof DTE_MVP_TYPE_CODES[number])) {
    return {
      ok:    false,
      error: `Tipo DTE "${input.dte_type_code}" está fuera del MVP. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  try {
    const doc = await prisma.$transaction(async (tx) => {

      // ── 1. Cargar venta con items y cliente ──────────────────────
      const sale = await tx.sale.findFirst({
        where:  { id: input.sale_id, tenant_id, location_id },
        select: {
          id:              true,
          status:          true,
          inventory_moved: true,
          customer_id:     true,
          customer: {
            select: { id: true, nit: true, nrc: true, activity_code: true },
          },
          _count: { select: { items: true } },
        },
      });
      if (!sale) {
        throw new DteBusinessError("La venta no existe o no pertenece a la location activa.");
      }
      if (sale.status !== "CONFIRMED") {
        throw new DteBusinessError("Solo se puede generar DTE para ventas confirmadas.");
      }
      if (!sale.inventory_moved) {
        throw new DteBusinessError("La venta aún no ha aplicado inventario. Aplica el inventario primero.");
      }
      if (sale._count.items === 0) {
        throw new DteBusinessError("La venta no tiene líneas de detalle. No se puede generar DTE sin productos.");
      }

      // CCFE 03 exige receptor fiscal completo
      if (input.dte_type_code === "03") {
        if (!sale.customer_id) {
          throw new DteBusinessError(
            "Para Comprobante de Crédito Fiscal (CCFE 03) se requiere un cliente asignado a la venta.",
          );
        }
        if (!sale.customer?.nit || !sale.customer?.nrc) {
          throw new DteBusinessError(
            "El cliente no tiene todos los datos fiscales requeridos (NIT y NRC) para emitir un CCFE 03.",
          );
        }
      }

      // ── 2. Verificar que no existe DTE activo duplicado ──────────
      const activeDte = await tx.dteOutgoingDocument.findFirst({
        where: {
          sale_id:       input.sale_id,
          tenant_id,
          dte_type_code: input.dte_type_code,
          dte_status:    { notIn: ["NOT_REQUIRED", "INVALIDATED"] },
        },
        select: { id: true, dte_status: true },
      });
      if (activeDte) {
        throw new DteBusinessError(
          `Esta venta ya tiene un documento DTE de tipo "${input.dte_type_code}" activo o en proceso (estado: ${activeDte.dte_status}).`,
        );
      }

      // ── 3. Cargar configuración del emisor (con datos de establecimiento) ──
      const issuerConfig = await tx.dteIssuerConfig.findFirst({
        where: {
          id:          input.issuer_config_id,
          tenant_id,
          location_id,
          environment: input.environment,
          is_active:   true,
        },
        select: {
          id:                 true,
          establishment_code: true,
          point_of_sale_code: true,
        },
      });
      if (!issuerConfig) {
        throw new DteBusinessError(
          "La configuración DTE del emisor no existe, está inactiva o no corresponde al ambiente indicado.",
        );
      }

      // ── 4. Reservar correlativo de forma atómica ─────────────────
      // UPDATE ... SET last_sequence = last_sequence + 1 es atómico en PostgreSQL.
      // Dentro de la transacción, cada request obtiene su propio número único.
      // Si no existe el correlativo, Prisma lanza P2025.
      const year = new Date().getFullYear();

      let correlative: { last_sequence: number };
      try {
        correlative = await tx.dteCorrelative.update({
          where: {
            tenant_id_location_id_environment_dte_type_code_year: {
              tenant_id,
              location_id,
              environment:   input.environment,
              dte_type_code: input.dte_type_code,
              year,
            },
          },
          data:   { last_sequence: { increment: 1 } },
          select: { last_sequence: true },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2025") {
          throw new DteBusinessError(
            `No existe correlativo DTE activo para tipo "${input.dte_type_code}" en el año ${year}. Configure el correlativo antes de generar DTE.`,
          );
        }
        throw err;
      }

      const reservedSequence = correlative.last_sequence;

      // ── 5. Generar codigoGeneracion (UUID uppercase — inmutable) ──
      const generation_code = randomUUID().toUpperCase();

      // ── 6. Construir numeroControl ───────────────────────────────
      const control_number = buildControlNumber({
        dte_type_code:      input.dte_type_code,
        establishment_code: issuerConfig.establishment_code,
        point_of_sale_code: issuerConfig.point_of_sale_code,
        sequence:           reservedSequence,
      });

      // ── 7. Crear DteOutgoingDocument ─────────────────────────────
      return await tx.dteOutgoingDocument.create({
        data: {
          tenant_id,
          location_id,
          sale_id:          input.sale_id,
          issuer_config_id: input.issuer_config_id,
          dte_type_code:    input.dte_type_code,
          environment:      input.environment,
          generation_code,
          control_number,
          dte_status:       "PENDING_GENERATION",
          retry_count:      0,
          created_by:       user_id,
          updated_by:       user_id,
        },
        select: { id: true },
      });
    });

    return { ok: true, dte_document_id: doc.id };

  } catch (error) {
    if (error instanceof DteBusinessError) {
      return { ok: false, error: error.message };
    }

    // Colisión en generation_code @unique (probabilidad ínfima pero posible)
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return {
        ok:    false,
        error: "Error de concurrencia al reservar la identidad fiscal. Intente nuevamente.",
      };
    }

    throw error;
  }
}
