// ─────────────────────────────────────────────────────────────────
// settings — settings-runtime-access.test.tsx
//
// RUNTIME LICENSE ENFORCEMENT + SETTINGS ACCESS — matriz de acceso de
// /dashboard/settings/** por identidad:
//
//   PLATFORM super_admin       → gym/codes editables; sports/goals gestión.
//   RUNTIME_CLIENT super_admin → gym/codes editables contra runtime DB
//                                (rol LIVE); sports/goals SOLO LECTURA.
//   SUPPORT_RUNTIME            → writes bloqueados (READ_ONLY).
//   RUNTIME_CLIENT degradado   → pierde edición aunque el JWT diga super_admin.
//
// Los guards reales (requireGlobalAdmin / requireSuperAdmin) se ejecutan
// contra una sesión mockeada — así se certifica que Sports/Goals siguen
// Platform-only por URL/action directa.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const h = vi.hoisted(() => {
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
  class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`NEXT_REDIRECT:${url}`);
    }
  }
  return {
    FakeOperationalContextError,
    RedirectSignal,
    session: { current: null as null | { user: Record<string, unknown> } },
    opCtx: {
      current: null as null | {
        runtimeMode: "PLATFORM_NATIVE" | "SUPPORT_RUNTIME" | "RUNTIME_CLIENT";
        readOnly: boolean;
        liveRole: string;
        tenantId: string;
        gymId: string | null;
        client: Record<string, unknown>;
      },
    },
    requireOperationalContextMock: vi.fn(),
    resolveEffectiveTenantContextMock: vi.fn(),
    disposeMock: vi.fn(async () => {}),
    getGymMock: vi.fn(),
    getGymSettingsMock: vi.fn(),
    getSportsMock: vi.fn(),
    getGoalsMock: vi.fn(),
    suggestStaffMock: vi.fn(async () => "A1010"),
    suggestClientMock: vi.fn(async () => "C1010"),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/auth", () => ({ auth: async () => h.session.current }));
vi.mock("@/modules/platform/runtime/runtime-organization-access-gate", () => ({
  enforceRuntimeOrganizationAccess: vi.fn(async () => {}),
}));
// LIVE-3: el envoltorio de identidad vigente delega en el mock de arriba; la identidad
// (usuario activo, tenant, rol y sede vigentes) se certifica con el contexto real en
// src/modules/classes/certification/live-*.integration.test.ts.
vi.mock("@/modules/platform/runtime/require-live-operational-context", async () => {
  const ctx = await import("@/modules/platform/runtime/require-operational-context");
  return { requireLiveOperationalContext: (...args: Parameters<typeof ctx.requireOperationalContext>) => ctx.requireOperationalContext(...args) };
});
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: h.requireOperationalContextMock,
  OperationalContextError: h.FakeOperationalContextError,
}));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: h.resolveEffectiveTenantContextMock,
}));
vi.mock("@/modules/platform/runtime/effective-vertical", () => ({
  requireEffectiveVertical: vi.fn(async () => {}),
}));
vi.mock("@/modules/settings/queries", () => ({
  getGym: h.getGymMock,
  getGymSettings: h.getGymSettingsMock,
  getSports: h.getSportsMock,
  getGoals: h.getGoalsMock,
  getSportById: vi.fn(async () => ({ id: "sport-1", name: "Box" })),
  getGoalById: vi.fn(async () => ({ id: "goal-1", name: "Fuerza" })),
}));
vi.mock("@/lib/utils/operational-codes", () => ({
  suggestNextStaffCode: h.suggestStaffMock,
  suggestNextClientCode: h.suggestClientMock,
  generateQrToken: () => "qr",
}));
vi.mock("@/components/forms/gym-form", () => ({ GymForm: () => <div>GYM_FORM</div> }));
vi.mock("@/components/forms/gym-settings-form", () => ({
  GymSettingsForm: () => <div>CODES_FORM</div>,
}));
vi.mock("@/components/forms/sport-form", () => ({ SportForm: () => <div>SPORT_FORM</div> }));
vi.mock("@/components/forms/goal-form", () => ({ GoalForm: () => <div>GOAL_FORM</div> }));
vi.mock("@/core/security/operational-authorization/supervisor-pin", () => ({
  getSupervisorPinStatus: vi.fn(async () => ({ configured: true, updatedAt: null })),
  SUPERVISOR_PIN_MIN_LENGTH: 4,
  SUPERVISOR_PIN_MAX_LENGTH: 8,
}));
vi.mock(
  "@/core/security/operational-authorization/components/supervisor-pin-settings-form",
  () => ({
    SupervisorPinSettingsForm: ({ readOnly }: { readOnly: boolean }) => (
      <div>{readOnly ? "PIN_FORM_READONLY" : "PIN_FORM_EDITABLE"}</div>
    ),
  }),
);

