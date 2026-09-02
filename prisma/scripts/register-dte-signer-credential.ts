/**
 * register-dte-signer-credential.ts
 *
 * SIGNERPROFILE-MULTITENANT — script one-off/genérico para registrar o
 * actualizar el DteCredential (signerUrl/signerNit/signerPrivateKeyPassword/
 * signerApiKey) de un DteIssuerConfig sobre un cliente RUNTIME (Runtime
 * Database Router), no sobre la base local/GYM.
 *
 * Continuación directa del bloque de arquitectura documentado en
 * docs/modules/dte-signer-multitenant-block.md — este script es la pieza
 * de escritura que faltaba: resolveDteSignerConfigForIssuer() ya sabe LEER
 * un DteCredential por issuer_config_id; este script es cómo se ESCRIBE
 * uno para un cliente runtime (TrustMe incluido), ya que la UI de admin
 * existente (/dashboard/settings/dte) solo opera sobre la base local.
 *
 * Reutiliza, sin reimplementar:
 *   - encryptDteCredentialPayload / decryptDteCredentialPayload
 *     (dte-credential-encryption.ts → AES-256-GCM central, mismo helper
 *     que ya usa upsertDteCredential()).
 *   - withRuntimePrisma (Runtime Database Router) — mismo patrón que
 *     fse14-test-purchase-runner.ts.
 *
 * NO reutiliza upsertDteCredential() directamente porque esa función usa
 * el Prisma Client GLOBAL (@/lib/db/prisma) — DteCredential de un cliente
 * runtime como TrustMe vive en OTRA base, solo alcanzable vía
 * withRuntimePrisma. Este script reimplementa la misma lógica de
 * merge/create/update (idéntica semántica: "campo vacío = conservar
 * valor actual") contra el client runtime.
 *
 * ESTE SCRIPT NO FIRMA NINGÚN DTE. NO TRANSMITE A HACIENDA. NO ENTREGA A
 * MARIADB. NO SE CONECTA AL FIRMADOR REMOTO (no hace checkHealth ni POST
 * de firma). NO IMPRIME secrets, signerPrivateKeyPassword, signerApiKey,
 * ni encrypted_payload completo. NO modifica .env. NO toca schema.prisma.
 * NO genera migración. NO usa db push. NO hace reset. NO corre seeds.
 *
 * ── TRUSTME-PRODUCTION-READINESS — soporte PRODUCTION ────────────────
 * --environment PRODUCTION está soportado para --step INSPECT (siempre)
 * y --step REGISTER --mode DRY_RUN (nunca escribe). --step REGISTER
 * --mode EXECUTE contra PRODUCTION exige una confirmación textual
 * DISTINTA a la de TEST — "REGISTER DTE SIGNER CREDENTIAL PRODUCTION" —
 * y esa confirmación es rechazada si se usa contra --environment TEST
 * (y viceversa: la de TEST se rechaza contra PRODUCTION). No hay
 * fallback ni normalización entre las dos frases.
 *
 * ── Pasos (--step) ──────────────────────────────────────────────────
 *   INSPECT  — solo lectura. Resuelve organización + runtime, valida el
 *              DteIssuerConfig, y reporta si ya existe DteCredential
 *              activo para ese issuer (sin descifrar secretos). Nunca
 *              requiere variables de entorno de secretos ni confirmación.
 *   REGISTER — (default) crea o actualiza el DteCredential del issuer.
 *              DRY_RUN (default): valida todo, muestra resumen seguro de
 *              lo que HARÍA (CREATE o UPDATE) y NO escribe nada.
 *              EXECUTE: exige --confirm exacto, cifra el payload y
 *              escribe (create o update) contra el client runtime.
 *
 * ── Variables de entorno (nunca se imprimen sus valores) ─────────────
 *
 * Nombres específicos de este registro (preferidos):
 *   DTE_CREDENTIAL_SIGNER_URL
 *   DTE_CREDENTIAL_SIGNER_NIT
 *   DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD
 *   DTE_CREDENTIAL_SIGNER_API_KEY                (opcional)
 *   DTE_CREDENTIAL_TIMEOUT_MS                    (opcional — ver nota abajo)
 *
 * Fallback a los nombres globales actuales, SOLO si los específicos no
 * están presentes (documentado explícitamente, para no romper el hábito
 * ya usado por health-check-dte-signer-test.ts / fse14-test-purchase-runner.ts):
 *   DTE_SIGNER_URL_TEST      (fallback de DTE_CREDENTIAL_SIGNER_URL, solo si --environment TEST)
 *   DTE_SIGNER_NIT           (fallback de DTE_CREDENTIAL_SIGNER_NIT)
 *   DTE_SIGNER_PASSWORD      (fallback de DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD)
 *   DTE_SIGNER_API_KEY       (fallback de DTE_CREDENTIAL_SIGNER_API_KEY)
 *   DTE_SIGNER_TIMEOUT_MS    (fallback informativo de DTE_CREDENTIAL_TIMEOUT_MS)
 *
 * Nota sobre timeoutMs: DteCredentialPayload NO tiene campo de timeout —
 * es una decisión de diseño ya documentada en dte-signer.config.ts
 * (buildDteSignerConfig): timeoutMs siempre viene de DTE_SIGNER_TIMEOUT_MS
 * global, no es parte del payload por-emisor en este bloque. Si
 * DTE_CREDENTIAL_TIMEOUT_MS/DTE_SIGNER_TIMEOUT_MS está presente, este
 * script solo lo muestra como referencia — NO lo persiste en
 * DteCredential. Persistir timeout por emisor queda fuera de este bloque.
 *
 * ── USO (PowerShell) ──────────────────────────────────────────────────
 *
 *   # Variables de secretos SOLO en el entorno de esta sesión (nunca en archivo):
 *   $env:DTE_CREDENTIAL_SIGNER_URL = "https://firmador-test.getzolvi.com/firmardocumento/"
 *   $env:DTE_CREDENTIAL_SIGNER_NIT = "..."
 *   $env:DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD = "..."
 *   $env:DTE_CREDENTIAL_SIGNER_API_KEY = "..."   # opcional
 *
 *   # 1. INSPECT — solo lectura, sin variables de secretos requeridas
 *   npx tsx prisma/scripts/register-dte-signer-credential.ts `
 *     --org "TRUSTME-0001" --issuer "2d47dc24-941e-4137-91f0-635baadaff5d" `
 *     --environment TEST --step INSPECT
 *
 *   # 2. REGISTER — dry-run (no escribe nada)
 *   npx tsx prisma/scripts/register-dte-signer-credential.ts `
 *     --org "TRUSTME-0001" --issuer "2d47dc24-941e-4137-91f0-635baadaff5d" `
 *     --environment TEST --step REGISTER --mode DRY_RUN
 *
 *   # 3. REGISTER — ejecución real (requiere confirmación exacta)
 *   npx tsx prisma/scripts/register-dte-signer-credential.ts `
 *     --org "TRUSTME-0001" --issuer "2d47dc24-941e-4137-91f0-635baadaff5d" `
 *     --environment TEST --step REGISTER --mode EXECUTE `
 *     --confirm "REGISTER DTE SIGNER CREDENTIAL TEST"
 *
 *   # 4. PRODUCTION — INSPECT (solo lectura, siempre permitido)
 *   npx tsx prisma/scripts/register-dte-signer-credential.ts `
 *     --org "TRUSTME-0001" --issuer "584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad" `
 *     --environment PRODUCTION --step INSPECT
 *
 *   # 5. PRODUCTION — REGISTER dry-run (no escribe nada)
 *   $env:DTE_CREDENTIAL_SIGNER_URL = "https://<host-real-produccion>/firmardocumento/"
 *   $env:DTE_CREDENTIAL_SIGNER_NIT = "..."
 *   $env:DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD = "..."
 *   npx tsx prisma/scripts/register-dte-signer-credential.ts `
 *     --org "TRUSTME-0001" --issuer "584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad" `
 *     --environment PRODUCTION --step REGISTER --mode DRY_RUN
 *
 *   # 6. PRODUCTION — EXECUTE — NO EJECUTAR SIN APROBACIÓN EXPLÍCITA.
 *   # Confirmación distinta a la de TEST, no intercambiable:
 *   npx tsx prisma/scripts/register-dte-signer-credential.ts `
 *     --org "TRUSTME-0001" --issuer "584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad" `
 *     --environment PRODUCTION --step REGISTER --mode EXECUTE `
 *     --confirm "REGISTER DTE SIGNER CREDENTIAL PRODUCTION"
 *
 * --actor <userId> es opcional — igual que fse14-test-purchase-runner.ts,
 * atribuye created_by/updated_by a un User real del tenant runtime. Si se
 * omite, quedan NULL (permitido por schema).
 *
 * Este script NO fue ejecutado. Preparado y validado (tsc/eslint), en
 * espera de aprobación explícita para correr --mode EXECUTE.
 */

