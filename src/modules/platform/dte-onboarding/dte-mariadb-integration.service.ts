// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — dte-mariadb-integration.service.ts
//
// FISCAL-ONBOARDING — administración de la integración DTE_MARIADB por
// organización desde el flujo de onboarding fiscal. NO reimplementa la
// entrega: reutiliza PlatformExternalIntegration (mismo payload cifrado
// que ya consume resolve-external-dte-destination.ts) y el adapter
// external-dte-mariadb.adapter.ts para la prueba sin INSERT.
//
// Reglas:
//   - Opcional: una organización sin integración queda NOT_CONFIGURED y
//     puede emitir DTE igual.
//   - Contraseña: en blanco = conservar; nunca se devuelve al browser.
//   - Un destino (host+puerto+base+tabla) no puede pertenecer a dos
//     organizaciones: se rechaza DESTINATION_IN_USE.
//   - auto_delivery_enabled exige integración activa y última prueba SUCCESS.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import { encryptJsonPayload, decryptJsonPayload } from "@/lib/security/encryption";
import { ExternalDteMariaDbAdapter } from "@/modules/commerce/dte/adapters/external-dte-mariadb.adapter";
import type { ExternalDteMariaDbIntegrationPayload } from "@/modules/commerce/dte/config/resolve-external-dte-destination";
import type { ExternalDteConnectivityResult, ExternalDteMariaDbConfig } from "@/modules/commerce/dte/types/external-dte-delivery.types";

const TYPE = "DTE_MARIADB" as const;
const SQL_IDENTIFIER = /^[a-zA-Z0-9_]{1,64}$/;

export const dteMariaDbIntegrationInputSchema = z.object({
  label:             z.string().trim().min(1).max(120).optional(),
  host:              z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9.\-]+$/, "Host inválido (solo nombre DNS o IP)."),
  port:              z.coerce.number().int().min(1).max(65535).default(3306),
  database:          z.string().trim().regex(SQL_IDENTIFIER, "Base inválida: solo letras, números y _."),
  table:             z.string().trim().regex(SQL_IDENTIFIER, "Tabla DTE inválida: solo letras, números y _."),
  invalidationTable: z.string().trim().regex(SQL_IDENTIFIER, "Tabla de invalidaciones inválida.").or(z.literal("")).optional(),
  user:              z.string().trim().min(1).max(80),
  /** En blanco = conservar la contraseña guardada. */
  password:          z.string().max(200).optional(),
  timeoutMs:         z.coerce.number().int().min(1000).max(60_000).default(10_000),
});
export type DteMariaDbIntegrationInput = z.infer<typeof dteMariaDbIntegrationInputSchema>;

export interface DteMariaDbIntegrationSummary {
  configured:            boolean;
  integration_id:        string | null;
  label:                 string | null;
  is_active:             boolean;
  auto_delivery_enabled: boolean;
  host:                  string | null;
  port:                  number | null;
  database:              string | null;
  table:                 string | null;
  invalidation_table:    string | null;
  user:                  string | null;
  has_password:          boolean;
  payload_readable:      boolean;
  last_tested_at:        Date | null;
  last_test_status:      "UNTESTED" | "SUCCESS" | "FAILED";
  last_test_message:     string | null;
}

type Db = Pick<PrismaClient, "platformExternalIntegration">;

export interface DteMariaDbIntegrationDeps {
  db?:      Db;
  adapter?: { testConnectivity(config: ExternalDteMariaDbConfig, tableName?: string): Promise<ExternalDteConnectivityResult> };
}

function readPayload(encrypted: string): ExternalDteMariaDbIntegrationPayload | null {
  try {
    return decryptJsonPayload<ExternalDteMariaDbIntegrationPayload>(encrypted);
  } catch {
    return null;
  }
}

function destinationKey(p: { host: string; port: number; database: string; table: string }): string {
  return `${p.host.trim().toLowerCase()}:${p.port}/${p.database.toLowerCase()}/${p.table.toLowerCase()}`;
}

export async function getDteMariaDbIntegrationSummary(
  organizationId: string,
  deps: DteMariaDbIntegrationDeps = {},
): Promise<DteMariaDbIntegrationSummary> {
  const db = deps.db ?? controlPlanePrisma;
  const row = await db.platformExternalIntegration.findUnique({
    where: { organization_id_type: { organization_id: organizationId, type: TYPE } },
  });
  if (!row) {
    return {
      configured: false, integration_id: null, label: null, is_active: false, auto_delivery_enabled: false,
      host: null, port: null, database: null, table: null, invalidation_table: null, user: null,
      has_password: false, payload_readable: false, last_tested_at: null, last_test_status: "UNTESTED", last_test_message: null,
    };
  }
  const p = readPayload(row.encrypted_payload);
  return {
    configured:            true,
    integration_id:        row.id,
    label:                 row.label,
    is_active:             row.is_active,
    auto_delivery_enabled: row.auto_delivery_enabled,
    host:                  p?.host ?? null,
    port:                  p?.port ?? null,
    database:              p?.database ?? null,
    table:                 p?.table ?? null,
    invalidation_table:    p?.invalidationTable || null,
    user:                  p?.user ?? null,
    has_password:          !!p?.password,
    payload_readable:      p !== null,
    last_tested_at:        row.last_tested_at,
    last_test_status:      row.last_test_status,
    last_test_message:     row.last_test_message,
  };
}

