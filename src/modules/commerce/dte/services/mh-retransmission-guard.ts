// ─────────────────────────────────────────────────────────────────
// commerce/dte — mh-retransmission-guard.ts
//
// MH20 (Fase 6, IMP20-025) — reconstruye el historial de intentos de un
// DTE desde DteTransmissionLog (SEND / QUERY) y aplica la política del MT
// v2 §3.3 (spec/mh-transmission-policy.ts): ante un resultado incierto se
// exige consulta y conciliación ANTES de cualquier retransmisión.
//
// Se aplica a documentos MH_2_0. Los documentos MH_1_2 conservan el
// comportamiento histórico (decisión registrada en
// 06-external-integration-contracts.md: extenderlo a 1.2 es un cambio de
// comportamiento del módulo DTE V1 cerrado y requiere autorización).
// Reutiliza el flujo existente de reconciliación (dte-reconciliation.service.ts,
// consultadte); no implementa endpoints nuevos.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import {
  classifyMhTransmissionOutcome,
  decideMhRetransmission,
  type MhAttemptRecord,
  type MhRetransmissionDecision,
} from "../spec/mh-transmission-policy";

interface LogRow {
  operation_type: string;
  response_body:  unknown;
  created_at:     Date;
}

export function mhAttemptHistoryFromLogs(rows: readonly LogRow[]): MhAttemptRecord[] {
  const out: MhAttemptRecord[] = [];
  for (const r of rows) {
    const b = (r.response_body ?? {}) as Record<string, unknown>;
    if (r.operation_type === "SEND") {
      const outcome = typeof b.mhEstado === "string"
        ? classifyMhTransmissionOutcome({ ok: true, mhEstado: b.mhEstado })
        : classifyMhTransmissionOutcome({ ok: false, errorCode: typeof b.errorCode === "string" ? b.errorCode : null });
      out.push({ kind: "SEND", outcome, at: r.created_at });
    } else if (r.operation_type === "QUERY") {
      const kind = typeof b.kind === "string" ? b.kind : typeof b.mhEstado === "string" ? "QUERY_PROCESSED" : null;
      const received =
        kind === "QUERY_PROCESSED" ? true
        : kind === "QUERY_NOT_FOUND" || kind === "QUERY_REJECTED_OR_ERROR" ? false
        : null;
      out.push({ kind: "QUERY", received, at: r.created_at });
    }
  }
  return out;
}

export async function decideRetransmissionForDocument(
  db: Pick<PrismaClient, "dteTransmissionLog">,
  dteDocumentId: string,
): Promise<MhRetransmissionDecision> {
  const rows = await db.dteTransmissionLog.findMany({
    where:   { dte_document_id: dteDocumentId, operation_type: { in: ["SEND", "QUERY"] } },
    select:  { operation_type: true, response_body: true, created_at: true },
    orderBy: { created_at: "asc" },
  });
  return decideMhRetransmission(mhAttemptHistoryFromLogs(rows));
}
