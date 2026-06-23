"use server";

// ─────────────────────────────────────────────────────────────────
// platform — get-client-view-data.action.ts
//
// Visor read-only de base de datos cliente (C6).
// Carga datos paginados/limitados por sección usando Prisma
// dinámico temporal apuntando al perfil indicado.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Nunca devuelve encrypted_password, DATABASE_URL ni credenciales.
// - Construye la URL en memoria — no la persiste ni loguea.
// - Siempre ejecuta $disconnect() vía withTemporaryPrismaClient.
// - Cada bloque tiene try/catch independiente — fallo parcial no
//   tumba toda la respuesta; agrega warning y continúa.
// - Solo lectura: count, findMany, findFirst. Sin writes.
// - No ejecuta migraciones ni seeds.
// - No modifica el Prisma singleton normal.
// - No expone: password, encrypted_password, DATABASE_URL,
//   password_hash, signed_jws, json_document, mh_response,
//   encrypted_payload, tokens.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import type {
  ClientViewData,
  ClientViewProduct,
  ClientViewCustomer,
  ClientViewSupplier,
  ClientViewSale,
  ClientViewDteDocument,
  ClientViewCashRegister,
  DatabaseInspectionSummary,
  DatabaseInspectionCatalogSummary,
  DatabaseInspectionTenant,
  DatabaseInspectionLocation,
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

