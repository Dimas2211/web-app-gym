// ─────────────────────────────────────────────────────────────────
// platform/lib/support-session/dte — support-dte-create-pending-runner.ts
//
// F2-B1: Runner SERVER-ONLY para crear un DteOutgoingDocument en
// estado PENDING_GENERATION directamente en la base cliente de un
// PlatformDatabaseProfile, reservando correlativo de forma atómica.
//
// Replica (sin modificar) la lógica de
// commerce/dte/services/dte-outgoing.service.ts::createPendingDteForSale,
// usando el PrismaClient dinámico del perfil en lugar del singleton
// del .env.
//
// Garantías:
// - Solo dte_type_code "01" (FE) y "03" (CCFE).
// - Solo ventas CONFIRMED con inventory_moved = true.
// - CCFE 03 exige cliente con NIT y NRC.
// - No permite un segundo DTE activo del mismo tipo para la venta.
// - El ambiente fiscal (DteEnvironment) usado en Support Session es
//   siempre "TEST" — nunca se emite un DTE fiscal PRODUCTION desde
//   esta herramienta, sin importar el ambiente del perfil (que ya
//   excluye PRODUCTION en la capa de la action).
// - No genera json_document. No firma. No transmite. No toca inventario.
// - El correlativo se reserva dentro de la misma transacción atómica
//   que crea el documento — si la transacción falla, hace rollback.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[support-dte-create-pending-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { buildControlNumber } from "../../../../commerce/dte/utils/dte-control-number";
import { reserveDteControlNumber } from "../../../../commerce/dte/services/dte-correlative.service";
import { SUPPORT_DTE_ACTIVE_TYPE_CODES } from "./support-dte.constants";
import type {
  CreateSupportDtePendingInput,
  CreateSupportDtePendingPreviewResult,
  CreateSupportDtePendingResult,
  SupportDteTypeCode,
} from "../../../types/platform.types";

// Ambiente fiscal fijo para Support Session — ver nota de garantías arriba.
const DTE_ENVIRONMENT = "TEST" as const;

interface ValidatedContext {
  sale_id:            string;
  sale_code:          string;
  location_id:        string;
  dte_type_code:      SupportDteTypeCode;
  issuer_config_id:   string;
  cod_estable_mh:     string;
  cod_punto_venta_mh: string;
  warnings:           string[];
}

type ValidationResult =
  | { ok: true; data: ValidatedContext }
  | { ok: false; error: string; field?: string };

