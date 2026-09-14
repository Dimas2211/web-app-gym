// ─────────────────────────────────────────────────────────────────
// core/permissions — platform-access.test.ts
//
// FASE VI-B — Runtime Identity Security Foundation.
//
// Certifica canAccessPlatformAdmin(): la ÚNICA frontera de decisión
// "¿puede este usuario actuar como Platform Admin?", usada tanto por
// requireSuperAdmin() (server guard, autoridad real) como por la
// navegación UI (dashboard-nav.ts). Ambos consumidores comparten esta
// función — no se duplica `role === "super_admin" && ...` en ningún
// otro archivo.
//
// Regla certificada: Platform Admin exige auth_scope === "PLATFORM"
// AMBAS condiciones — ni el auth_scope ni el rol son suficientes solos.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { canAccessPlatformAdmin } from "./platform-access";
import type { AuthScope } from "@/core/auth/types";

describe("canAccessPlatformAdmin — FASE VI-B", () => {
  it("IDENTITY A — PLATFORM + super_admin → YES", () => {
    expect(
      canAccessPlatformAdmin({ role: "super_admin", auth_scope: "PLATFORM" }),
    ).toBe(true);
  });

  it("IDENTITY B — PLATFORM + branch_admin (rol sin isGlobal) → NO", () => {
    expect(
      canAccessPlatformAdmin({ role: "branch_admin", auth_scope: "PLATFORM" }),
    ).toBe(false);
  });

  it("IDENTITY C — RUNTIME_CLIENT + super_admin → NO (bloqueo crítico VI-B)", () => {
    expect(
      canAccessPlatformAdmin({ role: "super_admin", auth_scope: "RUNTIME_CLIENT" }),
    ).toBe(false);
  });

  it("RUNTIME_CLIENT + branch_admin → NO", () => {
    expect(
      canAccessPlatformAdmin({ role: "branch_admin", auth_scope: "RUNTIME_CLIENT" }),
    ).toBe(false);
  });

  it("IDENTITY D — auth_scope ausente (undefined) + super_admin → NO (fail closed)", () => {
    expect(
      canAccessPlatformAdmin({ role: "super_admin", auth_scope: undefined }),
    ).toBe(false);
  });

  it("auth_scope inválido (cast forzado, valor no reconocido) + super_admin → NO", () => {
    expect(
      canAccessPlatformAdmin({
        role: "super_admin",
        auth_scope: "SOMETHING_ELSE" as unknown as AuthScope,
      }),
    ).toBe(false);
  });

  it("rol desconocido (no mapeado) + PLATFORM → NO", () => {
    expect(
      canAccessPlatformAdmin({ role: "unmapped_role", auth_scope: "PLATFORM" }),
    ).toBe(false);
  });

  it("PLATFORM + reception/trainer/client → NO (ningún rol location/own_data cruza)", () => {
    for (const role of ["reception", "trainer", "client"]) {
      expect(canAccessPlatformAdmin({ role, auth_scope: "PLATFORM" })).toBe(false);
    }
  });
});
