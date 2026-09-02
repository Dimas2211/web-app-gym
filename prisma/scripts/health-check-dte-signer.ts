/**
 * health-check-dte-signer.ts
 *
 * TRUSTME-PRODUCTION-READINESS — versión generalizada de
 * health-check-dte-signer-test.ts (que se deja intacto, sigue
 * funcionando igual, y sigue siendo lo que referencian
 * docs/modules/dte-signer-multitenant-block.md y
 * docs/modules/dte-trustme-fse14-test-closure.md). Este script agrega
 * `--environment TEST|PRODUCTION` sobre el mismo mecanismo real de la
 * app (resolveDteSignerConfig + MhHttpDteSignerAdapter.checkHealth),
 * para poder validar el firmador PRODUCTION sin tocar Hacienda ni la
 * base de datos.
 *
 * Hace SOLO un GET a `<signerUrl>status` (endpoint de salud, distinto
 * al de firma que es POST). NO firma ningún DTE. NO transmite a
 * Hacienda. NO toca base de datos (ni control plane ni cliente). NO
 * imprime secrets ni URLs completas — solo host+ruta y el resultado.
 *
 * ESTE SCRIPT NO DEBE EJECUTARSE CONTRA PRODUCTION SIN APROBACIÓN
 * EXPLÍCITA DEL USUARIO. Queda preparado; --environment PRODUCTION no
 * tiene ninguna guardia técnica adicional más allá de esta advertencia
 * porque un health check GET no tiene efecto fiscal — pero sigue
 * siendo tráfico real contra el firmador PROD, así que requiere
 * autorización antes de correrlo.
 *
 * ── USO (PowerShell) ──────────────────────────────────────────────
 *
 *   # TEST (equivalente a health-check-dte-signer-test.ts)
 *   $env:DTE_SIGNER_URL_TEST = "https://firmador-test.getzolvi.com/firmardocumento/"
 *   $env:DTE_SIGNER_API_KEY  = "..."
 *   npx tsx prisma/scripts/health-check-dte-signer.ts --environment TEST
 *
 *   # PRODUCTION — NO EJECUTAR sin aprobación explícita
 *   $env:DTE_SIGNER_URL_PRODUCTION = "https://<host-real-produccion>/firmardocumento/"
 *   $env:DTE_SIGNER_API_KEY        = "..."
 *   npx tsx prisma/scripts/health-check-dte-signer.ts --environment PRODUCTION
 *
 * DTE_SIGNER_API_KEY y DTE_SIGNER_TIMEOUT_MS son compartidas entre
 * ambientes (mismo comportamiento que resolveDteSignerConfig() /
 * buildDteSignerConfig() — ver dte-signer.config.ts).
 *
 * Este script no fue ejecutado contra PRODUCTION. Preparado y validado
 * (tsc/eslint), en espera de aprobación explícita.
 */

import "dotenv/config";
import { resolveDteSignerConfig, DteSignerConfigError } from "../../src/modules/commerce/dte/config/dte-signer.config";
import { MhHttpDteSignerAdapter } from "../../src/modules/commerce/dte/adapters/dte-signer.adapter";
import type { DteMhEnvironment } from "../../src/modules/commerce/dte/types/dte-mh-auth.types";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const ENVIRONMENT = (argValue("--environment") ?? "TEST").toUpperCase();

function presence(name: string): "presente" | "AUSENTE" {
  const v = process.env[name];
  return v && v.trim() ? "presente" : "AUSENTE";
}

function safeHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`; // sin querystring, sin credenciales embebidas
  } catch {
    return "(URL no parseable)";
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Health check firmador DTE — TEST | PRODUCTION                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (ENVIRONMENT !== "TEST" && ENVIRONMENT !== "PRODUCTION") {
    console.error(`\n✗ --environment inválido: "${ENVIRONMENT}". Valores válidos: TEST, PRODUCTION.`);
    process.exitCode = 1;
    return;
  }

  if (ENVIRONMENT === "PRODUCTION") {
    console.log("\n⚠️  ambiente=PRODUCTION — este health check golpea el firmador REAL de producción.");
    console.log("    Confirma que tienes aprobación explícita antes de continuar (Ctrl+C para cancelar).");
  }

  console.log(`\n[1] ambiente=${ENVIRONMENT}. Presencia de variables de entorno (sin imprimir valores):`);
  console.log(`  DTE_SIGNER_URL_${ENVIRONMENT}     : ${presence(`DTE_SIGNER_URL_${ENVIRONMENT}`)}`);
  console.log(`  DTE_SIGNER_API_KEY      : ${presence("DTE_SIGNER_API_KEY")}`);
  console.log(`  DTE_SIGNER_TIMEOUT_MS   : ${presence("DTE_SIGNER_TIMEOUT_MS")} (si ausente, cae a default 10000ms)`);

  console.log(`\n[2] Resolviendo config real vía resolveDteSignerConfig("${ENVIRONMENT}")...`);
  let config;
  try {
    config = resolveDteSignerConfig(ENVIRONMENT as DteMhEnvironment);
  } catch (err) {
    if (err instanceof DteSignerConfigError) {
      console.error(`  ✗ ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
  console.log(`  ✓ Config resuelta. Host+ruta del firmador (sin querystring/credenciales): ${safeHost(config.signerUrl)}`);
  console.log(`  ✓ Health URL: ${safeHost(config.healthUrl)}`);
  console.log(`  ✓ timeoutMs: ${config.timeoutMs}`);
  console.log(`  ✓ apiKey configurada: ${config.apiKey ? "sí (no se imprime)" : "NO — el firmador remoto responderá 403 si exige X-DTE-Signer-Key"}`);

  console.log("\n[3] Ejecutando checkHealth() real — GET al endpoint /status. NO firma, NO transmite.");
  const adapter = new MhHttpDteSignerAdapter();
  const health = await adapter.checkHealth(config);

  if (health.ok) {
    console.log(`  ✅ Firmador ${ENVIRONMENT} alcanzable. status: OK`);
  } else {
    console.log(`  ✗ Firmador ${ENVIRONMENT} NO alcanzable o respondió error. httpStatus=${health.httpStatus ?? "n/a"} mensaje=${health.message ?? "sin detalle"}`);
  }

  console.log("\n[resumen] No se firmó ningún documento. No se transmitió nada a Hacienda. No se tocó ninguna base de datos.");
}

main().catch((err) => {
  console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
