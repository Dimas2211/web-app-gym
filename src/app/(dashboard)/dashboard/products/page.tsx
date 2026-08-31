// ─────────────────────────────────────────────────────────────────
// commerce/products — page.tsx
//
// Página del catálogo maestro de productos.
// Servidor: carga todos los datos iniciales y los pasa al
// orquestador cliente (ProductsClient).
//
// Roles permitidos: super_admin, branch_admin, reception (lectura).
// canManage true solo para super_admin y branch_admin.
//
// Por qué se cargan allLines y allSublines completos:
//   ProductFilters filtra client-side por categoría/línea seleccionada.
//   Evita round-trips extra al cambiar selección en los selects.
//   Aceptable para catálogos de decenas a pocos miles de entradas.
//
// PASO 6A (Plataforma Multiindustria — Runtime Database Router):
// Página runtime-aware. Si el super_admin tiene una sesión "Operar
// como cliente" activa (ver RuntimeSessionBanner), resolveEffectiveTenantContext
// devuelve el tenant_id y el PrismaClient del perfil runtime en vez de
// los del propio super_admin — todas las queries de esta página
// (getProducts + los 6 lookups) los reciben como parámetro. canManage
// se fuerza a false en modo runtime: la sesión es siempre solo lectura.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getProducts } from "@/modules/commerce/products/queries/get-products";
import { getCategoriesLookup } from "@/modules/commerce/products/queries/lookups/get-categories-lookup";
import { getLinesLookup } from "@/modules/commerce/products/queries/lookups/get-lines-lookup";
import { getSublineLookup } from "@/modules/commerce/products/queries/lookups/get-sublines-lookup";
import { getUnitsLookup } from "@/modules/commerce/products/queries/lookups/get-units-lookup";
import { getTaxRatesLookup } from "@/modules/commerce/products/queries/lookups/get-tax-rates-lookup";
import { getSuppliersLookup } from "@/modules/commerce/products/queries/lookups/get-suppliers-lookup";
import { ProductsClient } from "@/modules/commerce/products/components/products-client";

export const metadata = {
  title: "Catálogo de productos",
};

export default async function ProductsPage() {
  const user = await getSessionOrRedirect();

  // Solo roles con acceso al catálogo (lectura)
  const canView =
    user.role === "super_admin" ||
    user.role === "branch_admin" ||
    user.role === "reception";

  if (!canView) {
    redirect("/dashboard");
  }

  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const { tenantId, client } = context;
  const canManage =
    !context.runtime && (user.role === "super_admin" || user.role === "branch_admin");

  try {
    // Carga inicial en paralelo: primera página + todos los lookups.
    // allLines/allSublines se cargan completos para que ProductFilters
    // pueda filtrarlos client-side sin round-trips adicionales.
    // pageSize 150 coincide con PAGE_SIZE del cliente (grilla única sin paginación visual)
    const [initialResult, categories, units, taxRates, suppliers] = await Promise.all([
      getProducts(tenantId, {
        sort: { field: "name", direction: "asc" },
        pagination: { page: 1, pageSize: 150 },
      }, client),
      getCategoriesLookup(tenantId, client),
      getUnitsLookup(client),
      getTaxRatesLookup(tenantId, client),
      getSuppliersLookup(tenantId, client),
    ]);

    // Cargar líneas de todas las categorías en paralelo
    const allLines = categories.length > 0
      ? (await Promise.all(
          categories.map((cat) => getLinesLookup(tenantId, cat.id, client))
        )).flat()
      : [];

    // Cargar sublíneas de todas las líneas en paralelo
    const allSublines = allLines.length > 0
      ? (await Promise.all(
          allLines.map((line) => getSublineLookup(tenantId, line.id, client))
        )).flat()
      : [];

    return (
      <ProductsClient
        initialItems={initialResult.items}
        initialTotal={initialResult.total}
        categories={categories}
        allLines={allLines}
        allSublines={allSublines}
        units={units}
        taxRates={taxRates}
        suppliers={suppliers}
        canManage={canManage}
      />
    );
  } finally {
    await dispose();
  }
}
