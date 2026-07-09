"use server";

// ─────────────────────────────────────────────────────────────────
// platform — detect-database-profile-tenant.action.ts
//
// Detecta tenants (gyms) existentes en la base cliente asociada a
// un PlatformDatabaseProfile. C7 — Tenant Binding & Auto-Discovery.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Read-only contra la base cliente — no escribe nada allí.
// - No persiste ni loguea la DATABASE_URL ni el password.
// - No asigna tenant_id automáticamente — solo detecta y sugiere.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                     from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { detectTenantsFromClientDatabase } from "../lib/tenant-binding/tenant-discovery";
import type { TenantDetectionResult } from "../types/platform.types";

export async function detectDatabaseProfileTenantAction(
  profileId: string,
): Promise<TenantDetectionResult> {
  await requireSuperAdmin();

  const empty: TenantDetectionResult = {
    success:                     false,
    profileId:                   profileId ?? "",
    profileLabel:                "",
    organizationId:               "",
    organizationName:            "",
    status:                      "DETECTION_FAILED",
    detectedTenants:             [],
    currentOrganizationTenantId: null,
    recommendedTenantId:         null,
    warnings:                    [],
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
      organization: {
        select: {
          id:        true,
          name:      true,
          tenant_id: true,
        },
      },
    },
  });

  if (!profile) {
    return { ...empty, error: "Perfil de base de datos no encontrado." };
  }

  const base: TenantDetectionResult = {
    ...empty,
    profileId:                   profile.id,
    profileLabel:                profile.label,
    organizationId:               profile.organization.id,
    organizationName:            profile.organization.name,
    currentOrganizationTenantId: profile.organization.tenant_id ?? null,
  };

  try {
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    const detectedTenants = await withTemporaryPrismaClient(
      databaseUrl,
      (client) => detectTenantsFromClientDatabase(client),
    );

    const activeTenants = detectedTenants.filter(
      (t) => (t.status ?? "").toLowerCase() === "active",
    );

    let status: TenantDetectionResult["status"];
    let recommendedTenantId: string | null = null;
    const warnings: string[] = [];

    if (detectedTenants.length === 0) {
      status = "NO_TENANTS_FOUND";
    } else if (activeTenants.length === 1) {
      status               = "SINGLE_TENANT_DETECTED";
      recommendedTenantId  = activeTenants[0].id;
    } else if (detectedTenants.length === 1) {
      // Un único tenant, aunque no esté "active" — igual se recomienda
      status               = "SINGLE_TENANT_DETECTED";
      recommendedTenantId  = detectedTenants[0].id;
    } else {
      status = "MULTIPLE_TENANTS_DETECTED";
    }

    if (
      base.currentOrganizationTenantId &&
      recommendedTenantId &&
      base.currentOrganizationTenantId === recommendedTenantId
    ) {
      status = "ALREADY_BOUND";
    }

    return {
      ...base,
      success: true,
      status,
      detectedTenants,
      recommendedTenantId,
      warnings,
    };
  } catch (err) {
    return {
      ...base,
      success: false,
      status:  "DETECTION_FAILED",
      error:   sanitizeDatabaseError(err),
    };
  }
}
