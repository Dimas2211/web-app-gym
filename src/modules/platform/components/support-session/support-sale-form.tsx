"use client";

// ─────────────────────────────────────────────────────────────────
// platform/components/support-session — support-sale-form.tsx
//
// F1-B1: Formulario "Nueva venta de prueba" desde Support Session.
// Escribe únicamente en la base del PlatformDatabaseProfile
// seleccionado — nunca en la base del .env.
//
// Flujo UX:
//  1. Cargar datos read-only (sucursales, clientes, productos, pagos).
//  2. Armar líneas y pedir "Vista previa" — llama al servidor en modo
//     DRY_RUN, que valida y recalcula todo sin escribir nada.
//  3. Con una vista previa válida, escribir el texto de confirmación
//     exacto y marcar el respaldo, luego "Crear venta" (modo EXECUTE).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { ShieldAlert, Loader2, AlertTriangle, CheckCircle2, Plus, Trash2, ArrowLeft } from "lucide-react";

import { getSupportSaleFormDataAction } from "../../actions/get-support-sale-form-data.action";
import { createSupportSaleAction }      from "../../actions/create-support-sale.action";
import { CREATE_SUPPORT_SALE_CONFIRMATION_TEXT } from "../../lib/support-session/create-support-sale.constants";
import type {
  SupportSaleFormData,
  CreateSupportSalePreviewResult,
  CreateSupportSaleResult,
  CreateSupportSaleItemInput,
} from "../../types/platform.types";

interface Props {
  profileId:    string;
  profileLabel: string;
  environment:  string;
}

interface FormLine {
  key:         string;
  product_id:  string;
  quantity:    string;
  unit_price:  string;
}

function newLine(): FormLine {
  return { key: crypto.randomUUID(), product_id: "", quantity: "1", unit_price: "" };
}

