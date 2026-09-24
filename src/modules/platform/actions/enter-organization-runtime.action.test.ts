// ─────────────────────────────────────────────────────────────────
// platform — enter-organization-runtime.action.test.ts
//
// SHARED-OPS-PARITY-1 — D. "Operar como cliente" organization-scoped
// (Runtime Router REAL + Control Plane sintético):
// - Org A (Shared) → sesión con tenant A, nunca B; readOnly; runtimeKind SHARED.
// - Org Dedicated → mismo comportamiento, runtimeKind DEDICATED.
// - Sin tenant / target id como identidad → no abre sesión.
// - Un tenantId enviado por el navegador se ignora.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
  decryptText: vi.fn().mockReturnValue("fake-password"),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { buildFakeControlPlane } = await import("../runtime/organization-runtime-test-fixtures");
  return { prisma: buildFakeControlPlane() };
});

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "super-1", role: "super_admin" })),
}));

class RedirectSignal extends Error {
  constructor(public readonly url: string) { super(`redirect:${url}`); }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new RedirectSignal(url); },
}));

const setRuntimeSessionMock = vi.fn();
vi.mock("../runtime/runtime-session", () => ({
  setRuntimeSession: (...args: unknown[]) => setRuntimeSessionMock(...args),
}));

import { enterOrganizationRuntimeAction } from "./enter-organization-runtime.action";
import {
  ORG_A, ORG_B, ORG_D, ORG_NO_TENANT, SHARED_TARGET_ID, DEDICATED_PROFILE_ID,
} from "../runtime/organization-runtime-test-fixtures";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function run(fd: FormData): Promise<string> {
  try {
    await enterOrganizationRuntimeAction(fd);
  } catch (err) {
    if (err instanceof RedirectSignal) return err.url;
    throw err;
  }
  throw new Error("expected redirect");
}

beforeEach(() => setRuntimeSessionMock.mockReset());

describe("enterOrganizationRuntimeAction", () => {
  it("D — Shared org A crea sesión runtime con tenant A (nunca B)", async () => {
    const url = await run(form({ organizationId: ORG_A.id }));

    expect(url).toBe("/dashboard/products");
    expect(setRuntimeSessionMock).toHaveBeenCalledTimes(1);
    const payload = setRuntimeSessionMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      organizationId:   ORG_A.id,
      profileId:        SHARED_TARGET_ID,
      tenantId:         "TENANT_A",
      organizationName: ORG_A.name,
      profileLabel:     "Zolvi Shared 01",
      readOnly:         true,
      runtimeKind:      "SHARED",
      startedByUserId:  "super-1",
    });
    expect(payload.tenantId).not.toBe(ORG_B.tenant_id);
  });

  it("org B del mismo target → tenant B", async () => {
    await run(form({ organizationId: ORG_B.id }));
    expect(setRuntimeSessionMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_B", runtimeKind: "SHARED" });
  });

  it("Dedicated → comportamiento idéntico, runtimeKind DEDICATED con el perfil resuelto", async () => {
    await run(form({ organizationId: ORG_D.id }));
    expect(setRuntimeSessionMock.mock.calls[0][0]).toMatchObject({
      organizationId: ORG_D.id,
      profileId:      DEDICATED_PROFILE_ID,
      tenantId:       "TENANT_D",
      runtimeKind:    "DEDICATED",
      readOnly:       true,
    });
  });

  it("tenantId/profileId enviados por el navegador se ignoran", async () => {
    await run(form({ organizationId: ORG_A.id, tenantId: "TENANT_B", profileId: DEDICATED_PROFILE_ID }));
    expect(setRuntimeSessionMock.mock.calls[0][0]).toMatchObject({
      tenantId:  "TENANT_A",
      profileId: SHARED_TARGET_ID,
    });
  });

  it("E — no se puede entrar 'como Shared Target': el target id no es una organización", async () => {
    const url = await run(form({ organizationId: SHARED_TARGET_ID }));
    expect(url).toContain("/dashboard/platform/database-profiles?runtimeError=");
    expect(setRuntimeSessionMock).not.toHaveBeenCalled();
  });

  it("organización sin tenant → no abre sesión", async () => {
    const url = await run(form({ organizationId: ORG_NO_TENANT.id }));
    expect(url).toContain("runtimeError=");
    expect(setRuntimeSessionMock).not.toHaveBeenCalled();
  });

  it("sin organizationId → no abre sesión", async () => {
    const url = await run(form({}));
    expect(url).toContain("runtimeError=");
    expect(setRuntimeSessionMock).not.toHaveBeenCalled();
  });
});
