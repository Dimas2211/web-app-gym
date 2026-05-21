"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-action-bar.tsx
//
// Barra visual de disponibilidad de acciones contextuales.
// FASE 5A — solo muestra disponibilidad. Ningún botón ejecuta acciones.
//
// Reglas absolutas:
//   - NO onClick reales
//   - NO llamadas a server actions
//   - NO fetch POST
//   - NO modificación de estado fiscal
//   - NO envío a Hacienda
//   - NO envío a MariaDB
// ─────────────────────────────────────────────────────────────────

import type { DteOutgoingActionAvailability } from "../types";

// ── Botón de acción individual ────────────────────────────────────

interface ActionChipProps {
  label:     string;
  available: boolean;
  reason?:   string;
}

function ActionChip({ label, available, reason }: ActionChipProps) {
  const title = available
    ? `${label} — disponible (Fase 5A: sin ejecución)`
    : (reason ?? `${label} — no disponible`);

  return (
    <button
      type="button"
      disabled
      title={title}
      aria-label={title}
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium border",
        "cursor-default select-none transition-none",
        available
          ? "bg-blue-950/60 border-blue-700/50 text-blue-300"
          : "bg-zinc-800/30 border-zinc-700/30 text-zinc-600",
      ].join(" ")}
    >
      {available && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  );
}

// ── Barra principal ───────────────────────────────────────────────

export interface DteOutgoingActionBarProps {
  availability: DteOutgoingActionAvailability;
}

export function DteOutgoingActionBar({ availability: av }: DteOutgoingActionBarProps) {
  const actions: ActionChipProps[] = [
    {
      label:     "Firmar",
      available: av.canSign,
      reason:    av.reasons.sign,
    },
    {
      label:     "Transmitir",
      available: av.canTransmit,
      reason:    av.reasons.transmit,
    },
    {
      label:     "Crear NC",
      available: av.canCreateCreditNote,
      reason:    av.reasons.createCreditNote,
    },
    {
      label:     "Invalidar",
      available: av.canInvalidate,
      reason:    av.reasons.invalidate,
    },
    {
      label:     "Enviar DTE externo",
      available: av.canDeliverExternal,
      reason:    av.reasons.sendExternalDte,
    },
    {
      label:     "Enviar inv. externa",
      available: av.canDeliverExternalInvalidation,
      reason:    av.reasons.sendExternalInvalidation,
    },
  ];

  const availableCount = actions.filter((a) => a.available).length;

  return (
    <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-zinc-800/70 bg-zinc-900/30">
      {/* Etiqueta */}
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">
        Acciones
      </span>

      {/* Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {actions.map((a) => (
          <ActionChip key={a.label} {...a} />
        ))}
      </div>

      {/* Indicador de disponibles + aviso de fase */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {availableCount > 0 && (
          <span className="text-[9px] text-blue-500">
            {availableCount} disponible{availableCount > 1 ? "s" : ""}
          </span>
        )}
        <span className="text-[9px] text-zinc-600 italic">
          Fase 5A — solo disponibilidad
        </span>
      </div>
    </div>
  );
}
