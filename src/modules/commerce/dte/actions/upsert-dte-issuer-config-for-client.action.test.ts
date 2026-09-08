// ─────────────────────────────────────────────────────────────────
// commerce/dte — upsert-dte-issuer-config-for-client.action.test.ts
//
// FASE 5 (bug residual post FASE IV-A) — bajo sesión runtime "Operar
// como cliente" (siempre solo lectura), crear/editar la configuración
// de emisor DTE debe bloquearse ANTES de tocar la DB (defensa en
// profundidad — la UI ya oculta los botones, pero la Server Action
// debe ser segura por sí misma).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: vi.fn(async () => "loc-1"),
}));

const {
  isRuntimeReadOnlyActiveMock,
  createDteIssuerConfigSpy,
  updateDteIssuerConfigSpy,
  resolveCommercialEnforcementContextMock,
} = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(),
  createDteIssuerConfigSpy: vi.fn(),
  updateDteIssuerConfigSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo runtime read-only activo.",
}));

vi.mock("../services/dte-issuer-config.service", () => ({
  createDteIssuerConfig: createDteIssuerConfigSpy,
  updateDteIssuerConfig: updateDteIssuerConfigSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import {
  createDteIssuerConfigForClientAction,
  updateDteIssuerConfigForClientAction,
} from "./upsert-dte-issuer-config-for-client.action";

function managedCtxWithFiscalDte() {
  return {
    mode: "MANAGED",
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map([["fiscal.dte", { module_id: "m1", code: "fiscal.dte", name: "DTE", category: "INTEGRATION", is_core: false, enabled: true, source: "PLAN" }]]),
    effectiveEntitlements: new Map(),
    organizationTimezone: "America/El_Salvador",
  };
}

beforeEach(() => {
  isRuntimeReadOnlyActiveMock.mockReset();
  createDteIssuerConfigSpy.mockReset();
  updateDteIssuerConfigSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
  resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxWithFiscalDte());
});

describe("createDteIssuerConfigForClientAction — runtime read-only guard", () => {
  it("sesión runtime activa -> bloquea ANTES de tocar la DB, createDteIssuerConfig NUNCA se invoca", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    const result = await createDteIssuerConfigForClientAction(undefined, new FormData());

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(createDteIssuerConfigSpy).not.toHaveBeenCalled();
    expect(resolveCommercialEnforcementContextMock).not.toHaveBeenCalled(); // bloquea antes, ni siquiera resuelve el módulo
  });

  it("modo normal (sin runtime) -> el guard no bloquea, sigue el flujo normal", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
    createDteIssuerConfigSpy.mockResolvedValue({ ok: false, error: "validación de negocio (no relevante a este test)" });

    const fd = new FormData();
    fd.set("environment", "TEST");
    fd.set("nit", "00000000000000");
    fd.set("name", "Emisor Test");

    await createDteIssuerConfigForClientAction(undefined, fd);

    // Pasó el guard runtime y llegó hasta invocar el servicio de escritura.
    expect(createDteIssuerConfigSpy).toHaveBeenCalled();
  });
});

describe("updateDteIssuerConfigForClientAction — runtime read-only guard", () => {
  it("sesión runtime activa -> bloquea ANTES de tocar la DB, updateDteIssuerConfig NUNCA se invoca", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);
    const fd = new FormData();
    fd.set("id", "cfg-1");

    const result = await updateDteIssuerConfigForClientAction(undefined, fd);

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(updateDteIssuerConfigSpy).not.toHaveBeenCalled();
  });
});