import GymSettingsPage from "@/app/(dashboard)/dashboard/settings/gym/page";
import CodesSettingsPage from "@/app/(dashboard)/dashboard/settings/codes/page";
import SportsPage from "@/app/(dashboard)/dashboard/settings/sports/page";
import GoalsPage from "@/app/(dashboard)/dashboard/settings/goals/page";
import NewSportPage from "@/app/(dashboard)/dashboard/settings/sports/new/page";
import EditSportPage from "@/app/(dashboard)/dashboard/settings/sports/[id]/edit/page";
import NewGoalPage from "@/app/(dashboard)/dashboard/settings/goals/new/page";
import EditGoalPage from "@/app/(dashboard)/dashboard/settings/goals/[id]/edit/page";
import SecuritySettingsPage from "@/app/(dashboard)/dashboard/settings/security/page";
import {
  updateGymAction,
  updateGymSettingsAction,
  createSportAction,
  updateSportAction,
  toggleSportStatusAction,
  createGoalAction,
  updateGoalAction,
  toggleGoalStatusAction,
} from "./actions";

// ── Identidades ────────────────────────────────────────────────────

const PLATFORM_SA = {
  id: "plat-1",
  name: "Plat",
  role: "super_admin",
  tenant_id: "tenant-platform",
  location_id: null,
  auth_scope: "PLATFORM",
};
const RUNTIME_SA = {
  id: "rt-1",
  name: "Runtime",
  role: "super_admin",
  tenant_id: "tenant-runtime",
  location_id: null,
  auth_scope: "RUNTIME_CLIENT",
  organization_id: "org-1",
};

function fakeDb(label: string) {
  return {
    label,
    gym: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    gymSettings: { upsert: vi.fn(async () => ({})) },
    sport: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    goal: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
}

type Mode = "PLATFORM_NATIVE" | "SUPPORT_RUNTIME" | "RUNTIME_CLIENT";

function as(user: Record<string, unknown>, mode: Mode, liveRole = "super_admin") {
  const db = fakeDb(mode);
  h.session.current = { user };
  h.opCtx.current = {
    runtimeMode: mode,
    readOnly: mode === "SUPPORT_RUNTIME",
    liveRole,
    tenantId: mode === "PLATFORM_NATIVE" ? "tenant-platform" : "tenant-runtime",
    gymId: mode === "PLATFORM_NATIVE" ? "gym-platform" : "gym-runtime",
    client: db,
  };
  return db;
}

async function render(el: Promise<ReactElement> | ReactElement): Promise<string> {
  return renderToStaticMarkup(await el);
}

async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    if (err instanceof h.RedirectSignal) return err.url;
    throw err;
  }
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const GYM_FORM_DATA = { name: "Mi Gym", slug: "mi-gym" };
const CODES_FORM_DATA = {
  staff_code_prefix: "A",
  staff_code_digits: "4",
  staff_code_start: "1010",
  client_code_prefix: "C",
  client_code_digits: "4",
  client_code_start: "1010",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireOperationalContextMock.mockImplementation(
    async (_user: unknown, opts: { write?: boolean } = {}) => {
      const c = h.opCtx.current!;
      if (opts.write && c.readOnly) {
        throw new h.FakeOperationalContextError("READ_ONLY", "Solo lectura.", 403);
      }
      return {
        context: {
          runtimeMode: c.runtimeMode,
          readOnly: c.readOnly,
          effectiveUser: { id: "x", role: c.liveRole, tenant_id: c.tenantId, location_id: null },
          tenantId: c.tenantId,
          gymId: c.gymId,
          locationId: null,
          client: c.client,
        },
        dispose: h.disposeMock,
      };
    },
  );
  h.resolveEffectiveTenantContextMock.mockImplementation(async () => {
    const c = h.opCtx.current!;
    return {
      context: {
        tenantId: c.tenantId,
        client: c.client,
        runtime: c.runtimeMode === "SUPPORT_RUNTIME" ? { readOnly: true } : null,
        locationId: null,
        runtimeMode: c.runtimeMode,
        readOnly: c.readOnly,
        effectiveRole: c.liveRole,
      },
      dispose: h.disposeMock,
    };
  });
  h.getGymMock.mockResolvedValue({ id: "gym", name: "Mi Gym", slug: "mi-gym" });
  h.getGymSettingsMock.mockResolvedValue({ staff_code_prefix: "A" });
  h.getSportsMock.mockResolvedValue([
    {
      id: "sport-1",
      name: "Box",
      description: null,
      status: "active",
      _count: { clients: 0, weekly_plan_templates: 0 },
    },
  ]);
  h.getGoalsMock.mockResolvedValue([
    {
      id: "goal-1",
      name: "Fuerza",
      description: null,
      status: "active",
      _count: { clients: 0, weekly_plan_templates: 0 },
    },
  ]);
});

