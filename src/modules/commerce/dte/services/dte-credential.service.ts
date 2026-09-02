// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-credential.service.ts
//
// Uso real de DteCredential — completa el gap detectado en la
// auditoría TEST/PROD: el modelo y el cifrado (dte-credential-
// encryption.ts) ya existían, pero ningún servicio los usaba.
//
// Reglas:
//   - Un único registro DteCredential por DteIssuerConfig, con
//     credential_type = "MH_CREDENTIALS" — guarda el DteCredentialPayload
//     completo (usuario/password MH + datos del firmador) en un solo
//     envelope cifrado, tal como ya está tipado en
//     dte-credential-encryption.ts. No se inventa un segundo esquema.
//   - Nunca devuelve encrypted_payload ni secretos a un caller que no
//     sea explícitamente server-side de autenticación/transmisión.
//   - Nunca loguea valores de usuario/password/signer.
// ─────────────────────────────────────────────────────────────────

// Server-only por transitividad: importa dte-credential-encryption.ts,
// que ya tiene su propio guard runtime (`typeof window !== "undefined"`)
// vía src/lib/security/encryption.ts. No se agrega el paquete `server-only`
// para mantener consistencia con el resto del módulo DTE.

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  encryptDteCredentialPayload,
  decryptDteCredentialPayload,
  type DteCredentialPayload,
} from "../lib/dte-credential-encryption";
import {
  resolveDteSignerConfig,
  buildDteSignerConfig,
  summarizeDteSignerConfigForLog,
  DteSignerConfigError,
  type DteSignerConfig,
} from "../config/dte-signer.config";
import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

const CREDENTIAL_TYPE = "MH_CREDENTIALS";

// ── Estado sanitizado para UI ──────────────────────────────────────
// Nunca incluye secretos — solo indica qué está configurado.

export interface DteCredentialStatus {
  configured:      boolean;
  is_active:       boolean;
  has_api_user:     boolean;
  has_api_password: boolean;
  has_signer_url:   boolean;
  has_signer_nit:   boolean;
  updated_at:       Date | null;
}

const EMPTY_STATUS: DteCredentialStatus = {
  configured:       false,
  is_active:        false,
  has_api_user:     false,
  has_api_password: false,
  has_signer_url:   false,
  has_signer_nit:   false,
  updated_at:       null,
};

// ── Consultar estado sanitizado (para UI) ──────────────────────────

export async function getDteCredentialStatus(
  issuer_config_id: string,
): Promise<DteCredentialStatus> {
  const row = await prisma.dteCredential.findFirst({
    where:  { issuer_config_id, credential_type: CREDENTIAL_TYPE },
    select: { encrypted_payload: true, is_active: true, updated_at: true },
  });

  if (!row || !row.encrypted_payload) return EMPTY_STATUS;

  let payload: DteCredentialPayload | null = null;
  try {
    payload = decryptDteCredentialPayload(row.encrypted_payload);
  } catch {
    // Payload ilegible (clave de cifrado rotada, corrupción, etc.) —
    // reportar como "configurado" pero sin poder confirmar sub-campos.
    // El preflight de PRODUCTION trata esto como BLOCKED explícito.
    return {
      configured:       true,
      is_active:        row.is_active,
      has_api_user:     false,
      has_api_password: false,
      has_signer_url:   false,
      has_signer_nit:   false,
      updated_at:       row.updated_at,
    };
  }

  return {
    configured:       true,
    is_active:        row.is_active,
    has_api_user:     !!payload.apiUser?.trim(),
    has_api_password: !!payload.apiPassword?.trim(),
    has_signer_url:   !!payload.signerUrl?.trim(),
    has_signer_nit:   !!payload.signerNit?.trim(),
    updated_at:       row.updated_at,
  };
}

// ── Verificar que el payload cifrado puede descifrarse ─────────────
// Usado por el preflight de PRODUCTION — confirma que la clave de
// cifrado actual (PLATFORM_ENCRYPTION_KEY) puede leer el payload
// guardado, sin exponer su contenido.

export async function canDecryptDteCredential(issuer_config_id: string): Promise<boolean> {
  const row = await prisma.dteCredential.findFirst({
    where:  { issuer_config_id, credential_type: CREDENTIAL_TYPE, is_active: true },
    select: { encrypted_payload: true },
  });
  if (!row?.encrypted_payload) return false;
  try {
    decryptDteCredentialPayload(row.encrypted_payload);
    return true;
  } catch {
    return false;
  }
}

// ── Crear o actualizar credenciales (server-only, desde action) ────
//
// Campos vacíos/undefined en `input` conservan el valor cifrado
// existente ("dejar en blanco = mantener actual"), igual que el
// patrón ya usado en el resto de la UI de la plataforma para no
// obligar a re-escribir un secreto que no cambió.

export interface UpsertDteCredentialInput {
  apiUser?:                  string;
  apiPassword?:              string;
  signerUrl?:                string;
  signerNit?:                string;
  signerPrivateKeyPassword?: string;
  signerApiKey?:             string;
}

export type UpsertDteCredentialResult =
  | { ok: true }
  | { ok: false; error: string };

