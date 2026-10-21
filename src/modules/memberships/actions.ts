"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type GymClientModality, type UserRole } from "@prisma/client";
import {
  requireAdmin,
  requireMembershipManager,
  canManagePlan,
  canManageMembership,
  getSessionOrRedirect,
} from "@/lib/permissions/guards";
import {
  checkDeleteAuth,
  type DeleteAuthActionState,
} from "@/lib/permissions/delete-authorization";
import {
  planSchema,
  createClientMembershipSchema,
  updateClientMembershipSchema,
} from "./schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { membershipSnapshotFromPlan, saleModalityFailure } from "./modality-rules";

export type MembershipActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Helpers ──────────────────────────────────────────────────

function norm(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return s && s.trim() !== "" ? s.trim() : null;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

// ── GYM-BOOKINGS 3A — modalidad, sede y entrenador de la membresía ──

const MEMBERSHIP_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 20_000,
  maxWait: 15_000,
};

type MembershipFailure = { errors?: Record<string, string[]>; error?: string };

/**
 * Bloqueos en el orden global (GYM_BOOKING_LOCK_ORDER): trainers (SHARE,
 * el entrenador asignado no cambia de sede a mitad) → clients FOR UPDATE
 * (serializa con bookSession y con el cambio de modalidad).
 */
async function lockMembershipParents(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clientId: string,
  trainerId: string | null
) {
  if (trainerId) {
    await tx.$queryRaw`SELECT "id" FROM "trainers" WHERE "id" = ${trainerId} AND "tenant_id" = ${tenantId} FOR SHARE`;
  }
  await tx.$queryRaw`SELECT "id" FROM "clients" WHERE "id" = ${clientId} AND "tenant_id" = ${tenantId} FOR UPDATE`;
}

/**
 * Entrenador autorizado: obligatorio para PERSONALIZED (del tenant, activo
 * y de la sede de la membresía: R10, también exigido por trigger); para
 * NORMAL/GROUP siempre null.
 */
async function resolveAssignedTrainer(
  tx: Prisma.TransactionClient,
  tenantId: string,
  modality: GymClientModality,
  trainerId: string | null | undefined,
  membershipBranchId: string
): Promise<{ trainerId: string | null } | { failure: MembershipFailure }> {
  if (modality !== "PERSONALIZED") return { trainerId: null };
  if (!trainerId) {
    return { failure: { errors: { assigned_trainer_id: ["Selecciona el entrenador de la membresía personalizada."] } } };
  }
  const trainer = await tx.trainer.findFirst({
    where: { id: trainerId, tenant_id: tenantId },
    select: { id: true, status: true, branch_id: true },
  });
  if (!trainer) return { failure: { errors: { assigned_trainer_id: ["Entrenador no encontrado."] } } };
  if (trainer.status !== "active") return { failure: { errors: { assigned_trainer_id: ["El entrenador no está activo."] } } };
  if (trainer.branch_id !== membershipBranchId) {
    return { failure: { errors: { assigned_trainer_id: ["El entrenador debe pertenecer a la sucursal de la membresía."] } } };
  }
  return { trainerId: trainer.id };
}

/** Sede del plan (null = todas) y, para PERSONALIZED/GROUP, sede del cliente. */
function membershipBranchFailure(
  plan: { branch_id: string | null; modality: GymClientModality },
  client: { branch_id: string },
  membershipBranchId: string
): MembershipFailure | null {
  if (plan.branch_id && plan.branch_id !== membershipBranchId) {
    return { errors: { membership_plan_id: ["El plan no está disponible para esta sucursal."] } };
  }
  if (plan.modality !== "NORMAL" && client.branch_id !== membershipBranchId) {
    return { errors: { branch_id: ["La membresía personalizada o grupal debe ser de la sucursal del cliente."] } };
  }
  return null;
}

// ── PLANES ───────────────────────────────────────────────────

