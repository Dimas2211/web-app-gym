// GYM-5D — tarjeta "Analítica de entrenamiento" en el índice de Reportes:
// solo super_admin / branch_admin, vertical GYM y módulo gym.weekly_plans.
// La página vuelve a autorizar por su cuenta (rol LIVE); esto es navegación.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const h = vi.hoisted(() => ({
  role: "super_admin" as string,
  modules: new Set<string>(["gym.weekly_plans"]),
  vertical: "GYM" as string | null,
  requested: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/permissions/guards", () => ({
  getSessionOrRedirect: async () => ({ id: "u1", role: h.role, tenant_id: "t1", location_id: "b1" }),
}));
vi.mock("@/modules/platform/runtime/resolve-effective-dashboard-context", () => ({
  resolveEffectiveDashboardContext: async (_u: unknown, codes: string[]) => {
    h.requested = codes;
    return {
      context: {
        tenantId: "t1",
        verticalCode: h.vertical,
        isLegacyUnmanaged: false,
        enabledModuleCodes: new Set(codes.filter((c) => h.modules.has(c))),
      },
      dispose: async () => {},
    };
  },
}));

import ReportsPage from "./page";

const render = async () => renderToStaticMarkup((await ReportsPage()) as ReactElement);
const card = (html: string) => /<a href="\/dashboard\/reports\/training-analytics">(.*?)<\/a>/.exec(html)?.[1] ?? null;

describe("Índice de Reportes — Analítica de entrenamiento (GYM-5D)", () => {
  beforeEach(() => {
    h.role = "super_admin";
    h.modules = new Set(["gym.weekly_plans"]);
    h.vertical = "GYM";
  });

  it("super_admin y branch_admin la ven con gym.weekly_plans; sin iconos de exportación", async () => {
    for (const role of ["super_admin", "branch_admin"]) {
      h.role = role;
      const html = await render();
      expect(card(html)).toContain("Analítica de entrenamiento");
      expect(card(html)).not.toContain("XLSX");
    }
    expect(h.requested).toContain("gym.weekly_plans");
  });

  it("recepción no la ve (conserva sus reportes)", async () => {
    h.role = "reception";
    const html = await render();
    expect(card(html)).toBeNull();
    expect(html).toContain("Por período");
  });

  it("oculta con gym.weekly_plans deshabilitado o sin vertical GYM; el resto del índice no cambia", async () => {
    h.modules = new Set();
    const off = await render();
    expect(card(off)).toBeNull();
    expect(off).toContain("Clases impartidas");
    h.modules = new Set(["gym.weekly_plans"]);
    h.vertical = null;
    expect(card(await render())).toBeNull();
  });
});
