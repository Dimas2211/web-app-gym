"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/fex11-test — fex11-test-console.tsx
//
// Microfase F3-C18 — Consola de prueba FEX 11 (interna, solo TEST).
//
// No retransmite ni ejecuta ninguna acción automáticamente al cargar
// la página — cada paso requiere clic explícito del usuario. No
// muestra signed_jws, json_document, mh_response completo ni
// credenciales — solo indicadores sí/no y metadatos ya sanitizados
// por las server actions.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  createFex11TestCaseAction,
  refreshFex11TestStateAction,
  generateFex11TestJsonAction,
  signFex11TestAction,
  transmitFex11TestAction,
  deliverFex11TestAction,
  type Fex11ConsoleDteState,
  type Fex11ConsoleActionResult,
} from "../actions/fex11-test-console.actions";

interface Fex11TestConsoleProps {
  consoleEnabled:     boolean;
  flagEnabled:        boolean;
  nodeEnv:            string;
  environmentOk:      boolean;
  hasTenant:          boolean;
  hasLocation:        boolean;
  signerConfigured:   boolean;
  mhConfigured:       boolean;
  mariaDbConfigured:  boolean;
}

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
  GENERATED:          "JSON generado (AJV pendiente/fallido)",
  SCHEMA_VALIDATED:   "JSON validado (AJV OK)",
  SIGNED:             "Firmado",
  ACCEPTED:           "Aceptado por Hacienda",
  OBSERVED:           "Observado por Hacienda",
  REJECTED:           "Rechazado por Hacienda",
  INVALIDATED:        "Invalidado",
};

