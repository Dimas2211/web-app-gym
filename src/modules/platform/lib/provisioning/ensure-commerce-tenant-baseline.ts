// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — ensure-commerce-tenant-baseline.ts
//
// SHARED-OPS-PARITY-1. Baseline Commerce TENANT-SCOPED mínimo para que
// un tenant recién provisionado sea operable en Commerce. Equivalente
// neutral de lo que seedBase() (prisma/seeds/seed.base.ts) sembraba
// históricamente, pero:
//   - la identidad es RuntimeTenant.id (= PlatformOrganization.tenant_id),
//     nunca gym.id — funciona igual para COMMERCE_ONLY (sin Gym) y GYM;
//   - idempotente y retry-safe: solo crea lo que falta, nunca actualiza
//     ni borra, nunca duplica.
//
// Separación explícita de capas de datos de una base runtime (sobre todo
// una Shared, donde N organizaciones comparten las mismas tablas):
//   PHYSICAL_RUNTIME_GLOBAL_CATALOGS — una sola copia por base física.
//     NUNCA se siembran por organización (provisionar B en la misma
//     Shared no los duplica). Este helper no los toca.
//   TENANT_BASELINE — lo que este helper asegura, por tenant_id.
//   TENANT_BUSINESS_DATA — datos del negocio (Data Onboarding / uso
//     operativo). Este helper no los toca.
// ─────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from "@prisma/client";

export const PHYSICAL_RUNTIME_GLOBAL_CATALOGS = [
  "units_of_measure",
  "identification_types",
  "economic_activities",
  "municipalities",
  "countries",
  "dte_catalog_items",
] as const;

export const TENANT_BASELINE_TABLES = [
  "tax_rates",
  "product_categories",
  "tenant_fiscal_config",
] as const;

export const TENANT_BUSINESS_DATA_TABLES = [
  "product_lines",
  "product_sublines",
  "products",
  "suppliers",
  "customers",
  "product_locations",
  "inventory_movements",
] as const;

export const COMMERCE_BASELINE_TAX_RATE = { name: "IVA", rate: 13 } as const;
export const COMMERCE_BASELINE_CATEGORY = {
  code:        "GENERAL",
  name:        "General",
  description: "Categoría general de productos",
} as const;

export type CommerceBaselineItem =
  | "TAX_RATE_IVA_13"
  | "PRODUCT_CATEGORY_GENERAL"
  | "TENANT_FISCAL_CONFIG";

export interface CommerceTenantBaselineResult {
  tenantId:        string;
  created:         CommerceBaselineItem[];
  alreadyExisting: CommerceBaselineItem[];
}

export class CommerceBaselineTenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`No existe un RuntimeTenant con ID '${tenantId}' en la base runtime.`);
    this.name = "CommerceBaselineTenantNotFoundError";
  }
}

type BaselineDb = Prisma.TransactionClient | PrismaClient;

/**
 * Asegura el baseline Commerce de UN tenant. Todas las lecturas y
 * escrituras están acotadas a `tenantId` — nunca lee ni modifica filas
 * de otros tenants de la misma base física.
 *
 * Pensado para ejecutarse dentro de una transacción (provisioning o
 * `ensureCommerceTenantBaselineAtomic`), que es quien serializa
 * ejecuciones concurrentes sobre el mismo tenant.
 */
export async function ensureCommerceTenantBaseline(
  tx: BaselineDb,
  tenantId: string,
): Promise<CommerceTenantBaselineResult> {
  const tenant = await tx.runtimeTenant.findUnique({
    where:  { id: tenantId },
    select: { id: true },
  });
  if (!tenant) throw new CommerceBaselineTenantNotFoundError(tenantId);

  const created: CommerceBaselineItem[] = [];
  const alreadyExisting: CommerceBaselineItem[] = [];

  // TaxRate no tiene unique natural — se identifica por (tenant_id, rate),
  // igual que seedBase(). Cualquier IVA 13% del tenant cuenta como existente.
  const iva = await tx.taxRate.findFirst({
    where:  { tenant_id: tenantId, rate: COMMERCE_BASELINE_TAX_RATE.rate },
    select: { id: true },
  });
  if (iva) {
    alreadyExisting.push("TAX_RATE_IVA_13");
  } else {
    await tx.taxRate.create({
      data: {
        tenant_id: tenantId,
        name:      COMMERCE_BASELINE_TAX_RATE.name,
        rate:      COMMERCE_BASELINE_TAX_RATE.rate,
        status:    "active",
      },
      select: { id: true },
    });
    created.push("TAX_RATE_IVA_13");
  }

  const category = await tx.productCategory.findFirst({
    where:  { tenant_id: tenantId, code: COMMERCE_BASELINE_CATEGORY.code },
    select: { id: true },
  });
  if (category) {
    alreadyExisting.push("PRODUCT_CATEGORY_GENERAL");
  } else {
    await tx.productCategory.create({
      data: {
        tenant_id:   tenantId,
        code:        COMMERCE_BASELINE_CATEGORY.code,
        name:        COMMERCE_BASELINE_CATEGORY.name,
        description: COMMERCE_BASELINE_CATEGORY.description,
        status:      "active",
      },
      select: { id: true },
    });
    created.push("PRODUCT_CATEGORY_GENERAL");
  }

  const fiscal = await tx.tenantFiscalConfig.findUnique({
    where:  { tenant_id: tenantId },
    select: { id: true },
  });
  if (fiscal) {
    alreadyExisting.push("TENANT_FISCAL_CONFIG");
  } else {
    // Default seguro: no agente de retención, sin umbral.
    await tx.tenantFiscalConfig.create({
      data:   { tenant_id: tenantId, is_retention_agent: false },
      select: { id: true },
    });
    created.push("TENANT_FISCAL_CONFIG");
  }

  return { tenantId, created, alreadyExisting };
}

const BASELINE_LOCK_NAMESPACE = "commerce-tenant-baseline:";

/**
 * Variante standalone (reparación de tenants ya provisionados): abre su
 * propia transacción y serializa ejecuciones concurrentes del MISMO
 * tenant con un advisory lock, para que dos clics simultáneos no creen
 * dos TaxRate (tax_rates no tiene unique natural).
 */
export async function ensureCommerceTenantBaselineAtomic(
  db: PrismaClient,
  tenantId: string,
): Promise<CommerceTenantBaselineResult> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BASELINE_LOCK_NAMESPACE + tenantId}))`;
      return ensureCommerceTenantBaseline(tx, tenantId);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