import "dotenv/config";
import type { PrismaClient } from "@prisma/client";

import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import {
  withRuntimePrisma,
  RuntimeDatabaseRouterError,
} from "../../src/modules/platform/runtime/runtime-database-router";
import {
  encryptDteCredentialPayload,
  decryptDteCredentialPayload,
  type DteCredentialPayload,
} from "../../src/modules/commerce/dte/lib/dte-credential-encryption";

// Debe coincidir exactamente con CREDENTIAL_TYPE en dte-credential.service.ts.
// No se importa directamente porque esa constante no está exportada — se
// documenta aquí la dependencia implícita en vez de exportarla solo para
// este script (mantiene dte-credential.service.ts sin cambios).
const CREDENTIAL_TYPE = "MH_CREDENTIALS";

// ─────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────

type Step = "INSPECT" | "REGISTER";
type Mode = "DRY_RUN" | "EXECUTE";

const CONFIRMATION_TEXT: Record<"TEST" | "PRODUCTION", string> = {
  TEST:       "REGISTER DTE SIGNER CREDENTIAL TEST",
  PRODUCTION: "REGISTER DTE SIGNER CREDENTIAL PRODUCTION",
};

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const ORG_QUERY    = argValue("--org") ?? "TrustMe";
const ISSUER_ID    = argValue("--issuer");
const ENVIRONMENT  = (argValue("--environment") ?? "TEST").toUpperCase();
const STEP         = (argValue("--step") ?? "REGISTER").toUpperCase() as Step;
const MODE         = (argValue("--mode") ?? "DRY_RUN").toUpperCase() as Mode;
const CONFIRM      = argValue("--confirm");
const ACTOR_ID     = argValue("--actor"); // opcional — created_by/updated_by

