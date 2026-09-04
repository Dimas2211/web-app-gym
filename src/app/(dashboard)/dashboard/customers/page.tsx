// ─────────────────────────────────────────────────────────────────
// commerce/customers — page.tsx
//
// Página del maestro de clientes fiscales.
// Servidor: carga la primera página del tenant y pasa al
// orquestador cliente (CustomersClient).
//
// Roles permitidos: super_admin, branch_admin.
// requireAdmin() redirige al /dashboard si el rol no califica.
//
// PASO 6A (Runtime Database Router): página runtime-aware. Con sesión
// "Operar como cliente" activa, lee tenant_id + PrismaClient del
// perfil runtime en vez de los del super_admin. canManage se fuerza
// a false en modo runtime (sesión siempre solo lectura).
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { listCustomers } from "@/modules/commerce/customers/queries/list-customers";
import { CustomersClient } from "@/modules/commerce/customers/components/customers-client";

export const metadata = {
  title: "Maestro de clientes",
};

export default async function CustomersPage() {
  const user = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(user);

  try {
    await requireOrganizationModule(context.tenantId, "core.customers");

    const result = await listCustomers({
      tenant_id:      context.tenantId,
      sort_field:     "name",
      sort_direction: "asc",
      page:           1,
      page_size:      150,
    }, context.client);

    return (
      <CustomersClient
        initialItems={result.items}
        initialTotal={result.total}
        canManage={!context.runtime}
      />
    );
  } finally {
    await dispose();
  }
}
