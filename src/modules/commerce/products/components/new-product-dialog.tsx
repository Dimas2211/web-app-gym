"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — new-product-dialog.tsx
//
// Formulario de alta de producto en el catálogo maestro.
// Campos obligatorios: código, nombre, tipo, categoría, unidad,
// is_stockable, allow_purchase, allow_sale.
// Campos opcionales: todos los demás del modelo aprobado.
//
// Lines y sublines se filtran client-side a partir de los props
// `allLines` y `allSublines` recibidos del servidor.
// is_stockable tiene default true para PRODUCT, false para SERVICE.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { createProductAction } from "../actions/create-product.action";
import type { CategoryLookupItem } from "../queries/lookups/get-categories-lookup";
import type { LineLookupItem } from "../queries/lookups/get-lines-lookup";
import type { SublineLookupItem } from "../queries/lookups/get-sublines-lookup";
import type { UnitLookupItem } from "../queries/lookups/get-units-lookup";
import type { TaxRateLookupItem } from "../queries/lookups/get-tax-rates-lookup";
import type { SupplierLookupItem } from "../queries/lookups/get-suppliers-lookup";
import type { ProductType } from "../types/product.types";

interface NewProductDialogProps {
  categories: CategoryLookupItem[];
  allLines: LineLookupItem[];
  allSublines: SublineLookupItem[];
  units: UnitLookupItem[];
  taxRates: TaxRateLookupItem[];
  suppliers: SupplierLookupItem[];
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Helpers visuales ──────────────────────────────────────────────

const labelCls = "block text-xs font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";
const errorCls = "text-xs text-red-600 mt-1";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className={errorCls}>{errors[0]}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-zinc-100 rounded-lg p-4 mb-4">
      <legend className="px-1 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function NewProductDialog({
  categories,
  allLines,
  allSublines,
  units,
  taxRates,
  suppliers,
  onClose,
  onSuccess,
}: NewProductDialogProps) {
  // Estado local para selects en cascada y defaults reactivos
  const [productType, setProductType] = useState<ProductType>("PRODUCT");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [isStockable, setIsStockable] = useState(true);

  // Estado para precios bidireccionales (valor canónico = sin IVA)
  const [precioSinIva, setPrecioSinIva] = useState("");
  const [precioConIva, setPrecioConIva] = useState("");

  // IVA 13% fijo — buscamos el tax_rate con rate === 13 para asignarlo automáticamente
  const ivaRate13 = taxRates.find((t) => t.rate === 13);

  function handleConIvaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setPrecioConIva(raw);
    const num = parseFloat(raw);
    if (!isNaN(num) && num >= 0) {
      setPrecioSinIva((num / 1.13).toFixed(2));
    } else {
      setPrecioSinIva("");
    }
  }

  function handleSinIvaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setPrecioSinIva(raw);
    const num = parseFloat(raw);
    if (!isNaN(num) && num >= 0) {
      setPrecioConIva((num * 1.13).toFixed(2));
    } else {
      setPrecioConIva("");
    }
  }

  const ivaDisplay = (() => {
    const num = parseFloat(precioConIva);
    return !isNaN(num) && num > 0 ? "$" + (num - num / 1.13).toFixed(2) : "—";
  })();

  // Default de is_stockable según tipo
  useEffect(() => {
    setIsStockable(productType === "PRODUCT");
  }, [productType]);

  // Filtros en cascada client-side
  const filteredLines = selectedCategoryId
    ? allLines.filter((l) => l.category_id === selectedCategoryId)
    : [];

  const filteredSublines = selectedLineId
    ? allSublines.filter((s) => s.line_id === selectedLineId)
    : [];

  const [state, formAction, isPending] = useActionState(
    async (
      prev: { errors?: Record<string, string[]>; error?: string } | undefined,
      formData: FormData
    ) => {
      // Inyectar campos de estado local que no vienen de inputs controlados
      formData.set("is_stockable", String(isStockable));
      const result = await createProductAction(prev, formData);
      if (result === undefined) {
        // undefined = éxito (action no retornó error)
        onSuccess?.();
        onClose();
      }
      return result;
    },
    undefined
  );

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedCategoryId(e.target.value);
    setSelectedLineId("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 pb-4 overflow-y-auto"
      onClick={handleBackdrop}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">Nuevo producto</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form action={formAction} className="px-6 py-5">

          {/* Error general */}
          {state?.error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {state.error}
            </div>
          )}

          {/* ── Identidad ───────────────────────────────────────── */}
          <Section title="Identidad">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Código <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="product_code"
                  className={inputCls}
                  placeholder="Ej. PROD-001"
                  required
                />
                <FieldError errors={state?.errors?.product_code} />
              </div>

              <div>
                <label className={labelCls}>
                  Tipo <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    name="product_type"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value as ProductType)}
                    className={inputCls + " appearance-none pr-8"}
                  >
                    <option value="PRODUCT">Producto físico</option>
                    <option value="SERVICE">Servicio</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <FieldError errors={state?.errors?.product_type} />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  className={inputCls}
                  placeholder="Nombre descriptivo del producto"
                  required
                />
                <FieldError errors={state?.errors?.name} />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Descripción</label>
                <textarea
                  name="description"
                  rows={2}
                  className={inputCls + " resize-none"}
                  placeholder="Descripción opcional"
                />
                <FieldError errors={state?.errors?.description} />
              </div>
            </div>
          </Section>

          {/* ── Clasificación ────────────────────────────────────── */}
          <Section title="Clasificación">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Categoría <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    name="category_id"
                    value={selectedCategoryId}
                    onChange={handleCategoryChange}
                    className={inputCls + " appearance-none pr-8"}
                    required
                  >
                    <option value="">Selecciona una categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <FieldError errors={state?.errors?.category_id} />
              </div>

              <div>
                <label className={labelCls}>Línea</label>
                <div className="relative">
                  <select
                    name="line_id"
                    value={selectedLineId}
                    onChange={(e) => setSelectedLineId(e.target.value)}
                    className={inputCls + " appearance-none pr-8"}
                    disabled={filteredLines.length === 0}
                  >
                    <option value="">
                      {selectedCategoryId
                        ? filteredLines.length === 0
                          ? "Sin líneas disponibles"
                          : "Sin línea"
                        : "Selecciona primero una categoría"}
                    </option>
                    {filteredLines.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <FieldError errors={state?.errors?.line_id} />
              </div>

              <div>
                <label className={labelCls}>Sublínea</label>
                <div className="relative">
                  <select
                    name="subline_id"
                    className={inputCls + " appearance-none pr-8"}
                    disabled={filteredSublines.length === 0}
                  >
                    <option value="">
                      {selectedLineId
                        ? filteredSublines.length === 0
                          ? "Sin sublíneas disponibles"
                          : "Sin sublínea"
                        : "Selecciona primero una línea"}
                    </option>
                    {filteredSublines.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <FieldError errors={state?.errors?.subline_id} />
              </div>

              <div>
                <label className={labelCls}>Marca</label>
                <input type="text" name="brand" className={inputCls} placeholder="Marca (opcional)" />
                <FieldError errors={state?.errors?.brand} />
              </div>
            </div>
          </Section>

          {/* ── Logística ────────────────────────────────────────── */}
          <Section title="Logística">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Unidad de medida <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select name="unit_id" className={inputCls + " appearance-none pr-8"} required>
                    <option value="">Selecciona una unidad</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <FieldError errors={state?.errors?.unit_id} />
              </div>

              <div>
                <label className={labelCls}>Descripción de empaque</label>
                <input type="text" name="package_unit" className={inputCls} placeholder="Ej. Caja 12 unid." />
                <FieldError errors={state?.errors?.package_unit} />
              </div>

              <div>
                <label className={labelCls}>Proveedor principal</label>
                <div className="relative">
                  <select name="supplier_id" className={inputCls + " appearance-none pr-8"}>
                    <option value="">Sin proveedor asignado</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                <FieldError errors={state?.errors?.supplier_id} />
              </div>

              <div>
                <label className={labelCls}>SKU / Código de barras</label>
                <input type="text" name="sku" className={inputCls} placeholder="SKU opcional" />
                <FieldError errors={state?.errors?.sku} />
              </div>
            </div>
          </Section>

          {/* ── Precios ──────────────────────────────────────────── */}
          <Section title="Precios">
            {/* IVA 13% fijo — se asigna automáticamente si existe en catálogo */}
            {ivaRate13 && (
              <input type="hidden" name="tax_rate_id" value={ivaRate13.id} />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Costo unitario</label>
                <input
                  type="number"
                  name="cost_price"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  placeholder="0.00"
                />
                <FieldError errors={state?.errors?.cost_price} />
              </div>

              <div>
                <label className={labelCls}>Precio venta con IVA</label>
                {/* sale_price guarda el precio CON IVA — fuente de verdad para ventas */}
                <input
                  type="number"
                  name="sale_price"
                  step="0.01"
                  min="0"
                  value={precioConIva}
                  onChange={handleConIvaChange}
                  className={inputCls}
                  placeholder="0.00"
                />
                <FieldError errors={state?.errors?.sale_price} />
              </div>

              <div>
                <label className={labelCls}>Precio venta sin IVA</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioSinIva}
                  onChange={handleSinIvaChange}
                  className={inputCls}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className={labelCls}>IVA 13%</label>
                <div className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-zinc-50 text-zinc-500 font-mono select-none">
                  {ivaDisplay}
                </div>
              </div>
            </div>
          </Section>

          {/* ── Configuración operativa ──────────────────────────── */}
          <Section title="Configuración operativa">
            <div className="space-y-3">
              {/* is_stockable controlado por estado local (default por tipo) */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isStockable}
                  onChange={(e) => setIsStockable(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-700">Controla inventario</span>
                  <p className="text-xs text-zinc-400">Genera movimientos de stock en inventario</p>
                </div>
              </label>
              {/* is_stockable se inyecta vía formData.set en el action wrapper */}

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="allow_sale"
                  value="true"
                  defaultChecked={true}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-700">Habilitado para venta</span>
                  <p className="text-xs text-zinc-400">Puede seleccionarse en módulo de ventas</p>
                </div>
              </label>
              <FieldError errors={state?.errors?.allow_sale} />

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="allow_purchase"
                  value="true"
                  defaultChecked={true}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-700">Habilitado para compra</span>
                  <p className="text-xs text-zinc-400">Puede seleccionarse en módulo de compras</p>
                </div>
              </label>
              <FieldError errors={state?.errors?.allow_purchase} />
            </div>
          </Section>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 text-sm rounded-lg bg-zinc-900 text-white font-medium
                         hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Guardando…" : "Crear producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
