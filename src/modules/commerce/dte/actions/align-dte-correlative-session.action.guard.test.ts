// ─────────────────────────────────────────────────────────────────
// commerce/dte — align-dte-correlative-session.action.guard.test.ts
//
// Regresión: la página /dashboard/dte/correlatives usaba
// requireGlobalAdmin pero la action usaba requireSuperAdmin (exige
// auth_scope="PLATFORM"). El administrador global de una sesión
// RUNTIME_CLIENT abría la pantalla, pulsaba Guardar y era redirigido a
// /dashboard sin escribir nada.
//
// A diferencia de align-dte-correlative-session.action.test.ts, aquí
// los guards de @/lib/permissions/guards son los REALES (solo se mockea
// la sesión de auth() y redirect de Next), y el servicio de dominio
// dte-correlative.service también es real, operando sobre un
// context.client falso — así se detecta cualquier divergencia
// página/action y se certifica la semántica "último usado" → siguiente.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  authMock,
  redirectMock,
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
} = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    authMock: vi.fn(),
    // Igual que Next: redirect() lanza y corta la ejecución.
    redirectMock: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
// La licencia runtime no es objeto de esta prueba (no-op).
vi.mock("@/modules/platform/runtime/runtime-organization-access-gate", () => ({
  enforceRuntimeOrganizationAccess: vi.fn(async () => undefined),
}));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));
// El servicio real cae a prisma global solo si no recibe `db`; si eso
// ocurriera, este spy lo delataría.
const { globalPrismaTouched } = vi.hoisted(() => ({ globalPrismaTouched: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get: () => { globalPrismaTouched(); return {}; } }),
}));

import { requireGlobalAdmin, requireSuperAdmin } from "@/lib/permissions/guards";
import { alignDteCorrelativeSessionAction } from "./align-dte-correlative-session.action";
import { getDteCorrelativeStatus } from "../services/dte-correlative.service";

const TENANT = "tenant-rec";
const LOCATION = "loc-casa-matriz";
const ISSUER_TEST = "38d7e01d-9abb-47fe-a8ec-9862b0215094";

type Scope = "PLATFORM" | "RUNTIME_CLIENT";

function setSession(role: string, auth_scope: Scope) {
  authMock.mockResolvedValue({
    user: {
      id: "leo",
      name: "Leo Montiel",
      role,
      tenant_id: TENANT,
      location_id: LOCATION,
      auth_scope,
      organization_id: auth_scope === "RUNTIME_CLIENT" ? "org-rec" : undefined,
    },
  });
}

/** context.client falso en memoria: emisor TEST + correlativo + DTE emitidos. */
function fakeRuntimeClient(opts: {
  issuer?: { id: string; cod_estable_mh: string; cod_punto_venta_mh: string } | null;
  correlative?: { last_sequence: number; external_baseline_last_used_sequence: number | null } | null;
  outgoingControlNumbers?: string[];
} = {}) {
  const issuer = opts.issuer === undefined
    ? { id: ISSUER_TEST, cod_estable_mh: "M001", cod_punto_venta_mh: "P001" }
    : opts.issuer;
  let correlative = opts.correlative ?? null;
  const outgoing = opts.outgoingControlNumbers ?? ["DTE-01-M001P001-000000000000001"];

  const issuerFindFirst = vi.fn(async () => issuer);
  const correlativeFindUnique = vi.fn(async () => correlative && {
    ...correlative,
    external_baseline_source: null,
    external_baseline_notes: null,
    external_baseline_evidence_ref: null,
    external_baseline_set_by: null,
    external_baseline_set_at: null,
  });
  const correlativeUpsert = vi.fn(async (args: {
    create: { external_baseline_last_used_sequence: number };
    update: { external_baseline_last_used_sequence: number };
  }) => {
    correlative = correlative
      ? { ...correlative, external_baseline_last_used_sequence: args.update.external_baseline_last_used_sequence }
      : { last_sequence: 0, external_baseline_last_used_sequence: args.create.external_baseline_last_used_sequence };
    return {};
  });
  const outgoingFindMany = vi.fn(async () => outgoing.map((control_number) => ({ control_number })));

  const client = {
    dteIssuerConfig: { findFirst: issuerFindFirst },
    dteCorrelative: { findUnique: correlativeFindUnique, upsert: correlativeUpsert },
    dteOutgoingDocument: { findMany: outgoingFindMany },
  };
  return { client, issuerFindFirst, correlativeUpsert };
}

