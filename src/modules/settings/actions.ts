"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { gymSchema, sportSchema, goalSchema, gymSettingsSchema } from "./schemas";

export type SettingsActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ══════════════════════════════════════════════
// GYM
// ══════════════════════════════════════════════

export async function updateGymAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const user = await requireSuperAdmin();

  const parsed = gymSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    website: formData.get("website") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // Verificar slug único (excluyendo el gym actual)
  const slugConflict = await prisma.gym.findFirst({
    where: { slug: parsed.data.slug, NOT: { id: user.gym_id } },
  });
  if (slugConflict) {
    return { errors: { slug: ["Este slug ya está en uso por otro gimnasio."] } };
  }

  await prisma.gym.update({
    where: { id: user.gym_id },
    data: parsed.data,
  });

  revalidatePath("/dashboard/settings/gym");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings/gym");
}

// ══════════════════════════════════════════════
// SPORTS
// ══════════════════════════════════════════════

export async function createSportAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireSuperAdmin();

  const parsed = sportSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.sport.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) {
    return { errors: { name: ["Ya existe un deporte con ese nombre."] } };
  }

  await prisma.sport.create({
    data: { ...parsed.data, status: "active" },
  });

  revalidatePath("/dashboard/settings/sports");
  redirect("/dashboard/settings/sports");
}

export async function updateSportAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireSuperAdmin();

  const id = formData.get("id") as string;
  if (!id) return { error: "ID de deporte requerido." };

  const parsed = sportSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.sport.findFirst({
    where: {
      name: { equals: parsed.data.name, mode: "insensitive" },
      NOT: { id },
    },
  });
  if (existing) {
    return { errors: { name: ["Ya existe un deporte con ese nombre."] } };
  }

  await prisma.sport.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/dashboard/settings/sports");
  redirect("/dashboard/settings/sports");
}

export async function toggleSportStatusAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const sport = await prisma.sport.findUnique({ where: { id } });
  if (!sport) return;

  await prisma.sport.update({
    where: { id },
    data: { status: sport.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/settings/sports");
}

// ══════════════════════════════════════════════
// GOALS
// ══════════════════════════════════════════════

export async function createGoalAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireSuperAdmin();

  const parsed = goalSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.goal.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) {
    return { errors: { name: ["Ya existe una meta con ese nombre."] } };
  }

  await prisma.goal.create({
    data: { ...parsed.data, status: "active" },
  });

  revalidatePath("/dashboard/settings/goals");
  redirect("/dashboard/settings/goals");
}

export async function updateGoalAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireSuperAdmin();

  const id = formData.get("id") as string;
  if (!id) return { error: "ID de meta requerido." };

  const parsed = goalSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.goal.findFirst({
    where: {
      name: { equals: parsed.data.name, mode: "insensitive" },
      NOT: { id },
    },
  });
  if (existing) {
    return { errors: { name: ["Ya existe una meta con ese nombre."] } };
  }

  await prisma.goal.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/dashboard/settings/goals");
  redirect("/dashboard/settings/goals");
}

export async function toggleGoalStatusAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return;

  await prisma.goal.update({
    where: { id },
    data: { status: goal.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/settings/goals");
}

// ══════════════════════════════════════════════
// GYM SETTINGS — Códigos operativos
// ══════════════════════════════════════════════

export async function updateGymSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const user = await requireSuperAdmin();

  const parsed = gymSettingsSchema.safeParse({
    staff_code_prefix: formData.get("staff_code_prefix"),
    staff_code_digits: formData.get("staff_code_digits"),
    staff_code_start: formData.get("staff_code_start"),
    client_code_prefix: formData.get("client_code_prefix"),
    client_code_digits: formData.get("client_code_digits"),
    client_code_start: formData.get("client_code_start"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.gymSettings.upsert({
    where: { gym_id: user.gym_id },
    create: { gym_id: user.gym_id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/dashboard/settings/codes");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings/codes");
}

// ══════════════════════════════════════════════
// Código operativo individual — Usuario
// ══════════════════════════════════════════════

export async function updateUserOperationalCodeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const sessionUser = await requireSuperAdmin();

  const id = formData.get("entity_id") as string;
  if (!id) return { error: "ID requerido." };

  const code = (formData.get("operational_code") as string)?.trim() || null;

  // Si hay código, verificar que no esté duplicado
  if (code) {
    const duplicate = await prisma.user.findFirst({
      where: { gym_id: sessionUser.gym_id, operational_code: code, id: { not: id } },
    });
    if (duplicate) {
      return { errors: { operational_code: ["Este código ya está en uso por otro usuario."] } };
    }
  }

  await prisma.user.update({ where: { id }, data: { operational_code: code } });

  revalidatePath("/dashboard/users");
  revalidatePath(`/dashboard/users/${id}/edit`);
  revalidatePath(`/dashboard/users/${id}/credential`);
  return undefined;
}

// ══════════════════════════════════════════════
// Código operativo individual — Cliente
// ══════════════════════════════════════════════

export async function updateClientOperationalCodeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const sessionUser = await requireSuperAdmin();

  const id = formData.get("entity_id") as string;
  if (!id) return { error: "ID requerido." };

  const code = (formData.get("operational_code") as string)?.trim() || null;

  if (code) {
    const duplicate = await prisma.client.findFirst({
      where: { gym_id: sessionUser.gym_id, operational_code: code, id: { not: id } },
    });
    if (duplicate) {
      return { errors: { operational_code: ["Este código ya está en uso por otro cliente."] } };
    }
  }

  await prisma.client.update({ where: { id }, data: { operational_code: code } });

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${id}`);
  revalidatePath(`/dashboard/clients/${id}/edit`);
  revalidatePath(`/dashboard/clients/${id}/credential`);
  return undefined;
}

// ══════════════════════════════════════════════
// Avatar — Usuario
// ══════════════════════════════════════════════

export async function updateUserAvatarAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = formData.get("entity_id") as string;
  const url = formData.get("avatar_url") as string;
  if (!id || !url) return;

  await prisma.user.update({ where: { id }, data: { avatar_url: url } });
  revalidatePath(`/dashboard/users/${id}/edit`);
  revalidatePath(`/dashboard/users/${id}/credential`);
}

// ══════════════════════════════════════════════
// Avatar — Cliente
// ══════════════════════════════════════════════

export async function updateClientAvatarAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = formData.get("entity_id") as string;
  const url = formData.get("avatar_url") as string;
  if (!id || !url) return;

  await prisma.client.update({ where: { id }, data: { avatar_url: url } });
  revalidatePath(`/dashboard/clients/${id}`);
  revalidatePath(`/dashboard/clients/${id}/credential`);
}
