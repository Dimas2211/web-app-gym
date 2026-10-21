// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3B — openPortalContext: puertas de LECTURA del portal.
// Runtime + módulo (requireOperationalContext), rol LIVE client y Client
// resuelto desde la sesión con el tenant del contexto. Fail closed.
// ─────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    constructor(
      readonly code: string,
      readonly userMessage: string,
      readonly httpStatus: number
    ) {
      super(userMessage);
    }
  }
  return {
    FakeOperationalContextError,
    requireOperationalContext: vi.fn(),
    getClientByUserId: vi.fn(),
    resolveCommercial: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: h.requireOperationalContext,
  OperationalContextError: h.FakeOperationalContextError,
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: h.resolveCommercial,
  hasOrganizationModule: (ctx: { enabled: string[] }, code: string) => ctx.enabled.includes(code),
}));
vi.mock("./queries", () => ({ getClientByUserId: h.getClientByUserId }));

import { openPortalContext, PORTAL_FORBIDDEN_MESSAGE, PORTAL_NO_PROFILE_MESSAGE } from "./portal-context";

const runtimeDb = { tag: "runtime" };
const USER = { id: "u1", role: "client", tenant_id: "t-jwt", auth_scope: "RUNTIME_CLIENT" } as never;

function handle(role = "client", commercialContext: unknown = null) {
  return {
    context: {
      effectiveUser: { id: "u1", role },
      tenantId: "t-live",
      gymId: "g-live",
      client: runtimeDb,
      commercialContext,
    },
    dispose: h.dispose,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireOperationalContext.mockResolvedValue(handle());
  h.getClientByUserId.mockResolvedValue({ id: "c1" });
});

describe("openPortalContext", () => {
  it("exige el módulo pedido vía requireOperationalContext (lectura, sin write)", async () => {
    const r = await openPortalContext(USER, { module: "gym.classes" });
    expect(h.requireOperationalContext).toHaveBeenCalledWith(USER, { module: "gym.classes" });
    expect(r.ok).toBe(true);
  });

  it("módulo deshabilitado → MODULE_DISABLED sin consultar el perfil", async () => {
    h.requireOperationalContext.mockRejectedValue(new h.FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402));
    const r = await openPortalContext(USER, { module: "gym.classes" });
    expect(r).toEqual({ ok: false, reason: "MODULE_DISABLED", message: "Módulo no habilitado." });
    expect(h.getClientByUserId).not.toHaveBeenCalled();
  });

  it("runtime no disponible → UNAVAILABLE con mensaje genérico", async () => {
    h.requireOperationalContext.mockRejectedValue(new h.FakeOperationalContextError("RUNTIME_UNAVAILABLE", "No se pudo acceder.", 503));
    expect(await openPortalContext(USER)).toEqual({ ok: false, reason: "UNAVAILABLE", message: "No se pudo acceder." });
  });

  it("rol LIVE distinto de client (p. ej. entrenador con JWT viejo) → FORBIDDEN, cierra el runtime, sin consultas", async () => {
    h.requireOperationalContext.mockResolvedValue(handle("trainer"));
    const r = await openPortalContext(USER, { module: "gym.classes" });
    expect(r).toEqual({ ok: false, reason: "FORBIDDEN", message: PORTAL_FORBIDDEN_MESSAGE });
    expect(h.getClientByUserId).not.toHaveBeenCalled();
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  it("el Client se resuelve desde la sesión con el tenant/gym del CONTEXTO (no del JWT ni del navegador)", async () => {
    await openPortalContext(USER);
    expect(h.getClientByUserId).toHaveBeenCalledWith("u1", runtimeDb, { tenantId: "t-live", gymId: "g-live" });
  });

  it("sin perfil vinculado → NO_PROFILE y dispose", async () => {
    h.getClientByUserId.mockResolvedValue(null);
    expect(await openPortalContext(USER)).toEqual({ ok: false, reason: "NO_PROFILE", message: PORTAL_NO_PROFILE_MESSAGE });
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  it("módulos opcionales: se resuelven del contexto comercial; si no se puede resolver, quedan deshabilitados (fail closed)", async () => {
    h.resolveCommercial.mockResolvedValue({ enabled: ["gym.classes"] });
    const ok = await openPortalContext(USER, { optionalModules: ["gym.classes", "gym.memberships"] });
    expect(ok.ok && ok.modules).toEqual({ "gym.classes": true, "gym.memberships": false });
    expect(h.resolveCommercial).toHaveBeenCalledWith("t-live");

    h.resolveCommercial.mockRejectedValue(new Error("control plane down"));
    const closed = await openPortalContext(USER, { optionalModules: ["gym.classes"] });
    expect(closed.ok && closed.modules).toEqual({ "gym.classes": false });
  });

  it("reutiliza el contexto comercial ya resuelto por el módulo exigido", async () => {
    h.requireOperationalContext.mockResolvedValue(handle("client", { enabled: ["gym.classes", "gym.memberships"] }));
    const r = await openPortalContext(USER, { module: "gym.classes", optionalModules: ["gym.memberships"] });
    expect(r.ok && r.modules).toEqual({ "gym.memberships": true });
    expect(h.resolveCommercial).not.toHaveBeenCalled();
  });

  it("error inesperado tras abrir el runtime → dispose y propaga", async () => {
    h.getClientByUserId.mockRejectedValue(new Error("boom"));
    await expect(openPortalContext(USER)).rejects.toThrow("boom");
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });
});
