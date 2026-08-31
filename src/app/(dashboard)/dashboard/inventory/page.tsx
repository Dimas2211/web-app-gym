// ─────────────────────────────────────────────────────────────────
// commerce/inventory — dashboard/inventory/page.tsx
//
// Página del módulo de inventario. Server Component.
//
// Carga inicial:
//   - Sesión + roles
//   - Lista inicial de ProductLocations (page_size=150, activos, por código)
//
// Pasa los datos iniciales a InventoryClient para evitar un fetch
// redundante en mount. El cliente maneja todos los refetches posteriores.
//
// Roles con acceso:
//   - super_admin, branch_admin, reception (lectura)
//   - canManage: super_admin, branch_admin (registrar movimientos, activar/desactivar)
//
// Requiere tenant_id + location_id en sesión.
// Si falta alguno, redirige a /dashboard (sesión sin location activa).
//
// PASO 6A (Runtime Database Router): página runtime-aware. Con sesión
// "Operar como cliente" activa, lee tenant_id + PrismaClient del
// perfil runtime, y la location efectiva ya no viene del selector del
// super_admin (pertenece a SU tenant, no al del cliente) sino de la
// primera sucursal activa del tenant runtime
// (resolveRuntimeFirstLocationId — mismo criterio pragmático que
// Support Session: muestra representativa, no consolidado multi-sede).
// canManage se fuerza a false en modo runtime.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { getProductLocations } from "@/modules/commerce/inventory/queries/get-product-locations";
import { InventoryClient } from "@/modules/commerce/inventory/components/inventory-client";
import { MapPin } from "lucide-react";

export const metadata = {
  title: "Inventario",
};

// ── Componente de estado vacío — sin location seleccionada ────────
//
// Se muestra cuando el usuario es de alcance global (super_admin)
// y aún no ha seleccionado una location desde el selector del header.
// No es un error — es un estado esperado en el primer uso.

function NoLocationSelected() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <MapPin size={40} className="text-zinc-300 mb-4" />
      <h2 className="text-base font-semibold text-zinc-800 mb-1">
        Selecciona una sede para ver el inventario
      </h2>
      <p className="text-sm text-zinc-500 max-w-sm">
        Como administrador global, puedes operar en cualquier sede.
        Usa el selector de sede en la barra superior para elegir dónde trabajar.
      </p>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────

export default async function InventoryPage() {
  const user = await getSessionOrRedirect();

  // Solo roles con acceso al inventario (lectura mínima)
  const canView =
    user.role === "super_admin" ||
    user.role === "branch_admin" ||
    user.role === "reception";

  if (!canView) {
    redirect("/dashboard");
  }

  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const { tenantId, client } = context;
  if (!tenantId) {
    // Sesión sin tenant — no debería ocurrir en producción.
    // Si ocurre, es un problema de sesión, no de location.
    await dispose();
    redirect("/dashboard");
  }

  try {
    // Resolver la location efectiva:
    //   - modo runtime: primera sucursal activa del tenant runtime.
    //   - modo normal, branch_admin / reception: viene del JWT directamente.
    //   - modo normal, super_admin: cookie active_location_id (si fue seleccionada).
    const locationId = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : await getEffectiveLocationId(user);

    // Si no hay location efectiva y el usuario es global (super_admin) o
    // está en modo runtime: mostrar mensaje claro en lugar de rebotar.
    if (!locationId) {
      const caps = getCapabilities(user.role);
      if (caps.isGlobal || context.runtime) {
        return <NoLocationSelected />;
      }
      // Usuario no-global sin location_id en JWT — sesión corrupta.
      redirect("/dashboard");
    }

    const canManage = !context.runtime && (user.role === "super_admin" || user.role === "branch_admin");

    // Carga inicial: registros activos, ordenados por código.
    // page_size=150 coincide con PAGE_SIZE del cliente (grilla única sin paginación visual).
    const initialResult = await getProductLocations({
      tenant_id:      tenantId,
      location_id:    locationId,
      is_active:      true,
      sort_field:     "product_code",
      sort_direction: "asc",
      page_size:      150,
    }, client);

    return (
      <InventoryClient
        initialItems={initialResult.items}
        initialTotal={initialResult.total}
        canManage={canManage}
      />
    );
  } finally {
    await dispose();
  }
}