// ── 1. PLATFORM super_admin ────────────────────────────────────────

describe("1. PLATFORM super_admin — Datos del gimnasio", () => {
  it("página accesible y acción edita el gym efectivo", async () => {
    const db = as(PLATFORM_SA, "PLATFORM_NATIVE");
    expect(await render(GymSettingsPage())).toContain("GYM_FORM");

    const url = await redirectOf(updateGymAction(undefined, fd(GYM_FORM_DATA)));
    expect(url).toBe("/dashboard/settings/gym");
    expect(db.gym.update).toHaveBeenCalledWith({
      where: { id: "gym-platform" },
      data: expect.objectContaining({ name: "Mi Gym", slug: "mi-gym" }),
    });
  });

  it("sports: conserva gestión (Nuevo / Editar / Desactivar)", async () => {
    as(PLATFORM_SA, "PLATFORM_NATIVE");
    const html = await render(SportsPage());
    expect(html).toContain("/dashboard/settings/sports/new");
    expect(html).toContain("Editar");
    expect(html).toContain("Desactivar");
    expect(html).not.toContain("Catálogo global administrado por Zolvi");
  });
});

// ── 2/3. RUNTIME_CLIENT super_admin (rol LIVE) ─────────────────────

describe("2. RUNTIME_CLIENT super_admin — Datos del gimnasio contra runtime DB", () => {
  it("página accesible (no redirige al dashboard)", async () => {
    as(RUNTIME_SA, "RUNTIME_CLIENT");
    const html = await render(GymSettingsPage());
    expect(html).toContain("GYM_FORM");
    expect(h.getGymMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-runtime" }),
      expect.objectContaining({ label: "RUNTIME_CLIENT" }),
    );
  });

  it("updateGymAction escribe sobre el client runtime, gym efectivo", async () => {
    const db = as(RUNTIME_SA, "RUNTIME_CLIENT");
    const url = await redirectOf(updateGymAction(undefined, fd(GYM_FORM_DATA)));
    expect(url).toBe("/dashboard/settings/gym");
    expect(h.requireOperationalContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ auth_scope: "RUNTIME_CLIENT" }),
      { write: true },
    );
    expect(db.gym.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gym-runtime" } }),
    );
    expect(h.disposeMock).toHaveBeenCalled();
  });
});

describe("3. RUNTIME_CLIENT super_admin — Códigos operativos contra runtime DB", () => {
  it("página accesible y sugerencias calculadas sobre el client runtime", async () => {
    const db = as(RUNTIME_SA, "RUNTIME_CLIENT");
    expect(await render(CodesSettingsPage())).toContain("CODES_FORM");
    expect(h.suggestStaffMock).toHaveBeenCalledWith("tenant-runtime", db);
    expect(h.suggestClientMock).toHaveBeenCalledWith("tenant-runtime", db);
    expect(h.getGymSettingsMock).toHaveBeenCalledWith("tenant-runtime", db);
  });

  it("updateGymSettingsAction hace upsert en runtime DB por gymId efectivo", async () => {
    const db = as(RUNTIME_SA, "RUNTIME_CLIENT");
    const url = await redirectOf(updateGymSettingsAction(undefined, fd(CODES_FORM_DATA)));
    expect(url).toBe("/dashboard/settings/codes");
    expect(db.gymSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gym_id: "gym-runtime" } }),
    );
  });
});