export async function createPlanAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireAdmin();

  // FASE VI-D7: contexto operacional runtime — reemplaza
  // isRuntimeReadOnlyActive() + assertMembershipsModule(sessionUser.tenant_id)
  // manuales por un único gate (module + write + readOnly) evaluado sobre
  // el tenant EFECTIVO, nunca sobre el tenant_id crudo del JWT.
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const effectiveRole = context.effectiveUser.role;

    const raw = {
      code: norm(formData.get("code")),
      name: formData.get("name"),
      description: norm(formData.get("description")),
      duration_days: formData.get("duration_days"),
      sessions_limit: norm(formData.get("sessions_limit")),
      price: formData.get("price"),
      access_type: formData.get("access_type"),
      is_recurring: formData.get("is_recurring") === "on",
      branch_id:
        effectiveRole === "branch_admin"
          ? context.locationId
          : norm(formData.get("branch_id")),
      modality: norm(formData.get("modality")) ?? undefined,
    };

    const parsed = planSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    // branch_admin solo puede crear planes para su sucursal
    if (
      effectiveRole === "branch_admin" &&
      parsed.data.branch_id !== context.locationId
    ) {
      return { error: "Solo puedes crear planes para tu propia sucursal." };
    }

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    await context.client.membershipPlan.create({
      data: {
        gym_id: context.gymId,
        tenant_id: context.tenantId,
        branch_id: parsed.data.branch_id ?? null,
        code: parsed.data.code ?? null,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        duration_days: parsed.data.duration_days,
        sessions_limit: parsed.data.sessions_limit ?? null,
        price: parsed.data.price,
        access_type: parsed.data.access_type,
        is_recurring: parsed.data.is_recurring,
        modality: parsed.data.modality,
        status: "active",
      },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/memberships/plans");
  redirect("/dashboard/memberships/plans");
}

export async function updatePlanAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de plan requerido." };

    const plan = await context.client.membershipPlan.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!plan) return { error: "Plan no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManagePlan(effectiveSessionUser, plan)) {
      return { error: "Sin permiso para editar este plan." };
    }

    const raw = {
      code: norm(formData.get("code")),
      name: formData.get("name"),
      description: norm(formData.get("description")),
      duration_days: formData.get("duration_days"),
      sessions_limit: norm(formData.get("sessions_limit")),
      price: formData.get("price"),
      access_type: formData.get("access_type"),
      is_recurring: formData.get("is_recurring") === "on",
      branch_id: plan.branch_id, // no se cambia la sucursal en edición
      // Sin campo (formularios previos) = conserva la modalidad actual.
      modality: norm(formData.get("modality")) ?? plan.modality,
    };

    const parsed = planSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    // GYM-BOOKINGS 3A — los snapshots vendidos no cambian, pero un plan con
    // membresías no cambia de modalidad (evita un plan "Personalizado" con
    // ventas NORMAL). sessions_limit sí: solo afecta ventas futuras.
    if (parsed.data.modality !== plan.modality) {
      const sold = await context.client.clientMembership.count({ where: { membership_plan_id: id } });
      if (sold > 0) {
        return {
          errors: {
            modality: [`No se puede cambiar la modalidad: el plan tiene ${sold} membresía(s) vendida(s). Crea un plan nuevo.`],
          },
        };
      }
    }

    await context.client.membershipPlan.update({
      where: { id },
      data: {
        code: parsed.data.code ?? null,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        duration_days: parsed.data.duration_days,
        sessions_limit: parsed.data.sessions_limit ?? null,
        price: parsed.data.price,
        access_type: parsed.data.access_type,
        is_recurring: parsed.data.is_recurring,
        modality: parsed.data.modality,
      },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/memberships/plans");
  redirect("/dashboard/memberships/plans");
}

export async function togglePlanStatusAction(formData: FormData): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const plan = await context.client.membershipPlan.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!plan || !canManagePlan(effectiveSessionUser, plan)) return;

    await context.client.membershipPlan.update({
      where: { id },
      data: { status: plan.status === "active" ? "inactive" : "active" },
    });

    revalidatePath("/dashboard/memberships/plans");
  } finally {
    await dispose();
  }
}

// ── MEMBRESÍAS DE CLIENTES ───────────────────────────────────

