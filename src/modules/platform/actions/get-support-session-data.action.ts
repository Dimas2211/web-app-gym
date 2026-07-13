"use server";

// ─────────────────────────────────────────────────────────────────
// platform — get-support-session-data.action.ts
//
// Platform Support Session (F1-A).
// Contenedor operativo read-only por perfil de base de datos.
// No crea ventas, no emite DTE, no escribe en la base cliente.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Requiere organization.tenant_id — si falta, retorna error tipado
//   MISSING_TENANT sin intentar abrir conexión.
// - Nunca devuelve encrypted_password, DATABASE_URL, host ni puerto.
// - Construye la URL en memoria — no la persiste ni loguea.
// - Siempre ejecuta $disconnect() vía withTemporaryPrismaClient.
// - Cada bloque tiene try/catch independiente — fallo parcial no
//   tumba toda la respuesta; agrega warning y continúa.
// - Solo lectura: count, findMany, findFirst. Sin writes.
// - No expone: password, encrypted_password, DATABASE_URL,
//   password_hash, signed_jws, json_document, mh_response,
//   encrypted_payload, tokens, nit/dui completos (se enmascaran).
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
  PlatformSupportSessionData,
  PlatformSupportSessionHeader,
  PlatformSupportSessionSummary,
  PlatformSupportSessionFiscalConfig,
  SupportSessionProductRow,
  SupportSessionCustomerRow,
  SupportSessionSupplierRow,
  SupportSessionInventoryRow,
  SupportSessionSaleRow,
  SupportSessionDteRow,
  SupportSessionCashSessionRow,
  DatabaseInspectionTenant,
  DatabaseInspectionLocation,
  DatabaseInspectionCatalogSummary,
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

// Enmascara identificadores tributarios (NIT/DUI) — deja visibles solo los últimos 4 dígitos
function maskTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────

