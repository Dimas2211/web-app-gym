// ─────────────────────────────────────────────────────────────────
// purchases/new/page.tsx
//
// Estación de captura de nueva compra en estado DRAFT.
// Guard: requireAdmin. Layout full-viewport sin envoltorio.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { PurchaseFormClient } from "@/modules/commerce/purchases/components/purchase-form-client";

export const metadata = { title: "Nueva compra" };

export default async function NewPurchasePage() {
  await requireAdmin();

  return (
    <PurchaseFormClient
      initialDate={new Date().toISOString().slice(0, 10)}
    />
  );
}
