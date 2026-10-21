"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, type UserRole } from "@prisma/client";
import {
  requireClientManager,
  canManageClient,
  getSessionOrRedirect,
} from "@/lib/permissions/guards";
import {
  checkDeleteAuth,
  type DeleteAuthActionState,
} from "@/lib/permissions/delete-authorization";
import {
  createClientSchema,
  updateClientSchema,
  updatePortalEmailSchema,
  resetPortalPasswordSchema,
  changeClientModalitySchema,
} from "./schemas";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { MODALITY_LABELS, modalityChangeBlockers } from "@/modules/memberships/modality-rules";
import { loadGymBookingPolicy } from "@/modules/classes/booking/booking-service";
import { localDate } from "@/modules/classes/booking/booking-eligibility";
import { gymAdminScope } from "@/modules/classes/scheduling/admin-support";
import { updateCoreUser } from "@/core/modules/users/actions";
import { suggestNextClientCode, generateQrToken } from "@/lib/utils/operational-codes";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContext,
} from "@/modules/platform/runtime/require-operational-context";

export type ClientActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

function normalizeEmpty(value: FormDataEntryValue | null): string | null {
  const str = value as string | null;
  if (!str || str.trim() === "") return null;
  return str.trim();
}

function parseFormData(formData: FormData) {
  return {
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    document_id: normalizeEmpty(formData.get("document_id")),
    birth_date: normalizeEmpty(formData.get("birth_date")),
    gender: normalizeEmpty(formData.get("gender")),
    email: normalizeEmpty(formData.get("email")),
    phone: normalizeEmpty(formData.get("phone")),
    address: normalizeEmpty(formData.get("address")),
    emergency_contact_name: normalizeEmpty(formData.get("emergency_contact_name")),
    emergency_contact_phone: normalizeEmpty(formData.get("emergency_contact_phone")),
    sport_id: normalizeEmpty(formData.get("sport_id")),
    goal_id: normalizeEmpty(formData.get("goal_id")),
    assigned_trainer_id: normalizeEmpty(formData.get("assigned_trainer_id")),
    notes: normalizeEmpty(formData.get("notes")),
    branch_id: formData.get("branch_id"),
  };
}

