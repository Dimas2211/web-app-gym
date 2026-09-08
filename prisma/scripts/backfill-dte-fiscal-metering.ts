/**
 * backfill-dte-fiscal-metering.ts
 *
 * FASE IV-A — backfill idempotente de DteFiscalMeteringReservation para
 * DteOutgoingDocument PRODUCTION históricos que ya tienen evidencia
 * fiscal de aceptación/observación, ANTES de que el motor de metering
 * existiera. Sin esto, activar fiscal.dte.monthly_issued para una
 * organización con DTE previos empezaría el contador en cero — política
 * explícitamente rechazada en la auditoría (docs/modules/
 * platform-phase-4-dte-monthly-metering.md).
 *
 * ── Alcance ──────────────────────────────────────────────────────────
 * TODO DteOutgoingDocument de la organización con environment=PRODUCTION
 * y evidencia de aceptación/observación — no solo el mes vigente (el
 * volumen actual es pequeño; deja el ledger auditable desde el inicio).
 *
 * Regla de evidencia (nunca se inventa una fecha):
 *   dte_status = ACCEPTED    -> usa accepted_at
 *   dte_status = OBSERVED    -> usa observed_at
 *   dte_status = INVALIDATED -> usa accepted_at (invalidación conserva el
 *                                accepted_at original — ver auditoría)
 *   Si el timestamp requerido es null -> fila reportada como CONFLICT
 *   ("manual review"), NUNCA se inventa una fecha.
 *
 * Explícitamente EXCLUIDO (nunca genera ledger):
 *   - REJECTED (nunca fue fiscalmente aceptado)
 *   - environment = TEST (TEST nunca cuenta)
 *   - cualquier otro dte_status (PENDING_GENERATION, GENERATED,
 *     SCHEMA_VALIDATED, SIGNED, INVALIDATION_PENDING) — no hay evidencia
 *     de aceptación fiscal todavía
 *
 * period_key histórico: se deriva del timestamp de evidencia (arriba)
 * convertido al timezone de PlatformOrganization — puede diferir
 * excepcionalmente del criterio nuevo ("periodo de la reserva") porque
 * estos documentos nunca tuvieron un reserved_at real. Limitación de
 * bootstrap documentada, no un bug.
 *
 * Idempotencia: @@unique([dte_document_id]) en DteFiscalMeteringReservation
 * — un documento que ya tiene fila se reporta como SKIPPED (ya
 * respaldado), nunca se duplica ni se sobreescribe. Reejecutar este
 * script tantas veces como se quiera es seguro.
 *
 * ── Modos ────────────────────────────────────────────────────────────
 *   INSPECT (default absoluto) — 100% read-only. Imprime fingerprint de
 *     conexión, timezone resuelto, y el plan CREATE/SKIP/CONFLICT fila
 *     por fila que aplicaría EXECUTE. Cero writes.
 *   EXECUTE — requiere AMBOS gates de entorno exactos:
 *       DTE_METERING_BACKFILL_MODE=EXECUTE
 *       DTE_METERING_BACKFILL_CONFIRM=BACKFILL_DTE_FISCAL_METERING
 *     Si falta o no coincide cualquiera, aborta con exit(1) ANTES de
 *     tocar la base de datos. Los CREATE se aplican uno por uno (no una
 *     única transacción gigante) — el índice único hace cada create
 *     idempotente por sí mismo; un fallo aislado se reporta y el resto
 *     continúa (nunca se enmascara un conflicto como éxito).
 *
 * ── Qué este runner NUNCA hace ───────────────────────────────────────
 *   - Tocar DteOutgoingDocument (solo LEE, nunca escribe ese modelo).
 *   - Crear ledger para REJECTED, TEST, o cualquier estado sin evidencia
 *     de aceptación/observación fiscal.
 *   - Inventar un timestamp cuando accepted_at/observed_at es null.
 *   - Correr contra un PlatformDatabaseProfile remoto — usa el `prisma`
 *     singleton de este proyecto (DATABASE_URL del entorno actual).
 *     Ejecutarlo contra un cliente runtime remoto requiere apuntar
 *     DATABASE_URL/DIRECT_URL a esa base explícitamente (fuera de
 *     alcance de FASE IV-A — no ejecutado contra ningún entorno remoto).
 *   - Modificar PlatformPlanEntitlement/Organization overrides.
 *   - Activar ningún límite comercial.
 *
 * ── Uso ──────────────────────────────────────────────────────────────
 *   INSPECT (default, requiere solo el tenant objetivo):
 *     DTE_METERING_BACKFILL_TENANT_ID=<tenant_id> npx tsx prisma/scripts/backfill-dte-fiscal-metering.ts
 *
 *   EXECUTE:
 *     DTE_METERING_BACKFILL_TENANT_ID=<tenant_id> `
 *     DTE_METERING_BACKFILL_MODE=EXECUTE `
 *     DTE_METERING_BACKFILL_CONFIRM=BACKFILL_DTE_FISCAL_METERING `
 *     npx tsx prisma/scripts/backfill-dte-fiscal-metering.ts
 *
 * NO se ejecutó EXECUTE contra ninguna base durante la implementación de
 * FASE IV-A — solo se revisó el código y (si acaso) se corrió INSPECT.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import { resolveDteMonthlyPeriodKey } from "../../src/modules/commerce/dte/utils/dte-fiscal-period.util";
import { DTE_MONTHLY_ENTITLEMENT_CODE } from "../../src/modules/commerce/dte/services/dte-fiscal-metering.service";

const prisma = new PrismaClient();

type RunMode = "INSPECT" | "EXECUTE";
const CONFIRM_TOKEN = "BACKFILL_DTE_FISCAL_METERING";

function resolveMode(): RunMode {
  const raw = (process.env.DTE_METERING_BACKFILL_MODE ?? "INSPECT").trim();
  if (raw !== "INSPECT" && raw !== "EXECUTE") {
    console.error(`❌  DTE_METERING_BACKFILL_MODE="${raw}" no es válido. Valores permitidos: INSPECT (default) | EXECUTE.`);
    process.exit(1);
  }
  if (raw === "EXECUTE") {
    const confirm = process.env.DTE_METERING_BACKFILL_CONFIRM;
    if (confirm !== CONFIRM_TOKEN) {
      console.error(
        "❌  EXECUTE solicitado pero falta o no coincide DTE_METERING_BACKFILL_CONFIRM.\n" +
          `    Se requiere exactamente: DTE_METERING_BACKFILL_CONFIRM=${CONFIRM_TOKEN}\n` +
          "    Abortando ANTES de cualquier acceso de escritura. No se tocó la base de datos.",
      );
      process.exit(1);
    }
  }
  return raw as RunMode;
}

function resolveTenantId(): string {
  const tenantId = process.env.DTE_METERING_BACKFILL_TENANT_ID?.trim();
  if (!tenantId) {
    console.error("❌  Falta DTE_METERING_BACKFILL_TENANT_ID (tenant_id objetivo). Abortando.");
    process.exit(1);
  }
  return tenantId;
}

function printConnectionFingerprint(): void {
  const raw = process.env.DATABASE_URL;
  console.log("── Conexión (Runtime DB objetivo) ──────────────────────");
  if (!raw) {
    console.log("  ⚠️  DATABASE_URL no está definida en el entorno actual.");
    return;
  }
  try {
    const u = new URL(raw);
    console.log(`  host     : ${u.hostname}`);
    console.log(`  port     : ${u.port || "(default)"}`);
    console.log(`  database : ${u.pathname.replace(/^\//, "") || "(desconocido)"}`);
  } catch {
    console.log("  ⚠️  No se pudo parsear DATABASE_URL de forma segura — se omite el fingerprint.");
  }
  console.log("");
}

type EvidenceStatus = "ACCEPTED" | "OBSERVED" | "INVALIDATED";

interface CandidateRow {
  id: string;
  dte_type_code: string;
  control_number: string | null;
  generation_code: string | null;
  dte_status: string;
  accepted_at: Date | null;
  observed_at: Date | null;
}

interface PlannedRow {
  dteDocumentId: string;
  action: "CREATE" | "SKIP_ALREADY_BACKED" | "CONFLICT_NO_EVIDENCE_TIMESTAMP";
  periodKey: string | null;
  evidenceAt: Date | null;
  detail: string;
}

function evidenceTimestampFor(row: CandidateRow): { status: EvidenceStatus; at: Date | null } {
  if (row.dte_status === "ACCEPTED") return { status: "ACCEPTED", at: row.accepted_at };
  if (row.dte_status === "OBSERVED") return { status: "OBSERVED", at: row.observed_at };
  // INVALIDATED conserva accepted_at original (ver auditoría) — nunca usa
  // invalidated_at como evidencia de CONSUMED, eso sería la fecha de un
  // evento distinto (la invalidación), no de la aceptación fiscal.
  return { status: "INVALIDATED", at: row.accepted_at };
}

async function planBackfill(tenantId: string, periodResolver: (at: Date) => ReturnType<typeof resolveDteMonthlyPeriodKey>) {
  const candidates = await prisma.dteOutgoingDocument.findMany({
    where: {
      tenant_id: tenantId,
      environment: "PRODUCTION",
      dte_status: { in: ["ACCEPTED", "OBSERVED", "INVALIDATED"] },
    },
    select: {
      id: true,
      dte_type_code: true,
      control_number: true,
      generation_code: true,
      dte_status: true,
      accepted_at: true,
      observed_at: true,
    },
    orderBy: { created_at: "asc" },
  });

  const existingIds = new Set(
    (
      await prisma.dteFiscalMeteringReservation.findMany({
        where: { dte_document_id: { in: candidates.map((c) => c.id) } },
        select: { dte_document_id: true },
      })
    ).map((r) => r.dte_document_id),
  );

  const plan: PlannedRow[] = [];

  for (const row of candidates) {
    if (existingIds.has(row.id)) {
      plan.push({
        dteDocumentId: row.id,
        action: "SKIP_ALREADY_BACKED",
        periodKey: null,
        evidenceAt: null,
        detail: "Ya existe DteFiscalMeteringReservation para este documento — no se duplica.",
      });
      continue;
    }

    const evidence = evidenceTimestampFor(row);
    if (!evidence.at) {
      plan.push({
        dteDocumentId: row.id,
        action: "CONFLICT_NO_EVIDENCE_TIMESTAMP",
        periodKey: null,
        evidenceAt: null,
        detail: `dte_status=${row.dte_status} pero el timestamp requerido (${
          evidence.status === "OBSERVED" ? "observed_at" : "accepted_at"
        }) es null — revisión manual, no se inventa una fecha.`,
      });
      continue;
    }

    const periodResult = periodResolver(evidence.at);
    if (!periodResult.ok) {
      plan.push({
        dteDocumentId: row.id,
        action: "CONFLICT_NO_EVIDENCE_TIMESTAMP",
        periodKey: null,
        evidenceAt: evidence.at,
        detail: `No se pudo resolver period_key: ${periodResult.error}`,
      });
      continue;
    }

    plan.push({
      dteDocumentId: row.id,
      action: "CREATE",
      periodKey: periodResult.periodKey,
      evidenceAt: evidence.at,
      detail: `${row.dte_type_code} ${row.control_number ?? "(sin control_number)"} — status CONSUMED, period_key=${periodResult.periodKey}`,
    });
  }

  return plan;
}

async function runInspect(tenantId: string) {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" backfill-dte-fiscal-metering — MODO INSPECT (read-only)");
  console.log("═══════════════════════════════════════════════════════\n");
  printConnectionFingerprint();

  const org = await controlPlanePrisma.platformOrganization.findUnique({
    where: { tenant_id: tenantId },
    select: { id: true, code: true, name: true, timezone: true },
  });

  if (!org) {
    console.log(`❌  No existe PlatformOrganization para tenant_id="${tenantId}" — este tenant es LEGACY_UNMANAGED.`);
    console.log("    El backfill solo aplica a organizaciones MANAGED (con fila en el Control Plane). Abortando INSPECT.");
    return;
  }

  console.log(`Organización : ${org.code} (${org.name})`);
  console.log(`Timezone     : ${org.timezone ?? "(no configurado)"}\n`);

  if (!org.timezone) {
    console.log("❌  Sin timezone configurado — EXECUTE fallaría fila por fila (TIMEZONE_INVALID_OR_MISSING).");
    console.log("    Configura PlatformOrganization.timezone antes de ejecutar EXECUTE.\n");
  }

  const plan = await planBackfill(tenantId, (at) => resolveDteMonthlyPeriodKey(at, org.timezone));

  const creates = plan.filter((p) => p.action === "CREATE");
  const skips = plan.filter((p) => p.action === "SKIP_ALREADY_BACKED");
  const conflicts = plan.filter((p) => p.action === "CONFLICT_NO_EVIDENCE_TIMESTAMP");

  console.log(`Candidatos totales        : ${plan.length}`);
  console.log(`  CREATE (EXECUTE crearía) : ${creates.length}`);
  console.log(`  SKIP (ya respaldados)    : ${skips.length}`);
  console.log(`  CONFLICT (revisión manual): ${conflicts.length}\n`);

  if (creates.length > 0) {
    console.log("── CREATE ───────────────────────────────────────────");
    for (const row of creates) console.log(`  ${row.dteDocumentId}  ${row.detail}`);
    console.log("");
  }
  if (conflicts.length > 0) {
    console.log("── CONFLICT — revisión manual, EXECUTE los omitiría ──");
    for (const row of conflicts) console.log(`  ${row.dteDocumentId}  ${row.detail}`);
    console.log("");
  }

  console.log("✅  INSPECT completo. Cero writes realizados.");
}

async function runExecute(tenantId: string) {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" backfill-dte-fiscal-metering — MODO EXECUTE");
  console.log("═══════════════════════════════════════════════════════\n");
  printConnectionFingerprint();

  const org = await controlPlanePrisma.platformOrganization.findUnique({
    where: { tenant_id: tenantId },
    select: { id: true, code: true, timezone: true },
  });
  if (!org) {
    console.error(`❌  No existe PlatformOrganization para tenant_id="${tenantId}". Abortando EXECUTE.`);
    process.exit(1);
  }

  const plan = await planBackfill(tenantId, (at) => resolveDteMonthlyPeriodKey(at, org.timezone));
  const creates = plan.filter((p) => p.action === "CREATE");

  console.log(`Plan: ${creates.length} reservation(s) CONSUMED a crear, ${plan.length - creates.length} omitidas (SKIP/CONFLICT).\n`);

  let created = 0;
  let failed = 0;
  for (const row of creates) {
    try {
      // create() individual — el índice único @@unique([dte_document_id])
      // hace este create idempotente por sí mismo ante una re-ejecución
      // parcial anterior; un fallo aislado (ej. P2002 de una corrida
      // concurrente) se reporta y el resto continúa.
      await prisma.dteFiscalMeteringReservation.create({
        data: {
          tenant_id: tenantId,
          dte_document_id: row.dteDocumentId,
          entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
          period_key: row.periodKey!,
          status: "CONSUMED",
          reserved_at: row.evidenceAt!,
          resolved_at: row.evidenceAt!,
          created_by: null,
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`  ❌  ${row.dteDocumentId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n✅  EXECUTE completado. Creadas: ${created}. Fallidas: ${failed}. Nunca se sobrescribió una fila existente.`);
}

async function main() {
  const tenantId = resolveTenantId();
  const mode = resolveMode();
  if (mode === "INSPECT") {
    await runInspect(tenantId);
  } else {
    await runExecute(tenantId);
  }
}

main()
  .catch((err) => {
    console.error("❌  Error inesperado:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await controlPlanePrisma.$disconnect();
  });
