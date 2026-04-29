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
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getSuppliers } from "@/modules/commerce/suppliers/queries/get-suppliers";
import { SuppliersClient } from "@/modules/commerce/suppliers/components/suppliers-client";

export const metadata = {
  title: "Maestro de proveedores",
};

export default async function SuppliersPage() {
  const user = await requireAdmin();

  const result = await getSuppliers({
    tenant_id:      user.tenant_id,
    sort_field:     "name",
    sort_direction: "asc",
    page_size:      150,
  });

  return (
    <SuppliersClient
      initialItems={result.items}
      initialTotal={result.total}
      canManage={true}
    />
  );
}
