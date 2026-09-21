// ─────────────────────────────────────────────────────────────────
// commerce/dte — deliver-invalidation-to-external-db.action.test.ts
//
// FASE VI-E7 — cierra la deuda documentada en VI-E6B: el entry point
// productivo (esta action) no resolvía sesión runtime todavía, aunque
// el servicio (deliver-invalidation-to-external-db.service.ts) ya
// aceptaba un `client` runtime desde esa fase. Certifica el mismo
// contrato ya probado para deliver-dte-to-external-db.action.ts:
//   - Sin sesión runtime -> requireRuntimeDteWriteAccess resuelve el
//     branch normal (Prisma global implícito vía access.context.client).
//   - Con sesión runtime -> deliverInvalidationToExternalDb recibe
//     SIEMPRE el `client` runtime resuelto por el guard (nunca Prisma
//     global directamente).
//   - access.ok === false (falta confirmación, no super_admin, etc.)
//     -> deliverInvalidationToExternalDb NUNCA se invoca.
//   - dispose() se llama siempre (éxito o error de negocio).
//   - Auditoría en control plane solo cuando isRuntimeWrite === true.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  requireRuntimeDteWriteAccessMock,
  recordRuntimeDteWriteAuditMock,
  disposeMock,
  deliverInvalidationToExternalDbSpy,
  resolveCommercialEnforcementContextMock,
  assertOrganizationModuleMock,
} = vi.hoisted(() => ({
  requireRuntimeDteWriteAccessMock: vi.fn(),
  recordRuntimeDteWriteAuditMock:   vi.fn().mockResolvedValue(undefined),
  disposeMock:                      vi.fn().mockResolvedValue(undefined),
  deliverInvalidationToExternalDbSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn().mockResolvedValue({ tenantId: "tenant-1" }),
  assertOrganizationModuleMock: vi.fn(),
}));

vi.mock("../runtime/require-runtime-dte-write-access", () => ({
  requireRuntimeDteWriteAccess: requireRuntimeDteWriteAccessMock,
  recordRuntimeDteWriteAudit:   recordRuntimeDteWriteAuditMock,
}));

vi.mock("../services/deliver-invalidation-to-external-db.service", () => ({
  deliverInvalidationToExternalDb: deliverInvalidationToExternalDbSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
  assertOrganizationModule:            assertOrganizationModuleMock,
  CommercialEnforcementError:          class CommercialEnforcementError extends Error {
    userMessage: string;
    constructor(_code: string, userMessage: string) {
      super(userMessage);
      this.userMessage = userMessage;
    }
  },
}));

import { deliverInvalidationToExternalDbAction } from "./deliver-invalidation-to-external-db.action";

const GLOBAL_PRISMA_MARKER = { __marker: "GLOBAL_PRISMA" };
const RUNTIME_CLIENT_MARKER = { __marker: "RUNTIME_CLIENT_DB" };

function normalAccess(client: unknown = GLOBAL_PRISMA_MARKER) {
  return {
    ok: true,
    context: {
      tenantId:       "tenant-1",
      locationId:     "loc-1",
      client,
      userId:         "u1",
      isRuntimeWrite: false,
      runtimeInfo:    null,
      dispose:        disposeMock,
    },
  };
}

function runtimeAccess(client: unknown = RUNTIME_CLIENT_MARKER) {
  return {
    ok: true,
    context: {
      tenantId:       "tenant-runtime",
      locationId:     "loc-runtime",
      client,
      userId:         "u-super",
      isRuntimeWrite: true,
      runtimeInfo: {
        organizationId:   "org-1",
        organizationName: "Cliente Runtime",
        profileLabel:     "PROD",
      },
      dispose: disposeMock,
    },
  };
}

beforeEach(() => {
  requireRuntimeDteWriteAccessMock.mockReset();
  recordRuntimeDteWriteAuditMock.mockClear();
  disposeMock.mockClear();
  deliverInvalidationToExternalDbSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockClear();
  assertOrganizationModuleMock.mockReset();
});

