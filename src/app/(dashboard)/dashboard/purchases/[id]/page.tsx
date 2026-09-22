// ─────────────────────────────────────────────────────────────────
// purchases/[id]/page.tsx
//
// Vista persistente de solo lectura para una compra CONFIRMED o
// CANCELLED. NO permite edición — para eso existe /purchases/[id]/edit,
// exclusivo de DRAFT.
//
// Muestra: datos principales, proveedor, líneas, totales, retenciones,
// estado, información de inventario ya confirmada y — cuando la compra
// está marcada FSE — el Panel Fiscal DTE (PurchaseDteFiscalPanel).
//
// Guard: requireAdmin.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseById } from "@/modules/commerce/purchases/queries/get-purchase-by-id";
import { PurchaseDteFiscalPanel } from "@/modules/commerce/purchases/components/purchase-dte-fiscal-panel";
import {
  DOCUMENT_TYPE_LABELS,
  PAYMENT_CONDITION_LABELS,
} from "@/modules/commerce/purchases/constants/purchase-document.constants";
import { getFseCorrelativeStatusForPurchase } from "@/modules/commerce/dte/queries/get-fse-correlative-status-for-purchase";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";

export const metadata = { title: "Detalle de compra" };

interface Props {
  params: Promise<{ id: string }>;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params;

