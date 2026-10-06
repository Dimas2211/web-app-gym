// ─────────────────────────────────────────────────────────────────
// purchases/[id]/edit/page.tsx
//
// Estación de captura para edición de una compra en DRAFT.
// Guard: requireAdmin. Solo compras DRAFT — redirige si no.
// Autorización Operativa: exige grant de ESTA compra (PURCHASE_EDIT por
// Clave de Supervisor, o PURCHASE_DRAFT_OWNER del creador del borrador
// importado). Entrar por URL directa sin grant redirige a la consulta.
// ─────────────────────────────────────────────────────────────────

import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseById } from "@/modules/commerce/purchases/queries/get-purchase-by-id";
import { PurchaseFormClient } from "@/modules/commerce/purchases/components/purchase-form-client";
import { prisma } from "@/lib/db/prisma";
import { checkOperationalGrant } from "@/core/security/operational-authorization/operational-authorization";
import { PURCHASE_DRAFT_WRITE_SCOPES } from "@/core/security/operational-authorization/scopes";
import type { SupplierForPurchaseLookup } from "@/modules/commerce/suppliers/types/supplier.types";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";

export const metadata = { title: "Editar compra" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPurchasePage({ params }: Props) {
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
    if (purchase.status !== "DRAFT") redirect("/dashboard/purchases");

    const grant = await checkOperationalGrant(
      { tenantId: context.tenantId, client: context.client ?? prisma, effectiveUser: { id: sessionUser.id } },
      PURCHASE_DRAFT_WRITE_SCOPES,
      id,
      { renew: false },
    );
    if (!grant.ok) redirect("/dashboard/purchases?auth=required");

    // Supplier lookup mínimo desde los campos disponibles en PurchaseDetail
    const initialSupplier: SupplierForPurchaseLookup = {
      id: purchase.supplier_id,
      supplier_code: "",
      name: purchase.supplier_name,
      taxpayer_type: "NON_TAXPAYER",
      nit: null,
      nrc: purchase.supplier_nrc ?? null,
      status: "active",
    };

    return (
      <PurchaseFormClient
        purchaseId={id}
        initialDetail={purchase}
        initialSupplier={initialSupplier}
        initialDate={purchase.purchase_date.toISOString().slice(0, 10)}
        initialCode={purchase.purchase_code}
        initialDocType={purchase.document_type ?? ""}
        initialDocSeries={purchase.document_series ?? ""}
        initialDocNumber={purchase.document_number ?? ""}
        initialPaymentCond={purchase.payment_condition ?? ""}
        initialCancelType={purchase.cancellation_type ?? ""}
        initialNotes={purchase.notes ?? ""}
      />
    );
  } finally {
    await dispose();
  }
}
