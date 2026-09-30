/**
 * bootstrap-fiscal-dte-export-capability.ts
 *
 * FINAL-RUNTIME-CLOSURE — registra la capability por organización
 * `fiscal.dte.export` (Factura de Exportación / FEX 11) en el Control Plane
 * y la asigna ÚNICAMENTE a la organización `trustme-0001` vía
 * PlatformOrganizationModule (source ORGANIZATION_OVERRIDE_ADDED).
 *
 * Alcance deliberadamente estrecho (a diferencia de
 * bootstrap-platform-commercial-catalog.ts, que re-aplica todo el catálogo
 * y también toca gym-0001):
 *   1. PlatformModule "fiscal.dte.export": create si no existe; si existe,
 *      no se modifica.
 *   2. PlatformOrganizationModule (trustme-0001, fiscal.dte.export):
 *      create is_active:true si no existe; reactivar si is_active:false;
 *      no-op si ya está activo.
 *
 * NUNCA: crear/tocar PlatformPlanModule (ningún plan incluye el módulo →
 * ninguna otra organización lo hereda), tocar otras organizaciones, plan_id,
 * runtime profiles, DTE, MariaDB, ni borrar nada. El INSPECT reporta además
 * si alguna otra organización o plan ya referencia el módulo.
 *
 * ── Modos ────────────────────────────────────────────────────────────
 *   INSPECT (default) — 100% read-only.
 *   EXECUTE — requiere AMBOS gates exactos:
 *       FISCAL_DTE_EXPORT_BOOTSTRAP_MODE=EXECUTE
 *       FISCAL_DTE_EXPORT_BOOTSTRAP_CONFIRM=ENABLE_FISCAL_DTE_EXPORT_FOR_TRUSTME
 *     Todo en una única transacción.
 *
 * Usa DATABASE_URL (Control Plane), igual que el runtime app.
 *
 *   npx tsx prisma/scripts/bootstrap-fiscal-dte-export-capability.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { MODULES, TARGET_ORG_CODES } from "./bootstrap-platform-commercial-catalog.lib";

const MODULE_CODE = "fiscal.dte.export";
const TARGET_ORG_CODE = TARGET_ORG_CODES.TRUSTME;
const CONFIRM_TOKEN = "ENABLE_FISCAL_DTE_EXPORT_FOR_TRUSTME";

type RunMode = "INSPECT" | "EXECUTE";

function resolveMode(): RunMode {
  const raw = (process.env.FISCAL_DTE_EXPORT_BOOTSTRAP_MODE ?? "INSPECT").trim();
  if (raw === "INSPECT") return "INSPECT";
  if (raw !== "EXECUTE") {
    console.error(`❌  FISCAL_DTE_EXPORT_BOOTSTRAP_MODE="${raw}" no es válido (INSPECT | EXECUTE).`);
    process.exit(1);
  }
  if (process.env.FISCAL_DTE_EXPORT_BOOTSTRAP_CONFIRM !== CONFIRM_TOKEN) {
    console.error(`❌  EXECUTE requiere FISCAL_DTE_EXPORT_BOOTSTRAP_CONFIRM=${CONFIRM_TOKEN}.`);
    process.exit(1);
  }
  return "EXECUTE";
}

function printFingerprint(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("❌  DATABASE_URL no está definida.");
    process.exit(1);
  }
  try {
    const u = new URL(raw);
    console.log(`  Control Plane: ${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")} (user ${u.username})`);
  } catch {
    console.log("  Control Plane: (no se pudo parsear DATABASE_URL — fingerprint omitido)");
  }
}

const catalogEntry = MODULES.find((m) => m.code === MODULE_CODE);
if (!catalogEntry) {
  console.error(`❌  "${MODULE_CODE}" no existe en MODULES (seed.platform.ts).`);
  process.exit(1);
}

async function inspect(prisma: PrismaClient) {
  const org = await prisma.platformOrganization.findUnique({
    where: { code: TARGET_ORG_CODE },
    select: { id: true, code: true, name: true, tenant_id: true, plan_id: true, vertical_id: true },
  });
  const mod = await prisma.platformModule.findUnique({ where: { code: MODULE_CODE } });
  const planRows = mod
    ? await prisma.platformPlanModule.findMany({ where: { module_id: mod.id }, select: { plan_id: true, is_enabled: true } })
    : [];
  const orgRows = mod
    ? await prisma.platformOrganizationModule.findMany({
        where: { module_id: mod.id },
        select: { organization_id: true, is_active: true, organization: { select: { code: true } } },
      })
    : [];
  return { org, mod, planRows, orgRows };
}

async function main() {
  const mode = resolveMode();
  console.log("══════════════════════════════════════════════════════════════");
  console.log(` bootstrap-fiscal-dte-export-capability — MODO ${mode}`);
  console.log("══════════════════════════════════════════════════════════════");
  printFingerprint();

  const prisma = new PrismaClient();
  try {
    const before = await inspect(prisma);

    console.log(`\n  Organización ${TARGET_ORG_CODE}: ${before.org ? `${before.org.name} (id ${before.org.id}, tenant ${before.org.tenant_id})` : "NO EXISTE"}`);
    console.log(`  PlatformModule ${MODULE_CODE}: ${before.mod ? `EXISTE (id ${before.mod.id})` : "NO EXISTE → CREATE"}`);
    console.log(`  Planes que incluyen el módulo: ${before.planRows.length}`);
    console.log(`  Organizaciones con fila del módulo: ${before.orgRows.map((r) => `${r.organization.code}=${r.is_active}`).join(", ") || "(ninguna)"}`);

    if (!before.org) {
      console.error(`\n❌  No existe ${TARGET_ORG_CODE}. No se crea ninguna organización. Abortando.`);
      process.exit(1);
    }
    const otherOrgRows = before.orgRows.filter((r) => r.organization_id !== before.org!.id);
    if (before.planRows.length > 0 || otherOrgRows.length > 0) {
      console.log("\n  ⚠️  El módulo ya está referenciado por planes u otras organizaciones — este script no los toca.");
    }

    const trustmeRow = before.orgRows.find((r) => r.organization_id === before.org!.id);
    const assignment = !trustmeRow ? "CREATE" : trustmeRow.is_active ? "ALREADY_ACTIVE" : "REACTIVATE";
    console.log(`  Asignación ${TARGET_ORG_CODE} → ${MODULE_CODE}: ${assignment}`);

    if (mode === "INSPECT") {
      console.log("\n✅  INSPECT completo. Cero writes.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      const mod = before.mod ?? await tx.platformModule.create({
        data: {
          code:        catalogEntry!.code,
          name:        catalogEntry!.name,
          category:    catalogEntry!.category,
          is_core:     catalogEntry!.is_core,
          vertical_id: null,
        },
      });

      if (assignment === "CREATE") {
        await tx.platformOrganizationModule.create({
          data: { organization_id: before.org!.id, module_id: mod.id, is_active: true },
        });
      } else if (assignment === "REACTIVATE") {
        await tx.platformOrganizationModule.update({
          where: { organization_id_module_id: { organization_id: before.org!.id, module_id: mod.id } },
          data:  { is_active: true, activated_at: new Date(), deactivated_at: null },
        });
      }
    });

    const after = await inspect(prisma);
    console.log("\n── Estado después de EXECUTE ──");
    console.log(`  PlatformModule ${MODULE_CODE}: ${after.mod ? `id ${after.mod.id}` : "NO EXISTE"}`);
    console.log(`  Planes que incluyen el módulo: ${after.planRows.length}`);
    console.log(`  Organizaciones con fila del módulo: ${after.orgRows.map((r) => `${r.organization.code}=${r.is_active}`).join(", ")}`);
    console.log("\n✅  EXECUTE completado.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌  Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
