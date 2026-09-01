/**
 * audit-trustme-dte-runtime.ts
 *
 * PASO 6B — FASE 1. Auditoría READ-ONLY del estado DTE de TrustMeDB
 * Runtime a través del Runtime Database Router. No firma, no transmite,
 * no escribe nada. Solo lectura vía withRuntimePrisma.
 *
 * USO (PowerShell), con DATABASE_URL/DIRECT_URL/PLATFORM_ENCRYPTION_KEY
 * de control plane ya en el entorno (.env local):
 *
 *   npx tsx prisma/scripts/audit-trustme-dte-runtime.ts "TrustMe"
 */

import "dotenv/config";
import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import {
  resolveRuntimeDatabaseProfileForOrganization,
  withRuntimePrisma,
  RuntimeDatabaseRouterError,
} from "../../src/modules/platform/runtime/runtime-database-router";

const ORG_QUERY = process.argv[2] ?? "TrustMe";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Auditoría DTE READ-ONLY — TrustMeDB Runtime (PASO 6B F1)       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const organization = await controlPlanePrisma.platformOrganization.findFirst({
    where: { OR: [{ name: { contains: ORG_QUERY, mode: "insensitive" } }, { code: { contains: ORG_QUERY, mode: "insensitive" } }] },
    select: { id: true, name: true, code: true, tenant_id: true },
  });

  if (!organization) {
    console.error(`✗ Organización no encontrada con nombre/código: "${ORG_QUERY}"`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[control plane] Organización: ${organization.name} (${organization.code})`);
  console.log(`[control plane] tenant_id: ${organization.tenant_id ?? "NO asignado"}`);

  if (!organization.tenant_id) {
    console.error("✗ La organización no tiene tenant_id — Tenant Binding pendiente.");
    process.exitCode = 1;
    return;
  }

  const profile = await resolveRuntimeDatabaseProfileForOrganization(organization.id);
  console.log(`[control plane] Perfil runtime resuelto: "${profile.label}" (${profile.environment}, ${profile.provider})`);
  console.log(`[control plane] profileId: ${profile.id}`);

  // Listar TODOS los perfiles activos de esta organización (puede haber más de uno)
  const allProfiles = await controlPlanePrisma.platformDatabaseProfile.findMany({
    where: { organization_id: organization.id },
    select: { id: true, label: true, environment: true, is_active: true, last_test_status: true },
    orderBy: { environment: "asc" },
  });
  console.log("\n[control plane] Todos los perfiles de esta organización:");
  for (const p of allProfiles) {
    console.log(`  - ${p.label} | env=${p.environment} | active=${p.is_active} | last_test=${p.last_test_status}`);
  }

  await withRuntimePrisma({ organizationId: organization.id }, async (client) => {
    console.log("\n[client runtime] Conectado vía Runtime Database Router. Iniciando lecturas...");

    // ── DteIssuerConfig ──────────────────────────────────────────
    const issuerConfigs = await client.dteIssuerConfig.findMany({
      select: {
        id: true, environment: true, is_active: true, nit: true, nrc: true,
        name: true, cod_estable_mh: true, cod_punto_venta_mh: true,
        location_id: true, updated_at: true,
      },
      orderBy: [{ environment: "asc" }, { updated_at: "desc" }],
    });
    console.log(`\n[DteIssuerConfig] total: ${issuerConfigs.length}`);
    for (const c of issuerConfigs) {
      console.log(
        `  - id=${c.id} env=${c.environment} active=${c.is_active} nit=${c.nit ?? "?"} ` +
        `codEstable=${c.cod_estable_mh ?? "?"} codPV=${c.cod_punto_venta_mh ?? "?"} location=${c.location_id}`,
      );
    }

    // ── DteCredential — vinculado a DteIssuerConfig por issuer_config_id.
    // Nunca leer/imprimir encrypted_payload ni secret_ref.
    try {
      const credentials = await client.dteCredential.findMany({
        select: {
          id: true, issuer_config_id: true, credential_type: true,
          is_active: true, expires_at: true,
        },
      });
      console.log(`\n[DteCredential] total: ${credentials.length}`);
      for (const cr of credentials) {
        console.log(
          `  - id=${cr.id} issuer_config_id=${cr.issuer_config_id} tipo=${cr.credential_type} ` +
          `active=${cr.is_active} expires_at=${cr.expires_at?.toISOString() ?? "-"}`,
        );
      }
    } catch (e) {
      console.log(`\n[DteCredential] no se pudo consultar: ${e instanceof Error ? e.message : e}`);
    }

    // ── DteCorrelative ───────────────────────────────────────────
    const correlatives = await client.dteCorrelative.findMany({
      select: {
        id: true, environment: true, dte_type_code: true, year: true,
        last_sequence: true, external_baseline_last_used_sequence: true, location_id: true,
      },
      orderBy: [{ environment: "asc" }, { dte_type_code: "asc" }],
    });
    console.log(`\n[DteCorrelative] total: ${correlatives.length}`);
    for (const co of correlatives) {
      console.log(
        `  - env=${co.environment} tipo=${co.dte_type_code} year=${co.year} last_seq=${co.last_sequence} baseline=${co.external_baseline_last_used_sequence}`,
      );
    }

    // ── DteOutgoingDocument — últimos 10 ─────────────────────────
    const lastDocs = await client.dteOutgoingDocument.findMany({
      select: {
        id: true, dte_type_code: true, dte_status: true, environment: true,
        control_number: true, generation_code: true, sale_id: true, purchase_id: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 10,
    });
    console.log(`\n[DteOutgoingDocument] últimos ${lastDocs.length} (de total):`);
    for (const d of lastDocs) {
      console.log(
        `  - ${d.created_at.toISOString()} tipo=${d.dte_type_code} status=${d.dte_status} env=${d.environment} ` +
        `ctrl=${d.control_number ?? "-"} sale=${d.sale_id ?? "-"} purchase=${d.purchase_id ?? "-"}`,
      );
    }
    const totalDocs = await client.dteOutgoingDocument.count();
    console.log(`  total histórico: ${totalDocs}`);

    // ── Candidatos de venta para FE01/CCFE03 (Sale CONFIRMED + inventory_moved, sin DTE activo) ──
    const candidateSales = await client.sale.findMany({
      where: {
        status: "CONFIRMED",
        inventory_moved: true,
        dte_documents: { none: { dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED"] } } },
      },
      select: { id: true, sale_code: true, location_id: true, customer_id: true, total_amount: true, created_at: true },
      orderBy: { created_at: "desc" },
      take: 5,
    }).catch((e) => {
      console.log(`  (no se pudo consultar candidatos de venta: ${e instanceof Error ? e.message : e})`);
      return [];
    });
    console.log(`\n[Candidatos Sale FE01/CCFE03] (CONFIRMED + inventory_moved, sin DTE activo): ${candidateSales.length}`);
    for (const s of candidateSales) {
      console.log(`  - ${s.sale_code} total=${s.total_amount} customer=${s.customer_id ?? "consumidor final"} location=${s.location_id}`);
    }

    // ── Candidatos de compra para FSE14 (Purchase CONFIRMED, sin DTE activo tipo 14) ──
    try {
      const candidatePurchases = await client.purchase.findMany({
        where: {
          status: "CONFIRMED",
          dte_documents: { none: { dte_type_code: "14", dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED"] } } },
        },
        select: { id: true, purchase_code: true, location_id: true, total_amount: true, created_at: true },
        orderBy: { created_at: "desc" },
        take: 5,
      });
      console.log(`\n[Candidatos Purchase FSE14] (CONFIRMED, sin DTE 14 activo): ${candidatePurchases.length}`);
      for (const p of candidatePurchases) {
        console.log(`  - ${p.purchase_code} total=${p.total_amount} location=${p.location_id}`);
      }
    } catch (e) {
      console.log(`\n[Candidatos Purchase FSE14] no se pudo consultar: ${e instanceof Error ? e.message : e}`);
    }
  });

  console.log("\n✅ Auditoría READ-ONLY completa. No se escribió, firmó ni transmitió nada.");
}

main()
  .catch((err) => {
    if (err instanceof RuntimeDatabaseRouterError) {
      console.error(`\n✗ [${err.code}] ${err.message}`);
    } else {
      console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlPlanePrisma.$disconnect();
  });
