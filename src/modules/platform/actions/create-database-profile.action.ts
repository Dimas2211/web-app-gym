"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-database-profile.action.ts
//
// Crea un PlatformDatabaseProfile cifrando el password con AES-256-GCM.
// Falla con error claro si PLATFORM_ENCRYPTION_KEY no está configurada.
// NUNCA devuelve encrypted_password ni el password en plano al cliente.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { encryptText, assertEncryptionAvailable } from "@/lib/security/encryption";
import { createDatabaseProfileSchema } from "../schemas/create-database-profile.schema";

export type DatabaseProfileActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createDatabaseProfileAction(
  _prev: DatabaseProfileActionState,
  formData: FormData,
): Promise<DatabaseProfileActionState> {
  const sessionUser = await requireSuperAdmin();

  // Fallar explícitamente si la clave de cifrado no está disponible
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

  const raw = {
    organization_id:    formData.get("organization_id")    as string,
    label:              formData.get("label")              as string,
    environment:        formData.get("environment")        as string,
    provider:           formData.get("provider")           || "POSTGRESQL",
    db_host:            formData.get("db_host")            as string,
    db_port:            formData.get("db_port")            || null,
    db_name:            formData.get("db_name")            as string,
    db_user:            formData.get("db_user")            as string,
    password:           formData.get("password")           as string,
    ssl_mode:           formData.get("ssl_mode")           || "PREFER",
    connection_options: null,
    direct_db_host:     formData.get("direct_db_host")     as string,
    direct_db_port:     formData.get("direct_db_port")     || null,
    direct_db_name:     formData.get("direct_db_name")     as string,
    direct_db_user:     formData.get("direct_db_user")     as string,
    direct_password:    formData.get("direct_password")    as string,
    direct_ssl_mode:    formData.get("direct_ssl_mode")    || undefined,
  };

  const parsed = createDatabaseProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // Unicidad: label por organización
  const existing = await prisma.platformDatabaseProfile.findUnique({
    where: {
      organization_id_label: {
        organization_id: data.organization_id,
        label:           data.label,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return { errors: { label: ["Ya existe un perfil con este nombre para esta organización."] } };
  }

  // Verificar que la organización exista
  const org = await prisma.platformOrganization.findUnique({
    where:  { id: data.organization_id },
    select: { id: true },
  });
  if (!org) {
    return { errors: { organization_id: ["La organización no existe."] } };
  }

  // Cifrar el password antes de persistir — nunca en texto plano
  const encrypted_password = encryptText(data.password);

  // Conexión directa opcional para migraciones — todo-o-nada, ya validado
  // por el .superRefine del schema (host/db/usuario/password juntos o
  // los cuatro ausentes).
  const directConfigured = !!data.direct_db_host?.trim();
  const direct_encrypted_password = directConfigured ? encryptText(data.direct_password!) : null;

  await prisma.platformDatabaseProfile.create({
    data: {
      organization_id:    data.organization_id,
      label:              data.label,
      environment:        data.environment,
      provider:           data.provider,
      db_host:            data.db_host,
      db_port:            data.db_port ?? null,
      db_name:            data.db_name,
      db_user:            data.db_user,
      encrypted_password,
      ssl_mode:           data.ssl_mode,
      connection_options: data.connection_options
        ? (data.connection_options as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      direct_db_host:            directConfigured ? data.direct_db_host!.trim() : null,
      direct_db_port:            directConfigured ? (data.direct_db_port ?? null) : null,
      direct_db_name:            directConfigured ? data.direct_db_name!.trim() : null,
      direct_db_user:            directConfigured ? data.direct_db_user!.trim() : null,
      direct_encrypted_password,
      direct_ssl_mode:           directConfigured ? (data.direct_ssl_mode ?? "PREFER") : null,
      is_active:          true,
      created_by:         sessionUser.id,
    },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
