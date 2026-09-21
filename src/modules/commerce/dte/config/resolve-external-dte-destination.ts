// commerce/dte — resolve-external-dte-destination.ts
//
// FASE VI-E7 — resuelve el destino MariaDB externo de entrega DTE por
// ORGANIZACIÓN (Control Plane, `PlatformExternalIntegration` tipo
// DTE_MARIADB) en vez del destino global por variables de entorno.
//
// Contrato:
//   - organizationId resuelto siempre en servidor por el caller (nunca
//     aceptado del browser) — ver requireRuntimeDteWriteAccess.
//   - Organización con integración activa -> CONFIGURED (payload
//     descifrado con decryptJsonPayload, mismo helper AES-256-GCM que
//     PlatformDatabaseProfile.encrypted_password).
//   - Organización con integración inactiva -> DISABLED (fail closed,
//     nunca se entrega).
//   - Organización sin integración -> NOT_CONFIGURED, SALVO que
//     `allowLegacyEnvFallback` sea true (ver abajo).
//   - RUNTIME_CLIENT (sesión runtime "Operar como cliente" activa) NUNCA
//     pasa `allowLegacyEnvFallback: true` — jamás puede terminar usando
//     el destino global por variables de entorno de otra organización.
//   - PLATFORM_NATIVE (sesión normal, sin runtime) SÍ puede pasar
//     `allowLegacyEnvFallback: true`: cubre el caso de un ERP
//     autoalojado/standalone que NUNCA fue dado de alta como
//     PlatformOrganization (organizationId null) — en ese caso el
//     despliegue físico completo pertenece a un solo tenant, así que el
//     destino por variable de entorno ya es, por construcción,
//     "por organización" (no hay otro tenant en el mismo proceso que
//     pueda recibir el cruce). Si SÍ existe PlatformOrganization para el
//     tenant pero no tiene integración configurada, NUNCA se usa el
//     fallback legado — se resuelve NOT_CONFIGURED igual que
//     RUNTIME_CLIENT, evitando que una organización administrada por
//     Platform "herede" sin querer el destino legado de otro despliegue
//     que comparta el mismo proceso Node (ej. entornos de prueba).
//   - Nunca loguea ni expone el payload descifrado — solo lo retorna al
//     caller server-side inmediato (el adapter de entrega).

import { controlPlanePrisma }          from "@/modules/platform/runtime/control-plane-prisma";
import { decryptJsonPayload }          from "@/lib/security/encryption";
import { getExternalDteMariaDbConfig } from "./external-dte-mariadb.config";
import type { ExternalDteMariaDbConfig } from "../types/external-dte-delivery.types";

// ── Payload cifrado — mismo shape que ExternalDteMariaDbConfig, sin el
//    campo `enabled` (is_active de la fila ya gobierna eso). ──────────

export type ExternalDteMariaDbIntegrationPayload = Omit<ExternalDteMariaDbConfig, "enabled">;

export type ResolveExternalDteDestinationResult =
  | { status: "CONFIGURED"; source: "ORGANIZATION" | "PLATFORM_NATIVE_LEGACY_ENV"; config: ExternalDteMariaDbConfig }
  | { status: "NOT_CONFIGURED" }
  | { status: "DISABLED" };

export interface ResolveExternalDteDestinationInput {
  /** Organización efectiva ya resuelta en servidor. null = sin PlatformOrganization mapeada (standalone). */
  organizationId: string | null;
  /**
   * true SOLO para flujos PLATFORM_NATIVE sin PlatformOrganization
   * resoluble. RUNTIME_CLIENT (isRuntimeWrite=true) SIEMPRE debe pasar
   * false — ver contrato arriba.
   */
  allowLegacyEnvFallback: boolean;
}

function isLegacyConfigUsable(config: ExternalDteMariaDbConfig): boolean {
  return Boolean(
    config.enabled && config.host && config.user && config.password && config.database && config.table,
  );
}

export async function resolveExternalDteMariaDbDestination(
  input: ResolveExternalDteDestinationInput,
): Promise<ResolveExternalDteDestinationResult> {
  const { organizationId, allowLegacyEnvFallback } = input;

  if (organizationId) {
    const row = await controlPlanePrisma.platformExternalIntegration.findUnique({
      where: { organization_id_type: { organization_id: organizationId, type: "DTE_MARIADB" } },
    });

    if (row) {
      if (!row.is_active) return { status: "DISABLED" };

      const payload = decryptJsonPayload<ExternalDteMariaDbIntegrationPayload>(row.encrypted_payload);
      return {
        status: "CONFIGURED",
        source: "ORGANIZATION",
        config: { ...payload, enabled: true },
      };
    }

    // Organización SÍ resuelta pero SIN fila -> NOT_CONFIGURED siempre,
    // incluso en PLATFORM_NATIVE. El fallback legado es exclusivo del
    // caso "sin PlatformOrganization en absoluto" (ver abajo).
    return { status: "NOT_CONFIGURED" };
  }

  if (allowLegacyEnvFallback) {
    const legacy = getExternalDteMariaDbConfig();
    if (isLegacyConfigUsable(legacy)) {
      return { status: "CONFIGURED", source: "PLATFORM_NATIVE_LEGACY_ENV", config: legacy };
    }
  }

  return { status: "NOT_CONFIGURED" };
}
