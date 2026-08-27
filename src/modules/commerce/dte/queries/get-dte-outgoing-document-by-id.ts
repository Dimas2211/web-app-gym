// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-dte-outgoing-document-by-id.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DteOutgoingDocumentDetail, DteEnvironment, DteOutgoingStatus } from "../types/dte.types";

export async function getDteOutgoingDocumentById(
  id:        string,
  tenant_id: string,
): Promise<DteOutgoingDocumentDetail | null> {
  const row = await prisma.dteOutgoingDocument.findFirst({
    where: { id, tenant_id },
    select: {
      id:               true,
      tenant_id:        true,
      location_id:      true,
      sale_id:          true,
      purchase_id:      true,
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

  if (!row) return null;

  return {
    ...row,
    environment: row.environment as DteEnvironment,
    dte_status:  row.dte_status  as DteOutgoingStatus,
  };
}