const VALID_STEPS: Step[] = ["INSPECT", "REGISTER"];

class RunnerInputError extends Error {}

// ── Helpers de presentación segura — nunca exponen el valor real ────

function presence(name: string): "presente" | "AUSENTE" {
  const v = process.env[name];
  return v && v.trim() ? "presente" : "AUSENTE";
}

function safeHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`; // sin querystring, sin credenciales
  } catch {
    return "(URL no parseable)";
  }
}

// Enmascara el NIT dejando visibles solo los últimos 4 dígitos.
function maskNit(nit: string): string {
  const digits = nit.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

// ── Resolución de las variables de entorno de secretos ───────────────
// Nunca se imprime el valor devuelto — solo se usa para cifrar o para
// derivar los resúmenes seguros de arriba (host, nit enmascarado, etc.).

interface ResolvedSignerEnv {
  signerUrl?:                string;
  signerNit?:                string;
  signerPrivateKeyPassword?: string;
  signerApiKey?:             string;
  timeoutMsRaw?:             string; // solo informativo — no se persiste
  urlSource:                "DTE_CREDENTIAL_SIGNER_URL" | "DTE_SIGNER_URL_TEST" | "DTE_SIGNER_URL_PRODUCTION" | "ninguna";
  nitSource:                "DTE_CREDENTIAL_SIGNER_NIT" | "DTE_SIGNER_NIT" | "ninguna";
  passwordSource:           "DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD" | "DTE_SIGNER_PASSWORD" | "ninguna";
  apiKeySource:             "DTE_CREDENTIAL_SIGNER_API_KEY" | "DTE_SIGNER_API_KEY" | "ninguna";
}

function resolveSignerEnv(environment: string): ResolvedSignerEnv {
  const legacyUrlVar = environment === "PRODUCTION" ? "DTE_SIGNER_URL_PRODUCTION" : "DTE_SIGNER_URL_TEST";

  const specificUrl      = process.env["DTE_CREDENTIAL_SIGNER_URL"]?.trim();
  const legacyUrl        = process.env[legacyUrlVar]?.trim();
  const specificNit      = process.env["DTE_CREDENTIAL_SIGNER_NIT"]?.trim();
  const legacyNit        = process.env["DTE_SIGNER_NIT"]?.trim();
  const specificPassword = process.env["DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD"];
  const legacyPassword   = process.env["DTE_SIGNER_PASSWORD"];
  const specificApiKey   = process.env["DTE_CREDENTIAL_SIGNER_API_KEY"]?.trim();
  const legacyApiKey     = process.env["DTE_SIGNER_API_KEY"]?.trim();
  const timeoutMsRaw     = process.env["DTE_CREDENTIAL_TIMEOUT_MS"]?.trim() || process.env["DTE_SIGNER_TIMEOUT_MS"]?.trim();

  return {
    signerUrl:                specificUrl || legacyUrl || undefined,
    signerNit:                specificNit || legacyNit || undefined,
    signerPrivateKeyPassword: (specificPassword?.trim() ? specificPassword : undefined) ?? (legacyPassword?.trim() ? legacyPassword : undefined),
    signerApiKey:             specificApiKey || legacyApiKey || undefined,
    timeoutMsRaw,
    urlSource:      specificUrl ? "DTE_CREDENTIAL_SIGNER_URL" : legacyUrl ? (legacyUrlVar as "DTE_SIGNER_URL_TEST" | "DTE_SIGNER_URL_PRODUCTION") : "ninguna",
    nitSource:      specificNit ? "DTE_CREDENTIAL_SIGNER_NIT" : legacyNit ? "DTE_SIGNER_NIT" : "ninguna",
    passwordSource: specificPassword?.trim() ? "DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD" : legacyPassword?.trim() ? "DTE_SIGNER_PASSWORD" : "ninguna",
    apiKeySource:   specificApiKey ? "DTE_CREDENTIAL_SIGNER_API_KEY" : legacyApiKey ? "DTE_SIGNER_API_KEY" : "ninguna",
  };
}

// Valida --actor contra User de la MISMA base runtime, del mismo tenant.
// Mismo criterio que fse14-test-purchase-runner.ts (resolveActorId).
async function resolveActorId(client: PrismaClient, tenantId: string): Promise<string | null> {
  if (!ACTOR_ID) return null;
  const user = await client.user.findFirst({
    where:  { id: ACTOR_ID, tenant_id: tenantId },
    select: { id: true },
  });
  if (!user) {
    throw new RunnerInputError(
      `--actor "${ACTOR_ID}" no existe como User en el tenant runtime, o pertenece a otro tenant.`,
    );
  }
  return user.id;
}

// ─────────────────────────────────────────────────────────────────
// Resolución + validación común a INSPECT y REGISTER
// ─────────────────────────────────────────────────────────────────

interface ResolvedIssuer {
  id:          string;
  tenant_id:   string;
  location_id: string;
  environment: string;
  nit:         string;
  name:        string;
  is_active:   boolean;
}

async function resolveIssuer(client: PrismaClient, tenantId: string): Promise<ResolvedIssuer> {
  if (!ISSUER_ID) throw new RunnerInputError("--issuer es requerido.");

  const issuer = await client.dteIssuerConfig.findFirst({
    where:  { id: ISSUER_ID, tenant_id: tenantId },
    select: {
      id: true, tenant_id: true, location_id: true, environment: true,
      nit: true, name: true, is_active: true,
    },
  });
  if (!issuer) {
    throw new RunnerInputError(
      "El DteIssuerConfig indicado no existe, o no pertenece al tenant runtime resuelto.",
    );
  }
  if (issuer.environment !== ENVIRONMENT) {
    throw new RunnerInputError(
      `El DteIssuerConfig es ambiente "${issuer.environment}", pero se pidió --environment "${ENVIRONMENT}". Rechazado — nunca se cruzan ambientes.`,
    );
  }
  return issuer;
}

async function findExistingCredential(client: PrismaClient, issuerConfigId: string) {
  return client.dteCredential.findFirst({
    where:  { issuer_config_id: issuerConfigId, credential_type: CREDENTIAL_TYPE },
    select: { id: true, is_active: true, updated_at: true, encrypted_payload: true },
  });
}

// ─────────────────────────────────────────────────────────────────
// INSPECT — solo lectura, nunca descifra para imprimir secretos
// ─────────────────────────────────────────────────────────────────

async function stepInspect(client: PrismaClient, tenantId: string) {
  console.log("\n[INSPECT] Solo lectura. No se escribe nada. No se descifra ningún secreto para imprimirlo.\n");

  const issuer = await resolveIssuer(client, tenantId);
  console.log(`[INSPECT] DteIssuerConfig: id=${issuer.id} name="${issuer.name}" environment=${issuer.environment}`);
  console.log(`[INSPECT] tenant_id=${issuer.tenant_id} location_id=${issuer.location_id} is_active=${issuer.is_active}`);
  console.log(`[INSPECT] nit del emisor (DteIssuerConfig.nit): ${maskNit(issuer.nit)}`);

  const existing = await findExistingCredential(client, issuer.id);
  if (!existing) {
    console.log("\n[INSPECT] No existe DteCredential para este issuer_config_id. Un --step REGISTER haría CREATE.");
    return;
  }

  console.log(
    `\n[INSPECT] DteCredential existente: id=${existing.id} is_active=${existing.is_active} ` +
    `updated_at=${existing.updated_at.toISOString()}`,
  );

  // Solo para reportar QUÉ campos están configurados — nunca imprime valores.
  if (existing.encrypted_payload) {
    try {
      const payload = decryptDteCredentialPayload(existing.encrypted_payload);
      console.log("[INSPECT] Campos configurados actualmente (sin valores):");
      console.log(`  has_api_user=${!!payload.apiUser?.trim()} has_api_password=${!!payload.apiPassword?.trim()}`);
      console.log(`  has_signer_url=${!!payload.signerUrl?.trim()} has_signer_nit=${!!payload.signerNit?.trim()}`);
      console.log(`  has_signer_private_key_password=${!!payload.signerPrivateKeyPassword?.trim()}`);
      console.log(`  has_signer_api_key=${!!payload.signerApiKey?.trim()}`);
      if (payload.signerUrl?.trim()) console.log(`  signerUrl host/ruta: ${safeHost(payload.signerUrl.trim())}`);
      if (payload.signerNit?.trim()) console.log(`  signerNit: ${maskNit(payload.signerNit.trim())}`);
    } catch {
      console.log("[INSPECT] encrypted_payload existe pero no se pudo descifrar (clave de cifrado rotada o payload corrupto).");
    }
  }

  console.log("\n[INSPECT] Un --step REGISTER haría UPDATE sobre este registro.");
}

// ─────────────────────────────────────────────────────────────────
// REGISTER — create o update, con confirmación en EXECUTE
// ─────────────────────────────────────────────────────────────────

async function stepRegister(client: PrismaClient, tenantId: string, mode: Mode) {
  const issuer = await resolveIssuer(client, tenantId);

  const env = resolveSignerEnv(ENVIRONMENT);

  console.log(`\n[REGISTER] DteIssuerConfig: id=${issuer.id} name="${issuer.name}" environment=${issuer.environment}`);
  console.log(`[REGISTER] tenant_id=${issuer.tenant_id} location_id=${issuer.location_id}`);

  console.log("\n[REGISTER] Presencia de variables de entorno (sin imprimir valores):");
  console.log(`  signerUrl                : ${presence("DTE_CREDENTIAL_SIGNER_URL")} (específica) / ${presence(ENVIRONMENT === "PRODUCTION" ? "DTE_SIGNER_URL_PRODUCTION" : "DTE_SIGNER_URL_TEST")} (fallback) → fuente resuelta: ${env.urlSource}`);
  console.log(`  signerNit                : ${presence("DTE_CREDENTIAL_SIGNER_NIT")} (específica) / ${presence("DTE_SIGNER_NIT")} (fallback) → fuente resuelta: ${env.nitSource}`);
  console.log(`  signerPrivateKeyPassword : ${presence("DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD")} (específica) / ${presence("DTE_SIGNER_PASSWORD")} (fallback) → fuente resuelta: ${env.passwordSource}`);
  console.log(`  signerApiKey (opcional)  : ${presence("DTE_CREDENTIAL_SIGNER_API_KEY")} (específica) / ${presence("DTE_SIGNER_API_KEY")} (fallback) → fuente resuelta: ${env.apiKeySource}`);
  if (env.timeoutMsRaw) {
    console.log(`  timeoutMs informado      : presente (${env.timeoutMsRaw}ms) — NO se persiste en DteCredential (ver nota de diseño en el header de este script).`);
  }

  if (!env.signerUrl || !env.signerNit || !env.signerPrivateKeyPassword) {
    throw new RunnerInputError(
      "Faltan variables requeridas: se necesita signerUrl + signerNit + signerPrivateKeyPassword " +
      "(específicas DTE_CREDENTIAL_SIGNER_* o fallback DTE_SIGNER_*). signerApiKey es opcional.",
    );
  }

  const existing = await findExistingCredential(client, issuer.id);
  const willCreate = !existing;

  console.log(`\n[REGISTER] Resumen seguro de lo que se ${mode === "EXECUTE" ? "hará" : "haría"}:`);
  console.log(`  operación: ${willCreate ? "CREATE" : "UPDATE"} (issuer_config_id=${issuer.id})`);
  console.log(`  signerUrl host/ruta (sin credenciales): ${safeHost(env.signerUrl)}`);
  console.log(`  signerNit: ${maskNit(env.signerNit)}`);
  console.log(`  signerPrivateKeyPassword: presente (no se imprime)`);
  console.log(`  signerApiKey: ${env.signerApiKey ? "presente (no se imprime)" : "NO configurada — el resolver caerá al DTE_SIGNER_API_KEY global si existe"}`);

  // --actor ANTES de escribir nada — created_by/updated_by son FK a User.
  const actorId = await resolveActorId(client, tenantId);
  console.log(`  actor (created_by/updated_by): ${actorId ?? "NULL (sin --actor)"}`);

  if (mode === "DRY_RUN") {
    console.log("\n[DRY_RUN] Precondiciones OK. NO se escribió nada.");
    return;
  }

  // La frase de confirmación es específica por ambiente y no es
  // intercambiable: TEST nunca desbloquea PRODUCTION ni viceversa.
  const expectedConfirm = CONFIRMATION_TEXT[ENVIRONMENT as "TEST" | "PRODUCTION"];
  if (CONFIRM !== expectedConfirm) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${expectedConfirm}"`);
  }

  // Preservar apiUser/apiPassword (credenciales MH) si ya existían — este
  // script solo administra los campos del firmador, no las credenciales MH.
  // Mismo criterio de "conservar lo no enviado" que upsertDteCredential().
  let carriedOver: Pick<DteCredentialPayload, "apiUser" | "apiPassword"> = { apiUser: "", apiPassword: "" };
  if (existing?.encrypted_payload) {
    try {
      const current = decryptDteCredentialPayload(existing.encrypted_payload);
      carriedOver = { apiUser: current.apiUser, apiPassword: current.apiPassword };
    } catch {
      // Payload previo ilegible — no hay nada seguro que conservar de él.
    }
  }

  const payload: DteCredentialPayload = {
    apiUser:                  carriedOver.apiUser,
    apiPassword:              carriedOver.apiPassword,
    signerUrl:                env.signerUrl,
    signerNit:                env.signerNit,
    signerPrivateKeyPassword: env.signerPrivateKeyPassword,
    signerApiKey:             env.signerApiKey,
  };

  const encrypted_payload = encryptDteCredentialPayload(payload);

  if (existing) {
    await client.dteCredential.update({
      where: { id: existing.id },
      data:  { encrypted_payload, is_active: true, updated_by: actorId },
    });
  } else {
    await client.dteCredential.create({
      data: {
        issuer_config_id: issuer.id,
        credential_type:  CREDENTIAL_TYPE,
        encrypted_payload,
        is_active:  true,
        created_by: actorId,
        updated_by: actorId,
      },
    });
  }

  console.log(`\n✅ [EXECUTE] DteCredential ${willCreate ? "creado" : "actualizado"} para issuer_config_id=${issuer.id}.`);
  console.log("   No se imprimió ningún secreto. No se firmó ningún DTE. No se transmitió a Hacienda. No se tocó MariaDB externa.");
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SIGNERPROFILE-MULTITENANT — register-dte-signer-credential      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nstep=${STEP} mode=${MODE} org="${ORG_QUERY}" environment=${ENVIRONMENT}`);

  if (!VALID_STEPS.includes(STEP)) {
    throw new RunnerInputError(`--step inválido: "${STEP}". Valores válidos: ${VALID_STEPS.join(", ")}.`);
  }
  if (MODE !== "DRY_RUN" && MODE !== "EXECUTE") {
    throw new RunnerInputError(`--mode inválido: "${MODE}". Valores válidos: DRY_RUN, EXECUTE.`);
  }
  if (ENVIRONMENT !== "TEST" && ENVIRONMENT !== "PRODUCTION") {
    throw new RunnerInputError(
      `--environment "${ENVIRONMENT}" inválido. Valores válidos: TEST, PRODUCTION.`,
    );
  }
  // TRUSTME-PRODUCTION-READINESS — PRODUCTION está soportado, pero solo
  // hasta REGISTER/DRY_RUN. REGISTER/EXECUTE contra PRODUCTION exige su
  // propia confirmación textual (ver CONFIRMATION_TEXT.PRODUCTION,
  // validada más abajo en stepRegister) — este bloque es una advertencia
  // adicional en consola, no reemplaza esa validación.
  if (ENVIRONMENT === "PRODUCTION" && STEP === "REGISTER" && MODE === "EXECUTE") {
    console.log(
      "\n⚠️  --environment PRODUCTION --step REGISTER --mode EXECUTE: esto escribe un DteCredential " +
      "PRODUCTION real. No firma ni transmite nada, pero deja el credential activo para uso futuro. " +
      "Continúa solo si tienes aprobación explícita para este registro.",
    );
  }

  const organization = await controlPlanePrisma.platformOrganization.findFirst({
    where:  { OR: [{ name: { contains: ORG_QUERY, mode: "insensitive" } }, { code: { contains: ORG_QUERY, mode: "insensitive" } }] },
    select: { id: true, name: true, tenant_id: true },
  });
  if (!organization) throw new RunnerInputError(`Organización no encontrada: "${ORG_QUERY}"`);
  if (!organization.tenant_id) throw new RunnerInputError("La organización no tiene tenant_id — Tenant Binding pendiente.");

  let logStatus: "SUCCESS" | "FAILED" = "SUCCESS";
  let logNotes  = `step=${STEP} mode=${MODE} environment=${ENVIRONMENT}`;

  try {
    await withRuntimePrisma({ organizationId: organization.id }, async (client) => {
      if (STEP === "INSPECT") return stepInspect(client, organization.tenant_id!);
      return stepRegister(client, organization.tenant_id!, MODE);
    });
  } catch (err) {
    logStatus = "FAILED";
    logNotes  = `step=${STEP} mode=${MODE} environment=${ENVIRONMENT} error=${err instanceof Error ? err.message : String(err)}`;
    throw err;
  } finally {
    // Log de control plane — solo para REGISTER en EXECUTE. INSPECT y
    // cualquier DRY_RUN nunca generan log (no escriben nada).
    if (STEP === "REGISTER" && MODE === "EXECUTE") {
      try {
        await controlPlanePrisma.platformDeploymentLog.create({
          data: {
            organization_id: organization.id,
            action:   "SUPPORT_REGISTER_DTE_SIGNER_CREDENTIAL",
            status:   logStatus,
            notes:    logNotes,
            // metadata sin secretos — solo identificadores y flags booleanos.
            metadata: {
              issuerId:    ISSUER_ID ?? null,
              environment: ENVIRONMENT,
              actorId:     ACTOR_ID ?? null,
            },
          },
        });
      } catch {
        // el log nunca debe bloquear ni enmascarar el resultado real
      }
    }
  }

  console.log("\n✅ Fin. No se firmó ningún DTE. No se transmitió a Hacienda. No se entregó a MariaDB. No se tocó PRODUCTION. No se tocó el firmador remoto.");
}

main()
  .catch((err) => {
    if (err instanceof RunnerInputError) {
      console.error(`\n✗ ${err.message}`);
    } else if (err instanceof RuntimeDatabaseRouterError) {
      console.error(`\n✗ [${err.code}] ${err.message}`);
    } else {
      console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlPlanePrisma.$disconnect();
  });
