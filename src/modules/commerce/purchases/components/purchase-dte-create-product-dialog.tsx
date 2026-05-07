"use client";

// -----------------------------------------------------------------
// commerce/purchases — purchase-dte-create-product-dialog.tsx
//
// Modal de alta rápida de producto desde una línea del DTE.
// Se abre solo cuando el usuario presiona "Crear producto desde línea DTE".
// Prerrellena código, nombre y costo unitario desde la línea detectada.
//
// Llama POST /api/products con los datos del formulario.
// Al crear correctamente llama onCreated({ id, product_code, name })
// para que el componente padre seleccione el producto en esa línea.
//
// No auto-crea: el usuario debe confirmar con "Guardar producto".
// No crea categorías ni unidades.
// No crea ProductLocation ni InventoryMovement.
// -----------------------------------------------------------------

import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import type { DteItemDetected } from "../types/purchase-dte-import.types";

export interface CreatedProductData {
  id:           string;
  product_code: string;
  name:         string;
}

interface CategoryOption {
  id:   string;
  code: string;
  name: string;
}

interface UnitOption {
  id:     string;
  name:   string;
  symbol: string;
}

interface Props {
  lineNumber: number;
  detected:   DteItemDetected;
  onClose:    () => void;
  onCreated:  (product: CreatedProductData) => void;
}

type FieldErrors = Partial<Record<
  "product_code" | "name" | "category_id" | "unit_id" | "cost_price",
  string
>>;

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toFixed(2);
}

