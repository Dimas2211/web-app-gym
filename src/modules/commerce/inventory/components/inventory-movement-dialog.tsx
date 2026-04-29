"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-movement-dialog.tsx
//
// Diálogo para registrar movimientos manuales de inventario (Etapa 11).
// Tipos soportados: INITIAL_LOAD, MANUAL_IN, MANUAL_OUT,
//                  ADJUSTMENT_UP, ADJUSTMENT_DOWN.
//
// Flujo:
//   1. Muestra contexto del ProductLocation seleccionado.
//   2. Captura movement_type, quantity, campos opcionales.
//   3. POST /api/inventory/movements (JSON body).
//   4. Muestra errores de negocio (422) y validación (400) al usuario.
//
// product_id, tenant_id y location_id NO se piden al usuario.
// Se derivan en el servidor a partir de product_location_id.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { X, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import type { ProductLocationItem, StockAlertLevel } from "../types/inventory.types";

// ── Props ─────────────────────────────────────────────────────────

interface InventoryMovementDialogProps {
  productLocation: ProductLocationItem;
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Tipos de movimiento activos en Etapa 11 ───────────────────────

type ActiveMovementType =
  | "INITIAL_LOAD"
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "ADJUSTMENT_UP"
  | "ADJUSTMENT_DOWN";

const MOVEMENT_OPTIONS: {
  value: ActiveMovementType;
  label: string;
  description: string;
  additive: boolean;
}[] = [
  {
    value:       "INITIAL_LOAD",
    label:       "Carga inicial",
    description: "Primera carga de existencias en esta ubicación",
    additive:    true,
  },
  {
    value:       "MANUAL_IN",
    label:       "Entrada manual",
    description: "Entrada de mercancía autorizada manualmente",
    additive:    true,
  },
  {
    value:       "MANUAL_OUT",
    label:       "Salida manual",
    description: "Salida de mercancía autorizada manualmente",
    additive:    false,
  },
  {
    value:       "ADJUSTMENT_UP",
    label:       "Ajuste positivo",
    description: "Corrección al alza tras conteo físico",
    additive:    true,
  },
  {
    value:       "ADJUSTMENT_DOWN",
    label:       "Ajuste negativo",
    description: "Corrección a la baja tras conteo físico",
    additive:    false,
  },
];

// ── Estilos de alerta de stock ────────────────────────────────────

const ALERT_BADGE: Record<StockAlertLevel, { label: string; cls: string }> = {
  OK:    { label: "OK",    cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  LOW:   { label: "Bajo",  cls: "bg-amber-100 text-amber-700 border-amber-200"      },
  EMPTY: { label: "Vacío", cls: "bg-red-100 text-red-700 border-red-200"            },
};

// ── Helpers visuales ──────────────────────────────────────────────

const labelCls = "block text-xs font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";

function formatStock(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

// ── Componente principal ──────────────────────────────────────────

export function InventoryMovementDialog({
  productLocation,
  onClose,
  onSuccess,
}: InventoryMovementDialogProps) {
  // ── Estado del formulario ─────────────────────────────────────
  const [movementType, setMovementType] = useState<ActiveMovementType>("MANUAL_IN");
  const [quantity, setQuantity]         = useState("");
  const [unitCost, setUnitCost]         = useState("");
  const [refEntity, setRefEntity]       = useState("");
  const [refId, setRefId]               = useState("");
  const [refCode, setRefCode]           = useState("");
  const [notes, setNotes]               = useState("");

  // ── Estado de envío ───────────────────────────────────────────
  const [isPending, setIsPending]                           = useState(false);
  const [error, setError]                                   = useState<string | null>(null);
  const [fieldErrors, setFieldErrors]                       = useState<Record<string, string[]> | null>(null);

  const selectedOption = MOVEMENT_OPTIONS.find((o) => o.value === movementType)!;
  const alert          = ALERT_BADGE[productLocation.stock_alert];

  // ── Submit ────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors(null);

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setFieldErrors({ quantity: ["La cantidad debe ser un número mayor a cero."] });
      return;
    }

    const body: Record<string, unknown> = {
      product_location_id: productLocation.id,
      movement_type:       movementType,
      quantity:            qty,
    };

    const cost = parseFloat(unitCost);
    if (unitCost.trim() && !isNaN(cost) && cost >= 0) body.unit_cost = cost;
    if (refEntity.trim()) body.reference_entity = refEntity.trim();
    if (refId.trim())     body.reference_id     = refId.trim();
    if (refCode.trim())   body.reference_code   = refCode.trim();
    if (notes.trim())     body.notes            = notes.trim();

    setIsPending(true);
    try {
      const res = await fetch("/api/inventory/movements", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (res.status === 201) {
        onSuccess?.();
        onClose();
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 400 && data.errors) {
        // Errores de validación de campo
        setFieldErrors(data.errors as Record<string, string[]>);
      } else if (res.status === 422 && data.error) {
        // Error de negocio: saldo insuficiente, registro inactivo, etc.
        setError(data.error as string);
      } else {
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Verifica tu conexión.");
    } finally {
      setIsPending(false);
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !isPending) onClose();
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-zinc-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Registrar movimiento</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Stock operativo · {productLocation.warehouse ?? "Sin almacén"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-zinc-400 hover:text-zinc-600 ml-2 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contexto del producto — solo lectura */}
        <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-mono text-zinc-400">{productLocation.product_code}</p>
              <p className="text-sm font-semibold text-zinc-800 truncate">
                {productLocation.product_name}
              </p>
              <p className="text-xs text-zinc-400">
                {productLocation.category_name}
                {productLocation.line_name ? ` · ${productLocation.line_name}` : ""}
                {" · "}{productLocation.unit_symbol}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs text-zinc-400 mb-0.5">Stock actual</p>
              <p className="text-lg font-mono font-bold text-zinc-900">
                {formatStock(productLocation.current_stock)}
              </p>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${alert.cls}`}
              >
                {alert.label}
              </span>
            </div>
          </div>

          {/* Advertencia si el registro está inactivo */}
          {!productLocation.is_active && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0" />
              <span>
                Este registro está <strong>inactivo</strong>. No se pueden registrar movimientos
                sobre registros inactivos. Reactívalo primero.
              </span>
            </div>
          )}
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            {/* Tipo de movimiento */}
            <div>
              <label className={labelCls}>Tipo de movimiento *</label>
              <div className="space-y-1.5">
                {MOVEMENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors
                      ${movementType === opt.value
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 hover:border-zinc-300"
                      }`}
                  >
                    <input
                      type="radio"
                      name="movement_type"
                      value={opt.value}
                      checked={movementType === opt.value}
                      onChange={() => setMovementType(opt.value)}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {opt.additive
                          ? <TrendingUp size={12} className="text-emerald-600 shrink-0" />
                          : <TrendingDown size={12} className="text-red-600 shrink-0" />
                        }
                        <span className="text-sm font-medium text-zinc-800">{opt.label}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <label htmlFor="mov-quantity" className={labelCls}>
                Cantidad *
                {selectedOption.additive
                  ? <span className="ml-1 text-emerald-600 font-normal">(suma al stock)</span>
                  : <span className="ml-1 text-red-600 font-normal">(resta del stock)</span>
                }
              </label>
              <input
                id="mov-quantity"
                type="number"
                min="0.0001"
                step="any"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputCls}
                required
              />
              {fieldErrors?.quantity && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.quantity[0]}</p>
              )}
              {/* Proyección del stock resultante si hay cantidad válida */}
              {(() => {
                const q = parseFloat(quantity);
                if (isNaN(q) || q <= 0) return null;
                const projected = selectedOption.additive
                  ? productLocation.current_stock + q
                  : productLocation.current_stock - q;
                const negative = projected < 0;
                return (
                  <p className={`text-xs mt-1 ${negative ? "text-red-600 font-medium" : "text-zinc-400"}`}>
                    Stock resultante: <span className="font-mono">{formatStock(projected)}</span>
                    {negative && " — operación con saldo negativo, será rechazada"}
                  </p>
                );
              })()}
            </div>