export async function upsertDteCredential(
  issuer_config_id: string,
  user_id:          string,
  input:            UpsertDteCredentialInput,
): Promise<UpsertDteCredentialResult> {
  const issuer = await prisma.dteIssuerConfig.findUnique({
    where:  { id: issuer_config_id },
    select: { id: true },
  });
  if (!issuer) {
    return { ok: false, error: "La configuración DTE indicada no existe." };
  }

  const existing = await prisma.dteCredential.findFirst({
    where:  { issuer_config_id, credential_type: CREDENTIAL_TYPE },
    select: { id: true, encrypted_payload: true },
  });

  let current: DteCredentialPayload = {
    apiUser: "", apiPassword: "", signerUrl: "", signerNit: "", signerPrivateKeyPassword: "", signerApiKey: "",
  };
  if (existing?.encrypted_payload) {
    try {
      current = decryptDteCredentialPayload(existing.encrypted_payload);
    } catch {
      // Payload previo ilegible — se sobreescribe por completo con lo
      // que envíe el usuario ahora; no hay nada seguro que conservar.
    }
  }

  const merged: DteCredentialPayload = {
    apiUser:                  input.apiUser?.trim()                  || current.apiUser,
    apiPassword:              input.apiPassword                      || current.apiPassword,
    signerUrl:                input.signerUrl?.trim()                || current.signerUrl,
    signerNit:                input.signerNit?.trim()                || current.signerNit,
    signerPrivateKeyPassword: input.signerPrivateKeyPassword         || current.signerPrivateKeyPassword,
    signerApiKey:             input.signerApiKey?.trim()             || current.signerApiKey,
  };

  const encrypted_payload = encryptDteCredentialPayload(merged);

  if (existing) {
    await prisma.dteCredential.update({
      where: { id: existing.id },
      data:  { encrypted_payload, is_active: true, updated_by: user_id },
    });
  } else {
    await prisma.dteCredential.create({
      data: {
        issuer_config_id,
        credential_type:   CREDENTIAL_TYPE,
        encrypted_payload,
        is_active:  true,
        created_by: user_id,
        updated_by: user_id,
      },
    });
  }

  return { ok: true };
}

// ── Resolución server-only para autenticación MH ────────────────────
//
// Usada exclusivamente por MhAuthAdapter. Nunca exponer el resultado
// a un Server/Client Component — solo se consume dentro del propio
// adapter para construir el header Authorization.

export interface ResolvedMhCredentials {
  ok: true;
  user: string;
  password: string;
}
export interface UnresolvedMhCredentials {
  ok: false;
  error: string;
}

export async function resolveMhAuthCredentials(params: {
  issuerConfigId?: string;
  environment: "TEST" | "PRODUCTION";
}): Promise<ResolvedMhCredentials | UnresolvedMhCredentials> {
  const { issuerConfigId, environment } = params;

  if (issuerConfigId) {
    const row = await prisma.dteCredential.findFirst({
      where: {
        issuer_config_id: issuerConfigId,
        credential_type:  CREDENTIAL_TYPE,
        is_active:        true,
      },
      select: { encrypted_payload: true },
    });

    if (row?.encrypted_payload) {
      try {
        const payload = decryptDteCredentialPayload(row.encrypted_payload);
        if (payload.apiUser?.trim() && payload.apiPassword?.trim()) {
          return { ok: true, user: payload.apiUser.trim(), password: payload.apiPassword };
        }
      } catch {
        // Cae al fallback/bloqueo de abajo — nunca lanzar desde aquí.
      }
    }
  }

  // Sin DteCredential utilizable para este issuer_config_id.
  if (environment === "PRODUCTION") {
    return {
      ok:    false,
      error: "No hay credenciales MH configuradas para la configuración PRODUCTION de este emisor.",
    };
  }

  // TEST — fallback controlado de desarrollo/compatibilidad, documentado
  // explícitamente (F-DTE-ENV — Auditoría TEST/PROD, sección 5). Nunca se
  // aplica a PRODUCTION.
  const envUser     = process.env["DTE_MH_USER"]     ?? "";
  const envPassword = process.env["DTE_MH_PASSWORD"] ?? "";
  if (envUser.trim() && envPassword.trim()) {
    return { ok: true, user: envUser.trim(), password: envPassword };
  }

  return {
    ok:    false,
    error: "No hay credenciales MH configuradas (ni DteCredential ni fallback .env) para el ambiente TEST.",
  };
}

