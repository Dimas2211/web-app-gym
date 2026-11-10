import { describe, expect, it } from "vitest";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "@/lib/navigation/dashboard-nav";
import { QUICK_ACTIONS, getVisibleQuickActions } from "@/lib/navigation/dashboard-quick-actions";
import type { UserRole } from "@prisma/client";

const ALL_CODES = new Set(
  MODULE_GROUPS.flatMap((g) => g.items.map((i) => i.moduleCode).filter((c): c is string => Boolean(c))),
);

function actionsFor(role: UserRole, codes: Set<string>, vertical: string | null, readOnly = false) {
  const groups = filterModuleGroupsByAccess(MODULE_GROUPS, role, codes, vertical, false, false);
  return getVisibleQuickActions(groups, { readOnly }).map((a) => a.label);
}

describe("getVisibleQuickActions", () => {
  it("super_admin de un GYM con todos los módulos ve todas las acciones", () => {
    expect(actionsFor("super_admin", ALL_CODES, "GYM")).toEqual([
      "Nueva venta",
      "Nuevo socio",
      "Caja",
      "Nueva compra",
      "Agenda y asistencia",
    ]);
  });

  it("recepción no ve Nueva compra (compras es solo SA/BA)", () => {
    expect(actionsFor("reception", ALL_CODES, "GYM")).toEqual([
      "Nueva venta",
      "Nuevo socio",
      "Caja",
      "Agenda y asistencia",
    ]);
  });

  it("entrenador solo ve la agenda", () => {
    expect(actionsFor("trainer", ALL_CODES, "GYM")).toEqual(["Agenda y asistencia"]);
  });

  it("organización Commerce-only no ve acciones GYM", () => {
    const commerceCodes = new Set([...ALL_CODES].filter((c) => !c.startsWith("gym.")));
    expect(actionsFor("super_admin", commerceCodes, null)).toEqual(["Nueva venta", "Caja", "Nueva compra"]);
  });

  it("un módulo no contratado oculta su acción", () => {
    const codes = new Set([...ALL_CODES].filter((c) => c !== "commerce.sales"));
    expect(actionsFor("super_admin", codes, "GYM")).not.toContain("Nueva venta");
  });

  it("cliente del portal no ve acciones", () => {
    expect(actionsFor("client", ALL_CODES, "GYM")).toEqual([]);
  });

  it("Support Session (solo lectura) no anuncia acciones de captura", () => {
    expect(actionsFor("super_admin", ALL_CODES, "GYM", true)).toEqual(["Caja", "Agenda y asistencia"]);
  });

  it("cada acción de captura apunta a una ruta /new", () => {
    for (const a of QUICK_ACTIONS) expect(a.writes).toBe(a.href.endsWith("/new"));
  });
});