// ── 4. SUPPORT_RUNTIME ─────────────────────────────────────────────

describe("4. SUPPORT_RUNTIME — gym/codes write bloqueado", () => {
  it("updateGymAction → READ_ONLY sin escribir", async () => {
    const db = as(PLATFORM_SA, "SUPPORT_RUNTIME");
    const result = await updateGymAction(undefined, fd(GYM_FORM_DATA));
    expect(result).toEqual({ error: "Solo lectura." });
    expect(db.gym.update).not.toHaveBeenCalled();
  });

  it("updateGymSettingsAction → READ_ONLY sin escribir", async () => {
    const db = as(PLATFORM_SA, "SUPPORT_RUNTIME");
    const result = await updateGymSettingsAction(undefined, fd(CODES_FORM_DATA));
    expect(result).toEqual({ error: "Solo lectura." });
    expect(db.gymSettings.upsert).not.toHaveBeenCalled();
  });

  it("páginas gym/codes redirigen a /dashboard/settings (comportamiento previo)", async () => {
    as(PLATFORM_SA, "SUPPORT_RUNTIME");
    expect(await redirectOf(GymSettingsPage())).toBe("/dashboard/settings");
    expect(await redirectOf(CodesSettingsPage())).toBe("/dashboard/settings");
    expect(h.getGymMock).not.toHaveBeenCalled();
    expect(h.suggestStaffMock).not.toHaveBeenCalled();
  });

  it("sports bajo Support Session: solo lectura, sin controles de gestión", async () => {
    as(PLATFORM_SA, "SUPPORT_RUNTIME");
    const html = await render(SportsPage());
    expect(html).not.toContain("/dashboard/settings/sports/new");
    expect(html).toContain("Solo lectura");
  });
});

// ── 5/6. Sports / Goals read-only para RUNTIME_CLIENT ──────────────

describe("5/6. RUNTIME_CLIENT — Sports/Goals visibles en solo lectura", () => {
  for (const [label, Page, base] of [
    ["sports", SportsPage, "/dashboard/settings/sports"],
    ["goals", GoalsPage, "/dashboard/settings/goals"],
  ] as const) {
    it(`${label}: abre la página, muestra aviso y oculta Nuevo/Editar/Activar/Desactivar`, async () => {
      as(RUNTIME_SA, "RUNTIME_CLIENT");
      const html = await render(Page());
      expect(html).toContain("Catálogo global administrado por Zolvi. Disponible en modo solo lectura.");
      expect(html).not.toContain(`${base}/new`);
      expect(html).not.toContain("/edit");
      expect(html).not.toContain("Editar");
      expect(html).not.toContain("Desactivar");
      expect(html).not.toContain(">Activar<");
      expect(html).toContain("Solo lectura");
    });
  }
});

// ── 7. Writes Sports/Goals inalcanzables para RUNTIME_CLIENT ───────

