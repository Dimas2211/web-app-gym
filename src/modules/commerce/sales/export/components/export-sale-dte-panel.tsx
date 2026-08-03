"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-dte-panel.tsx
//
// F3-C21B — Panel DTE embebido en la columna derecha (fija, siempre
// visible), debajo del resumen de totales. Layout vertical compacto
// (no horizontal-wrap) para caber en una columna angosta sin obligar
// scroll de página. Mismo comportamiento que antes: cada botón
// requiere clic explícito; no se dispara nada automáticamente al
// montar. No muestra signed_jws, json_document ni mh_response
// completos — solo indicadores sí/no.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import {
  generateExportDteJsonAction,
  signExportDteAction,
  transmitExportDteAction,
  deliverExportDteAction,
  getExportDteStateAction,
  type ExportDteState,
  type ExportDteActionResult,
} from "../actions/export-sale-dte.actions";

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium border ${
        ok
          ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50"
          : "bg-zinc-800 text-zinc-500 border-zinc-700"
      }`}
    >
      {ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

const STEP_LABELS: Record<string, string> = {
  PENDING_GENERATION: "Pendiente de generación",
  GENERATED:          "JSON generado (AJV pendiente/fallida)",
  SCHEMA_VALIDATED:   "JSON validado (AJV OK)",
  SIGNED:             "Firmado",
  SENT:               "Enviado a Hacienda",
  ACCEPTED:           "Aceptado por Hacienda",
  OBSERVED:           "Observado por Hacienda",
  REJECTED:           "Rechazado por Hacienda",
  INVALIDATED:        "Invalidado",
};

export function ExportSaleDtePanel({ initialState }: { initialState: ExportDteState }) {
  const [state, setState]   = useState<ExportDteState>(initialState);
  const [error, setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);

  function runAction(name: string, fn: () => Promise<ExportDteActionResult>) {
    setActiveAction(name);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else setState(result.state);
      setActiveAction(null);
    });
  }

  const btnBase =
    "w-full h-8 text-xs font-medium rounded flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="border-t border-zinc-800 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Panel Fiscal DTE — FEX 11
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => runAction("refresh", () => getExportDteStateAction(state.dte_document_id))}
          title="Refrescar estado"
          className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
        >
          {pending && activeAction === "refresh"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-700/50 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-1 rounded bg-zinc-800/40 px-2 py-2 text-[10px]">
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">Núm. control</span>
          <span className="text-zinc-300 truncate">{state.control_number ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500 flex-none">Cód. generación</span>
          <span className="text-zinc-300 truncate break-all text-right">{state.generation_code ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-2 pt-0.5 border-t border-zinc-800">
          <span className="text-zinc-500">Estado</span>
          <span className="text-zinc-100 font-semibold text-right">
            {STEP_LABELS[state.dte_status] ?? state.dte_status}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <Pill ok={state.has_json_document} label="JSON" />
        <Pill ok={state.has_signed_jws} label="Firmado" />
        <Pill ok={state.has_mh_response} label="Resp. MH" />
        <Pill ok={state.has_reception_stamp} label="Sello" />
        <Pill ok={state.has_external_delivery_log} label="MariaDB" />
      </div>

      {state.last_log && (
        <div className="text-[10px] text-zinc-500 leading-snug">
          Último log: <span className="text-zinc-300">{state.last_log.operation_type}</span>{" "}
          ({state.last_log.ok ? "OK" : "error"})
          {state.last_log.message && !state.last_log.ok && (
            <span className="mt-0.5 block text-red-300">{state.last_log.message}</span>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <button
          type="button"
          id="export-dte-generate-btn"
          disabled={pending || !["PENDING_GENERATION", "GENERATED"].includes(state.dte_status)}
          onClick={() => runAction("generate", () => generateExportDteJsonAction(state.dte_document_id))}
          className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-white`}
        >
          {pending && activeAction === "generate" && <Loader2 className="h-3 w-3 animate-spin" />}
          Generar JSON
        </button>

        <button
          type="button"
          disabled={pending || state.dte_status !== "SCHEMA_VALIDATED" || state.has_signed_jws}
          onClick={() => runAction("sign", () => signExportDteAction(state.dte_document_id))}
          className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-white`}
        >
          {pending && activeAction === "sign" && <Loader2 className="h-3 w-3 animate-spin" />}
          Firmar
        </button>

        <button
          type="button"
          disabled={pending || state.dte_status !== "SIGNED" || !state.has_signed_jws || state.has_reception_stamp}
          onClick={() => runAction("transmit", () => transmitExportDteAction(state.dte_document_id))}
          className={`${btnBase} bg-blue-700 hover:bg-blue-600 text-white`}
        >
          {pending && activeAction === "transmit" && <Loader2 className="h-3 w-3 animate-spin" />}
          Transmitir a Hacienda
        </button>

        <button
          type="button"
          disabled={
            pending ||
            state.dte_status !== "ACCEPTED" ||
            !state.has_reception_stamp ||
            state.has_external_delivery_log
          }
          onClick={() => runAction("deliver", () => deliverExportDteAction(state.dte_document_id))}
          className={`${btnBase} bg-emerald-700 hover:bg-emerald-600 text-white`}
        >
          {pending && activeAction === "deliver" && <Loader2 className="h-3 w-3 animate-spin" />}
          Enviar a MariaDB
        </button>
      </div>
    </div>
  );
}
