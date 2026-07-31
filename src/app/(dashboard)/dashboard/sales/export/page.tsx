// ─────────────────────────────────────────────────────────────────
// /dashboard/sales/export — page.tsx
//
// F3-C21 — Ventas de exportación (módulo comercial real FEX 11).
//
// Guard: requireAdmin, igual que /dashboard/sales. Bloqueada si ni
// DTE_FEX11_ENABLED ni DTE_FEX11_TEST_ENABLED están activos, o si
// NODE_ENV === "production" (isFex11Enabled ya aplica ambas reglas).
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { isFex11Enabled } from "@/modules/commerce/dte/utils/fex11-feature-guard";
import { ExportSalePage } from "@/modules/commerce/sales/export/components/export-sale-page";

export const metadata = {
  title: "Ventas de exportación",
};

export default async function SalesExportPage() {
  await requireAdmin();

  const fex11Enabled = isFex11Enabled();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ExportSalePage fex11Enabled={fex11Enabled} />
    </div>
  );
}
