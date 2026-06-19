"use server";

// ─────────────────────────────────────────────────────────────────
// platform — set-database-profile-active.action.ts
//
// Activa o desactiva un PlatformDatabaseProfile.
// No toca credenciales — solo el campo is_active.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";

export type SetDatabaseProfileActiveState =
  | { error?: string }
  | undefined;

export async function setDatabaseProfileActiveAction(
  profileId: string,
  isActive: boolean,
): Promise<SetDatabaseProfileActiveState> {
  await requireSuperAdmin();

  if (!profileId) {
    return { error: "ID de perfil requerido." };
  }

  const existing = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: { id: true },
  });
  if (!existing) {
    return { error: "Perfil de base de datos no encontrado." };
  }

  await prisma.platformDatabaseProfile.update({
    where: { id: profileId },
    data:  { is_active: isActive },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
