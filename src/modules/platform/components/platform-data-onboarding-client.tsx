"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-data-onboarding-client.tsx
//
// E1B: Data Onboarding Center — Excel Upload Parser + Preview.
// Permite subir un archivo .xlsx, parsear la hoja "Datos" y ver
// un preview validado por fila con errores y advertencias.
//
// Reglas de seguridad E1B:
// - No escribe datos en bases cliente.
// - No llama actions de escritura.
// - No expone encrypted_password ni DATABASE_URL.
// - El botón "Importar" permanece deshabilitado hasta E1C.
// ─────────────────────────────────────────────────────────────────

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Database,
  Tag,
  Package,
  Users,
  Truck,
  BarChart3,
  FileText,
  Layers,
  List,
  X,
  AlertCircle,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import type {
  DataOnboardingProfileHeader,
  DataOnboardingDatasetDefinition,
  DataOnboardingPreviewActionState,
  DataOnboardingPreviewResult,
  DataOnboardingPreviewRow,
  DataOnboardingDbAwarePreviewResult,
  DataOnboardingDbAwareRow,
  DataOnboardingImportPolicy,
} from "../types/platform.types";
import { importPolicyLabel, ENABLED_IMPORT_POLICIES } from "../lib/data-onboarding/import-policy";
import {
  DATA_ONBOARDING_DATASETS,
  IMPORT_DATASETS,
  EXPORT_DATASETS,
} from "../lib/data-onboarding/data-onboarding-definitions";
import { TEMPLATE_AVAILABLE_KEYS } from "../lib/data-onboarding/excel-template-generator";
import { previewDataOnboardingExcelAction } from "../actions/preview-data-onboarding-excel.action";

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  profile: DataOnboardingProfileHeader;
}

interface DatasetCardProps {
  dataset:   DataOnboardingDatasetDefinition;
  profileId: string;
}

// ── Badge de resolución DB-aware ──────────────────────────────────

function ResolutionBadge({ resolution }: { resolution: DataOnboardingDbAwareRow["resolution"] }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    CREATE: { cls: "bg-green-100 text-green-700",  label: "Crear"     },
    UPDATE: { cls: "bg-sky-100 text-sky-700",      label: "Actualizar" },
    SKIP:   { cls: "bg-zinc-100 text-zinc-500",    label: "Omitir"    },
    ERROR:  { cls: "bg-red-100 text-red-700",      label: "Error"     },
  };
  const { cls, label } = cfg[resolution] ?? cfg.ERROR;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── Panel de análisis DB-aware ────────────────────────────────────

