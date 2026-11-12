"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getDteContinuationAction, runDteContinuationAction } from "./actions";
import { continuationAllowed, continuationLabel } from "./availability";
import type {
  DteContinuationOperation,
  DteContinuationRequest,
  DteContinuationState,
} from "./types";
import { dteStatusLabel, envLabel } from "../outgoing/utils/dte-status.utils";

interface Props {
  request: DteContinuationRequest;
  type: string;
  originCode: string;
  onClose: () => void;
  onFiscalChange?: () => void;
}
const operations: { op: DteContinuationOperation; label: string }[] = [
  { op: "generate", label: "Generar y validar JSON" },
  { op: "sign", label: "Firmar" },
  { op: "reconcile", label: "Consultar estado en Hacienda" },
  { op: "transmit", label: "Transmitir a Hacienda" },
  { op: "deliver", label: "Enviar a MariaDB" },
  { op: "reopen", label: "Preparar nueva firma (rechazo 802)" },
];

/** Reads and resumes one existing document; mounting never performs fiscal writes. */
export function ResumeDteDialog({ request, type, originCode, onClose, onFiscalChange }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<DteContinuationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState<"transmit" | "deliver" | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const { dteId, origin, originId } = request;
  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    setConfirmation(null);
    getDteContinuationAction({ dteId, origin, originId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setState(result.state);
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el documento. Intenta nuevamente.");
      });
    return () => {
      cancelled = true;
    };
  }, [dteId, origin, originId, attempt]);

  async function run(op: DteContinuationOperation, confirmed = false) {
    if (busy) return;
    if ((op === "transmit" || op === "deliver") && !confirmed) {
      setConfirmation(op);
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      const result = await runDteContinuationAction({ dteId, origin, originId }, op, confirmed);
      if (result.ok) setState(result.state);
      else {
        setError(result.error);
        const latest = await getDteContinuationAction({ dteId, origin, originId });
        if (latest.ok) setState(latest.state);
      }
      onFiscalChange?.();
    } catch {
      setError(
        "No se pudo completar la operación. Actualiza el estado antes de volver a intentar."
      );
    } finally {
      setBusy(false);
    }
  }
  function handleKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!busy) onClose();
    }
    if (event.key === "Tab") {
      const nodes = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'
        )
      );
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKey}
        aria-busy={busy}
        className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-zinc-200 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold">
              {continuationLabel(state?.type ?? type) ?? "Continuar DTE"}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {origin === "sale" ? "Venta" : "Compra"} {originCode}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-xs underline disabled:opacity-40"
          >
            Cerrar
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs break-words whitespace-pre-wrap text-red-300">
            {error}
          </p>
        )}
        {!state ? (
          <div className="text-xs text-zinc-400">
            {error ? (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline">
                Reintentar
              </button>
            ) : (
              <p role="status">Cargando documento guardado…</p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded bg-zinc-800/60 p-3 text-xs">
              <p
                className={
                  state.environment === "PRODUCTION"
                    ? "font-semibold text-red-300"
                    : "text-amber-300"
                }
              >
                {envLabel(state.environment)} · {dteStatusLabel(state.status)}
              </p>
              <p className="break-all">Nº control: {state.controlNumber ?? "—"}</p>
              <p className="break-all">Código generación: {state.generationCode ?? "—"}</p>
              <p>
                JSON: {state.hasJson ? "Sí" : "No"} · Firmado: {state.hasSignature ? "Sí" : "No"} ·
                Sello: {state.hasStamp ? "Sí" : "No"}
              </p>
              <p>Entrega a MariaDB: {state.delivered ? "Registrada" : "Sin entrega registrada"}</p>
            </div>
            {state.lastError && (
              <p className="text-xs break-words whitespace-pre-wrap text-amber-200">
                Último mensaje: {state.lastError}
              </p>
            )}
            {state.status === "REJECTED" && !state.canReopen && (
              <p className="text-xs text-amber-200">
                Revisa el motivo del rechazo. Este panel conserva el documento y no crea otro
                automáticamente.
              </p>
            )}
            {state.status === "SIGNED" && (
              <p className="text-xs text-zinc-400">
                Si una transmisión anterior quedó sin respuesta, consulta primero su estado en
                Hacienda.
              </p>
            )}
            <div className="space-y-2">
              {operations
                .filter(({ op }) => continuationAllowed(state, op))
                .map(({ op, label }) => (
                  <button
                    key={op}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(op)}
                    className="w-full rounded bg-zinc-700 px-3 py-2 text-xs hover:bg-zinc-600 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setAttempt((n) => n + 1)}
                className="w-full py-1 text-xs underline disabled:opacity-40"
              >
                Actualizar estado
              </button>
            </div>
            {confirmation && (
              <div
                className="space-y-3 rounded border border-amber-700 p-3 text-xs"
                role="group"
                aria-label="Confirmar envío"
              >
                <p>
                  {confirmation === "transmit"
                    ? "¿Transmitir este DTE a Hacienda"
                    : "¿Enviar este DTE al sistema externo configurado"}{" "}
                  en ambiente {envLabel(state.environment)}?
                </p>
                <p className="font-mono break-all">{state.controlNumber}</p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(confirmation, true)}
                    className="rounded bg-blue-700 px-3 py-2"
                  >
                    Confirmar envío
                  </button>
                  <button type="button" onClick={() => setConfirmation(null)} className="underline">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {busy && (
              <p role="status" className="text-xs text-zinc-400">
                Procesando documento…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