export function Fex11TestConsole(props: Fex11TestConsoleProps) {
  const {
    consoleEnabled, flagEnabled, nodeEnv, environmentOk,
    hasTenant, hasLocation, signerConfigured, mhConfigured, mariaDbConfigured,
  } = props;

  const [state, setState]     = useState<Fex11ConsoleDteState | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [caseMarkerMsg, setCaseMarkerMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);

  function runAction(name: string, fn: () => Promise<Fex11ConsoleActionResult>) {
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

  if (!consoleEnabled || !hasTenant || !hasLocation) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-6">
        <div className="flex items-center gap-2 text-amber-300 font-semibold mb-2">
          <AlertTriangle className="h-5 w-5" />
          Consola de prueba FEX 11 — bloqueada
        </div>
        <p className="text-sm text-zinc-300 mb-4">
          Esta consola solo funciona con <code>DTE_FEX11_TEST_ENABLED=YES</code>, fuera de
          producción, y con sesión con tenant/location activos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Pill ok={flagEnabled} label={`DTE_FEX11_TEST_ENABLED: ${flagEnabled ? "YES" : "NO"}`} />
          <Pill ok={environmentOk} label={`NODE_ENV: ${nodeEnv}`} />
          <Pill ok={hasTenant} label="Tenant activo" />
          <Pill ok={hasLocation} label="Location activa" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Consola de prueba FEX 11</h1>
        <p className="text-sm text-amber-400 font-medium mt-1">
          Solo TEST — no usar para operación comercial real.
        </p>
      </div>

      {/* Estado del feature flag y configuración */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Estado del ambiente</h2>
        <div className="flex flex-wrap gap-2">
          <Pill ok={flagEnabled} label="DTE_FEX11_TEST_ENABLED=YES" />
          <Pill ok={environmentOk} label={`NODE_ENV=${nodeEnv}`} />
          <Pill ok={true} label="Ambiente permitido: TEST" />
        </div>
        <h2 className="text-sm font-semibold text-zinc-200 pt-2">Configuración disponible</h2>
        <div className="flex flex-wrap gap-2">
          <Pill ok={signerConfigured} label="Firmador configurado" />
          <Pill ok={mhConfigured} label="MH TEST configurado" />
          <Pill ok={mariaDbConfigured} label="MariaDB configurado" />
        </div>
      </section>

      {error && (
        <div className="rounded border border-red-700/50 bg-red-950/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {caseMarkerMsg && !error && (
        <div className="rounded border border-emerald-700/50 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          {caseMarkerMsg}
        </div>
      )}

      {/* Botón 1: crear caso */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">1. Crear caso de prueba</h2>
        <p className="text-xs text-zinc-400">
          Crea una venta y un documento DTE tipo 11 nuevos (marcados FEX11_UI_TEST_*). No reutiliza
          el DTE ACCEPTED ni el REJECTED de fases anteriores.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            runAction("create", async () => {
              const result = await createFex11TestCaseAction();
              if (result.ok) setCaseMarkerMsg(`Caso de prueba creado: documento ${result.state.dte_document_id}`);
              return result;
            })
          }
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending && activeAction === "create" && <Loader2 className="h-3 w-3 animate-spin" />}
          Crear nuevo caso de prueba FEX 11
        </button>
      </section>

      {/* Estado del documento */}
      {state && (
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Estado del documento</h2>
            <button
              type="button"
              disabled={pending}
              onClick={() => runAction("refresh", () => refreshFex11TestStateAction(state.dte_document_id))}
              className="px-3 py-1 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 transition-colors"
            >
              {pending && activeAction === "refresh" && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
              Refrescar estado
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <span className="text-zinc-500">dte_document_id</span>
            <span className="text-zinc-200 font-mono text-[11px] break-all">{state.dte_document_id}</span>

            <span className="text-zinc-500">sale_id</span>
            <span className="text-zinc-200 font-mono text-[11px] break-all">{state.sale_id ?? "—"}</span>

            <span className="text-zinc-500">control_number</span>
            <span className="text-zinc-200">{state.control_number ?? "—"}</span>

            <span className="text-zinc-500">generation_code</span>
            <span className="text-zinc-200 break-all">{state.generation_code ?? "—"}</span>

            <span className="text-zinc-500">dte_status</span>
            <span className="text-zinc-100 font-semibold">
              {STEP_LABELS[state.dte_status] ?? state.dte_status}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Pill ok={state.has_json_document} label="json_document" />
            <Pill ok={state.has_signed_jws} label="signed_jws" />
            <Pill ok={state.has_mh_response} label="mh_response" />
            <Pill ok={state.has_reception_stamp} label="reception_stamp" />
            <Pill ok={state.has_external_delivery_log} label="EXTERNAL_DELIVERY log" />
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
      )}

      {/* Botones de flujo — solo si hay caso creado */}
      {state && (
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">Flujo controlado</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !["PENDING_GENERATION", "GENERATED"].includes(state.dte_status)}
              onClick={() => runAction("generate", () => generateFex11TestJsonAction(state.dte_document_id))}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending && activeAction === "generate" && <Loader2 className="h-3 w-3 animate-spin" />}
              2. Generar JSON
            </button>

            <button
              type="button"
              disabled={pending || state.dte_status !== "SCHEMA_VALIDATED" || state.has_signed_jws}
              onClick={() => runAction("sign", () => signFex11TestAction(state.dte_document_id))}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending && activeAction === "sign" && <Loader2 className="h-3 w-3 animate-spin" />}
              3. Firmar
            </button>

            <button
              type="button"
              disabled={pending || state.dte_status !== "SIGNED" || !state.has_signed_jws || state.has_reception_stamp}
              onClick={() => runAction("transmit", () => transmitFex11TestAction(state.dte_document_id))}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending && activeAction === "transmit" && <Loader2 className="h-3 w-3 animate-spin" />}
              4. Transmitir a Hacienda TEST
            </button>

            <button
              type="button"
              disabled={
                pending ||
                state.dte_status !== "ACCEPTED" ||
                !state.has_reception_stamp ||
                state.has_external_delivery_log
              }
              onClick={() => runAction("deliver", () => deliverFex11TestAction(state.dte_document_id))}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending && activeAction === "deliver" && <Loader2 className="h-3 w-3 animate-spin" />}
              5. Enviar a MariaDB
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
