"use server";

// ─────────────────────────────────────────────────────────────────
// platform — test-database-profile-connection.action.ts
//
// Prueba la conexión a la base de datos de un cliente usando
// el PlatformDatabaseProfile indicado. Solo super_admin.
//
// Reglas de seguridad:
// - Descifra el password solo en server-side, nunca lo devuelve.
// - Construye la DATABASE_URL en memoria — no la persiste ni loguea.
// - Siempre ejecuta $disconnect() (via withTemporaryPrismaClient).
// - Sanitiza el mensaje de error antes de devolver al browser.
// - Solo ejecuta SELECT 1 — no migraciones, seeds ni escrituras.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }           from "next/cache";
import { requireSuperAdmin }        from "@/lib/permissions/guards";
import { prisma }                   from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
} from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";

export type TestConnectionResult =
  | { success: true;  message: string }
  | { success: false; message: string };

export async function testDatabaseProfileConnectionAction(
  profileId: string,
): Promise<TestConnectionResult> {
  await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    return { success: false, message: "ID de perfil requerido." };
  }

  // Validar que la clave de cifrado esté disponible antes de continuar
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

  // Buscar el perfil incluyendo encrypted_password — campo excluido del listado normal
  const profile = await prisma.platformDatabaseProfile.findUnique({
    where: { id: profileId },
    select: {
      id:                 true,
      organization_id:    true,
      db_host:            true,
      db_port:            true,
      db_name:            true,
      db_user:            true,
      encrypted_password: true,
      ssl_mode:           true,
    },
  });

  if (!profile) {
    return { success: false, message: "Perfil de base de datos no encontrado." };
  }

  const testedAt = new Date();
  let testStatus:  "SUCCESS" | "FAILED";
  let testMessage: string;

  try {
    // Construir URL en memoria — contiene password descifrado, no loguear
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    await withTemporaryPrismaClient(databaseUrl, async (client) => {
      // Test mínimo de conectividad — sin migraciones, sin seeds, sin lecturas de negocio
      await client.$queryRaw`SELECT 1`;
    });

    testStatus  = "SUCCESS";
    // El mensaje de éxito no incluye password — solo host/db/user
    testMessage = `Conexión exitosa a ${profile.db_host}/${profile.db_name} (usuario: ${profile.db_user}).`;
  } catch (err) {
    testStatus  = "FAILED";
    testMessage = sanitizeDatabaseError(err);
  }

  // Persistir resultado del test en el perfil
  await prisma.platformDatabaseProfile.update({
    where: { id: profile.id },
    data: {
      last_tested_at:    testedAt,
      last_test_status:  testStatus,
      last_test_message: testMessage,
    },
  });

  revalidatePath("/dashboard/platform/database-profiles");

  return {
    success: testStatus === "SUCCESS",
    message: testMessage,
  };
}
