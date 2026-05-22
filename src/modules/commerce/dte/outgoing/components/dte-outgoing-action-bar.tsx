"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-action-bar.tsx
//
// Barra de acciones contextuales del panel de detalle DTE.
// FASE 5E — "Invalidar" tiene ejecución real.
//
// Acciones con ejecución real:
//   - Enviar DTE externo (canDeliverExternal)              — Fase 5B
//   - Enviar inv. externa (canDeliverExternalInvalidation) — Fase 5C
//   - Crear NC (canCreateCreditNote)                       — Fase 5D
//   - Invalidar DTE (canInvalidate)                        — Fase 5E
//
// Acciones visuales/pendientes (sin ejecución):
//   - Firmar, Transmitir
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

  if (!available) {
    return (
      <ActionChip
        label="Enviar DTE externo"
        available={false}
        reason={reason}
      />
    );
  }

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

// ── Chip interactivo — Enviar inv. externa (Fase 5C) ──────────────

interface DeliverExternalInvalidationChipProps {
  available:                      boolean;
  reason?:                        string;
  onRequestDeliverInvalidation?:  () => void;
  isDeliveringInvalidation?:      boolean;
}

function DeliverExternalInvalidationChip({
  available,
  reason,
  onRequestDeliverInvalidation,
  isDeliveringInvalidation,
}: DeliverExternalInvalidationChipProps) {
  if (isDeliveringInvalidation) {
    return (
      <button
        type="button"
        disabled
        aria-label="Enviando invalidación al sistema externo…"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border bg-amber-950/80 border-amber-700/60 text-amber-300 cursor-default"
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" aria-hidden="true" />
        Enviando inv.…
      </button>
    );
  }

  if (!available) {
    return (
      <ActionChip
        label="Enviar inv. ext."
        available={false}
        reason={reason}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestDeliverInvalidation}
      disabled={!onRequestDeliverInvalidation}
      title="Enviar invalidación aceptada al sistema externo"
      aria-label="Enviar invalidación externa"
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium border",
        "transition-colors",
        onRequestDeliverInvalidation
          ? "bg-amber-800/70 border-amber-600/70 text-amber-200 hover:bg-amber-700/80 hover:border-amber-500 cursor-pointer"
          : "bg-amber-950/60 border-amber-700/50 text-amber-300 cursor-default",
      ].join(" ")}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
      Enviar inv. ext.
    </button>
  );
}

// ── Chip interactivo — Crear NC (Fase 5D) ─────────────────────────

interface CreateCreditNoteChipProps {
  available:               boolean;
  reason?:                 string;
  onRequestCreateCreditNote?: () => void;
  isCreatingCreditNote?:   boolean;
}

function CreateCreditNoteChip({
  available,
  reason,
  onRequestCreateCreditNote,
  isCreatingCreditNote,
}: CreateCreditNoteChipProps) {
  if (isCreatingCreditNote) {
    return (
      <button
        type="button"
        disabled
        aria-label="Creando Nota de Crédito…"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border bg-violet-950/80 border-violet-700/60 text-violet-300 cursor-default"
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" aria-hidden="true" />
        Creando NC…
      </button>
    );
  }

  if (!available) {
    return (
      <ActionChip
        label="Crear NC"
        available={false}
        reason={reason}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestCreateCreditNote}
      disabled={!onRequestCreateCreditNote}
      title="Crear Nota de Crédito NC 05 a partir de este CCFE 03 aceptado"
      aria-label="Crear Nota de Crédito"
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium border",
        "transition-colors",
        onRequestCreateCreditNote
          ? "bg-violet-800/70 border-violet-600/70 text-violet-200 hover:bg-violet-700/80 hover:border-violet-500 cursor-pointer"
          : "bg-violet-950/60 border-violet-700/50 text-violet-300 cursor-default",
      ].join(" ")}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" aria-hidden="true" />
      Crear NC
    </button>
  );
}

// ── Chip interactivo — Invalidar DTE (Fase 5E) ───────────────────

