"use server";

// ─────────────────────────────────────────────────────────────────
// platform — inspect-database-profile.action.ts
//
// Inspector read-only de base de datos cliente (C4).
// Obtiene resumen operativo básico conectando vía el Runtime Database
// Router (withRuntimePrismaForInspection) al perfil indicado.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Nunca devuelve encrypted_password, DATABASE_URL ni credenciales.
// - La conexión runtime la resuelve y desconecta el router — esta
//   action nunca construye la URL ni maneja el password.
// - Cada bloque tiene try/catch independiente — un bloque fallido
//   no tumba el inspector; agrega warning y continúa.
// - Solo lectura: count, findMany, findFirst. Sin writes.
// - No ejecuta migraciones ni seeds.
// - No modifica el Prisma singleton normal.
//
// Separación de capas (PASO 3 — Runtime Database Router):
// - Control plane (metadata del perfil/organización): controlPlanePrisma.
// - Client runtime (datos de la base cliente): withRuntimePrismaForInspection.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import { sanitizeDatabaseError }     from "../lib/database-profile-url";
import { controlPlanePrisma }        from "../runtime/control-plane-prisma";
import { withRuntimePrismaForInspection } from "../runtime/runtime-database-router";
import type {
  DatabaseProfileInspectionResult,
  DatabaseInspectionSummary,
  DatabaseInspectionCatalogSummary,
  DatabaseInspectionTenant,
  DatabaseInspectionLocation,
  DatabaseInspectionAdmin,
  DatabaseInspectionSale,
  DatabaseInspectionDteDocument,
  DatabaseInspectionDteConfig,
} from "../types/platform.types";

// ── Helpers de serialización segura ──────────────────────────────

function safeDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return d.toISOString(); } catch { return ""; }
}

function safeDecimal(v: unknown): string {
  if (v === null || v === undefined) return "0";
  return String(v);
}

// ─────────────────────────────────────────────────────────────────

