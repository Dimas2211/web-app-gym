// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-issuer-config.service.ts
//
// Operaciones:
//   createDteIssuerConfig      — crea configuración fiscal del emisor
//   updateDteIssuerConfig      — actualiza configuración existente
//   getActiveIssuerConfigOrThrow — obtiene configuración activa o lanza error
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreateDteIssuerConfigInput, UpdateDteIssuerConfigInput } from "../schemas/dte-issuer-config.schemas";
import type { CreateDteIssuerConfigResult, DteResult, DteIssuerConfigDetail, DteEnvironment } from "../types/dte.types";

// ── Crear configuración de emisor ─────────────────────────────────

export async function createDteIssuerConfig(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreateDteIssuerConfigInput,
): Promise<CreateDteIssuerConfigResult> {
  // Verificar unicidad: solo puede existir una config por tenant+location+environment
  const existing = await prisma.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment: input.environment },
    select: { id: true },
  });
  if (existing) {
    return {
      ok:    false,
      field: "environment",
      error: `Ya existe una configuración DTE para el ambiente "${input.environment}" en esta location.`,
    };
  }

  try {
    const config = await prisma.dteIssuerConfig.create({
      data: {
        tenant_id,
        location_id,
        environment:             input.environment,
        nit:                     input.nit,
        nrc:                     input.nrc                     ?? null,
        name:                    input.name,
        legal_name:              input.legal_name              ?? null,
        activity_code:           input.activity_code           ?? null,
        activity_name:           input.activity_name           ?? null,
        establishment_code:      input.establishment_code      ?? null,
        establishment_type_code: input.establishment_type_code ?? null,
        point_of_sale_code:      input.point_of_sale_code      ?? null,
        dept_code:               input.dept_code               ?? null,
        municipality_code:       input.municipality_code       ?? null,
        address_complement:      input.address_complement      ?? null,
        phone:                   input.phone                   ?? null,
        email:                   input.email                   ?? null,
        is_active:               true,
        created_by:              user_id,
        updated_by:              user_id,
      },
      select: { id: true },
    });
    return { ok: true, id: config.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "environment",
        error: "Ya existe una configuración DTE para ese ambiente en esta location.",
      };
    }
    throw e;
  }
}

// ── Actualizar configuración de emisor ────────────────────────────

export async function updateDteIssuerConfig(
  id:          string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdateDteIssuerConfigInput,
): Promise<DteResult> {
  const config = await prisma.dteIssuerConfig.findFirst({
    where:  { id, tenant_id, location_id },
    select: { id: true },
  });
  if (!config) {
    return {
      ok:    false,
      error: "La configuración DTE no existe o no pertenece a esta location.",
    };
  }

  await prisma.dteIssuerConfig.update({
    where: { id },
    data: {
      ...(input.nit                    !== undefined && { nit:                     input.nit }),
      ...(input.nrc                    !== undefined && { nrc:                     input.nrc }),
      ...(input.name                   !== undefined && { name:                    input.name }),
      ...(input.legal_name             !== undefined && { legal_name:              input.legal_name }),
      ...(input.activity_code          !== undefined && { activity_code:           input.activity_code }),
      ...(input.activity_name          !== undefined && { activity_name:           input.activity_name }),
      ...(input.establishment_code     !== undefined && { establishment_code:      input.establishment_code }),
      ...(input.establishment_type_code !== undefined && { establishment_type_code: input.establishment_type_code }),
      ...(input.point_of_sale_code     !== undefined && { point_of_sale_code:      input.point_of_sale_code }),
      ...(input.dept_code              !== undefined && { dept_code:               input.dept_code }),
      ...(input.municipality_code      !== undefined && { municipality_code:       input.municipality_code }),
      ...(input.address_complement     !== undefined && { address_complement:      input.address_complement }),
      ...(input.phone                  !== undefined && { phone:                   input.phone }),
      ...(input.email                  !== undefined && { email:                   input.email }),
      ...(input.is_active              !== undefined && { is_active:               input.is_active }),
      updated_by: user_id,
    },
  });

  return { ok: true };
}

// ── Obtener configuración activa o lanzar error ───────────────────
//
// Usar antes de cualquier operación DTE que requiera datos del emisor.

export async function getActiveIssuerConfigOrThrow(
  tenant_id:   string,
  location_id: string,
  environment: DteEnvironment,
): Promise<DteIssuerConfigDetail> {
  const config = await prisma.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment, is_active: true },
    select: {
      id:                      true,
      tenant_id:               true,
      location_id:             true,
      environment:             true,
      nit:                     true,
      nrc:                     true,
      name:                    true,
      legal_name:              true,
      activity_code:           true,
      activity_name:           true,
      establishment_code:      true,
      establishment_type_code: true,
      point_of_sale_code:      true,
      dept_code:               true,
      municipality_code:       true,
      address_complement:      true,
      phone:                   true,
      email:                   true,
      is_active:               true,
      created_at:              true,
      updated_at:              true,
      created_by:              true,
      updated_by:              true,
    },
  });

  if (!config) {
    throw new Error(
      `No existe configuración DTE activa para el ambiente "${environment}" en esta location. Configura el emisor antes de continuar.`,
    );
  }

  return {
    ...config,
    environment: config.environment as DteEnvironment,
  };
}
