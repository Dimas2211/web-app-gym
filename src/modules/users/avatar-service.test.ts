// ─────────────────────────────────────────────────────────────────
// users — avatar-service.test.ts
//
// Avatar de staff sobre el backend privado compartido. Mantiene el
// criterio previo (rol LIVE super_admin, módulo core.users) y agrega
// ownership por tenant efectivo. Storage = fake.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("Prisma GLOBAL usado — debe usarse context.client");
    },
  }),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, storage } = vi.hoisted(() => {
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
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
    storage: {
      put: vi.fn<(key: string, body: Buffer, contentType: string) => Promise<void>>(async () => {}),
      get: vi.fn<(key: string) => Promise<{ body: Buffer; contentType: string }>>(async () => {
        throw new Error("not mocked");
      }),
      remove: vi.fn<(key: string) => Promise<void>>(async () => {}),
    },
  };
});
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));
vi.mock("@/core/storage/avatar-storage", async () => {
  const types = await import("@/core/storage/storage-types");
  return {
    getAvatarStorage: () => storage,
    AvatarStorageNotConfiguredError: types.AvatarStorageNotConfiguredError,
    AvatarStorageReadError: types.AvatarStorageReadError,
  };
});

import { uploadUserAvatar, readUserAvatar } from "./avatar-service";
import type { SessionUser } from "@/lib/permissions/guards";
import { MAX_AVATAR_UPLOAD_BYTES } from "@/core/storage/avatar-limits";

const OLD_V = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userKey = (id: string, v: string) => `tenants/tenant-1/users/${id}/avatars/${v}.webp`;

type Row = { id: string; tenant_id: string; role: string; branch_id: string | null; avatar_url: string | null };
let rows: Row[];

function makeDb() {
  return {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) => {
        const r = rows.find((x) => x.id === where.id && x.tenant_id === where.tenant_id);
        return r ? { ...r } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
    },
  };
}

function handle(db: ReturnType<typeof makeDb>, role = "super_admin", userId = "admin-1") {
  return {
    context: {
      effectiveUser: { id: userId, tenant_id: "tenant-1", location_id: "loc-1", role },
      tenantId: "tenant-1",
      locationId: "loc-1",
      client: db,
      readOnly: false,
    },
    dispose: disposeMock,
  };
}

const session = (role: string, id = "admin-1") =>
  ({ id, role, tenant_id: "tenant-1", location_id: "loc-1", auth_scope: "PLATFORM" }) as SessionUser;

async function png() {
  const buf = await sharp({ create: { width: 300, height: 300, channels: 4, background: "#00f" } }).png().toBuffer();
  return new File([new Uint8Array(buf)], "x.png", { type: "image/png" });
}

beforeEach(() => {
  rows = [
    { id: "admin-1", tenant_id: "tenant-1", role: "super_admin", branch_id: null, avatar_url: null },
    { id: "rec-1", tenant_id: "tenant-1", role: "reception", branch_id: "loc-1", avatar_url: `/api/avatars/users/rec-1?v=${OLD_V}` },
    { id: "other-1", tenant_id: "tenant-2", role: "reception", branch_id: "loc-1", avatar_url: null },
  ];
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  storage.put.mockReset().mockResolvedValue(undefined);
  storage.get.mockReset().mockRejectedValue(new Error("get no configurado en este test"));
  storage.remove.mockReset().mockResolvedValue(undefined);
});

