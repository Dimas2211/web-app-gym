"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/settings — dte-environment-diagnostics-button.tsx
//
// Botón "Probar conexión y firma" por ambiente + resultado de ESTA
// ejecución (no se persiste). Bloquea doble clic mientras corre; el
// servidor además rechaza ejecuciones concurrentes del mismo ambiente.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Activity, Loader2 } from "lucide-react";

import {
  runDteEnvironmentDiagnosticsAction,
  type RunDteEnvironmentDiagnosticsActionResult,
} from "../../actions/run-dte-environment-diagnostics.action";
import type {
  DteDiagnosticCheckResult,
  DteEnvironmentDiagnosticsResult,
} from "../../services/dte-environment-diagnostics.service";
import type { DteEnvironment } from "../../types/dte.types";

const ENV_LABEL: Record<DteEnvironment, string> = { TEST: "PRUEBAS", PRODUCTION: "PRODUCCIÓN" };

function StatusPill({ status }: { status: DteDiagnosticCheckResult["status"] }) {
  const map = {
    OK:             { cls: "bg-emerald-100 text-emerald-700", label: "OK" },
    ERROR:          { cls: "bg-red-100 text-red-700",         label: "ERROR" },
    NOT_CONFIGURED: { cls: "bg-zinc-100 text-zinc-600",       label: "NO CONFIGURADA" },
  } as const;
  const { cls, label } = map[status];
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function CheckRow({ title, check }: { title: string; check: DteDiagnosticCheckResult }) {
  const meta = [
    check.httpStatus !== undefined ? `HTTP ${check.httpStatus}` : null,
    check.externalCode ? `Código ${check.externalCode}` : null,
    check.targetHost ?? null,
    check.durationMs !== undefined ? `${check.durationMs} ms` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-zinc-700">{title}</span>
        <StatusPill status={check.status} />
      </div>
      <p className={check.status === "ERROR" ? "text-red-600" : "text-zinc-600"}>{check.message}</p>
      {check.externalDescription && (
        <p className="text-zinc-500">Respuesta: {check.externalDescription}</p>
      )}
      {meta.length > 0 && <p className="text-zinc-400 font-mono">{meta.join(" · ")}</p>}
    </div>
  );
}

function ResultPanel({ result }: { result: DteEnvironmentDiagnosticsResult }) {
  const bothOk = result.auth.status === "OK" && result.signature.status === "OK";
  const label = ENV_LABEL[result.environment];
  return (
    <div className="text-xs space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-zinc-400">
        Prueba ejecutada: {new Date(result.testedAt).toLocaleString("es-SV")}
      </p>
      {bothOk && (
        <p className="font-semibold text-emerald-700">
          Autenticación MH y firma correctas en {label}. No se transmitieron documentos.
        </p>
      )}
      <CheckRow title="Autenticación Hacienda" check={result.auth} />
      <CheckRow title="Firma" check={result.signature} />
      {result.signature.status === "OK" && (
        <p className="text-zinc-500">
          Se verificó el formato de la firma y que el contenido firmado coincide con el JSON de prueba.
          La validez criptográfica del certificado no se verificó localmente.
        </p>
      )}
      <p className="text-zinc-500 italic">Esta prueba no confirma la aceptación fiscal de un DTE.</p>
    </div>
  );
}

export type DteEnvironmentDiagnosticsRunner = (
  environment: DteEnvironment,
) => Promise<RunDteEnvironmentDiagnosticsActionResult>;

const defaultRunner: DteEnvironmentDiagnosticsRunner = (environment) =>
  runDteEnvironmentDiagnosticsAction({ environment });

/**
 * `runAction` permite reutilizar el mismo botón/resultado desde Platform
 * Admin (onboarding fiscal), que resuelve organización/runtime con su
 * propia acción. Por defecto usa la acción de /dashboard/settings/dte.
 */
export function DteEnvironmentDiagnosticsButton({
  environment,
  runAction = defaultRunner,
}: {
  environment: DteEnvironment;
  runAction?: DteEnvironmentDiagnosticsRunner;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DteEnvironmentDiagnosticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await runAction(environment);
        if (res.ok) {
          setResult(res.result);
        } else {
          setResult(null);
          setError(res.error);
        }
      } catch {
        setResult(null);
        setError("No se pudo ejecutar la prueba. Intente nuevamente.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        aria-busy={isPending}
        className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
        {isPending ? "Probando…" : "Probar conexión y firma"}
      </button>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {result && !isPending && <ResultPanel result={result} />}
    </div>
  );
}
