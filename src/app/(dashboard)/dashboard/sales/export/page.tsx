// ─────────────────────────────────────────────────────────────────
// /dashboard/sales/export — page.tsx
//
// F3-C21B — Ventas de exportación (módulo comercial real FEX 11).
// Layout operativo de una sola vista (mismo patrón que
// /dashboard/sales/new): no se envuelve en un contenedor con
// max-width — ExportSaleWorkspace controla su propio full-bleed
// bajo el header del dashboard.
//
// Guard: requireAdmin, igual que /dashboard/sales. FEX-PROD-1: el
// módulo se habilita solo si el ambiente fiscal efectivo de la
// sucursal (único DteIssuerConfig activo) tiene su flag FEX 11 activo
// (TEST o PRODUCTION). Nunca depende de NODE_ENV.
// FINAL-RUNTIME-CLOSURE: además exige la capability por organización
// fiscal.dte.export (resolveSalesExportAvailability).
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";
import { getCountries } from "@/modules/commerce/suppliers/queries/get-countries";
import { ExportSalePage } from "@/modules/commerce/sales/export/components/export-sale-page";
import { resolveSalesExportAvailability } from "@/modules/commerce/sales/export/services/sales-export-availability";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";

export const metadata = {
  title: "Ventas de exportación",
};

export default async function SalesExportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sessionUser = await requireAdmin();
  const { from } = await searchParams;

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  let availability: Awaited<ReturnType<typeof resolveSalesExportAvailability>> = {
    enabled: false, environment: null,
  };
  try {
    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ??
        (await getEffectiveLocationId(sessionUser, context.client, context.tenantId)));
    if (context.tenantId && location_id) {
      availability = await resolveSalesExportAvailability(context.tenantId, location_id, context.client);
    }
  } finally {
    await dispose();
  }

  const fex11Enabled = availability.enabled;

  // País (FEX-PROD-0B): receptor.codPais de FEX v3 = CAT-020 vigente
  // (modelo `Country`, ISO alpha-2). El catálogo de compatibilidad FEX v1
  // (FEX-11-V1-CODPAIS) queda solo como referencia histórica.
  const [cat016, cat017, countries, cat022, cat027, cat028, cat029, cat031] = fex11Enabled
    ? await Promise.all([
        listDteCatalogItems({ catalog_code: "CAT-016" }),
        listDteCatalogItems({ catalog_code: "CAT-017" }),
        getCountries(),
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
      environment={availability.environment ?? undefined}
      catalogCAT016={cat016}
      catalogCAT017={cat017}
      catalogCountries={countries}
      catalogCAT022={cat022}
      catalogCAT027={cat027}
      catalogCAT028={cat028}
      catalogCAT029={cat029}
      catalogCAT031={cat031}
      contextNote={from === "sales-new" ? "Redirigido desde Ventas — estás creando una venta de exportación (FEX 11)." : null}
    />
  );
}
