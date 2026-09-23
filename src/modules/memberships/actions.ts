"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
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
    };

    const parsed = planSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
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

    await context.client.clientMembership.create({
      data: {
        gym_id: context.gymId,
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
      },
    });
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

    await context.client.clientMembership.update({
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
      },
    });

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
    await context.client.clientMembership.update({ where: { id }, data: { status: next } });

    revalidatePath("/dashboard/memberships/client-memberships");
    revalidatePath(`/dashboard/clients/${membership.client_id}`);
  } finally {
    await dispose();
  }
}