export async function createClientMembershipAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireMembershipManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const effectiveRole = context.effectiveUser.role;

    const raw = {
      client_id: formData.get("client_id"),
      membership_plan_id: formData.get("membership_plan_id"),
      branch_id:
        effectiveRole !== "super_admin"
          ? context.locationId
          : formData.get("branch_id"),
      start_date: formData.get("start_date"),
      price_at_sale: formData.get("price_at_sale"),
      discount_amount: formData.get("discount_amount") || "0",
      payment_status: formData.get("payment_status"),
      notes: norm(formData.get("notes")),
      assigned_trainer_id: norm(formData.get("assigned_trainer_id")),
    };

    const parsed = createClientMembershipSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    // Verificar plan activo — dentro del tenant efectivo
    const plan = await context.client.membershipPlan.findFirst({
      where: { id: parsed.data.membership_plan_id, tenant_id: context.tenantId },
    });
    if (!plan) return { errors: { membership_plan_id: ["Plan no encontrado."] } };
    if (plan.status !== "active") {
      return { errors: { membership_plan_id: ["El plan seleccionado no está activo."] } };
    }

    // Verificar cliente en el scope correcto
    const client = await context.client.client.findFirst({
      where: { id: parsed.data.client_id, tenant_id: context.tenantId },
    });
    if (!client) return { errors: { client_id: ["Cliente no encontrado."] } };
    if (
      effectiveRole !== "super_admin" &&
      client.branch_id !== context.locationId
    ) {
      return { errors: { client_id: ["El cliente no pertenece a tu sucursal."] } };
    }

    // Calcular montos y fechas
    const final_amount = parsed.data.price_at_sale - parsed.data.discount_amount;
    if (final_amount < 0) {
      return { errors: { discount_amount: ["El monto final no puede ser negativo."] } };
    }
    const end_date = addDays(parsed.data.start_date, plan.duration_days);

    if (!context.gymId) {
      return { errors: { membership_plan_id: ["El módulo GYM no está configurado para esta organización."] } };
    }
    const gymId = context.gymId;

    // GYM-BOOKINGS 3A — sede del tenant, sede del plan, modalidad del cliente
    // (bajo su lock) y entrenador PERSONALIZED; snapshot del plan al vender.
    const branch = await context.client.branch.findFirst({
      where: { id: parsed.data.branch_id, tenant_id: context.tenantId },
      select: { id: true },
    });
    if (!branch) return { errors: { branch_id: ["Sucursal no encontrada."] } };
    const branchFailure = membershipBranchFailure(plan, client, parsed.data.branch_id);
    if (branchFailure) return branchFailure;

    const snapshot = membershipSnapshotFromPlan(plan);
    const failure = await context.client.$transaction(async (tx): Promise<MembershipFailure | null> => {
      const trainerInput = snapshot.modality === "PERSONALIZED" ? (parsed.data.assigned_trainer_id ?? null) : null;
      await lockMembershipParents(tx, context.tenantId, parsed.data.client_id, trainerInput);
      const locked = await tx.client.findFirst({
        where: { id: parsed.data.client_id, tenant_id: context.tenantId },
        select: { modality: true },
      });
      if (!locked) return { errors: { client_id: ["Cliente no encontrado."] } };
      const modalityFailure = saleModalityFailure(locked.modality, snapshot.modality);
      if (modalityFailure) return { errors: { membership_plan_id: [modalityFailure] } };

      const trainer = await resolveAssignedTrainer(tx, context.tenantId, snapshot.modality, trainerInput, parsed.data.branch_id);
      if ("failure" in trainer) return trainer.failure;

      await tx.clientMembership.create({
        data: {
          gym_id: gymId,
          tenant_id: context.tenantId,
          branch_id: parsed.data.branch_id,
          client_id: parsed.data.client_id,
          membership_plan_id: parsed.data.membership_plan_id,
          start_date: new Date(parsed.data.start_date),
          end_date,
          price_at_sale: parsed.data.price_at_sale,
          discount_amount: parsed.data.discount_amount,
          final_amount,
          payment_status: parsed.data.payment_status,
          status: "active",
          sold_by_user_id: context.effectiveUser.id,
          notes: parsed.data.notes ?? null,
          modality: snapshot.modality,
          sessions_total: snapshot.sessions_total,
          assigned_trainer_id: trainer.trainerId,
        },
      });
      return null;
    }, MEMBERSHIP_TX);
    if (failure) return failure;
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/memberships/client-memberships");
  revalidatePath(`/dashboard/clients/${formData.get("client_id")}`);
  redirect("/dashboard/memberships/client-memberships");
}