export async function getSupportSessionDataAction(
  profileId: string,
): Promise<PlatformSupportSessionData> {
  await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    return { success: false, reason: "PROFILE_NOT_FOUND", error: "ID de perfil requerido." };
  }

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      success: false,
      reason:  "CONNECTION_FAILED",
      error:   err instanceof Error ? err.message : "PLATFORM_ENCRYPTION_KEY no disponible.",
    };
  }

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
      is_active:          true,
      last_tested_at:     true,
      last_test_status:   true,
      last_test_message:  true,
      organization: {
        select: { id: true, code: true, name: true, tenant_id: true },
      },
    },
  });

  if (!profile) {
    return { success: false, reason: "PROFILE_NOT_FOUND", error: "Perfil de base de datos no encontrado." };
  }

  const header: PlatformSupportSessionHeader = {
    profileId:        profile.id,
    profileLabel:     profile.label,
    environment:      profile.environment,
    dbName:           profile.db_name,
    isActive:         profile.is_active,
    lastTestedAt:     profile.last_tested_at?.toISOString() ?? null,
    lastTestStatus:   profile.last_test_status,
    lastTestMessage:  profile.last_test_message,
    organizationId:   profile.organization.id,
    organizationCode: profile.organization.code,
    organizationName: profile.organization.name,
    tenantId:         profile.organization.tenant_id,
  };

  if (!profile.is_active) {
    return {
      success: false,
      reason:  "INACTIVE_PROFILE",
      error:   "Este perfil de base de datos está inactivo.",
      header,
    };
  }

  if (!profile.organization.tenant_id) {
    return {
      success: false,
      reason:  "MISSING_TENANT",
      error:   "Esta organización no tiene tenant_id operativo. Usa \"Detectar tenant\" desde Perfiles de BD antes de abrir soporte.",
      header,
    };
  }

  const warnings: string[] = [];

  const summary: PlatformSupportSessionSummary = {
    tenants: 0, locations: 0, users: 0,
    products: 0, customers: 0, suppliers: 0,
    sales: 0, dteDocuments: 0, cashRegisters: 0,
    inventoryRows: 0,
  };

  const catalogSummary: DatabaseInspectionCatalogSummary = {
    unitsOfMeasure: 0, productCategories: 0,
    identificationTypes: 0, economicActivities: 0,
    municipalities: 0, dteCatalogItems: 0, taxRates: 0,
  };

  let tenant:       DatabaseInspectionTenant | null = null;
  let locations:    DatabaseInspectionLocation[]     = [];
  let products:     SupportSessionProductRow[]       = [];
  let customers:    SupportSessionCustomerRow[]      = [];
  let suppliers:    SupportSessionSupplierRow[]      = [];
  let inventory:    SupportSessionInventoryRow[]     = [];
  let sales:        SupportSessionSaleRow[]          = [];
  let dte:          SupportSessionDteRow[]           = [];
  let cashSessions: SupportSessionCashSessionRow[]   = [];
  let issuer:       DatabaseInspectionDteConfig | null = null;
  let fiscalConfig: PlatformSupportSessionFiscalConfig = {
    isRetentionAgent: false,
    retentionThresholdAmount: null,
    issuer: null,
    dteEnvironment: null,
  };

  try {
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    await withTemporaryPrismaClient(databaseUrl, async (client) => {

      // ── Bloque 1: Core — tenant (gym) ────────────────────────────
      try {
        const gym = await client.gym.findFirst({
          select:  { id: true, name: true, slug: true, status: true },
          orderBy: { created_at: "asc" },
        });
        if (gym) {
          tenant = { id: gym.id, name: gym.name, slug: gym.slug ?? null, status: gym.status ?? null };
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
        locations = rawLocs.map((b) => ({ id: b.id, name: b.name, status: b.status ?? null }));
        summary.locations = await client.branch.count();
      } catch (err) {
        warnings.push(`Core/locations: ${sanitizeDatabaseError(err)}`);
      }

      const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

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
            id: true, product_code: true, name: true, status: true,
            product_type: true, is_stockable: true, sale_price: true,
            category: { select: { name: true } },
            unit:     { select: { name: true } },
          },
          orderBy: { created_at: "desc" },
          take:    20,
        });
        products = rawProducts.map((p) => ({
          id:           p.id,
          product_code: p.product_code,
          name:         p.name,
          status:       String(p.status),
          product_type: String(p.product_type),
          is_stockable: p.is_stockable,
          sale_price:   safeDecimal(p.sale_price),
          category:     p.category?.name ?? null,
          unit:         p.unit?.name ?? null,
        }));
      } catch (err) {
        warnings.push(`Commerce/products: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 5: Commerce — clientes ─────────────────────────────
      try {
        summary.customers = await client.customer.count();
        const rawCustomers = await client.customer.findMany({
          select: {
            id: true, customer_code: true, name: true, nit: true, dui: true,
            email: true, phone: true, status: true,
          },
          orderBy: { created_at: "desc" },
          take:    20,
        });
        customers = rawCustomers.map((c) => ({
          id:            c.id,
          customer_code: c.customer_code,
          name:          c.name,
          tax_id_masked: maskTaxId(c.nit ?? c.dui),
          email:         c.email ?? null,
          phone:         c.phone ?? null,
          status:        String(c.status),
        }));
      } catch (err) {
        warnings.push(`Commerce/customers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 6: Commerce — proveedores ──────────────────────────
      try {
        summary.suppliers = await client.supplier.count();
        const rawSuppliers = await client.supplier.findMany({
          select: {
            id: true, supplier_code: true, name: true, nit: true, dui: true,
            email: true, status: true,
          },
          orderBy: { created_at: "desc" },
          take:    20,
        });
        suppliers = rawSuppliers.map((s) => ({
          id:            s.id,
          supplier_code: s.supplier_code,
          name:          s.name,
          tax_id_masked: maskTaxId(s.nit ?? s.dui),
          email:         s.email ?? null,
          status:        String(s.status),
        }));
      } catch (err) {
        warnings.push(`Commerce/suppliers: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 7: Commerce — inventario (ProductLocation) ─────────
      try {
        summary.inventoryRows = await client.productLocation.count();
        const rawInventory = await client.productLocation.findMany({
          select: {
            id: true, location_id: true, current_stock: true,
            reorder_quantity: true, is_active: true,
            product: { select: { name: true, product_code: true } },
          },
          orderBy: { updated_at: "desc" },
          take:    20,
        });
        inventory = rawInventory.map((i) => ({
          id:               i.id,
          product_name:     i.product.name,
          product_code:     i.product.product_code,
          location_name:    locationNameById.get(i.location_id) ?? i.location_id,
          current_stock:    safeDecimal(i.current_stock),
          reorder_quantity: safeDecimal(i.reorder_quantity),
          is_active:        i.is_active,
        }));
      } catch (err) {
        warnings.push(`Commerce/inventory: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 8: Commerce — ventas ────────────────────────────────
      try {
        summary.sales = await client.sale.count();
        const rawSales = await client.sale.findMany({
          select: {
            id: true, sale_code: true, sale_date: true, status: true,
            payment_status: true, total_amount: true,
            customer: { select: { name: true } },
          },
          orderBy: { created_at: "desc" },
          take:    20,
        });
        sales = rawSales.map((s) => ({
          id:             s.id,
          sale_code:      s.sale_code,
          sale_date:      safeDate(s.sale_date),
          customer_name:  s.customer?.name ?? null,
          total_amount:   safeDecimal(s.total_amount),
          status:         String(s.status),
          payment_status: String(s.payment_status),
        }));
      } catch (err) {
        warnings.push(`Commerce/sales: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 9: DTE — documentos ──────────────────────────────────
      try {
        summary.dteDocuments = await client.dteOutgoingDocument.count();
        const rawDte = await client.dteOutgoingDocument.findMany({
          select: {
            id: true, dte_type_code: true, dte_status: true,
            generation_code: true, control_number: true, reception_stamp: true,
            rejection_reason: true, created_at: true,
          },
          orderBy: { created_at: "desc" },
          take:    20,
        });
        dte = rawDte.map((d) => ({
          id:               d.id,
          dte_type_code:    d.dte_type_code,
          dte_status:       String(d.dte_status),
          generation_code:  d.generation_code ?? null,
          control_number:   d.control_number ?? null,
          reception_stamp:  d.reception_stamp ?? null,
          created_at:       safeDate(d.created_at),
          rejection_reason: d.rejection_reason ?? null,
        }));
      } catch (err) {
        warnings.push(`DTE/documents: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 10: DTE — configuración del emisor ───────────────────
      try {
        const activeIssuer = await client.dteIssuerConfig.findFirst({
          where:   { is_active: true },
          select:  { nit: true, name: true, is_active: true, environment: true },
          orderBy: { created_at: "asc" },
        });
        if (activeIssuer) {
          issuer = {
            nit:         activeIssuer.nit,
            name:        activeIssuer.name,
            is_active:   activeIssuer.is_active,
            environment: String(activeIssuer.environment),
          };
        }
      } catch (err) {
        warnings.push(`DTE/config: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 11: Fiscal — configuración de retención del tenant ───
      try {
        const tfc = await client.tenantFiscalConfig.findFirst({
          select: { is_retention_agent: true, retention_threshold_amount: true },
        });
        fiscalConfig = {
          isRetentionAgent:         tfc?.is_retention_agent ?? false,
          retentionThresholdAmount: tfc ? safeDecimal(tfc.retention_threshold_amount) : null,
          issuer,
          dteEnvironment: issuer?.environment ?? null,
        };
      } catch (err) {
        warnings.push(`Fiscal/config: ${sanitizeDatabaseError(err)}`);
        fiscalConfig = { isRetentionAgent: false, retentionThresholdAmount: null, issuer, dteEnvironment: issuer?.environment ?? null };
      }

      // ── Bloque 12: Cash — sesiones de caja recientes ────────────────
      try {
        summary.cashRegisters = await client.cashRegister.count();
        const rawSessions = await client.cashSession.findMany({
          select: {
            id: true, location_id: true, status: true,
            opened_at: true, closed_at: true,
            opening_amount: true, expected_cash_amount: true,
            cash_register: { select: { name: true } },
          },
          orderBy: { opened_at: "desc" },
          take:    20,
        });
        cashSessions = rawSessions.map((cs) => ({
          id:                   cs.id,
          register_name:        cs.cash_register.name,
          location_name:        locationNameById.get(cs.location_id) ?? cs.location_id,
          status:                String(cs.status),
          opened_at:            safeDate(cs.opened_at),
          closed_at:            cs.closed_at ? safeDate(cs.closed_at) : null,
          opening_amount:       safeDecimal(cs.opening_amount),
          expected_cash_amount: safeDecimal(cs.expected_cash_amount),
        }));
      } catch (err) {
        warnings.push(`Cash/sessions: ${sanitizeDatabaseError(err)}`);
      }

      // ── Bloque 13: Catálogos (solo conteo) ───────────────────────────
      try { catalogSummary.unitsOfMeasure      = await client.unitOfMeasure.count();      } catch (err) { warnings.push(`Catalogs/UOM: ${sanitizeDatabaseError(err)}`); }
      try { catalogSummary.productCategories   = await client.productCategory.count();    } catch (err) { warnings.push(`Catalogs/categories: ${sanitizeDatabaseError(err)}`); }
      try { catalogSummary.identificationTypes = await client.identificationType.count(); } catch (err) { warnings.push(`Catalogs/id-types: ${sanitizeDatabaseError(err)}`); }
      try { catalogSummary.economicActivities  = await client.economicActivity.count();   } catch (err) { warnings.push(`Catalogs/activities: ${sanitizeDatabaseError(err)}`); }
      try { catalogSummary.municipalities      = await client.municipality.count();       } catch (err) { warnings.push(`Catalogs/municipalities: ${sanitizeDatabaseError(err)}`); }
      try { catalogSummary.dteCatalogItems     = await client.dteCatalogItem.count();     } catch (err) { warnings.push(`Catalogs/dte-catalog: ${sanitizeDatabaseError(err)}`); }
      try { catalogSummary.taxRates            = await client.taxRate.count();            } catch (err) { warnings.push(`Catalogs/tax-rates: ${sanitizeDatabaseError(err)}`); }

    }); // withTemporaryPrismaClient — garantiza $disconnect()

  } catch (err) {
    return {
      success: false,
      reason:  "CONNECTION_FAILED",
      error:   sanitizeDatabaseError(err),
      header,
    };
  }

  return {
    success: true,
    header,
    summary,
    tenant,
    locations,
    products,
    customers,
    suppliers,
    inventory,
    sales,
    dte,
    cashSessions,
    catalogSummary,
    fiscalConfig,
    warnings,
  };
}
