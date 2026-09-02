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
import { Prisma, type PlatformDatabaseSslMode } from "@prisma/client";
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
    select: {
      id: true, organization_id: true, encrypted_password: true,
      direct_encrypted_password: true, direct_ssl_mode: true,
    },
  });
  if (!existing) {
    return { error: "Perfil de base de datos no encontrado." };
  }

  const rawPassword = formData.get("password") as string | null;
  const hasNewPassword = rawPassword !== null && rawPassword.trim() !== "";

  const rawDirectPassword = formData.get("direct_password") as string | null;
  const hasNewDirectPassword = rawDirectPassword !== null && rawDirectPassword.trim() !== "";

  // Si llega password nuevo (principal o directo), verificar que la
  // clave de cifrado esté disponible antes de continuar.
  if (hasNewPassword || hasNewDirectPassword) {
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
    // Conexión directa — se envían siempre (aunque vacíos) para que el
    // schema pueda aplicar la regla todo-o-nada; ver superRefine.
    direct_db_host:     formData.get("direct_db_host")  ?? "",
    direct_db_port:     formData.get("direct_db_port")  || null,
    direct_db_name:     formData.get("direct_db_name")  ?? "",
    direct_db_user:     formData.get("direct_db_user")  ?? "",
    direct_password:    hasNewDirectPassword ? rawDirectPassword : undefined,
    direct_ssl_mode:    formData.get("direct_ssl_mode") || undefined,
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

  // ── Conexión directa opcional para migraciones ────────────────────
  // Regla todo-o-nada (host+db+usuario), ya garantizada por el schema:
  //   - los tres vacíos  → limpiar conexión directa (null en los 6 campos).
  //   - los tres presentes → configurar/actualizar; password vacío =
  //     conservar el direct_encrypted_password existente, salvo que sea
  //     la primera vez que se configura (ahí si es obligatorio).
  const directHostSet = !!data.direct_db_host?.trim();
  const directNameSet = !!data.direct_db_name?.trim();
  const directUserSet = !!data.direct_db_user?.trim();
  const directConfigured = directHostSet && directNameSet && directUserSet;

  let direct_db_host:            string | null = null;
  let direct_db_port:            number | null = null;
  let direct_db_name:            string | null = null;
  let direct_db_user:            string | null = null;
  let direct_encrypted_password: string | null = null;
  let direct_ssl_mode:           PlatformDatabaseSslMode | null = null;

  if (directConfigured) {
    if (hasNewDirectPassword && data.direct_password) {
      direct_encrypted_password = encryptText(data.direct_password);
    } else if (existing.direct_encrypted_password) {
      direct_encrypted_password = existing.direct_encrypted_password;
    } else {
      return {
        errors: {
          direct_db_host: [
            "Se requiere un password directo para configurar la conexión directa por primera vez.",
          ],
        },
      };
    }
    direct_db_host  = data.direct_db_host!.trim();
    direct_db_port  = data.direct_db_port ?? null;
    direct_db_name  = data.direct_db_name!.trim();
    direct_db_user  = data.direct_db_user!.trim();
    direct_ssl_mode = data.direct_ssl_mode ?? existing.direct_ssl_mode ?? "PREFER";
  }
  // directConfigured === false → todos los direct_* quedan en null
  // (limpia una conexión directa previamente configurada, si existía).

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
      direct_db_host,
      direct_db_port,
      direct_db_name,
      direct_db_user,
      direct_encrypted_password,
      direct_ssl_mode,
      updated_by:         sessionUser.id,
    },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