export async function inspectDatabaseProfileAction(
  profileId: string,
): Promise<DatabaseProfileInspectionResult> {
  await requireSuperAdmin();

  // Defaults de resultado vacío/fallido
  const empty: DatabaseProfileInspectionResult = {
    success:          false,
    profileLabel:     "",
    organizationName: "",
    tenantIdUsed:     null,
    summary: {
      tenants: 0, locations: 0, users: 0,
      products: 0, customers: 0, suppliers: 0,
      sales: 0, dteDocuments: 0, cashRegisters: 0,
    },
    tenant:        null,
    locations:     [],
    admins:        [],
    recentSales:   [],
    recentDte:     [],
    dteConfig:     null,
    catalogSummary: {
      unitsOfMeasure: 0, productCategories: 0,
      identificationTypes: 0, economicActivities: 0,
      municipalities: 0, dteCatalogItems: 0, taxRates: 0,
    },
    warnings: [],
  };

  if (!profileId || typeof profileId !== "string") {
    return { ...empty, error: "ID de perfil requerido." };
  }

  // Validar clave de cifrado
  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error
        ? err.message
        : "PLATFORM_ENCRYPTION_KEY no disponible.",
    };
  }

  // Buscar perfil + organización desde el control plane (solo metadata —
  // las credenciales de conexión las maneja internamente el router).
  const profile = await controlPlanePrisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: {
      id:    true,
      label: true,
      organization: {
        select: {
          name:      true,
          tenant_id: true,
        },
      },
    },
  });

  if (!profile) {
    return { ...empty, error: "Perfil de base de datos no encontrado." };
  }

  const profileLabel     = profile.label;
  const organizationName = profile.organization.name;
  const tenantIdUsed     = profile.organization.tenant_id ?? null;

  const warnings: string[] = [];
  const summary: DatabaseInspectionSummary = {
    tenants: 0, locations: 0, users: 0,
    products: 0, customers: 0, suppliers: 0,
    sales: 0, dteDocuments: 0, cashRegisters: 0,
  };
  const catalogSummary: DatabaseInspectionCatalogSummary = {
    unitsOfMeasure: 0, productCategories: 0,
    identificationTypes: 0, economicActivities: 0,
    municipalities: 0, dteCatalogItems: 0, taxRates: 0,
  };

  let tenant:      DatabaseInspectionTenant | null       = null;
  let locations:   DatabaseInspectionLocation[]          = [];
  let admins:      DatabaseInspectionAdmin[]             = [];
  let recentSales: DatabaseInspectionSale[]              = [];
  let recentDte:   DatabaseInspectionDteDocument[]       = [];
  let dteConfig:   DatabaseInspectionDteConfig | null    = null;

  // SHARED-PILOT-3 — FAIL CLOSED: sin tenant_id vinculado (organización sin
  // Tenant Binding) el Inspector YA NO cae al primer Gym físico ni a queries
  // sin filtro. Eso exponía datos cross-tenant (admins, ventas, DTE, etc.)
  // en topologías Shared Runtime (varios tenants en la misma DB física)
  // ante cualquier super_admin que abriera el Inspector antes del binding.
  //
  // Ahora: con tenantId → TODO dato ORGANIZATION_SCOPED se filtra por ese
  // tenant, igual que antes. Sin tenantId → ningún bloque ORGANIZATION_SCOPED
  // se consulta; solo se expone el conteo físico de tenants (PHYSICAL_DB,
  // metadata segura) y catálogos GLOBAL_REFERENCE, más un warning explícito
  // TENANT_BINDING_REQUIRED.
  const tenantId = tenantIdUsed;

  if (!tenantId) {
    warnings.push(
      "TENANT_BINDING_REQUIRED: la organización no tiene un tenant vinculado " +
      "(Tenant Binding). No se consultó ningún dato de tenant, locations, " +
      "usuarios, ventas, DTE ni catálogos organization-scoped para evitar " +
      "exponer datos de otros tenants que puedan compartir esta base física.",
    );
  }

  try {
    await withRuntimePrismaForInspection(profileId, async (client) => {

      // ── Bloque 1: Core — tenant (RuntimeTenant) y branches ────────
      // summary.tenants = PHYSICAL_DB (cantidad física de runtime_tenants
      // en la base) — siempre seguro de exponer, sin PII.
      try {
        summary.tenants = await client.runtimeTenant.count();
      } catch (err) {
        warnings.push(`Core/tenant: ${sanitizeDatabaseError(err)}`);
      }

      if (tenantId) {
        try {
          const rt = await client.runtimeTenant.findUnique({
            where:  { id: tenantId },
            select: { id: true, name: true, slug: true, status: true },
          });
          if (rt) {
            tenant = {
              id:     rt.id,
              name:   rt.name,
              slug:   rt.slug ?? null,
              status: rt.status ?? null,
            };
          }
        } catch (err) {
          warnings.push(`Core/tenant: ${sanitizeDatabaseError(err)}`);
        }

        try {
          const locationWhere = { tenant_id: tenantId };
          const rawLocations = await client.branch.findMany({
            where:   locationWhere,
            select:  { id: true, name: true, status: true },
            orderBy: { name: "asc" },
            take: 20,
          });
          locations = rawLocations.map((b) => ({
            id:     b.id,
            name:   b.name,
            status: b.status ?? null,
          }));
          summary.locations = await client.branch.count({ where: locationWhere });
        } catch (err) {
          warnings.push(`Core/locations: ${sanitizeDatabaseError(err)}`);
        }

        // ── Bloque 2: Usuarios admin ────────────────────────────────
        try {
          const userWhere = {
            role: { in: ["super_admin", "branch_admin"] as never[] },
            tenant_id: tenantId,
          };
          const rawUsers = await client.user.findMany({
            where: userWhere,
            select: {
              id:         true,
              first_name: true,
              last_name:  true,
              email:      true,
              role:       true,
            },
            orderBy: { created_at: "asc" },
            take: 10,
          });
          admins = rawUsers.map((u) => ({
            id:    u.id,
            name:  `${u.first_name} ${u.last_name}`.trim(),
            email: u.email,
            role:  String(u.role),
          }));
          summary.users = await client.user.count({ where: { tenant_id: tenantId } });
        } catch (err) {
          warnings.push(`Core/users: ${sanitizeDatabaseError(err)}`);
        }

        // ── Bloque 3: Commerce — conteos ───────────────────────────
        try {
          summary.products = await client.product.count({ where: { tenant_id: tenantId } });
        } catch (err) {
          warnings.push(`Commerce/products: ${sanitizeDatabaseError(err)}`);
        }

        try {
          summary.customers = await client.customer.count({ where: { tenant_id: tenantId } });
        } catch (err) {
          warnings.push(`Commerce/customers: ${sanitizeDatabaseError(err)}`);
        }

        try {
          summary.suppliers = await client.supplier.count({ where: { tenant_id: tenantId } });
        } catch (err) {
          warnings.push(`Commerce/suppliers: ${sanitizeDatabaseError(err)}`);
        }

        // ── Bloque 4: Ventas recientes ──────────────────────────────
        try {
          const saleWhere = { tenant_id: tenantId };
          summary.sales = await client.sale.count({ where: saleWhere });
          const rawSales = await client.sale.findMany({
            where:  saleWhere,
            select: {
              id:           true,
              sale_code:    true,
              status:       true,
              total_amount: true,
              created_at:   true,
            },
            orderBy: { created_at: "desc" },
            take: 8,
          });
          recentSales = rawSales.map((s) => ({
            id:           s.id,
            sale_code:    s.sale_code,
            status:       String(s.status),
            total_amount: safeDecimal(s.total_amount),
            created_at:   safeDate(s.created_at),
          }));
        } catch (err) {
          warnings.push(`Commerce/sales: ${sanitizeDatabaseError(err)}`);
        }

        // ── Bloque 5: DTE ───────────────────────────────────────────
        try {
          const dteWhere = { tenant_id: tenantId };
          summary.dteDocuments = await client.dteOutgoingDocument.count({ where: dteWhere });
          const rawDte = await client.dteOutgoingDocument.findMany({
            where:  dteWhere,
            select: {
              id:            true,
              dte_type_code: true,
              dte_status:    true,
              created_at:    true,
            },
            orderBy: { created_at: "desc" },
            take: 8,
          });
          recentDte = rawDte.map((d) => ({
            id:            d.id,
            dte_type_code: d.dte_type_code,
            dte_status:    String(d.dte_status),
            created_at:    safeDate(d.created_at),
          }));
        } catch (err) {
          warnings.push(`DTE/documents: ${sanitizeDatabaseError(err)}`);
        }

        try {
          const issuer = await client.dteIssuerConfig.findFirst({
            where: {
              is_active: true,
              tenant_id: tenantId,
            },
            select: {
              nit:         true,
              name:        true,
              is_active:   true,
              environment: true,
            },
            orderBy: { created_at: "asc" },
          });
          if (issuer) {
            dteConfig = {
              nit:         issuer.nit,
              name:        issuer.name,
              is_active:   issuer.is_active,
              environment: String(issuer.environment),
            };
          }
        } catch (err) {
          warnings.push(`DTE/config: ${sanitizeDatabaseError(err)}`);
        }

        // ── Bloque 6: Cash ──────────────────────────────────────────
        try {
          summary.cashRegisters = await client.cashRegister.count({ where: { tenant_id: tenantId } });
        } catch (err) {
          warnings.push(`Cash/registers: ${sanitizeDatabaseError(err)}`);
        }

        // ORGANIZATION_SCOPED catalog counts
        try {
          catalogSummary.productCategories = await client.productCategory.count({
            where: { tenant_id: tenantId },
          });
        } catch (err) {
          warnings.push(`Catalogs/categories: ${sanitizeDatabaseError(err)}`);
        }

        try {
          catalogSummary.taxRates = await client.taxRate.count({
            where: { tenant_id: tenantId },
          });
        } catch (err) {
          warnings.push(`Catalogs/tax-rates: ${sanitizeDatabaseError(err)}`);
        }
      }

      // ── Bloque 7: Catálogos GLOBAL_REFERENCE ───────────────────────
      // Nunca se filtran por tenant — son globales a la base física, y son
      // seguros de exponer incluso sin tenant vinculado.
      try {
        catalogSummary.unitsOfMeasure = await client.unitOfMeasure.count();
      } catch (err) {
        warnings.push(`Catalogs/UOM: ${sanitizeDatabaseError(err)}`);
      }

      try {
        catalogSummary.identificationTypes = await client.identificationType.count();
      } catch (err) {
        warnings.push(`Catalogs/id-types: ${sanitizeDatabaseError(err)}`);
      }

      try {
        catalogSummary.economicActivities = await client.economicActivity.count();
      } catch (err) {
        warnings.push(`Catalogs/activities: ${sanitizeDatabaseError(err)}`);
      }

      try {
        catalogSummary.municipalities = await client.municipality.count();
      } catch (err) {
        warnings.push(`Catalogs/municipalities: ${sanitizeDatabaseError(err)}`);
      }

      try {
        catalogSummary.dteCatalogItems = await client.dteCatalogItem.count();
      } catch (err) {
        warnings.push(`Catalogs/dte-catalog: ${sanitizeDatabaseError(err)}`);
      }

    }); // withRuntimePrismaForInspection — garantiza $disconnect()

  } catch (err) {
    // Error de conexión o error no manejado en el bloque raíz
    return {
      ...empty,
      profileLabel,
      organizationName,
      tenantIdUsed,
      error: sanitizeDatabaseError(err),
    };
  }

  return {
    success:          true,
    profileLabel,
    organizationName,
    tenantIdUsed,
    summary,
    tenant,
    locations,
    admins,
    recentSales,
    recentDte,
    dteConfig,
    catalogSummary,
    warnings,
  };
}
