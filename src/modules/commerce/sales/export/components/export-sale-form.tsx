"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-form.tsx
//
// F3-C21 — Formulario comercial real de venta de exportación (FEX 11).
// Captura cliente extranjero, productos, datos fiscales de
// exportación y crea la venta + DTE 11 (PENDING_GENERATION).
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Search } from "lucide-react";
import {
  searchForeignCustomersAction,
  searchExportProductsAction,
  createForeignCustomerAction,
  createExportSaleAction,
} from "../actions/export-sale.actions";
import type { ForeignCustomerLookup } from "../queries/search-foreign-customers";
import type { ExportProductLookup } from "../queries/search-export-products";
import type { CreateForeignCustomerInput } from "../schemas/export-sale.schemas";
import {
  FEX_INCOTERMS, FEX_REGIMES, FEX_FISCAL_PRECINCTS, FEX_COUNTRIES,
  FEX_PERSON_TYPES, FEX_ITEM_TYPE_EXPORT, FEX_RECEIVER_ID_TYPES,
} from "../utils/fex-catalogs";

interface LineDraft {
  product: ExportProductLookup;
  quantity: number;
  unit_price: number;
  discount_amount: number;
}

const inputClass =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-xs text-zinc-400 mb-1";

export function ExportSaleForm({
  onCreated,
}: {
  onCreated: (result: { sale_id: string; sale_code: string; dte_document_id: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  // Cliente
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<ForeignCustomerLookup[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<ForeignCustomerLookup | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<CreateForeignCustomerInput>({
    name: "", legal_name: "", id_type_code: "03", document_number: "",
    country_code: FEX_COUNTRIES[0]?.code ?? "", country_name: FEX_COUNTRIES[0]?.label ?? "",
    customer_person_type: "2", activity_name: "", address_complement: "", phone: "", email: "",
  });

  // Productos
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<ExportProductLookup[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);

  // Datos generales
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [conditionCode, setConditionCode] = useState<"1" | "2" | "3">("1");
  const [paymentMethodCode, setPaymentMethodCode] = useState("01");
  const [notes, setNotes] = useState("");

  // Datos fiscales de exportación
  const [itemTypeExport, setItemTypeExport] = useState<1 | 2 | 3>(1);
  const [fiscalPrecinct, setFiscalPrecinct] = useState(FEX_FISCAL_PRECINCTS[0]?.code ?? "");
  const [regimeCode, setRegimeCode] = useState(FEX_REGIMES[0]?.code ?? "");
  const [incotermCode, setIncotermCode] = useState(FEX_INCOTERMS[0]?.code ?? "");
  const [incotermDesc, setIncotermDesc] = useState(FEX_INCOTERMS[0]?.label ?? "");
  const [insurance, setInsurance] = useState(0);
  const [freight, setFreight] = useState(0);

  function searchCustomers() {
    startTransition(async () => {
      const result = await searchForeignCustomersAction(customerSearch);
      if (result.ok) setCustomers(result.items);
      else setError(result.error);
    });
  }

  function searchProducts() {
    startTransition(async () => {
      const result = await searchExportProductsAction(productSearch);
      if (result.ok) setProducts(result.items);
      else setError(result.error);
    });
  }

  function addLine(product: ExportProductLookup) {
    if (!product.mh_unit_code) {
      setError(`El producto "${product.name}" no tiene unidad con código MH (CAT-014) configurado. No se puede usar en FEX 11.`);
      return;
    }
    setLines((prev) => [
      ...prev,
      { product, quantity: 1, unit_price: product.sale_price ?? 0, discount_amount: 0 },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function handleCreateCustomer() {
    setError(null);
    startTransition(async () => {
      const result = await createForeignCustomerAction(newCustomer);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelectedCustomer({
        id: result.id,
        customer_code: result.customer_code,
        name: newCustomer.name,
        legal_name: newCustomer.legal_name || null,
        id_type_code: newCustomer.id_type_code,
        nit: newCustomer.id_type_code === "36" ? newCustomer.document_number : null,
        dui: newCustomer.id_type_code !== "36" ? newCustomer.document_number : null,
        country_code: newCustomer.country_code,
        country_name: newCustomer.country_name,
        customer_person_type: newCustomer.customer_person_type,
        address_complement: newCustomer.address_complement,
        activity_name: newCustomer.activity_name,
        email: newCustomer.email || null,
        phone: newCustomer.phone || null,
      });
      setShowNewCustomer(false);
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price - l.discount_amount, 0);
  const total = subtotal + insurance + freight;

  function handleSubmit() {
    setError(null);
    setFieldErrors([]);

    if (!selectedCustomer) {
      setError("Selecciona o crea un cliente extranjero.");
      return;
    }
    if (lines.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }

    startTransition(async () => {
      const result = await createExportSaleAction({
        sale_date: saleDate,
        customer_id: selectedCustomer.id,
        condition_operation_code: conditionCode,
        payment_method_code: paymentMethodCode || null,
        notes: notes || null,
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount,
        })),
        item_type_export: itemTypeExport,
        fiscal_precinct_code: itemTypeExport === 2 ? null : fiscalPrecinct,
        regime_code: itemTypeExport === 2 ? null : regimeCode,
        incoterm_code: incotermCode || null,
        incoterm_desc: incotermDesc || null,
        insurance_amount: insurance,
        freight_amount: freight,
      });

      if (!result.ok) {
        setError(result.error);
        if (result.errors) setFieldErrors(result.errors);
        return;
      }

      onCreated(result);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-700/50 bg-red-950/30 px-4 py-2 text-sm text-red-300 space-y-1">
          <div>{error}</div>
          {fieldErrors.length > 0 && (
            <ul className="list-disc list-inside text-xs text-red-300/90">
              {fieldErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Cliente extranjero */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">1. Receptor extranjero</h2>

        {selectedCustomer ? (
          <div className="flex items-center justify-between rounded border border-emerald-700/40 bg-emerald-950/20 px-3 py-2">
            <div className="text-sm text-zinc-200">
              <span className="font-medium">{selectedCustomer.name}</span>{" "}
              <span className="text-zinc-500 text-xs">({selectedCustomer.country_name})</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Buscar cliente extranjero por nombre, NIT, DUI..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCustomers()}
              />
              <button
                type="button"
                onClick={searchCustomers}
                disabled={pending}
                className="px-3 py-1.5 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowNewCustomer((v) => !v)}
                className="px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white whitespace-nowrap"
              >
                + Nuevo cliente
              </button>
            </div>

            {customers.length > 0 && (
              <div className="divide-y divide-zinc-800 border border-zinc-800 rounded max-h-40 overflow-y-auto">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCustomer(c)}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {c.name} — {c.country_name ?? "sin país"} ({c.customer_code})
                  </button>
                ))}
              </div>
            )}

            {showNewCustomer && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
                <div>
                  <label className={labelClass}>Nombre / razón social</label>
                  <input className={inputClass} value={newCustomer.name}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Nombre comercial (opcional)</label>
                  <input className={inputClass} value={newCustomer.legal_name ?? ""}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, legal_name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Tipo de documento</label>
                  <select className={inputClass} value={newCustomer.id_type_code}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, id_type_code: e.target.value as CreateForeignCustomerInput["id_type_code"] }))}>
                    {FEX_RECEIVER_ID_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Número de documento</label>
                  <input className={inputClass} value={newCustomer.document_number}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, document_number: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>País (CAT-020)</label>
                  <select className={inputClass} value={newCustomer.country_code}
                    onChange={(e) => {
                      const country = FEX_COUNTRIES.find((c) => c.code === e.target.value);
                      setNewCustomer((s) => ({ ...s, country_code: e.target.value, country_name: country?.label ?? s.country_name }));
                    }}>
                    {FEX_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Tipo de persona (CAT-029)</label>
                  <select className={inputClass} value={newCustomer.customer_person_type}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, customer_person_type: e.target.value as CreateForeignCustomerInput["customer_person_type"] }))}>
                    {FEX_PERSON_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Actividad económica</label>
                  <input className={inputClass} value={newCustomer.activity_name}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, activity_name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Correo (obligatorio si total ≥ $10,000)</label>
                  <input className={inputClass} value={newCustomer.email ?? ""}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Dirección / complemento</label>
                  <input className={inputClass} value={newCustomer.address_complement}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, address_complement: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Teléfono (opcional)</label>
                  <input className={inputClass} value={newCustomer.phone ?? ""}
                    onChange={(e) => setNewCustomer((s) => ({ ...s, phone: e.target.value }))} />
                </div>
                <div className="col-span-2 flex justify-end">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={handleCreateCustomer}
                    className="px-4 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white font-medium disabled:opacity-50"
                  >
                    {pending && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
                    Guardar cliente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Productos */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">2. Productos</h2>
        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder="Buscar producto por código o nombre..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchProducts()}
          />
          <button
            type="button"
            onClick={searchProducts}
            disabled={pending}
            className="px-3 py-1.5 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>

        {products.length > 0 && (
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded max-h-40 overflow-y-auto">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addLine(p)}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center justify-between"
              >
                <span>{p.product_code} — {p.name}</span>
                {!p.mh_unit_code && (
                  <span className="text-amber-400 text-[10px]">sin código MH de unidad</span>
                )}
              </button>
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-1.5">Producto</th>
                  <th className="text-right py-1.5">Cantidad</th>
                  <th className="text-right py-1.5">Precio unit.</th>
                  <th className="text-right py-1.5">Descuento</th>
                  <th className="text-right py-1.5">Total línea</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-zinc-900">
                    <td className="py-1.5 text-zinc-200">{l.product.name}</td>
                    <td className="py-1.5 text-right">
                      <input type="number" min={0.0001} step="0.0001" value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        className="w-20 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="py-1.5 text-right">
                      <input type="number" min={0} step="0.01" value={l.unit_price}
                        onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="py-1.5 text-right">
                      <input type="number" min={0} step="0.01" value={l.discount_amount}
                        onChange={(e) => updateLine(i, { discount_amount: Number(e.target.value) })}
                        className="w-20 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="py-1.5 text-right text-zinc-200">
                      {(l.quantity * l.unit_price - l.discount_amount).toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Datos fiscales de exportación */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">3. Datos fiscales de exportación</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo de ítem exportado</label>
            <select className={inputClass} value={itemTypeExport}
              onChange={(e) => setItemTypeExport(Number(e.target.value) as 1 | 2 | 3)}>
              {FEX_ITEM_TYPE_EXPORT.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div />
          {itemTypeExport !== 2 && (
            <>
              <div>
                <label className={labelClass}>Recinto fiscal (CAT-027)</label>
                <select className={inputClass} value={fiscalPrecinct} onChange={(e) => setFiscalPrecinct(e.target.value)}>
                  {FEX_FISCAL_PRECINCTS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Régimen (CAT-028)</label>
                <select className={inputClass} value={regimeCode} onChange={(e) => setRegimeCode(e.target.value)}>
                  {FEX_REGIMES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className={labelClass}>INCOTERM (CAT-031)</label>
            <select className={inputClass} value={incotermCode}
              onChange={(e) => {
                const inc = FEX_INCOTERMS.find((i) => i.code === e.target.value);
                setIncotermCode(e.target.value);
                setIncotermDesc(inc?.label ?? "");
              }}>
              {FEX_INCOTERMS.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Seguro (USD)</label>
            <input type="number" min={0} step="0.01" className={inputClass} value={insurance}
              onChange={(e) => setInsurance(Number(e.target.value))} />
          </div>
          <div>
            <label className={labelClass}>Flete (USD)</label>
            <input type="number" min={0} step="0.01" className={inputClass} value={freight}
              onChange={(e) => setFreight(Number(e.target.value))} />
          </div>
        </div>
      </section>

      {/* Venta / pago */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">4. Datos de la venta</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" className={inputClass} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Condición de operación (CAT-016)</label>
            <select className={inputClass} value={conditionCode} onChange={(e) => setConditionCode(e.target.value as "1" | "2" | "3")}>
              <option value="1">Contado</option>
              <option value="2">Crédito</option>
              <option value="3">Otro</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Forma de pago (CAT-017)</label>
            <input className={inputClass} value={paymentMethodCode} onChange={(e) => setPaymentMethodCode(e.target.value)} />
          </div>
          <div className="col-span-3">
            <label className={labelClass}>Observaciones (opcional)</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Resumen */}
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-zinc-400">
          <span>Subtotal líneas</span><span>{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Seguro + flete</span><span>{(insurance + freight).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-zinc-100 font-semibold pt-1 border-t border-zinc-800">
          <span>Total estimado</span><span>{total.toFixed(2)}</span>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          <Plus className="h-4 w-4" />
          Crear venta de exportación
        </button>
      </div>
    </div>
  );
}