export type UpsertDteMariaDbIntegrationResult =
  | { ok: true; integrationId: string; created: boolean }
  | { ok: false; error: string; code: "VALIDATION" | "PASSWORD_REQUIRED" | "DESTINATION_IN_USE" | "PAYLOAD_UNREADABLE"; fieldErrors?: Record<string, string[]> };

export async function upsertDteMariaDbIntegration(
  organizationId: string,
  rawInput: unknown,
  userId: string,
  deps: DteMariaDbIntegrationDeps = {},
): Promise<UpsertDteMariaDbIntegrationResult> {
  const db = deps.db ?? controlPlanePrisma;
  const parsed = dteMariaDbIntegrationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Datos MariaDB inválidos.", code: "VALIDATION", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const existing = await db.platformExternalIntegration.findUnique({
    where: { organization_id_type: { organization_id: organizationId, type: TYPE } },
  });
  const current = existing ? readPayload(existing.encrypted_payload) : null;
  if (existing && !current && !input.password) {
    return { ok: false, error: "El payload guardado no se puede descifrar; reingrese la contraseña para reemplazarlo.", code: "PAYLOAD_UNREADABLE" };
  }

  const password = input.password || current?.password || "";
  if (!password) {
    return { ok: false, error: "La contraseña MariaDB es obligatoria en el alta.", code: "PASSWORD_REQUIRED" };
  }

  const payload: ExternalDteMariaDbIntegrationPayload = {
    host:              input.host,
    port:              input.port,
    user:              input.user,
    password,
    database:          input.database,
    table:             input.table,
    invalidationTable: input.invalidationTable ?? "",
    timeoutMs:         input.timeoutMs,
  };

  // Aislamiento: ningún otro tenant puede compartir tabla destino.
  const others = await db.platformExternalIntegration.findMany({
    where:  { type: TYPE, NOT: { organization_id: organizationId } },
    select: { organization_id: true, encrypted_payload: true },
  });
  const myKeys = new Set([destinationKey(payload)]);
  if (payload.invalidationTable) myKeys.add(destinationKey({ ...payload, table: payload.invalidationTable }));
  for (const other of others) {
    const op = readPayload(other.encrypted_payload);
    if (!op) continue;
    const otherKeys = [destinationKey(op)];
    if (op.invalidationTable) otherKeys.push(destinationKey({ ...op, table: op.invalidationTable }));
    if (otherKeys.some((k) => myKeys.has(k))) {
      return {
        ok: false,
        code: "DESTINATION_IN_USE",
        error: "Ese destino (host/puerto/base/tabla) ya pertenece a otra organización. Cada organización debe tener su propia tabla.",
      };
    }
  }

  const connectionChanged =
    !current ||
    destinationKey(current) !== destinationKey(payload) ||
    current.user !== payload.user ||
    current.password !== payload.password ||
    (current.invalidationTable ?? "") !== payload.invalidationTable;

  const encrypted_payload = encryptJsonPayload(payload);
  const label = input.label ?? existing?.label ?? "MariaDB DTE";

  if (existing) {
    await db.platformExternalIntegration.update({
      where: { id: existing.id },
      data: {
        label,
        encrypted_payload,
        updated_by: userId,
        // Cambio de destino/credencial: la certificación anterior ya no vale.
        // Se desactiva la integración (bloquea entrega manual Y automática en
        // el resolver del servidor) hasta una nueva prueba SUCCESS y una
        // rehabilitación explícita (setDteMariaDbIntegrationFlags lo exige).
        // El ledger y los logs históricos no se tocan.
        ...(connectionChanged
          ? {
              is_active: false,
              last_test_status: "UNTESTED", last_tested_at: null, auto_delivery_enabled: false, auto_delivery_enabled_at: null,
              last_test_message: existing.is_active ? "Destino modificado: integración desactivada hasta nueva prueba SUCCESS y rehabilitación." : null,
            }
          : {}),
      },
    });
    return { ok: true, integrationId: existing.id, created: false };
  }

  // Alta nueva: queda INACTIVA hasta probar conectividad y habilitar explícitamente.
  const created = await db.platformExternalIntegration.create({
    data: {
      organization_id: organizationId,
      type:            TYPE,
      label,
      is_active:       false,
      auto_delivery_enabled: false,
      encrypted_payload,
      created_by:      userId,
      updated_by:      userId,
    },
  });
  return { ok: true, integrationId: created.id, created: true };
}