export function PurchaseDteCreateProductDialog({
  lineNumber,
  detected,
  onClose,
  onCreated,
}: Props) {
  // ── Campos del formulario ──────────────────────────────────────
  const [productCode,   setProductCode]   = useState(detected.code?.trim() ?? "");
  const [name,          setName]          = useState(detected.description?.trim() ?? "");
  const [productType,   setProductType]   = useState<"PRODUCT" | "SERVICE">("PRODUCT");
  const [categoryId,    setCategoryId]    = useState("");
  const [unitId,        setUnitId]        = useState("");
  const [isStockable,   setIsStockable]   = useState(true);
  const [allowPurchase, setAllowPurchase] = useState(true);
  const [allowSale,     setAllowSale]     = useState(false);
  const [costPrice,     setCostPrice]     = useState(
    detected.unit_price != null ? String(detected.unit_price) : ""
  );

  // ── Lookups ────────────────────────────────────────────────────
  const [categories,     setCategories]     = useState<CategoryOption[]>([]);
  const [units,          setUnits]          = useState<UnitOption[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError,    setLookupError]    = useState<string | null>(null);

  // ── Estado del formulario ──────────────────────────────────────
  const [saving,       setSaving]       = useState(false);
  const [globalError,  setGlobalError]  = useState<string | null>(null);
  const [fieldErrors,  setFieldErrors]  = useState<FieldErrors>({});
  const [savedOk,      setSavedOk]      = useState(false);

  // ── Cargar lookups al montar ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingLookups(true);
    setLookupError(null);

    Promise.all([
      fetch("/api/products/categories-lookup", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : [])),
      fetch("/api/products/units-lookup", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cats, uns]: [CategoryOption[], UnitOption[]]) => {
        if (cancelled) return;
        setCategories(cats);
        setUnits(uns);
      })
      .catch(() => {
        if (!cancelled) {
          setLookupError(
            "Error al cargar categorías y unidades. Recarga la página e intenta de nuevo."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLookups(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function clearErrors() {
    setGlobalError(null);
    setFieldErrors({});
  }

  async function handleSave() {
    clearErrors();

    // Validación cliente — campos mínimos obligatorios
    const errs: FieldErrors = {};
    if (!productCode.trim()) errs.product_code = "El código de producto es requerido.";
    else if (productCode.trim().length > 50) errs.product_code = "El código no puede superar los 50 caracteres.";
    if (!name.trim()) errs.name = "El nombre del producto es requerido.";
    if (!categoryId) errs.category_id = "La categoría es requerida.";
    if (!unitId) errs.unit_id = "La unidad de medida es requerida.";
    if (costPrice.trim()) {
      const parsed = parseFloat(costPrice.trim());
      if (isNaN(parsed) || parsed <= 0) {
        errs.cost_price = "El costo debe ser un número mayor a 0.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        product_code:   productCode.trim(),
        name:           name.trim(),
        product_type:   productType,
        category_id:    categoryId,
        unit_id:        unitId,
        is_stockable:   isStockable,
        allow_purchase: allowPurchase,
        allow_sale:     allowSale,
      };
      if (costPrice.trim()) {
        body.cost_price = parseFloat(costPrice.trim());
      }

      const res = await fetch("/api/products", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "same-origin",
        body:        JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        if (
          (res.status === 400 || res.status === 409 || res.status === 422) &&
          data.errors &&
          typeof data.errors === "object"
        ) {
          const errsBack = data.errors as Record<string, string[]>;
          const mapped: FieldErrors = {};
          if (errsBack.product_code?.[0]) {
            mapped.product_code =
              res.status === 409
                ? "Ya existe un producto con este código. Busca el producto existente o cambia el código."
                : errsBack.product_code[0];
          }
          if (errsBack.name?.[0])        mapped.name        = errsBack.name[0];
          if (errsBack.category_id?.[0]) mapped.category_id = errsBack.category_id[0];
          if (errsBack.unit_id?.[0])     mapped.unit_id     = errsBack.unit_id[0];
          if (errsBack.cost_price?.[0])  mapped.cost_price  = errsBack.cost_price[0];
          setFieldErrors(mapped);
        } else {
          const msg =
            typeof data.error === "string"
              ? data.error
              : "Error al crear el producto. Verifica los datos e intenta de nuevo.";
          setGlobalError(msg);
        }
        return;
      }

      setSavedOk(true);
      const created = data as unknown as CreatedProductData;
      // Pequeña pausa para que el usuario vea la confirmación visual
      setTimeout(() => onCreated(created), 600);
    } catch {
      setGlobalError("Error de red. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || savedOk;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-none">
          <h2 className="text-sm font-semibold text-zinc-100">
            Crear producto desde línea DTE
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Revisa los datos detectados antes de guardarlo en el catálogo de productos.
          </p>

          {/* Datos detectados del DTE */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-md p-3 space-y-2">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-600">
              Datos detectados — Línea #{lineNumber}
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <div>
                <span className="text-zinc-600">Código DTE: </span>
                <span className="text-zinc-300 font-mono">{detected.code ?? "—"}</span>
              </div>
              <div>
                <span className="text-zinc-600">Unidad MH: </span>
                <span className="text-zinc-300 font-mono">{detected.unit_code ?? "—"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-zinc-600">Descripción: </span>
                <span className="text-zinc-300">{detected.description ?? "—"}</span>
              </div>
              <div>
                <span className="text-zinc-600">Cantidad: </span>
                <span className="text-zinc-300">{detected.quantity ?? "—"}</span>
              </div>
              <div>
                <span className="text-zinc-600">Precio unitario: </span>
                <span className="text-zinc-300">{fmt(detected.unit_price)}</span>
              </div>
              {detected.taxable_amount != null && detected.taxable_amount > 0 && (
                <div>
                  <span className="text-zinc-600">Gravada: </span>
                  <span className="text-zinc-300">{fmt(detected.taxable_amount)}</span>
                </div>
              )}
              {detected.exempt_amount != null && detected.exempt_amount > 0 && (
                <div>
                  <span className="text-zinc-600">Exenta: </span>
                  <span className="text-zinc-300">{fmt(detected.exempt_amount)}</span>
                </div>
              )}
              {detected.non_subject_amount != null && detected.non_subject_amount > 0 && (
                <div>
                  <span className="text-zinc-600">No sujeta: </span>
                  <span className="text-zinc-300">{fmt(detected.non_subject_amount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Errores globales */}
          {globalError && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
              {globalError}
            </div>
          )}

          {/* Confirmación visual */}
          {savedOk && (
            <div className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded px-3 py-2">
              Producto creado y vinculado correctamente.
            </div>
          )}

          {/* Loading lookups */}
          {loadingLookups && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando categorías y unidades...
            </div>
          )}

          {/* Error de lookups */}
          {lookupError && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
              {lookupError}
            </div>
          )}

          {/* Formulario — visible solo cuando lookups cargaron */}
          {!loadingLookups && !lookupError && (
            <>
              {/* Código de producto */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  Código de producto <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => { setProductCode(e.target.value); clearErrors(); }}
                  disabled={disabled}
                  maxLength={50}
                  placeholder="Código único del producto"
                  className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50 font-mono"
                />
                {fieldErrors.product_code && (
                  <p className="text-[10px] text-red-400">{fieldErrors.product_code}</p>
                )}
              </div>

              {/* Nombre */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  Nombre del producto <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearErrors(); }}
                  disabled={disabled}
                  maxLength={200}
                  placeholder="Nombre del producto"
                  className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                />
                {fieldErrors.name && (
                  <p className="text-[10px] text-red-400">{fieldErrors.name}</p>
                )}
              </div>

              {/* Tipo de producto */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  Tipo de producto <span className="text-red-400">*</span>
                </label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as "PRODUCT" | "SERVICE")}
                  disabled={disabled}
                  className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                >
                  <option value="PRODUCT">Producto</option>
                  <option value="SERVICE">Servicio</option>
                </select>
              </div>

              {/* Categoría */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  Categoría <span className="text-red-400">*</span>
                </label>
                {categories.length === 0 ? (
                  <p className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                    No hay categorías activas para este tenant. Crea una categoría en el módulo de productos antes de continuar.
                  </p>
                ) : (
                  <select
                    value={categoryId}
                    onChange={(e) => { setCategoryId(e.target.value); clearErrors(); }}
                    disabled={disabled}
                    className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                  >
                    <option value="">Seleccionar categoría...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {fieldErrors.category_id && (
                  <p className="text-[10px] text-red-400">{fieldErrors.category_id}</p>
                )}
              </div>

              {/* Unidad de medida */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  Unidad de medida <span className="text-red-400">*</span>
                  {detected.unit_code != null && (
                    <span className="ml-1 text-zinc-600 normal-case font-normal">
                      (cód. MH: {detected.unit_code})
                    </span>
                  )}
                </label>
                <select
                  value={unitId}
                  onChange={(e) => { setUnitId(e.target.value); clearErrors(); }}
                  disabled={disabled || units.length === 0}
                  className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                >
                  <option value="">Seleccionar unidad...</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                  ))}
                </select>
                {fieldErrors.unit_id && (
                  <p className="text-[10px] text-red-400">{fieldErrors.unit_id}</p>
                )}
              </div>

              {/* Costo referencial */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  Costo referencial (opcional)
                </label>
                <input
                  type="number"
                  value={costPrice}
                  onChange={(e) => { setCostPrice(e.target.value); clearErrors(); }}
                  disabled={disabled}
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                />
                {fieldErrors.cost_price && (
                  <p className="text-[10px] text-red-400">{fieldErrors.cost_price}</p>
                )}
              </div>

              {/* Flags operativos */}
              <div className="space-y-2">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Opciones</span>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isStockable}
                      onChange={(e) => setIsStockable(e.target.checked)}
                      disabled={disabled}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                    <span className="text-xs text-zinc-300">Controla inventario (stockable)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPurchase}
                      onChange={(e) => setAllowPurchase(e.target.checked)}
                      disabled={disabled}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                    <span className="text-xs text-zinc-300">Permite compra</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowSale}
                      onChange={(e) => setAllowSale(e.target.checked)}
                      disabled={disabled}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                    <span className="text-xs text-zinc-300">Permite venta</span>
                  </label>
                </div>
              </div>

              <p className="text-[10px] text-zinc-600">
                El producto se crea activo en el catálogo del tenant. Puedes completar línea, sublínea, marca y otros detalles desde el módulo de productos.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-zinc-800 flex-none">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-7 px-3 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          {!savedOk && (
            <button
              onClick={handleSave}
              disabled={disabled || loadingLookups || !!lookupError || categories.length === 0}
              className="h-7 px-4 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {saving ? "Guardando..." : "Guardar producto"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
