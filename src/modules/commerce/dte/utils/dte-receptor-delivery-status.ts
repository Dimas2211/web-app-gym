// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-receptor-delivery-status.ts
//
// MH20 (Fase 6.1, IMP20-021) — distingue, sin ambigüedad, los tres estados
// de la entrega al RECEPTOR del Archivo DTE y su representación gráfica
// (Normativa 2.0 reglas 6, 11 y 14; MF "entregar al cliente el Archivo DTE
// y la Representación Gráfica"):
//
//   GENERATED  → el archivo/PDF se puede construir desde el JSON firmado.
//   AVAILABLE  → existe un canal desde el que el receptor puede obtenerlo.
//                Hoy SOLO hay descarga autenticada para personal autorizado
//                (/api/dte/outgoing/:id/json?variant=archive y
//                /representation): es "disponible internamente", no
//                autogestión del receptor (sin portal DTE ni correo).
//   DELIVERED  → solo con evidencia de entrega efectiva (registro del canal).
//                No existe canal de correo/portal DTE en el repositorio, así
//                que NUNCA se marca entregado automáticamente.
//
// Puro. No envía nada.
// ─────────────────────────────────────────────────────────────────

export type ReceptorDeliveryChannel = "NONE" | "INTERNAL_DOWNLOAD" | "EMAIL" | "PORTAL";

export interface ReceptorDeliveryEvidence {
  channel:     Exclude<ReceptorDeliveryChannel, "NONE" | "INTERNAL_DOWNLOAD">;
  deliveredAt: Date;
  reference:   string;
}

export interface ReceptorDeliveryStatus {
  archiveGenerated:        boolean;
  representationGenerated: boolean;
  availableInternally:     boolean;
  availableToReceptor:     boolean;
  delivered:               boolean;
  channel:                 ReceptorDeliveryChannel;
  pending:                 string[];
}

export function computeReceptorDeliveryStatus(params: {
  archiveOk:          boolean;
  representationOk:   boolean;
  /** Canales de autogestión/envío configurados (hoy: ninguno). */
  receptorChannels?:  ReadonlyArray<"EMAIL" | "PORTAL">;
  evidence?:          ReceptorDeliveryEvidence | null;
}): ReceptorDeliveryStatus {
  const { archiveOk, representationOk } = params;
  const channels = params.receptorChannels ?? [];
  const evidence = params.evidence ?? null;
  const pending: string[] = [];
  if (!archiveOk) pending.push("Archivo DTE 2.0 no generable (MH 1.2 histórico, sin sello o sin firma).");
  if (!representationOk) pending.push("Representación gráfica no generable.");
  const availableInternally = archiveOk || representationOk;
  const availableToReceptor = availableInternally && channels.length > 0;
  if (availableInternally && !availableToReceptor) {
    pending.push("Sin canal de entrega al receptor (correo o portal de descarga segura): entrega manual por personal autorizado.");
  }
  const delivered = Boolean(evidence) && availableInternally;
  if (availableInternally && !delivered) pending.push("Entrega efectiva no registrada.");
  return {
    archiveGenerated:        archiveOk,
    representationGenerated: representationOk,
    availableInternally,
    availableToReceptor,
    delivered,
    channel: delivered ? evidence!.channel : availableToReceptor ? channels[0] : availableInternally ? "INTERNAL_DOWNLOAD" : "NONE",
    pending,
  };
}
