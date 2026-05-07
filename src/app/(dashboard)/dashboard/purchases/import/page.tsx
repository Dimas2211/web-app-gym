// ─────────────────────────────────────────────────────────────────
// purchases/import — page.tsx
//
// Página de importación de compra desde JSON DTE.
// Guard: requireAdmin — mismo scope que purchases.
// No genera migraciones ni cambios en schema.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { PurchaseDteImportClient } from "@/modules/commerce/purchases/components/purchase-dte-import-client";

export const metadata = {
  title: "Importar compra desde DTE",
};

export default async function PurchasesImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-semibold text-zinc-100">Importar compra desde DTE</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Importa un documento tributario electrónico recibido en formato JSON para crear una compra en borrador.
        </p>
      </div>

      <PurchaseDteImportClient />
    </div>
  );
}