describe("deliverInvalidationToExternalDbAction — FASE VI-E7", () => {
  it("sin invalidationEventId -> error explícito, requireRuntimeDteWriteAccess nunca se invoca", async () => {
    const result = await deliverInvalidationToExternalDbAction("");

    expect(result).toMatchObject({ ok: false });
    expect(requireRuntimeDteWriteAccessMock).not.toHaveBeenCalled();
    expect(deliverInvalidationToExternalDbSpy).not.toHaveBeenCalled();
  });

  it("access.ok === false (sin confirmación / no super_admin) -> deliverInvalidationToExternalDb NUNCA se invoca", async () => {
    requireRuntimeDteWriteAccessMock.mockResolvedValue({
      ok: false,
      error: "Esta acción escribe contra la base de un cliente en modo \"Operar como cliente\" y requiere confirmación explícita.",
    });

    const result = await deliverInvalidationToExternalDbAction("inv-1");

    expect(result.ok).toBe(false);
    expect(deliverInvalidationToExternalDbSpy).not.toHaveBeenCalled();
    expect(disposeMock).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> deliverInvalidationToExternalDb recibe el client resuelto por el guard", async () => {
    requireRuntimeDteWriteAccessMock.mockResolvedValue(normalAccess());
    deliverInvalidationToExternalDbSpy.mockResolvedValue({
      ok: true,
      insertId: 1,
      affectedRows: 1,
      invalidationEventId: "inv-1",
      dteDocumentId: "dte-1",
    });

    const result = await deliverInvalidationToExternalDbAction("inv-1");

    expect(result).toMatchObject({ ok: true });
    expect(deliverInvalidationToExternalDbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        invalidationEventId: "inv-1",
        tenantId:   "tenant-1",
        locationId: "loc-1",
        client:     GLOBAL_PRISMA_MARKER,
      }),
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
    // Sin sesión runtime -> nunca se audita en control plane.
    expect(recordRuntimeDteWriteAuditMock).not.toHaveBeenCalled();
  });

  it("con sesión runtime activa -> deliverInvalidationToExternalDb recibe SIEMPRE el client runtime (nunca Prisma global)", async () => {
    requireRuntimeDteWriteAccessMock.mockResolvedValue(runtimeAccess());
    deliverInvalidationToExternalDbSpy.mockResolvedValue({
      ok: true,
      insertId: 2,
      affectedRows: 1,
      invalidationEventId: "inv-2",
      dteDocumentId: "dte-2",
    });

    const result = await deliverInvalidationToExternalDbAction("inv-2", { confirmed: true });

    expect(result).toMatchObject({ ok: true });
    expect(deliverInvalidationToExternalDbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:   "tenant-runtime",
        locationId: "loc-runtime",
        client:     RUNTIME_CLIENT_MARKER,
      }),
    );
    expect(deliverInvalidationToExternalDbSpy.mock.calls[0][0].client).not.toBe(GLOBAL_PRISMA_MARKER);
    expect(disposeMock).toHaveBeenCalledTimes(1);
    // Sesión runtime -> auditoría en control plane.
    expect(recordRuntimeDteWriteAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", action: "DELIVER_EXTERNAL", ok: true }),
    );
  });

  it("requireRuntimeDteWriteAccess propaga confirmed:true desde options", async () => {
    requireRuntimeDteWriteAccessMock.mockResolvedValue(runtimeAccess());
    deliverInvalidationToExternalDbSpy.mockResolvedValue({ ok: true, invalidationEventId: "inv-3", dteDocumentId: "dte-3" });

    await deliverInvalidationToExternalDbAction("inv-3", { confirmed: true });

    expect(requireRuntimeDteWriteAccessMock).toHaveBeenCalledWith({
      action:    "DELIVER_EXTERNAL",
      confirmed: true,
    });
  });

  it("módulo comercial fiscal.dte deshabilitado -> bloquea antes de invocar el servicio, dispose() se llama igual", async () => {
    requireRuntimeDteWriteAccessMock.mockResolvedValue(normalAccess());

    // El mock del módulo (arriba) ya exporta una clase CommercialEnforcementError
    // compatible con el `instanceof` que hace la action — la reusamos directo.
    const mod = await import("@/modules/platform/runtime/commercial-enforcement");
    assertOrganizationModuleMock.mockImplementation(() => {
      throw new mod.CommercialEnforcementError("MODULE_NOT_ENABLED", "El módulo fiscal.dte no está habilitado.");
    });

    const result = await deliverInvalidationToExternalDbAction("inv-4");

    expect(result).toMatchObject({ ok: false, error: "El módulo fiscal.dte no está habilitado." });
    expect(deliverInvalidationToExternalDbSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
