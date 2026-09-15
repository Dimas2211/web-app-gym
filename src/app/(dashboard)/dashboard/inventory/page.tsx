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
import type { UserRole } from "@prisma/client";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
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
    await requireOrganizationModule(tenantId, "commerce.inventory");

    // Resolver la location efectiva:
    //   - Support Session ("Operar como cliente"): primera sucursal activa
    //     del tenant runtime — muestra representativa, solo lectura.
    //   - RUNTIME_CLIENT / modo normal, branch_admin / reception: viene de
    //     `context.locationId` (JWT ya revalidado LIVE contra runtimeDb
    //     para RUNTIME_CLIENT — ver ETAPA E de VI-D3).
    //   - modo normal / RUNTIME_CLIENT, super_admin (tenant-wide): cookie
    //     active_location_id, validada contra la DB EFECTIVA.
    const locationId = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ?? (await getEffectiveLocationId(user, context.client, context.tenantId)));

    // Si no hay location efectiva y el usuario es global (super_admin) o
    // está en modo runtime: mostrar mensaje claro en lugar de rebotar.
    if (!locationId) {
      const caps = getCapabilities(context.effectiveRole as UserRole);
      if (caps.isGlobal || context.runtime) {
        return <NoLocationSelected />;
      }
      // Usuario no-global sin location_id — sesión corrupta.
      redirect("/dashboard");
    }

    // FASE VI-D3: `readOnly` cubre Support Session; canManage usa el ROL
    // LIVE (context.effectiveRole) — no el rol del JWT.
    const canManage =
      !context.readOnly &&
      (context.effectiveRole === "super_admin" || context.effectiveRole === "branch_admin");

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
