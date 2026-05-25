// ─────────────────────────────────────────────────────────────────
// reports/commerce — page.tsx
//
// Dashboard de reportes comerciales.
// Guard: requireAdmin (super_admin | branch_admin).
// Carga shell SSR + datos completos client-side para soportar
// filtros dinámicos sin recargar la página.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { CommerceReportsClient } from "@/modules/commerce/reports/components/commerce-reports-client";

export const metadata = {
  title: "Reportes Comerciales",
};

export default async function CommerceReportsPage() {
  await requireAdmin();

  return (
    <main className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Reportes Comerciales</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Análisis de ventas y compras confirmadas por período y location activa.
        </p>
      </div>

      <CommerceReportsClient />
    </main>
  );
}
