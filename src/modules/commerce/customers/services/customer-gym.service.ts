import { Prisma } from "@prisma/client";
import type { OperationalContext } from "@/modules/platform/runtime/require-operational-context";
import { generateQrToken, getClientCodeSettings } from "@/lib/utils/operational-codes";
import { createClientSchema } from "@/modules/clients/schemas";

export type GymCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  document_id: string | null;
  email: string | null;
  linked: boolean;
};
export class CustomerGymError extends Error {}
export const normalizeDocument = (value: string | null | undefined) =>
  (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Suggestion only: Spanish names may have several given names and surnames. */
export function suggestGymName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const surnameCount = parts.length >= 3 ? 2 : 1;
  const cut = Math.max(1, parts.length - surnameCount);
  return { first_name: parts.slice(0, cut).join(" "), last_name: parts.slice(cut).join(" ") };
}

function scope(context: OperationalContext) {
  if (
    !context.gymId ||
    context.readOnly ||
    !["super_admin", "branch_admin"].includes(context.effectiveUser.role)
  ) {
    throw new CustomerGymError("Sin permisos para gestionar clientes de gimnasio.");
  }
  if (context.effectiveUser.role !== "super_admin" && !context.locationId) {
    throw new CustomerGymError("No tienes una sucursal asignada.");
  }
  return context.effectiveUser.role === "super_admin" ? null : context.locationId;
}

async function customer(context: OperationalContext, id: string) {
  const row = await context.client.customer.findFirst({
    where: { id, tenant_id: context.tenantId },
  });
  if (!row) throw new CustomerGymError("Cliente fiscal no encontrado.");
  return row;
}

/** Candidates are suggestions only; linking always requires an explicit choice. */
export async function gymCandidates(
  context: OperationalContext,
  identity: { document?: string | null; email?: string | null; name?: string | null },
  search = ""
): Promise<GymCandidate[]> {
  const branchId = scope(context);
  const document = normalizeDocument(identity.document);
  const email = identity.email?.trim().toLowerCase() ?? "";
  const term = search.trim() || identity.name?.trim() || "";
  return context.client.$queryRaw<GymCandidate[]>`
    SELECT c.id, c.first_name, c.last_name, c.document_id, c.email,
      EXISTS(SELECT 1 FROM gym_customer_links l WHERE l.client_id=c.id AND l.tenant_id=c.tenant_id) AS linked
    FROM clients c
    WHERE c.tenant_id=${context.tenantId} AND c.gym_id=${context.gymId}
      AND (${branchId}::text IS NULL OR c.branch_id=${branchId})
      AND (
        (${document} <> '' AND upper(regexp_replace(coalesce(c.document_id,''), '[^a-zA-Z0-9]', '', 'g'))=${document})
        OR (${email} <> '' AND lower(trim(coalesce(c.email,'')))=${email})
        OR (${term} <> '' AND (strpos(lower(c.first_name || ' ' || c.last_name),lower(${term}))>0
          OR strpos(lower(coalesce(c.email,'')),lower(${term}))>0
          OR strpos(lower(coalesce(c.document_id,'')),lower(${term}))>0))
      ) ORDER BY c.first_name, c.last_name, c.id LIMIT 25`;
}

