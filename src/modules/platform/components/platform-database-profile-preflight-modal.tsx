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

import { useState, useTransition, useEffect, useMemo } from "react";
import {
  X,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ShieldAlert,
  Wrench,
  Layers,
  ArrowRightLeft,
  Info,
  Lock,
  HardDrive,
  ShieldCheck,
  Ban,
  FlaskConical,
  MessageSquareWarning,
  Play,
} from "lucide-react";

import { runDatabaseProfilePreflightAction }                from "../actions/run-database-profile-preflight.action";
import { runDatabaseProfileDteCatalogSeedAction }            from "../actions/run-database-profile-dte-catalog-seed.action";
import { runDatabaseProfileTenantFiscalConfigAction }        from "../actions/run-database-profile-tenant-fiscal-config.action";
import { buildDatabaseRemediationPlan }                      from "../lib/database-remediation-planner";
import { getExecutionSafetyPreview }                         from "../lib/database-execution-safety";
import type {
  DatabasePreflightResult,
  DatabasePreflightStatus,
  DatabasePreflightTargetType,
  PreflightCheckItem,
  DatabaseRemediationItem,
  DatabaseRemediationActionType,
  DatabaseRemediationRisk,
  DatabaseRemediationStatus,
  DatabaseRemediationPlanStatus,
  PlatformDatabaseProfileEnvironment,
  DteCatalogItemsSeedDryRunResult,
  DteCatalogItemsSeedResult,
  TenantFiscalConfigDryRunResult,
  TenantFiscalConfigSeedResult,
} from "../types/platform.types";

interface Props {
  profileId:    string;
  profileLabel: string;
  environment?: PlatformDatabaseProfileEnvironment;
  onClose:      () => void;
}

// Textos de confirmación esperados para EXECUTE — deben coincidir con sus actions
const DTE_SEED_CONFIRM_TEXT             = "SEED DTE CATALOGS";
const TENANT_FISCAL_CONFIG_CONFIRM_TEXT = "CREATE TENANT FISCAL CONFIG";

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

// ── Helpers de estilo para el plan ────────────────────────────────

const ACTION_TYPE_CONFIG: Record<
  DatabaseRemediationActionType,
  { label: string; badge: string; Icon: React.ElementType }
> = {
  SEED:          { label: "Seed",          badge: "bg-blue-100 text-blue-700",   Icon: Layers },
  MIGRATION:     { label: "Migración",     badge: "bg-purple-100 text-purple-700", Icon: ArrowRightLeft },
  CONFIGURATION: { label: "Configuración", badge: "bg-teal-100 text-teal-700",   Icon: Wrench },
  MANUAL_REVIEW: { label: "Revisión manual", badge: "bg-orange-100 text-orange-700", Icon: ClipboardList },
  SECURITY:      { label: "Seguridad",     badge: "bg-red-100 text-red-700",     Icon: Lock },
  NONE:          { label: "N/A",           badge: "bg-zinc-100 text-zinc-500",   Icon: Info },
};

const RISK_CONFIG: Record<
  DatabaseRemediationRisk,
  { label: string; badge: string }
> = {
  LOW:      { label: "Bajo",     badge: "bg-green-100 text-green-700" },
  MEDIUM:   { label: "Medio",    badge: "bg-amber-100 text-amber-700" },
  HIGH:     { label: "Alto",     badge: "bg-red-100 text-red-700" },
  CRITICAL: { label: "Crítico",  badge: "bg-red-200 text-red-800 font-bold" },
};

const REM_STATUS_CONFIG: Record<
  DatabaseRemediationStatus,
  { label: string; badge: string }
> = {
  RECOMMENDED:    { label: "Recomendado",   badge: "bg-indigo-100 text-indigo-700" },
  OPTIONAL:       { label: "Opcional",      badge: "bg-zinc-100 text-zinc-500" },
  DEFERRED:       { label: "Diferido",      badge: "bg-slate-100 text-slate-500" },
  BLOCKED:        { label: "Bloqueado",     badge: "bg-red-100 text-red-700" },
  NOT_APPLICABLE: { label: "No aplica",     badge: "bg-zinc-50 text-zinc-400" },
};

const PLAN_STATUS_CONFIG: Record<
  DatabaseRemediationPlanStatus,
  { label: string; bg: string; textColor: string; Icon: React.ElementType }
