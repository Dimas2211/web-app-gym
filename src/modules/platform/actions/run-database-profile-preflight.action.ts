"use server";

// ─────────────────────────────────────────────────────────────────
// platform — run-database-profile-preflight.action.ts
//
// Server action read-only (C3).
// Ejecuta el preflight de base de datos contra un PlatformDatabaseProfile
// específico, usando un PrismaClient temporal/dinámico.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Descifra el password solo server-side, nunca lo devuelve.
// - Construye la DATABASE_URL en memoria — no la persiste ni loguea.
// - Siempre ejecuta $disconnect() (via withTemporaryPrismaClient).
// - Sanitiza el mensaje de error antes de devolver al browser.
// - NO escribe ningún dato en la base cliente.
// - NO ejecuta migraciones ni seeds.
// - NO modifica el Prisma singleton normal.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { runDatabasePreflight }      from "../lib/database-preflight";
import type {
  DatabasePreflightResult,
  DatabasePreflightInput,
} from "../types/platform.types";

export type DatabaseProfilePreflightActionState =
  | { result: DatabasePreflightResult; profileLabel: string; tenantIdUsed: string | null; error?: never }
  | { result?: never; profileLabel?: string; tenantIdUsed?: never; error: string };

export async function runDatabaseProfilePreflightAction(
  profileId: string,
): Promise<DatabaseProfilePreflightActionState> {
  await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    return { error: "ID de perfil requerido." };
  }

  // Validar clave de cifrado antes de continuar
  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      error: err instanceof Error
        ? err.message
        : "PLATFORM_ENCRYPTION_KEY no disponible. Configurar en el entorno.",
    };
  }

  // Buscar perfil con credenciales + datos de la organización en el control plane
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
          tenant_id: true,
          vertical:  { select: { code: true } },
          modules: {
            where:  { is_active: true },
            select: { module: { select: { code: true } } },
          },
        },
      },
    },
  });

  if (!profile) {
    return { error: "Perfil de base de datos no encontrado." };
  }

  // Resolver input de preflight desde el control plane (organización asociada)
  const input: DatabasePreflightInput = {};
  const tenantIdUsed = profile.organization.tenant_id ?? null;

  if (tenantIdUsed) {
    input.tenantId = tenantIdUsed;
  }

  if (profile.organization.vertical?.code) {
    input.verticalCode = profile.organization.vertical.code;
  }

  input.activeModuleCodes = profile.organization.modules.map((m) => m.module.code);

  // Ejecutar preflight contra la base objetivo usando PrismaClient temporal
  try {
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    const result = await withTemporaryPrismaClient(databaseUrl, async (client) => {
      return runDatabasePreflight(input, { prismaClient: client });
    });

    return {
      result,
      profileLabel: profile.label,
      tenantIdUsed,
    };
  } catch (err) {
    return {
      error: sanitizeDatabaseError(err),
      profileLabel: profile.label,
    };
  }
}
