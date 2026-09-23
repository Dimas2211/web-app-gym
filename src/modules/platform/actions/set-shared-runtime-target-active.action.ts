"use server";

// ─────────────────────────────────────────────────────────────────
// platform — set-shared-runtime-target-active.action.ts
//
// Activa o desactiva un PlatformSharedRuntimeTarget. No toca
// credenciales — solo is_active. Un target inactivo hace fail closed
// (SharedRuntimeTargetInactiveError) en cualquier resolución runtime,
// incluso para organizaciones ya asignadas a él.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";

export type SetSharedRuntimeTargetActiveState = { error?: string } | undefined;

export async function setSharedRuntimeTargetActiveAction(
  targetId: string,
  isActive: boolean,
): Promise<SetSharedRuntimeTargetActiveState> {
  await requireSuperAdmin();

  if (!targetId) {
    return { error: "ID de Shared Runtime requerido." };
  }

  const existing = await prisma.platformSharedRuntimeTarget.findUnique({
    where:  { id: targetId },
    select: { id: true },
  });
  if (!existing) {
    return { error: "Shared Runtime no encontrado." };
  }

  await prisma.platformSharedRuntimeTarget.update({
    where: { id: targetId },
    data:  { is_active: isActive },
  });

  revalidatePath("/dashboard/platform/database-profiles");
}
