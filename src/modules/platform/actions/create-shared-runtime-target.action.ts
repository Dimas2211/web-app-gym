"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-shared-runtime-target.action.ts
//
// SHARED-PILOT-4A / Gap B. Crea un PlatformSharedRuntimeTarget — una
// base física runtime reusable que múltiples PlatformOrganization
// pueden seleccionar desde UI sin volver a escribir host/password por
// cliente. Mismo tratamiento de cifrado que
// create-database-profile.action.ts (AES-256-GCM, nunca texto plano).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { encryptText, assertEncryptionAvailable } from "@/lib/security/encryption";
import { createSharedRuntimeTargetSchema } from "../schemas/create-shared-runtime-target.schema";

export type SharedRuntimeTargetActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createSharedRuntimeTargetAction(
  _prev: SharedRuntimeTargetActionState,
  formData: FormData,
): Promise<SharedRuntimeTargetActionState> {
  const sessionUser = await requireSuperAdmin();

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
    label:       formData.get("label")       as string,
    environment: formData.get("environment") as string,
    provider:    formData.get("provider")    || "POSTGRESQL",
    db_host:     formData.get("db_host")     as string,
    db_port:     formData.get("db_port")     || null,
    db_name:     formData.get("db_name")     as string,
    db_user:     formData.get("db_user")     as string,
    password:    formData.get("password")    as string,
    ssl_mode:    formData.get("ssl_mode")    || "PREFER",
  };

  const parsed = createSharedRuntimeTargetSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.platformSharedRuntimeTarget.findUnique({
    where:  { label: data.label },
    select: { id: true },
  });
  if (existing) {
    return { errors: { label: ["Ya existe un Shared Runtime con este nombre."] } };
  }

  const encrypted_password = encryptText(data.password);

  await prisma.platformSharedRuntimeTarget.create({
    data: {
      label:       data.label,
      environment: data.environment,
      provider:    data.provider,
      db_host:     data.db_host,
      db_port:     data.db_port ?? null,
      db_name:     data.db_name,
      db_user:     data.db_user,
      encrypted_password,
      ssl_mode:    data.ssl_mode,
      is_active:   true,
      created_by:  sessionUser.id,
    },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
