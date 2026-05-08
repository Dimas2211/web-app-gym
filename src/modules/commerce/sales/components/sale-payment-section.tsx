"use client";

import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";

interface Props {
  conditionOperationCode:  "1" | "2" | "3" | null;
  paymentMethodCode:       string | null;
  paymentTermCode:         "01" | "02" | "03" | null;
  paymentTermValue:        number | null;
  catalogCAT016:           DteCatalogItem[];
  catalogCAT017:           DteCatalogItem[];
  catalogCAT018:           DteCatalogItem[];
  onConditionChange:       (v: "1" | "2" | "3" | null) => void;
  onPaymentMethodChange:   (v: string | null) => void;
  onPaymentTermCodeChange: (v: "01" | "02" | "03" | null) => void;
  onPaymentTermValueChange:(v: number | null) => void;
}

const selectCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500 w-full cursor-pointer";
const inputCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-full";
const labelCls = "text-[10px] text-zinc-500 block mb-0.5";

// Fallback cuando el catálogo aún no está poblado
const FALLBACK_CAT016 = [
  { item_code: "1", item_label: "Contado"    },
  { item_code: "2", item_label: "A crédito"  },
  { item_code: "3", item_label: "Otro"       },
];
const FALLBACK_CAT018 = [
  { item_code: "01", item_label: "Días"   },
  { item_code: "02", item_label: "Meses"  },
  { item_code: "03", item_label: "Años"   },
];

export function SalePaymentSection({
  conditionOperationCode,
  paymentMethodCode,
  paymentTermCode,
  paymentTermValue,
  catalogCAT016,
  catalogCAT017,
  catalogCAT018,
  onConditionChange,
  onPaymentMethodChange,
  onPaymentTermCodeChange,
  onPaymentTermValueChange,
}: Props) {
  const isCredit    = conditionOperationCode === "2";
  const missingTerm = isCredit && (!paymentTermCode || !paymentTermValue);

  const cat016Items = catalogCAT016.length > 0 ? catalogCAT016 : FALLBACK_CAT016;
  const cat018Items = catalogCAT018.length > 0 ? catalogCAT018 : FALLBACK_CAT018;

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Pago y condición
      </span>

      <div className="grid grid-cols-4 gap-x-2">

        {/* Condición CAT-016 */}
        <div>
          <label className={labelCls}>Condición operación</label>
          <select
            value={conditionOperationCode ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onConditionChange(v === "" ? null : (v as "1" | "2" | "3"));
            }}
            className={selectCls}
          >
            <option value="">— Seleccionar —</option>
            {cat016Items.map((it) => (
              <option key={it.item_code} value={it.item_code}>
                {it.item_code} — {it.item_label}
              </option>
            ))}
          </select>
        </div>

        {/* Forma de pago CAT-017 */}
        <div>
          <label className={labelCls}>Forma de pago</label>
          <select
            value={paymentMethodCode ?? ""}
            onChange={(e) => onPaymentMethodChange(e.target.value || null)}
            className={selectCls}
          >
            <option value="">— Seleccionar —</option>
            {catalogCAT017.map((it) => (
              <option key={it.item_code} value={it.item_code}>
                {it.item_code} — {it.item_label}
              </option>
            ))}
          </select>
        </div>

        {/* Plazo CAT-018 — activo solo si crédito */}
        <div className={!isCredit ? "opacity-40 pointer-events-none" : ""}>
          <label className={labelCls}>Plazo</label>
          <select
            value={paymentTermCode ?? ""}
            disabled={!isCredit}
            onChange={(e) => {
              const v = e.target.value;
              onPaymentTermCodeChange(v === "" ? null : (v as "01" | "02" | "03"));
            }}
            className={selectCls}
          >
            <option value="">— Seleccionar —</option>
            {cat018Items.map((it) => (
              <option key={it.item_code} value={it.item_code}>
                {it.item_code} — {it.item_label}
              </option>
            ))}
          </select>
        </div>

        {/* Valor de plazo */}
        <div className={!isCredit ? "opacity-40 pointer-events-none" : ""}>
          <label className={labelCls}>Valor plazo</label>
          <input
            type="number"
            min={1}
            step={1}
            disabled={!isCredit}
            placeholder="Ej: 30"
            value={paymentTermValue ?? ""}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onPaymentTermValueChange(isNaN(v) || v <= 0 ? null : v);
            }}
            className={inputCls}
          />
        </div>
      </div>

      {missingTerm && (
        <p className="text-[10px] text-amber-500/80">
          Operación a crédito sin plazo definido.
        </p>
      )}
    </div>
  );
}