> = {
  NO_ACTION_NEEDED:          { label: "Sin acciones pendientes",          bg: "bg-green-50 border-green-100", textColor: "text-green-700",  Icon: CheckCircle2 },
  ACTIONS_RECOMMENDED:       { label: "Hay acciones recomendadas",        bg: "bg-amber-50 border-amber-100", textColor: "text-amber-700",  Icon: ClipboardList },
  CRITICAL_ACTIONS_REQUIRED: { label: "Acciones críticas requeridas",     bg: "bg-red-50 border-red-100",     textColor: "text-red-700",    Icon: ShieldAlert },
};

// ── Componente ────────────────────────────────────────────────────

export function PlatformDatabaseProfilePreflightModal({
  profileId,
  profileLabel,
  environment,
  onClose,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [result,      setResult]      = useState<DatabasePreflightResult | null>(null);
  const [tenantIdUsed, setTenantIdUsed] = useState<string | null>(null);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [expanded,    setExpanded]      = useState<Set<string>>(new Set());
  const [planOpen,    setPlanOpen]      = useState(true);

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

  const isProduction = environment === "PRODUCTION";
  const remediationPlan = useMemo(
    () => (result ? buildDatabaseRemediationPlan(result, { isProductionEnvironment: isProduction }) : null),
    [result, isProduction],
  );

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

              {/* Plan recomendado — C5 + D0 safety hints + D1A seed runner */}
              {remediationPlan && (
                <RemediationPlanSection
                  plan={remediationPlan}
                  profileId={profileId}
                  environment={environment}
                  targetType={result.targetType}
                  isOpen={planOpen}
                  onToggle={() => setPlanOpen((v) => !v)}
                />
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
}

// ── Sección Plan recomendado ──────────────────────────────────────

import type { DatabaseRemediationPlan } from "../types/platform.types";

interface RemediationPlanSectionProps {
  plan:         DatabaseRemediationPlan;
  profileId:    string;
  isOpen:       boolean;
  onToggle:     () => void;
  environment?: PlatformDatabaseProfileEnvironment;
  targetType?:  DatabasePreflightTargetType;
}

function RemediationPlanSection({
  plan,
  profileId,
  isOpen,
  onToggle,
  environment,
  targetType,
}: RemediationPlanSectionProps) {
  const planConfig = PLAN_STATUS_CONFIG[plan.status];

  return (
    <div className="border border-zinc-100 rounded-xl overflow-hidden">

      {/* Cabecera colapsable */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
      >
        <ClipboardList size={14} className="text-indigo-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-zinc-700 flex-1">Plan recomendado</span>
        <span className="text-[10px] text-zinc-400 italic mr-2">Solo lectura — no ejecuta acciones</span>
        {isOpen
          ? <ChevronDown  size={13} className="text-zinc-400 flex-shrink-0" />
          : <ChevronRight size={13} className="text-zinc-400 flex-shrink-0" />}
      </button>

      {isOpen && (
        <div className="p-4 space-y-4">

          {/* Banner de estado del plan */}
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${planConfig.bg}`}>
            <planConfig.Icon size={15} className={`${planConfig.textColor} flex-shrink-0`} />
            <span className={`text-sm font-semibold ${planConfig.textColor}`}>{planConfig.label}</span>
          </div>

          {/* Resumen por tipo */}
          {(plan.summary.seeds > 0 || plan.summary.migrations > 0 ||
            plan.summary.configurations > 0 || plan.summary.manualReviews > 0 ||
            plan.summary.highRisk > 0) && (
            <div className="flex flex-wrap gap-2">
              {plan.summary.seeds > 0 && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                  <Layers size={10} /> {plan.summary.seeds} seed{plan.summary.seeds !== 1 ? "s" : ""}
                </span>
              )}
              {plan.summary.migrations > 0 && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
                  <ArrowRightLeft size={10} /> {plan.summary.migrations} migración{plan.summary.migrations !== 1 ? "es" : ""}
                </span>
              )}
              {plan.summary.configurations > 0 && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-teal-50 text-teal-700 border border-teal-100">
                  <Wrench size={10} /> {plan.summary.configurations} configuración{plan.summary.configurations !== 1 ? "es" : ""}
                </span>
              )}
              {plan.summary.manualReviews > 0 && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-100">
                  <ClipboardList size={10} /> {plan.summary.manualReviews} revisión{plan.summary.manualReviews !== 1 ? "es" : ""} manual{plan.summary.manualReviews !== 1 ? "es" : ""}
                </span>
              )}
              {plan.summary.highRisk > 0 && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-100">
                  <ShieldAlert size={10} /> {plan.summary.highRisk} de alto riesgo
                </span>
              )}
            </div>
          )}

          {/* Lista de items */}
          {plan.items.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-3">
              No hay acciones pendientes para esta base.
            </p>
          ) : (
            <div className="space-y-2">
              {plan.items.map((item) => (
                <RemediationItemRow
                  key={item.code}
                  item={item}
                  profileId={profileId}
                  environment={environment}
                  targetType={targetType}
                />
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Fila de item del plan ─────────────────────────────────────────

interface RemediationItemRowProps {
  item:         DatabaseRemediationItem;
  profileId:    string;
  environment?: PlatformDatabaseProfileEnvironment;
  targetType?:  DatabasePreflightTargetType;
}

function RemediationItemRow({ item, profileId, environment, targetType }: RemediationItemRowProps) {
  const [open, setOpen] = useState(false);
  const actionCfg  = ACTION_TYPE_CONFIG[item.actionType];
  const riskCfg    = RISK_CONFIG[item.risk];
  const statusCfg  = REM_STATUS_CONFIG[item.status];
  const ActionIcon = actionCfg.Icon;

  const isNotApplicable = item.status === "NOT_APPLICABLE";
  const isDeferred      = item.status === "DEFERRED";
  const isBlocked       = item.status === "BLOCKED";

  // D0 safety preview — solo cuando hay ambiente y target conocidos
  const d0Safety =
    environment && targetType && item.actionType !== "NONE"
      ? getExecutionSafetyPreview(item.risk, environment, targetType)
      : null;

  return (
    <div className={`rounded-lg border ${isNotApplicable ? "border-zinc-100 bg-zinc-50 opacity-60" : isDeferred ? "border-slate-100 bg-slate-50" : isBlocked ? "border-red-100 bg-red-50" : "border-zinc-200 bg-white"}`}>

      {/* Cabecera del item */}
      <div
        className={`flex items-center gap-2 px-3 py-2 ${item.actionType !== "NONE" ? "cursor-pointer" : ""}`}
        onClick={item.actionType !== "NONE" ? () => setOpen((v) => !v) : undefined}
      >
        <ActionIcon size={12} className={`flex-shrink-0 ${isNotApplicable ? "text-zinc-300" : "text-zinc-500"}`} />

        <span className={`text-xs font-medium flex-1 min-w-0 ${isNotApplicable ? "text-zinc-400" : "text-zinc-700"}`}>
          {item.title}
        </span>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${actionCfg.badge}`}>
            {actionCfg.label}
          </span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${riskCfg.badge}`}>
            {riskCfg.label}
          </span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.badge}`}>
            {statusCfg.label}
          </span>
        </div>

        {item.requiresBackup && (
          <span title="Requiere backup previo">
            <HardDrive size={11} className="text-amber-500 flex-shrink-0" />
          </span>
        )}

        {item.actionType !== "NONE" && (
          open
            ? <ChevronDown  size={11} className="text-zinc-400 flex-shrink-0" />
            : <ChevronRight size={11} className="text-zinc-400 flex-shrink-0" />
        )}
      </div>

      {/* Detalle expandido */}
      {open && item.actionType !== "NONE" && (
        <div className="px-3 pb-3 pt-0 pl-8 space-y-1.5 border-t border-zinc-100">
          <p className="text-xs text-zinc-600 pt-2">{item.description}</p>

          <div className="flex flex-wrap gap-2 pt-0.5">
            {item.canBeAutomatedLater && (
              <span className="text-[10px] text-zinc-400">Automatizable en D1/S1</span>
            )}
            {item.requiresConfirmation && (
              <span className="text-[10px] text-amber-600">Requiere confirmación</span>
            )}
            {item.requiresBackup && (
              <span className="text-[10px] text-amber-600">Requiere backup</span>
            )}
          </div>

          {item.notes && item.notes.length > 0 && (
            <ul className="space-y-0.5 pt-0.5">
              {item.notes.map((note, i) => (
                <li key={i} className="text-[10px] text-zinc-400 flex items-start gap-1">
                  <span className="text-zinc-300 mt-0.5">›</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}

          {/* D0 Safety Gate — requisitos de ejecución futura */}
          {d0Safety && (
            <div className="mt-2 pt-2 border-t border-zinc-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck size={10} className="text-indigo-400 flex-shrink-0" />
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                  D0 Safety Gate
                </span>
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ml-auto ${
                    d0Safety.isBlockedNow
                      ? "bg-red-100 text-red-700"
                      : d0Safety.requiresConfirmation
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                  }`}
                >
                  {d0Safety.statusLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d0Safety.isBlockedNow && (
                  <span className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                    <Ban size={9} />
                    Producción bloqueado en D0
                  </span>
                )}
                {!d0Safety.isBlockedNow && d0Safety.requiresConfirmation && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                    <MessageSquareWarning size={9} />
                    Requiere confirmación textual
                  </span>
                )}
                {!d0Safety.isBlockedNow && d0Safety.requiresBackup && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                    <HardDrive size={9} />
                    Requiere backup confirmado
                  </span>
                )}
                {!d0Safety.isBlockedNow && d0Safety.requiresDryRunFirst && (
                  <span className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                    <FlaskConical size={9} />
                    Requiere dry-run previo
                  </span>
                )}
              </div>
            </div>
          )}

          {/* D1A Seed Runner — solo para catálogos DTE y entornos no-producción */}
          {item.sourceCheckCode === "GLOBAL_DTE_CATALOG_ITEMS" &&
            environment !== "PRODUCTION" &&
            (targetType === "CLIENT_RUNTIME" || targetType === "DEMO") && (
            <DteCatalogSeedRunner
              profileId={profileId}
              environment={environment}
              targetType={targetType}
            />
          )}

          {/* D1B Runner — solo para TenantFiscalConfig y entornos no-producción */}
          {item.sourceCheckCode === "TENANT_FISCAL_CONFIG" &&
            environment !== "PRODUCTION" &&
            (targetType === "CLIENT_RUNTIME" || targetType === "DEMO") && (
            <TenantFiscalConfigSeedRunner
              profileId={profileId}
              environment={environment}
              targetType={targetType}
            />
          )}

          {item.sourceCheckCode && (
            <p className="text-[9px] text-zinc-300 font-mono pt-0.5">check: {item.sourceCheckCode}</p>
          )}
        </div>
      )}

    </div>
  );
}

// ── D1A: Seed Runner para DTE Catalog Items ───────────────────────
//
// Renderiza solo cuando item.sourceCheckCode === "GLOBAL_DTE_CATALOG_ITEMS"
// y el entorno no es PRODUCTION. Nunca muestra password ni DATABASE_URL.

interface DteCatalogSeedRunnerProps {
  profileId:    string;
  environment?: PlatformDatabaseProfileEnvironment;
  targetType?:  DatabasePreflightTargetType;
}

function DteCatalogSeedRunner({
  profileId,
  environment,
  targetType,
}: DteCatalogSeedRunnerProps) {
  const [isPending, startTransition] = useTransition();
  const [currentOp,    setCurrentOp]    = useState<"none" | "dry_run" | "execute">("none");
  const [dryRunResult, setDryRunResult] = useState<DteCatalogItemsSeedDryRunResult | null>(null);
  const [seedResult,   setSeedResult]   = useState<DteCatalogItemsSeedResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [confirmText,  setConfirmText]  = useState("");
  const [phase,        setPhase]        = useState<"idle" | "dry_run_done" | "executed">("idle");

  // Determinar si el ambiente requiere confirmación textual
  const needsConfirmation =
    environment && targetType
      ? getExecutionSafetyPreview("LOW", environment, targetType).requiresConfirmation
      : true;

  function handleDryRun() {
    setDryRunResult(null);
    setSeedResult(null);
    setError(null);
    setPhase("idle");
    setCurrentOp("dry_run");
    startTransition(async () => {
      const res = await runDatabaseProfileDteCatalogSeedAction({
        profileId,
        mode: "DRY_RUN",
      });
      setCurrentOp("none");
      if (!res.success) {
        setError(res.error);
      } else {
        setDryRunResult(res.dryRunResult ?? null);
        setPhase("dry_run_done");
      }
    });
  }

  function handleExecute() {
    setError(null);
    setCurrentOp("execute");
    startTransition(async () => {
      const res = await runDatabaseProfileDteCatalogSeedAction({
        profileId,
        mode: "EXECUTE",
        confirmationText: needsConfirmation ? confirmText : undefined,
      });
      setCurrentOp("none");
      if (!res.success) {
        setError(res.error);
      } else {
        setSeedResult(res.seedResult ?? null);
        setPhase("executed");
      }
    });
  }

  const canExecute =
    phase === "dry_run_done" &&
    !isPending &&
    (!needsConfirmation || confirmText.trim() === DTE_SEED_CONFIRM_TEXT);

  return (
    <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2.5">

      {/* Cabecera de la sección */}
      <div className="flex items-center gap-1.5">
        <FlaskConical size={11} className="text-indigo-400 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
          D1A — Seed Runner
        </span>
        <span className="text-[9px] text-zinc-400 ml-1 italic">
          Solo escribe en dte_catalog_items
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
          <XCircle size={11} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 leading-snug">{error}</p>
        </div>
      )}

      {/* Resultado dry-run */}
      {dryRunResult && phase === "dry_run_done" && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-blue-700">Dry-run completado — sin escrituras</p>
          {dryRunResult.missingCatalogs.length === 0 ? (
            <p className="text-[10px] text-blue-600">
              Todos los catálogos requeridos ya están presentes. El seed no creará nuevos registros.
            </p>
          ) : (
            <p className="text-[10px] text-blue-600">
              Faltan: <span className="font-mono font-semibold">{dryRunResult.missingCatalogs.join(", ")}</span>
              {" "}— {dryRunResult.itemsToCreate} item{dryRunResult.itemsToCreate !== 1 ? "s" : ""} a crear.
            </p>
          )}
          <p className="text-[10px] text-blue-500">
            Total seed: {dryRunResult.totalExpected} items · Catálogos OK: {dryRunResult.existingCatalogsCount} / 7
          </p>
        </div>
      )}

      {/* Resultado ejecución real */}
      {seedResult && phase === "executed" && (
        <div className="bg-green-50 border border-green-100 rounded-lg px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />
            <p className="text-[11px] font-semibold text-green-700">Seed ejecutado</p>
          </div>
          <p className="text-[10px] text-green-600">
            Creados: <span className="font-semibold">{seedResult.created}</span>
            {" · "}Actualizados: <span className="font-semibold">{seedResult.updated}</span>
            {" · "}Total activos: <span className="font-semibold">{seedResult.totalAfter}</span>
          </p>
        </div>
      )}

      {/* Confirmación textual (solo si el ambiente lo requiere y dry-run está listo) */}
      {phase === "dry_run_done" && needsConfirmation && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500">
            Escribe{" "}
            <span className="font-mono font-bold text-zinc-700">{DTE_SEED_CONFIRM_TEXT}</span>
            {" "}para confirmar:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={DTE_SEED_CONFIRM_TEXT}
            disabled={isPending}
            className="w-full text-[11px] border border-zinc-200 rounded px-2 py-1.5
                       font-mono focus:outline-none focus:ring-1 focus:ring-indigo-300
                       disabled:opacity-50 bg-white"
          />
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleDryRun}
          disabled={isPending}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
                     bg-indigo-50 text-indigo-700 border border-indigo-200
                     hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          {isPending && currentOp === "dry_run"
            ? <Loader2 size={10} className="animate-spin" />
            : <FlaskConical size={10} />}
          {phase === "dry_run_done" || phase === "executed" ? "Re-ejecutar dry-run" : "Dry-run"}
        </button>

        {phase === "dry_run_done" && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={!canExecute}
            title={
              needsConfirmation && confirmText.trim() !== DTE_SEED_CONFIRM_TEXT
                ? `Escribe "${DTE_SEED_CONFIRM_TEXT}" para habilitar`
                : undefined
            }
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
                       bg-emerald-600 text-white hover:bg-emerald-700
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending && currentOp === "execute"
              ? <Loader2 size={10} className="animate-spin" />
              : <Play size={10} />}
            Ejecutar seed
          </button>
        )}

        {phase === "executed" && (
          <span className="text-[10px] text-green-600 flex items-center gap-1">
            <CheckCircle2 size={10} />
            Completado — ejecutar dry-run para verificar
          </span>
        )}
      </div>

      <p className="text-[9px] text-zinc-300 italic leading-snug">
        Esta acción escribe únicamente en dte_catalog_items. No elimina datos. No ejecuta migraciones.
        No toca otras tablas. Seguro de re-ejecutar.
      </p>

    </div>
  );
}

// ── D1B: Runner para TenantFiscalConfig ──────────────────────────
//
// Renderiza solo cuando item.sourceCheckCode === "TENANT_FISCAL_CONFIG"
// y el entorno no es PRODUCTION. Nunca muestra password ni DATABASE_URL.

interface TenantFiscalConfigSeedRunnerProps {
  profileId:    string;
  environment?: PlatformDatabaseProfileEnvironment;
  targetType?:  DatabasePreflightTargetType;
}

function TenantFiscalConfigSeedRunner({
  profileId,
  environment,
  targetType,
}: TenantFiscalConfigSeedRunnerProps) {
  const [isPending,    startTransition] = useTransition();
  const [currentOp,   setCurrentOp]    = useState<"none" | "dry_run" | "execute">("none");
  const [dryRunResult, setDryRunResult] = useState<TenantFiscalConfigDryRunResult | null>(null);
  const [seedResult,   setSeedResult]   = useState<TenantFiscalConfigSeedResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [confirmText,  setConfirmText]  = useState("");
  const [phase,        setPhase]        = useState<"idle" | "dry_run_done" | "executed">("idle");

  // CREATE_TENANT_FISCAL_CONFIG es riesgo MEDIUM → CONFIRMATION_REQUIRED en LOCAL/SANDBOX/TEST
  const needsConfirmation =
    environment && targetType
      ? getExecutionSafetyPreview("MEDIUM", environment, targetType).requiresConfirmation
      : true;

  function handleDryRun() {
    setDryRunResult(null);
    setSeedResult(null);
    setError(null);
    setPhase("idle");
    setCurrentOp("dry_run");
    startTransition(async () => {
      const res = await runDatabaseProfileTenantFiscalConfigAction({
        profileId,
        mode: "DRY_RUN",
      });
      setCurrentOp("none");
      if (!res.success) {
        setError(res.error);
      } else {
        setDryRunResult(res.dryRunResult ?? null);
        setPhase("dry_run_done");
      }
    });
  }

  function handleExecute() {
    setError(null);
    setCurrentOp("execute");
    startTransition(async () => {
      const res = await runDatabaseProfileTenantFiscalConfigAction({
        profileId,
        mode:             "EXECUTE",
        confirmationText: needsConfirmation ? confirmText : undefined,
      });
      setCurrentOp("none");
      if (!res.success) {
        setError(res.error);
      } else {
        setSeedResult(res.seedResult ?? null);
        setPhase("executed");
      }
    });
  }

  // Solo habilitar execute si: dry-run completado, no pendiente,
  // confirmación correcta (cuando aplica), y dry-run no requiere revisión manual
  const dryRunRequiresManualReview = dryRunResult?.manualReviewRequired ?? false;
  const canExecute =
    phase === "dry_run_done" &&
    !isPending &&
    !dryRunRequiresManualReview &&
    (!needsConfirmation || confirmText.trim() === TENANT_FISCAL_CONFIG_CONFIRM_TEXT);

  return (
    <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2.5">

      {/* Cabecera de la sección */}
      <div className="flex items-center gap-1.5">
        <FlaskConical size={11} className="text-teal-400 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
          D1B — Config Fiscal Runner
        </span>
        <span className="text-[9px] text-zinc-400 ml-1 italic">
          Solo escribe en tenant_fiscal_config
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
          <XCircle size={11} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 leading-snug">{error}</p>
        </div>
      )}

      {/* Resultado dry-run */}
      {dryRunResult && phase === "dry_run_done" && (
        <div className={`border rounded-lg px-2.5 py-2 space-y-1 ${
          dryRunRequiresManualReview
            ? "bg-amber-50 border-amber-100"
            : "bg-blue-50 border-blue-100"
        }`}>
          <p className={`text-[11px] font-semibold ${dryRunRequiresManualReview ? "text-amber-700" : "text-blue-700"}`}>
            Dry-run completado — sin escrituras
          </p>

          {dryRunRequiresManualReview ? (
            <p className="text-[10px] text-amber-600">
              Revisión manual requerida: {dryRunResult.manualReviewReason}
            </p>
          ) : dryRunResult.existingConfigFound ? (
            <p className="text-[10px] text-blue-600">
              Ya existe TenantFiscalConfig para este tenant
              {dryRunResult.tenantName && ` (${dryRunResult.tenantName})`}.
              La ejecución real no hará cambios (idempotente).
            </p>
          ) : (
            <p className="text-[10px] text-blue-600">
              No existe configuración fiscal para
              {dryRunResult.tenantName ? ` ${dryRunResult.tenantName}` : " este tenant"}.
              Se creará con valores por defecto seguros:
              {" "}is_retention_agent = false, threshold = null.
            </p>
          )}

          {dryRunResult.warnings.length > 0 && (
            <ul className="space-y-0.5">
              {dryRunResult.warnings.map((w, i) => (
                <li key={i} className="text-[10px] text-amber-600 flex items-start gap-1">
                  <span className="text-amber-400 mt-0.5">›</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Resultado ejecución real */}
      {seedResult && phase === "executed" && (
        <div className="bg-green-50 border border-green-100 rounded-lg px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />
            <p className="text-[11px] font-semibold text-green-700">
              {seedResult.created ? "Configuración fiscal creada" : "Configuración fiscal ya existía — sin cambios"}
            </p>
          </div>
          <p className="text-[10px] text-green-600">
            {seedResult.created
              ? `Registro creado — ID: ${seedResult.configId}`
              : "El registro ya existía y no fue modificado (idempotente)."}
          </p>
        </div>
      )}

      {/* Confirmación textual (solo si aplica y dry-run está listo sin revisión manual) */}
      {phase === "dry_run_done" && needsConfirmation && !dryRunRequiresManualReview && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500">
            Escribe{" "}
            <span className="font-mono font-bold text-zinc-700">{TENANT_FISCAL_CONFIG_CONFIRM_TEXT}</span>
            {" "}para confirmar:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={TENANT_FISCAL_CONFIG_CONFIRM_TEXT}
            disabled={isPending}
            className="w-full text-[11px] border border-zinc-200 rounded px-2 py-1.5
                       font-mono focus:outline-none focus:ring-1 focus:ring-teal-300
                       disabled:opacity-50 bg-white"
          />
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleDryRun}
          disabled={isPending}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
                     bg-teal-50 text-teal-700 border border-teal-200
                     hover:bg-teal-100 transition-colors disabled:opacity-50"
        >
          {isPending && currentOp === "dry_run"
            ? <Loader2 size={10} className="animate-spin" />
            : <FlaskConical size={10} />}
          {phase === "dry_run_done" || phase === "executed" ? "Re-ejecutar dry-run" : "Dry-run"}
        </button>

        {phase === "dry_run_done" && !dryRunRequiresManualReview && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={!canExecute}
            title={
              needsConfirmation && confirmText.trim() !== TENANT_FISCAL_CONFIG_CONFIRM_TEXT
                ? `Escribe "${TENANT_FISCAL_CONFIG_CONFIRM_TEXT}" para habilitar`
                : undefined
            }
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
                       bg-emerald-600 text-white hover:bg-emerald-700
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending && currentOp === "execute"
              ? <Loader2 size={10} className="animate-spin" />
              : <Play size={10} />}
            Crear configuración fiscal
          </button>
        )}

        {phase === "executed" && (
          <span className="text-[10px] text-green-600 flex items-center gap-1">
            <CheckCircle2 size={10} />
            Completado — ejecutar dry-run para verificar
          </span>
        )}
      </div>

      <p className="text-[9px] text-zinc-300 italic leading-snug">
        Esta acción escribe únicamente en tenant_fiscal_config. No modifica ventas, DTE, productos ni clientes.
        No ejecuta migraciones. Seguro de re-ejecutar.
      </p>

    </div>
  );
}
