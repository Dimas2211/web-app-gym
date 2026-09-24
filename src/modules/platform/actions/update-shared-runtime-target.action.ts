"use server";

// ─────────────────────────────────────────────────────────────────
// platform — update-shared-runtime-target.action.ts
//
// SHARED-PILOT-4C-B0.1. Edita un PlatformSharedRuntimeTarget.
// - Password vacío = conservar encrypted_password actual.
// - Password nuevo = encryptText y reemplazar.
// - NUNCA devuelve encrypted_password al cliente ni lo loguea.
// - Si cambian datos de conexión, el resultado del último test se
//   resetea a UNTESTED (el SUCCESS previo ya no aplica).
// - No toca organizaciones, is_active ni la runtime DB.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { encryptText, assertEncryptionAvailable } from "@/lib/security/encryption";
import { updateSharedRuntimeTargetSchema } from "../schemas/update-shared-runtime-target.schema";
import type { SharedRuntimeTargetActionState } from "./create-shared-runtime-target.action";

export async function updateSharedRuntimeTargetAction(
  targetId: string,
  _prev: SharedRuntimeTargetActionState,
  formData: FormData,
): Promise<SharedRuntimeTargetActionState> {
  const sessionUser = await requireSuperAdmin();

  if (!targetId) {
    return { error: "ID de Shared Runtime requerido." };
  }

  const existing = await prisma.platformSharedRuntimeTarget.findUnique({
    where:  { id: targetId },
    select: {
      id:       true,
      db_host:  true,
      db_port:  true,
      db_name:  true,
      db_user:  true,
      ssl_mode: true,
    },
  });
  if (!existing) {
    return { error: "Shared Runtime no encontrado." };
  }

  const rawPassword    = formData.get("password") as string | null;
  const hasNewPassword = rawPassword !== null && rawPassword.trim() !== "";

  // La clave de cifrado solo es necesaria si se reemplaza el password
  if (hasNewPassword) {
    try {
      assertEncryptionAvailable();
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "La clave de cifrado no está configurada. Configurar PLATFORM_ENCRYPTION_KEY.",
      };
    }
  }

  const raw = {
    label:       formData.get("label")       as string,
    environment: formData.get("environment") as string,
    provider:    formData.get("provider")    || "POSTGRESQL",
    db_host:     formData.get("db_host")     as string,
    db_port:     formData.get("db_port")     || null,
    db_name:     formData.get("db_name")     as string,
    db_user:     formData.get("db_user")     as string,
    password:    hasNewPassword ? rawPassword : undefined,
    ssl_mode:    formData.get("ssl_mode")    || "PREFER",
  };

  const parsed = updateSharedRuntimeTargetSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const labelConflict = await prisma.platformSharedRuntimeTarget.findUnique({
    where:  { label: data.label },
    select: { id: true },
  });
  if (labelConflict && labelConflict.id !== targetId) {
    return { errors: { label: ["Ya existe un Shared Runtime con este nombre."] } };
  }

  const db_port = data.db_port ?? null;
  const connectionChanged =
    hasNewPassword ||
    existing.db_host  !== data.db_host ||
    existing.db_port  !== db_port ||
    existing.db_name  !== data.db_name ||
    existing.db_user  !== data.db_user ||
    existing.ssl_mode !== data.ssl_mode;

  await prisma.platformSharedRuntimeTarget.update({
    where: { id: targetId },
    data: {
      label:       data.label,
      environment: data.environment,
      provider:    data.provider,
      db_host:     data.db_host,
      db_port,
      db_name:     data.db_name,
      db_user:     data.db_user,
      ssl_mode:    data.ssl_mode,
      // Solo se incluye si hay password nuevo — si no, se conserva el actual
      ...(hasNewPassword && data.password
        ? { encrypted_password: encryptText(data.password) }
        : {}),
      ...(connectionChanged
        ? { last_test_status: "UNTESTED", last_tested_at: null, last_test_message: null }
        : {}),
      updated_by:  sessionUser.id,
    },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
