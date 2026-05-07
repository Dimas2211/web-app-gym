"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-form-client.tsx
//
// Orquestador de la estación de captura documental de compras.
// Layout de 5 zonas fijas (sin scroll de página):
//   A — cabecera documental (2 filas compactas + guardar)
//   B — strip de captura rápida de línea
//   C — grilla de líneas existentes (scroll interno)
//   D — grilla de búsqueda de productos (scroll interno)
//   E — panel lateral de totales + confirmar
// ─────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseDetail, ProductForPurchaseLookup } from "../types/purchase.types";
import type { SupplierForPurchaseLookup } from "@/modules/commerce/suppliers/types/supplier.types";
import { PurchaseFormHeader }          from "./purchase-form-header";
import { PurchaseFormLines }           from "./purchase-form-lines";
import { PurchaseFormProductSearch }   from "./purchase-form-product-search";
import { PurchaseFormTotals }          from "./purchase-form-totals";
import { PurchaseDteDocumentInfo }     from "./purchase-dte-document-info";
import { confirmPurchaseAction }       from "../actions/confirm-purchase.action";

export interface PurchaseFormClientProps {
  purchaseId?:         string;
  initialDetail?:      PurchaseDetail;
  initialSupplier?:    SupplierForPurchaseLookup | null;
  initialDate?:        string;
  initialCode?:        string;
  initialDocType?:     string;
  initialDocSeries?:   string;
  initialDocNumber?:   string;
  initialPaymentCond?: string;
  initialCancelType?:  string;
  initialNotes?:       string;
}

export function PurchaseFormClient({
  purchaseId:         initialPurchaseId,
  initialDetail,
  initialSupplier     = null,
  initialDate         = new Date().toISOString().slice(0, 10),
  initialCode         = "",
  initialDocType      = "",
  initialDocSeries    = "",
  initialDocNumber    = "",
  initialPaymentCond  = "",
  initialCancelType   = "",
  initialNotes        = "",
}: PurchaseFormClientProps) {
  const router = useRouter();

  const [purchaseId,      setPurchaseId]      = useState<string | null>(initialPurchaseId ?? null);
  const [detail,          setDetail]          = useState<PurchaseDetail | null>(initialDetail ?? null);
  const [selectedProduct, setSelectedProduct] = useState<ProductForPurchaseLookup | null>(null);
  const [isConfirming,    startConfirm]       = useTransition();
  const [confirmError,    setConfirmError]    = useState<string | null>(null);
  const [clearVersion,    setClearVersion]    = useState(0);
  const refreshSeq = useRef(0);

  // ── refreshDetail: stable (empty deps) — caller always provides id ──
  const refreshDetail = useCallback(async (id: string) => {
    const seq = ++refreshSeq.current;
    const res = await fetch(`/api/purchases/${id}`, { cache: "no-store" });
    if (res.ok && seq === refreshSeq.current) {
      setDetail(await res.json() as PurchaseDetail);
    }
  }, []);

  // ── handleHeaderSaved: memoized — prevents infinite useEffect loop in child ──
  const handleHeaderSaved = useCallback((id: string, created: boolean) => {
    if (created) setPurchaseId(id);
    refreshDetail(id);
  }, [refreshDetail]);

  // ── Confirm ───────────────────────────────────────────────────────
  function handleConfirm() {
    if (!purchaseId) return;
    setConfirmError(null);
    startConfirm(async () => {
      const fd = new FormData();
      fd.set("purchase_id", purchaseId);
      const result = await confirmPurchaseAction(undefined, fd);
      if (!result?.error) {
        router.push("/dashboard/purchases");
      } else {
        setConfirmError(result.error);
      }
    });
  }

  const handleClearPurchase = useCallback(() => {
    refreshSeq.current += 1;
    setPurchaseId(null);
    setDetail(null);
    setSelectedProduct(null);
    setConfirmError(null);
    setClearVersion((v) => v + 1);
  }, []);

  const handleDetailUpdated = useCallback((nextDetail: PurchaseDetail) => {
    if (nextDetail.id === purchaseId) {
      setDetail(nextDetail);
    }
  }, [purchaseId]);

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 flex flex-col bg-zinc-950 h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* Zone A */}
      <PurchaseFormHeader
        purchaseId={purchaseId}
        initialSupplier={initialSupplier}
        initialDate={initialDate}
        initialCode={initialCode}
        initialDocType={initialDocType}
        initialDocSeries={initialDocSeries}
        initialDocNumber={initialDocNumber}
        initialPaymentCond={initialPaymentCond}
        initialCancelType={initialCancelType}
        initialNotes={initialNotes}
        onSaved={handleHeaderSaved}
      />

      {/* Zone A.5: Datos DTE — visible solo cuando la compra proviene de importación DTE */}
      {(initialDetail?.source_type === "DTE_IMPORT" ||
        !!(initialDetail?.generation_code || initialDetail?.control_number)) && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-500/80 mb-1.5">
            Datos DTE
          </span>
          <PurchaseDteDocumentInfo
            generation_code={initialDetail?.generation_code}
            control_number={initialDetail?.control_number}
            reception_stamp={initialDetail?.reception_stamp}
            dte_environment_code={initialDetail?.dte_environment_code}
            compact
          />
        </div>
      )}

      {/* Middle: B + C + D (izq) y E (der) */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

        {/* Columna izquierda */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <PurchaseFormLines
              purchaseId={purchaseId}
              detail={detail}
              selectedProduct={selectedProduct}
              clearVersion={clearVersion}
              onRefresh={() => purchaseId ? refreshDetail(purchaseId) : Promise.resolve()}
              onClearProduct={() => setSelectedProduct(null)}
              onItemAdded={handleDetailUpdated}
            />
          </div>

          <div className="flex-none h-44">
            <PurchaseFormProductSearch onSelect={setSelectedProduct} />
          </div>
        </div>

        {/* Columna derecha: Zone E */}
        <div className="flex-none w-52">
          <PurchaseFormTotals
            detail={detail}
            purchaseId={purchaseId}
            isConfirming={isConfirming}
            confirmError={confirmError}
            onConfirm={handleConfirm}
            onBack={() => router.push("/dashboard/purchases")}
            onClear={handleClearPurchase}
          />
        </div>

      </div>
    </div>
  );
}