export async function prepareCustomerGym(
  context: OperationalContext,
  customerId: string,
  search = ""
) {
  const branchId = scope(context);
  const row = await customer(context, customerId);
  const link = await context.client.gymCustomerLink.findUnique({
    where: { customer_id_tenant_id: { customer_id: customerId, tenant_id: context.tenantId } },
    include: { client: { select: { id: true, branch_id: true } } },
  });
  if (link && branchId && link.client.branch_id !== branchId) {
    throw new CustomerGymError(
      "Este cliente ya está vinculado a otra sucursal. Consulta con el administrador."
    );
  }
  const [branches, candidates] = await Promise.all([
    context.client.branch.findMany({
      where: {
        tenant_id: context.tenantId,
        gym_id: context.gymId!,
        status: "active",
        ...(branchId ? { id: branchId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    gymCandidates(
      context,
      { document: row.dui || row.nit, email: row.email, name: row.name },
      search
    ),
  ]);
  return {
    linkedClientId: link?.client_id ?? null,
    branches,
    candidates,
    defaults: {
      name: row.name,
      ...suggestGymName(row.name),
      document_id: row.dui || row.nit || "",
      email: row.email || "",
      phone: row.phone || "",
      address: row.address_complement || "",
    },
    inactive: row.status !== "active",
  };
}

export type CustomerGymInput = {
  customer_id: string;
  existing_client_id?: string;
  first_name?: string;
  last_name?: string;
  branch_id?: string;
  document_id?: string;
  email?: string;
  phone?: string;
  address?: string;
};

/** Atomic create/link, serialized per tenant; unique bridge keys also prevent double clicks. */
export async function saveCustomerGym(context: OperationalContext, input: CustomerGymInput) {
  const branchScope = scope(context);
  const row = await customer(context, input.customer_id);
  if (row.status !== "active")
    throw new CustomerGymError("Activa el cliente fiscal antes de vincularlo al gimnasio.");
  const settings = await getClientCodeSettings(context.tenantId, context.client);
  return context.client.$transaction(async (tx) => {
    // Same lock for all bridge creations in the tenant (codes + duplicate identities).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.tenantId}), hashtext('gym-customer-link'))`;
    const linked = await tx.gymCustomerLink.findUnique({
      where: { customer_id_tenant_id: { customer_id: row.id, tenant_id: context.tenantId } },
      include: { client: { select: { branch_id: true } } },
    });
    if (linked) {
      if (branchScope && linked.client.branch_id !== branchScope)
        throw new CustomerGymError("El cliente ya está vinculado en otra sucursal.");
      return linked.client_id;
    }
    let clientId: string;
    if (input.existing_client_id) {
      const target = await tx.client.findFirst({
        where: {
          id: input.existing_client_id,
          tenant_id: context.tenantId,
          gym_id: context.gymId!,
          ...(branchScope ? { branch_id: branchScope } : {}),
        },
      });
      if (!target) throw new CustomerGymError("Cliente Gym no encontrado en tu sucursal.");
      const other = await tx.gymCustomerLink.findUnique({
        where: { client_id_tenant_id: { client_id: target.id, tenant_id: context.tenantId } },
      });
      if (other)
        throw new CustomerGymError("El cliente Gym ya está vinculado a otro cliente fiscal.");
      clientId = target.id;
    } else {
      const parsed = createClientSchema.safeParse({
        first_name: input.first_name?.trim(),
        last_name: input.last_name?.trim(),
        branch_id: input.branch_id,
        document_id: input.document_id?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
      });
      if (!parsed.success) throw new CustomerGymError(parsed.error.issues[0].message);
      const data = parsed.data;
      if (branchScope && data.branch_id !== branchScope)
        throw new CustomerGymError("Solo puedes registrar clientes en tu sucursal.");
      const branch = await tx.branch.findFirst({
        where: {
          id: data.branch_id,
          tenant_id: context.tenantId,
          gym_id: context.gymId!,
          status: "active",
        },
      });
      if (!branch) throw new CustomerGymError("Sucursal no válida para este gimnasio.");
      // Use submitted AND original fiscal identity so clearing fields cannot bypass duplicate checks.
      const identities = [
        normalizeDocument(data.document_id),
        normalizeDocument(row.dui),
        normalizeDocument(row.nit),
      ].filter(Boolean);
      const emails = [data.email, row.email].filter(Boolean).map((e) => e!.trim().toLowerCase());
      const duplicates = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM clients WHERE tenant_id=${context.tenantId} AND gym_id=${context.gymId}
        AND (upper(regexp_replace(coalesce(document_id,''), '[^a-zA-Z0-9]', '', 'g')) IN (${Prisma.join(identities.length ? identities : ["__NONE__"])})
          OR lower(trim(coalesce(email,''))) IN (${Prisma.join(emails.length ? emails : ["__NONE__"])})) LIMIT 1`;
      if (duplicates.length)
        throw new CustomerGymError(
          "Ya existe un cliente Gym con ese documento o correo. Búscalo y vincúlalo; si pertenece a otra sucursal, consulta con el administrador."
        );
      const codes = await tx.client.findMany({
        where: {
          gym_id: context.gymId!,
          tenant_id: context.tenantId,
          operational_code: { startsWith: settings.prefix },
        },
        select: { operational_code: true },
      });
      let max = settings.start - 1;
      for (const c of codes) {
        const n = Number(c.operational_code?.slice(settings.prefix.length));
        if (Number.isInteger(n) && n > max) max = n;
      }
      const created = await tx.client.create({
        data: {
          ...data,
          gym_id: context.gymId!,
          tenant_id: context.tenantId,
          location_id: data.branch_id,
          operational_code: `${settings.prefix}${String(max + 1).padStart(settings.digits, "0")}`,
          qr_token: generateQrToken(),
          status: "active",
        },
      });
      clientId = created.id;
    }
    await tx.gymCustomerLink.create({
      data: {
        tenant_id: context.tenantId,
        customer_id: row.id,
        client_id: clientId,
        created_by: context.effectiveUser.id,
      },
    });
    return clientId;
  });
}
