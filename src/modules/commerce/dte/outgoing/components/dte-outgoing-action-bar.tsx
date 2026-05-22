"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-action-bar.tsx
//
// Barra de acciones contextuales del panel de detalle DTE.
// FASE 5B — "Enviar DTE externo" tiene ejecución real.
//
// Acciones con ejecución real:
//   - Enviar DTE externo (canDeliverExternal)
//
// Acciones visuales/pendientes (sin ejecución):
//   - Firmar, Transmitir, Crear NC, Invalidar, Enviar inv. externa
// ─────────────────────────────────────────────────────────────────

import { Loader2 } from "lucide-react";
import type { DteOutgoingActionAvailability } from "../types";

// ── Chip estático (sin ejecución) ─────────────────────────────────

interface ActionChipProps {
  label:     string;
  available: boolean;
  reason?:   string;
}

function ActionChip({ label, available, reason }: ActionChipProps) {
  const title = available
    ? `${label} — disponible (sin implementación en esta fase)`
    : (reason ?? `${label} — no disponible`);

  return (
    <button
      type="button"
      disabled
      title={title}
      aria-label={title}
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium border",
        "cursor-default select-none",
        available
          ? "bg-blue-950/60 border-blue-700/50 text-blue-300"
          : "bg-zinc-800/30 border-zinc-700/30 text-zinc-600",
      ].join(" ")}
    >
      {available && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

// ── Chip interactivo — Enviar DTE externo (Fase 5B) ───────────────

interface DeliverExternalChipProps {
  available:         boolean;
  reason?:           string;
  onRequestDeliver?: () => void;
  isDelivering?:     boolean;
}

function DeliverExternalChip({
  available,
  reason,
  onRequestDeliver,
  isDelivering,
}: DeliverExternalChipProps) {
  // Estado: ejecutando
  if (isDelivering) {
    return (
      <button
        type="button"
        disabled
        aria-label="Enviando DTE al sistema externo…"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border bg-blue-950/80 border-blue-700/60 text-blue-300 cursor-default"
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" aria-hidden="true" />
        Enviando…
      </button>
    );
  }

  // Estado: no disponible
  if (!available) {
    return (
      <ActionChip
        label="Enviar DTE externo"
        available={false}
        reason={reason}
      />
    );
  }

  // Estado: disponible y clickeable
  return (
    <button
      type="button"
      onClick={onRequestDeliver}
      disabled={!onRequestDeliver}
      title="Enviar DTE externo al sistema configurado"
      aria-label="Enviar DTE externo"
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium border",
        "transition-colors",
        onRequestDeliver
          ? "bg-blue-800/70 border-blue-600/70 text-blue-200 hover:bg-blue-700/80 hover:border-blue-500 cursor-pointer"
          : "bg-blue-950/60 border-blue-700/50 text-blue-300 cursor-default",
      ].join(" ")}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" aria-hidden="true" />
      Enviar DTE externo
    </button>
  );
}

// ── Barra principal ───────────────────────────────────────────────

export interface DteOutgoingActionBarProps {
  availability:      DteOutgoingActionAvailability;
  onRequestDeliver?: () => void;
  isDelivering?:     boolean;
}

export function DteOutgoingActionBar({
  availability: av,
  onRequestDeliver,
  isDelivering,
}: DteOutgoingActionBarProps) {
  const staticActions: ActionChipProps[] = [
    { label: "Firmar",          available: av.canSign,                        reason: av.reasons.sign },
    { label: "Transmitir",      available: av.canTransmit,                    reason: av.reasons.transmit },
    { label: "Crear NC",        available: av.canCreateCreditNote,            reason: av.reasons.createCreditNote },
    { label: "Invalidar",       available: av.canInvalidate,                  reason: av.reasons.invalidate },
    { label: "Enviar inv. ext.", available: av.canDeliverExternalInvalidation, reason: av.reasons.sendExternalInvalidation },
  ];

  const allAvailableCount =
    staticActions.filter((a) => a.available).length +
    (av.canDeliverExternal ? 1 : 0);

  return (
    <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-zinc-800/70 bg-zinc-900/30">
      {/* Etiqueta */}
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">
        Acciones
      </span>

      {/* Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {staticActions.map((a) => (
          <ActionChip key={a.label} {...a} />
        ))}

        {/* Chip interactivo — Fase 5B */}
        <DeliverExternalChip
          available={av.canDeliverExternal}
          reason={av.reasons.sendExternalDte}
          onRequestDeliver={onRequestDeliver}
          isDelivering={isDelivering}
        />
      </div>

      {/* Indicador de disponibles */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {allAvailableCount > 0 && (
          <span className="text-[9px] text-blue-500">
            {allAvailableCount} disponible{allAvailableCount > 1 ? "s" : ""}
          </span>
        )}
        <span className="text-[9px] text-zinc-600 italic">
          Fase 5B
        </span>
      </div>
    </div>
  );
}
