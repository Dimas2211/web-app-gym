"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-profile-preflight-modal.tsx
//
// Modal que ejecuta el preflight read-only contra un
// PlatformDatabaseProfile específico (Prisma dinámico, C3).
//
// Reglas de seguridad:
// - No renderiza password ni DATABASE_URL en ningún path.
// - Los mensajes de error vienen ya sanitizados desde la action.
// - Solo muestra datos de resultado: checks, status, summary.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useEffect } from "react";
import {
  X,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { runDatabaseProfilePreflightAction } from "../actions/run-database-profile-preflight.action";
import type {
  DatabasePreflightResult,
  DatabasePreflightStatus,
  DatabasePreflightTargetType,
  PreflightCheckItem,
} from "../types/platform.types";

interface Props {
  profileId:    string;
  profileLabel: string;
  onClose:      () => void;
}

// ── Helpers de estilo (iguales al panel existente) ─────────────────

const STATUS_ROW_STYLE: Record<PreflightCheckItem["status"], string> = {
  PASS: "border-zinc-100 bg-zinc-50",
  FAIL: "border-red-100 bg-red-50",
  WARN: "border-amber-100 bg-amber-50",
};

const STATUS_ICON: Record<PreflightCheckItem["status"], React.ReactNode> = {
  PASS: <CheckCircle2  size={13} className="text-green-500 flex-shrink-0" />,
  FAIL: <XCircle       size={13} className="text-red-500   flex-shrink-0" />,
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
  READY:     { label: "Base operativa lista",           bg: "bg-green-50 border-green-100", textColor: "text-green-700",  Icon: CheckCircle2 },
  PARTIAL:   { label: "Lista con advertencias",         bg: "bg-amber-50 border-amber-100", textColor: "text-amber-700",  Icon: AlertTriangle },
  NOT_READY: { label: "Base NO está lista para operar", bg: "bg-red-50   border-red-100",   textColor: "text-red-700",    Icon: XCircle },
};

const TARGET_TYPE_LABEL: Record<DatabasePreflightTargetType, string> = {
  CONTROL_PLANE: "Control plane",
  CLIENT_RUNTIME: "Base cliente / runtime",
  DEMO:          "Demo",
  UNKNOWN:       "No definido",
};

// ── Componente ────────────────────────────────────────────────────

export function PlatformDatabaseProfilePreflightModal({
  profileId,
  profileLabel,
  onClose,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [result,      setResult]      = useState<DatabasePreflightResult | null>(null);
  const [tenantIdUsed, setTenantIdUsed] = useState<string | null>(null);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [expanded,    setExpanded]      = useState<Set<string>>(new Set());

  // Cerrar con Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleRun() {
    setResult(null);
    setActionError(null);
    startTransition(async () => {
      const res = await runDatabaseProfilePreflightAction(profileId);
      if (res?.error) {
        setActionError(res.error);
      } else if (res?.result) {
        setResult(res.result);
        setTenantIdUsed(res.tenantIdUsed ?? null);
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
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl border border-zinc-200">

        {/* Cabecera */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Database size={16} className="text-indigo-500" />
              <h2 className="text-sm font-bold text-zinc-800">
                Preflight — {profileLabel}
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Verifica catálogos, seeds y datos mínimos en la base objetivo. Solo lectura — no modifica datos.
            </p>
            {result && (
              <p className="text-xs text-zinc-400 mt-1">
                Modo:{" "}
                <span className="font-medium text-zinc-600">
                  {TARGET_TYPE_LABEL[result.targetType]}
                </span>
                {tenantIdUsed && (
                  <>
                    {" · "}Tenant:{" "}
                    <span className="font-mono text-zinc-600">{tenantIdUsed}</span>
                  </>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">

          {/* Botón ejecutar */}
          {!result && !actionError && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={handleRun}
                disabled={isPending}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700
                           disabled:bg-indigo-400 text-white text-sm font-semibold
                           px-5 py-2.5 rounded-lg transition-colors"
              >
                {isPending
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Database size={15} />}
                {isPending ? "Ejecutando preflight..." : "Ejecutar preflight"}
              </button>
            </div>
          )}

          {/* Error de acción */}
          {actionError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm text-red-700">{actionError}</p>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isPending}
                  className="text-xs text-red-600 underline hover:no-underline disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && overall && (
            <div className="space-y-3">

              {/* Banner de estado general */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${overall.bg}`}>
                <overall.Icon size={16} className={overall.textColor} />
                <span className={`text-sm font-semibold ${overall.textColor}`}>
                  {overall.label}
                </span>
                <div className="ml-auto flex items-center gap-4 text-xs">
                  <span className="text-green-600 font-medium">
                    {result.summary.passed} OK
                  </span>
                  {result.summary.warnings > 0 && (
                    <span className="text-amber-600 font-medium">
                      {result.summary.warnings} aviso{result.summary.warnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {result.summary.failed > 0 && (
                    <span className="text-red-600 font-medium">
                      {result.summary.failed} bloqueante{result.summary.failed !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-zinc-400">{result.summary.totalChecks} checks</span>
                </div>
              </div>

              {/* Lista de checks */}
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {result.checks.map((check) => {
                  const isOpen    = expanded.has(check.code);
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
                            ? <ChevronDown  size={13} className="text-zinc-400 flex-shrink-0" />
                            : <ChevronRight size={13} className="text-zinc-400 flex-shrink-0" />
                        )}
                      </div>

                      {hasDetail && isOpen && (
                        <div className="px-3 pb-3 pt-0 pl-8 space-y-1.5 border-t border-zinc-100 bg-white/60 rounded-b-lg">
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

              {/* Volver a ejecutar */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700
                             border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-50
                             transition-colors disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />}
                  {isPending ? "Ejecutando..." : "Volver a ejecutar"}
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
