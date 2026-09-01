/**
 * health-check-dte-signer-test.ts
 *
 * PASO 6B — FASE 2. Health check del firmador remoto TEST (VPS) usando
 * el código real de la app (resolveDteSignerConfig + MhHttpDteSignerAdapter
 * .checkHealth). NO firma ningún DTE. NO transmite a Hacienda. NO toca
 * base de datos (ni control plane ni cliente). NO imprime secrets ni
 * URLs completas — solo el host resuelto y el resultado del health check.
 *
 * El health check golpea `<DTE_SIGNER_URL_TEST>status` (GET), que es un
 * endpoint distinto al de firma (`<DTE_SIGNER_URL_TEST>` con POST) — el
 * mismo mecanismo que ya usa getDteProductionPreflight() en producción
 * normal de la app (dte-production-preflight.service.ts).
 *
 * USO (PowerShell), con las variables reales del firmador TEST puestas
 * SOLO en el entorno de esta sesión (nunca en archivo):
 *
 *   $env:DTE_SIGNER_URL_TEST = "https://firmador-test.getzolvi.com/firmardocumento/"
 *   $env:DTE_SIGNER_API_KEY  = "..."
 *   $env:DTE_SIGNER_NIT      = "..."
 *   $env:DTE_SIGNER_PASSWORD = "..."
 *   $env:DTE_SIGNER_TIMEOUT_MS = "10000"   # opcional, default 10000
 *
 *   npx tsx prisma/scripts/health-check-dte-signer-test.ts
 */

import "dotenv/config";
import { resolveDteSignerConfig, DteSignerConfigError } from "../../src/modules/commerce/dte/config/dte-signer.config";
import { MhHttpDteSignerAdapter } from "../../src/modules/commerce/dte/adapters/dte-signer.adapter";

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
  console.log("║  PASO 6B FASE 2 — Health check firmador TEST (VPS)              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  console.log("\n[1] Presencia de variables de entorno (sin imprimir valores):");
  console.log(`  DTE_SIGNER_URL_TEST     : ${presence("DTE_SIGNER_URL_TEST")}`);
  console.log(`  DTE_SIGNER_API_KEY      : ${presence("DTE_SIGNER_API_KEY")}`);
  console.log(`  DTE_SIGNER_NIT          : ${presence("DTE_SIGNER_NIT")}`);
  console.log(`  DTE_SIGNER_PASSWORD     : ${presence("DTE_SIGNER_PASSWORD")}`);
  console.log(`  DTE_SIGNER_TIMEOUT_MS   : ${presence("DTE_SIGNER_TIMEOUT_MS")} (si ausente, cae a default 10000ms)`);
  console.log(`  DTE_SIGNER_URL_PRODUCTION: ${presence("DTE_SIGNER_URL_PRODUCTION")} (no se usa en esta fase — solo referencia)`);

  console.log("\n[2] Resolviendo config real vía resolveDteSignerConfig(\"TEST\")...");
  let config;
  try {
    config = resolveDteSignerConfig("TEST");
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
    console.log("  ✅ Firmador TEST alcanzable. status: OK");
  } else {
    console.log(`  ✗ Firmador TEST NO alcanzable o respondió error. httpStatus=${health.httpStatus ?? "n/a"} mensaje=${health.message ?? "sin detalle"}`);
  }

  console.log("\n[resumen] No se firmó ningún documento. No se transmitió nada a Hacienda. No se tocó ninguna base de datos.");
}

main().catch((err) => {
  console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