interface InvalidateChipProps {
  available:            boolean;
  reason?:              string;
  onRequestInvalidate?: () => void;
  isInvalidating?:      boolean;
}

function InvalidateChip({
  available,
  reason,
  onRequestInvalidate,
  isInvalidating,
}: InvalidateChipProps) {
  if (isInvalidating) {
    return (
      <button
        type="button"
        disabled
        aria-label="Invalidando DTE…"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border bg-red-950/80 border-red-700/60 text-red-300 cursor-default"
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" aria-hidden="true" />
        Invalidando…
      </button>
    );
  }

  if (!available) {
    return (
      <ActionChip
        label="Invalidar"
        available={false}
        reason={reason}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestInvalidate}
      disabled={!onRequestInvalidate}
      title="Invalidar este DTE aceptado ante Hacienda"
      aria-label="Invalidar DTE"
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium border",
        "transition-colors",
        onRequestInvalidate
          ? "bg-red-900/70 border-red-700/70 text-red-200 hover:bg-red-800/80 hover:border-red-600 cursor-pointer"
          : "bg-red-950/60 border-red-800/50 text-red-400 cursor-default",
      ].join(" ")}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" aria-hidden="true" />
      Invalidar
    </button>
  );
}

// ── Barra principal ───────────────────────────────────────────────

export interface DteOutgoingActionBarProps {
  availability:                    DteOutgoingActionAvailability;
  onRequestDeliver?:               () => void;
  isDelivering?:                   boolean;
  onRequestDeliverInvalidation?:   () => void;
  isDeliveringInvalidation?:       boolean;
  onRequestCreateCreditNote?:      () => void;
  isCreatingCreditNote?:           boolean;
  onRequestInvalidate?:            () => void;
  isInvalidating?:                 boolean;
}

export function DteOutgoingActionBar({
  availability: av,
  onRequestDeliver,
  isDelivering,
  onRequestDeliverInvalidation,
  isDeliveringInvalidation,
  onRequestCreateCreditNote,
  isCreatingCreditNote,
  onRequestInvalidate,
  isInvalidating,
}: DteOutgoingActionBarProps) {
  const staticActions: ActionChipProps[] = [
    { label: "Firmar",     available: av.canSign,     reason: av.reasons.sign },
    { label: "Transmitir", available: av.canTransmit, reason: av.reasons.transmit },
  ];

  const allAvailableCount =
    staticActions.filter((a) => a.available).length +
    (av.canDeliverExternal ? 1 : 0) +
    (av.canDeliverExternalInvalidation ? 1 : 0) +
    (av.canCreateCreditNote ? 1 : 0) +
    (av.canInvalidate ? 1 : 0);

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

        {/* Chip interactivo — Fase 5D: Crear NC */}
        <CreateCreditNoteChip
          available={av.canCreateCreditNote}
          reason={av.reasons.createCreditNote}
          onRequestCreateCreditNote={onRequestCreateCreditNote}
          isCreatingCreditNote={isCreatingCreditNote}
        />

        {/* Chip interactivo — Fase 5B: Enviar DTE externo */}
        <DeliverExternalChip
          available={av.canDeliverExternal}
          reason={av.reasons.sendExternalDte}
          onRequestDeliver={onRequestDeliver}
          isDelivering={isDelivering}
        />

        {/* Chip interactivo — Fase 5C: Enviar invalidación externa */}
        <DeliverExternalInvalidationChip
          available={av.canDeliverExternalInvalidation}
          reason={av.reasons.sendExternalInvalidation}
          onRequestDeliverInvalidation={onRequestDeliverInvalidation}
          isDeliveringInvalidation={isDeliveringInvalidation}
        />

        {/* Chip interactivo — Fase 5E: Invalidar DTE */}
        <InvalidateChip
          available={av.canInvalidate}
          reason={av.reasons.invalidate}
          onRequestInvalidate={onRequestInvalidate}
          isInvalidating={isInvalidating}
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
          Fase 5E
        </span>
      </div>
    </div>
  );
}
