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

  try {
    await withRuntimePrismaForInspection(profileId, async (client) => {

      // ── Bloque 1: Core — tenant (gym) y branches ─────────────────
      try {
        const gym = await client.gym.findFirst({
          select: { id: true, name: true, slug: true, status: true },
          orderBy: { created_at: "asc" },
        });
        if (gym) {
          tenant = {
            id:     gym.id,
            name:   gym.name,
            slug:   gym.slug ?? null,
            status: gym.status ?? null,
          };
        }
        summary.tenants = await client.gym.count();
      } catch (err) {
        warnings.push(`Core/tenant: ${sanitizeDatabaseError(err)}`);
      }

      try {
        const rawLocations = await client.branch.findMany({
          select:  { id: true, name: true, status: true },
          orderBy: { name: "asc" },
          take: 20,
        });
        locations = rawLocations.map((b) => ({
          id:     b.id,
          name:   b.name,
          status: b.status ?? null,
        }));
        summary.locations = await client.branch.count();
      } catch (err) {
        warnings.push(`Core/locations: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 2: Usuarios admin ──────────────────────────────────
      try {
        const rawUsers = await client.user.findMany({
          where: {
            role: { in: ["super_admin", "branch_admin"] as never[] },
          },
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
        summary.users = await client.user.count();
      } catch (err) {
        warnings.push(`Core/users: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 3: Commerce — conteos ─────────────────────────────
      try {
        summary.products  = await client.product.count();
      } catch (err) {
        warnings.push(`Commerce/products: ${sanitizeDatabaseError(err)}`);
      }

      try {
        summary.customers = await client.customer.count();
      } catch (err) {
        warnings.push(`Commerce/customers: ${sanitizeDatabaseError(err)}`);
      }

      try {
        summary.suppliers = await client.supplier.count();
      } catch (err) {
        warnings.push(`Commerce/suppliers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 4: Ventas recientes ────────────────────────────────
      try {
        summary.sales = await client.sale.count();
        const rawSales = await client.sale.findMany({
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

      // ── Bloque 5: DTE ─────────────────────────────────────────────
      try {
        summary.dteDocuments = await client.dteOutgoingDocument.count();
        const rawDte = await client.dteOutgoingDocument.findMany({
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
          where:  { is_active: true },
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

      // ── Bloque 6: Cash ────────────────────────────────────────────
      try {
        summary.cashRegisters = await client.cashRegister.count();
      } catch (err) {
        warnings.push(`Cash/registers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 7: Catálogos ───────────────────────────────────────
      try {
        catalogSummary.unitsOfMeasure = await client.unitOfMeasure.count();
      } catch (err) {
        warnings.push(`Catalogs/UOM: ${sanitizeDatabaseError(err)}`);
      }

      try {
        catalogSummary.productCategories = await client.productCategory.count();
      } catch (err) {
        warnings.push(`Catalogs/categories: ${sanitizeDatabaseError(err)}`);
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

      try {
        catalogSummary.taxRates = await client.taxRate.count();
      } catch (err) {
        warnings.push(`Catalogs/tax-rates: ${sanitizeDatabaseError(err)}`);
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
