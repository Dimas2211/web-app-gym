// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-transmission-logs.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DteTransmissionLogEntry } from "../types/dte.types";

export async function listDteTransmissionLogs(
  dte_document_id: string,
): Promise<DteTransmissionLogEntry[]> {
  const rows = await prisma.dteTransmissionLog.findMany({
    where:   { dte_document_id },
    orderBy: { created_at: "asc" },
    select: {
      id:              true,
      dte_document_id: true,
      attempt_number:  true,
      operation_type:  true,
      request_url:     true,
      http_status:     true,
      error_message:   true,
      created_at:      true,
    },
  });

  return rows;
}
