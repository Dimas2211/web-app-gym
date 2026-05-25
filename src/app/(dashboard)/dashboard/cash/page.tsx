// ─────────────────────────────────────────────────────────────────
// cash — page.tsx
//
// Pantalla principal del módulo de caja.
// Guard: requireAdmin (super_admin | branch_admin).
// Carga inicial: workspace de caja de la location efectiva.
// ─────────────────────────────────────────────────────────────────

import { getCashWorkspaceStateAction } from "@/modules/commerce/cash/actions/get-cash-workspace-state.action";
import { CashClient } from "@/modules/commerce/cash/components/cash-client";

export const metadata = {
  title: "Caja",
};

export default async function CashPage() {
  const result = await getCashWorkspaceStateAction({});

  if (!result.ok) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        {result.error ?? "No se pudo cargar el estado de caja."}
      </div>
    );
  }

  return (
    <CashClient initialState={result.data} />
  );
}
