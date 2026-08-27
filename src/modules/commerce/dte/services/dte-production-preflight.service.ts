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

import { prisma } from "@/lib/db/prisma";
import { getDteCredentialStatus, canDecryptDteCredential } from "./dte-credential.service";
import { resolveDteMhUrls } from "../config/dte-mh.config";
import { resolveDteSignerConfig, DteSignerConfigError } from "../config/dte-signer.config";
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

function overallStatus(checks: PreflightCheck[]): PreflightOverallStatus {
  if (checks.some((c) => c.status === "blocked")) return "BLOCKED";
  if (checks.some((c) => c.status === "warning")) return "WARNING";
  return "READY";
}

export async function getDteProductionPreflight(
  tenant_id:   string,
  location_id: string,
): Promise<DteProductionPreflightResult> {
  const checks: PreflightCheck[] = [];

  // ── 1. Existe DteIssuerConfig PRODUCTION ──────────────────────────
  const config = await prisma.dteIssuerConfig.findFirst({
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
  const credStatus = await getDteCredentialStatus(config.id);
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
    const canDecrypt = await canDecryptDteCredential(config.id);
    checks.push({
      code:   "CREDENTIAL_DECRYPTABLE",
      label:  "Payload de credenciales descifrable",
      status: canDecrypt ? "ok" : "blocked",
      detail: canDecrypt ? undefined : "No se pudo descifrar el payload guardado con PLATFORM_ENCRYPTION_KEY actual.",
    });
  }

  // ── 7. Firmador ────────────────────────────────────────────────
  if (credStatus.configured) {
    checks.push({
      code:   "SIGNER_NIT",
      label:  "NIT del firmador configurado",
      status: credStatus.has_signer_nit ? "ok" : "warning",
      detail: credStatus.has_signer_nit ? undefined : "No se guardó signerNit en las credenciales — requerido al firmar.",
    });
    if (!credStatus.has_signer_url) {
      checks.push({
        code:   "SIGNER_URL",
        label:  "URL del firmador (legacy, informativo)",
        status: "warning",
        detail: "No se guardó signerUrl en las credenciales. Esto ya no se usa para resolver el firmador — signDteDocument() resuelve por DTE_SIGNER_URL_TEST/DTE_SIGNER_URL_PRODUCTION según dte.environment.",
      });
    }
  }

  // FSE14-DUAL-SIGNER — checks independientes por ambiente. PRODUCTION
  // bloquea el preflight si falta (es el ambiente que este preflight
  // certifica); TEST se reporta como infraestructura disponible, sin
  // bloquear, porque puede no ser el ambiente activo.
  const signerAdapter = new MhHttpDteSignerAdapter();

  for (const env of ["PRODUCTION", "TEST"] as const) {
    const configuredCode = env === "PRODUCTION" ? "DTE_SIGNER_PRODUCTION_CONFIGURED" : "DTE_SIGNER_TEST_CONFIGURED";
    const reachableCode  = env === "PRODUCTION" ? "DTE_SIGNER_PRODUCTION_REACHABLE"  : "DTE_SIGNER_TEST_REACHABLE";
    const blockingStatus: PreflightCheckStatus = env === "PRODUCTION" ? "blocked" : "warning";

    let signerCfg;
    try {
      signerCfg = resolveDteSignerConfig(env);
    } catch (err) {
      const message = err instanceof DteSignerConfigError ? err.message : "Firmador no configurado.";
      checks.push({ code: configuredCode, label: `Firmador ${env} configurado`, status: blockingStatus, detail: message });
      continue;
    }

    checks.push({ code: configuredCode, label: `Firmador ${env} configurado`, status: "ok" });

    // VPS-SIGNER-APIKEY — el firmador remoto detrás de Apache/cPanel exige
    // X-DTE-Signer-Key; sin ella responde 403. No bloquea si el firmador es
    // localhost (dev sin protección).
    const isRemoteSigner = /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(signerCfg.signerUrl);
    if (isRemoteSigner && !signerCfg.apiKey) {
      checks.push({
        code:   env === "PRODUCTION" ? "DTE_SIGNER_PRODUCTION_API_KEY" : "DTE_SIGNER_TEST_API_KEY",
        label:  `DTE_SIGNER_API_KEY (firmador ${env})`,
        status: "warning",
        detail: "DTE_SIGNER_API_KEY no está configurada; el firmador protegido responderá 403.",
      });
    }

    const health = await signerAdapter.checkHealth(signerCfg);
    checks.push({
      code:   reachableCode,
      label:  `Firmador ${env} accesible (health check, no firma ni transmite)`,
      status: health.ok ? "ok" : "warning",
      detail: health.ok ? undefined : (health.message ?? `No se pudo verificar conectividad con el firmador ${env}.`),
    });
  }

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
  const correlatives = await prisma.dteCorrelative.findMany({
    where: { tenant_id, location_id, issuer_config_id: config.id, environment: "PRODUCTION" },
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
  const activeCount = await prisma.dteIssuerConfig.count({
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