export async function getClientViewDataAction(
  profileId: string,
): Promise<ClientViewData> {
  await requireSuperAdmin();

  const empty: ClientViewData = {
    success:          false,
    profileLabel:     "",
    organizationName: "",
    profileId:        profileId ?? "",
    host:             "",
    dbName:           "",
    environment:      "",
    summary: {
      tenants: 0, locations: 0, users: 0,
      products: 0, customers: 0, suppliers: 0,
      sales: 0, dteDocuments: 0, cashRegisters: 0,
    },
    tenant:        null,
    locations:     [],
    products:      [],
    customers:     [],
    suppliers:     [],
    sales:         [],
    dteDocuments:  [],
    cashRegisters: [],
    catalogSummary: {
      unitsOfMeasure: 0, productCategories: 0,
      identificationTypes: 0, economicActivities: 0,
      municipalities: 0, dteCatalogItems: 0, taxRates: 0,
    },
    dteConfig: null,
    warnings:  [],
  };

  if (!profileId || typeof profileId !== "string") {
    return { ...empty, error: "ID de perfil requerido." };
  }

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

  // Cargar perfil desde el control plane — solo campos necesarios
  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: {
      id:                 true,
      label:              true,
      db_host:            true,
      db_port:            true,
      db_name:            true,
      db_user:            true,
      encrypted_password: true,
      ssl_mode:           true,
      environment:        true,
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
  const host             = profile.db_host;
  const dbName           = profile.db_name;
  const environment      = String(profile.environment);

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

  let tenant:        DatabaseInspectionTenant | null    = null;
  let locations:     DatabaseInspectionLocation[]       = [];
  let products:      ClientViewProduct[]                = [];
  let customers:     ClientViewCustomer[]               = [];
  let suppliers:     ClientViewSupplier[]               = [];
  let sales:         ClientViewSale[]                   = [];
  let dteDocuments:  ClientViewDteDocument[]            = [];
  let cashRegisters: ClientViewCashRegister[]           = [];
  let dteConfig:     DatabaseInspectionDteConfig | null = null;

  try {
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    await withTemporaryPrismaClient(databaseUrl, async (client) => {

      // ── Bloque 1: Core — tenant (gym) ─────────────────────────────
      try {
        const gym = await client.gym.findFirst({
          select:  { id: true, name: true, slug: true, status: true },
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

      // ── Bloque 2: Core — locations (branches) ────────────────────
      try {
        const rawLocs = await client.branch.findMany({
          select:  { id: true, name: true, status: true },
          orderBy: { name: "asc" },
          take:    20,
        });
        locations = rawLocs.map((b) => ({
          id:     b.id,
          name:   b.name,
          status: b.status ?? null,
        }));
        summary.locations = await client.branch.count();
      } catch (err) {
        warnings.push(`Core/locations: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 3: Core — usuarios (solo conteo) ───────────────────
      try {
        summary.users = await client.user.count();
      } catch (err) {
        warnings.push(`Core/users: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 4: Commerce — productos ────────────────────────────
      try {
        summary.products = await client.product.count();
        const rawProducts = await client.product.findMany({
          select: {
            id:           true,
            product_code: true,
            name:         true,
            sku:          true,
            status:       true,
            sale_price:   true,
            created_at:   true,
          },
          orderBy: { name: "asc" },
          take:    50,
        });
        products = rawProducts.map((p) => ({
          id:           p.id,
          product_code: p.product_code,
          name:         p.name,
          sku:          p.sku ?? null,
          status:       String(p.status),
          sale_price:   safeDecimal(p.sale_price),
          created_at:   safeDate(p.created_at),
        }));
      } catch (err) {
        warnings.push(`Commerce/products: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 5: Commerce — clientes ─────────────────────────────
      try {
        summary.customers = await client.customer.count();
        const rawCustomers = await client.customer.findMany({
          select: {
            id:            true,
            customer_code: true,
            name:          true,
            email:         true,
            phone:         true,
            status:        true,
            created_at:    true,
          },
          orderBy: { name: "asc" },
          take:    50,
        });
        customers = rawCustomers.map((c) => ({
          id:            c.id,
          customer_code: c.customer_code,
          name:          c.name,
          email:         c.email ?? null,
          phone:         c.phone ?? null,
          status:        String(c.status),
          created_at:    safeDate(c.created_at),
        }));
      } catch (err) {
        warnings.push(`Commerce/customers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 6: Commerce — proveedores ──────────────────────────
      try {
        summary.suppliers = await client.supplier.count();
        const rawSuppliers = await client.supplier.findMany({
          select: {
            id:         true,
            name:       true,
            email:      true,
            phone:      true,
            status:     true,
            created_at: true,
          },
          orderBy: { name: "asc" },
          take:    50,
        });
        suppliers = rawSuppliers.map((s) => ({
          id:         s.id,
          name:       s.name,
          email:      s.email ?? null,
          phone:      s.phone ?? null,
          status:     String(s.status),
          created_at: safeDate(s.created_at),
        }));
      } catch (err) {
        warnings.push(`Commerce/suppliers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 7: Commerce — ventas ───────────────────────────────
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
          take:    50,
        });
        sales = rawSales.map((s) => ({
          id:           s.id,
          sale_code:    s.sale_code,
          status:       String(s.status),
          total_amount: safeDecimal(s.total_amount),
          created_at:   safeDate(s.created_at),
        }));
      } catch (err) {
        warnings.push(`Commerce/sales: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 8: DTE — documentos ────────────────────────────────
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
          take:    50,
        });
        dteDocuments = rawDte.map((d) => ({
          id:            d.id,
          dte_type_code: d.dte_type_code,
          dte_status:    String(d.dte_status),
          created_at:    safeDate(d.created_at),
        }));
      } catch (err) {
        warnings.push(`DTE/documents: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 9: DTE — configuración del emisor ──────────────────
      try {
        const issuer = await client.dteIssuerConfig.findFirst({
          where:   { is_active: true },
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

      // ── Bloque 10: Cash — cajas registradoras ─────────────────────
      try {
        summary.cashRegisters = await client.cashRegister.count();
        const rawRegisters = await client.cashRegister.findMany({
          select: {
            id:         true,
            code:       true,
            name:       true,
            is_active:  true,
            created_at: true,
          },
          orderBy: { name: "asc" },
          take:    20,
        });
        cashRegisters = rawRegisters.map((r) => ({
          id:         r.id,
          code:       r.code,
          name:       r.name,
          is_active:  r.is_active,
          created_at: safeDate(r.created_at),
        }));
      } catch (err) {
        warnings.push(`Cash/registers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 11: Catálogos ──────────────────────────────────────
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

    }); // withTemporaryPrismaClient — garantiza $disconnect()

  } catch (err) {
    // Error de conexión o error no manejado en el bloque raíz
    return {
      ...empty,
      profileLabel,
      organizationName,
      host,
      dbName,
      environment,
      error: sanitizeDatabaseError(err),
    };
  }

  return {
    success:          true,
    profileLabel,
    organizationName,
    profileId,
    host,
    dbName,
    environment,
    summary,
    tenant,
    locations,
    products,
    customers,
    suppliers,
    sales,
    dteDocuments,
    cashRegisters,
    catalogSummary,
    dteConfig,
    warnings,
  };
}
