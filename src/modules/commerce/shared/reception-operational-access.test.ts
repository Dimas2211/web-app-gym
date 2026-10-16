// ─────────────────────────────────────────────────────────────────
// commerce/shared — reception-operational-access.test.ts
//
// Certifica la microfase "permisos operativos de recepción en Ventas y
// Caja" sobre las Server Actions reales, con contexto operacional
// sintético (sin DB real):
//
//   - reception opera ventas (crear/confirmar) y caja (abrir/cerrar,
//     movimientos, historial, corte, workspace) en SU sucursal;
//   - tenant/location/DB salen SIEMPRE del contexto efectivo (runtime
//     client), nunca del input ni de la cookie de location activa;
//   - rol LIVE degradado (JWT reception → LIVE trainer) revoca;
//   - reception NO administra cajas (requireAdmin + rol LIVE);
//   - Support Session READ_ONLY y módulo deshabilitado siguen bloqueando;
//   - workspace expone permisos efectivos para ocultar controles.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { COMMERCE_ACCESS_MESSAGES } from "@/core/permissions/commerce-access";

const h = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    constructor(
      public code: string,
      public userMessage: string,
      public httpStatus: number,
    ) {
      super(userMessage);
    }
  }
  class FakeCommercialEnforcementError extends Error {
    httpStatus = 403;
    constructor(public userMessage: string) {
      super(userMessage);
    }
  }
  return {
    FakeOperationalContextError,
    FakeCommercialEnforcementError,
    RUNTIME: { __marker: "RUNTIME_CLIENT_DB" },
    state: {
      jwtRole: "reception",
      liveRole: "reception",
      locationId: "loc-REC" as string | null,
      readOnly: false,
      moduleEnabled: true,
      /** Asignación ACTUAL en la DB efectiva (User.branch_id). */
      assignedBranch: "loc-REC" as string | null,
    },
    dispose: vi.fn(async () => {}),
    getEffectiveLocationId: vi.fn(async () => "loc-COOKIE-OTRA-SUCURSAL"),
    svc: {
      createSaleDraft: vi.fn(async () => ({ ok: true, id: "sale-1", sale_code: "V-1" })),
      confirmSale: vi.fn(async () => ({ ok: true })),
      openCashSession: vi.fn(async () => ({ ok: true, data: { id: "ses-1" } })),
      closeCashSession: vi.fn(async () => ({ ok: true, data: { id: "ses-1" } })),
      recordCashMovement: vi.fn(async () => ({ ok: true, data: { id: "mov-1" } })),
      getCashWorkspaceState: vi.fn(async () => ({ registers: [], selected_register: null, open_session: null })),
      ensureCashRegisterInScope: vi.fn(async () => ({ id: "reg-1" })),
      getOpenSessionForRegister: vi.fn(async () => null),
      listCashRegisters: vi.fn(async () => []),
      listCashSessions: vi.fn(async () => []),
      listCashMovementsBySession: vi.fn(async () => []),
      getCashSessionCutReport: vi.fn(async () => ({ id: "cut-1" })),
      createCashRegister: vi.fn(async () => ({ ok: true, data: {} })),
      updateCashRegister: vi.fn(async () => ({ ok: true, data: {} })),
      setCashRegisterActive: vi.fn(async () => ({ ok: true, data: {} })),
    },
  };
});

function jwtUser() {
  return {
    id: "user-REC",
    tenant_id: "tenant-A",
    location_id: h.state.locationId,
    role: h.state.jwtRole,
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "org-A",
  };
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));
vi.mock("@/lib/permissions/guards", () => ({
  // Puertas JWT: mismas reglas que las reales (ver commerce-access.test.ts).
  requireCommerceOperator: vi.fn(async () => {
    if (!["super_admin", "branch_admin", "reception"].includes(h.state.jwtRole)) {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url: "/dashboard" });
    }
    return jwtUser();
  }),
  requireAdmin: vi.fn(async () => {
    if (!["super_admin", "branch_admin"].includes(h.state.jwtRole)) {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url: "/dashboard" });
    }
    return jwtUser();
  }),
}));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: h.getEffectiveLocationId }));

