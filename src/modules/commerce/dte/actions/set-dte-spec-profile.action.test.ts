// MH20 (Fase 5.1E) — autorización y aislamiento de setDteSpecProfileAction.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ISSUER = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  requireOperationalContext: vi.fn(),
  setDteIssuerSpecProfile: vi.fn(),
  findFirst: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/modules/platform/runtime/require-operational-context", () => {
  class OperationalContextError extends Error {
    constructor(public code: string, public userMessage: string) { super(userMessage); }
  }
  return { requireOperationalContext: mocks.requireOperationalContext, OperationalContextError };
});
vi.mock("../services/dte-spec-profile-admin.service", () => ({ setDteIssuerSpecProfile: mocks.setDteIssuerSpecProfile }));

import { setDteSpecProfileAction } from "./set-dte-spec-profile.action";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const VALID = { issuer_config_id: ISSUER, target_profile: "MH_2_0", reason: "Prueba de certificación TEST", confirm_text: "MH_2_0:TEST" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "pa-1", role: "super_admin", auth_scope: "PLATFORM" });
  mocks.requireOperationalContext.mockResolvedValue({
    context: { tenantId: "t-session", locationId: "l-session", client: { dteIssuerConfig: { findFirst: mocks.findFirst } } },
    dispose: mocks.dispose,
  });
  mocks.findFirst.mockResolvedValue({ id: ISSUER, environment: "TEST" });
  mocks.setDteIssuerSpecProfile.mockResolvedValue({ ok: true, changed: true, previous_profile: "MH_1_2", new_profile: "MH_2_0", environment: "TEST", warnings: [] });
});

describe("setDteSpecProfileAction", () => {
  it("exige Platform Admin: si requireSuperAdmin corta, no se toca nada", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(setDteSpecProfileAction(undefined, form(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.requireOperationalContext).not.toHaveBeenCalled();
    expect(mocks.setDteIssuerSpecProfile).not.toHaveBeenCalled();
  });

  it("exige contexto operacional con escritura en fiscal.dte", async () => {
    await setDteSpecProfileAction(undefined, form(VALID));
    expect(mocks.requireOperationalContext).toHaveBeenCalledWith(expect.anything(), { module: "fiscal.dte", write: true });
    expect(mocks.dispose).toHaveBeenCalled();
  });

  it("tenant/location salen de la sesión, nunca del formulario", async () => {
    await setDteSpecProfileAction(undefined, form({ ...VALID, tenant_id: "t-attacker", location_id: "l-attacker" }));
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ISSUER, tenant_id: "t-session", location_id: "l-session" } }));
    expect(mocks.setDteIssuerSpecProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t-session", location_id: "l-session", actor_id: "pa-1", actor_scope: "PLATFORM" }),
      expect.anything(),
    );
  });

  it("emisor de otra sucursal → error sin llamar al servicio", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const r = await setDteSpecProfileAction(undefined, form(VALID));
    expect(r).toMatchObject({ error: expect.stringMatching(/no pertenece/) });
    expect(mocks.setDteIssuerSpecProfile).not.toHaveBeenCalled();
  });

  it("confirmación debe nombrar perfil y ambiente reales", async () => {
    mocks.findFirst.mockResolvedValue({ id: ISSUER, environment: "PRODUCTION" });
    const r = await setDteSpecProfileAction(undefined, form(VALID)); // confirma TEST, emisor es PRODUCTION
    expect(r).toMatchObject({ error: expect.stringMatching(/MH_2_0:PRODUCTION/) });
    expect(mocks.setDteIssuerSpecProfile).not.toHaveBeenCalled();
  });

  it("formulario inválido (perfil desconocido o sin motivo) → error", async () => {
    expect(await setDteSpecProfileAction(undefined, form({ ...VALID, target_profile: "MH_9_9" }))).toMatchObject({ error: expect.any(String) });
    expect(await setDteSpecProfileAction(undefined, form({ ...VALID, reason: "x" }))).toMatchObject({ error: expect.any(String) });
    expect(mocks.setDteIssuerSpecProfile).not.toHaveBeenCalled();
  });

  it("propaga rechazos del servicio (p. ej. bloqueos P0)", async () => {
    mocks.setDteIssuerSpecProfile.mockResolvedValue({ ok: false, code: "PRODUCTION_BLOCKED", error: "bloqueado", details: ["MH20-094: x"] });
    expect(await setDteSpecProfileAction(undefined, form(VALID))).toEqual({ error: "bloqueado", details: ["MH20-094: x"] });
  });
});
