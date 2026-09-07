// ─────────────────────────────────────────────────────────────────
// clients — actions.test.ts
//
// PASO 6D — Auditoría de aislamiento GYM: sesión runtime "Operar como
// cliente" activa (siempre solo lectura) debe bloquear cualquier write
// de clients ANTES de tocar prisma — sin importar el rol del
// super_admin autenticado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));

vi.mock("@/lib/permissions/guards", () => ({
  requireClientManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageClient: vi.fn(() => true),
}));

const { clientUpdateSpy, clientFindUniqueSpy } = vi.hoisted(() => ({
  clientUpdateSpy: vi.fn(),
  clientFindUniqueSpy: vi.fn(async () => ({ id: "client-1", status: "active", tenant_id: "tenant-1" })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    client: { findUnique: clientFindUniqueSpy, update: clientUpdateSpy },
  },
}));

const { isRuntimeReadOnlyActiveMock } = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(async () => false),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo \"Operar como cliente\" activo (solo lectura).",
}));

import { toggleClientStatusAction } from "./actions";

beforeEach(() => {
  clientUpdateSpy.mockReset();
  clientFindUniqueSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleClientStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.client.findUnique/update", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleClientStatusAction(fd({ id: "client-1" }));

    expect(clientFindUniqueSpy).not.toHaveBeenCalled();
    expect(clientUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await toggleClientStatusAction(fd({ id: "client-1" }));

    expect(clientUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
