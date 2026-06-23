// ─────────────────────────────────────────────────────────────────
// platform/lib/seed-runners — tenant-fiscal-config-runner.ts
//
// Runner SERVER-ONLY para crear o asegurar TenantFiscalConfig
// en una base cliente seleccionada.
// D1B: runner controlado de configuración fiscal del tenant.
//
// Garantías:
// - No ejecuta migraciones.
// - Solo escribe en tenant_fiscal_config.
// - No borra, no trunca, no toca otras tablas.
// - dry-run: solo lectura, sin efectos.
// - real run: upsert idempotente — update: {} no modifica config existente.
// - No toca gym, branch, user, product, sale, dte_document,
//   dte_issuer_config, dte_correlative ni ninguna otra tabla.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[tenant-fiscal-config-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  TenantFiscalConfigDryRunResult,
  TenantFiscalConfigSeedResult,
} from "../../types/platform.types";

// ── Dry-run ───────────────────────────────────────────────────────
//
// Solo lectura — no escribe nada.
// Determina si el tenant existe y si ya tiene TenantFiscalConfig.

export async function runTenantFiscalConfigDryRun(
  prismaClient: PrismaClient,
  input: { tenantId: string },
): Promise<TenantFiscalConfigDryRunResult> {
  const { tenantId } = input;

  // 1. Verificar que el tenant (Gym) existe
  const gym = await prismaClient.gym.findUnique({
    where:  { id: tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!gym) {
    return {
      tenantFound:          false,
      existingConfigFound:  false,
      wouldCreate:          false,
      wouldUpdate:          false,
      recommendedDefaults:  { is_retention_agent: false, retention_threshold_amount: null },
      warnings:             [`No se encontró un Gym con ID '${tenantId}'.`],
      manualReviewRequired: true,
      manualReviewReason:   `No existe un tenant (Gym) con ID '${tenantId}'. ` +
                            `Verificar que PlatformOrganization.tenant_id coincida con un Gym.id existente en la base objetivo.`,
    };
  }

  // 2. Verificar si ya existe TenantFiscalConfig
  const existing = await prismaClient.tenantFiscalConfig.findUnique({
    where:  { tenant_id: tenantId },
    select: { id: true },
  });

  if (existing) {
    return {
      tenantFound:          true,
      tenantName:           gym.name,
      existingConfigFound:  true,
      existingConfigId:     existing.id,
      wouldCreate:          false,
      wouldUpdate:          false,
      recommendedDefaults:  { is_retention_agent: false, retention_threshold_amount: null },
      warnings:             [],
      manualReviewRequired: false,
    };
  }

  return {
    tenantFound:          true,
    tenantName:           gym.name,
    existingConfigFound:  false,
    wouldCreate:          true,
    wouldUpdate:          false,
    recommendedDefaults:  { is_retention_agent: false, retention_threshold_amount: null },
    warnings:             [],
    manualReviewRequired: false,
  };
}

// ── Seed real — idempotente ───────────────────────────────────────
//
// Upsert por tenant_id (@@unique).
// update: {} — no modifica configuración existente.
// create: valores seguros por defecto idénticos a seed.base.ts.
// No borra. No trunca. No toca otras tablas.
// Seguro de re-ejecutar: segunda ejecución → unchanged.

export async function runTenantFiscalConfigSeed(
  prismaClient: PrismaClient,
  input: { tenantId: string },
): Promise<TenantFiscalConfigSeedResult> {
  const { tenantId } = input;

  // Verificar estado previo para determinar si es create o unchanged
  const existing = await prismaClient.tenantFiscalConfig.findUnique({
    where:  { tenant_id: tenantId },
    select: { id: true },
  });

  const config = await prismaClient.tenantFiscalConfig.upsert({
    where:  { tenant_id: tenantId },
    update: {},  // no modifica configuración existente — solo garantiza existencia
    create: {
      tenant_id:          tenantId,
      is_retention_agent: false,
      // retention_threshold_amount omitido → null (no inventar datos fiscales)
    },
    select: { id: true },
  });

  return {
    created:   !existing,
    updated:   false,
    unchanged: !!existing,
    configId:  config.id,
    tenantId,
  };
}
