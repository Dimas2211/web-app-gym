"use client";

import { DTE_TYPE_CATALOG } from "../utils/dte-type-labels";

interface Props {
  primaryDteTypeCode: "01" | "03";
  onChange:           (code: "01" | "03") => void;
  /** F3-C21C — FEX 11 no se opera aquí: seleccionarlo navega al portal especializado. */
  onSelectFex11?:     () => void;
  fex11Enabled?:      boolean;
}

const ACTIVE_CODES     = ["01", "03"] as const;
const NEXT_PHASE_CODES = ["04", "05", "06", "14", "15"] as const;
const SPECIAL_CODES    = ["07", "08", "09"] as const;

const DTE_STATUS_ROWS = [
  { label: "DTE",         value: "No generado" },
  { label: "JSON",        value: "Pendiente"   },
  { label: "Firma",       value: "Pendiente"   },
  { label: "Transmisión", value: "Pendiente"   },
  { label: "PDF",         value: "Pendiente"   },
  { label: "Email",       value: "Pendiente"   },
];

const selectCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500 w-full cursor-pointer";

const pillCls =
  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-600 border border-zinc-700/60";

function isActiveCode(value: string): value is "01" | "03" {
  return value === "01" || value === "03";
}

export function SaleDteSection({ primaryDteTypeCode, onChange, onSelectFex11, fex11Enabled }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === "11") {
      onSelectFex11?.();
      return;
    }
    if (isActiveCode(v)) {
      onChange(v);
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Tipo DTE principal
      </span>

      {/* Selector compacto */}
      <div>
        <select
          value={primaryDteTypeCode}
          onChange={handleChange}
          className={selectCls}
        >
          <optgroup label="Activos">
            {ACTIVE_CODES.map((code) => (
              <option key={code} value={code}>
                {code} — {DTE_TYPE_CATALOG[code].label} ({DTE_TYPE_CATALOG[code].short})
              </option>
            ))}
          </optgroup>

          <optgroup label="Exportación">
            <option value="11" disabled={!fex11Enabled}>
              11 — Factura de Exportación (FEX){fex11Enabled ? " · abre portal especializado" : " · deshabilitado"}
            </option>
          </optgroup>

          <optgroup label="Próximas fases">
            {NEXT_PHASE_CODES.map((code) => (
              <option key={code} value={code} disabled>
                {code} — {DTE_TYPE_CATALOG[code].label} ({DTE_TYPE_CATALOG[code].short})
              </option>
            ))}
          </optgroup>

          <optgroup label="Documentos especiales">
            {SPECIAL_CODES.map((code) => (
              <option key={code} value={code} disabled>
                {code} — {DTE_TYPE_CATALOG[code].label} ({DTE_TYPE_CATALOG[code].short})
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Nota informativa */}
      <p className="text-[9px] text-zinc-600 leading-snug">
        FE 01 y CCFE 03 se operan aquí. FEX 11 se opera en el portal especializado de exportación
        ({fex11Enabled ? "habilitado en TEST" : "deshabilitado"}). Los demás tipos se habilitarán por fases.
      </p>

      {/* Estado DTE */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-zinc-800 pt-1.5">
        {DTE_STATUS_ROWS.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600">{label}:</span>
            <span className={pillCls}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
