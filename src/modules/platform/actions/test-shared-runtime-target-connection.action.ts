"use server";

// ─────────────────────────────────────────────────────────────────
// platform — test-shared-runtime-target-connection.action.ts
//
// SHARED-PILOT-4C-B0. Prueba la conexión a la base física de un
// PlatformSharedRuntimeTarget. Mismo patrón que
// test-database-profile-connection.action.ts. Solo super_admin.
//
// Reglas de seguridad:
// - Descifra el password solo en server-side, nunca lo devuelve.
// - Construye la DATABASE_URL en memoria — no la persiste ni loguea.
// - Siempre ejecuta $disconnect() (via withTemporaryPrismaClient).
// - Sanitiza el mensaje de error antes de devolver al browser.
// - Solo ejecuta SELECT 1 — no migraciones, seeds, lecturas de negocio
//   ni escrituras en la runtime DB.
// - El único write es la metadata del test en el target (control plane).
// - No toca PlatformOrganization ni asignaciones.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }            from "next/cache";
import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
} from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import type { TestConnectionResult } from "./test-database-profile-connection.action";

export async function testSharedRuntimeTargetConnectionAction(
  targetId: string,
): Promise<TestConnectionResult> {
  await requireSuperAdmin();

  if (!targetId || typeof targetId !== "string") {
    return { success: false, message: "ID de Shared Runtime requerido." };
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

  // encrypted_password se selecciona SOLO aquí, server-side
  const target = await prisma.platformSharedRuntimeTarget.findUnique({
    where: { id: targetId },
    select: {
      id:                 true,
      db_host:            true,
      db_port:            true,
      db_name:            true,
      db_user:            true,
      encrypted_password: true,
      ssl_mode:           true,
    },
  });

  if (!target) {
    return { success: false, message: "Shared Runtime no encontrado." };
  }

  const testedAt = new Date();
  let testStatus:  "SUCCESS" | "FAILED";
  let testMessage: string;

  try {
    // URL en memoria — contiene password descifrado, no loguear
    const databaseUrl = buildDatabaseUrlFromProfile(target);

    await withTemporaryPrismaClient(databaseUrl, async (client) => {
      // Test mínimo de conectividad — sin migraciones, sin seeds, sin lecturas de negocio
      await client.$queryRaw`SELECT 1`;
    });

    testStatus  = "SUCCESS";
    testMessage = `Conexión exitosa a ${target.db_host}/${target.db_name} (usuario: ${target.db_user}).`;
  } catch (err) {
    testStatus  = "FAILED";
    testMessage = sanitizeDatabaseError(err);
  }

  await prisma.platformSharedRuntimeTarget.update({
    where: { id: target.id },
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
