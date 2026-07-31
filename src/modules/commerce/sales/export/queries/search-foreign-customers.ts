// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — search-foreign-customers.ts
//
// F3-C21 — Búsqueda de clientes extranjeros (is_foreign=true) para el
// selector de receptor en el módulo comercial FEX 11.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface ForeignCustomerLookup {
  id:                   string;
  customer_code:        string;
  name:                 string;
  legal_name:           string | null;
  id_type_code:         string | null;
  nit:                  string | null;
  dui:                  string | null;
  country_code:         string | null;
  country_name:         string | null;
  customer_person_type: string | null;
  address_complement:   string | null;
  activity_name:        string | null;
  email:                string | null;
  phone:                string | null;
}

export async function searchForeignCustomers(
  tenant_id: string,
  search:    string,
  limit      = 20,
): Promise<ForeignCustomerLookup[]> {
  const trimmed = search.trim();

  const rows = await prisma.customer.findMany({
    where: {
      tenant_id,
      status:     "active",
      is_foreign: true,
      ...(trimmed.length > 0 && {
        OR: [
          { name:          { contains: trimmed, mode: "insensitive" } },
          { customer_code: { contains: trimmed, mode: "insensitive" } },
          { nit:           { contains: trimmed, mode: "insensitive" } },
          { dui:           { contains: trimmed, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { name: "asc" },
    take:    limit,
    select: {
      id: true, customer_code: true, name: true, legal_name: true,
      id_type_code: true, nit: true, dui: true,
      country_code: true, country_name: true, customer_person_type: true,
      address_complement: true, activity_name: true, email: true, phone: true,
    },
  });

  return rows;
}
