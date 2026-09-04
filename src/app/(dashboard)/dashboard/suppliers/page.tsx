// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — page.tsx
//
// Página del maestro de proveedores.
// Servidor: carga la primera página del tenant y la pasa al
// orquestador cliente (SuppliersClient).
//
// Roles permitidos: super_admin, branch_admin únicamente.
// requireAdmin() redirige al /dashboard si el rol no califica.
//
// canManage: siempre true para estos roles (acceso implica gestión).
//
// Sin preload de catálogos (países, municipios, actividades) aquí:
// se cargan on-demand desde cliente cuando se abren los formularios.
//
// PASO 6A (Runtime Database Router): página runtime-aware. Con sesión
// "Operar como cliente" activa, lee tenant_id + PrismaClient del
// perfil runtime en vez de los del super_admin. canManage se fuerza
// a false en modo runtime (sesión siempre solo lectura).
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { getSuppliers } from "@/modules/commerce/suppliers/queries/get-suppliers";
import { SuppliersClient } from "@/modules/commerce/suppliers/components/suppliers-client";

export const metadata = {
  title: "Maestro de proveedores",
};

export default async function SuppliersPage() {
  const user = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(user);

  try {
    await requireOrganizationModule(context.tenantId, "commerce.suppliers");

    const result = await getSuppliers({
      tenant_id:      context.tenantId,
      sort_field:     "name",
      sort_direction: "asc",
      page_size:      150,
    }, context.client);

    return (
      <SuppliersClient
        initialItems={result.items}
        initialTotal={result.total}
        canManage={!context.runtime}
      />
    );
  } finally {
    await dispose();
  }
}