  const sessionUser = await requireAdmin();
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);

  try {
    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ??
        (await getEffectiveLocationId(sessionUser, context.client, context.tenantId)));

    if (!context.tenantId || !location_id) redirect("/dashboard/purchases");

    const purchase = await getPurchaseById(id, context.tenantId, location_id, context.client);
    if (!purchase) notFound();
    if (purchase.status === "DRAFT") redirect(`/dashboard/purchases/${id}/edit`);

    // Estado del correlativo DTE tipo "14" (FSE) — solo lectura, para el
    // bloque "Correlativo DTE" del Panel Fiscal. Solo se consulta cuando
    // la compra puede realmente emitir FSE (evita ruido/errores en compras
    // no-FSE que no tienen configuración de emisor relevante aquí).
    const correlativeStatus =
      purchase.document_type === "FSE"
        ? await getFseCorrelativeStatusForPurchase(
            {
              tenant_id: context.tenantId,
              location_id,
              existing_dte_issuer_config_id: purchase.dte_document?.issuer_config_id ?? null,
              existing_dte_environment:
                (purchase.dte_document?.environment as "TEST" | "PRODUCTION" | undefined) ?? null,
            },
            context.client
          )
        : null;

    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        {/* ── Encabezado ─────────────────────────────────────────── */}
        <div className="flex flex-none items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-100">
                Compra {purchase.purchase_code}
              </h1>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  purchase.status === "CONFIRMED"
                    ? "border border-emerald-700/50 bg-emerald-900/40 text-emerald-300"
                    : "border border-red-700/50 bg-red-900/40 text-red-300"
                }`}
              >
                {purchase.status === "CONFIRMED" ? "Confirmada" : "Anulada"}
              </span>
              {purchase.document_type && (
                <span className="text-[10px] text-zinc-500">
                  {DOCUMENT_TYPE_LABELS[purchase.document_type] ?? purchase.document_type}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {purchase.supplier_name} · {purchase.purchase_date_label}
            </p>
          </div>
          <Link
            href="/dashboard/purchases"
            className="flex h-7 items-center rounded border border-zinc-700 px-3 text-xs text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Volver a compras
          </Link>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* ── Datos principales ──────────────────────────────────── */}
          <section className="grid grid-cols-4 gap-4 rounded border border-zinc-800 bg-zinc-900/60 p-3">
            <div>
              <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
                Proveedor
              </span>
              <span className="block text-xs text-zinc-200">{purchase.supplier_name}</span>
              {purchase.supplier_nrc && (
                <span className="block font-mono text-[10px] text-zinc-500">
                  NRC {purchase.supplier_nrc}
                </span>
              )}
            </div>
            <div>
              <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
                Documento
              </span>
              <span className="block text-xs text-zinc-200">
                {purchase.document_series || purchase.document_number
                  ? `${purchase.document_series ?? ""} ${purchase.document_number ?? ""}`.trim()
                  : "—"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
                Condición de pago
              </span>
              <span className="block text-xs text-zinc-200">
                {purchase.payment_condition
                  ? (PAYMENT_CONDITION_LABELS[purchase.payment_condition] ??
                    purchase.payment_condition)
                  : "—"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
                Confirmada
              </span>
              <span className="block text-xs text-zinc-200">
                {purchase.confirmed_at_label ?? "—"}
              </span>
              {purchase.confirmed_by_name && (
                <span className="block text-[10px] text-zinc-500">
                  {purchase.confirmed_by_name}
                </span>
              )}
            </div>
            {purchase.status === "CANCELLED" && (
              <>
                <div>
                  <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
                    Anulada
                  </span>
                  <span className="block text-xs text-zinc-200">
                    {purchase.cancelled_at_label ?? "—"}
                  </span>
                  {purchase.cancelled_by_name && (
                    <span className="block text-[10px] text-zinc-500">
                      {purchase.cancelled_by_name}
                    </span>
                  )}
                </div>
              </>
            )}
            {purchase.notes && (
              <div className="col-span-4">
                <span className="block text-[10px] tracking-wider text-zinc-500 uppercase">
                  Notas
                </span>
                <span className="block text-xs text-zinc-300">{purchase.notes}</span>
              </div>
            )}
          </section>

          {/* ── Líneas ──────────────────────────────────────────────── */}
          <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900/60">
            <table className="w-full text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Cant.</th>
                  <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
                  <th className="px-3 py-2 text-right font-medium">Impuesto</th>
                  <th className="px-3 py-2 text-right font-medium">Total línea</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {purchase.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-1.5">
                      <span className="block text-zinc-200">{item.product_name}</span>
                      <span className="block font-mono text-[10px] text-zinc-500">
                        {item.product_code}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                      {item.quantity} {item.unit_symbol}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                      {money(item.unit_cost)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                      {money(item.tax_amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-100">
                      {money(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── Totales y retenciones ──────────────────────────────── */}
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1 rounded border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Subtotal</span>
                <span className="font-mono text-zinc-200">{money(purchase.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Impuesto</span>
                <span className="font-mono text-zinc-200">{money(purchase.tax_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800 pt-1 text-xs font-semibold">
                <span className="text-zinc-300">Total</span>
                <span className="font-mono text-zinc-100">{money(purchase.total_amount)}</span>
              </div>
            </div>
            <div className="space-y-1 rounded border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Retención IVA 1%</span>
                <span className="font-mono text-zinc-200">
                  {purchase.retention_1pct_applies
                    ? money(purchase.retention_1pct_amount)
                    : "No aplica"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">
                  Retención de Renta{" "}
                  {purchase.income_tax_withholding_rate != null
                    ? `(${purchase.income_tax_withholding_rate}%)`
                    : ""}
                </span>
                <span className="font-mono text-zinc-200">
                  {purchase.income_tax_withholding_applies
                    ? money(purchase.income_tax_withholding_amount)
                    : "No aplica"}
                </span>
              </div>
              <div className="flex justify-between border-t border-zinc-800 pt-1 text-xs font-semibold">
                <span className="text-zinc-300">Neto a pagar</span>
                <span className="font-mono text-zinc-100">
                  {money(
                    purchase.total_amount -
                      (purchase.retention_1pct_applies ? purchase.retention_1pct_amount : 0) -
                      (purchase.income_tax_withholding_applies
                        ? purchase.income_tax_withholding_amount
                        : 0)
                  )}
                </span>
              </div>
            </div>
          </section>

          {/* ── Inventario ──────────────────────────────────────────── */}
          {/*
          hasStockableItems: el mensaje anterior era genérico por
          purchase.status === "CONFIRMED", sin verificar si realmente
          hubo líneas stockables. confirmPurchase() (purchase.service.ts)
          filtra por product.is_stockable antes de crear movimientos —
          una compra de solo servicios (is_stockable=false) confirma sin
          generar ningún PURCHASE_IN, y el mensaje anterior lo afirmaba
          igual. Ver auditoría "PURCHASE_IN del producto servicio".
        */}
          <section className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
            <span className="mb-1 block text-[10px] tracking-wider text-zinc-500 uppercase">
              Inventario
            </span>
            <span className="text-xs text-zinc-300">
              {(() => {
                const hasStockableItems = purchase.items.some((i) => i.is_stockable);
                if (!hasStockableItems) {
                  return "Esta compra no tiene líneas de inventario almacenable (todos los productos son servicios u otros no-stockables) — no se generó ningún movimiento de inventario.";
                }
                return purchase.status === "CONFIRMED"
                  ? "El inventario ya fue aplicado (movimiento PURCHASE_IN) al confirmar esta compra."
                  : "El inventario fue revertido (movimiento RETURN_OUT) al anular esta compra.";
              })()}
            </span>
          </section>
        </div>

        {/* ── Panel Fiscal DTE (FSE 14) ───────────────────────────── */}
        <PurchaseDteFiscalPanel
          detail={purchase}
          correlativeStatus={correlativeStatus}
          isSuperAdmin={sessionUser.role === "super_admin"}
        />
      </div>
    );
  } finally {
    await dispose();
  }
}
