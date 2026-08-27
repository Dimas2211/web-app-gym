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

import { prisma } from "@/lib/db/prisma";
import {
  encryptDteCredentialPayload,
  decryptDteCredentialPayload,
  type DteCredentialPayload,
} from "../lib/dte-credential-encryption";

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
    apiUser: "", apiPassword: "", signerUrl: "", signerNit: "", signerPrivateKeyPassword: "",
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
