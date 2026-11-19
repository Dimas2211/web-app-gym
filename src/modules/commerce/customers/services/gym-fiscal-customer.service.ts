import { Prisma } from "@prisma/client";
import type { OperationalContext } from "@/modules/platform/runtime/require-operational-context";
import { createCustomerSchema, type CreateCustomerInput } from "../schemas/customer.schemas";
import { createCustomer } from "./customer.service";
import { CustomerGymError, normalizeDocument } from "./customer-gym.service";

function branchScope(context: OperationalContext) {
  if (context.readOnly || !context.gymId || !["super_admin", "branch_admin"].includes(context.effectiveUser.role)) {
    throw new CustomerGymError("Sin permisos para gestionar clientes fiscales del gimnasio.");
  }
  if (context.effectiveUser.role !== "super_admin" && !context.locationId) {
    throw new CustomerGymError("No tienes una sucursal asignada.");
  }
  return context.effectiveUser.role === "super_admin" ? null : context.locationId;
}

async function gymClient(context: OperationalContext, id: string, db: Prisma.TransactionClient = context.client) {
  const branchId = branchScope(context);
  const row = await db.client.findFirst({ where: {
    id, tenant_id: context.tenantId, gym_id: context.gymId!,
    ...(branchId ? { branch_id: branchId } : {}),
  } });
  if (!row) throw new CustomerGymError("Cliente Gym no encontrado en tu organización o sucursal.");
  return row;
}

export type FiscalCandidate = {
  id: string; customer_code: string; name: string; dui: string | null;
  nit: string | null; email: string | null; status: string; linked: boolean;
};

export async function prepareGymFiscalCustomer(context: OperationalContext, clientId: string, search = "") {
  const client = await gymClient(context, clientId);
  const link = await context.client.gymCustomerLink.findUnique({
    where: { client_id_tenant_id: { client_id: client.id, tenant_id: context.tenantId } },
    include: { customer: { select: { id: true, customer_code: true, name: true } } },
  });
  const document = normalizeDocument(client.document_id);
  const email = client.email?.trim().toLowerCase() || "";
  const name = `${client.first_name} ${client.last_name}`.trim();
  const term = search.trim() || name;
  const candidates = link ? [] : await context.client.$queryRaw<FiscalCandidate[]>`
    SELECT c.id,c.customer_code,c.name,c.dui,c.nit,c.email,c.status::text,
      EXISTS(SELECT 1 FROM gym_customer_links l WHERE l.customer_id=c.id AND l.tenant_id=c.tenant_id) AS linked
    FROM customers c WHERE c.tenant_id=${context.tenantId}
    AND (
      (${document}<>'' AND (upper(regexp_replace(coalesce(c.dui,''),'[^a-zA-Z0-9]','','g'))=${document}
        OR upper(regexp_replace(coalesce(c.nit,''),'[^a-zA-Z0-9]','','g'))=${document}))
      OR (${email}<>'' AND lower(trim(coalesce(c.email,'')))=${email})
      OR (${term}<>'' AND (strpos(lower(c.name),lower(${term}))>0
        OR strpos(lower(coalesce(c.email,'')),lower(${term}))>0
        OR strpos(lower(coalesce(c.dui,'')),lower(${term}))>0
        OR strpos(lower(coalesce(c.nit,'')),lower(${term}))>0))
    ) ORDER BY c.name,c.id LIMIT 25`;
  return {
    linkedCustomer: link?.customer ?? null, candidates,
    defaults: {
      name, email: client.email || null, phone: client.phone || null,
      address_complement: client.address || null,
    },
    document: client.document_id || "",
    inactive: client.status !== "active",
  };
}

/** Validate only this opt-in flow; the ordinary fiscal creation contract stays unchanged. */
export function validateGymFiscalInput(input: CreateCustomerInput) {
  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Revisa los datos fiscales.", errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const errors: Record<string, string[]> = {};
  if (!data.id_type_code) errors.id_type_code = ["Confirma el tipo del documento del cliente."];
  if (data.id_type_code && !(data.id_type_code === "36" ? data.nit : data.dui)?.trim()) {
    errors[data.id_type_code === "36" ? "nit" : "dui"] = ["Completa el número del documento seleccionado."];
  }
  if (data.taxpayer_type === "REGISTERED_TAXPAYER" && !data.is_foreign) {
    for (const key of ["nit", "nrc", "activity_code", "activity_name"] as const) {
      if (!data[key]?.trim()) errors[key] = ["Completa este dato para el contribuyente registrado."];
    }
  }
  if (Object.keys(errors).length) return { ok: false as const, error: "Completa los datos fiscales indicados.", errors };
  return { ok: true as const, data };
}

/** Same tenant lock and 1:1 bridge as the forward flow; no second migration. */
export async function saveGymFiscalCustomer(
  context: OperationalContext,
  clientId: string,
  choice: { customerId: string } | { input: CreateCustomerInput },
) {
  branchScope(context);
  return context.client.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.tenantId}),hashtext('gym-customer-link'))`;
    const client = await gymClient(context, clientId, tx);
    const existing = await tx.gymCustomerLink.findUnique({
      where: { client_id_tenant_id: { client_id: client.id, tenant_id: context.tenantId } },
      include: { customer: { select: { id: true, customer_code: true } } },
    });
    if (existing) return existing.customer;
    if (client.status !== "active") throw new CustomerGymError("Activa la ficha Gym antes de crear o vincular su cliente fiscal.");

    let result: { id: string; customer_code: string };
    if ("customerId" in choice) {
      const target = await tx.customer.findFirst({
        where: { id: choice.customerId, tenant_id: context.tenantId, status: "active" },
        select: { id: true, customer_code: true },
      });
      if (!target) throw new CustomerGymError("Cliente fiscal no encontrado o inactivo en tu organización.");
      const other = await tx.gymCustomerLink.findUnique({
        where: { customer_id_tenant_id: { customer_id: target.id, tenant_id: context.tenantId } },
      });
      if (other) throw new CustomerGymError("Ese cliente fiscal ya está vinculado a otra ficha Gym.");
      result = target;
    } else {
      const parsed = validateGymFiscalInput(choice.input);
      if (!parsed.ok) throw new CustomerGymError(parsed.error);
      const input = parsed.data;
      const documents = [client.document_id, input.dui, input.nit].map(normalizeDocument).filter(Boolean);
      const emails = [client.email, input.email].filter(Boolean).map(e => e!.trim().toLowerCase());
      const duplicate = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM customers WHERE tenant_id=${context.tenantId}
        AND (upper(regexp_replace(coalesce(dui,''),'[^a-zA-Z0-9]','','g')) IN (${Prisma.join(documents.length ? documents : ["__NONE__"])})
          OR upper(regexp_replace(coalesce(nit,''),'[^a-zA-Z0-9]','','g')) IN (${Prisma.join(documents.length ? documents : ["__NONE__"])})
          OR lower(trim(coalesce(email,''))) IN (${Prisma.join(emails.length ? emails : ["__NONE__"])})) LIMIT 1`;
      if (duplicate.length) throw new CustomerGymError("Ya existe un cliente fiscal con ese documento o correo. Búscalo y vincúlalo para evitar duplicados.");
      const created = await createCustomer(context.tenantId, context.effectiveUser.id, input, tx);
      if (!created.ok) throw new CustomerGymError(created.error);
      result = created;
    }
    await tx.gymCustomerLink.create({ data: {
      tenant_id: context.tenantId, client_id: client.id, customer_id: result.id, created_by: context.effectiveUser.id,
    } });
    return { id: result.id, customer_code: result.customer_code };
  });
}
