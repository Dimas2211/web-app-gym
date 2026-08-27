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
import { getDteProductionPreflight } from "./dte-production-preflight.service";
import type { CreateDteIssuerConfigInput, UpdateDteIssuerConfigInput } from "../schemas/dte-issuer-config.schemas";
import type { CreateDteIssuerConfigResult, DteResult, DteIssuerConfigDetail, DteEnvironment } from "../types/dte.types";

// ── Crear configuración de emisor ─────────────────────────────────

class DteIssuerConfigBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DteIssuerConfigBusinessError";
  }
}

export async function createDteIssuerConfig(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreateDteIssuerConfigInput,
): Promise<CreateDteIssuerConfigResult> {
  try {
    // F-DTE-ENV — Auditoría TEST/PROD (repair): crear una configuración
    // NUNCA debe dejar más de una fila is_active=true para el mismo
    // tenant/location. Antes, is_active se fijaba en `true`
    // incondicionalmente, así que crear PRODUCTION mientras TEST ya
    // estaba activa dejaba ambas activas — exactamente el invariante que
    // switchActiveDteEnvironment protege, pero que este flujo de creación
    // bypasseaba por completo (causa raíz confirmada en diagnóstico).
    //
    // Regla nueva: la config nueva nace activa SOLO si todavía no existe
    // ninguna config activa para ese tenant/location. Si ya hay una
    // activa (en cualquier ambiente), la nueva nace inactiva — activarla
    // requiere pasar explícitamente por switchActiveDteEnvironment (que sí
    // tiene preflight + confirmación + auditoría). Chequeo + insert +
    // verificación final ocurren dentro de una única transacción para
    // evitar condiciones de carrera.
    const configId = await prisma.$transaction(async (tx) => {
      // Verificar unicidad: solo puede existir una config por tenant+location+environment
      const existing = await tx.dteIssuerConfig.findFirst({
        where: { tenant_id, location_id, environment: input.environment },
        select: { id: true },
      });
      if (existing) {
        throw new DteIssuerConfigBusinessError(
          `Ya existe una configuración DTE para el ambiente "${input.environment}" en esta location.`,
        );
      }

      const activeCount = await tx.dteIssuerConfig.count({
        where: { tenant_id, location_id, is_active: true },
      });
      const shouldActivate = activeCount === 0;

      const config = await tx.dteIssuerConfig.create({
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
          cod_estable_mh:          input.cod_estable_mh          ?? null,
          cod_punto_venta_mh:      input.cod_punto_venta_mh      ?? null,
          dept_code:               input.dept_code               ?? null,
          municipality_code:       input.municipality_code       ?? null,
          address_complement:      input.address_complement      ?? null,
          phone:                   input.phone                   ?? null,
          email:                   input.email                   ?? null,
          is_active:               shouldActivate,
          created_by:              user_id,
          updated_by:              user_id,
        },
        select: { id: true },
      });

      // Defensa de invariante: tras crear, nunca debe haber más de una
      // config activa para este tenant/location. Si esto falla, algo
      // más rompió la invariante entre el count() de arriba y este
      // create() (p. ej. una request concurrente) — se revierte todo.
      const activeCountAfter = await tx.dteIssuerConfig.count({
        where: { tenant_id, location_id, is_active: true },
      });
      if (activeCountAfter > 1) {
        throw new Error(
          `Invariante violada al crear configuración DTE: ${activeCountAfter} configuraciones activas (se esperaba máximo 1).`,
        );
      }

      return config.id;
    });

    return { ok: true, id: configId };
  } catch (e) {
    if (e instanceof DteIssuerConfigBusinessError) {
      return { ok: false, field: "environment", error: e.message };
    }
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
      ...(input.establishment_code      !== undefined && { establishment_code:      input.establishment_code }),
      ...(input.establishment_type_code !== undefined && { establishment_type_code: input.establishment_type_code }),
      ...(input.point_of_sale_code      !== undefined && { point_of_sale_code:      input.point_of_sale_code }),
      ...(input.cod_estable_mh          !== undefined && { cod_estable_mh:          input.cod_estable_mh }),
      ...(input.cod_punto_venta_mh      !== undefined && { cod_punto_venta_mh:      input.cod_punto_venta_mh }),
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
      cod_estable_mh:          true,
      cod_punto_venta_mh:      true,
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

// ── Cambiar ambiente DTE activo (switch atómico) ───────────────────
//
// F-DTE-ENV — Auditoría TEST/PROD, sección 8. Reemplaza el patrón
// inseguro de "dos PATCH separados desde la UI" (desactivar A, activar
// B) por UNA transacción Prisma. Nunca deja 0 ni 2 configs activas.
// Si el destino es PRODUCTION, ejecuta el preflight dentro de la misma
// operación y bloquea si no es al menos READY/WARNING — defensa en
// profundidad además del guard ya existente en
// createPendingDteSimpleAction (que se niega a operar con >1 config activa).

export type SwitchDteEnvironmentResult =
  | { ok: true; environment: DteEnvironment; issuer_config_id: string }
  | { ok: false; error: string; preflight?: Awaited<ReturnType<typeof getDteProductionPreflight>> };

export async function switchActiveDteEnvironment(params: {
  tenant_id:          string;
  location_id:        string;
  target_issuer_config_id: string;
  user_id:            string;
}): Promise<SwitchDteEnvironmentResult> {
  const { tenant_id, location_id, target_issuer_config_id, user_id } = params;

  // 1. Cargar el destino y validar que pertenece a este tenant/location
  //    ANTES de tocar nada. Nunca confiar en un tenant/location enviado
  //    desde el cliente — target_issuer_config_id es el único dato que
  //    llega del formulario; tenant_id/location_id siempre vienen de la
  //    sesión server-side (ver switch-dte-environment.action.ts).
  const target = await prisma.dteIssuerConfig.findFirst({
    where:  { id: target_issuer_config_id, tenant_id, location_id },
    select: { id: true, environment: true, is_active: true },
  });
  if (!target) {
    return { ok: false, error: "La configuración DTE indicada no existe o no pertenece a esta sucursal." };
  }

  // 2. Preflight obligatorio antes de activar PRODUCTION. No se ejecuta
  //    dentro de la transacción (es read-only y puede tardar varias
  //    queries) — se valida antes de abrir la transacción de escritura.
  if (target.environment === "PRODUCTION") {
    const preflight = await getDteProductionPreflight(tenant_id, location_id);
    if (preflight.status === "BLOCKED") {
      return {
        ok:    false,
        error: "El preflight de PRODUCTION está BLOCKED. Revise los checks antes de activar.",
        preflight,
      };
    }
  }

  const previousActive = await prisma.dteIssuerConfig.findFirst({
    where:  { tenant_id, location_id, is_active: true },
    select: { id: true, environment: true },
  });

  // Ya está activa y es la única — no-op, pero igual se confirma invariante.
  if (previousActive?.id === target.id) {
    const activeCount = await prisma.dteIssuerConfig.count({ where: { tenant_id, location_id, is_active: true } });
    if (activeCount === 1) {
      return { ok: true, environment: target.environment as DteEnvironment, issuer_config_id: target.id };
    }
  }

  // 3. Transacción atómica: desactivar todas, activar solo el destino,
  //    registrar auditoría, y verificar la invariante "exactamente 1
  //    activa" antes de confirmar. Cualquier fallo revierte todo.
  await prisma.$transaction(async (tx) => {
    await tx.dteIssuerConfig.updateMany({
      where: { tenant_id, location_id, is_active: true },
      data:  { is_active: false, updated_by: user_id },
    });

    await tx.dteIssuerConfig.update({
      where: { id: target.id },
      data:  { is_active: true, updated_by: user_id },
    });

    await tx.dteEnvironmentAuditLog.create({
      data: {
        tenant_id,
        location_id,
        previous_environment: (previousActive?.environment as DteEnvironment | undefined) ?? null,
        new_environment:      target.environment,
        new_issuer_config_id: target.id,
        changed_by:            user_id,
      },
    });

    const activeCount = await tx.dteIssuerConfig.count({
      where: { tenant_id, location_id, is_active: true },
    });
    if (activeCount !== 1) {
      // Fuerza rollback de toda la transacción — nunca debe poder
      // terminar con 0 o 2+ configs activas.
      throw new Error(
        `Invariante violada: ${activeCount} configuraciones activas tras el switch (se esperaba exactamente 1).`,
      );
    }
  });

  return { ok: true, environment: target.environment as DteEnvironment, issuer_config_id: target.id };
}