// ──────────────────────────────────────────────
// Crear cliente
// ──────────────────────────────────────────────
export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  // requireClientManager(): gate de sesión/rol inicial sin cambios para PLATFORM.
  const sessionUser = await requireClientManager();

  // FASE VI-D7: contexto operacional runtime (DB efectiva, readOnly bajo
  // Support Session, ROL LIVE) — reemplaza el chequeo manual de
  // isRuntimeReadOnlyActive() + Prisma global + sessionUser.tenant_id/role
  // crudo del JWT. `clients` no tiene module code propio en el registro
  // comercial (es base de la vertical GYM, no un módulo activable/desactivable).
  // GYM-BOOKINGS 3A: una modalidad PERSONALIZED/GROUP sí exige gym.classes.
  const requestedModality = normalizeEmpty(formData.get("modality")) ?? "NORMAL";
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, {
      write: true,
      ...(requestedModality !== "NORMAL" ? { module: "gym.classes" } : {}),
    });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const raw = parseFormData(formData);

    // reception solo puede crear en su sucursal — evaluado con el ROL/location LIVE.
    if (context.effectiveUser.role === "reception") {
      if (raw.branch_id !== context.locationId) {
        return { error: "Solo puedes registrar clientes en tu propia sucursal." };
      }
    }

    const parsed = createClientSchema.safeParse({ ...raw, modality: requestedModality });
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const { branch_id, birth_date, gender, ...rest } = parsed.data;

    // GYM-BOOKINGS 3A — asignar PERSONALIZED/GROUP es decisión administrativa
    // (rol LIVE con canManageStaff: SA/BA). Recepción registra NORMAL.
    if (
      rest.modality !== "NORMAL" &&
      !getCapabilities(context.effectiveUser.role as UserRole).canManageStaff
    ) {
      return { errors: { modality: ["Solo un administrador puede asignar una modalidad personalizada o grupal."] } };
    }

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    // Generar código operativo y token QR para el nuevo cliente
    const operational_code = await suggestNextClientCode(context.tenantId, context.client);
    const qr_token = generateQrToken();

    await context.client.client.create({
      data: {
        gym_id: context.gymId,
        tenant_id: context.tenantId,
        branch_id,
        ...rest,
        birth_date: birth_date ? new Date(birth_date) : null,
        gender: gender ?? null,
        status: "active",
        operational_code,
        qr_token,
      },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Editar cliente
// ──────────────────────────────────────────────
export async function updateClientAction(
  _prev: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de cliente requerido." };

    const target = await context.client.client.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!target) return { error: "Cliente no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageClient(effectiveSessionUser, target)) {
      return { error: "Sin permiso para editar este cliente." };
    }

    const raw = parseFormData(formData);

    const parsed = updateClientSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const { branch_id, birth_date, gender, ...rest } = parsed.data;

    await context.client.client.update({
      where: { id },
      data: {
        branch_id,
        ...rest,
        birth_date: birth_date ? new Date(birth_date) : null,
        gender: gender ?? null,
      },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${formData.get("id")}`);
  redirect("/dashboard/clients");
}

// ──────────────────────────────────────────────
// GYM-BOOKINGS 3A — Cambio de modalidad (con historial append-only)
// ──────────────────────────────────────────────

export type ClientModalityActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: string }
  | undefined;

/**
 * Cambia Client.modality y registra ClientModalityChange (append-only por
 * trigger) en la MISMA transacción, con el cliente bloqueado FOR UPDATE
 * (mismo lock que bookSession y la venta de membresías: no entra una
 * reserva o venta a mitad del cambio).
 * Rechaza si quedarían membresías vigentes o reservas futuras de otra
 * modalidad. Solo SA/BA (rol LIVE) y con gym.classes habilitado.
 */
export async function changeClientModalityAction(
  _prev: ClientModalityActionState,
  formData: FormData
): Promise<ClientModalityActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: "Solo un administrador puede cambiar la modalidad del cliente." };

    const parsed = changeClientModalitySchema.safeParse({
      client_id: formData.get("client_id"),
      to_modality: formData.get("to_modality"),
      reason: formData.get("reason") ?? undefined,
    });
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const { client_id, to_modality, reason } = parsed.data;

    const policy = await loadGymBookingPolicy(context.client, context.tenantId);
    const today = new Date(`${localDate(new Date(), policy.timezone)}T00:00:00.000Z`);

    const result = await context.client.$transaction(
      async (tx): Promise<ClientModalityActionState> => {
        await tx.$queryRaw`SELECT "id" FROM "clients" WHERE "id" = ${client_id} AND "tenant_id" = ${context.tenantId} FOR UPDATE`;
        const client = await tx.client.findFirst({ where: { id: client_id, tenant_id: context.tenantId } });
        if (!client) return { error: "Cliente no encontrado." };
        const effectiveSessionUser = { ...context.effectiveUser, role: context.effectiveUser.role as UserRole };
        if (!canManageClient(effectiveSessionUser, client)) {
          return { error: "Sin permiso para modificar este cliente." };
        }
        if (client.modality === to_modality) {
          return { errors: { to_modality: ["El cliente ya tiene esa modalidad."] } };
        }

        const [currentMemberships, futureBookings] = await Promise.all([
          tx.clientMembership.findMany({
            where: { client_id, status: { in: ["active", "suspended"] }, end_date: { gte: today } },
            select: { modality: true },
          }),
          tx.classBooking.findMany({
            where: {
              client_id,
              booking_status: "confirmed",
              scheduled_class: { class_date: { gte: today }, status: { in: ["scheduled", "in_progress"] } },
            },
            select: { scheduled_class: { select: { session_kind: true } } },
          }),
        ]);
        const blockers = modalityChangeBlockers(to_modality, {
          currentMemberships,
          futureBookings: futureBookings.map((b) => b.scheduled_class),
        });
        if (blockers.length > 0) {
          return {
            error: `No se puede cambiar a ${MODALITY_LABELS[to_modality]}: el cliente tiene ${blockers.join(" y ")}. Finaliza o cancela esos registros primero.`,
          };
        }

        const changedAt = new Date();
        await tx.client.update({
          where: { id: client_id },
          data: { modality: to_modality, modality_changed_at: changedAt },
        });
        await tx.clientModalityChange.create({
          data: {
            tenant_id: context.tenantId,
            client_id,
            from_modality: client.modality,
            to_modality,
            reason,
            changed_by_user_id: context.effectiveUser.id,
            changed_at: changedAt,
          },
        });
        return { success: `Modalidad cambiada a ${MODALITY_LABELS[to_modality]}.` };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000, maxWait: 15_000 }
    );

    if (result?.success) {
      revalidatePath(`/dashboard/clients/${client_id}`);
      revalidatePath("/dashboard/clients");
    }
    return result;
  } finally {
    await dispose();
  }
}

// ──────────────────────────────────────────────
// Portal del cliente: habilitar acceso
// ──────────────────────────────────────────────

const enablePortalSchema = z.object({
  portal_email: z.string().email("Correo electrónico inválido"),
  portal_password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/**
 * Crea un User con role=client y lo vincula al Client.
 * Solo se puede llamar si el Client no tiene user_id todavía.
 */
export async function enableClientPortalAction(
  _prev: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const clientId = formData.get("client_id") as string;
    if (!clientId) return { error: "ID de cliente requerido." };

    const client = await context.client.client.findFirst({
      where: { id: clientId, tenant_id: context.tenantId },
    });
    if (!client) return { error: "Cliente no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageClient(effectiveSessionUser, client)) {
      return { error: "Sin permiso para modificar este cliente." };
    }
    if (client.user_id) {
      return { error: "Este cliente ya tiene acceso al portal habilitado." };
    }

    const raw = {
      portal_email: formData.get("portal_email"),
      portal_password: formData.get("portal_password"),
    };

    const parsed = enablePortalSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    // Gap G — unicidad de email por tenant, no global (Shared Runtime).
    const existingUser = await context.client.user.findUnique({
      where: { tenant_id_email: { tenant_id: context.tenantId, email: parsed.data.portal_email } },
    });
    if (existingUser) {
      return { errors: { portal_email: ["Este correo ya está en uso por otra cuenta."] } };
    }

    const password_hash = await bcrypt.hash(parsed.data.portal_password, 10);

    await context.client.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenant_id: context.tenantId,
          gym_id: client.gym_id,
          branch_id: client.branch_id,
          email: parsed.data.portal_email,
          password_hash,
          first_name: client.first_name,
          last_name: client.last_name,
          role: "client",
          status: "active",
        },
      });
      await tx.client.update({
        where: { id: clientId },
        data: { user_id: newUser.id },
      });
    });

    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/clients");
  } finally {
    await dispose();
  }
}

// ──────────────────────────────────────────────
// Portal del cliente: activar / desactivar acceso
// ──────────────────────────────────────────────

/**
 * Activa o desactiva la cuenta User vinculada al Client.
 * No elimina el vínculo: permite reactivar sin nueva contraseña.
 */
export async function toggleClientPortalStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const clientId = formData.get("client_id") as string;
    if (!clientId) return;

    const client = await context.client.client.findFirst({
      where: { id: clientId, tenant_id: context.tenantId },
      include: { user: { select: { id: true, status: true } } },
    });

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!client || !canManageClient(effectiveSessionUser, client)) return;
    if (!client.user_id || !client.user) return;

    await context.client.user.update({
      where: { id: client.user_id },
      data: {
        status: client.user.status === "active" ? "inactive" : "active",
      },
    });

    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/clients");
  } finally {
    await dispose();
  }
}

// ──────────────────────────────────────────────
// Portal del cliente: credenciales (correo / contraseña)
// ──────────────────────────────────────────────
// Solo tocan User.email / User.password_hash vía updateCoreUser (core):
// ownership por tenant, unicidad (tenant_id, email) y bcrypt viven ahí.
// Nunca modifican Client.email (contacto del expediente) ni User.status
// (responsabilidad de toggleClientPortalStatusAction).

export type ClientPortalCredentialActionState =
  | { success?: string; errors?: Record<string, string[]>; error?: string }
  | undefined;

type PortalUserResolution =
  | { ok: true; userId: string; currentEmail: string }
  | { ok: false; error: string };

/**
 * Localiza el User role=client vinculado a un Client del tenant efectivo,
 * validando canManageClient con el ROL LIVE. Fail closed en cualquier
 * inconsistencia. Nunca selecciona password_hash.
 */
async function resolveManagedPortalUser(
  context: OperationalContext,
  clientId: string,
): Promise<PortalUserResolution> {
  const client = await context.client.client.findFirst({
    where: { id: clientId, tenant_id: context.tenantId },
    select: { id: true, branch_id: true, user_id: true },
  });
  if (!client) return { ok: false, error: "Cliente no encontrado." };

  const effectiveSessionUser = {
    ...context.effectiveUser,
    role: context.effectiveUser.role as UserRole,
  };
  if (!canManageClient(effectiveSessionUser, client)) {
    return { ok: false, error: "Sin permiso para modificar este cliente." };
  }
  if (!client.user_id) {
    return { ok: false, error: "Este cliente no tiene acceso al portal habilitado." };
  }

  const user = await context.client.user.findFirst({
    where: { id: client.user_id, tenant_id: context.tenantId },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    return {
      ok: false,
      error: "La cuenta de acceso vinculada no existe o no pertenece a esta organización.",
    };
  }
  if (user.role !== "client") {
    return { ok: false, error: "La cuenta vinculada no es una cuenta de portal de cliente." };
  }

  return { ok: true, userId: user.id, currentEmail: user.email };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Cambia únicamente el correo de acceso (User.email) del portal del cliente. */
export async function updateClientPortalEmailAction(
  _prev: ClientPortalCredentialActionState,
  formData: FormData
): Promise<ClientPortalCredentialActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const clientId = formData.get("client_id");
    if (typeof clientId !== "string" || !clientId) {
      return { error: "ID de cliente requerido." };
    }

    const parsed = updatePortalEmailSchema.safeParse({
      portal_email: formData.get("portal_email"),
    });
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const resolved = await resolveManagedPortalUser(context, clientId);
    if (!resolved.ok) return { error: resolved.error };

    const newEmail = parsed.data.portal_email;
    if (newEmail === resolved.currentEmail) {
      return { success: "El correo indicado ya es el correo de acceso actual." };
    }

    let result;
    try {
      result = await updateCoreUser(
        resolved.userId,
        context.tenantId,
        { email: newEmail },
        context.client,
      );
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { errors: { portal_email: ["Este correo ya está en uso por otra cuenta."] } };
      }
      return { error: "No se pudo actualizar el correo de acceso. Intenta nuevamente." };
    }

    if (!result.success) {
      if (result.errors?.email) {
        return { errors: { portal_email: result.errors.email } };
      }
      return { error: result.error ?? "No se pudo actualizar el correo de acceso." };
    }

    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/clients");
    return { success: "Correo de acceso actualizado correctamente." };
  } finally {
    await dispose();
  }
}

/**
 * Restablecimiento administrativo de la contraseña del portal del cliente.
 * No pide la contraseña anterior. Solo cambia User.password_hash (hash en core).
 * No revoca sesiones existentes.
 */
export async function resetClientPortalPasswordAction(
  _prev: ClientPortalCredentialActionState,
  formData: FormData
): Promise<ClientPortalCredentialActionState> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const clientId = formData.get("client_id");
    if (typeof clientId !== "string" || !clientId) {
      return { error: "ID de cliente requerido." };
    }

    const parsed = resetPortalPasswordSchema.safeParse({
      new_password: formData.get("new_password"),
      confirm_password: formData.get("confirm_password"),
    });
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const resolved = await resolveManagedPortalUser(context, clientId);
    if (!resolved.ok) return { error: resolved.error };

    let result;
    try {
      result = await updateCoreUser(
        resolved.userId,
        context.tenantId,
        { password: parsed.data.new_password },
        context.client,
      );
    } catch {
      return { error: "No se pudo actualizar la contraseña. Intenta nuevamente." };
    }

    if (!result.success) {
      if (result.errors?.password) {
        return { errors: { new_password: result.errors.password } };
      }
      return { error: result.error ?? "No se pudo actualizar la contraseña." };
    }

    revalidatePath(`/dashboard/clients/${clientId}`);
    return { success: "Contraseña actualizada correctamente." };
  } finally {
    await dispose();
  }
}

// ──────────────────────────────────────────────
// Eliminación definitiva con autorización
// ──────────────────────────────────────────────
export async function deleteClientAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  // getSessionOrRedirect(): gate de sesión mínimo — la validación de
  // permisos real ocurre abajo con canManageClient sobre el ROL LIVE.
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    const target = await context.client.client.findFirst({
      where: { id, tenant_id: context.tenantId },
      include: {
        _count: {
          select: {
            memberships: true,
            class_bookings: true,
            class_attendance: true,
            weekly_plans: true,
          },
        },
      },
    });

    if (!target) return { error: "Cliente no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageClient(effectiveSessionUser, target)) {
      return { error: "Sin permisos para gestionar este cliente." };
    }

    // Bloqueos por dependencias: cualquier historial impide la eliminación
    const blocks: string[] = [];
    if (target._count.memberships > 0)
      blocks.push(`${target._count.memberships} membresía(s)`);
    if (target._count.class_bookings > 0)
      blocks.push(`${target._count.class_bookings} reserva(s) de clase`);
    if (target._count.class_attendance > 0)
      blocks.push(`${target._count.class_attendance} registro(s) de asistencia`);
    if (target._count.weekly_plans > 0)
      blocks.push(`${target._count.weekly_plans} plan(es) semanal(es)`);
    if (target.user_id)
      blocks.push("portal de acceso habilitado (deshabilítalo primero desde la ficha del cliente)");

    if (blocks.length > 0) {
      return {
        error: `No se puede eliminar: el cliente tiene ${blocks.join(", ")}. Desactívalo en su lugar, o elimina primero esos registros.`,
      };
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    await context.client.client.delete({ where: { id } });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Cambiar estado (soft delete / toggle)
// ──────────────────────────────────────────────
export async function toggleClientStatusAction(formData: FormData): Promise<void> {
  const sessionUser = await requireClientManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const target = await context.client.client.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!target || !canManageClient(effectiveSessionUser, target)) return;

    await context.client.client.update({
      where: { id },
      data: { status: target.status === "active" ? "inactive" : "active" },
    });

    revalidatePath("/dashboard/clients");
  } finally {
    await dispose();
  }
}
