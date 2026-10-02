"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-page.tsx
//
// F3-C21B — Punto de entrada del módulo comercial "Ventas de
// exportación" (FEX 11). Si el feature flag está deshabilitado,
// muestra un aviso dentro del layout normal del dashboard. Si está
// habilitado, delega en ExportSaleWorkspace: una pantalla operativa
// de una sola vista (mismo patrón que /dashboard/sales/new), sin
// depender de scroll general de página.
// ─────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ExportSaleWorkspace } from "./export-sale-workspace";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import type { CountryItem } from "@/modules/commerce/suppliers/types/supplier-catalogs.types";

interface Props {
  fex11Enabled: boolean;
  disabledReason?: string | null;
  environment?: "TEST" | "PRODUCTION";
  catalogCAT016: DteCatalogItem[];
  catalogCAT017: DteCatalogItem[];
  catalogCountries: CountryItem[]; // País — CAT-020 vigente (FEX v3)
  catalogCAT022: DteCatalogItem[];
  catalogCAT027: DteCatalogItem[];
  catalogCAT028: DteCatalogItem[];
  catalogCAT029: DteCatalogItem[];
  catalogCAT031: DteCatalogItem[];
  contextNote?: string | null;
}

export function ExportSalePage({
  fex11Enabled, disabledReason, environment, catalogCAT016, catalogCAT017,
  catalogCountries, catalogCAT022, catalogCAT027, catalogCAT028, catalogCAT029, catalogCAT031,
  contextNote,
}: Props) {
  const router = useRouter();

  if (!fex11Enabled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
            <AlertTriangle className="h-5 w-5" />
            Ventas de exportación — módulo deshabilitado
          </div>
          <p className="text-sm text-amber-800/90 leading-relaxed">
            Ventas de exportación no están habilitadas para esta organización.
          </p>
          {disabledReason && (
            <p className="mt-2 text-sm text-amber-800/90 leading-relaxed">
              Motivo: {disabledReason}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <ExportSaleWorkspace
      catalogCAT016={catalogCAT016}
      catalogCAT017={catalogCAT017}
      catalogCountries={catalogCountries}
      catalogCAT022={catalogCAT022}
      catalogCAT027={catalogCAT027}
      catalogCAT028={catalogCAT028}
      catalogCAT029={catalogCAT029}
      catalogCAT031={catalogCAT031}
      onBack={() => router.push("/dashboard/sales")}
      contextNote={contextNote}
      environment={environment}
    />
  );
}