// Contexto operacional sintético: replica el contrato de
// requireOperationalContext (READ_ONLY, módulo, rol LIVE, runtime DB).
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  OperationalContextError: h.FakeOperationalContextError,
  requireOperationalContext: vi.fn(async (_u: unknown, opts: { module?: string; write?: boolean }) => {
    if (opts.write && h.state.readOnly) {
      throw new h.FakeOperationalContextError("READ_ONLY", "Sesión de soporte en solo lectura.", 403);
    }
    if (opts.module && !h.state.moduleEnabled) {
      throw new h.FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 403);
    }
    return {
      context: {
        runtimeMode: "RUNTIME_CLIENT",
        authScope: "RUNTIME_CLIENT",
        effectiveUser: {
          id: "user-REC",
          tenant_id: "tenant-A",
          location_id: h.state.locationId,
          role: h.state.liveRole,
          auth_scope: "RUNTIME_CLIENT",
        },
        organizationId: "org-A",
        tenantId: "tenant-A",
        gymId: null,
        locationId: h.state.locationId,
        client: h.RUNTIME,
        readOnly: h.state.readOnly,
        commercialContext: { mode: "MANAGED" },
      },
      dispose: h.dispose,
    };
  }),
}));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: vi.fn(async () => ({
    context: {
      tenantId: "tenant-A",
      client: h.RUNTIME,
      runtime: null,
      locationId: h.state.locationId,
      runtimeMode: "RUNTIME_CLIENT",
      readOnly: false,
      effectiveRole: h.state.liveRole,
    },
    dispose: h.dispose,
  })),
  resolveRuntimeFirstLocationId: vi.fn(async () => "loc-PRIMERA-DEL-TENANT"),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn(async () => ({})),
  assertOrganizationModule: vi.fn(() => {
    if (!h.state.moduleEnabled) throw new h.FakeCommercialEnforcementError("Módulo no habilitado.");
  }),
  CommercialEnforcementError: h.FakeCommercialEnforcementError,
}));
vi.mock("@/core/security/operational-authorization/operational-authorization", () => ({
  issueDraftOwnerGrant: vi.fn(async () => {}),
  checkOperationalGrant: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/commerce/sales/services/sale.service", () => ({
  createSaleDraft: h.svc.createSaleDraft,
  confirmSale: h.svc.confirmSale,
}));
vi.mock("@/modules/commerce/cash/services/cash-session.service", () => ({
  openCashSession: h.svc.openCashSession,
  closeCashSession: h.svc.closeCashSession,
}));
vi.mock("@/modules/commerce/cash/services/cash-movement.service", () => ({
  recordCashMovement: h.svc.recordCashMovement,
}));
vi.mock("@/modules/commerce/cash/services/cash-read.service", () => ({
  getCashWorkspaceState: h.svc.getCashWorkspaceState,
  ensureCashRegisterInScope: h.svc.ensureCashRegisterInScope,
  getOpenSessionForRegister: h.svc.getOpenSessionForRegister,
}));
vi.mock("@/modules/commerce/cash/queries/list-cash-registers", () => ({ listCashRegisters: h.svc.listCashRegisters }));
vi.mock("@/modules/commerce/cash/queries/list-cash-sessions", () => ({ listCashSessions: h.svc.listCashSessions }));
vi.mock("@/modules/commerce/cash/queries/list-cash-movements-by-session", () => ({
  listCashMovementsBySession: h.svc.listCashMovementsBySession,
}));
vi.mock("@/modules/commerce/cash/queries/get-cash-session-cut-report", () => ({
  getCashSessionCutReport: h.svc.getCashSessionCutReport,
}));
vi.mock("@/modules/commerce/cash/services/cash-register-admin.service", () => ({
  createCashRegister: h.svc.createCashRegister,
  updateCashRegister: h.svc.updateCashRegister,
  setCashRegisterActive: h.svc.setCashRegisterActive,
}));

