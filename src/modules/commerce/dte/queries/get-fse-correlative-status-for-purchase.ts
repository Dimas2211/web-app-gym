// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-fse-correlative-status-for-purchase.ts
//
// Lectura de solo consulta del estado del correlativo DTE tipo "14"
// (FSE) para el panel fiscal de una compra. Reutiliza exactamente el
// mismo cálculo que ya gobierna la reserva real de correlativo
// (getDteCorrelativeStatus / reserveDteControlNumber en
// dte-correlative.service.ts) — no duplica la regla del "último +1".
//
// Dos casos:
//   - La compra YA tiene un DteOutgoingDocument tipo 14 → se resuelve el
//     issuer_config_id/environment de ESE documento (aunque la config
//     activa haya cambiado después) y se muestra el número ya asignado,
//     no una predicción.
//   - La compra NO tiene documento aún → se resuelve la única
//     DteIssuerConfig activa para tenant+location (misma regla que
//     createPendingDteForPurchase usa para auto-resolver el emisor) y
//     se muestra el "próximo" número que se reservaría.
//
// No escribe nada. No reserva correlativo. Ver docs/modules/
// dte-correlatives-onboarding.md para la regla completa de alineación.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { getDteCorrelativeStatus } from "../services/dte-correlative.service";
import { buildControlNumber } from "../utils/dte-control-number";

export interface FseCorrelativeStatusView {
  environment:                  "TEST" | "PRODUCTION";
  cod_estable_mh:               string;
  cod_punto_venta_mh:           string;
  local_last_sequence:          number;
  max_used_in_outgoing:         number;
  baseline_last_used_sequence:  number | null;
  baseline_source:              string | null;
  next_sequence:                number;
  next_control_number_preview:  string; // numeroControl que se reservaría si aún no existe documento
}

export type FseCorrelativeStatusResult =
  | { ok: true; status: FseCorrelativeStatusView }
  | { ok: false; error: string };

export async function getFseCorrelativeStatusForPurchase(params: {
  tenant_id:            string;
  location_id:          string;
  // Si la compra ya tiene un DteOutgoingDocument tipo 14, pasar su
  // issuer_config_id/environment para reflejar el emisor REAL usado —
  // nunca inferir desde la config activa actual en ese caso.
  existing_dte_issuer_config_id?: string | null;
  existing_dte_environment?:      "TEST" | "PRODUCTION" | null;
}): Promise<FseCorrelativeStatusResult> {
  const { tenant_id, location_id } = params;

  let issuerConfigId: string;
  let environment:    "TEST" | "PRODUCTION";
  let codEstableMh:   string | null;
  let codPuntoVentaMh: string | null;

  if (params.existing_dte_issuer_config_id) {
    const issuer = await prisma.dteIssuerConfig.findFirst({
      where:  { id: params.existing_dte_issuer_config_id, tenant_id, location_id },
      select: { id: true, environment: true, cod_estable_mh: true, cod_punto_venta_mh: true },
    });
    if (!issuer) {
      return { ok: false, error: "La configuración del emisor asociada a este DTE ya no existe." };
    }
    issuerConfigId  = issuer.id;
    environment     = params.existing_dte_environment ?? (issuer.environment as "TEST" | "PRODUCTION");
    codEstableMh    = issuer.cod_estable_mh;
    codPuntoVentaMh = issuer.cod_punto_venta_mh;
  } else {
    const activeConfigs = await prisma.dteIssuerConfig.findMany({
      where:  { tenant_id, location_id, is_active: true },
      select: { id: true, environment: true, cod_estable_mh: true, cod_punto_venta_mh: true },
      take:   3,
    });
    if (activeConfigs.length === 0) {
      return { ok: false, error: "No existe una configuración DTE activa para esta location." };
    }
    if (activeConfigs.length > 1) {
      return { ok: false, error: "Hay más de una configuración DTE activa (TEST y PRODUCTION)." };
    }
    const issuer = activeConfigs[0];
    issuerConfigId  = issuer.id;
    environment     = issuer.environment as "TEST" | "PRODUCTION";
    codEstableMh    = issuer.cod_estable_mh;
    codPuntoVentaMh = issuer.cod_punto_venta_mh;
  }

  if (!codEstableMh || !codPuntoVentaMh) {
    return {
      ok:    false,
      error: "Faltan códigos MH de establecimiento y punto de venta en la configuración del emisor.",
    };
  }

  const status = await getDteCorrelativeStatus({
    tenant_id,
    location_id,
    issuer_config_id:   issuerConfigId,
    environment,
    dte_type_code:      "14",
    cod_estable_mh:     codEstableMh,
    cod_punto_venta_mh: codPuntoVentaMh,
  });

  const preview = buildControlNumber({
    dte_type_code:      "14",
    cod_estable_mh:     codEstableMh,
    cod_punto_venta_mh: codPuntoVentaMh,
    sequence:           status.next_sequence,
  });

  return {
    ok: true,
    status: {
      environment,
      cod_estable_mh:              codEstableMh,
      cod_punto_venta_mh:          codPuntoVentaMh,
      local_last_sequence:         status.local_last_sequence,
      max_used_in_outgoing:        status.max_used_in_outgoing,
      baseline_last_used_sequence: status.baseline_last_used_sequence,
      baseline_source:             status.baseline_source,
      next_sequence:                status.next_sequence,
      next_control_number_preview:  preview,
    },
  };
}