export async function updateClientMembershipAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireMembershipManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de membresía requerido." };

    const existing = await context.client.clientMembership.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!existing) return { error: "Membresía no encontrada." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageMembership(effectiveSessionUser, existing)) {
      return { error: "Sin permiso para editar esta membresía." };
    }

    const raw = {
      membership_plan_id: formData.get("membership_plan_id"),
      start_date: formData.get("start_date"),
      price_at_sale: formData.get("price_at_sale"),
      discount_amount: formData.get("discount_amount") || "0",
      payment_status: formData.get("payment_status"),
      status: formData.get("status"),
      notes: norm(formData.get("notes")),
      assigned_trainer_id: norm(formData.get("assigned_trainer_id")),
    };

    const parsed = updateClientMembershipSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    // Verificar plan — dentro del tenant efectivo
    const plan = await context.client.membershipPlan.findFirst({
      where: { id: parsed.data.membership_plan_id, tenant_id: context.tenantId },
    });
    if (!plan) return { errors: { membership_plan_id: ["Plan no encontrado."] } };

    const final_amount = parsed.data.price_at_sale - parsed.data.discount_amount;
    if (final_amount < 0) {
      return { errors: { discount_amount: ["El monto final no puede ser negativo."] } };
    }
    const end_date = addDays(parsed.data.start_date, plan.duration_days);

    // GYM-BOOKINGS 3A — el snapshot (modalidad, sessions_total) solo se
    // re-toma del plan si se cambia de plan y la membresía no tiene reservas
    // (su consumo depende de él). sessions_used nunca se edita aquí.
    const planChanged = plan.id !== existing.membership_plan_id;
    const failure = await context.client.$transaction(async (tx): Promise<MembershipFailure | null> => {
      const current = await tx.clientMembership.findFirst({ where: { id, tenant_id: context.tenantId } });
      if (!current) return { error: "Membresía no encontrada." };
      const snapshot = planChanged
        ? membershipSnapshotFromPlan(plan)
        : { modality: current.modality, sessions_total: current.sessions_total };
      const trainerInput =
        snapshot.modality === "PERSONALIZED" ? (parsed.data.assigned_trainer_id ?? current.assigned_trainer_id) : null;

      await lockMembershipParents(tx, context.tenantId, current.client_id, trainerInput);
      await tx.$queryRaw`SELECT "id" FROM "client_memberships" WHERE "id" = ${id} AND "tenant_id" = ${context.tenantId} FOR UPDATE`;
      const client = await tx.client.findFirst({
        where: { id: current.client_id, tenant_id: context.tenantId },
        select: { modality: true, branch_id: true },
      });
      if (!client) return { error: "Cliente no encontrado." };

      if (planChanged) {
        const bookings = await tx.classBooking.count({ where: { client_membership_id: id } });
        if (bookings > 0) {
          return { errors: { membership_plan_id: ["No se puede cambiar el plan: la membresía tiene reservas registradas."] } };
        }
        const branchFailure = membershipBranchFailure(plan, client, current.branch_id);
        if (branchFailure) return branchFailure;
      }
      // Activar (o mantener activa) exige modalidad compatible con el cliente.
      if (parsed.data.status === "active" || parsed.data.status === "suspended") {
        const modalityFailure = saleModalityFailure(client.modality, snapshot.modality);
        if (modalityFailure) return { errors: { status: [modalityFailure] } };
      }

      const trainer = await resolveAssignedTrainer(tx, context.tenantId, snapshot.modality, trainerInput, current.branch_id);
      if ("failure" in trainer) return trainer.failure;
      // Reasignar el entrenador con reservas futuras del anterior rompería R10.
      if (snapshot.modality === "PERSONALIZED" && trainer.trainerId !== current.assigned_trainer_id) {
        const pending = await tx.classBooking.count({
          where: {
            client_membership_id: id,
            booking_status: "confirmed",
            scheduled_class: { status: { in: ["scheduled", "in_progress"] }, trainer_id: { not: trainer.trainerId ?? undefined } },
          },
        });
        if (pending > 0) {
          return {
            errors: {
              assigned_trainer_id: [
                `No se puede reasignar: hay ${pending} reserva(s) vigente(s) con el entrenador anterior. Cancélalas primero.`,
              ],
            },
          };
        }
      }

      await tx.clientMembership.update({
        where: { id },
        data: {
          membership_plan_id: parsed.data.membership_plan_id,
          start_date: new Date(parsed.data.start_date),
          end_date,
          price_at_sale: parsed.data.price_at_sale,
          discount_amount: parsed.data.discount_amount,
          final_amount,
          payment_status: parsed.data.payment_status,
          status: parsed.data.status,
          notes: parsed.data.notes ?? null,
          modality: snapshot.modality,
          sessions_total: snapshot.sessions_total,
          assigned_trainer_id: trainer.trainerId,
        },
      });
      return null;
    }, MEMBERSHIP_TX);
    if (failure) return failure;

    revalidatePath("/dashboard/memberships/client-memberships");
    revalidatePath(`/dashboard/clients/${existing.client_id}`);
  } finally {
    await dispose();
  }

  redirect("/dashboard/memberships/client-memberships");
}