import { createSaleDraftAction } from "@/modules/commerce/sales/actions/create-sale-draft.action";
import { confirmSaleAction } from "@/modules/commerce/sales/actions/confirm-sale.action";
import { openCashSessionAction } from "@/modules/commerce/cash/actions/open-cash-session.action";
import { closeCashSessionAction } from "@/modules/commerce/cash/actions/close-cash-session.action";
import { createCashMovementAction } from "@/modules/commerce/cash/actions/create-cash-movement.action";
import { getCashWorkspaceStateAction } from "@/modules/commerce/cash/actions/get-cash-workspace-state.action";
import { getCashRegisterDetailAction } from "@/modules/commerce/cash/actions/get-cash-register-detail.action";
import { getOpenCashSessionAction } from "@/modules/commerce/cash/actions/get-open-cash-session.action";
import { listCashRegistersAction } from "@/modules/commerce/cash/actions/list-cash-registers.action";
import { listCashSessionsAction } from "@/modules/commerce/cash/actions/list-cash-sessions.action";
import { listCashMovementsAction } from "@/modules/commerce/cash/actions/list-cash-movements.action";
import { getCashSessionCutReportAction } from "@/modules/commerce/cash/actions/get-cash-session-cut-report.action";
import { createCashRegisterAction } from "@/modules/commerce/cash/actions/create-cash-register.action";
import { updateCashRegisterAction } from "@/modules/commerce/cash/actions/update-cash-register.action";
import { setCashRegisterActiveAction } from "@/modules/commerce/cash/actions/set-cash-register-active.action";
import { POST as createSaleRoute } from "@/app/api/sales/route";

// Tabla `users` sintética de la DB runtime: asignación actual del usuario.
// Se adjunta tras el hoisting; vi.clearAllMocks conserva la implementación.
const userFindFirst = vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) =>
  where.id === "user-REC" && where.tenant_id === "tenant-A" ? { branch_id: h.state.assignedBranch } : null,
);
(h.RUNTIME as Record<string, unknown>).user = { findFirst: userFindFirst };

const REG = "11111111-1111-4111-8111-111111111111";
const SES = "22222222-2222-4222-8222-222222222222";

// Operaciones de recepción: [nombre, invocación, service que debe ejecutarse].
const OPERATIONS: Array<[string, () => Promise<{ ok: boolean }>, ReturnType<typeof vi.fn>]> = [
  ["createSaleDraftAction", () => createSaleDraftAction({ sale_date: "2026-10-14" }), h.svc.createSaleDraft],
  ["confirmSaleAction", () => confirmSaleAction("sale-1"), h.svc.confirmSale],
  ["openCashSessionAction", () => openCashSessionAction({ cash_register_id: REG, opening_amount: 50 }), h.svc.openCashSession],
  ["closeCashSessionAction", () => closeCashSessionAction({ cash_session_id: SES, declared_cash_amount: 50 }), h.svc.closeCashSession],
  ["createCashMovementAction", () => createCashMovementAction({ cash_session_id: SES, movement_type: "MANUAL_IN", amount: 5 }), h.svc.recordCashMovement],
  ["getCashWorkspaceStateAction", () => getCashWorkspaceStateAction({}), h.svc.getCashWorkspaceState],
  ["getCashRegisterDetailAction", () => getCashRegisterDetailAction({ cash_register_id: REG }), h.svc.ensureCashRegisterInScope],
  ["getOpenCashSessionAction", () => getOpenCashSessionAction({ cash_register_id: REG }), h.svc.getOpenSessionForRegister],
  ["listCashRegistersAction", () => listCashRegistersAction({ include_inactive: false }), h.svc.listCashRegisters],
  ["listCashSessionsAction", () => listCashSessionsAction({}), h.svc.listCashSessions],
  ["listCashMovementsAction", () => listCashMovementsAction({ cash_session_id: SES }), h.svc.listCashMovementsBySession],
  ["getCashSessionCutReportAction", () => getCashSessionCutReportAction({ cash_session_id: SES }), h.svc.getCashSessionCutReport],
];

