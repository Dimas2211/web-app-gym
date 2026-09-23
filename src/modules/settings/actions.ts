"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin, requireAdmin } from "@/lib/permissions/guards";
import { gymSchema, sportSchema, goalSchema, gymSettingsSchema } from "./schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

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

  // FASE VI-D7: contexto operacional runtime — reemplaza
  // isRuntimeReadOnlyActive() + Prisma global. requireSuperAdmin() ya
  // exige auth_scope="PLATFORM" (Platform Admin), por lo que esta acción
  // es PLATFORM_NATIVE_ONLY — RUNTIME_CLIENT nunca la alcanza — pero se
  // enruta igual por context.client para no dejar un global.prisma
  // reachable en el archivo y por consistencia con el resto del módulo.
  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
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

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    // Verificar slug único (excluyendo el gym actual)
    const slugConflict = await context.client.gym.findFirst({
      where: { slug: parsed.data.slug, NOT: { id: context.gymId } },
    });
    if (slugConflict) {
      return { errors: { slug: ["Este slug ya está en uso por otro gimnasio."] } };
    }

    await context.client.gym.update({
      where: { id: context.gymId },
      data: parsed.data,
    });
  } finally {
    await dispose();
  }

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
  const user = await requireSuperAdmin();

  // PASO 6F: Sport es catálogo global (sin tenant_id), pero esta superficie
  // es funcionalidad GYM — bajo sesión runtime "Operar como cliente" (siempre
  // solo lectura) se bloquea igual que cualquier write operativo.
  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const parsed = sportSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const existing = await context.client.sport.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    });
    if (existing) {
      return { errors: { name: ["Ya existe un deporte con ese nombre."] } };
    }

    await context.client.sport.create({
      data: { ...parsed.data, status: "active" },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/settings/sports");
  redirect("/dashboard/settings/sports");
}

export async function updateSportAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const user = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de deporte requerido." };

    const parsed = sportSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const existing = await context.client.sport.findFirst({
      where: {
        name: { equals: parsed.data.name, mode: "insensitive" },
        NOT: { id },
      },
    });
    if (existing) {
      return { errors: { name: ["Ya existe un deporte con ese nombre."] } };
    }

    await context.client.sport.update({
      where: { id },
      data: parsed.data,
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/settings/sports");
  redirect("/dashboard/settings/sports");
}

export async function toggleSportStatusAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const sport = await context.client.sport.findUnique({ where: { id } });
    if (!sport) return;

    await context.client.sport.update({
      where: { id },
      data: { status: sport.status === "active" ? "inactive" : "active" },
    });

    revalidatePath("/dashboard/settings/sports");
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// GOALS
// ══════════════════════════════════════════════

export async function createGoalAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const user = await requireSuperAdmin();

  // PASO 6F: Goal es catálogo global (sin tenant_id), pero esta superficie
  // es funcionalidad GYM — bajo sesión runtime "Operar como cliente" se
  // bloquea igual que cualquier write operativo.
  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const parsed = goalSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const existing = await context.client.goal.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    });
    if (existing) {
      return { errors: { name: ["Ya existe una meta con ese nombre."] } };
    }

    await context.client.goal.create({
      data: { ...parsed.data, status: "active" },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/settings/goals");
  redirect("/dashboard/settings/goals");
}

export async function updateGoalAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const user = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de meta requerido." };

    const parsed = goalSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const existing = await context.client.goal.findFirst({
      where: {
        name: { equals: parsed.data.name, mode: "insensitive" },
        NOT: { id },
      },
    });
    if (existing) {
      return { errors: { name: ["Ya existe una meta con ese nombre."] } };
    }

    await context.client.goal.update({
      where: { id },
      data: parsed.data,
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/settings/goals");
  redirect("/dashboard/settings/goals");
}

export async function toggleGoalStatusAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const goal = await context.client.goal.findUnique({ where: { id } });
    if (!goal) return;

    await context.client.goal.update({
      where: { id },
      data: { status: goal.status === "active" ? "inactive" : "active" },
    });

    revalidatePath("/dashboard/settings/goals");
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// GYM SETTINGS — Códigos operativos
// ══════════════════════════════════════════════

export async function updateGymSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const user = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(user, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
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

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    await context.client.gymSettings.upsert({
      where: { gym_id: context.gymId },
      create: { gym_id: context.gymId, ...parsed.data },
      update: parsed.data,
    });
  } finally {
    await dispose();
  }

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
  // NOTA FASE VI-D4: esta acción es de gestión de identidad de STAFF
  // (tenant-level), no de Platform Admin — usa requireAdmin() + chequeo
  // explícito de rol super_admin (LIVE para RUNTIME_CLIENT) en vez de
  // requireSuperAdmin() (el gate de Platform Admin desde VI-B), que la
  // habría dejado permanentemente inalcanzable para cualquier identidad
  // RUNTIME_CLIENT. No se toca requireSuperAdmin() en sí ni el resto de
  // acciones de este archivo (gym/sports/goals — fuera de alcance).
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (context.effectiveUser.role !== "super_admin") {
      return { error: "Solo el Super Admin puede editar la identidad operativa." };
    }

    const id = formData.get("entity_id") as string;
    if (!id) return { error: "ID requerido." };

    const code = (formData.get("operational_code") as string)?.trim() || null;

    // Si hay código, verificar que no esté duplicado — contra la DB EFECTIVA.
    if (code) {
      const duplicate = await context.client.user.findFirst({
        where: { tenant_id: context.tenantId, operational_code: code, id: { not: id } },
      });
      if (duplicate) {
        return { errors: { operational_code: ["Este código ya está en uso por otro usuario."] } };
      }
    }

    await context.client.user.update({ where: { id }, data: { operational_code: code } });

    revalidatePath("/dashboard/users");
    revalidatePath(`/dashboard/users/${id}/edit`);
    revalidatePath(`/dashboard/users/${id}/credential`);
    return undefined;
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// Código operativo individual — Cliente
// ══════════════════════════════════════════════

export async function updateClientOperationalCodeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const sessionUser = await requireSuperAdmin();

  // FASE VI-D7: FIX — esta acción resolvía requireOperationalContext()
  // (arriba, en versiones previas via isRuntimeReadOnlyActive) pero seguía
  // escribiendo el registro Client a través del Prisma GLOBAL en vez de
  // context.client — un "half-migration" que parecía cerrado en revisión
  // de código pero dejaba el write real fuera del enrutamiento runtime.
  // Ahora usa context.client/context.tenantId de punta a punta, igual que
  // updateUserOperationalCodeAction arriba.
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("entity_id") as string;
    if (!id) return { error: "ID requerido." };

    const code = (formData.get("operational_code") as string)?.trim() || null;

    if (code) {
      const duplicate = await context.client.client.findFirst({
        where: { tenant_id: context.tenantId, operational_code: code, id: { not: id } },
      });
      if (duplicate) {
        return { errors: { operational_code: ["Este código ya está en uso por otro cliente."] } };
      }
    }

    await context.client.client.update({ where: { id }, data: { operational_code: code } });

    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${id}`);
    revalidatePath(`/dashboard/clients/${id}/edit`);
    revalidatePath(`/dashboard/clients/${id}/credential`);
    return undefined;
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// Avatar — Usuario
// ══════════════════════════════════════════════

export async function updateUserAvatarAction(formData: FormData): Promise<void> {
  // Ver nota FASE VI-D4 en updateUserOperationalCodeAction — mismo criterio.
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    if (context.effectiveUser.role !== "super_admin") return;

    const id = formData.get("entity_id") as string;
    const url = formData.get("avatar_url") as string;
    if (!id || !url) return;

    await context.client.user.update({ where: { id }, data: { avatar_url: url } });
    revalidatePath(`/dashboard/users/${id}/edit`);
    revalidatePath(`/dashboard/users/${id}/credential`);
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// Avatar — Cliente
// ══════════════════════════════════════════════

export async function updateClientAvatarAction(formData: FormData): Promise<void> {
  const sessionUser = await requireSuperAdmin();

  // FASE VI-D7: mismo fix que updateClientOperationalCodeAction — antes
  // escribía Client vía Prisma global pese a estar en el archivo migrado.
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("entity_id") as string;
    const url = formData.get("avatar_url") as string;
    if (!id || !url) return;

    await context.client.client.update({ where: { id }, data: { avatar_url: url } });
    revalidatePath(`/dashboard/clients/${id}`);
    revalidatePath(`/dashboard/clients/${id}/credential`);
  } finally {
    await dispose();
  }
}
