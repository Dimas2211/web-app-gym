// ─────────────────────────────────────────────────────────────────
// platform — get-dte-correlative-alignment-panel-data.ts
//
// F3-C24 — Datos para el panel administrativo de alineación de
// correlativos DTE, embebido en /dashboard/platform/organizations/[id].
//
// Resuelve tenant_id vía PlatformOrganization.tenant_id y delega el
// cálculo real a commerce/dte/queries/list-dte-correlative-alignment-rows
// (compartido con la ruta operativa /dashboard/dte/correlatives, que NO
// depende de PlatformOrganization — ver F3-C24 corrección de acceso).
// Solo lectura — no escribe nada.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import {
  listDteCorrelativeAlignmentRows,
  type DteCorrelativeAlignmentRow,
} from "@/modules/commerce/dte/queries/list-dte-correlative-alignment-rows";

export type { DteCorrelativeAlignmentRow };

export interface DteCorrelativeAlignmentPanelData {
  tenant_id: string | null;
  rows:      DteCorrelativeAlignmentRow[];
}

export async function getDteCorrelativeAlignmentPanelDataQuery(
  organizationId: string,
): Promise<DteCorrelativeAlignmentPanelData> {
  const org = await prisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { tenant_id: true },
  });

  if (!org?.tenant_id) {
    return { tenant_id: null, rows: [] };
  }

  const rows = await listDteCorrelativeAlignmentRows(org.tenant_id);
  return { tenant_id: org.tenant_id, rows };
}
