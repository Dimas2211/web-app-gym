"use client";

import type { RefObject, KeyboardEvent } from "react";
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
  // Refs para foco externo
  conditionOperationRef?:  RefObject<HTMLSelectElement | null>;
  paymentMethodRef?:       RefObject<HTMLSelectElement | null>;
  paymentTermCodeRef?:     RefObject<HTMLSelectElement | null>;
  paymentTermValueRef?:    RefObject<HTMLInputElement | null>;
  // Callbacks de avance por Enter
  onConditionEnter?:       () => void;
  onPaymentMethodEnter?:   () => void;
  onPaymentTermCodeEnter?: () => void;
  onPaymentTermValueEnter?:() => void;
}

const selectCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500 w-full cursor-pointer";
const inputCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-full";
const labelCls = "text-[10px] text-zinc-500 block mb-0.5";

// Fallbacks locales de desarrollo — usados cuando el catálogo DTE aún no está seedado en la base
const FALLBACK_CAT016 = [
  { item_code: "1", item_label: "Contado"    },
  { item_code: "2", item_label: "A crédito"  },
  { item_code: "3", item_label: "Otro"       },
];
// Fallback local de desarrollo — CAT-017 DTE El Salvador
const FALLBACK_CAT017 = [
  { item_code: "01", item_label: "Billetes y monedas"                  },
  { item_code: "02", item_label: "Tarjeta Débito"                      },
  { item_code: "03", item_label: "Tarjeta Crédito"                     },
  { item_code: "04", item_label: "Cheque"                              },
  { item_code: "05", item_label: "Transferencia-Depósito Bancario"     },
  { item_code: "08", item_label: "Dinero electrónico"                  },
  { item_code: "09", item_label: "Monedero electrónico"                },
  { item_code: "11", item_label: "Bitcoin"                             },
  { item_code: "12", item_label: "Otras Criptomonedas"                 },
  { item_code: "13", item_label: "Cuentas por pagar del receptor"      },
  { item_code: "14", item_label: "Giro bancario"                       },
  { item_code: "99", item_label: "Otros"                               },
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
  conditionOperationRef,
  paymentMethodRef,
  paymentTermCodeRef,
  paymentTermValueRef,
  onConditionEnter,
  onPaymentMethodEnter,
  onPaymentTermCodeEnter,
  onPaymentTermValueEnter,
}: Props) {
  const isCredit    = conditionOperationCode === "2";
  const missingTerm = isCredit && (!paymentTermCode || !paymentTermValue);

  const cat016Items = catalogCAT016.length > 0 ? catalogCAT016 : FALLBACK_CAT016;
  const cat017Items = catalogCAT017.length > 0 ? catalogCAT017 : FALLBACK_CAT017;
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
            ref={conditionOperationRef}
            value={conditionOperationCode ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onConditionChange(v === "" ? null : (v as "1" | "2" | "3"));
            }}
            onKeyDown={(e: KeyboardEvent<HTMLSelectElement>) => {
              if (e.key === "Enter") { e.preventDefault(); onConditionEnter?.(); }
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
            ref={paymentMethodRef}
            value={paymentMethodCode ?? ""}
            onChange={(e) => onPaymentMethodChange(e.target.value || null)}
            onKeyDown={(e: KeyboardEvent<HTMLSelectElement>) => {
              if (e.key === "Enter") { e.preventDefault(); onPaymentMethodEnter?.(); }
            }}
            className={selectCls}
          >
            <option value="">— Seleccionar —</option>
            {cat017Items.map((it) => (
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
            ref={paymentTermCodeRef}
            value={paymentTermCode ?? ""}
            disabled={!isCredit}
            onChange={(e) => {
              const v = e.target.value;
              onPaymentTermCodeChange(v === "" ? null : (v as "01" | "02" | "03"));
            }}
            onKeyDown={(e: KeyboardEvent<HTMLSelectElement>) => {
              if (e.key === "Enter") { e.preventDefault(); onPaymentTermCodeEnter?.(); }
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
            ref={paymentTermValueRef}
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
            onFocus={(e) => e.target.select()}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") { e.preventDefault(); onPaymentTermValueEnter?.(); }
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
