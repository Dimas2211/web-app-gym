// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-correlative.service.ts
//
// F3-C24 — Alineación inicial de correlativos DTE.
//
// Punto único, genérico por dte_type_code, para:
//   1. reservar el siguiente numeroControl de forma atómica
//      (reserveDteControlNumber) — reemplaza la lógica antes duplicada
//      en dte-outgoing.service.ts (01/03), create-credit-note-dte.service.ts
//      (05) y export-sale.service.ts (11);
//   2. consultar el estado de un correlativo para la UI administrativa
//      (getDteCorrelativeStatus);
//   3. registrar un "baseline" externo — el último numeroControl que el
//      cliente ya usó en un sistema de facturación anterior, para que la
//      plataforma nunca vuelva a emitir un numeroControl ya usado ante
//      Hacienda (alignDteCorrelativeBaseline).
//
// Regla central (pedida explícitamente, no es una optimización local de
// FEX 11): el siguiente número a reservar es
//
//   max(
//     DteCorrelative.last_sequence,
//     mayor secuencia ya usada en DteOutgoingDocument para esa combinación
//       (sin filtrar por dte_status — incluye ACCEPTED, REJECTED, SIGNED…),
//     DteCorrelative.external_baseline_last_used_sequence,
//   ) + 1
//
// La combinación de partición es SIEMPRE:
//   tenant_id + location_id + issuer_config_id + environment +
//   dte_type_code (+ cod_estable_mh/cod_punto_venta_mh del emisor).
//
// No firma, no transmite, no toca documentos ya existentes — solo decide
// qué número reservar para uno nuevo.
// ─────────────────────────────────────────────────────────────────

import { Prisma }   from "@prisma/client";
import { prisma }   from "@/lib/db/prisma";
import { buildControlNumber, buildControlNumberPrefix } from "../utils/dte-control-number";

export interface DteCorrelativeIssuerContext {
  tenant_id:          string;
  location_id:        string;
  issuer_config_id:   string;
  environment:        "TEST" | "PRODUCTION";
  dte_type_code:      string;
  cod_estable_mh:     string;
  cod_punto_venta_mh: string;
}

