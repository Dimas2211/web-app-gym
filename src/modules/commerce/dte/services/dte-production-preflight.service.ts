// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-production-preflight.service.ts
//
// Preflight read-only de PRODUCTION — completa el gap de la
// auditoría TEST/PROD (sección 9). Nunca escribe en DB, nunca
// autentica contra MH, nunca reserva correlativos ni transmite nada.
//
// Devuelve READY / WARNING / BLOCKED con el detalle de cada check,
// para que tanto la UI (mostrar estado) como el switch de ambiente
// (bloquear la activación) usen exactamente la misma fuente de verdad.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  getDteCredentialStatus,
  canDecryptDteCredential,
  resolveDteSignerConfigForIssuer,
  type DteCredentialStatus,
} from "./dte-credential.service";
import { resolveDteMhUrls } from "../config/dte-mh.config";
import { MhHttpDteSignerAdapter } from "../adapters/dte-signer.adapter";

export type PreflightCheckStatus = "ok" | "warning" | "blocked";

export interface PreflightCheck {
  code:    string;
  label:   string;
  status:  PreflightCheckStatus;
  detail?: string;
}

export type PreflightOverallStatus = "READY" | "WARNING" | "BLOCKED";

export interface DteProductionPreflightResult {
  status: PreflightOverallStatus;
  checks: PreflightCheck[];
  /** null si no existe todavía DteIssuerConfig PRODUCTION para este tenant/location. */
  issuer_config_id: string | null;
}

