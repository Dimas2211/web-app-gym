// ─────────────────────────────────────────────────────────────────
// commerce/customers — get-customer-by-id.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { CustomerDetail } from "../types/customer.types";

export async function getCustomerById(
  id:        string,
  tenant_id: string,
  client: PrismaClient = prisma,
): Promise<CustomerDetail | null> {
  const row = await client.customer.findFirst({
    where: { id, tenant_id },
    select: {
      id:                 true,
      tenant_id:          true,
      customer_code:      true,
      name:               true,
      legal_name:         true,
      taxpayer_type:      true,
      id_type_code:       true,
      nit:                true,
      nrc:                true,
      dui:                true,
      activity_code:      true,
      activity_name:      true,
      dept_code:          true,
      municipality_code:  true,
      address_complement: true,
      phone:              true,
      email:              true,
      status:             true,
      created_at:         true,
      updated_at:         true,
      created_by:         true,
      updated_by:         true,
      created_by_user: { select: { first_name: true, last_name: true } },
      updated_by_user: { select: { first_name: true, last_name: true } },
    },
  });

  if (!row) return null;

  return {
    id:                 row.id,
    tenant_id:          row.tenant_id,
    customer_code:      row.customer_code,
    name:               row.name,
    legal_name:         row.legal_name,
    taxpayer_type:      row.taxpayer_type as CustomerDetail["taxpayer_type"],
    id_type_code:       row.id_type_code,
    nit:                row.nit,
    nrc:                row.nrc,
    dui:                row.dui,
    activity_code:      row.activity_code,
    activity_name:      row.activity_name,
    dept_code:          row.dept_code,
    municipality_code:  row.municipality_code,
    address_complement: row.address_complement,
    phone:              row.phone,
    email:              row.email,
    status:             row.status as CustomerDetail["status"],
    created_at:         row.created_at,
    updated_at:         row.updated_at,
    created_by:         row.created_by,
    created_by_name: row.created_by_user
      ? `${row.created_by_user.first_name} ${row.created_by_user.last_name}`
      : null,
    updated_by:         row.updated_by,
    updated_by_name: row.updated_by_user
      ? `${row.updated_by_user.first_name} ${row.updated_by_user.last_name}`
      : null,
  };
}
