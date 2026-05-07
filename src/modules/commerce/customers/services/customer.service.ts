// ─────────────────────────────────────────────────────────────────
// commerce/customers — customer.service.ts
//
// Operaciones:
//   createCustomer              — alta de cliente en maestro de tenant
//   updateCustomer              — edición de datos de cliente
//   validateCustomerForDteType  — validación de datos fiscales según tipo DTE
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreateCustomerInput, UpdateCustomerInput } from "../schemas/customer.schemas";
import type { CustomerDteValidationResult } from "../types/customer.types";

export type CustomerResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export type CreateCustomerResult =
  | { ok: true; id: string; customer_code: string }
  | { ok: false; error: string; field?: string };

// ── Helper: generar customer_code autoincrementado por tenant ─────

async function getNextCustomerCode(tenant_id: string): Promise<string> {
  const result = await prisma.$queryRaw<[{ max_num: number | null }]>`
    SELECT MAX(
      CASE
        WHEN "customer_code" ~ '^[0-9]+$'
        THEN CAST("customer_code" AS INTEGER)
        ELSE NULL
      END
    ) AS max_num
    FROM "customers"
    WHERE "tenant_id" = ${tenant_id}
  `;
  const next = (Number(result[0]?.max_num) || 0) + 1;
  return String(next).padStart(6, "0");
}

// ── Crear cliente ─────────────────────────────────────────────────

export async function createCustomer(
  tenant_id: string,
  user_id:   string,
  input:     CreateCustomerInput,
): Promise<CreateCustomerResult> {
  const customer_code = input.customer_code?.trim()
    ? input.customer_code.trim()
    : await getNextCustomerCode(tenant_id);

  // Verificar unicidad del código en este tenant
  const existing = await prisma.customer.findFirst({
    where: { tenant_id, customer_code },
    select: { id: true },
  });
  if (existing) {
    return {
      ok:    false,
      field: "customer_code",
      error: `Ya existe un cliente con el código "${customer_code}" en este tenant.`,
    };
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        tenant_id,
        customer_code,
        name:               input.name,
        legal_name:         input.legal_name         ?? null,
        taxpayer_type:      input.taxpayer_type,
        id_type_code:       input.id_type_code       ?? null,
        nit:                input.nit                ?? null,
        nrc:                input.nrc                ?? null,
        dui:                input.dui                ?? null,
        activity_code:      input.activity_code      ?? null,
        activity_name:      input.activity_name      ?? null,
        dept_code:          input.dept_code          ?? null,
        municipality_code:  input.municipality_code  ?? null,
        address_complement: input.address_complement ?? null,
        phone:              input.phone              ?? null,
        email:              input.email              ?? null,
        status:             "active",
        created_by:         user_id,
        updated_by:         user_id,
      },
      select: { id: true, customer_code: true },
    });
    return { ok: true, id: customer.id, customer_code: customer.customer_code };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "customer_code",
        error: "Ya existe un cliente con ese código. El sistema intentó un código nuevo — reintenta.",
      };
    }
    throw e;
  }
}

// ── Actualizar cliente ────────────────────────────────────────────

export async function updateCustomer(
  id:        string,
  tenant_id: string,
  user_id:   string,
  input:     UpdateCustomerInput,
): Promise<CustomerResult> {
  const customer = await prisma.customer.findFirst({
    where:  { id, tenant_id },
    select: { id: true },
  });
  if (!customer) {
    return { ok: false, error: "El cliente no existe o no pertenece a este tenant." };
  }

  await prisma.customer.update({
    where: { id },
    data: {
      ...(input.name               !== undefined && { name:               input.name }),
      ...(input.legal_name         !== undefined && { legal_name:         input.legal_name }),
      ...(input.taxpayer_type      !== undefined && { taxpayer_type:      input.taxpayer_type }),
      ...(input.id_type_code       !== undefined && { id_type_code:       input.id_type_code }),
      ...(input.nit                !== undefined && { nit:                input.nit }),
      ...(input.nrc                !== undefined && { nrc:                input.nrc }),
      ...(input.dui                !== undefined && { dui:                input.dui }),
      ...(input.activity_code      !== undefined && { activity_code:      input.activity_code }),
      ...(input.activity_name      !== undefined && { activity_name:      input.activity_name }),
      ...(input.dept_code          !== undefined && { dept_code:          input.dept_code }),
      ...(input.municipality_code  !== undefined && { municipality_code:  input.municipality_code }),
      ...(input.address_complement !== undefined && { address_complement: input.address_complement }),
      ...(input.phone              !== undefined && { phone:              input.phone }),
      ...(input.email              !== undefined && { email:              input.email }),
      ...(input.status             !== undefined && { status:             input.status }),
      updated_by: user_id,
    },
  });

  return { ok: true };
}

// ── Validar cliente para tipo DTE ─────────────────────────────────
//
// "01" FE (Factura Electrónica):
//   - customer puede ser null (consumidor final sin identificar)
//   - si se provee customer, cualquier tipo es válido
//
// "03" CCFE (Comprobante de Crédito Fiscal):
//   - customer es obligatorio
//   - debe tener taxpayer_type = REGISTERED_TAXPAYER
//   - debe tener nit, nrc y activity_code

export async function validateCustomerForDteType(
  dte_type_code: string,
  customer_id:   string | null,
  tenant_id:     string,
): Promise<CustomerDteValidationResult> {
  // Tipos fuera del MVP
  if (dte_type_code !== "01" && dte_type_code !== "03") {
    return {
      ok:    false,
      error: `Tipo DTE "${dte_type_code}" está fuera del MVP. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  // FE "01" — cliente opcional
  if (dte_type_code === "01") {
    return { ok: true };
  }

  // CCFE "03" — cliente obligatorio con datos fiscales completos
  if (!customer_id) {
    return {
      ok:    false,
      field: "customer_id",
      error: "El CCFE (tipo 03) requiere un cliente con NIT, NRC y actividad económica.",
    };
  }

  const customer = await prisma.customer.findFirst({
    where:  { id: customer_id, tenant_id, status: "active" },
    select: { taxpayer_type: true, nit: true, nrc: true, activity_code: true },
  });

  if (!customer) {
    return {
      ok:    false,
      field: "customer_id",
      error: "El cliente no existe o está inactivo en este tenant.",
    };
  }

  if (customer.taxpayer_type !== "REGISTERED_TAXPAYER") {
    return {
      ok:    false,
      field: "customer_id",
      error: "El CCFE (tipo 03) solo puede emitirse a clientes de tipo REGISTERED_TAXPAYER.",
    };
  }

  if (!customer.nit?.trim()) {
    return {
      ok:    false,
      field: "customer_id",
      error: "El cliente no tiene NIT registrado. Es obligatorio para emitir CCFE.",
    };
  }

  if (!customer.nrc?.trim()) {
    return {
      ok:    false,
      field: "customer_id",
      error: "El cliente no tiene NRC registrado. Es obligatorio para emitir CCFE.",
    };
  }

  if (!customer.activity_code?.trim()) {
    return {
      ok:    false,
      field: "customer_id",
      error: "El cliente no tiene actividad económica registrada. Es obligatoria para emitir CCFE.",
    };
  }

  return { ok: true };
}
