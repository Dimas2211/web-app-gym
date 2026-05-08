"use client";

import { ArrowLeft, Save, RotateCcw, X, Loader2, Maximize2, Minimize2 } from "lucide-react";

interface Props {
  saleCode:             string | null;
  saleDate:             string;
  onSaleDateChange:     (d: string) => void;
  isSaving:             boolean;
  hasDraft:             boolean;
  onSave:               () => void;
  onBack:               () => void;
  onClear:              () => void;
  onCancel:             () => void;
  locationName?:        string;
  errorMessage:         string | null;
  successMessage:       string | null;
  isCaptureMode?:       boolean;
  onToggleCaptureMode?: () => void;
}

const inputCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500";
const labelCls = "text-[10px] text-zinc-500 block mb-0.5";

export function SaleHeaderCard({
  saleCode,
  saleDate,
  onSaleDateChange,
  isSaving,
  hasDraft,
  onSave,
  onBack,
  onClear,
  onCancel,
  locationName,
  errorMessage,
  successMessage,
  isCaptureMode,
  onToggleCaptureMode,
}: Props) {
  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2">

      {errorMessage && (
        <div className="mb-1.5 text-[11px] text-red-400 bg-red-900/30 border border-red-700/30 rounded px-2 py-1">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mb-1.5 text-[11px] text-emerald-400 bg-emerald-900/30 border border-emerald-700/30 rounded px-2 py-1">
          {successMessage}
        </div>
      )}

      <div className="flex items-end gap-3 flex-wrap">

        {/* Código */}
        <div>
          <label className={labelCls}>Código venta</label>
          <span className="inline-flex items-center h-7 px-2 text-xs font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded">
            {saleCode ?? "VTA-NUEVO"}
          </span>
        </div>

        {/* Estado */}
        <div>
          <label className={labelCls}>Estado</label>
          <span className="inline-flex items-center h-7 px-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded">
            DRAFT
          </span>
        </div>

        {/* Fecha */}
        <div>
          <label className={labelCls}>
            Fecha de venta <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => onSaleDateChange(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Sucursal */}
        {locationName && (
          <div>
            <label className={labelCls}>Sucursal</label>
            <span className="inline-flex items-center h-7 px-2 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded">
              {locationName}
            </span>
          </div>
        )}

        {/* Botones — al extremo derecho */}
        <div className="flex items-end gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onBack}
            className="h-7 px-2.5 flex items-center gap-1 text-xs text-zinc-400 border border-zinc-700 rounded hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Volver
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !saleDate}
            className="h-7 px-2.5 flex items-center gap-1 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded disabled:opacity-40 transition-colors"
          >
            {isSaving
              ? <><Loader2 className="h-3 w-3 animate-spin" />Guardando…</>
              : <><Save className="h-3 w-3" />{hasDraft ? "Actualizar" : "Guardar borrador"}</>
            }
          </button>

          <button
            type="button"
            onClick={onClear}
            className="h-7 px-2.5 flex items-center gap-1 text-xs text-zinc-400 border border-zinc-700 rounded hover:text-amber-400 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Limpiar
          </button>

          {onToggleCaptureMode && (
            <button
              type="button"
              onClick={onToggleCaptureMode}
              title={isCaptureMode ? "Volver al modo normal" : "Activar modo captura (más espacio para líneas)"}
              className={`h-7 px-2.5 flex items-center gap-1 text-xs border rounded transition-colors ${
                isCaptureMode
                  ? "text-sky-400 border-sky-800/60 bg-sky-900/20 hover:bg-sky-900/40"
                  : "text-zinc-400 border-zinc-700 hover:text-sky-400 hover:border-sky-800/60"
              }`}
            >
              {isCaptureMode
                ? <><Minimize2 className="h-3 w-3" />Modo normal</>
                : <><Maximize2 className="h-3 w-3" />Modo captura</>
              }
            </button>
          )}

          {hasDraft && (
            <button
              type="button"
              onClick={onCancel}
              className="h-7 px-2.5 flex items-center gap-1 text-xs text-red-600/70 border border-red-900/40 rounded hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
              Descartar borrador
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
