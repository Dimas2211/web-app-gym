// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-correlative-alignment-rows.ts
//
// F3-C24 — Núcleo de lectura para el panel de "Alineación de
// correlativos DTE", independiente de Platform Admin / PlatformOrganization.
//
// Toma directamente un tenant_id (de la sesión activa o de una
// PlatformOrganization, según el caller) y arma, por cada
// DteIssuerConfig activo × cada tipo DTE conocido, el estado del
// correlativo: último local, máximo ya usado en DteOutgoingDocument,
// baseline externo y el siguiente numeroControl que se emitiría.
//
// Dos consumidores reutilizan esto:
//   - /dashboard/dte/correlatives (contexto operativo del tenant actual,
//     sin depender de PlatformOrganization).
//   - Platform Admin → Organizaciones → (org) → panel embebido, que
//     resuelve tenant_id vía PlatformOrganization.tenant_id y delega
//     acá (ver get-dte-correlative-alignment-panel-data.ts).
//
// Solo lectura — no escribe nada.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { getDteCorrelativeStatus } from "../services/dte-correlative.service";
import { DTE_TYPE_CODES_FOR_ALIGNMENT } from "../constants/dte-type-codes-for-alignment";

export interface DteCorrelativeAlignmentRow {
  issuer_config_id:   string;
  location_id:        string;
  location_name:      string;
  environment:        "TEST" | "PRODUCTION";
  dte_type_code:      string;
  dte_type_label:     string;
  cod_estable_mh:     string;
  cod_punto_venta_mh: string;
  local_last_sequence:          number;
  max_used_in_outgoing:         number;
  baseline_last_used_sequence:  number | null;
  baseline_source:              string | null;
  baseline_notes:                string | null;
  baseline_evidence_ref:         string | null;
  baseline_set_at:               string | null;
  next_sequence:                 number;
}

export async function listDteCorrelativeAlignmentRows(
  tenant_id: string,
): Promise<DteCorrelativeAlignmentRow[]> {
  const [issuerConfigs, branches] = await Promise.all([
    prisma.dteIssuerConfig.findMany({
      where:  { tenant_id, is_active: true, cod_estable_mh: { not: null }, cod_punto_venta_mh: { not: null } },
      select: { id: true, location_id: true, environment: true, cod_estable_mh: true, cod_punto_venta_mh: true },
      orderBy: [{ location_id: "asc" }, { environment: "asc" }],
    }),
    prisma.branch.findMany({
      where:  { tenant_id },
      select: { id: true, name: true },
    }),
  ]);

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const rows: DteCorrelativeAlignmentRow[] = [];

  for (const issuer of issuerConfigs) {
    if (!issuer.cod_estable_mh || !issuer.cod_punto_venta_mh) continue;

    for (const dteType of DTE_TYPE_CODES_FOR_ALIGNMENT) {
      const status = await getDteCorrelativeStatus({
        tenant_id,
        location_id:        issuer.location_id,
        issuer_config_id:   issuer.id,
        environment:        issuer.environment,
        dte_type_code:      dteType.code,
        cod_estable_mh:     issuer.cod_estable_mh,
        cod_punto_venta_mh: issuer.cod_punto_venta_mh,
      });

      rows.push({
        issuer_config_id:   issuer.id,
        location_id:        issuer.location_id,
        location_name:      branchNameById.get(issuer.location_id) ?? issuer.location_id,
        environment:        issuer.environment,
        dte_type_code:      dteType.code,
        dte_type_label:     dteType.label,
        cod_estable_mh:     issuer.cod_estable_mh,
        cod_punto_venta_mh: issuer.cod_punto_venta_mh,
        local_last_sequence:          status.local_last_sequence,
        max_used_in_outgoing:         status.max_used_in_outgoing,
        baseline_last_used_sequence:  status.baseline_last_used_sequence,
        baseline_source:              status.baseline_source,
        baseline_notes:               status.baseline_notes,
        baseline_evidence_ref:        status.baseline_evidence_ref,
        baseline_set_at:              status.baseline_set_at,
        next_sequence:                status.next_sequence,
      });
    }
  }

  return rows;
}