            {/* Costo unitario (opcional) */}
            <div>
              <label htmlFor="mov-unit-cost" className={labelCls}>
                Costo unitario <span className="text-zinc-400 font-normal">(opcional)</span>
              </label>
              <input
                id="mov-unit-cost"
                type="number"
                min="0"
                step="any"
                placeholder="—"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Referencia documental — campos opcionales colapsados visualmente */}
            <fieldset className="border border-zinc-100 rounded-lg p-3">
              <legend className="px-1 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Referencia documental (opcional)
              </legend>
              <div className="space-y-2 mt-1">
                <div>
                  <label htmlFor="mov-ref-entity" className={labelCls}>Entidad</label>
                  <input
                    id="mov-ref-entity"
                    type="text"
                    placeholder="p.ej. OrdenCompra"
                    value={refEntity}
                    onChange={(e) => setRefEntity(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="mov-ref-id" className={labelCls}>ID</label>
                    <input
                      id="mov-ref-id"
                      type="text"
                      placeholder="UUID o código interno"
                      value={refId}
                      onChange={(e) => setRefId(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="mov-ref-code" className={labelCls}>Código visible</label>
                    <input
                      id="mov-ref-code"
                      type="text"
                      placeholder="OC-2024-001"
                      value={refCode}
                      onChange={(e) => setRefCode(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Notas */}
            <div>
              <label htmlFor="mov-notes" className={labelCls}>
                Notas <span className="text-zinc-400 font-normal">(opcional)</span>
              </label>
              <textarea
                id="mov-notes"
                rows={2}
                placeholder="Observaciones del movimiento…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* Error de negocio (422) */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Footer con acciones */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600
                         hover:bg-zinc-50 disabled:opacity-40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !productLocation.is_active}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white font-medium
                         hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Registrando…" : "Registrar movimiento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
