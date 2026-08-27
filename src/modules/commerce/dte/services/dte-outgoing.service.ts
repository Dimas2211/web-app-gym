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
//   - El correlativo se reserva de forma atómica dentro de la misma
//     transacción Prisma vía reserveDteControlNumber (dte-correlative
//     .service.ts), que además considera el máximo ya usado en
//     DteOutgoingDocument y el baseline externo alineado por un admin
//     (empresas que migran desde otro sistema — F3-C24).
//   - Si la transacción falla, el correlativo hace rollback.
// ─────────────────────────────────────────────────────────────────

import { randomUUID }     from "crypto";
import { prisma }         from "@/lib/db/prisma";
import { reserveDteControlNumber } from "./dte-correlative.service";
import { validateDteTransmissionInput } from "../utils/dte-transmission-validation.utils";
import { FSE_ELIGIBLE_DOCUMENT_TYPES } from "@/modules/commerce/purchases/constants/purchase-document.constants";
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
    // Evento de Contingencia MH (Bloque A) — opcionales; si el caller no los
    // envía, el DTE se crea como transmisión normal exactamente como hoy.
    transmission_type_code?: "1" | "2";
    contingency_type_code?:  "1" | "2" | "3" | "4" | "5" | null;
    contingency_reason?:     string | null;
  },
): Promise<CreatePendingDteResult> {
  if (!DTE_MVP_TYPE_CODES.includes(input.dte_type_code as typeof DTE_MVP_TYPE_CODES[number])) {
    return {
      ok:    false,
      error: `Tipo DTE "${input.dte_type_code}" está fuera del MVP. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  // Validación central de la combinación transmisión/contingencia —
  // nunca confiar en lo enviado por el caller sin normalizar/validar.
  const transmission = validateDteTransmissionInput(input.dte_type_code, {
    transmission_type_code: input.transmission_type_code,
    contingency_type_code:  input.contingency_type_code,
    contingency_reason:     input.contingency_reason,
  });
  if (!transmission.ok) {
    return { ok: false, error: transmission.error };
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
      // F3-C24: REJECTED se excluye del bloqueo — un documento rechazado
      // (p. ej. por numeroControl duplicado ante Hacienda) no debe impedir
      // generar uno nuevo con numeroControl fresco. El documento rechazado
      // queda intacto como registro histórico (nunca se edita/retransmite).
      const activeDte = await tx.dteOutgoingDocument.findFirst({
        where: {
          sale_id:       input.sale_id,
          tenant_id,
          dte_type_code: input.dte_type_code,
          dte_status:    { notIn: ["NOT_REQUIRED", "INVALIDATED", "REJECTED"] },
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
          cod_estable_mh:     true,
          cod_punto_venta_mh: true,
        },
      });
      if (!issuerConfig) {
        throw new DteBusinessError(
          "La configuración DTE del emisor no existe, está inactiva o no corresponde al ambiente indicado.",
        );
      }

      if (!issuerConfig.cod_estable_mh || !issuerConfig.cod_punto_venta_mh) {
        throw new DteBusinessError(
          "Faltan códigos MH de establecimiento y punto de venta para este emisor/ambiente. " +
          "Configure cod_estable_mh y cod_punto_venta_mh en la configuración del emisor DTE.",
        );
      }

      // ── 4. Reservar correlativo de forma atómica ─────────────────
      // F3-C24: reserva genérica por dte_type_code — toma el máximo entre
      // el correlativo interno, la mayor secuencia ya usada en
      // DteOutgoingDocument y el baseline externo alineado por un admin
      // (empresa migrando desde otro sistema). Ver dte-correlative.service.ts.
      const { control_number } = await reserveDteControlNumber(tx, {
        tenant_id,
        location_id,
        issuer_config_id:   issuerConfig.id,
        environment:        input.environment,
        dte_type_code:      input.dte_type_code,
        cod_estable_mh:     issuerConfig.cod_estable_mh,
        cod_punto_venta_mh: issuerConfig.cod_punto_venta_mh,
      });

      // ── 5. Generar codigoGeneracion (UUID uppercase — inmutable) ──
      const generation_code = randomUUID().toUpperCase();

      // ── 6. Crear DteOutgoingDocument ─────────────────────────────
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
          transmission_type_code: transmission.data.transmission_type_code,
          contingency_type_code:  transmission.data.contingency_type_code,
          contingency_reason:     transmission.data.contingency_reason,
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

// ─────────────────────────────────────────────────────────────────
// createPendingDteForPurchase — crea DteOutgoingDocument tipo "14"
// (FSE) con purchase_id, sale_id = null. Función paralela y explícita
// a createPendingDteForSale — no la reutiliza ni la deforma.
//
// Reglas:
//   - Purchase debe existir, pertenecer a tenant/location y estar CONFIRMED.
//   - Purchase.document_type debe estar marcado explícitamente para FSE
//     (FSE_ELIGIBLE_DOCUMENT_TYPES) — una compra COV nunca habilita esto.
//   - Supplier debe estar clasificado EXCLUDED_SUBJECT.
//   - No permite un segundo FSE activo para la misma compra (mismo
//     criterio que ventas: REJECTED/INVALIDATED/NOT_REQUIRED no bloquean).
//   - Reserva correlativo tipo "14" de forma atómica (mismo mecanismo
//     genérico que FE/CCFE/NC/FEX — dte-correlative.service.ts).
// ─────────────────────────────────────────────────────────────────

export async function createPendingDteForPurchase(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input: {
    purchase_id:      string;
    issuer_config_id: string;
    environment:      "TEST" | "PRODUCTION";
  },
): Promise<CreatePendingDteResult> {
  try {
    const doc = await prisma.$transaction(async (tx) => {

      // ── 1. Cargar compra con proveedor ───────────────────────────
      const purchase = await tx.purchase.findFirst({
        where:  { id: input.purchase_id, tenant_id, location_id },
        select: {
          id:             true,
          status:         true,
          document_type:  true,
          supplier: {
            select: { id: true, taxpayer_type: true },
          },
          _count: { select: { items: true } },
        },
      });
      if (!purchase) {
        throw new DteBusinessError("La compra no existe o no pertenece a la location activa.");
      }
      if (purchase.status !== "CONFIRMED") {
        throw new DteBusinessError("Solo se puede generar FSE para compras confirmadas.");
      }
      if (purchase._count.items === 0) {
        throw new DteBusinessError("La compra no tiene líneas de detalle. No se puede generar FSE sin productos.");
      }
      if (!purchase.document_type || !FSE_ELIGIBLE_DOCUMENT_TYPES.includes(purchase.document_type)) {
        throw new DteBusinessError(
          "Esta compra no está marcada para emisión de FSE 14. Cambie el tipo de documento a FSE antes de emitir.",
        );
      }
      if (purchase.supplier.taxpayer_type !== "EXCLUDED_SUBJECT") {
        throw new DteBusinessError(
          "El proveedor de esta compra no está clasificado como sujeto excluido (EXCLUDED_SUBJECT). Actualice la clasificación tributaria del proveedor.",
        );
      }

      // ── 2. Verificar que no existe FSE activo duplicado ──────────
      const activeDte = await tx.dteOutgoingDocument.findFirst({
        where: {
          purchase_id:   input.purchase_id,
          tenant_id,
          dte_type_code: "14",
          dte_status:    { notIn: ["NOT_REQUIRED", "INVALIDATED", "REJECTED"] },
        },
        select: { id: true, dte_status: true },
      });
      if (activeDte) {
        throw new DteBusinessError(
          `Esta compra ya tiene un documento FSE 14 activo o en proceso (estado: ${activeDte.dte_status}).`,
        );
      }

      // ── 3. Configuración del emisor ──────────────────────────────
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
          cod_estable_mh:     true,
          cod_punto_venta_mh: true,
        },
      });
      if (!issuerConfig) {
        throw new DteBusinessError(
          "La configuración DTE del emisor no existe, está inactiva o no corresponde al ambiente indicado.",
        );
      }
      if (!issuerConfig.cod_estable_mh || !issuerConfig.cod_punto_venta_mh) {
        throw new DteBusinessError(
          "Faltan códigos MH de establecimiento y punto de venta para este emisor/ambiente. " +
          "Configure cod_estable_mh y cod_punto_venta_mh en la configuración del emisor DTE.",
        );
      }

      // ── 4. Reservar correlativo tipo "14" ─────────────────────────
      const { control_number } = await reserveDteControlNumber(tx, {
        tenant_id,
        location_id,
        issuer_config_id:   issuerConfig.id,
        environment:        input.environment,
        dte_type_code:      "14",
        cod_estable_mh:     issuerConfig.cod_estable_mh,
        cod_punto_venta_mh: issuerConfig.cod_punto_venta_mh,
      });

      const generation_code = randomUUID().toUpperCase();

      // ── 5. Crear DteOutgoingDocument — purchase_id, sale_id null ──
      return await tx.dteOutgoingDocument.create({
        data: {
          tenant_id,
          location_id,
          purchase_id:      input.purchase_id,
          issuer_config_id: input.issuer_config_id,
          dte_type_code:    "14",
          environment:      input.environment,
          generation_code,
          control_number,
          transmission_type_code: "1",
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
