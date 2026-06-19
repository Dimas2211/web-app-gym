"use server";

// ─────────────────────────────────────────────────────────────────
// platform — update-database-profile.action.ts
//
// Actualiza un PlatformDatabaseProfile.
// Si se envía password nuevo, reemplaza el cifrado existente.
// Si el password está ausente o vacío, conserva el encrypted_password anterior.
// NUNCA devuelve encrypted_password al cliente.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { encryptText, assertEncryptionAvailable } from "@/lib/security/encryption";
import { updateDatabaseProfileSchema } from "../schemas/update-database-profile.schema";

export type DatabaseProfileUpdateState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updateDatabaseProfileAction(
  profileId: string,
  _prev: DatabaseProfileUpdateState,
  formData: FormData,
): Promise<DatabaseProfileUpdateState> {
  const sessionUser = await requireSuperAdmin();

  if (!profileId) {
    return { error: "ID de perfil requerido." };
  }

  const existing = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: { id: true, organization_id: true, encrypted_password: true },
  });
  if (!existing) {
    return { error: "Perfil de base de datos no encontrado." };
  }

  const rawPassword = formData.get("password") as string | null;
  const hasNewPassword = rawPassword !== null && rawPassword.trim() !== "";

  // Si llega password nuevo, verificar que la clave de cifrado esté disponible
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
    label:              formData.get("label")    || undefined,
    environment:        formData.get("environment") || undefined,
    provider:           formData.get("provider")    || undefined,
    db_host:            formData.get("db_host")     || undefined,
    db_port:            formData.get("db_port")     || undefined,
    db_name:            formData.get("db_name")     || undefined,
    db_user:            formData.get("db_user")     || undefined,
    password:           hasNewPassword ? rawPassword : undefined,
    ssl_mode:           formData.get("ssl_mode")    || undefined,
    connection_options: undefined,
  };

  const parsed = updateDatabaseProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // Verificar unicidad de label si cambió
  if (data.label) {
    const labelConflict = await prisma.platformDatabaseProfile.findUnique({
      where: {
        organization_id_label: {
          organization_id: existing.organization_id,
          label:           data.label,
        },
      },
      select: { id: true },
    });
    if (labelConflict && labelConflict.id !== profileId) {
      return { errors: { label: ["Ya existe un perfil con este nombre para esta organización."] } };
    }
  }

  // Determinar el encrypted_password a persistir
  const encrypted_password = hasNewPassword && data.password
    ? encryptText(data.password)
    : existing.encrypted_password;

  await prisma.platformDatabaseProfile.update({
    where: { id: profileId },
    data: {
      label:              data.label,
      environment:        data.environment,
      provider:           data.provider,
      db_host:            data.db_host,
      db_port:            data.db_port,
      db_name:            data.db_name,
      db_user:            data.db_user,
      encrypted_password,
      ssl_mode:           data.ssl_mode,
      connection_options: data.connection_options !== undefined
        ? (data.connection_options
            ? (data.connection_options as Prisma.InputJsonValue)
            : Prisma.JsonNull)
        : undefined,
      updated_by:         sessionUser.id,
    },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