describe("7. RUNTIME_CLIENT no alcanza writes de Sports/Goals (URL ni action directa)", () => {
  it("rutas new/edit redirigen al dashboard (requireSuperAdmin, Platform-only)", async () => {
    as(RUNTIME_SA, "RUNTIME_CLIENT");
    const params = Promise.resolve({ id: "x" });
    expect(await redirectOf(NewSportPage())).toBe("/dashboard");
    expect(await redirectOf(EditSportPage({ params }))).toBe("/dashboard");
    expect(await redirectOf(NewGoalPage())).toBe("/dashboard");
    expect(await redirectOf(EditGoalPage({ params }))).toBe("/dashboard");
    expect(h.resolveEffectiveTenantContextMock).not.toHaveBeenCalled();
  });

  it("server actions de sports/goals redirigen sin abrir contexto ni escribir", async () => {
    const db = as(RUNTIME_SA, "RUNTIME_CLIENT");
    const form = fd({ id: "sport-1", name: "Nuevo", description: "" });
    expect(await redirectOf(createSportAction(undefined, form))).toBe("/dashboard");
    expect(await redirectOf(updateSportAction(undefined, form))).toBe("/dashboard");
    expect(await redirectOf(toggleSportStatusAction(form))).toBe("/dashboard");
    expect(await redirectOf(createGoalAction(undefined, form))).toBe("/dashboard");
    expect(await redirectOf(updateGoalAction(undefined, form))).toBe("/dashboard");
    expect(await redirectOf(toggleGoalStatusAction(form))).toBe("/dashboard");
    expect(h.requireOperationalContextMock).not.toHaveBeenCalled();
    for (const m of [db.sport.create, db.sport.update, db.goal.create, db.goal.update]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});

// ── 8. Seguridad sin cambios ───────────────────────────────────────

describe("8. Seguridad mantiene comportamiento", () => {
  it("RUNTIME_CLIENT super_admin: editable", async () => {
    as(RUNTIME_SA, "RUNTIME_CLIENT");
    expect(await render(SecuritySettingsPage())).toContain("PIN_FORM_EDITABLE");
  });

  it("Support Session: solo lectura", async () => {
    as(PLATFORM_SA, "SUPPORT_RUNTIME");
    expect(await render(SecuritySettingsPage())).toContain("PIN_FORM_READONLY");
  });
});

// ── 9. Rol LIVE degradado ──────────────────────────────────────────

describe("9. RUNTIME_CLIENT con JWT super_admin pero rol LIVE degradado", () => {
  it("gym/codes: páginas redirigen al dashboard", async () => {
    as(RUNTIME_SA, "RUNTIME_CLIENT", "reception");
    expect(await redirectOf(GymSettingsPage())).toBe("/dashboard");
    expect(await redirectOf(CodesSettingsPage())).toBe("/dashboard");
    expect(h.getGymMock).not.toHaveBeenCalled();
  });

  it("gym/codes: actions niegan sin escribir y cierran el contexto", async () => {
    const db = as(RUNTIME_SA, "RUNTIME_CLIENT", "branch_admin");
    expect(await updateGymAction(undefined, fd(GYM_FORM_DATA))).toEqual({
      error: "Sin permisos para esta operación.",
    });
    expect(await updateGymSettingsAction(undefined, fd(CODES_FORM_DATA))).toEqual({
      error: "Sin permisos para esta operación.",
    });
    expect(db.gym.update).not.toHaveBeenCalled();
    expect(db.gymSettings.upsert).not.toHaveBeenCalled();
    expect(h.disposeMock).toHaveBeenCalledTimes(2);
  });

  it("sports: tampoco conserva lectura administrativa", async () => {
    as(RUNTIME_SA, "RUNTIME_CLIENT", "reception");
    expect(await redirectOf(SportsPage())).toBe("/dashboard");
  });
});

// ── Post-auditoría: counts cross-tenant ────────────────────────────

describe("Sports/Goals — counts globales (cross-tenant) solo para Platform Admin nativo", () => {
  const SENTINEL_ROW = (id: string, name: string) => ({
    id,
    name,
    description: null,
    status: "active",
    _count: { clients: 987, weekly_plan_templates: 654 },
  });

  beforeEach(() => {
    h.getSportsMock.mockResolvedValue([SENTINEL_ROW("sport-1", "Box")]);
    h.getGoalsMock.mockResolvedValue([SENTINEL_ROW("goal-1", "Fuerza")]);
  });

  for (const [label, Page] of [
    ["sports", SportsPage],
    ["goals", GoalsPage],
  ] as const) {
    it(`${label} PLATFORM_NATIVE: columnas y valores visibles`, async () => {
      as(PLATFORM_SA, "PLATFORM_NATIVE");
      const html = await render(Page());
      expect(html).toContain("Clientes");
      expect(html).toContain("Plantillas");
      expect(html).toContain("987");
      expect(html).toContain("654");
    });

    it(`${label} RUNTIME_CLIENT: sin columnas ni valores sentinel en el HTML`, async () => {
      as(RUNTIME_SA, "RUNTIME_CLIENT");
      const html = await render(Page());
      expect(html).not.toContain("Clientes");
      expect(html).not.toContain("Plantillas");
      expect(html).not.toContain("987");
      expect(html).not.toContain("654");
      expect(html).toContain("Catálogo global administrado por Zolvi. Disponible en modo solo lectura.");
    });

    it(`${label} SUPPORT_RUNTIME: sin columnas ni valores sentinel en el HTML`, async () => {
      as(PLATFORM_SA, "SUPPORT_RUNTIME");
      const html = await render(Page());
      expect(html).not.toContain("Clientes");
      expect(html).not.toContain("Plantillas");
      expect(html).not.toContain("987");
      expect(html).not.toContain("654");
    });
  }
});
