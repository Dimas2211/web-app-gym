// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-organization-access-gate.test.tsx
//
// RUNTIME LICENSE ENFORCEMENT — gate de UX (layouts / guards) y página
// /access-restricted. La licencia se lee EN VIVO de Control Plane en
// cada request — nunca del JWT.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`NEXT_REDIRECT:${url}`);
    }
  }
  return {
    RedirectSignal,
    findUniqueMock: vi.fn(),
    session: { current: null as null | { user: Record<string, unknown> } },
  };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url);
  },
}));
vi.mock("./control-plane-prisma", () => ({
  controlPlanePrisma: { platformOrganization: { findUnique: h.findUniqueMock } },
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: async () => h.session.current,
  signOut: vi.fn(),
}));
vi.mock("@/components/ui/portal-nav-bar", () => ({ PortalNavBar: () => <nav>PORTAL_NAV</nav> }));
vi.mock("@/components/ui/zolvi-logo", () => ({
  ZolviLogo: () => <span>LOGO</span>,
  ZolviMark: () => <span>MARK</span>,
  ZOLVI_BRAND: { footer: "Zolvi" },
}));

import { enforceRuntimeOrganizationAccess, ACCESS_RESTRICTED_PATH } from "./runtime-organization-access-gate";
import PortalLayout from "@/app/(portal)/layout";
import AccessRestrictedPage from "@/app/access-restricted/page";

const RUNTIME_CLIENT_USER = {
  id: "c1",
  name: "Cliente Final",
  role: "client",
  auth_scope: "RUNTIME_CLIENT",
  organization_id: "org-1",
};

const ORG_ROW = {
  status: "ACTIVE",
  license_status: "TRIAL",
  billing_cycle: "MONTHLY",
  trial_ends_at: new Date("2099-12-31"),
  license_expires_at: null,
  timezone: "America/El_Salvador",
};

async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    if (err instanceof h.RedirectSignal) return err.url;
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  h.session.current = { user: RUNTIME_CLIENT_USER };
});

describe("enforceRuntimeOrganizationAccess", () => {
  it("licencia válida → no redirige", async () => {
    h.findUniqueMock.mockResolvedValue(ORG_ROW);
    expect(await redirectOf(enforceRuntimeOrganizationAccess(RUNTIME_CLIENT_USER))).toBeNull();
    expect(h.findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-1" } }),
    );
  });

  it("trial vencido → /access-restricted", async () => {
    h.findUniqueMock.mockResolvedValue({ ...ORG_ROW, trial_ends_at: new Date("2020-01-01") });
    expect(await redirectOf(enforceRuntimeOrganizationAccess(RUNTIME_CLIENT_USER))).toBe(
      ACCESS_RESTRICTED_PATH,
    );
  });

  it("licencia SUSPENDED explícita → /access-restricted", async () => {
    h.findUniqueMock.mockResolvedValue({ ...ORG_ROW, license_status: "SUSPENDED" });
    expect(await redirectOf(enforceRuntimeOrganizationAccess(RUNTIME_CLIENT_USER))).toBe(
      ACCESS_RESTRICTED_PATH,
    );
  });

  it("cambio de licencia surte efecto en el siguiente request (lectura live, mismo JWT)", async () => {
    h.findUniqueMock.mockResolvedValueOnce(ORG_ROW);
    expect(await redirectOf(enforceRuntimeOrganizationAccess(RUNTIME_CLIENT_USER))).toBeNull();
    h.findUniqueMock.mockResolvedValueOnce({ ...ORG_ROW, license_status: "SUSPENDED" });
    expect(await redirectOf(enforceRuntimeOrganizationAccess(RUNTIME_CLIENT_USER))).toBe(
      ACCESS_RESTRICTED_PATH,
    );
    h.findUniqueMock.mockResolvedValueOnce(ORG_ROW); // reactivada
    expect(await redirectOf(enforceRuntimeOrganizationAccess(RUNTIME_CLIENT_USER))).toBeNull();
  });

  it("PLATFORM (nativo o Support Session) nunca se bloquea ni consulta licencia", async () => {
    expect(
      await redirectOf(enforceRuntimeOrganizationAccess({ auth_scope: "PLATFORM", organization_id: "org-1" })),
    ).toBeNull();
    expect(await redirectOf(enforceRuntimeOrganizationAccess({ auth_scope: undefined }))).toBeNull();
    expect(h.findUniqueMock).not.toHaveBeenCalled();
  });
});

describe("Portal layout — los clientes finales no se saltan la licencia", () => {
  it("RUNTIME_CLIENT client con licencia válida entra al portal", async () => {
    h.findUniqueMock.mockResolvedValue(ORG_ROW);
    const html = renderToStaticMarkup(await PortalLayout({ children: <p>PORTAL_CONTENT</p> }));
    expect(html).toContain("PORTAL_CONTENT");
  });

  it("licencia bloqueada → /access-restricted (no renderiza el portal)", async () => {
    h.findUniqueMock.mockResolvedValue({ ...ORG_ROW, license_status: "EXPIRED" });
    expect(await redirectOf(PortalLayout({ children: <p>PORTAL_CONTENT</p> }))).toBe(
      ACCESS_RESTRICTED_PATH,
    );
  });
});

describe("/access-restricted", () => {
  it("muestra el mensaje según el motivo recalculado en vivo + opción Salir", async () => {
    h.findUniqueMock.mockResolvedValue({ ...ORG_ROW, trial_ends_at: new Date("2020-01-01") });
    const html = renderToStaticMarkup(await AccessRestrictedPage());
    expect(html).toContain("Tu período de prueba ha finalizado. Contacta a Zolvi para continuar.");
    expect(html).toContain("Salir");
    expect(html).not.toContain("org-1");
  });

  it("acceso restaurado → vuelve a su home sin re-login", async () => {
    h.findUniqueMock.mockResolvedValue(ORG_ROW);
    expect(await redirectOf(AccessRestrictedPage())).toBe("/portal");
  });

  it("identidad PLATFORM → su home (el bloqueo nunca aplica a soporte)", async () => {
    h.session.current = { user: { role: "super_admin", auth_scope: "PLATFORM" } };
    expect(await redirectOf(AccessRestrictedPage())).toBe("/dashboard");
  });

  it("sin sesión → /login", async () => {
    h.session.current = null;
    expect(await redirectOf(AccessRestrictedPage())).toBe("/login");
  });
});
