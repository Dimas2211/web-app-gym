// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.action.test.ts
//
// Bloque B (pasada de cobertura completa) — CRÍTICO: fiscal.dte
// deshabilitado debe bloquear ANTES de tocar el documento DTE o el
// pipeline de firma. Este test NUNCA contacta signer/MH — signDteDocument
// y prisma.dteOutgoingDocument.findFirst quedan mockeados como spies
// que deben permanecer sin invocar.
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
  signDteDocumentSpy,
  dteOutgoingDocumentFindFirstSpy,
  resolveCommercialEnforcementContextMock,
} = vi.hoisted(() => ({
  signDteDocumentSpy: vi.fn(),
  dteOutgoingDocumentFindFirstSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { dteOutgoingDocument: { findFirst: dteOutgoingDocumentFindFirstSpy } },
}));

vi.mock("../services/sign-dte-document.service", () => ({
  signDteDocument: signDteDocumentSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { signDteDocumentAction } from "./sign-dte-document.action";

beforeEach(() => {
  signDteDocumentSpy.mockReset();
  dteOutgoingDocumentFindFirstSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
});

describe("signDteDocumentAction — fiscal.dte deshabilitado bloquea el pipeline de firma (sin contactar signer/MH)", () => {
  it("fiscal.dte deshabilitado -> bloquea, signDteDocument NUNCA se invoca, ni siquiera se consulta el documento", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(), // fiscal.dte no configurado -> disabled
      effectiveEntitlements: new Map(),
    });

    const result = await signDteDocumentAction("dte-doc-1");

    expect(result.ok).toBe(false);
    expect(dteOutgoingDocumentFindFirstSpy).not.toHaveBeenCalled();
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
  });
});
