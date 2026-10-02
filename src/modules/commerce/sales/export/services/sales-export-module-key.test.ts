// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — sales-export-module-key.test.ts
//
// Guarda panel ↔ gate: la clave que Platform Admin permite habilitar
// para FEX 11 debe ser exactamente la que valida /dashboard/sales/export
// y /dashboard/sales/new (resolveSalesExportAvailability). Falla si el
// panel ofrece una clave que ningún guard lee (p. ej. la retirada
// fiscal.dte.export) o si el gate pasa a validar una clave que el panel
// no puede habilitar.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { FEX_ACCESS_MODULE_CODE } from "./sales-export-availability";
import {
  PLATFORM_MODULE_CODES,
  isRecognizedPlatformModuleCode,
} from "@/modules/platform/constants/platform-modules.constants";
import { MODULES } from "../../../../../../prisma/seeds/seed.platform";

const APP_DIR = join(__dirname, "..", "..", "..", "..", "..", "app", "(dashboard)", "dashboard", "sales");

describe("FEX 11 — clave del panel = clave del gate", () => {
  it("el gate valida una clave que el catálogo de plataforma siembra (y el panel puede habilitar)", () => {
    expect(MODULES.map((m) => m.code)).toContain(FEX_ACCESS_MODULE_CODE);
    expect(isRecognizedPlatformModuleCode(FEX_ACCESS_MODULE_CODE)).toBe(true);
  });

  it("todo módulo sembrado (habilitable desde el panel) es una clave reconocida por runtime", () => {
    for (const m of MODULES) expect(isRecognizedPlatformModuleCode(m.code)).toBe(true);
    expect(new Set(MODULES.map((m) => m.code))).toEqual(new Set(Object.values(PLATFORM_MODULE_CODES)));
  });

  it("claves retiradas o alternativas de exportación no se reconocen (panel las marca 'Retirado' y no se pueden activar)", () => {
    for (const code of ["fiscal.dte.export", "commerce.sales.export", "sales.export"]) {
      expect(isRecognizedPlatformModuleCode(code)).toBe(false);
    }
  });

  it.each(["export", "new"])("/dashboard/sales/%s usa resolveSalesExportAvailability* (misma fuente de verdad)", (route) => {
    const src = readFileSync(join(APP_DIR, route, "page.tsx"), "utf-8");
    expect(src).toMatch(/resolveSalesExportAvailability(Detailed)?\(/);
    expect(src).not.toMatch(/fiscal\.dte\.export|sales\.export"/);
  });
});