async function validateCreateSupportDtePending(
  client:   PrismaClient,
  tenantId: string,
  input:    CreateSupportDtePendingInput,
): Promise<ValidationResult> {
  const warnings: string[] = [];

  if (!SUPPORT_DTE_ACTIVE_TYPE_CODES.includes(input.dte_type_code)) {
    return {
      ok: false, field: "dte_type_code",
      error: `Tipo DTE "${input.dte_type_code}" no está permitido en F2-B1. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  // 1. Venta existe, pertenece al tenant, está CONFIRMED con inventario aplicado
  const sale = await client.sale.findFirst({
    where:  { id: input.sale_id, tenant_id: tenantId },
    select: {
      id: true, sale_code: true, location_id: true, status: true,
      inventory_moved: true, customer_id: true,
      customer: { select: { id: true, nit: true, nrc: true } },
      _count: { select: { items: true } },
    },
  });
  if (!sale) {
    return { ok: false, field: "sale_id", error: "La venta no existe o no pertenece al tenant de este perfil." };
  }
  if (sale.status !== "CONFIRMED") {
    return { ok: false, field: "sale_id", error: `Solo se puede generar DTE para ventas confirmadas. Estado actual: "${sale.status}".` };
  }
  if (!sale.inventory_moved) {
    return { ok: false, field: "sale_id", error: "La venta aún no ha aplicado inventario. Aplica el inventario primero." };
  }
  if (sale._count.items === 0) {
    return { ok: false, field: "sale_id", error: "La venta no tiene líneas de detalle. No se puede generar DTE sin productos." };
  }

  // 2. CCFE 03 exige receptor fiscal completo
  if (input.dte_type_code === "03") {
    if (!sale.customer_id) {
      return { ok: false, field: "sale_id", error: "Para Comprobante de Crédito Fiscal (CCFE 03) se requiere un cliente asignado a la venta." };
    }
    if (!sale.customer?.nit || !sale.customer?.nrc) {
      return { ok: false, field: "sale_id", error: "El cliente no tiene todos los datos fiscales requeridos (NIT y NRC) para emitir un CCFE 03." };
    }
  }

  // 3. No existe DTE activo previo para esa venta y tipo
  const activeDte = await client.dteOutgoingDocument.findFirst({
    where: {
      sale_id:       input.sale_id,
      tenant_id:     tenantId,
      dte_type_code: input.dte_type_code,
      dte_status:    { notIn: ["NOT_REQUIRED", "INVALIDATED"] },
    },
    select: { id: true, dte_status: true },
  });
  if (activeDte) {
    return {
      ok: false, field: "sale_id",
      error: `Esta venta ya tiene un documento DTE de tipo "${input.dte_type_code}" activo o en proceso (estado: ${activeDte.dte_status}).`,
    };
  }

  // 4. Configuración del emisor — exactamente una activa por tenant/location/ambiente
  const issuerConfig = await client.dteIssuerConfig.findFirst({
    where: {
      tenant_id:   tenantId,
      location_id: sale.location_id,
      environment: DTE_ENVIRONMENT,
      is_active:   true,
    },
    select: { id: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
  if (!issuerConfig) {
    return {
      ok: false,
      error: `No existe configuración DTE activa (DteIssuerConfig) para esta sucursal en ambiente ${DTE_ENVIRONMENT}. ` +
             "Configure el emisor DTE antes de crear un DTE de soporte.",
    };
  }
  if (!issuerConfig.cod_estable_mh || !issuerConfig.cod_punto_venta_mh) {
    return {
      ok: false,
      error: "Faltan códigos MH de establecimiento y punto de venta para este emisor/ambiente. " +
             "Configure cod_estable_mh y cod_punto_venta_mh en la configuración del emisor DTE.",
    };
  }

  return {
    ok: true,
    data: {
      sale_id:            sale.id,
      sale_code:          sale.sale_code,
      location_id:        sale.location_id,
      dte_type_code:      input.dte_type_code,
      issuer_config_id:   issuerConfig.id,
      cod_estable_mh:     issuerConfig.cod_estable_mh,
      cod_punto_venta_mh: issuerConfig.cod_punto_venta_mh,
      warnings,
    },
  };
}

// ── Preview (dry-run) — solo lectura ──────────────────────────────

export async function previewCreateSupportDtePending(
  client:   PrismaClient,
  tenantId: string,
  input:    CreateSupportDtePendingInput,
): Promise<
  | { ok: true; preview: CreateSupportDtePendingPreviewResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateCreateSupportDtePending(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;
  const year = new Date().getFullYear();

  const correlative = await client.dteCorrelative.findUnique({
    where: {
      tenant_id_location_id_issuer_config_id_environment_dte_type_code_year: {
        tenant_id:        tenantId,
        location_id:      data.location_id,
        issuer_config_id: data.issuer_config_id,
        environment:      DTE_ENVIRONMENT,
        dte_type_code:    data.dte_type_code,
        year,
      },
    },
    select: { last_sequence: true, external_baseline_last_used_sequence: true },
  });

  // Preview de solo lectura — no crea la fila si no existe (a diferencia de
  // la ejecución real, que usa reserveDteControlNumber). Refleja la misma
  // regla: máximo entre correlativo local, máximo ya usado en
  // DteOutgoingDocument y baseline externo alineado (F3-C24).
  const prefix = `DTE-${data.dte_type_code.padStart(2, "0")}-${data.cod_estable_mh.toUpperCase()}${data.cod_punto_venta_mh.toUpperCase()}-`;
  const existingDocs = await client.dteOutgoingDocument.findMany({
    where: {
      tenant_id: tenantId, location_id: data.location_id, environment: DTE_ENVIRONMENT,
      dte_type_code: data.dte_type_code, control_number: { startsWith: prefix },
    },
    select: { control_number: true },
  });
  const maxUsedInOutgoing = existingDocs.reduce((max, doc) => {
    const seq = Number.parseInt(doc.control_number?.slice(prefix.length) ?? "", 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  const localLastSequence = correlative?.last_sequence ?? 0;
  const baselineFloor     = correlative?.external_baseline_last_used_sequence ?? 0;
  const nextSequence = Math.max(localLastSequence, maxUsedInOutgoing, baselineFloor) + 1;
  const controlNumberPreview = buildControlNumber({
    dte_type_code:      data.dte_type_code,
    cod_estable_mh:     data.cod_estable_mh,
    cod_punto_venta_mh: data.cod_punto_venta_mh,
    sequence:           nextSequence,
  });

  return {
    ok: true,
    preview: {
      sale_id:                data.sale_id,
      sale_code:              data.sale_code,
      dte_type_code:          data.dte_type_code,
      issuer_config_id:       data.issuer_config_id,
      environment:            DTE_ENVIRONMENT,
      next_sequence:          nextSequence,
      control_number_preview: controlNumberPreview,
      warnings:               data.warnings,
    },
  };
}

// ── Ejecución real — transacción atómica ──────────────────────────

export async function createSupportDtePendingRunner(
  client:   PrismaClient,
  tenantId: string,
  input:    CreateSupportDtePendingInput,
): Promise<
  | { ok: true; result: CreateSupportDtePendingResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateCreateSupportDtePending(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

  try {
    const result = await client.$transaction(async (tx) => {
      // F3-C24: reserva genérica — mismo camino que producción
      // (dte-correlative.service.ts), considera correlativo local, máximo
      // ya usado en DteOutgoingDocument y baseline externo alineado.
      const { control_number } = await reserveDteControlNumber(tx, {
        tenant_id:          tenantId,
        location_id:        data.location_id,
        issuer_config_id:   data.issuer_config_id,
        environment:        DTE_ENVIRONMENT,
        dte_type_code:      data.dte_type_code,
        cod_estable_mh:     data.cod_estable_mh,
        cod_punto_venta_mh: data.cod_punto_venta_mh,
      });

      const generation_code  = randomUUID().toUpperCase();

      const doc = await tx.dteOutgoingDocument.create({
        data: {
          tenant_id:        tenantId,
          location_id:      data.location_id,
          sale_id:          data.sale_id,
          issuer_config_id: data.issuer_config_id,
          dte_type_code:    data.dte_type_code,
          environment:      DTE_ENVIRONMENT,
          generation_code,
          control_number,
          dte_status:       "PENDING_GENERATION",
          retry_count:      0,
        },
        select: { id: true },
      });

      return {
        dte_document_id: doc.id,
        sale_id:         data.sale_id,
        sale_code:       data.sale_code,
        dte_type_code:   data.dte_type_code,
        generation_code,
        control_number,
        dte_status:      "PENDING_GENERATION" as const,
      };
    });

    return { ok: true, result };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}
