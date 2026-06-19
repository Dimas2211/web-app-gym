"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-preflight-panel.tsx
//
// Panel de preflight de base de datos operativa.
// Botón que dispara el check read-only y muestra el resultado inline.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import {
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { runDatabasePreflightAction } from "../actions/run-database-preflight.action";
import type {
  DatabasePreflightResult,
  DatabasePreflightStatus,
  PreflightCheckItem,
} from "../types/platform.types";

interface Props {
  organizationId: string;
}

// ── Helpers de estilo ─────────────────────────────────────────────

const STATUS_ROW_STYLE: Record<PreflightCheckItem["status"], string> = {
  PASS: "border-zinc-100 bg-zinc-50",
  FAIL: "border-red-100 bg-red-50",
  WARN: "border-amber-100 bg-amber-50",
};

const STATUS_ICON: Record<PreflightCheckItem["status"], React.ReactNode> = {
  PASS: <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />,
  FAIL: <XCircle      size={13} className="text-red-500   flex-shrink-0" />,
  WARN: <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />,
};

const SEVERITY_BADGE: Record<PreflightCheckItem["severity"], string> = {
  BLOCKER: "bg-red-100 text-red-700",
  WARNING: "bg-amber-100 text-amber-700",
  INFO:    "bg-zinc-100 text-zinc-600",
};

const SCOPE_BADGE: Record<PreflightCheckItem["scope"], string> = {
  GLOBAL:   "bg-blue-50  text-blue-600",
  TENANT:   "bg-purple-50 text-purple-600",
  LOCATION: "bg-indigo-50 text-indigo-600",
  MODULE:   "bg-teal-50  text-teal-600",
};

const OVERALL_CONFIG: Record<
  DatabasePreflightStatus,
  { label: string; bg: string; textColor: string; Icon: React.ElementType }
> = {
  READY:     { label: "Base operativa lista",              bg: "bg-green-50 border-green-100", textColor: "text-green-700",  Icon: CheckCircle2 },
  PARTIAL:   { label: "Lista con advertencias",            bg: "bg-amber-50 border-amber-100", textColor: "text-amber-700",  Icon: AlertTriangle },
  NOT_READY: { label: "Base NO está lista para operar",   bg: "bg-red-50   border-red-100",   textColor: "text-red-700",    Icon: XCircle },
};

// ── Componente ────────────────────────────────────────────────────

export function PlatformDatabasePreflightPanel({ organizationId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult]          = useState<DatabasePreflightResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded]      = useState<Set<string>>(new Set());

  function handleRun() {
    setResult(null);
    setActionError(null);
    startTransition(async () => {
      const res = await runDatabasePreflightAction(organizationId);
      if (res?.error) {
        setActionError(res.error);
      } else if (res?.result) {
        setResult(res.result);
        // Auto-expandir checks no-PASS
        const failedCodes = new Set(
          res.result.checks
            .filter((c) => c.status !== "PASS")
            .map((c) => c.code),
        );
        setExpanded(failedCodes);
      }
    });
  }

  function toggleExpanded(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  const overall = result ? OVERALL_CONFIG[result.status] : null;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Preflight de base de datos
          </h2>
          <p className="text-sm text-zinc-500">
            Verifica catálogos, seeds y datos mínimos requeridos para operar. Solo lectura — no modifica datos.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={isPending}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {isPending
            ? <Loader2 size={15} className="animate-spin" />
            : <Database size={15} />}
          {isPending ? "Ejecutando preflight..." : "Ejecutar preflight"}
        </button>
      </div>

      {/* Error de acción */}
      {actionError && (
        <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Resultado */}
      {result && overall && (
        <div className="mt-4 space-y-3">

          {/* Banner de estado general */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${overall.bg}`}>
            <overall.Icon size={16} className={overall.textColor} />
            <span className={`text-sm font-semibold ${overall.textColor}`}>
              {overall.label}
            </span>
            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="text-green-600 font-medium">{result.summary.passed} OK</span>
              {result.summary.warnings > 0 && (
                <span className="text-amber-600 font-medium">{result.summary.warnings} aviso{result.summary.warnings !== 1 ? "s" : ""}</span>
              )}
              {result.summary.failed > 0 && (
                <span className="text-red-600 font-medium">{result.summary.failed} bloqueante{result.summary.failed !== 1 ? "s" : ""}</span>
              )}
              <span className="text-zinc-400">{result.summary.totalChecks} checks</span>
            </div>
          </div>

          {/* Lista de checks */}
          <div className="space-y-1">
            {result.checks.map((check) => {
              const isOpen = expanded.has(check.code);
              const hasDetail = check.status !== "PASS";

              return (
                <div
                  key={check.code}
                  className={`rounded-lg border ${STATUS_ROW_STYLE[check.status]}`}
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-2 ${hasDetail ? "cursor-pointer" : ""}`}
                    onClick={hasDetail ? () => toggleExpanded(check.code) : undefined}
                  >
                    {STATUS_ICON[check.status]}

                    <span className="text-xs font-medium text-zinc-700 flex-1 min-w-0 truncate">
                      {check.label}
                    </span>

                    <span className={`hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${SCOPE_BADGE[check.scope]}`}>
                      {check.scope}
                    </span>

                    {check.status !== "PASS" && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEVERITY_BADGE[check.severity]}`}>
                        {check.severity}
                      </span>
                    )}

                    {hasDetail && (
                      isOpen
                        ? <ChevronDown size={13} className="text-zinc-400 flex-shrink-0" />
                        : <ChevronRight size={13} className="text-zinc-400 flex-shrink-0" />
                    )}
                  </div>

                  {hasDetail && isOpen && (
                    <div className="px-3 pb-3 pt-0 pl-8 space-y-1.5 border-t border-zinc-100 bg-white/60 rounded-b-lg mt-0">
                      <p className="text-xs text-zinc-600 pt-2">{check.message}</p>
                      {check.remediation && (
                        <p className="text-xs text-zinc-400">
                          <span className="font-medium text-zinc-500">Corrección:</span>{" "}
                          {check.remediation}
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-300 font-mono">{check.code}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
