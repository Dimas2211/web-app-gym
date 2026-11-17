// DTE-MH-TEST-RUNS — ruta del tick: 404 con flag/secreto ausente, 401 con
// token inválido, procesamiento solo con token válido. Sin bases ni red.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ processDue: vi.fn() }));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));
vi.mock("@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.repository", () => ({ createPrismaMhTestRunRepository: vi.fn(() => ({})) }));
vi.mock("@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.runtime-port", () => ({ createRuntimeMhTestPort: vi.fn() }));
vi.mock("@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.service", () => ({ processDueMhTestRuns: h.processDue }));

import { POST, maxDuration } from "./route";

const SECRET = "s".repeat(40);
const req = (auth?: string) => new Request("https://cp.example/api/platform/dte-mh-test-runs/tick", { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  h.processDue.mockReset().mockResolvedValue({ owner: "tick:x", results: [{ runId: "r1", outcome: { status: "ADVANCED", actions: 3, runStatus: "RUNNING" } }] });
  process.env.DTE_MH_TEST_RUNS_ENABLED = "true";
  process.env.DTE_MH_TEST_TICK_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.DTE_MH_TEST_RUNS_ENABLED;
  delete process.env.DTE_MH_TEST_TICK_SECRET;
  delete process.env.DTE_MH_TEST_TICK_BUDGET_MS;
});

describe("POST /api/platform/dte-mh-test-runs/tick", () => {
  it("declara maxDuration 60", () => expect(maxDuration).toBe(60));

  it("404 con el flag apagado (aunque el token sea válido)", async () => {
    delete process.env.DTE_MH_TEST_RUNS_ENABLED;
    expect((await POST(req(`Bearer ${SECRET}`))).status).toBe(404);
    expect(h.processDue).not.toHaveBeenCalled();
  });

  it("404 sin secreto o con secreto corto (< 32)", async () => {
    delete process.env.DTE_MH_TEST_TICK_SECRET;
    expect((await POST(req(`Bearer ${SECRET}`))).status).toBe(404);
    process.env.DTE_MH_TEST_TICK_SECRET = "corto";
    expect((await POST(req("Bearer corto"))).status).toBe(404);
    expect(h.processDue).not.toHaveBeenCalled();
  });

  it("401 sin header, con esquema distinto o token incorrecto", async () => {
    for (const a of [undefined, SECRET, `Basic ${SECRET}`, `Bearer ${SECRET}x`, "Bearer "]) {
      expect((await POST(req(a))).status).toBe(401);
    }
    expect(h.processDue).not.toHaveBeenCalled();
  });

  it("token válido procesa con presupuesto acotado y responde sin datos internos", async () => {
    process.env.DTE_MH_TEST_TICK_BUDGET_MS = "999999";
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, results: [{ runId: "r1", status: "ADVANCED", actions: 3 }] });
    expect(h.processDue.mock.calls[0][0].budgetMs).toBe(45_000);
  });

  it("error interno → 500 sin detalles", async () => {
    h.processDue.mockRejectedValue(new Error("connection string secreta"));
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secreta");
  });
});
