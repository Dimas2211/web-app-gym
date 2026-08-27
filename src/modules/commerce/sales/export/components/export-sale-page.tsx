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

interface Props {
  fex11Enabled: boolean;
  catalogCAT016: DteCatalogItem[];
  catalogCAT017: DteCatalogItem[];
  catalogFexCountries: DteCatalogItem[]; // País — catálogo compatibilidad FEX v1 (F3-C23D)
  catalogCAT022: DteCatalogItem[];
  catalogCAT027: DteCatalogItem[];
  catalogCAT028: DteCatalogItem[];
  catalogCAT029: DteCatalogItem[];
  catalogCAT031: DteCatalogItem[];
  contextNote?: string | null;
}

export function ExportSalePage({
  fex11Enabled, catalogCAT016, catalogCAT017,
  catalogFexCountries, catalogCAT022, catalogCAT027, catalogCAT028, catalogCAT029, catalogCAT031,
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
            FEX 11 solo está habilitada para pruebas controladas en ambiente TEST. Activa{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">DTE_FEX11_ENABLED=YES</code> o{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">DTE_FEX11_TEST_ENABLED=YES</code>{" "}
            fuera de producción para usar este módulo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ExportSaleWorkspace
      catalogCAT016={catalogCAT016}
      catalogCAT017={catalogCAT017}
      catalogFexCountries={catalogFexCountries}
      catalogCAT022={catalogCAT022}
      catalogCAT027={catalogCAT027}
      catalogCAT028={catalogCAT028}
      catalogCAT029={catalogCAT029}
      catalogCAT031={catalogCAT031}
      onBack={() => router.push("/dashboard/sales")}
      contextNote={contextNote}
    />
  );
}
