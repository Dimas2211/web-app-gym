"use client";

interface Props {
  primaryDteTypeCode: "01" | "03";
  onChange:           (code: "01" | "03") => void;
}

const DTE_OPTIONS: { code: "01" | "03"; label: string }[] = [
  { code: "01", label: "Factura Electrónica (FE)" },
  { code: "03", label: "Comprobante de Crédito Fiscal (CCFE)" },
];

const DTE_STATUS_ROWS = [
  { label: "DTE",         value: "No generado" },
  { label: "JSON",        value: "Pendiente"   },
  { label: "Firma",       value: "Pendiente"   },
  { label: "Transmisión", value: "Pendiente"   },
  { label: "PDF",         value: "Pendiente"   },
  { label: "Email",       value: "Pendiente"   },
];

const pillCls =
  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-600 border border-zinc-700/60";

export function SaleDteSection({ primaryDteTypeCode, onChange }: Props) {
  return (
    <div className="p-3 flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Tipo DTE principal
      </span>

      <div className="flex flex-col gap-1.5">
        {DTE_OPTIONS.map((opt) => (
          <label key={opt.code} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="primary_dte_type_code"
              value={opt.code}
              checked={primaryDteTypeCode === opt.code}
              onChange={() => onChange(opt.code)}
              className="accent-zinc-500"
            />
            <span className={`text-xs ${primaryDteTypeCode === opt.code ? "text-zinc-100" : "text-zinc-500"}`}>
              <span className="font-mono">{opt.code}</span> — {opt.label}
            </span>
          </label>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 leading-snug">
        Tipo DTE esperado para esta venta. El documento fiscal real se generará después.
      </p>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {DTE_STATUS_ROWS.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600">{label}:</span>
            <span className={pillCls}>{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mt-0.5">
        {[
          { code: "05", short: "NCE" },
          { code: "06", short: "NDE" },
          { code: "Inv", short: "Invalidación" },
        ].map(({ code, short }) => (
          <span
            key={code}
            className="text-[9px] text-zinc-700 border border-zinc-800 rounded px-1.5 py-0.5"
          >
            {code} {short} — Fase posterior
          </span>
        ))}
      </div>
    </div>
  );
}
