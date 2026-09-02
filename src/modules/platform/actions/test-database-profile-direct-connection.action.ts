"use server";

// ─────────────────────────────────────────────────────────────────
// platform — test-database-profile-direct-connection.action.ts
//
// Prueba la CONEXIÓN DIRECTA opcional (direct_*) de un
// PlatformDatabaseProfile — la usada solo por RUN_MIGRATIONS
// (prisma migrate status/deploy), nunca por la app en tráfico normal.
// Separada a propósito de testDatabaseProfileConnectionAction (que
// prueba la conexión runtime/app): son dos conexiones distintas y no
// deben confundirse en un solo botón/resultado.
//
// Reglas de seguridad — mismo criterio que test-database-profile-
// connection.action.ts:
// - Descifra el password solo en server-side, nunca lo devuelve.
// - Construye la URL en memoria — no la persiste ni loguea.
// - Siempre ejecuta $disconnect() (via withTemporaryPrismaClient).
// - Sanitiza el mensaje de error antes de devolver al browser.
// - Solo ejecuta SELECT 1 — no migraciones, seeds ni escrituras.
//
// Diferencia deliberada con el test runtime: el resultado NO se
// persiste en el perfil (no existe direct_last_tested_at/direct_last_
// test_status/direct_last_test_message en el schema — agregar esas
// columnas queda fuera de alcance de este bloque). El resultado es
// efímero: se muestra al operador pero no se guarda en base. Si en un
// bloque futuro se necesita historial de pruebas de la conexión
// directa, agregar esas columnas explícitamente en ese momento.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
  hasDirectConnectionConfigured,
  toDirectConnectionFields,
} from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";

export type TestDirectConnectionResult =
  | { success: true;  message: string }
  | { success: false; message: string };

export async function testDatabaseProfileDirectConnectionAction(
  profileId: string,
): Promise<TestDirectConnectionResult> {
  await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    return { success: false, message: "ID de perfil requerido." };
  }

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error
          ? err.message
          : "PLATFORM_ENCRYPTION_KEY no disponible. Configurar en el entorno.",
    };
  }

  const profile = await prisma.platformDatabaseProfile.findUnique({
    where: { id: profileId },
    select: {
      id:                        true,
      direct_db_host:            true,
      direct_db_port:            true,
      direct_db_name:            true,
      direct_db_user:            true,
      direct_encrypted_password: true,
      direct_ssl_mode:           true,
    },
  });

  if (!profile) {
    return { success: false, message: "Perfil de base de datos no encontrado." };
  }

  if (!hasDirectConnectionConfigured(profile)) {
    return {
      success: false,
      message: "Este perfil no tiene conexión directa configurada — no hay nada que probar.",
    };
  }

  try {
    const databaseUrl = buildDatabaseUrlFromProfile(toDirectConnectionFields(profile));

    await withTemporaryPrismaClient(databaseUrl, async (client) => {
      await client.$queryRaw`SELECT 1`;
    });

    return {
      success: true,
      message: `Conexión directa exitosa a ${profile.direct_db_host}/${profile.direct_db_name} ` +
               `(usuario: ${profile.direct_db_user}). No se persiste este resultado en el perfil.`,
    };
  } catch (err) {
    return { success: false, message: sanitizeDatabaseError(err) };
  }
}