// ── 1. Reserva atómica del siguiente numeroControl ─────────────────
//
// Debe llamarse DENTRO de una transacción Prisma ya abierta por el
// caller (createPendingDteForSale, createCreditNoteDteFromAcceptedCcfe,
// createPendingExportDte, etc.) para que la reserva y la creación del
// DteOutgoingDocument sean atómicas y hagan rollback juntas.
export async function reserveDteControlNumber(
  tx:  Prisma.TransactionClient,
  ctx: DteCorrelativeIssuerContext,
): Promise<{ sequence: number; control_number: string }> {
  const year = new Date().getFullYear();
  const key = {
    tenant_id_location_id_issuer_config_id_environment_dte_type_code_year: {
      tenant_id:        ctx.tenant_id,
      location_id:      ctx.location_id,
      issuer_config_id: ctx.issuer_config_id,
      environment:      ctx.environment,
      dte_type_code:    ctx.dte_type_code,
      year,
    },
  };

  // Asegura que la fila exista. El UPDATE siguiente toma el row lock que
  // serializa reservas concurrentes sobre la misma combinación.
  await tx.dteCorrelative.upsert({
    where:  key,
    create: {
      tenant_id:          ctx.tenant_id,
      location_id:        ctx.location_id,
      issuer_config_id:   ctx.issuer_config_id,
      environment:        ctx.environment,
      dte_type_code:      ctx.dte_type_code,
      cod_estable_mh:     ctx.cod_estable_mh,
      cod_punto_venta_mh: ctx.cod_punto_venta_mh,
      year,
      last_sequence:      0,
    },
    update: {},
  });

  const correlative = await tx.dteCorrelative.findUniqueOrThrow({
    where:  key,
    select: { last_sequence: true, external_baseline_last_used_sequence: true },
  });

  // Mayor secuencia ya usada realmente en DteOutgoingDocument para el mismo
  // prefijo (estable+puntoVenta+tipo), sin filtrar por estado — un
  // numeroControl ya usado (aunque haya sido REJECTED) nunca debe repetirse.
  const prefix = buildControlNumberPrefix({
    dte_type_code:      ctx.dte_type_code,
    cod_estable_mh:     ctx.cod_estable_mh,
    cod_punto_venta_mh: ctx.cod_punto_venta_mh,
  });

  const existing = await tx.dteOutgoingDocument.findMany({
    where: {
      tenant_id:      ctx.tenant_id,
      location_id:    ctx.location_id,
      environment:    ctx.environment,
      dte_type_code:  ctx.dte_type_code,
      control_number: { startsWith: prefix },
    },
    select: { control_number: true },
  });

  const maxUsedInOutgoing = existing.reduce((max, doc) => {
    const seqStr = doc.control_number?.slice(prefix.length) ?? "";
    const seq = Number.parseInt(seqStr, 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  const floor = Math.max(
    correlative.last_sequence,
    maxUsedInOutgoing,
    correlative.external_baseline_last_used_sequence ?? 0,
  );

  // Si el correlativo local venía por detrás del máximo real (local u
  // externo), se realinea antes de incrementar para que la reserva
  // atómica de abajo parta del piso correcto.
  if (floor > correlative.last_sequence) {
    await tx.dteCorrelative.update({ where: key, data: { last_sequence: floor } });
  }

  const updated = await tx.dteCorrelative.update({
    where:  key,
    data:   { last_sequence: { increment: 1 } },
    select: { last_sequence: true },
  });

  const sequence = updated.last_sequence;
  const control_number = buildControlNumber({
    dte_type_code:      ctx.dte_type_code,
    cod_estable_mh:     ctx.cod_estable_mh,
    cod_punto_venta_mh: ctx.cod_punto_venta_mh,
    sequence,
  });

  return { sequence, control_number };
}

// ── 2. Estado de un correlativo (lectura, para UI administrativa) ──

export interface DteCorrelativeStatus {
  exists:                    boolean;
  local_last_sequence:       number;
  max_used_in_outgoing:      number;
  baseline_last_used_sequence: number | null;
  baseline_source:           string | null;
  baseline_notes:            string | null;
  baseline_evidence_ref:     string | null;
  baseline_set_by:           string | null;
  baseline_set_at:           string | null;
  next_sequence:             number;
}

export async function getDteCorrelativeStatus(params: {
  tenant_id:          string;
  location_id:        string;
  issuer_config_id:   string;
  environment:        "TEST" | "PRODUCTION";
  dte_type_code:      string;
  cod_estable_mh:     string;
  cod_punto_venta_mh: string;
}): Promise<DteCorrelativeStatus> {
  const year = new Date().getFullYear();

  const correlative = await prisma.dteCorrelative.findUnique({
    where: {
      tenant_id_location_id_issuer_config_id_environment_dte_type_code_year: {
        tenant_id:        params.tenant_id,
        location_id:      params.location_id,
        issuer_config_id: params.issuer_config_id,
        environment:      params.environment,
        dte_type_code:    params.dte_type_code,
        year,
      },
    },
    select: {
      last_sequence: true,
      external_baseline_last_used_sequence: true,
      external_baseline_source: true,
      external_baseline_notes: true,
      external_baseline_evidence_ref: true,
      external_baseline_set_by: true,
      external_baseline_set_at: true,
    },
  });

  const prefix = buildControlNumberPrefix({
    dte_type_code:      params.dte_type_code,
    cod_estable_mh:     params.cod_estable_mh,
    cod_punto_venta_mh: params.cod_punto_venta_mh,
  });

  const existing = await prisma.dteOutgoingDocument.findMany({
    where: {
      tenant_id:      params.tenant_id,
      location_id:    params.location_id,
      environment:    params.environment,
      dte_type_code:  params.dte_type_code,
      control_number: { startsWith: prefix },
    },
    select: { control_number: true },
  });

  const maxUsedInOutgoing = existing.reduce((max, doc) => {
    const seqStr = doc.control_number?.slice(prefix.length) ?? "";
    const seq = Number.parseInt(seqStr, 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  const localLastSequence = correlative?.last_sequence ?? 0;
  const baselineLastUsed  = correlative?.external_baseline_last_used_sequence ?? null;

  const floor = Math.max(localLastSequence, maxUsedInOutgoing, baselineLastUsed ?? 0);

  return {
    exists:                 correlative != null,
    local_last_sequence:    localLastSequence,
    max_used_in_outgoing:   maxUsedInOutgoing,
    baseline_last_used_sequence: baselineLastUsed,
    baseline_source:        correlative?.external_baseline_source ?? null,
    baseline_notes:         correlative?.external_baseline_notes ?? null,
    baseline_evidence_ref:  correlative?.external_baseline_evidence_ref ?? null,
    baseline_set_by:        correlative?.external_baseline_set_by ?? null,
    baseline_set_at:        correlative?.external_baseline_set_at?.toISOString() ?? null,
    next_sequence:          floor + 1,
  };
}

// ── 3. Alinear baseline externo (escritura administrativa) ─────────
//
// Reglas de negocio (ver microfase F3-C24):
//   - No puede bajar el correlativo por debajo del máximo ya usado
//     localmente (local_last_sequence o max_used_in_outgoing).
//   - No permite valores negativos ni cero-o-menos.
//   - notes es obligatorio (evidencia/justificación).
//   - Solo afecta emisiones futuras — nunca toca DteOutgoingDocument
//     existentes ni numeroControl ya asignados.
// La autorización (solo super_admin) se valida en la action, no aquí.

export type AlignDteCorrelativeResult =
  | { ok: true; next_sequence: number }
  | { ok: false; error: string };

export async function alignDteCorrelativeBaseline(input: {
  tenant_id:               string;
  location_id:             string;
  issuer_config_id:        string;
  environment:             "TEST" | "PRODUCTION";
  dte_type_code:           string;
  cod_estable_mh:          string;
  cod_punto_venta_mh:      string;
  last_used_sequence:      number;
  source:                  string;
  notes:                   string;
  evidence_ref?:           string | null;
  user_id:                 string;
}): Promise<AlignDteCorrelativeResult> {
  if (!Number.isInteger(input.last_used_sequence) || input.last_used_sequence < 0) {
    return { ok: false, error: "El último número usado externo debe ser un entero mayor o igual a 0." };
  }
  if (!input.notes?.trim()) {
    return { ok: false, error: "La nota/justificación es obligatoria para registrar un baseline externo." };
  }

  const year = new Date().getFullYear();
  const key = {
    tenant_id_location_id_issuer_config_id_environment_dte_type_code_year: {
      tenant_id:        input.tenant_id,
      location_id:      input.location_id,
      issuer_config_id: input.issuer_config_id,
      environment:      input.environment,
      dte_type_code:    input.dte_type_code,
      year,
    },
  };

  const status = await getDteCorrelativeStatus(input);
  const localFloor = Math.max(status.local_last_sequence, status.max_used_in_outgoing);

  if (input.last_used_sequence < localFloor) {
    return {
      ok:    false,
      error: `No se puede alinear a ${input.last_used_sequence}: ya existe correlativo local usado hasta ${localFloor} ` +
             `(correlativo interno: ${status.local_last_sequence}, máximo en documentos emitidos: ${status.max_used_in_outgoing}). ` +
             `El baseline externo solo puede adelantar el correlativo, nunca retrocederlo.`,
    };
  }

  await prisma.dteCorrelative.upsert({
    where: key,
    create: {
      tenant_id:          input.tenant_id,
      location_id:        input.location_id,
      issuer_config_id:   input.issuer_config_id,
      environment:        input.environment,
      dte_type_code:      input.dte_type_code,
      cod_estable_mh:     input.cod_estable_mh,
      cod_punto_venta_mh: input.cod_punto_venta_mh,
      year,
      last_sequence:      0,
      external_baseline_last_used_sequence: input.last_used_sequence,
      external_baseline_source:             input.source || null,
      external_baseline_notes:              input.notes,
      external_baseline_evidence_ref:       input.evidence_ref || null,
      external_baseline_set_by:             input.user_id,
      external_baseline_set_at:             new Date(),
    },
    update: {
      external_baseline_last_used_sequence: input.last_used_sequence,
      external_baseline_source:             input.source || null,
      external_baseline_notes:              input.notes,
      external_baseline_evidence_ref:       input.evidence_ref || null,
      external_baseline_set_by:             input.user_id,
      external_baseline_set_at:             new Date(),
    },
  });

  return { ok: true, next_sequence: input.last_used_sequence + 1 };
}
