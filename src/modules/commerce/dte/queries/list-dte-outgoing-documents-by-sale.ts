// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-outgoing-documents-by-sale.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DteOutgoingDocumentDetail, DteEnvironment, DteOutgoingStatus } from "../types/dte.types";

export async function listDteOutgoingDocumentsBySale(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
): Promise<DteOutgoingDocumentDetail[]> {
  const rows = await prisma.dteOutgoingDocument.findMany({
    where: { sale_id, tenant_id, location_id },
    orderBy: { created_at: "desc" },
    select: {
      id:               true,
      tenant_id:        true,
      location_id:      true,
      sale_id:          true,
      issuer_config_id: true,
      dte_type_code:    true,
      generation_code:  true,
      control_number:   true,
      reception_stamp:  true,
      environment:      true,
      dte_status:       true,
      rejection_reason: true,
      retry_count:      true,
      issued_at:        true,
      generated_at:     true,
      signed_at:        true,
      sent_at:          true,
      accepted_at:      true,
      rejected_at:      true,
      invalidated_at:   true,
      created_at:       true,
      updated_at:       true,
    },
  });

  return rows.map((r) => ({
    ...r,
    environment: r.environment as DteEnvironment,
    dte_status:  r.dte_status  as DteOutgoingStatus,
  }));
}
