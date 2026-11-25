// ─────────────────────────────────────────────────────────────────
// commerce/dte — mh20-pre-reservation-guard.ts
//
// MH20 (Fase 7, §11) — validaciones fiscales que deben ocurrir ANTES de
// reservar el numeroControl, para que una operación rechazada por la 2.0
// no consuma correlativo ni deje un DteOutgoingDocument incompleto.
//
// Interruptor OFF → resolveIssuerSpecProfileForGeneration devuelve MH_1_2
// sin consultar M1 → esta guarda no hace nada (comportamiento 1.2 intacto).
// Con MH_2_0: perfil permitido para el tipo/ambiente + estructura AT de
// cod_estable_mh / cod_punto_venta_mh (IMP20-011). Se llama dentro de la
// transacción del llamador; si devuelve error, el llamador aborta antes de
// reserveDteControlNumber y la transacción no escribe nada.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { DteSpecProfile } from "../spec/dte-spec-profile";
import type { DteSpecKind } from "../spec/dte-spec-registry";
import { resolveIssuerSpecProfileForGeneration } from "../spec/resolve-issuer-spec-profile";
import { MH_AT_COD_ESTABLE_RE, MH_AT_COD_PUNTO_VENTA_RE } from "../utils/mh-issuer-codes";

export type Mh20PreReservationResult =
  | { ok: true; profile: DteSpecProfile }
  | { ok: false; error: string };

/** Regla pura: con MH_2_0 los códigos AT deben tener la estructura oficial. */
export function mh20IssuerCodesError(
  profile: DteSpecProfile,
  codes: { cod_estable_mh: string | null | undefined; cod_punto_venta_mh: string | null | undefined },
): string | null {
  if (profile !== "MH_2_0") return null;
  const e = codes.cod_estable_mh?.trim() ?? "";
  const p = codes.cod_punto_venta_mh?.trim() ?? "";
  if (!MH_AT_COD_ESTABLE_RE.test(e) || !MH_AT_COD_PUNTO_VENTA_RE.test(p)) {
    return (
      `Con la normativa MH 2.0 los códigos AT deben ser establecimiento M|S|B|P + 3 dígitos y punto de venta P + 3 dígitos ` +
      `(actual: "${e || "-"}" / "${p || "-"}"). Corrija la configuración del emisor; no se reservó correlativo.`
    );
  }
  return null;
}

export async function ensureMh20ReadyBeforeReservation(
  db: PrismaClient,
  params: {
    issuerConfigId: string; tenantId: string; locationId: string; environment: string; kind: DteSpecKind;
    cod_estable_mh: string | null | undefined; cod_punto_venta_mh: string | null | undefined;
  },
): Promise<Mh20PreReservationResult> {
  const r = await resolveIssuerSpecProfileForGeneration(
    db, params.issuerConfigId, params.tenantId, params.locationId, params.environment, params.kind,
  );
  if (!r.ok) return r;
  const codesError = mh20IssuerCodesError(r.profile, params);
  if (codesError) return { ok: false, error: codesError };
  return { ok: true, profile: r.profile };
}
