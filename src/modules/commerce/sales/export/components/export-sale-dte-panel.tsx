"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-dte-panel.tsx
//
// F3-C21 — Panel DTE del módulo comercial FEX 11. Mismo patrón visual
// que fex11-test-console.tsx (no se modifica ese archivo): cada botón
// requiere clic explícito, no se dispara nada automáticamente al
// montar. No muestra signed_jws, json_document ni mh_response
// completos — solo indicadores sí/no.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
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
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium border ${
        ok
          ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/50"
          : "bg-red-900/40 text-red-300 border-red-700/50"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

const STEP_LABELS: Record<string, string> = {
  PENDING_GENERATION: "Pendiente de generación",
  GENERATED:          "JSON generado (validación AJV pendiente/fallida)",
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
      if (!result.ok) {
        setError(result.error);
      } else {
        setState(result.state);
      }
      setActiveAction(null);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-700/50 bg-red-950/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Panel Fiscal DTE — Factura de Exportación (11)</h2>
          <button
            type="button"
            disabled={pending}
            onClick={() => runAction("refresh", () => getExportDteStateAction(state.dte_document_id))}
            className="px-3 py-1 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 transition-colors"
          >
            {pending && activeAction === "refresh" && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
            Refrescar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <span className="text-zinc-500">Número de control</span>
          <span className="text-zinc-200">{state.control_number ?? "—"}</span>

          <span className="text-zinc-500">Código de generación</span>
          <span className="text-zinc-200 break-all">{state.generation_code ?? "—"}</span>

          <span className="text-zinc-500">Estado</span>
          <span className="text-zinc-100 font-semibold">
            {STEP_LABELS[state.dte_status] ?? state.dte_status}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Pill ok={state.has_json_document} label="JSON generado" />
          <Pill ok={state.has_signed_jws} label="Firmado" />
          <Pill ok={state.has_mh_response} label="Respuesta MH" />
          <Pill ok={state.has_reception_stamp} label="Sello de recepción" />
          <Pill ok={state.has_external_delivery_log} label="Entregado a MariaDB" />
        </div>

        {state.last_log && (
          <div className="text-xs text-zinc-400 pt-1">
            Último log: <span className="text-zinc-200">{state.last_log.operation_type}</span>{" "}
            ({state.last_log.ok ? "OK" : "error"}) — {new Date(state.last_log.created_at).toLocaleString("es-SV")}
            {state.last_log.message && !state.last_log.ok && (
              <span className="block text-red-300 mt-0.5">{state.last_log.message}</span>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Acciones</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !["PENDING_GENERATION", "GENERATED"].includes(state.dte_status)}
            onClick={() => runAction("generate", () => generateExportDteJsonAction(state.dte_document_id))}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending && activeAction === "generate" && <Loader2 className="h-3 w-3 animate-spin" />}
            Generar JSON
          </button>

          <button
            type="button"
            disabled={pending || state.dte_status !== "SCHEMA_VALIDATED" || state.has_signed_jws}
            onClick={() => runAction("sign", () => signExportDteAction(state.dte_document_id))}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending && activeAction === "sign" && <Loader2 className="h-3 w-3 animate-spin" />}
            Firmar
          </button>

          <button
            type="button"
            disabled={pending || state.dte_status !== "SIGNED" || !state.has_signed_jws || state.has_reception_stamp}
            onClick={() => runAction("transmit", () => transmitExportDteAction(state.dte_document_id))}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending && activeAction === "deliver" && <Loader2 className="h-3 w-3 animate-spin" />}
            Enviar a MariaDB
          </button>
        </div>
      </section>
    </div>
  );
}