// ── SIGNERPROFILE-MULTITENANT — resolución del firmador por emisor ────
//
// Bloque de arquitectura: preparar el firmador para multi-cliente/multi-NIT
// sin romper TrustMe (ver docs/modules/dte-trustme-fse14-test-closure.md §8.1
// y §9.1). Decisión de diseño: NO se crea una tabla nueva DteSignerProfile.
// DteCredential ya modela exactamente esto — un registro por
// issuer_config_id (que ya encapsula tenant+location+environment vía la
// constraint única de DteIssuerConfig) con signerUrl/signerNit/
// signerPrivateKeyPassword cifrados. Este bloque solo agrega el resolver que
// faltaba para que signDteDocument() y los runners de soporte lean esos
// campos en vez de depender siempre de DTE_SIGNER_URL_TEST/PRODUCTION +
// DTE_SIGNER_NIT/PASSWORD globales.
//
// Orden de resolución:
//   1. DteCredential activa de issuer_config_id (credential_type=MH_CREDENTIALS)
//      con signerNit + signerPrivateKeyPassword utilizables. Si además trae
//      signerUrl, se usa para construir el DteSignerConfig (con
//      signerApiKey opcional); si no trae signerUrl, la URL/apiKey/timeout
//      se resuelven igual que el fallback global para ese mismo `environment`.
//   2. (Reservado, no implementado en este bloque) SignerProfile a nivel
//      tenant/organización. `tenantId` ya forma parte de la firma de esta
//      función para no tener que cambiar todos los callers cuando se
//      implemente ese nivel intermedio.
//   3. Fallback global: resolveDteSignerConfig(environment) +
//      DTE_SIGNER_NIT/DTE_SIGNER_PASSWORD — comportamiento idéntico al que
//      ya usaba signDteDocument() antes de este bloque.
//
// Nunca resuelve cruzado entre ambientes: `environment` es siempre el valor
// real del registro que se está firmando (dte.environment), nunca una
// preferencia de UI. issuer_config_id ya pertenece a un único ambiente por
// diseño (constraint @@unique([tenant_id, location_id, environment]) en
// DteIssuerConfig), así que el propio id desambigua TEST/PRODUCTION antes
// de tocar ninguna variable global.
//
// No lanza — devuelve unión discriminada. Loguea solo un resumen seguro
// (origen, host/ruta, apiKey sí/no, timeoutMs) vía
// summarizeDteSignerConfigForLog — nunca secrets, nunca signed_jws.
//
// `client` permite reutilizar este resolver contra un PrismaClient runtime
// (Runtime Database Router) en vez del Prisma Client global — mismo patrón
// que el resto de fse14-test-purchase-runner.ts.

type DteCredentialQueryClient = Pick<PrismaClient, "dteCredential">;

export interface ResolvedDteSignerConfigForIssuer {
  ok:          true;
  source:      "ISSUER_CREDENTIAL" | "GLOBAL_ENV";
  config:      DteSignerConfig;
  nit:         string;
  passwordPri: string;
}
export interface UnresolvedDteSignerConfigForIssuer {
  ok:    false;
  error: string;
}

export async function resolveDteSignerConfigForIssuer(params: {
  issuerConfigId?: string | null;
  /** Reservado para un futuro nivel de fallback tenant/organización. No usado todavía. */
  tenantId?: string;
  environment: DteMhEnvironment;
  client?: DteCredentialQueryClient;
}): Promise<ResolvedDteSignerConfigForIssuer | UnresolvedDteSignerConfigForIssuer> {
  const { issuerConfigId, environment, client } = params;
  const db = client ?? prisma;

  try {
    if (issuerConfigId) {
      const row = await db.dteCredential.findFirst({
        where:  { issuer_config_id: issuerConfigId, credential_type: CREDENTIAL_TYPE, is_active: true },
        select: { encrypted_payload: true },
      });

      if (row?.encrypted_payload) {
        try {
          const payload = decryptDteCredentialPayload(row.encrypted_payload);
          if (payload.signerNit?.trim() && payload.signerPrivateKeyPassword?.trim()) {
            const config = payload.signerUrl?.trim()
              ? buildDteSignerConfig(payload.signerUrl.trim(), payload.signerApiKey?.trim() || undefined)
              : resolveDteSignerConfig(environment);

            console.info(summarizeDteSignerConfigForLog(config, "ISSUER_CREDENTIAL"));

            return {
              ok:          true,
              source:      "ISSUER_CREDENTIAL",
              config,
              nit:         payload.signerNit.replace(/-/g, "").trim(),
              passwordPri: payload.signerPrivateKeyPassword,
            };
          }
        } catch {
          // Payload ilegible (rotación de clave, corrupción) — cae al
          // fallback global, mismo criterio que resolveMhAuthCredentials.
        }
      }
    }

    // Fallback global — mismas variables que usaba signDteDocument() antes
    // de este bloque. Nunca cruza ambientes.
    const config      = resolveDteSignerConfig(environment);
    const rawNit      = process.env["DTE_SIGNER_NIT"];
    const passwordPri = process.env["DTE_SIGNER_PASSWORD"];

    if (!rawNit?.trim() || !passwordPri?.trim()) {
      return {
        ok:    false,
        error: "Credenciales del firmador DTE no configuradas (DTE_SIGNER_NIT / DTE_SIGNER_PASSWORD).",
      };
    }

    console.info(summarizeDteSignerConfigForLog(config, "GLOBAL_ENV"));

    return {
      ok:          true,
      source:      "GLOBAL_ENV",
      config,
      nit:         rawNit.replace(/-/g, "").trim(),
      passwordPri,
    };
  } catch (err) {
    if (err instanceof DteSignerConfigError) return { ok: false, error: err.message };
    throw err;
  }
}