const WRITE_OPS = new Set([
  "createSaleDraftAction",
  "confirmSaleAction",
  "openCashSessionAction",
  "closeCashSessionAction",
  "createCashMovementAction",
]);

/** Extrae (tenant, location, db) del primer call del service, sea por args posicionales o por objeto. */
function scopeOf(fn: ReturnType<typeof vi.fn>): { tenant: unknown; location: unknown; db: unknown } {
  const args = fn.mock.calls[0] as unknown[];
  const obj = args.find((a) => a && typeof a === "object" && "tenant_id" in (a as object)) as
    | { tenant_id: unknown; location_id: unknown }
    | undefined;
  const db = args[args.length - 1];
  if (obj) return { tenant: obj.tenant_id, location: obj.location_id, db };
  const strings = args.filter((a) => typeof a === "string") as string[];
  return {
    tenant: strings.find((s) => s.startsWith("tenant-")),
    location: strings.find((s) => s.startsWith("loc-")),
    db,
  };
}

beforeEach(() => {
  Object.assign(h.state, {
    jwtRole: "reception",
    liveRole: "reception",
    locationId: "loc-REC",
    readOnly: false,
    moduleEnabled: true,
    assignedBranch: "loc-REC",
  });
  vi.clearAllMocks();
});

describe("reception — operaciones permitidas (casos 4, 6, 7, 8, 18)", () => {
  it.each(OPERATIONS)("%s procede con tenant/location/DB efectivos de su sucursal", async (_n, run, svc) => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(svc).toHaveBeenCalledTimes(1);
    const scope = scopeOf(svc);
    expect(scope.tenant).toBe("tenant-A");
    expect(scope.location).toBe("loc-REC");
    expect(scope.db).toBe(h.RUNTIME);
    // Nunca se usa la cookie de location activa para un rol no global.
    expect(h.getEffectiveLocationId).not.toHaveBeenCalled();
  });
});

