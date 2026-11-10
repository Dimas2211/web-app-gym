/**
 * process-dte-external-delivery-outbox.ts
 *
 * FISCAL-ONBOARDING — worker programable del outbox de entregas MariaDB.
 * Solo entrega DTE ACCEPTED de organizaciones con integración activa y
 * auto_delivery_enabled=true. Nunca firma, nunca transmite a Hacienda.
 * Resultados inciertos (timeout tras INSERT) quedan en UNCERTAIN y NO se
 * reintentan: requieren conciliación en el panel de la organización.
 *
 * Uso:
 *   npx tsx prisma/scripts/process-dte-external-delivery-outbox.ts --mode DRY_RUN
 *   npx tsx prisma/scripts/process-dte-external-delivery-outbox.ts --mode EXECUTE [--org <organizationId>] [--limit 25]
 *
 * DRY_RUN (default): lista trabajos vencidos; no modifica nada.
 * No imprime credenciales, payloads ni JWS.
 */

import "dotenv/config";
import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import { processDueExternalDeliveryJobs } from "../../src/modules/commerce/dte/outbox/external-delivery-processor.service";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const mode = (arg("--mode") ?? "DRY_RUN").toUpperCase();
  const organizationId = arg("--org");
  const limit = Math.min(100, Math.max(1, Number(arg("--limit") ?? 25)));

  if (mode !== "DRY_RUN" && mode !== "EXECUTE") throw new Error("--mode debe ser DRY_RUN o EXECUTE");

  if (mode === "DRY_RUN") {
    const now = new Date();
    const due = await controlPlanePrisma.platformDteExternalDeliveryJob.findMany({
      where: {
        ...(organizationId ? { organization_id: organizationId } : {}),
        status: { in: ["PENDING", "FAILED_RETRYABLE"] },
        attempts: { lt: controlPlanePrisma.platformDteExternalDeliveryJob.fields.max_attempts },
        OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
      },
      select: { id: true, organization_id: true, environment: true, status: true, attempts: true, max_attempts: true },
      take: limit,
    });
    const stale = await controlPlanePrisma.platformDteExternalDeliveryJob.count({
      where: { status: "IN_PROGRESS", lease_expires_at: { lt: now } },
    });
    console.log(`[DRY_RUN] ${due.length} trabajo(s) vencido(s); ${stale} lease(s) vencido(s) pasarían a UNCERTAIN. (El descubrimiento de DTE nuevos solo corre en EXECUTE.)`);
    for (const j of due) console.log(`  ${j.id} org=${j.organization_id} env=${j.environment} ${j.status} intentos=${j.attempts}/${j.max_attempts}`);
    return;
  }

  const summary = await processDueExternalDeliveryJobs({ organizationId, limit });
  console.log(
    `[EXECUTE] encolados=${summary.discovered.enqueued} (orgs auto=${summary.discovered.organizations}) examinados=${summary.examined} entregados=${summary.delivered} fallidos=${summary.failed} ` +
    `inciertos=${summary.uncertain} omitidos=${summary.skipped} leasesVencidos=${summary.expiredLeasesMarkedUncertain}`,
  );
  for (const d of summary.details) console.log(`  ${d.jobId} org=${d.organizationId} ${d.outcome}${d.errorCode ? ` (${d.errorCode})` : ""}`);
}

main()
  .catch((err) => {
    console.error(`[outbox] ${err instanceof Error ? err.message : "error"}`);
    process.exitCode = 1;
  })
  .finally(() => controlPlanePrisma.$disconnect());