export async function testDteMariaDbIntegration(
  organizationId: string,
  deps: DteMariaDbIntegrationDeps = {},
): Promise<{ ok: boolean; message: string; level: ExternalDteConnectivityResult["level"] }> {
  const db = deps.db ?? controlPlanePrisma;
  const row = await db.platformExternalIntegration.findUnique({
    where: { organization_id_type: { organization_id: organizationId, type: TYPE } },
  });
  if (!row) return { ok: false, level: "FAILED", message: "La organización no tiene integración MariaDB (NOT_CONFIGURED)." };

  const p = readPayload(row.encrypted_payload);
  if (!p) return { ok: false, level: "FAILED", message: "No se pudo descifrar la configuración guardada." };

  const adapter = deps.adapter ?? new ExternalDteMariaDbAdapter();
  const config: ExternalDteMariaDbConfig = { ...p, enabled: true };

  const dte = await adapter.testConnectivity(config, p.table);
  let inv: ExternalDteConnectivityResult | null = null;
  if (dte.ok && p.invalidationTable) inv = await adapter.testConnectivity(config, p.invalidationTable);

  // SUCCESS solo si la tabla DTE validó el plan de INSERT (y la de invalidaciones, si existe).
  const success = dte.level === "INSERT_PLAN_OK" && (!inv || inv.level === "INSERT_PLAN_OK");
  const message = [dte.message, inv ? `Invalidaciones: ${inv.message}` : null].filter(Boolean).join(" · ");

  // Escritura condicional: si el destino se modificó mientras corría la
  // prueba, el resultado corresponde a la configuración anterior y no
  // certifica la nueva (queda UNTESTED).
  const written = await db.platformExternalIntegration.updateMany({
    where: { id: row.id, encrypted_payload: row.encrypted_payload },
    data: {
      last_tested_at:    new Date(),
      last_test_status:  success ? "SUCCESS" : "FAILED",
      last_test_message: message.slice(0, 1000),
      ...(success ? {} : { auto_delivery_enabled: false, auto_delivery_enabled_at: null }),
    },
  });

  if (written.count !== 1) {
    return { ok: false, level: "FAILED", message: "La configuración cambió durante la prueba; vuelva a probar." };
  }

  return { ok: success, message, level: success ? "INSERT_PLAN_OK" : dte.level };
}

export type SetDteMariaDbFlagsResult = { ok: true } | { ok: false; error: string };

export async function setDteMariaDbIntegrationFlags(
  organizationId: string,
  flags: { is_active?: boolean; auto_delivery_enabled?: boolean },
  userId: string,
  deps: DteMariaDbIntegrationDeps = {},
): Promise<SetDteMariaDbFlagsResult> {
  const db = deps.db ?? controlPlanePrisma;
  const row = await db.platformExternalIntegration.findUnique({
    where: { organization_id_type: { organization_id: organizationId, type: TYPE } },
  });
  if (!row) return { ok: false, error: "La organización no tiene integración MariaDB." };

  const nextActive = flags.is_active ?? row.is_active;
  let nextAuto     = flags.auto_delivery_enabled ?? row.auto_delivery_enabled;
  // Deshabilitar la entrega apaga también la automática (no se rechaza).
  if (!nextActive && flags.auto_delivery_enabled === undefined) nextAuto = false;

  if (flags.is_active === true && row.last_test_status !== "SUCCESS") {
    return { ok: false, error: "Pruebe la conectividad (SUCCESS) antes de habilitar la entrega externa." };
  }
  if (nextAuto && (!nextActive || row.last_test_status !== "SUCCESS")) {
    return { ok: false, error: "La entrega automática requiere integración activa y última prueba SUCCESS." };
  }
  if (!nextActive) nextAuto = false;

  // auto_delivery_enabled_at acota el descubrimiento automático a DTE
  // aceptados DESPUÉS de habilitar: nunca se re-entregan históricos.
  const enabledAtChange =
    nextAuto && !row.auto_delivery_enabled ? { auto_delivery_enabled_at: new Date() }
    : !nextAuto ? { auto_delivery_enabled_at: null }
    : {};

  await db.platformExternalIntegration.update({
    where: { id: row.id },
    data:  { is_active: nextActive, auto_delivery_enabled: nextAuto, ...enabledAtChange, updated_by: userId },
  });
  return { ok: true };
}