function runtimeHandle(client: unknown, liveRole = "super_admin") {
  return {
    context: {
      runtimeMode: "RUNTIME_CLIENT",
      authScope: "RUNTIME_CLIENT",
      effectiveUser: { id: "leo", tenant_id: TENANT, location_id: LOCATION, role: liveRole, auth_scope: "RUNTIME_CLIENT" },
      tenantId: TENANT,
      locationId: LOCATION,
      client,
      readOnly: false,
    },
    dispose: disposeMock,
  };
}

function formData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values: Record<string, string> = {
    location_id: LOCATION,
    issuer_config_id: ISSUER_TEST,
    environment: "TEST",
    dte_type_code: "01",
    cod_estable_mh: "M001",
    cod_punto_venta_mh: "P001",
    last_used_sequence: "20000",
    source: "MH TEST",
    notes: "numeroControl 1 ya usado en MH TEST.",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guard real — paridad página/action (regresión redirect a /dashboard)", () => {
  it("la página y la action de sesión usan el mismo guard (requireGlobalAdmin); Platform Admin conserva requireSuperAdmin", () => {
    const root = process.cwd();
    const page = readFileSync(path.join(root, "src/app/(dashboard)/dashboard/dte/correlatives/page.tsx"), "utf8");
    const action = readFileSync(path.join(root, "src/modules/commerce/dte/actions/align-dte-correlative-session.action.ts"), "utf8");
    const platformAction = readFileSync(path.join(root, "src/modules/platform/actions/align-dte-correlative.action.ts"), "utf8");

    expect(page).toMatch(/await requireGlobalAdmin\(\)/);
    expect(action).toMatch(/await requireGlobalAdmin\(\)/);
    expect(action).not.toMatch(/requireSuperAdmin\(\)/);
    expect(action).not.toMatch(/import\s*\{[^}]*requireSuperAdmin/);
    expect(platformAction).toMatch(/await requireSuperAdmin\(\)/);
  });

  it("RUNTIME_CLIENT super_admin: el guard de la página pasa y requireSuperAdmin redirige (la causa original)", async () => {
    setSession("super_admin", "RUNTIME_CLIENT");
    await expect(requireGlobalAdmin()).resolves.toMatchObject({ id: "leo", auth_scope: "RUNTIME_CLIENT" });
    await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});

describe("alignDteCorrelativeSessionAction — guard real", () => {
  it("administrador global RUNTIME_CLIENT: guarda vía context.client, sin redirect, y next_sequence = 20001", async () => {
    setSession("super_admin", "RUNTIME_CLIENT");
    const { client, issuerFindFirst, correlativeUpsert } = fakeRuntimeClient();
    requireOperationalContextMock.mockResolvedValue(runtimeHandle(client));

    const result = await alignDteCorrelativeSessionAction(undefined, formData());

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, next_sequence: 20001 });
    expect(requireOperationalContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ auth_scope: "RUNTIME_CLIENT" }),
      { module: "fiscal.dte", write: true },
    );
    expect(issuerFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ISSUER_TEST, tenant_id: TENANT, location_id: LOCATION, environment: "TEST" },
    }));
    expect(correlativeUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = correlativeUpsert.mock.calls[0][0] as unknown as {
      where: { tenant_id_location_id_issuer_config_id_environment_dte_type_code_year: Record<string, unknown> };
      update: Record<string, unknown>;
    };
    expect(upsertArgs.where.tenant_id_location_id_issuer_config_id_environment_dte_type_code_year).toMatchObject({
      tenant_id: TENANT, location_id: LOCATION, issuer_config_id: ISSUER_TEST, environment: "TEST", dte_type_code: "01",
    });
    expect(upsertArgs.update).toMatchObject({ external_baseline_last_used_sequence: 20000, external_baseline_set_by: "leo" });
    expect(globalPrismaTouched).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("rol LIVE sin isGlobal aunque el JWT conserve super_admin: no escribe y devuelve error de permisos", async () => {
    setSession("super_admin", "RUNTIME_CLIENT");
    const { client, issuerFindFirst, correlativeUpsert } = fakeRuntimeClient();
    requireOperationalContextMock.mockResolvedValue(runtimeHandle(client, "branch_admin"));

    const result = await alignDteCorrelativeSessionAction(undefined, formData());

    expect(result).toEqual({ error: "Sin permisos para alinear correlativos DTE." });
    expect(issuerFindFirst).not.toHaveBeenCalled();
    expect(correlativeUpsert).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("Support Session de solo lectura (PLATFORM super_admin): bloqueada con READ_ONLY antes de tocar la DB", async () => {
    setSession("super_admin", "PLATFORM");
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await alignDteCorrelativeSessionAction(undefined, formData());

    expect(result).toEqual({ error: "Modo runtime read-only activo." });
  });

  it.each<Scope>(["RUNTIME_CLIENT", "PLATFORM"])("branch_admin (%s): el guard real redirige y nunca resuelve contexto ni escribe", async (scope) => {
    setSession("branch_admin", scope);

    await expect(alignDteCorrelativeSessionAction(undefined, formData())).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
  });

  it("emisor ajeno al tenant/sucursal/ambiente (no aparece en context.client): rechazado sin escribir", async () => {
    setSession("super_admin", "RUNTIME_CLIENT");
    const { client, correlativeUpsert } = fakeRuntimeClient({ issuer: null });
    requireOperationalContextMock.mockResolvedValue(runtimeHandle(client));

    const result = await alignDteCorrelativeSessionAction(undefined, formData({ environment: "PRODUCTION" }));

    expect(result).toMatchObject({ error: expect.stringContaining("no corresponde") });
    expect(correlativeUpsert).not.toHaveBeenCalled();
  });

  it("restricción de alineación conservada: no puede retroceder por debajo de lo ya usado localmente", async () => {
    setSession("super_admin", "RUNTIME_CLIENT");
    const { client, correlativeUpsert } = fakeRuntimeClient({ correlative: { last_sequence: 1, external_baseline_last_used_sequence: null } });
    requireOperationalContextMock.mockResolvedValue(runtimeHandle(client));

    const result = await alignDteCorrelativeSessionAction(undefined, formData({ last_used_sequence: "0" }));

    expect(result).toMatchObject({ error: expect.stringContaining("nunca retrocederlo") });
    expect(correlativeUpsert).not.toHaveBeenCalled();
  });
});

describe("semántica — 'último usado' → siguiente a emitir", () => {
  const params = {
    tenant_id: TENANT, location_id: LOCATION, issuer_config_id: ISSUER_TEST, environment: "TEST" as const,
    dte_type_code: "01", cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
  };

  it("baseline 20000 con interno 1 y emitido máximo 1 -> siguiente 20001 (DTE-01-M001P001-000000000020001)", async () => {
    const { client } = fakeRuntimeClient({ correlative: { last_sequence: 1, external_baseline_last_used_sequence: 20000 } });
    const status = await getDteCorrelativeStatus(params, client as never);
    expect(status.next_sequence).toBe(20001);
  });

  it("si ya existe una secuencia mayor emitida, manda la mayor (+1)", async () => {
    const { client } = fakeRuntimeClient({
      correlative: { last_sequence: 1, external_baseline_last_used_sequence: 20000 },
      outgoingControlNumbers: ["DTE-01-M001P001-000000000020050"],
    });
    const status = await getDteCorrelativeStatus(params, client as never);
    expect(status.next_sequence).toBe(20051);
  });
});