// ── ELIMINACIÓN DEFINITIVA: PLAN ─────────────────────────────

export async function deletePlanAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    const plan = await context.client.membershipPlan.findFirst({
      where: { id, tenant_id: context.tenantId },
      include: { _count: { select: { client_memberships: true } } },
    });

    if (!plan) return { error: "Plan no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManagePlan(effectiveSessionUser, plan)) {
      return { error: "Sin permisos para gestionar este plan." };
    }

    if (plan._count.client_memberships > 0) {
      return {
        error: `No se puede eliminar: hay ${plan._count.client_memberships} membresía(s) de clientes asignada(s) a este plan. Desactiva el plan en su lugar.`,
      };
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    await context.client.membershipPlan.delete({ where: { id } });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/memberships/plans");
  redirect("/dashboard/memberships/plans");
}

// ── ELIMINACIÓN DEFINITIVA: MEMBRESÍA DE CLIENTE ─────────────

export async function deleteClientMembershipAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    const membership = await context.client.clientMembership.findFirst({
      where: { id, tenant_id: context.tenantId },
    });

    if (!membership) return { error: "Membresía no encontrada." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageMembership(effectiveSessionUser, membership)) {
      return { error: "Sin permisos para gestionar esta membresía." };
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    await context.client.clientMembership.delete({ where: { id } });

    revalidatePath("/dashboard/memberships/client-memberships");
    revalidatePath(`/dashboard/clients/${membership.client_id}`);
  } finally {
    await dispose();
  }

  redirect("/dashboard/memberships/client-memberships");
}

export async function toggleClientMembershipStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireMembershipManager();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.memberships", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const membership = await context.client.clientMembership.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!membership || !canManageMembership(effectiveSessionUser, membership)) return;

    const next = membership.status === "active" ? "cancelled" : "active";
    // GYM-BOOKINGS 3A — no reactivar una membresía de otra modalidad que el cliente.
    if (next === "active") {
      const client = await context.client.client.findFirst({
        where: { id: membership.client_id, tenant_id: context.tenantId },
        select: { modality: true },
      });
      if (!client || saleModalityFailure(client.modality, membership.modality)) return;
    }
    await context.client.clientMembership.update({ where: { id }, data: { status: next } });

    revalidatePath("/dashboard/memberships/client-memberships");
    revalidatePath(`/dashboard/clients/${membership.client_id}`);
  } finally {
    await dispose();
  }
}
