// ─────────────────────────────────────────────────────────────────
// purchases/[id]/edit/page.tsx
//
// Estación de captura para edición de una compra en DRAFT.
// Guard: requireAdmin. Solo compras DRAFT — redirige si no.
// ─────────────────────────────────────────────────────────────────

import { notFound, redirect } from "next/navigation";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseById }        from "@/modules/commerce/purchases/queries/get-purchase-by-id";
import { PurchaseFormClient }     from "@/modules/commerce/purchases/components/purchase-form-client";
import type { SupplierForPurchaseLookup } from "@/modules/commerce/suppliers/types/supplier.types";

export const metadata = { title: "Editar compra" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPurchasePage({ params }: Props) {
  const { id } = await params;

  const sessionUser = await requireAdmin();
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!sessionUser.tenant_id || !location_id) redirect("/dashboard/purchases");

  const purchase = await getPurchaseById(id, sessionUser.tenant_id, location_id);
  if (!purchase) notFound();
  if (purchase.status !== "DRAFT") redirect("/dashboard/purchases");

  // Supplier lookup mínimo desde los campos disponibles en PurchaseDetail
  const initialSupplier: SupplierForPurchaseLookup = {
    id:            purchase.supplier_id,
    supplier_code: "",
    name:          purchase.supplier_name,
    taxpayer_type: "NON_TAXPAYER",
    nit:           null,
    nrc:           purchase.supplier_nrc ?? null,
    status:        "active",
  };

  return (
    <PurchaseFormClient
      purchaseId={id}
      initialDetail={purchase}
      initialSupplier={initialSupplier}
      initialDate={purchase.purchase_date.toISOString().slice(0, 10)}
      initialCode={purchase.purchase_code}
      initialDocType={purchase.document_type     ?? ""}
      initialDocSeries={purchase.document_series  ?? ""}
      initialDocNumber={purchase.document_number  ?? ""}
      initialPaymentCond={purchase.payment_condition ?? ""}
      initialCancelType={purchase.cancellation_type  ?? ""}
      initialNotes={purchase.notes ?? ""}
    />
  );
}
