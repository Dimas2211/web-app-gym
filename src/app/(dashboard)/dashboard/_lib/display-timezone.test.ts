import { beforeEach, describe, expect, it, vi } from "vitest";

const cp = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({
  controlPlanePrisma: { platformOrganization: { findUnique: cp.findUnique } },
}));

import {
  DEFAULT_DISPLAY_TIME_ZONE,
  formatWelcomeDate,
  pickDisplayTimeZone,
  resolveOrganizationDisplayTimeZone,
} from "./display-timezone";

beforeEach(() => {
  cp.findUnique.mockReset();
});

describe("pickDisplayTimeZone", () => {
  it("respeta una zona IANA válida configurada", () => {
    expect(pickDisplayTimeZone("America/Guatemala")).toBe("America/Guatemala");
    expect(pickDisplayTimeZone("  America/El_Salvador ")).toBe("America/El_Salvador");
  });

  it("usa El Salvador si falta o es inválida", () => {
    for (const raw of [null, undefined, "", "   ", "Mars/Olympus"]) {
      expect(pickDisplayTimeZone(raw)).toBe(DEFAULT_DISPLAY_TIME_ZONE);
    }
  });
});

describe("formatWelcomeDate", () => {
  it("muestra el día de El Salvador aunque en UTC ya sea mañana", () => {
    // 2026-11-10 03:00 UTC = lunes 2026-11-09 21:00 en El Salvador
    const label = formatWelcomeDate(new Date("2026-11-10T03:00:00Z"), "America/El_Salvador");
    expect(label).toContain("9");
    expect(label.toLowerCase()).toContain("lunes");
    expect(label.toLowerCase()).toContain("noviembre");
  });
});

describe("resolveOrganizationDisplayTimeZone", () => {
  it("sin organización: default, sin consultar el Control Plane", async () => {
    await expect(resolveOrganizationDisplayTimeZone(null)).resolves.toBe(DEFAULT_DISPLAY_TIME_ZONE);
    expect(cp.findUnique).not.toHaveBeenCalled();
  });

  it("usa la zona de la organización", async () => {
    cp.findUnique.mockResolvedValue({ timezone: "America/Tegucigalpa" });
    await expect(resolveOrganizationDisplayTimeZone("org-1")).resolves.toBe("America/Tegucigalpa");
    expect(cp.findUnique).toHaveBeenCalledWith({ where: { id: "org-1" }, select: { timezone: true } });
  });

  it("error de lectura: default, nunca lanza", async () => {
    cp.findUnique.mockImplementation(async () => {
      throw new Error("down");
    });
    await expect(resolveOrganizationDisplayTimeZone("org-1")).resolves.toBe(DEFAULT_DISPLAY_TIME_ZONE);
  });
});