describe("uploadUserAvatar", () => {
  it("super_admin LIVE -> upload tenant-aware + avatar_url interno, módulo core.users", async () => {
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadUserAvatar(session("super_admin"), "rec-1", await png());
    expect(r.ok).toBe(true);
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { module: "core.users", write: true });
    const newVersion = rows[1].avatar_url!.split("?v=")[1];
    expect(newVersion).not.toBe(OLD_V);
    expect(storage.put.mock.calls[0][0]).toBe(userKey("rec-1", newVersion));
    expect(rows[1].avatar_url).toBe(`/api/avatars/users/rec-1?v=${newVersion}`);
    // B (staff): se limpia la versión anterior tras confirmar la DB.
    expect(storage.remove).toHaveBeenCalledWith(userKey("rec-1", OLD_V));
  });

  it("usuario de otro tenant -> 404, cero upload", async () => {
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadUserAvatar(session("super_admin"), "other-1", await png());
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("rol LIVE != super_admin -> 403 (aunque el JWT diga branch_admin)", async () => {
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db, "branch_admin"));
    const r = await uploadUserAvatar(session("branch_admin"), "rec-1", await png());
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("reception -> gate inicial 403; Support Session -> bloqueado antes del Storage", async () => {
    expect(await uploadUserAvatar(session("reception"), "rec-1", await png())).toMatchObject({ status: 403 });
    requireOperationalContextMock.mockRejectedValue(new FakeOperationalContextError("READ_ONLY", "solo lectura", 403));
    expect(await uploadUserAvatar(session("super_admin"), "rec-1", await png())).toMatchObject({ status: 403 });
    expect(storage.put).not.toHaveBeenCalled();
  });
});

describe("uploadUserAvatar — reemplazo versionado y límite compartido", () => {
  it("A (staff). DB falla -> borra SOLO el nuevo; avatar anterior intacto", async () => {
    const db = makeDb();
    db.user.update.mockRejectedValueOnce(new Error("db down"));
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await uploadUserAvatar(session("super_admin"), "rec-1", await png());
    errSpy.mockRestore();
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    expect(storage.remove).not.toHaveBeenCalledWith(userKey("rec-1", OLD_V));
    expect(rows[1].avatar_url).toBe(`/api/avatars/users/rec-1?v=${OLD_V}`);
  });

  it("C (staff). cleanup anterior falla -> éxito, DB en la versión nueva", async () => {
    storage.remove.mockRejectedValueOnce(new Error("hiccup"));
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await uploadUserAvatar(session("super_admin"), "rec-1", await png());
    errSpy.mockRestore();
    expect(r.ok).toBe(true);
    expect(r.ok && r.url).toBe(rows[1].avatar_url);
    expect(rows[1].avatar_url).not.toContain(OLD_V);
  });

  it("mismo límite que Client: > 4 MB -> 413 con el mismo mensaje", async () => {
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const big = new File([new Uint8Array(MAX_AVATAR_UPLOAD_BYTES + 1)], "big.png", { type: "image/png" });
    const r = await uploadUserAvatar(session("super_admin"), "rec-1", big);
    expect(r).toMatchObject({ ok: false, status: 413, error: "El archivo supera el límite de 4 MB." });
    expect(storage.put).not.toHaveBeenCalled();
  });
});

describe("readUserAvatar", () => {
  const img = { body: Buffer.from("i"), contentType: "image/webp" };

  it("el propio usuario puede ver su avatar", async () => {
    storage.get.mockResolvedValue(img);
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), "reception", "rec-1"));
    expect((await readUserAvatar(session("reception", "rec-1"), "rec-1")).ok).toBe(true);
  });

  it("trainer ajeno -> 404; otro tenant -> 404", async () => {
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), "trainer", "tr-1"));
    expect(await readUserAvatar(session("trainer", "tr-1"), "rec-1")).toMatchObject({ status: 404 });
    requireOperationalContextMock.mockResolvedValue(handle(makeDb()));
    expect(await readUserAvatar(session("super_admin"), "other-1")).toMatchObject({ status: 404 });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("avatar activo + fallo de descarga -> 502 genérico (no 404)", async () => {
    storage.get.mockRejectedValue(new Error("bucket=zolvi-private secret=test-secret"));
    requireOperationalContextMock.mockResolvedValue(handle(makeDb()));
    const r = await readUserAvatar(session("super_admin"), "rec-1");
    expect(r).toEqual({ ok: false, status: 502, error: "No se pudo cargar la imagen." });
  });

  it("super_admin del tenant -> imagen", async () => {
    storage.get.mockResolvedValue(img);
    requireOperationalContextMock.mockResolvedValue(handle(makeDb()));
    expect((await readUserAvatar(session("super_admin"), "rec-1")).ok).toBe(true);
    expect(storage.get).toHaveBeenCalledWith(userKey("rec-1", OLD_V));
  });
});
