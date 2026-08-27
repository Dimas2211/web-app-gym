// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-database-router.types.ts
//
// Tipos del Runtime Database Router. `RuntimeDatabaseProfile` incluye
// los campos de conexión (`_connection`) únicamente para uso interno
// del propio router — ningún caller externo debe leer ni reenviar
// ese campo (contiene encrypted_password).
// ─────────────────────────────────────────────────────────────────

import type {
  PlatformDatabaseProfileEnvironment,
  PlatformDatabaseProvider,
} from "@prisma/client";
import type { DatabaseProfileConnectionFields } from "../lib/database-profile-url";

/** Perfil de base runtime resuelto para una organización — metadata pública + conexión interna. */
export interface RuntimeDatabaseProfile {
  id:               string;
  label:            string;
  environment:      PlatformDatabaseProfileEnvironment;
  provider:         PlatformDatabaseProvider;
  organizationId:   string;
  organizationName: string;
  tenantId:         string;
  updatedAt:        Date;

  /**
   * Campos de conexión — SOLO para uso interno de runtime-database-router.ts
   * (buildDatabaseUrlFromProfile / createRuntimePrismaClient). No exponer
   * fuera de este módulo ni loguear.
   */
  _connection: DatabaseProfileConnectionFields;
}

/** Identifica el destino runtime a resolver: por organización o por perfil explícito. */
export type RuntimeTarget =
  | { organizationId: string; profileId?: undefined }
  | { profileId: string; organizationId?: undefined };