describe("rol LIVE y alcance (casos 13, 19)", () => {
  it.each(OPERATIONS)("%s: JWT reception pero rol LIVE trainer → rechazado sin tocar el service", async (_n, run, svc) => {
    h.state.liveRole = "trainer";
    const r = await run();
    expect(r.ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s: rol LIVE client → rechazado", async (_n, run, svc) => {
    h.state.liveRole = "client";
    expect((await run()).ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s: JWT trainer → redirect en la puerta (nunca llega al contexto)", async (_n, run, svc) => {
    h.state.jwtRole = "trainer";
    h.state.liveRole = "trainer";
    await expect(run()).rejects.toMatchObject({ url: "/dashboard" });
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s: reception sin sucursal fija → rechazado (no cae a cookie)", async (_n, run, svc) => {
    h.state.locationId = null;
    const r = await run();
    expect(r.ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
    expect(h.getEffectiveLocationId).not.toHaveBeenCalled();
  });

  it("libera el PrismaClient runtime al denegar por rol LIVE", async () => {
    h.state.liveRole = "trainer";
    await openCashSessionAction({ cash_register_id: REG, opening_amount: 10 });
    expect(h.dispose).toHaveBeenCalled();
  });
});

describe("Support Session READ_ONLY y módulo deshabilitado (casos 15, 16)", () => {
  it.each(OPERATIONS.filter(([n]) => WRITE_OPS.has(n)))("%s bloqueado en READ_ONLY", async (_n, run, svc) => {
    h.state.readOnly = true;
    expect((await run()).ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s bloqueado con módulo comercial deshabilitado", async (_n, run, svc) => {
    h.state.moduleEnabled = false;
    expect((await run()).ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
  });
});

describe("administración de cajas sigue restringida (casos 9, 10, 12, 14)", () => {
  const ADMIN_OPS: Array<[string, () => Promise<unknown>, ReturnType<typeof vi.fn>]> = [
    ["createCashRegisterAction", () => createCashRegisterAction({ code: "CAJA-02", name: "Caja 2" }), h.svc.createCashRegister],
    ["updateCashRegisterAction", () => updateCashRegisterAction({ cash_register_id: REG, code: "CAJA-02", name: "X" }), h.svc.updateCashRegister],
    ["setCashRegisterActiveAction", () => setCashRegisterActiveAction({ cash_register_id: REG, is_active: false }), h.svc.setCashRegisterActive],
  ];

  it.each(ADMIN_OPS)("%s forzada por reception → rechazada (requireAdmin)", async (_n, run, svc) => {
    await expect(run()).rejects.toMatchObject({ url: "/dashboard" });
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(ADMIN_OPS)("%s: JWT branch_admin pero rol LIVE reception → rechazada", async (_n, run, svc) => {
    h.state.jwtRole = "branch_admin";
    h.state.liveRole = "reception";
    const r = (await run()) as { ok: boolean };
    expect(r.ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(ADMIN_OPS)("%s: branch_admin conserva la administración", async (_n, run, svc) => {
    h.state.jwtRole = "branch_admin";
    h.state.liveRole = "branch_admin";
    const r = (await run()) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(svc).toHaveBeenCalledTimes(1);
  });
});

describe("permisos efectivos del workspace de caja (caso 11)", () => {
  it("reception → canAdministerRegisters=false", async () => {
    const r = await getCashWorkspaceStateAction({});
    expect(r).toMatchObject({ ok: true, permissions: { canAdministerRegisters: false } });
  });

  it("branch_admin → canAdministerRegisters=true", async () => {
    h.state.jwtRole = "branch_admin";
    h.state.liveRole = "branch_admin";
    const r = await getCashWorkspaceStateAction({});
    expect(r).toMatchObject({ ok: true, permissions: { canAdministerRegisters: true } });
  });

  it("super_admin (global) → canAdministerRegisters=true", async () => {
    h.state.jwtRole = "super_admin";
    h.state.liveRole = "super_admin";
    const r = await getCashWorkspaceStateAction({});
    expect(r).toMatchObject({ ok: true, permissions: { canAdministerRegisters: true } });
  });

  it("permiso calculado con rol LIVE: JWT branch_admin degradado a reception → false", async () => {
    h.state.jwtRole = "branch_admin";
    h.state.liveRole = "reception";
    const r = await getCashWorkspaceStateAction({});
    expect(r).toMatchObject({ ok: true, permissions: { canAdministerRegisters: false } });
  });
});

describe("API ↔ Server Actions consistentes (caso 21)", () => {
  const req = () => ({ json: async () => ({ sale_date: "2026-10-14" }) }) as never;

  it("POST /api/sales: reception crea borrador en su sucursal con DB runtime", async () => {
    const res = await createSaleRoute(req());
    expect(res.status).toBe(201);
    expect(h.svc.createSaleDraft).toHaveBeenCalledWith("tenant-A", "loc-REC", "user-REC", expect.anything(), h.RUNTIME);
  });

  it("POST /api/sales: rol LIVE trainer → 403 (misma regla que la action)", async () => {
    h.state.liveRole = "trainer";
    const res = await createSaleRoute(req());
    expect(res.status).toBe(403);
    expect(h.svc.createSaleDraft).not.toHaveBeenCalled();
  });

  it("POST /api/sales: Support Session READ_ONLY → 403", async () => {
    h.state.readOnly = true;
    const res = await createSaleRoute(req());
    expect(res.status).toBe(403);
    expect(h.svc.createSaleDraft).not.toHaveBeenCalled();
  });
});

describe("sucursal fija vigente — User.branch_id en la DB efectiva", () => {
  it.each(OPERATIONS)("%s: reception asignada a A con JWT A → permitido (caso 1)", async (_n, run, svc) => {
    expect((await run()).ok).toBe(true);
    expect(svc).toHaveBeenCalledTimes(1);
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: "user-REC", tenant_id: "tenant-A" },
      select: { branch_id: true },
    });
  });

  it.each(OPERATIONS)("%s: reception reasignada en DB a B con JWT A → denegado sin tocar datos de A (casos 2, 4, 8)", async (_n, run, svc) => {
    h.state.assignedBranch = "loc-B";
    const r = await run();
    expect(r).toMatchObject({ ok: false, error: COMMERCE_ACCESS_MESSAGES.BRANCH_REASSIGNED });
    expect(svc).not.toHaveBeenCalled();
    expect(h.getEffectiveLocationId).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s: branch_admin reasignado → denegado (caso 3)", async (_n, run, svc) => {
    h.state.jwtRole = h.state.liveRole = "branch_admin";
    h.state.assignedBranch = "loc-B";
    expect((await run()).ok).toBe(false);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s: cuenta sin sucursal asignada en DB → denegado (caso 5)", async (_n, run, svc) => {
    h.state.assignedBranch = null;
    const r = await run();
    expect(r).toMatchObject({ ok: false, error: COMMERCE_ACCESS_MESSAGES.LOCATION_REQUIRED });
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("%s: super_admin global → permitido sin consultar asignación (caso 6)", async (_n, run, svc) => {
    h.state.jwtRole = h.state.liveRole = "super_admin";
    h.state.assignedBranch = "loc-B"; // irrelevante para globales
    expect((await run()).ok).toBe(true);
    expect(svc).toHaveBeenCalledTimes(1);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rol LIVE trainer → denegado antes de consultar la asignación (caso 7)", async () => {
    h.state.liveRole = "trainer";
    expect((await openCashSessionAction({ cash_register_id: REG, opening_amount: 1 })).ok).toBe(false);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("Support Session sigue READ_ONLY antes de cualquier chequeo (caso 11)", async () => {
    h.state.jwtRole = h.state.liveRole = "super_admin";
    h.state.readOnly = true;
    expect((await createSaleDraftAction({ sale_date: "2026-10-14" })).ok).toBe(false);
    expect(h.svc.createSaleDraft).not.toHaveBeenCalled();
  });

  it("POST /api/sales: reception reasignada → 403", async () => {
    h.state.assignedBranch = "loc-B";
    const res = await createSaleRoute({ json: async () => ({ sale_date: "2026-10-14" }) } as never);
    expect(res.status).toBe(403);
    expect(h.svc.createSaleDraft).not.toHaveBeenCalled();
  });

  it("libera el PrismaClient runtime al denegar por reasignación", async () => {
    h.state.assignedBranch = "loc-B";
    await confirmSaleAction("sale-1");
    expect(h.dispose).toHaveBeenCalled();
  });
});

describe("administración de cajas con reasignación (caso 12)", () => {
  it("branch_admin reasignado → no administra cajas de la sucursal anterior", async () => {
    h.state.jwtRole = h.state.liveRole = "branch_admin";
    h.state.assignedBranch = "loc-B";
    const r = await createCashRegisterAction({ code: "CAJA-09", name: "Caja" });
    expect(r).toMatchObject({ ok: false, error: COMMERCE_ACCESS_MESSAGES.BRANCH_REASSIGNED });
    expect(h.svc.createCashRegister).not.toHaveBeenCalled();
  });

  it("reception asignada y vigente sigue SIN administrar cajas", async () => {
    await expect(createCashRegisterAction({ code: "CAJA-09", name: "Caja" })).rejects.toMatchObject({ url: "/dashboard" });
    expect(h.svc.createCashRegister).not.toHaveBeenCalled();
  });

  it("super_admin conserva la administración", async () => {
    h.state.jwtRole = h.state.liveRole = "super_admin";
    expect((await createCashRegisterAction({ code: "CAJA-09", name: "Caja" })).ok).toBe(true);
  });
});
