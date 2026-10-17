import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { requireOperationalContext, OperationalContextError } from "@/modules/platform/runtime/require-operational-context";
import { InventoryMovementReportClient } from "@/modules/commerce/inventory/components/inventory-movement-report-client";

export const metadata = { title: "Reporte de movimientos de inventario" };

export default async function InventoryMovementReportPage() {
  const user = await getSessionOrRedirect();
  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory" });
  } catch (error) {
    if (error instanceof OperationalContextError) redirect("/dashboard");
    throw error;
  }

  const { context, dispose } = handle;
  try {
    if (!["super_admin", "branch_admin", "reception"].includes(context.effectiveUser.role)) {
      redirect("/dashboard");
    }
  } finally {
    await dispose();
  }

  return (
    <main className="p-4 md:p-8 max-w-7xl mx-auto text-zinc-100">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Historial auditable por sede, con entradas, salidas y saldos por movimiento.
        </p>
      </div>
      <InventoryMovementReportClient />
    </main>
  );
}
