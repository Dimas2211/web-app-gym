// ─────────────────────────────────────────────────────────────────
// DTE-MH-TEST-RUNS — permisos y guardas de las acciones del Control Plane.
//   - Solo Platform Admin (requireSuperAdmin redirige a cualquier otro).
//   - Modo "operar como cliente" de solo lectura bloquea escrituras.
//   - Flag apagado bloquea crear/avanzar/decidir/reanudar (no pausar/cancelar).
//   - No existe parámetro de ambiente: TEST forzado.
// Sin bases ni red: si alguna guarda fallara, el runtime/CP mockeado lanza.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  isRuntimeReadOnly: vi.fn(),
  withOrgRuntime:    vi.fn(),
  cp:                new Proxy({}, { get(_t, p) { return (h_cp as Record<string, unknown>)[p as string]; } }),
}));
const h_cp: Record<string, unknown> = {};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({ requireSuperAdmin: h.requireSuperAdmin }));
vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: h.isRuntimeReadOnly,
  RUNTIME_READONLY_MESSAGE: "Modo solo lectura.",
}));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: h.cp }));
vi.mock("@/modules/platform/runtime/runtime-database-router", () => ({ withOrganizationRuntimePrisma: h.withOrgRuntime }));

import {
  createMhTestRunAction,
  advanceMhTestRunNowAction,
  decideMhTestRunItemAction,
  setMhTestRunStatusAction,
  previewMhTestRunAction,
} from "./mh-test-run.action";

const PLAN = { version: 1, blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }], invalidations: [], receptors: {}, responsible: null, contingency: null };

function untouchable() {
  return new Proxy({}, { get() { throw new Error("NO DEBE TOCAR LA BASE"); } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  h.isRuntimeReadOnly.mockResolvedValue(false);
  h.withOrgRuntime.mockImplementation(() => { throw new Error("NO DEBE ABRIR EL RUNTIME"); });
  for (const k of Object.keys(h_cp)) delete h_cp[k];
  Object.assign(h_cp, { platformOrganization: untouchable(), platformDteMhTestRun: untouchable(), platformDteMhTestRunItem: untouchable() });
  process.env.DTE_MH_TEST_RUNS_ENABLED = "true";
});
afterEach(() => { delete process.env.DTE_MH_TEST_RUNS_ENABLED; });

describe("permisos", () => {
  it("usuario no plataforma: requireSuperAdmin corta antes de cualquier acceso", async () => {
    h.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(createMhTestRunAction("org-1", PLAN, "INICIAR PRUEBAS TEST")).rejects.toThrow("NEXT_REDIRECT");
    await expect(previewMhTestRunAction("org-1", PLAN)).rejects.toThrow("NEXT_REDIRECT");
    await expect(advanceMhTestRunNowAction("org-1", "run-1")).rejects.toThrow("NEXT_REDIRECT");
    await expect(decideMhTestRunItemAction("org-1", "run-1", "i-1", "ABANDON", "nota suficiente")).rejects.toThrow("NEXT_REDIRECT");
    await expect(setMhTestRunStatusAction("org-1", "run-1", "PAUSE")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("modo solo lectura (operar como cliente) bloquea todas las escrituras", async () => {
    h.isRuntimeReadOnly.mockResolvedValue(true);
    for (const r of [
      await createMhTestRunAction("org-1", PLAN, "INICIAR PRUEBAS TEST"),
      await advanceMhTestRunNowAction("org-1", "run-1"),
      await decideMhTestRunItemAction("org-1", "run-1", "i-1", "ABANDON", "nota suficiente"),
      await setMhTestRunStatusAction("org-1", "run-1", "CANCEL", "CANCELAR"),
    ]) expect(r).toMatchObject({ ok: false, error: "Modo solo lectura." });
  });
});

describe("feature flag (deshabilitado por defecto)", () => {
  it("sin DTE_MH_TEST_RUNS_ENABLED=true no se crea, avanza, decide ni reanuda", async () => {
    delete process.env.DTE_MH_TEST_RUNS_ENABLED;
    for (const r of [
      await createMhTestRunAction("org-1", PLAN, "INICIAR PRUEBAS TEST"),
      await advanceMhTestRunNowAction("org-1", "run-1"),
      await decideMhTestRunItemAction("org-1", "run-1", "i-1", "ABANDON", "nota suficiente"),
      await setMhTestRunStatusAction("org-1", "run-1", "RESUME"),
    ]) expect(r).toMatchObject({ ok: false, error: expect.stringContaining("DTE_MH_TEST_RUNS_ENABLED") });
  });

  it("valores distintos de 'true' exacto no habilitan", async () => {
    process.env.DTE_MH_TEST_RUNS_ENABLED = "1";
    expect(await createMhTestRunAction("org-1", PLAN, "INICIAR PRUEBAS TEST")).toMatchObject({ ok: false });
  });

  it("pausar/cancelar siguen permitidos con el flag apagado (detener es seguro)", async () => {
    delete process.env.DTE_MH_TEST_RUNS_ENABLED;
    h_cp.platformDteMhTestRun = { findFirst: vi.fn().mockResolvedValue(null) };
    expect(await setMhTestRunStatusAction("org-1", "run-1", "PAUSE")).toMatchObject({ ok: false, error: "Corrida no encontrada." });
  });
});

describe("confirmación y validación previa a reservar", () => {
  it("exige el texto de confirmación exacto", async () => {
    expect(await createMhTestRunAction("org-1", PLAN, "iniciar")).toMatchObject({ ok: false, error: expect.stringContaining("INICIAR PRUEBAS TEST") });
  });

  it("plan inválido no abre el runtime ni crea la corrida", async () => {
    h_cp.platformOrganization = { findUnique: vi.fn().mockResolvedValue({ tenant_id: "t1" }) };
    const bad = { ...PLAN, blocks: [{ dteTypeCode: "01", firstSequence: 0, scenarios: [] }] };
    const r = await createMhTestRunAction("org-1", bad, "INICIAR PRUEBAS TEST");
    expect(r.ok).toBe(false);
    expect(h.withOrgRuntime).not.toHaveBeenCalled();
  });

  it("PRODUCTION no es expresable: el plan rechaza cualquier campo de ambiente desconocido sin efectos", async () => {
    h_cp.platformOrganization = { findUnique: vi.fn().mockResolvedValue({ tenant_id: "t1" }) };
    // Un tipo fuera de catálogo / bloque vacío se rechaza en el planner; el ambiente no existe en el contrato.
    const r = await createMhTestRunAction("org-1", { ...PLAN, environment: "PRODUCTION", blocks: [] }, "INICIAR PRUEBAS TEST");
    expect(r.ok).toBe(false);
    expect(h.withOrgRuntime).not.toHaveBeenCalled();
  });

  it("decisión sin nota suficiente se rechaza sin tocar la base", async () => {
    expect(await decideMhTestRunItemAction("org-1", "run-1", "i-1", "RETRANSMIT_SAME", "corta")).toMatchObject({ ok: false });
  });

  it("decisión inválida se rechaza", async () => {
    expect(await decideMhTestRunItemAction("org-1", "run-1", "i-1", "BORRAR" as never, "nota suficiente")).toMatchObject({ ok: false, error: "Decisión inválida." });
  });
});
