// ─────────────────────────────────────────────────────────────────
// API — POST /api/platform/dte-mh-test-runs/tick
//
// DTE-MH-TEST-RUNS — disparador HTTPS de tramos acotados. Lo invoca el timer
// systemd de la VPS (ops/dte-mh-test-tick/) con:
//     Authorization: Bearer <DTE_MH_TEST_TICK_SECRET>
// La VPS solo conoce la URL y el token: ni PLATFORM_ENCRYPTION_KEY ni
// credenciales de base de datos.
//
//   - 404 si DTE_MH_TEST_RUNS_ENABLED !== "true" o falta el secreto (≥ 32):
//     el endpoint no existe para quien no está habilitado.
//   - 401 si el token no coincide (comparación en tiempo constante).
//   - Procesa SOLO corridas TEST autorizadas (QUEUED/RUNNING) con lease.
//   - El middleware deja pasar /api/* sin sesión: esta ruta se autentica sola.
//
// maxDuration = 60 y presupuesto de 45 s: VERIFICAR antes de habilitar que
// el plan de Vercel del Control Plane permite 60 s para funciones (ver
// docs/modules/dte-mh-test-runs.md). Si el límite efectivo es menor, bajar
// DTE_MH_TEST_TICK_BUDGET_MS por debajo de ese límite menos 15 s.
// ─────────────────────────────────────────────────────────────────

import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getMhTestTickSecret, isMhTestRunsEnabled } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_BUDGET_MS = 45_000;

function tokenMatches(header: string | null, secret: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return false;
  // Digest de longitud fija: timingSafeEqual exige buffers del mismo tamaño.
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

function budgetMs(): number {
  const raw = Number(process.env.DTE_MH_TEST_TICK_BUDGET_MS);
  return Number.isFinite(raw) && raw >= 20_000 && raw <= DEFAULT_BUDGET_MS ? raw : DEFAULT_BUDGET_MS;
}

export async function POST(req: Request) {
  const secret = getMhTestTickSecret();
  if (!isMhTestRunsEnabled() || !secret) return new NextResponse(null, { status: 404 });
  if (!tokenMatches(req.headers.get("authorization"), secret)) return NextResponse.json({ ok: false }, { status: 401 });

  const { controlPlanePrisma } = await import("@/modules/platform/runtime/control-plane-prisma");
  const { createPrismaMhTestRunRepository } = await import("@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.repository");
  const { createRuntimeMhTestPort } = await import("@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.runtime-port");
  const { processDueMhTestRuns } = await import("@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.service");

  try {
    const summary = await processDueMhTestRuns({
      repo: createPrismaMhTestRunRepository(controlPlanePrisma),
      runtime: (run) => createRuntimeMhTestPort({
        organizationId: run.organization_id, tenantId: run.tenant_id, locationId: run.location_id,
        issuerConfigId: run.issuer_config_id, userId: run.authorized_by ?? "",
      }),
      budgetMs: budgetMs(),
    });
    return NextResponse.json({
      ok: true,
      results: summary.results.map((r) => ({
        runId: r.runId,
        status: r.outcome.status,
        actions: "actions" in r.outcome ? r.outcome.actions : 0,
      })),
    });
  } catch (err) {
    // Sin detalles internos en la respuesta.
    console.error("[dte-mh-test-runs/tick]", err instanceof Error ? err.name : "error");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