export function SupportSaleForm({ profileId, profileLabel, environment }: Props) {
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [formData, setFormData]           = useState<SupportSaleFormData | null>(null);

  const [locationId, setLocationId]       = useState("");
  const [customerId, setCustomerId]       = useState("");
  const [dteType, setDteType]             = useState<"01" | "03">("01");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes]                 = useState("");
  const [lines, setLines]                 = useState<FormLine[]>([newLine()]);

  const [confirmationText, setConfirmationText]     = useState("");
  const [hasBackupConfirmation, setHasBackupConfirmation] = useState(false);

  const [preview, setPreview]               = useState<CreateSupportSalePreviewResult | null>(null);
  const [previewSuccess, setPreviewSuccess] = useState(false);
  const [result, setResult]   = useState<CreateSupportSaleResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsLoadingData(true);
    getSupportSaleFormDataAction(profileId).then((data) => {
      setFormData(data);
      setIsLoadingData(false);
      if (data.success && data.branches.length > 0) setLocationId(data.branches[0].id);
    });
  }, [profileId]);

  const success = formData?.success === true ? formData : null;

  function buildItems(): CreateSupportSaleItemInput[] | null {
    const items: CreateSupportSaleItemInput[] = [];
    for (const line of lines) {
      if (!line.product_id) continue;
      const quantity   = Number(line.quantity);
      const unit_price = Number(line.unit_price);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      if (!Number.isFinite(unit_price) || unit_price < 0) return null;
      items.push({ product_id: line.product_id, quantity, unit_price });
    }
    return items.length > 0 ? items : null;
  }

  function handlePreview() {
    setError(null);
    setPreview(null);
    setPreviewSuccess(false);
    setResult(null);

    if (!locationId) { setError("Selecciona una sucursal."); return; }
    const items = buildItems();
    if (!items) { setError("Agrega al menos una línea válida (producto, cantidad y precio)."); return; }

    startTransition(async () => {
      const res = await createSupportSaleAction({
        profileId,
        mode: "DRY_RUN",
        location_id: locationId,
        customer_id: customerId || null,
        primary_dte_type_code: dteType,
        items,
        payment_method_code: paymentMethod || null,
        notes: notes || null,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }
      if (res.mode === "DRY_RUN") {
        setPreview(res.preview);
        setPreviewSuccess(true);
      }
    });
  }

  function handleExecute() {
    setError(null);

    if (!previewSuccess || !preview) {
      setError("Debes generar una vista previa exitosa y vigente antes de crear la venta. Cualquier cambio en la venta invalida la vista previa anterior.");
      return;
    }
    if (confirmationText.trim() !== CREATE_SUPPORT_SALE_CONFIRMATION_TEXT) {
      setError(`El texto de confirmación debe ser exactamente: ${CREATE_SUPPORT_SALE_CONFIRMATION_TEXT}`);
      return;
    }
    if (!hasBackupConfirmation) {
      setError("Debes confirmar que existe un respaldo reciente de esta base antes de crear la venta.");
      return;
    }
    if (!locationId) { setError("Selecciona una sucursal."); return; }
    const items = buildItems();
    if (!items) { setError("Agrega al menos una línea válida (producto, cantidad y precio)."); return; }

    startTransition(async () => {
      const res = await createSupportSaleAction({
        profileId,
        mode: "EXECUTE",
        location_id: locationId,
        customer_id: customerId || null,
        primary_dte_type_code: dteType,
        items,
        payment_method_code: paymentMethod || null,
        notes: notes || null,
        confirmationText,
        hasBackupConfirmation,
        hasDryRunConfirmation: true,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }
      if (res.mode === "EXECUTE") setResult(res.result);
    });
  }

  function updateLine(key: string, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setPreview(null);
    setPreviewSuccess(false);
    setResult(null);
  }

  function handleProductChange(key: string, productId: string) {
    const product = success?.products.find((p) => p.id === productId);
    updateLine(key, {
      product_id: productId,
      unit_price: product?.sale_price != null ? String(product.sale_price) : "",
    });
  }

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-zinc-500">
        <Loader2 size={20} className="animate-spin text-emerald-500" />
        <span className="text-sm">Cargando datos del perfil…</span>
      </div>
    );
  }

  if (!success) {
    return (
      <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-4">
        <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">{formData?.success === false ? formData.error : "No se pudieron cargar los datos del formulario."}</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-4">
          <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-green-800">Venta de prueba creada y confirmada</p>
            <p className="text-green-700">Código: <span className="font-mono font-semibold">{result.saleCode}</span></p>
            <p className="text-green-700">Total: ${result.total.toFixed(2)} — Líneas: {result.itemsCount}</p>
            <p className="text-green-700">Inventario movido: {result.inventoryMoved ? "Sí" : "No"}</p>
            {result.warnings.length > 0 && (
              <ul className="list-disc list-inside text-amber-700 text-xs mt-2">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        </div>
        <Link
          href={`/dashboard/platform/support-session/${profileId}`}
          className="inline-flex items-center gap-1.5 text-xs text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50"
        >
          <ArrowLeft size={12} /> Volver a la sesión de soporte
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
        <ShieldAlert size={15} className="text-indigo-600 shrink-0" />
        <span className="text-xs font-medium text-indigo-800">
          Estás creando una venta en la base del perfil seleccionado ({profileLabel} — {environment}).
          No estás usando la base del .env.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs space-y-1">
          <span className="text-zinc-500 font-medium">Sucursal *</span>
          <select
            value={locationId}
            onChange={(e) => { setLocationId(e.target.value); setPreview(null); setPreviewSuccess(false); setResult(null); }}
            className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="">Selecciona…</option>
            {success.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>

        <label className="text-xs space-y-1">
          <span className="text-zinc-500 font-medium">Tipo DTE</span>
          <select
            value={dteType}
            onChange={(e) => { setDteType(e.target.value as "01" | "03"); setPreview(null); setPreviewSuccess(false); setResult(null); }}
            className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="01">01 — Factura Electrónica</option>
            <option value="03">03 — Comprobante de Crédito Fiscal</option>
          </select>
        </label>

        <label className="text-xs space-y-1">
          <span className="text-zinc-500 font-medium">
            Cliente {dteType === "03" ? "*" : "(opcional)"}
          </span>
          <select
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setPreview(null); setPreviewSuccess(false); setResult(null); }}
            className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="">Consumidor final</option>
            {success.customers.map((c) => (
              <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Líneas de producto</span>
          <button
            type="button"
            onClick={() => { setLines((prev) => [...prev, newLine()]); setPreview(null); setPreviewSuccess(false); setResult(null); }}
            className="flex items-center gap-1 text-xs text-emerald-700 hover:underline"
          >
            <Plus size={12} /> Agregar línea
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-12 gap-2 items-center">
              <select
                value={line.product_id}
                onChange={(e) => handleProductChange(line.key, e.target.value)}
                className="col-span-6 border border-zinc-200 rounded-lg px-2.5 py-2 text-xs"
              >
                <option value="">Selecciona producto…</option>
                {success.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_code} — {p.name} {p.is_stockable ? "" : "(servicio)"}
                  </option>
                ))}
              </select>
              <input
                type="number" min="0.0001" step="any" placeholder="Cantidad"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                className="col-span-2 border border-zinc-200 rounded-lg px-2.5 py-2 text-xs"
              />
              <input
                type="number" min="0" step="0.01" placeholder="Precio unitario"
                value={line.unit_price}
                onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                className="col-span-3 border border-zinc-200 rounded-lg px-2.5 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  setLines((prev) => prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev);
                  setPreview(null); setPreviewSuccess(false); setResult(null);
                }}
                className="col-span-1 text-zinc-400 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs space-y-1">
          <span className="text-zinc-500 font-medium">Método de pago (opcional)</span>
          <select
            value={paymentMethod}
            onChange={(e) => { setPaymentMethod(e.target.value); setPreview(null); setPreviewSuccess(false); setResult(null); }}
            className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="">Sin pago — queda UNPAID</option>
            {success.paymentMethods.map((m) => (
              <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-zinc-500 font-medium">Notas (opcional)</span>
          <input
            type="text" value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handlePreview}
        disabled={isPending}
        className="text-xs font-semibold text-white bg-zinc-700 hover:bg-zinc-800 rounded-lg px-4 py-2 disabled:opacity-50"
      >
        {isPending ? "Calculando…" : "Vista previa (servidor)"}
      </button>

      {preview && (
        <div className="space-y-3 bg-zinc-50 border border-zinc-100 rounded-lg p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Vista previa calculada por el servidor — el total real puede variar levemente al confirmar
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-200">
                <th className="text-left pb-1">Producto</th>
                <th className="text-right pb-1">Cant.</th>
                <th className="text-right pb-1">P. unit.</th>
                <th className="text-right pb-1">Subtotal</th>
                <th className="text-right pb-1">IVA</th>
                <th className="text-right pb-1">Total</th>
                <th className="text-right pb-1">Stock disp.</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((i) => (
                <tr key={i.product_id} className="border-b border-zinc-100">
                  <td className="py-1">{i.product_name}</td>
                  <td className="text-right">{i.quantity}</td>
                  <td className="text-right">${i.unit_price.toFixed(2)}</td>
                  <td className="text-right">${i.line_subtotal.toFixed(2)}</td>
                  <td className="text-right">${i.tax_amount.toFixed(2)}</td>
                  <td className="text-right font-medium">${i.line_total.toFixed(2)}</td>
                  <td className="text-right text-zinc-400">{i.available_stock ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-4 text-xs font-semibold text-zinc-700">
            <span>Subtotal: ${preview.totals.subtotal.toFixed(2)}</span>
            <span>IVA: ${preview.totals.tax_amount.toFixed(2)}</span>
            <span>Total: ${preview.totals.total_amount.toFixed(2)}</span>
          </div>

          <div className="border-t border-zinc-200 pt-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={hasBackupConfirmation}
                onChange={(e) => setHasBackupConfirmation(e.target.checked)}
              />
              Confirmo que existe un respaldo reciente y verificado de esta base de datos.
            </label>
            <label className="text-xs space-y-1 block">
              <span className="text-zinc-500 font-medium">
                Escribe exactamente: <span className="font-mono text-zinc-700">{CREATE_SUPPORT_SALE_CONFIRMATION_TEXT}</span>
              </span>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm font-mono"
              />
            </label>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPending}
              className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {isPending ? "Creando…" : "Crear venta (EXECUTE)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
