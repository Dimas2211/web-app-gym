// ─────────────────────────────────────────────────────────────────
// /dashboard/sales/export — page.tsx
//
// F3-C21B — Ventas de exportación (módulo comercial real FEX 11).
// Layout operativo de una sola vista (mismo patrón que
// /dashboard/sales/new): no se envuelve en un contenedor con
// max-width — ExportSaleWorkspace controla su propio full-bleed
// bajo el header del dashboard.
//
// Guard: requireAdmin, igual que /dashboard/sales. Bloqueada si ni
// DTE_FEX11_ENABLED ni DTE_FEX11_TEST_ENABLED están activos, o si
// NODE_ENV === "production" (isFex11Enabled ya aplica ambas reglas).
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { isFex11Enabled } from "@/modules/commerce/dte/utils/fex11-feature-guard";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";
import { ExportSalePage } from "@/modules/commerce/sales/export/components/export-sale-page";

export const metadata = {
  title: "Ventas de exportación",
};

export default async function SalesExportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await requireAdmin();
  const { from } = await searchParams;

  const fex11Enabled = isFex11Enabled();

  const [cat016, cat017, cat020, cat022, cat027, cat028, cat029, cat031] = fex11Enabled
    ? await Promise.all([
        listDteCatalogItems({ catalog_code: "CAT-016" }),
        listDteCatalogItems({ catalog_code: "CAT-017" }),
        listDteCatalogItems({ catalog_code: "CAT-020" }),
        listDteCatalogItems({ catalog_code: "CAT-022" }),
        listDteCatalogItems({ catalog_code: "CAT-027" }),
        listDteCatalogItems({ catalog_code: "CAT-028" }),
        listDteCatalogItems({ catalog_code: "CAT-029" }),
        listDteCatalogItems({ catalog_code: "CAT-031" }),
      ])
    : [[], [], [], [], [], [], [], []];

  return (
    <ExportSalePage
      fex11Enabled={fex11Enabled}
      catalogCAT016={cat016}
      catalogCAT017={cat017}
      catalogCAT020={cat020}
      catalogCAT022={cat022}
      catalogCAT027={cat027}
      catalogCAT028={cat028}
      catalogCAT029={cat029}
      catalogCAT031={cat031}
      contextNote={from === "sales-new" ? "Redirigido desde Ventas — estás creando una venta de exportación (FEX 11)." : null}
    />
  );
}
