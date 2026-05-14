// ─────────────────────────────────────────────────────────────────
// commerce/customers — page.tsx
//
// Página del maestro de clientes fiscales.
// Servidor: carga la primera página del tenant y pasa al
// orquestador cliente (CustomersClient).
//
// Roles permitidos: super_admin, branch_admin.
// requireAdmin() redirige al /dashboard si el rol no califica.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { listCustomers } from "@/modules/commerce/customers/queries/list-customers";
import { CustomersClient } from "@/modules/commerce/customers/components/customers-client";

export const metadata = {
  title: "Maestro de clientes",
};

export default async function CustomersPage() {
  const user = await requireAdmin();

  const result = await listCustomers({
    tenant_id:      user.tenant_id,
    sort_field:     "name",
    sort_direction: "asc",
    page:           1,
    page_size:      150,
  });

  return (
    <CustomersClient
      initialItems={result.items}
      initialTotal={result.total}
      canManage={true}
    />
  );
}
