"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  requireAdmin,
  requireMembershipManager,
  canManagePlan,
  canManageMembership,
} from "@/lib/permissions/guards";
import {
  planSchema,
  createClientMembershipSchema,
  updateClientMembershipSchema,
} from "./schemas";

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
      sessionUser.role === "branch_admin"
        ? sessionUser.branch_id
        : norm(formData.get("branch_id")),
  };

  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // branch_admin solo puede crear planes para su sucursal
  if (
    sessionUser.role === "branch_admin" &&
    parsed.data.branch_id !== sessionUser.branch_id
  ) {
    return { error: "Solo puedes crear planes para tu propia sucursal." };
  }

  await prisma.membershipPlan.create({
    data: {
      gym_id: sessionUser.gym_id,
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

  revalidatePath("/dashboard/memberships/plans");
  redirect("/dashboard/memberships/plans");
}

export async function updatePlanAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID de plan requerido." };

  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan) return { error: "Plan no encontrado." };
  if (!canManagePlan(sessionUser, plan)) {
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

  await prisma.membershipPlan.update({
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

  revalidatePath("/dashboard/memberships/plans");
  redirect("/dashboard/memberships/plans");
}

export async function togglePlanStatusAction(formData: FormData): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan || !canManagePlan(sessionUser, plan)) return;

  await prisma.membershipPlan.update({
    where: { id },
    data: { status: plan.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/memberships/plans");
}

// ── MEMBRESÍAS DE CLIENTES ───────────────────────────────────

export async function createClientMembershipAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireMembershipManager();

  const raw = {
    client_id: formData.get("client_id"),
    membership_plan_id: formData.get("membership_plan_id"),
    branch_id:
      sessionUser.role !== "super_admin"
        ? sessionUser.branch_id
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

  // Verificar plan activo
  const plan = await prisma.membershipPlan.findUnique({
    where: { id: parsed.data.membership_plan_id },
  });
  if (!plan) return { errors: { membership_plan_id: ["Plan no encontrado."] } };
  if (plan.status !== "active") {
    return { errors: { membership_plan_id: ["El plan seleccionado no está activo."] } };
  }

  // Verificar cliente en el scope correcto
  const client = await prisma.client.findFirst({
    where: { id: parsed.data.client_id, gym_id: sessionUser.gym_id },
  });
  if (!client) return { errors: { client_id: ["Cliente no encontrado."] } };
  if (
    sessionUser.role !== "super_admin" &&
    client.branch_id !== sessionUser.branch_id
  ) {
    return { errors: { client_id: ["El cliente no pertenece a tu sucursal."] } };
  }

  // Calcular montos y fechas
  const final_amount = parsed.data.price_at_sale - parsed.data.discount_amount;
  if (final_amount < 0) {
    return { errors: { discount_amount: ["El monto final no puede ser negativo."] } };
  }
  const end_date = addDays(parsed.data.start_date, plan.duration_days);

  await prisma.clientMembership.create({
    data: {
      gym_id: sessionUser.gym_id,
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
      sold_by_user_id: sessionUser.id,
      notes: parsed.data.notes ?? null,
    },
  });

  revalidatePath("/dashboard/memberships/client-memberships");
  revalidatePath(`/dashboard/clients/${parsed.data.client_id}`);
  redirect("/dashboard/memberships/client-memberships");
}

export async function updateClientMembershipAction(
  _prev: MembershipActionState,
  formData: FormData
): Promise<MembershipActionState> {
  const sessionUser = await requireMembershipManager();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID de membresía requerido." };

  const existing = await prisma.clientMembership.findUnique({ where: { id } });
  if (!existing) return { error: "Membresía no encontrada." };
  if (!canManageMembership(sessionUser, existing)) {
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

  // Verificar plan
  const plan = await prisma.membershipPlan.findUnique({
    where: { id: parsed.data.membership_plan_id },
  });
  if (!plan) return { errors: { membership_plan_id: ["Plan no encontrado."] } };

  const final_amount = parsed.data.price_at_sale - parsed.data.discount_amount;
  if (final_amount < 0) {
    return { errors: { discount_amount: ["El monto final no puede ser negativo."] } };
  }
  const end_date = addDays(parsed.data.start_date, plan.duration_days);

  await prisma.clientMembership.update({
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
  redirect("/dashboard/memberships/client-memberships");
}

export async function toggleClientMembershipStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireMembershipManager();
  const id = formData.get("id") as string;
  if (!id) return;

  const membership = await prisma.clientMembership.findUnique({ where: { id } });
  if (!membership || !canManageMembership(sessionUser, membership)) return;

  const next = membership.status === "active" ? "cancelled" : "active";
  await prisma.clientMembership.update({ where: { id }, data: { status: next } });

  revalidatePath("/dashboard/memberships/client-memberships");
  revalidatePath(`/dashboard/clients/${membership.client_id}`);
}
