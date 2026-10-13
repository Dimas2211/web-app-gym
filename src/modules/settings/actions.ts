"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import {
  requireSuperAdmin,
  requireAdmin,
  requireClientManager,
  canManageClient,
  type SessionUser,
} from "@/lib/permissions/guards";
import { generateQrToken } from "@/lib/utils/operational-codes";
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
// Código operativo individual — Cliente (GYM)
// ══════════════════════════════════════════════

const CLIENT_CODE_MAX = 20;
const CLIENT_CODE_PATTERN = /^[A-Z0-9-]+$/;

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Credencial de cliente = operación cotidiana GYM: misma política que
 * Clients (super_admin tenant; branch_admin/reception su sucursal).
 *
 * Orden: requireClientManager (gate JWT) → requireOperationalContext
 * write=true (Support Session bloqueada) → Client por id + tenant efectivo
 * → canManageClient con identidad EFECTIVA (rol LIVE en RUNTIME_CLIENT) →
 * normalizar → duplicado dentro del mismo Gym (@@unique gym_id +
 * operational_code) → update. Todo sobre context.client.
 */
export async function updateClientOperationalCodeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  let clientId: string;
  try {
    const id = formData.get("entity_id");
    if (typeof id !== "string" || !id) return { error: "ID requerido." };

    const target = await context.client.client.findFirst({
      where: { id, tenant_id: context.tenantId },
      select: { id: true, gym_id: true, branch_id: true },
    });
    if (!target) return { error: "Cliente no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    } as SessionUser;
    if (!canManageClient(effectiveSessionUser, target)) {
      return { error: "Sin permiso para modificar este cliente." };
    }
    clientId = target.id;

    // El input ya se muestra en mayúsculas (CSS); se persiste igual a lo
    // que el operador ve. Los códigos auto-generados (prefijo [A-Z0-9])
    // ya son mayúsculas — no cambia ninguno existente salvo que se re-guarde.
    const raw = formData.get("operational_code");
    const code = typeof raw === "string" && raw.trim() ? raw.trim().toUpperCase() : null;

    if (code) {
      if (code.length > CLIENT_CODE_MAX || !CLIENT_CODE_PATTERN.test(code)) {
        return {
          errors: {
            operational_code: [
              `Solo letras, números y guiones (máx. ${CLIENT_CODE_MAX} caracteres).`,
            ],
          },
        };
      }

      // Duplicado solo dentro del mismo Gym (alcance del @@unique). Case-
      // insensitive para no coexistir con un código legacy en minúsculas.
      const duplicate = await context.client.client.findFirst({
        where: {
          gym_id: target.gym_id,
          operational_code: { equals: code, mode: "insensitive" },
          id: { not: target.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return { errors: { operational_code: ["Este código ya está en uso por otro cliente."] } };
      }
    }

    try {
      await context.client.client.update({
        where: { id: target.id },
        data: { operational_code: code },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { errors: { operational_code: ["Este código ya está en uso por otro cliente."] } };
      }
      throw err;
    }
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/edit`);
  revalidatePath(`/dashboard/clients/${clientId}/credential`);
  return undefined;
}

// ══════════════════════════════════════════════
// Token QR — Cliente sin token (legacy)
// ══════════════════════════════════════════════

/**
 * Genera qr_token SOLO si el Client no tiene uno. Nunca regenera ni
 * sobrescribe un token existente: el updateMany filtra `qr_token: null`,
 * por lo que es atómico frente a una carrera (count=0 → ya existía).
 */
export async function generateClientQrTokenAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  let clientId: string;
  try {
    const id = formData.get("entity_id");
    if (typeof id !== "string" || !id) return { error: "ID requerido." };

    const target = await context.client.client.findFirst({
      where: { id, tenant_id: context.tenantId },
      select: { id: true, branch_id: true, qr_token: true },
    });
    if (!target) return { error: "Cliente no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    } as SessionUser;
    if (!canManageClient(effectiveSessionUser, target)) {
      return { error: "Sin permiso para modificar este cliente." };
    }
    if (target.qr_token) return { error: "El cliente ya tiene un token QR." };
    clientId = target.id;

    await context.client.client.updateMany({
      where: { id: target.id, tenant_id: context.tenantId, qr_token: null },
      data: { qr_token: generateQrToken() },
    });
  } finally {
    await dispose();
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/credential`);
  return undefined;
}

// Avatar (Client / User): ya no hay server actions. La subida y la
// persistencia de avatar_url ocurren en una única operación autorizada:
//   POST /api/avatars/clients/[id] → modules/clients/avatar-service.ts
//   POST /api/avatars/users/[id]   → modules/users/avatar-service.ts