function DbAwarePanel({
  dbAwareResult,
  dbAwareError,
}: {
  dbAwareResult?: DataOnboardingDbAwarePreviewResult;
  dbAwareError?:  string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showAll,  setShowAll]  = useState(false);

  if (dbAwareError) {
    return (
      <div className="mt-3 border border-amber-200 rounded-xl overflow-hidden">
        <div className="flex items-start gap-2 p-3 bg-amber-50">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Análisis contra base no disponible</p>
            <p className="text-[11px] text-amber-600 mt-0.5">{dbAwareError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dbAwareResult) return null;

  const { summary, rows, status, importPolicy } = dbAwareResult;
  const displayRows = showAll ? rows : rows.slice(0, 50);
  const hasMore     = rows.length > 50 && !showAll;

  const statusCfg: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
    READY:               { cls: "bg-green-100 text-green-700",  label: "Listo para importar",       icon: <CheckCircle2 size={11} /> },
    READY_WITH_WARNINGS: { cls: "bg-amber-100 text-amber-700",  label: "Listo con advertencias",    icon: <AlertTriangle size={11} /> },
    BLOCKED:             { cls: "bg-red-100 text-red-700",      label: "Bloqueado — revisar errores", icon: <AlertCircle size={11} /> },
  };
  const { cls: statusCls, label: statusLabel, icon: statusIcon } = statusCfg[status] ?? statusCfg.BLOCKED;

  return (
    <div className="mt-3 border border-indigo-200 rounded-xl overflow-hidden">

      {/* Header del panel */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database size={12} className="text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-700">Análisis contra base destino</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCls}`}>
            {statusIcon}
            {statusLabel}
          </span>
          <span className="text-[10px] text-indigo-400">
            Política: {importPolicyLabel(importPolicy)}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-indigo-300" /> : <ChevronDown size={14} className="text-indigo-300" />}
      </button>

      {expanded && (
        <>
          {/* Resumen DB-aware */}
          <div className="grid grid-cols-3 gap-0 border-b border-indigo-100 bg-white">
            <div className="px-3 py-2 text-center border-r border-indigo-100">
              <p className="text-base font-bold text-green-600">{summary.createRows}</p>
              <p className="text-[10px] text-zinc-400">Crear</p>
            </div>
            <div className="px-3 py-2 text-center border-r border-indigo-100">
              <p className="text-base font-bold text-red-600">{summary.errorRows}</p>
              <p className="text-[10px] text-zinc-400">Errores</p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-base font-bold text-zinc-500">{summary.skipRows}</p>
              <p className="text-[10px] text-zinc-400">Omitidas</p>
            </div>
          </div>

          {/* Métricas adicionales */}
          {(summary.missingDependencies > 0 || summary.duplicatesInDatabase > 0) && (
            <div className="px-3 py-1.5 bg-red-50 border-b border-red-100 flex flex-wrap gap-3">
              {summary.missingDependencies > 0 && (
                <span className="text-[10px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={10} />
                  {summary.missingDependencies} fila(s) con dependencias faltantes
                </span>
              )}
              {summary.duplicatesInDatabase > 0 && (
                <span className="text-[10px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={10} />
                  {summary.duplicatesInDatabase} fila(s) ya existen en la base (CREATE_ONLY)
                </span>
              )}
            </div>
          )}

          {/* Tabla de filas DB-aware */}
          {rows.length > 0 ? (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-indigo-100 bg-indigo-50/50">
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500 w-10">#</th>
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500 w-22">Acción</th>
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500">Llave natural</th>
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500 w-10">En BD</th>
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500">Deps</th>
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500">Problemas</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    const rowBg =
                      row.resolution === "ERROR" ? "bg-red-50/40" :
                      row.resolution === "SKIP"  ? "bg-zinc-50/60" :
                      row.resolution === "UPDATE"? "bg-sky-50/40"  : "";

                    const allIssues = [...row.errors, ...row.warnings];
                    const depsOk    = row.dependencyChecks.filter((d) => d.found).length;
                    const depsFail  = row.dependencyChecks.filter((d) => !d.found).length;

                    return (
                      <tr key={row.rowNumber} className={`border-b border-indigo-50 ${rowBg}`}>
                        <td className="px-2 py-1 text-zinc-400 font-mono">{row.rowNumber}</td>
                        <td className="px-2 py-1"><ResolutionBadge resolution={row.resolution} /></td>
                        <td className="px-2 py-1 text-zinc-700 font-mono max-w-[140px] truncate">{row.naturalKey}</td>
                        <td className="px-2 py-1 text-center">
                          {row.existsInDb
                            ? <span className="text-amber-500 text-[10px] font-semibold">Sí</span>
                            : <span className="text-zinc-300 text-[10px]">No</span>
                          }
                        </td>
                        <td className="px-2 py-1">
                          {row.dependencyChecks.length === 0 ? (
                            <span className="text-zinc-300 text-[10px]">—</span>
                          ) : (
                            <span className={`text-[10px] font-semibold ${depsFail > 0 ? "text-red-600" : "text-green-600"}`}>
                              {depsOk}/{row.dependencyChecks.length}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 max-w-[200px]">
                          {allIssues.length === 0 ? (
                            <span className="text-green-500 text-[10px]">OK</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {allIssues.slice(0, 3).map((issue, idx) => (
                                <li key={idx} className={`text-[10px] leading-tight ${
                                  row.errors.includes(issue as never) ? "text-red-600" : "text-amber-600"
                                }`}>
                                  {issue.field ? <span className="font-mono font-semibold">{issue.field}: </span> : null}
                                  {issue.message}
                                </li>
                              ))}
                              {allIssues.length > 3 && (
                                <li className="text-[10px] text-zinc-400">+{allIssues.length - 3} más…</li>
                              )}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 px-3 py-3 text-center italic">
              Sin filas para analizar.
            </p>
          )}

          {hasMore && (
            <div className="px-3 py-2 border-t border-indigo-100 text-center">
              <button type="button" onClick={() => setShowAll(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline">
                Ver todas las filas ({rows.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Selector de política de importación ──────────────────────────

function ImportPolicySelector({
  value,
  onChange,
}: {
  value:    DataOnboardingImportPolicy;
  onChange: (p: DataOnboardingImportPolicy) => void;
}) {
  const all: DataOnboardingImportPolicy[] = ["CREATE_ONLY", "UPDATE_EXISTING", "UPSERT"];
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Política:</span>
      {all.map((p) => {
        const enabled  = ENABLED_IMPORT_POLICIES.includes(p);
        const selected = value === p;
        return (
          <button
            key={p}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onChange(p)}
            title={enabled ? importPolicyLabel(p) : `${importPolicyLabel(p)} — disponible en E1C`}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              selected && enabled
                ? "border-indigo-400 bg-indigo-100 text-indigo-700 font-semibold"
                : enabled
                  ? "border-zinc-200 bg-white text-zinc-600 hover:border-indigo-200"
                  : "border-zinc-100 bg-zinc-50 text-zinc-300 cursor-not-allowed"
            }`}
          >
            {importPolicyLabel(p)}
            {!enabled && <span className="ml-1 text-[9px] opacity-60">(E1C)</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Badges de estado del perfil ───────────────────────────────────

function EnvBadge({ env }: { env: string }) {
  const cfg: Record<string, string> = {
    LOCAL:      "bg-zinc-100 text-zinc-600",
    SANDBOX:    "bg-amber-100 text-amber-700",
    TEST:       "bg-sky-100 text-sky-700",
    STAGING:    "bg-orange-100 text-orange-700",
    PRODUCTION: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg[env] ?? cfg.LOCAL}`}>
      {env}
    </span>
  );
}

function TestStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    UNTESTED: { cls: "bg-zinc-100 text-zinc-500",   label: "Sin probar" },
    SUCCESS:  { cls: "bg-green-100 text-green-700", label: "Exitosa"    },
    FAILED:   { cls: "bg-red-100 text-red-700",     label: "Fallida"    },
  };
  const { cls, label } = cfg[status] ?? cfg.UNTESTED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Ícono por dataset ─────────────────────────────────────────────

function DatasetIcon({ datasetKey }: { datasetKey: string }) {
  const icons: Record<string, React.ReactNode> = {
    products:          <Package      size={16} />,
    categories:        <Tag          size={16} />,
    lines:             <List         size={16} />,
    sublines:          <Layers       size={16} />,
    customers:         <Users        size={16} />,
    suppliers:         <Truck        size={16} />,
    inventory_initial: <Database     size={16} />,
    units_of_measure:  <CheckCircle2 size={16} />,
    tax_rates:         <FileText     size={16} />,
    sales:             <BarChart3    size={16} />,
    dte_documents:     <FileText     size={16} />,
    dte_catalogs:      <List         size={16} />,
  };
  return <>{icons[datasetKey] ?? <FileSpreadsheet size={16} />}</>;
}

// ── Badges de riesgo ──────────────────────────────────────────────

function RiskBadge({ risk }: { risk: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    LOW:    { cls: "bg-green-100 text-green-700", label: "Riesgo bajo"  },
    MEDIUM: { cls: "bg-amber-100 text-amber-700", label: "Riesgo medio" },
    HIGH:   { cls: "bg-red-100 text-red-700",     label: "Riesgo alto"  },
  };
  const { cls, label } = cfg[risk] ?? cfg.LOW;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Dirección del dataset ─────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === "BOTH") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
        <Upload size={10} /><Download size={10} />
        Importar · Exportar
      </span>
    );
  }
  if (direction === "IMPORT") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-600">
        <Upload size={10} />
        Solo importar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-600">
      <Download size={10} />
      Solo exportar
    </span>
  );
}

// ── Badge de status de preview ────────────────────────────────────

function PreviewStatusBadge({ status }: { status: DataOnboardingPreviewResult["status"] }) {
  if (status === "VALID") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <CheckCircle2 size={11} />
        Archivo válido
      </span>
    );
  }
  if (status === "VALID_WITH_WARNINGS") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        <AlertTriangle size={11} />
        Válido con advertencias
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <AlertCircle size={11} />
      Archivo con errores
    </span>
  );
}

// ── Badge de estado de fila ───────────────────────────────────────

function RowStatusIcon({ status }: { status: DataOnboardingPreviewRow["status"] }) {
  if (status === "VALID")   return <CheckCircle2 size={13} className="text-green-500 shrink-0" />;
  if (status === "WARNING") return <AlertTriangle size={13} className="text-amber-500 shrink-0" />;
  return <AlertCircle size={13} className="text-red-500 shrink-0" />;
}

// ── Columnas clave por dataset (para la tabla de preview) ─────────

const KEY_COLUMNS: Record<string, string[]> = {
  categories:        ["name", "status"],
  lines:             ["name", "category_name"],
  sublines:          ["name", "line_name"],
  products:          ["product_code", "name", "product_type"],
  customers:         ["name", "email", "document_number"],
  suppliers:         ["name", "nit", "email"],
  inventory_initial: ["product_code", "location_name", "quantity"],
};

// ── Panel de preview ──────────────────────────────────────────────

function PreviewPanel({ result, datasetKey }: { result: DataOnboardingPreviewResult; datasetKey: string }) {
  const [expanded, setExpanded] = useState(true);
  const [showAll,  setShowAll]  = useState(false);

  const keyCols     = KEY_COLUMNS[datasetKey] ?? result.columns.slice(0, 3);
  const displayRows = showAll ? result.rows : result.rows.slice(0, 50);
  const hasMore     = result.rows.length > 50 && !showAll;

  return (
    <div className="mt-3 border border-zinc-200 rounded-xl overflow-hidden">

      {/* Header del panel */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-50 hover:bg-zinc-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <PreviewStatusBadge status={result.status} />
          <span className="text-xs text-zinc-500">
            {result.summary.totalRows} filas procesadas
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
      </button>

      {expanded && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-0 border-b border-zinc-100">
            <div className="px-3 py-2 text-center border-r border-zinc-100">
              <p className="text-base font-bold text-zinc-800">{result.summary.totalRows}</p>
              <p className="text-[10px] text-zinc-400">Total</p>
            </div>
            <div className="px-3 py-2 text-center border-r border-zinc-100">
              <p className="text-base font-bold text-green-600">{result.summary.validRows}</p>
              <p className="text-[10px] text-zinc-400">Válidas</p>
            </div>
            <div className="px-3 py-2 text-center border-r border-zinc-100">
              <p className="text-base font-bold text-red-600">{result.summary.invalidRows}</p>
              <p className="text-[10px] text-zinc-400">Con errores</p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-base font-bold text-amber-600">{result.summary.warningRows}</p>
              <p className="text-[10px] text-zinc-400">Advertencias</p>
            </div>
          </div>

          {/* Info adicional */}
          {(result.summary.emptyRowsIgnored > 0 || result.truncated) && (
            <div className="px-3 py-1.5 bg-zinc-50 border-b border-zinc-100 flex flex-wrap gap-2">
              {result.summary.emptyRowsIgnored > 0 && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Info size={10} />
                  {result.summary.emptyRowsIgnored} fila(s) vacías ignoradas
                </span>
              )}
              {result.truncated && (
                <span className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Preview limitado a {result.rows.length} filas. El archivo puede tener más.
                </span>
              )}
            </div>
          )}

          {/* Tabla de filas */}
          {result.rows.length > 0 ? (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500 w-10">#</th>
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500 w-14">Est.</th>
                    {keyCols.map((col) => (
                      <th key={col} className="px-2 py-1.5 text-left font-medium text-zinc-500 font-mono">
                        {col}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left font-medium text-zinc-500">Problemas</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    const rowBg =
                      row.status === "ERROR"   ? "bg-red-50/50"   :
                      row.status === "WARNING" ? "bg-amber-50/50" :
                                                 "";
                    const issues = [...row.errors, ...row.warnings];

                    return (
                      <tr key={row.rowNumber} className={`border-b border-zinc-100 ${rowBg}`}>
                        <td className="px-2 py-1 text-zinc-400 font-mono">{row.rowNumber}</td>
                        <td className="px-2 py-1">
                          <RowStatusIcon status={row.status} />
                        </td>
                        {keyCols.map((col) => (
                          <td key={col} className="px-2 py-1 text-zinc-700 font-mono max-w-[120px] truncate">
                            {row.data[col] != null ? String(row.data[col]) : (
                              <span className="text-zinc-300 italic">—</span>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-zinc-600 max-w-[200px]">
                          {issues.length === 0 ? (
                            <span className="text-green-500 text-[10px]">OK</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {issues.map((issue, idx) => (
                                <li key={idx} className={`text-[10px] leading-tight ${
                                  "code" in issue && row.errors.includes(issue as never)
                                    ? "text-red-600"
                                    : "text-amber-600"
                                }`}>
                                  {issue.field ? <span className="font-mono font-semibold">{issue.field}: </span> : null}
                                  {issue.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 px-3 py-3 text-center italic">
              No hay filas de datos para mostrar.
            </p>
          )}

          {/* Ver más */}
          {hasMore && (
            <div className="px-3 py-2 border-t border-zinc-100 text-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                Ver todas las filas ({result.rows.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Card de un dataset ────────────────────────────────────────────

function DatasetCard({ dataset, profileId }: DatasetCardProps) {
  const canImport   = dataset.direction === "IMPORT" || dataset.direction === "BOTH";
  const canExport   = dataset.direction === "EXPORT" || dataset.direction === "BOTH";
  const hasTemplate = canImport && TEMPLATE_AVAILABLE_KEYS.has(dataset.key);
  const templateUrl = `/dashboard/platform/data-onboarding/${profileId}/templates/${dataset.key}`;

  // ── Estado de upload y política ───────────────────────────────
  const [selectedFile,   setSelectedFile]   = useState<File | null>(null);
  const [previewState,   setPreviewState]   = useState<DataOnboardingPreviewActionState | null>(null);
  const [importPolicy,   setImportPolicy]   = useState<DataOnboardingImportPolicy>("CREATE_ONLY");
  const [isPending,      startTransition]   = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    setPreviewState(null);
    // Limpiar el input para permitir re-seleccionar el mismo archivo
    if (e.target) e.target.value = "";
  }

  function handleClearFile() {
    setSelectedFile(null);
    setPreviewState(null);
  }

  function handleValidate() {
    if (!selectedFile) return;

    const fd = new FormData();
    fd.set("profileId",  profileId);
    fd.set("datasetKey", dataset.key);
    fd.set("file",       selectedFile);

    startTransition(async () => {
      const result = await previewDataOnboardingExcelAction(fd);
      setPreviewState(result);
    });
  }

  const fileSizeLabel = selectedFile
    ? selectedFile.size < 1024
      ? `${selectedFile.size} B`
      : selectedFile.size < 1024 * 1024
        ? `${(selectedFile.size / 1024).toFixed(1)} KB`
        : `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
    : null;

  return (
    <div className="border border-zinc-200 rounded-xl bg-white p-4 flex flex-col gap-3 hover:border-zinc-300 transition-colors">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-zinc-700 font-medium text-sm">
          <span className="text-zinc-400">
            <DatasetIcon datasetKey={dataset.key} />
          </span>
          {dataset.label}
        </div>
        {hasTemplate ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600 whitespace-nowrap">
            <FileSpreadsheet size={10} />
            Plantilla disponible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-500 whitespace-nowrap">
            <Clock size={10} />
            Próximamente
          </span>
        )}
      </div>

      {/* Descripción */}
      <p className="text-xs text-zinc-500 leading-relaxed">
        {dataset.description}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <DirectionBadge direction={dataset.direction} />
        <RiskBadge risk={dataset.risk} />
        {dataset.dependencies.length > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-50 text-zinc-500 border border-zinc-200">
            Requiere: {dataset.dependencies.join(", ")}
          </span>
        )}
      </div>

      {/* Campos requeridos */}
      {dataset.requiredFields.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Campos requeridos
          </p>
          <div className="flex flex-wrap gap-1">
            {dataset.requiredFields.map((f) => (
              <span key={f} className="text-[10px] font-mono px-1 py-0.5 bg-zinc-100 text-zinc-600 rounded">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex gap-2 pt-1 flex-wrap">
        {canImport && (
          <>
            {/* Descargar plantilla */}
            {hasTemplate ? (
              <a
                href={templateUrl}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                           border border-indigo-200 rounded-lg text-indigo-600 bg-indigo-50
                           hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
                title="Descargar plantilla Excel"
              >
                <FileSpreadsheet size={11} />
                Descargar plantilla
              </a>
            ) : (
              <button type="button" disabled
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                           border border-zinc-200 rounded-lg text-zinc-400
                           cursor-not-allowed opacity-60 bg-zinc-50"
                title="Disponible en E1"
              >
                <FileSpreadsheet size={11} />
                Descargar plantilla
              </button>
            )}

            {/* Subir Excel — activo en E1B para datasets con plantilla */}
            {hasTemplate ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label={`Subir Excel para ${dataset.label}`}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                             border border-sky-200 rounded-lg text-sky-600 bg-sky-50
                             hover:bg-sky-100 hover:border-sky-300 transition-colors"
                  title="Seleccionar archivo Excel"
                >
                  <Upload size={11} />
                  Subir Excel
                </button>
              </>
            ) : (
              <button type="button" disabled
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                           border border-zinc-200 rounded-lg text-zinc-400
                           cursor-not-allowed opacity-60 bg-zinc-50"
                title="Disponible en E1B"
              >
                <Upload size={11} />
                Subir Excel
              </button>
            )}

            {/* Importar — siempre deshabilitado hasta E1C */}
            <button type="button" disabled
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                         border border-zinc-200 rounded-lg text-zinc-400
                         cursor-not-allowed opacity-60 bg-zinc-50"
              title="Disponible en E1C — la importación real aún no está habilitada"
            >
              <Database size={11} />
              Importar
            </button>
          </>
        )}

        {/* Exportar — deshabilitado hasta E2 */}
        {canExport && (
          <button type="button" disabled
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                       border border-zinc-200 rounded-lg text-zinc-400
                       cursor-not-allowed opacity-60 bg-zinc-50"
            title="Disponible en E2"
          >
            <Download size={11} />
            Exportar
          </button>
        )}
      </div>

      {/* Selector de política (visible cuando hay plantilla) */}
      {hasTemplate && (
        <ImportPolicySelector value={importPolicy} onChange={setImportPolicy} />
      )}

      {/* Área de archivo seleccionado + validación */}
      {hasTemplate && selectedFile && (
        <div className="border border-sky-200 rounded-lg bg-sky-50 p-2.5 flex flex-col gap-2">
          {/* Info del archivo */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileSpreadsheet size={13} className="text-sky-500 shrink-0" />
              <span className="text-xs text-sky-700 font-medium truncate">{selectedFile.name}</span>
              <span className="text-[10px] text-sky-500 shrink-0">{fileSizeLabel}</span>
            </div>
            <button
              type="button"
              onClick={handleClearFile}
              className="text-sky-400 hover:text-sky-600 shrink-0"
              title="Quitar archivo"
            >
              <X size={12} />
            </button>
          </div>

          {/* Botón validar */}
          <button
            type="button"
            onClick={handleValidate}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5
                       border border-sky-300 rounded-lg text-sky-700 bg-white
                       hover:bg-sky-100 disabled:opacity-60 disabled:cursor-not-allowed
                       transition-colors font-medium"
          >
            {isPending ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Analizando archivo y base destino…
              </>
            ) : (
              <>
                <CheckCircle2 size={11} />
                Validar y analizar contra base
              </>
            )}
          </button>

          {/* Error de la action */}
          {previewState && !previewState.success && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-red-50 border border-red-200">
              <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700 leading-tight">{previewState.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Preview de archivo */}
      {previewState && previewState.success && (
        <PreviewPanel result={previewState.result} datasetKey={dataset.key} />
      )}

      {/* Preview DB-aware */}
      {previewState && previewState.success && (
        <DbAwarePanel
          dbAwareResult={previewState.dbAwareResult}
          dbAwareError={previewState.dbAwareError}
        />
      )}

      {/* Aviso E1B.1 para datasets con plantilla activa */}
      {hasTemplate && (
        <p className="text-[10px] text-indigo-500 border-t border-indigo-50 pt-2">
          Preview activo — E1B.1. Análisis contra base incluido. Importación real disponible en E1C.
        </p>
      )}

      {/* Nota técnica */}
      {dataset.notes && (
        <p className="text-[10px] text-zinc-400 italic border-t border-zinc-100 pt-2">
          {dataset.notes}
        </p>
      )}

    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function PlatformDataOnboardingClient({ profile }: Props) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* Navegación */}
      <div>
        <Link
          href="/dashboard/platform/database-profiles"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Volver a Perfiles de BD
        </Link>
      </div>

      {/* Título */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-800">Data Onboarding Center</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Centro de importación y exportación de datos hacia bases de datos cliente.
        </p>
      </div>

      {/* Banner E1B.1 */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-sky-200 bg-sky-50">
        <Database size={18} className="text-sky-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-sky-800">
            E1B.1 — Import Policy + DB-aware Preview activo
          </p>
          <p className="text-xs text-sky-700 mt-0.5">
            Subir un Excel muestra el preview de archivo más el análisis contra la base destino:
            resolución por fila (Crear / Error / Omitir), dependencias verificadas, duplicados
            detectados. Política activa: <strong>Solo crear nuevos (CREATE_ONLY)</strong>.
            No se escribe nada — la importación real estará disponible en E1C.
          </p>
        </div>
      </div>

      {/* Aviso de seguridad */}
      <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50">
        <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          <span className="font-semibold">E1B.1 — Solo lectura:</span> El análisis consulta la base
          destino pero no escribe nada. El botón "Importar" permanece deshabilitado hasta E1C.
        </p>
      </div>

      {/* Header seguro del perfil */}
      <div className="border border-zinc-200 rounded-xl bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700">Perfil de base de datos destino</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-zinc-400 mb-0.5">Nombre</p>
            <p className="font-medium text-zinc-800">{profile.label}</p>
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Organización</p>
            <p className="font-medium text-zinc-800">
              <span className="text-zinc-500">{profile.organization.code}</span>
              {" — "}
              {profile.organization.name}
            </p>
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Ambiente</p>
            <EnvBadge env={profile.environment} />
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Última conexión</p>
            <div className="flex flex-col gap-0.5">
              <TestStatusBadge status={profile.last_test_status} />
              {profile.last_tested_at && (
                <span className="text-zinc-400 text-[10px]">
                  {new Date(profile.last_tested_at).toLocaleString("es-SV")}
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Host</p>
            <p className="font-mono text-zinc-700">
              {profile.db_host}
              {profile.db_port != null && <span className="text-zinc-400">:{profile.db_port}</span>}
            </p>
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Base de datos</p>
            <p className="font-mono text-zinc-700">{profile.db_name}</p>
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Usuario</p>
            <p className="font-mono text-zinc-700">{profile.db_user}</p>
          </div>
          <div>
            <p className="text-zinc-400 mb-0.5">Estado</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              profile.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
            }`}>
              {profile.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>
      </div>

      {/* Resumen de datasets */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-zinc-200 rounded-xl bg-white p-4 text-center">
          <p className="text-2xl font-bold text-zinc-800">{DATA_ONBOARDING_DATASETS.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Datasets definidos</p>
        </div>
        <div className="border border-zinc-200 rounded-xl bg-white p-4 text-center">
          <p className="text-2xl font-bold text-sky-700">{IMPORT_DATASETS.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Soportan importación</p>
        </div>
        <div className="border border-zinc-200 rounded-xl bg-white p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{EXPORT_DATASETS.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Soportan exportación</p>
        </div>
      </div>

      {/* Catálogo de datasets */}
      <div>
        <h2 className="text-base font-semibold text-zinc-800 mb-4">Datasets disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DATA_ONBOARDING_DATASETS.map((dataset) => (
            <DatasetCard key={dataset.key} dataset={dataset} profileId={profile.id} />
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div className="border border-zinc-200 rounded-xl bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Roadmap de implementación</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-semibold text-zinc-700">E0 · E1A — Cerrados</span>
            </div>
            <ul className="text-zinc-500 space-y-1 pl-4 list-disc">
              <li>Definición de 12 datasets</li>
              <li>Header seguro del perfil</li>
              <li>Generación de plantillas Excel ✓</li>
              <li>Descarga de plantillas .xlsx ✓</li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="font-semibold text-sky-600">E1B · E1B.1 — Activo ahora</span>
            </div>
            <ul className="text-zinc-500 space-y-1 pl-4 list-disc">
              <li>Upload de archivo .xlsx ✓</li>
              <li>Parser de hoja "Datos" ✓</li>
              <li>Validación por fila ✓</li>
              <li>Preview con errores/advertencias ✓</li>
              <li>Política CREATE_ONLY ✓</li>
              <li>Análisis DB-aware por dataset ✓</li>
              <li>Resolución por fila (Crear/Error/Omitir) ✓</li>
              <li>Verificación de dependencias ✓</li>
              <li className="text-zinc-400">Runner de importación (E1C)</li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-300" />
              <span className="font-semibold text-zinc-500">E1C · E2 — Futuro</span>
            </div>
            <ul className="text-zinc-400 space-y-1 pl-4 list-disc">
              <li>Importación real en base cliente</li>
              <li>Exportación de datos existentes</li>
              <li>Historial de importaciones</li>
              <li>Rollback por importación</li>
            </ul>
          </div>

        </div>
      </div>

    </div>
  );
}
