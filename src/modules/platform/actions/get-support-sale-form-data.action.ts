"use server";

// ─────────────────────────────────────────────────────────────────
// platform — get-support-sale-form-data.action.ts
//
// F1-B1: Datos read-only para el formulario "Nueva venta de prueba"
// de Support Session. No escribe nada — solo lectura contra la base
// del perfil seleccionado.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Nunca devuelve encrypted_password, DATABASE_URL, host ni puerto.
// - NIT/DUI se enmascaran igual que en get-support-session-data.action.
// - Siempre ejecuta $disconnect() vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import type { SupportSaleFormData } from "../types/platform.types";

function maskTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

export async function getSupportSaleFormDataAction(
  profileId: string,
): Promise<SupportSaleFormData> {
  await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    return { success: false, error: "ID de perfil requerido." };
  }

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : "PLATFORM_ENCRYPTION_KEY no disponible.",
    };
  }

  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: {
      db_host: true, db_port: true, db_name: true, db_user: true,
      encrypted_password: true, ssl_mode: true, is_active: true,
      organization: { select: { tenant_id: true } },
    },
  });

  if (!profile) {
    return { success: false, error: "Perfil de base de datos no encontrado." };
  }
  if (!profile.is_active) {
    return { success: false, error: "Este perfil de base de datos está inactivo." };
  }

  const tenantId = profile.organization.tenant_id;
  if (!tenantId) {
    return {
      success: false,
      error:   "Esta organización no tiene tenant_id operativo. Usa \"Detectar tenant\" desde Perfiles de BD.",
    };
  }

  try {
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    return await withTemporaryPrismaClient(databaseUrl, async (client) => {
      const [rawBranches, rawCustomers, rawProducts, rawPaymentMethods] = await Promise.all([
        client.branch.findMany({
          where:   { gym_id: tenantId, status: "active" },
          select:  { id: true, name: true, status: true },
          orderBy: { name: "asc" },
        }),
        client.customer.findMany({
          where:   { tenant_id: tenantId, status: "active" },
          select:  { id: true, customer_code: true, name: true, nit: true, dui: true },
          orderBy: { name: "asc" },
          take:    200,
        }),
        client.product.findMany({
          where: {
            tenant_id:  tenantId,
            allow_sale: true,
            status:     "ACTIVE",
          },
          select: {
            id: true, product_code: true, name: true,
            product_type: true, is_stockable: true, sale_price: true,
            tax_rate: { select: { rate: true } },
          },
          orderBy: { name: "asc" },
          take:    500,
        }),
        client.dteCatalogItem.findMany({
          where:   { catalog_code: "CAT-017", is_active: true },
          select:  { item_code: true, item_label: true },
          orderBy: { sort_order: "asc" },
        }),
      ]);

      return {
        success:  true,
        tenantId,
        branches: rawBranches.map((b) => ({ id: b.id, name: b.name, status: String(b.status) })),
        customers: rawCustomers.map((c) => ({
          id:            c.id,
          customer_code: c.customer_code,
          name:          c.name,
          tax_id_masked: maskTaxId(c.nit ?? c.dui),
        })),
        products: rawProducts.map((p) => ({
          id:           p.id,
          product_code: p.product_code,
          name:         p.name,
          product_type: String(p.product_type),
          is_stockable: p.is_stockable,
          allow_sale:   true,
          sale_price:   p.sale_price != null ? Number(p.sale_price) : null,
          tax_rate:     p.tax_rate?.rate != null ? Number(p.tax_rate.rate) : null,
        })),
        paymentMethods: rawPaymentMethods.map((m) => ({ code: m.item_code, label: m.item_label })),
      };
    });
  } catch (err) {
    return { success: false, error: sanitizeDatabaseError(err) };
  }
}