function normalizeNit(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function signerEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

export interface SignerHealthChecker {
  checkHealth(config: import("../config/dte-signer.config").DteSignerConfig): Promise<{ ok: boolean; message?: string }>;
}

async function appendEffectiveSignerChecks(
  checks: PreflightCheck[],
  input: {
    issuerConfigId: string;
    issuerNit:      string | null;
    tenant_id:      string;
    location_id:    string;
    credStatus:     DteCredentialStatus;
    db:             PrismaClient;
  },
  health: SignerHealthChecker = new MhHttpDteSignerAdapter(),
): Promise<void> {
  const { credStatus, db } = input;

  if (credStatus.configured) {
    checks.push({
      code:   "SIGNER_NIT",
      label:  "NIT del firmador configurado",
      status: credStatus.has_signer_nit ? "ok" : "blocked",
      detail: credStatus.has_signer_nit ? undefined : "No se guardó signerNit en las credenciales PRODUCTION del emisor.",
    });
  }

  const resolved = await resolveDteSignerConfigForIssuer({
    issuerConfigId: input.issuerConfigId,
    environment:    "PRODUCTION",
    client:         db,
  });

  if (!resolved.ok) {
    checks.push({ code: "SIGNER_EFFECTIVE", label: "Firmador efectivo del emisor PRODUCTION", status: "blocked", detail: resolved.error });
    return;
  }

  if (resolved.source !== "ISSUER_CREDENTIAL") {
    checks.push({
      code:   "SIGNER_EFFECTIVE",
      label:  "Firmador efectivo del emisor PRODUCTION",
      status: "blocked",
      detail: "El emisor no tiene firmador propio (DteCredential PRODUCTION sin signerNit/contraseña de llave). PRODUCTION nunca acepta el firmador ni los secretos globales del proceso (DTE_SIGNER_*), que pueden pertenecer a otro cliente.",
    });
    return;
  }

  let host = "(url no parseable)";
  try { host = new URL(resolved.config.signerUrl).host; } catch { /* informativo */ }
  checks.push({ code: "SIGNER_EFFECTIVE", label: "Firmador efectivo del emisor PRODUCTION", status: "ok", detail: `Origen ISSUER_CREDENTIAL · ${host}` });

  checks.push({
    code:   "SIGNER_URL_OWN",
    label:  "URL del firmador propia del emisor",
    status: credStatus.has_signer_url ? "ok" : "blocked",
    detail: credStatus.has_signer_url ? undefined : "La credencial no tiene signerUrl: se usaría DTE_SIGNER_URL_PRODUCTION global. Registre la URL del firmador dedicado.",
  });

  const isRemote = /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(resolved.config.signerUrl);
  if (isRemote) {
    checks.push({
      code:   "SIGNER_API_KEY_OWN",
      label:  "API Key propia del firmador (X-DTE-Signer-Key)",
      status: credStatus.has_signer_api_key ? "ok" : "blocked",
      detail: credStatus.has_signer_api_key
        ? `Huella ${credStatus.signer_api_key_fingerprint ?? "—"}`
        : "La credencial no tiene signerApiKey propia: se usaría DTE_SIGNER_API_KEY global (otro cliente) o el firmador responderá 403.",
    });
  }

  const blockingCollisions = (credStatus.secret_collisions ?? []).filter((c) => c.blocking);
  checks.push({
    code:   "SIGNER_SECRETS_DISTINCT",
    label:  "API Key del firmador distinta de contraseñas MH/llave",
    status: blockingCollisions.length === 0 ? "ok" : "blocked",
    detail: blockingCollisions.length === 0 ? undefined : `Campos con el mismo valor: ${blockingCollisions.map((c) => `${c.a}=${c.b}`).join(", ")}.`,
  });

  const issuerNit = normalizeNit(input.issuerNit);
  const signerNit = normalizeNit(resolved.nit);
  if (issuerNit && signerNit) {
    checks.push({
      code:   "SIGNER_NIT_MATCH",
      label:  "NIT del certificado = NIT del emisor",
      status: issuerNit === signerNit ? "ok" : "blocked",
      detail: issuerNit === signerNit ? undefined : "El NIT configurado para el firmador no coincide con el NIT del emisor PRODUCTION.",
    });
  }

  // Aislamiento TEST ↔ PRODUCTION: nunca el mismo firmador ni la misma API Key.
  const testIssuer = await db.dteIssuerConfig.findFirst({
    where:  { tenant_id: input.tenant_id, location_id: input.location_id, environment: "TEST" },
    select: { id: true },
  });
  if (testIssuer) {
    const testSigner = await resolveDteSignerConfigForIssuer({ issuerConfigId: testIssuer.id, environment: "TEST", client: db });
    if (testSigner.ok && testSigner.source === "ISSUER_CREDENTIAL") {
      const sameEndpoint = signerEndpoint(testSigner.config.signerUrl) === signerEndpoint(resolved.config.signerUrl);
      const sameKey = !!resolved.config.apiKey && resolved.config.apiKey === testSigner.config.apiKey;
      checks.push({
        code:   "SIGNER_ENV_ISOLATION",
        label:  "Firmador PRODUCTION aislado del firmador TEST",
        status: sameEndpoint || sameKey ? "blocked" : "ok",
        detail: sameEndpoint
          ? "PRODUCTION apunta al mismo firmador que TEST (certificado de pruebas)."
          : sameKey ? "PRODUCTION reutiliza la API Key del firmador TEST." : undefined,
      });
    }
  }

  const h = await health.checkHealth(resolved.config);
  checks.push({
    code:   "SIGNER_REACHABLE",
    label:  "Firmador PRODUCTION accesible (health check, no firma ni transmite)",
    status: h.ok ? "ok" : "warning",
    detail: h.ok ? undefined : (h.message ?? "No se pudo verificar conectividad con el firmador PRODUCTION del emisor."),
  });
}

function overallStatus(checks: PreflightCheck[]): PreflightOverallStatus {
  if (checks.some((c) => c.status === "blocked")) return "BLOCKED";
  if (checks.some((c) => c.status === "warning")) return "WARNING";
  return "READY";
}

export async function getDteProductionPreflight(
  tenant_id:   string,
  location_id: string,
  db: PrismaClient = prisma,
): Promise<DteProductionPreflightResult> {
  const checks: PreflightCheck[] = [];

  // ── 1. Existe DteIssuerConfig PRODUCTION ──────────────────────────
  const config = await db.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment: "PRODUCTION" },
    select: {
      id: true, nit: true, nrc: true, name: true, activity_code: true, activity_name: true,
      establishment_code: true, establishment_type_code: true, point_of_sale_code: true,
      cod_estable_mh: true, cod_punto_venta_mh: true,
      dept_code: true, municipality_code: true,
    },
  });

  if (!config) {
    checks.push({
      code:   "ISSUER_CONFIG_EXISTS",
      label:  "Configuración de emisor PRODUCTION",
      status: "blocked",
      detail: "No existe una configuración DTE (DteIssuerConfig) para el ambiente PRODUCTION en esta sucursal.",
    });
    return { status: "BLOCKED", checks, issuer_config_id: null };
  }

  checks.push({ code: "ISSUER_CONFIG_EXISTS", label: "Configuración de emisor PRODUCTION", status: "ok" });

  // ── 2. Datos fiscales obligatorios (mismos exigidos por los builders) ──
  const requiredFiscal: Array<[string, string | null]> = [
    ["nit", config.nit],
    ["name", config.name],
    ["activity_code", config.activity_code],
    ["activity_name", config.activity_name],
  ];
  const missingFiscal = requiredFiscal.filter(([, v]) => !v?.trim());
  if (missingFiscal.length > 0) {
    checks.push({
      code:   "FISCAL_DATA_REQUIRED",
      label:  "Datos fiscales obligatorios (NIT, nombre, actividad económica)",
      status: "blocked",
      detail: `Faltan: ${missingFiscal.map(([k]) => k).join(", ")}.`,
    });
  } else {
    checks.push({ code: "FISCAL_DATA_REQUIRED", label: "Datos fiscales obligatorios (NIT, nombre, actividad económica)", status: "ok" });
  }

  // NRC — no es hard-required por los builders (persona natural puede no tenerlo),
  // pero la mayoría de contribuyentes con CCFE sí lo necesitan.
  checks.push({
    code:   "NRC",
    label:  "NRC",
    status: config.nrc?.trim() ? "ok" : "warning",
    detail: config.nrc?.trim() ? undefined : "NRC no configurado — requerido para emitir CCFE 03.",
  });

  // ── 3. Establecimiento / punto de venta MH (numeroControl) ───────
  const requiredEstablishment: Array<[string, string | null]> = [
    ["establishment_code", config.establishment_code],
    ["point_of_sale_code", config.point_of_sale_code],
    ["cod_estable_mh", config.cod_estable_mh],
    ["cod_punto_venta_mh", config.cod_punto_venta_mh],
    ["establishment_type_code", config.establishment_type_code],
  ];
  const missingEstablishment = requiredEstablishment.filter(([, v]) => !v?.trim());
  if (missingEstablishment.length > 0) {
    checks.push({
      code:   "ESTABLISHMENT_CODES",
      label:  "Establecimiento / punto de venta MH",
      status: "blocked",
      detail: `Faltan: ${missingEstablishment.map(([k]) => k).join(", ")}. Son obligatorios para el numeroControl.`,
    });
  } else {
    checks.push({ code: "ESTABLISHMENT_CODES", label: "Establecimiento / punto de venta MH", status: "ok" });
  }

  // ── 4. Dirección fiscal (no bloquea — MH la acepta null en TEST) ──
  const hasAddress = !!(config.dept_code || config.municipality_code);
  checks.push({
    code:   "ADDRESS",
    label:  "Dirección fiscal (departamento/municipio)",
    status: hasAddress ? "ok" : "warning",
    detail: hasAddress ? undefined : "Sin dirección configurada — se enviará 'direccion: null' en el JSON.",
  });

  // ── 5. Credenciales MH PRODUCTION ─────────────────────────────────
  const credStatus = await getDteCredentialStatus(config.id, db);
  if (!credStatus.configured) {
    checks.push({
      code:   "CREDENTIAL_EXISTS",
      label:  "Credenciales MH (usuario/password)",
      status: "blocked",
      detail: "No hay credenciales PRODUCTION configuradas para este emisor. PRODUCTION nunca usa el fallback TEST de .env.",
    });
  } else if (!credStatus.is_active) {
    checks.push({
      code:   "CREDENTIAL_EXISTS",
      label:  "Credenciales MH (usuario/password)",
      status: "blocked",
      detail: "Las credenciales existen pero están inactivas.",
    });
  } else if (!credStatus.has_api_user || !credStatus.has_api_password) {
    checks.push({
      code:   "CREDENTIAL_EXISTS",
      label:  "Credenciales MH (usuario/password)",
      status: "blocked",
      detail: "Falta usuario o contraseña MH en las credenciales guardadas.",
    });
  } else {
    checks.push({ code: "CREDENTIAL_EXISTS", label: "Credenciales MH (usuario/password)", status: "ok" });
  }

  // ── 6. El payload cifrado puede descifrarse con la clave actual ──
  if (credStatus.configured) {
    const canDecrypt = await canDecryptDteCredential(config.id, db);
    checks.push({
      code:   "CREDENTIAL_DECRYPTABLE",
      label:  "Payload de credenciales descifrable",
      status: canDecrypt ? "ok" : "blocked",
      detail: canDecrypt ? undefined : "No se pudo descifrar el payload guardado con PLATFORM_ENCRYPTION_KEY actual.",
    });
  }

  // ── 7. Firmador EFECTIVO del emisor PRODUCTION ─────────────────
  //
  // FISCAL-ONBOARDING — antes se verificaban DTE_SIGNER_URL_TEST/PRODUCTION
  // globales del proceso, que pueden pertenecer a OTRO cliente (TrustMe).
  // Ahora se resuelve exactamente el firmador que usaría signDteDocument()
  // para este emisor (resolveDteSignerConfigForIssuer) y PRODUCTION exige
  // que URL, API Key y certificado sean propios del emisor.
  await appendEffectiveSignerChecks(checks, {
    issuerConfigId: config.id,
    issuerNit:      config.nit,
    tenant_id,
    location_id,
    credStatus,
    db,
  });

  // ── 8. Endpoints MH PRODUCTION ────────────────────────────────────
  const urls = resolveDteMhUrls("PRODUCTION");
  checks.push({
    code:   "MH_ENDPOINTS",
    label:  "Endpoints MH PRODUCTION (auth/recepción)",
    status: "ok",
    detail: `auth: ${urls.authUrl} · recepción: ${urls.receptionUrl}`,
  });

  // ── 9. Correlativos — solo verificación estructural, no reserva ──
  // No es bloqueante: si no existe fila DteCorrelative todavía, se crea
  // automáticamente en la primera reserva real (comportamiento ya
  // existente de reserveDteControlNumber). Aquí solo informamos.
  const correlatives = await db.dteCorrelative.findMany({
    where: { tenant_id, location_id, environment: "PRODUCTION" },
    select: { dte_type_code: true, last_sequence: true },
  });
  checks.push({
    code:   "CORRELATIVES_STRUCTURE",
    label:  "Correlativos PRODUCTION",
    status: "ok",
    detail: correlatives.length > 0
      ? `${correlatives.length} tipo(s) DTE con correlativo ya inicializado en PRODUCTION.`
      : "Aún no existen correlativos PRODUCTION — se inicializarán automáticamente al emitir el primer documento (comportamiento existente, no se toca aquí).",
  });

  // ── 10. Consistencia de configs activas ───────────────────────────
  const activeCount = await db.dteIssuerConfig.count({
    where: { tenant_id, location_id, is_active: true },
  });
  checks.push({
    code:   "ACTIVE_CONFIG_CONSISTENCY",
    label:  "Consistencia de configuración activa",
    status: activeCount === 1 ? "ok" : "warning",
    detail: activeCount === 1
      ? undefined
      : `Hay ${activeCount} configuraciones activas para esta sucursal (se espera exactamente 1).`,
  });

  return {
    status: overallStatus(checks),
    checks,
    issuer_config_id: config.id,
  };
}
