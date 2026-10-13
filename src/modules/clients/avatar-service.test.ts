// ─────────────────────────────────────────────────────────────────
// clients — avatar-service.test.ts
//
// Avatar privado de Client: autorización tenant/branch/runtime, upload
// determinista tenant-aware y lectura autenticada. Storage = fake en
// memoria (nunca Supabase real). Prisma global = proxy que lanza en
// cualquier acceso (certifica que todo pasa por context.client).
// Guards REALES (canManageClient) — solo se mockea auth().
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

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, storage, getAvatarStorageMock } =
  vi.hoisted(() => {
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
      getAvatarStorageMock: vi.fn(),
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
    getAvatarStorage: () => getAvatarStorageMock(),
    AvatarStorageNotConfiguredError: types.AvatarStorageNotConfiguredError,
    AvatarStorageReadError: types.AvatarStorageReadError,
  };
});

import { uploadClientAvatar, readClientAvatar } from "./avatar-service";
import type { SessionUser } from "@/lib/permissions/guards";
import { MAX_AVATAR_UPLOAD_BYTES } from "@/core/storage/avatar-limits";

// ── Fixtures ───────────────────────────────────────────────────────

type Row = {
  id: string;
  tenant_id: string;
  branch_id: string;
  user_id: string | null;
  avatar_url: string | null;
};

function makeDb(rows: Row[]) {
  const findFirst = vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) => {
    const r = rows.find((x) => x.id === where.id && x.tenant_id === where.tenant_id);
    return r ? { ...r } : null;
  });
  const update = vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const r = rows.find((x) => x.id === where.id)!;
    Object.assign(r, data);
    return r;
  });
  return { client: { findFirst, update } };
}

function handle(
  db: ReturnType<typeof makeDb>,
  opts: { role?: string; tenantId?: string; locationId?: string | null; readOnly?: boolean; userId?: string } = {},
) {
  const tenantId = opts.tenantId ?? "tenant-1";
  return {
    context: {
      runtimeMode: "PLATFORM_NATIVE",
      effectiveUser: {
        id: opts.userId ?? "staff-1",
        tenant_id: tenantId,
        location_id: opts.locationId === undefined ? "loc-1" : opts.locationId,
        role: opts.role ?? "super_admin",
      },
      tenantId,
      locationId: opts.locationId ?? "loc-1",
      client: db,
      readOnly: opts.readOnly ?? false,
    },
    dispose: disposeMock,
  };
}

function session(role: string, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "staff-1",
    role,
    tenant_id: "tenant-1",
    location_id: "loc-1",
    auth_scope: "PLATFORM",
    ...overrides,
  } as SessionUser;
}

let jpeg: Buffer;
async function jpegFile(name = "foto.jpg") {
  if (!jpeg) {
    jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#c33" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
  }
  return new File([new Uint8Array(jpeg)], name, { type: "image/jpeg" });
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const OLD_V = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activeUrl = (id: string, v = OLD_V) => `/api/avatars/clients/${id}?v=${v}`;
const versionKey = (tenant: string, id: string, v: string) => `tenants/${tenant}/clients/${id}/avatars/${v}.webp`;
const keyPattern = (tenant: string, id: string) =>
  new RegExp(`^tenants/${tenant}/clients/${id}/avatars/${UUID.source}\\.webp$`);
const versionOf = (url: string | null) => url?.split("?v=")[1] ?? null;

const READ_ONLY = () =>
  new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403);

let rows: Row[];
beforeEach(() => {
  rows = [
    { id: "client-1", tenant_id: "tenant-1", branch_id: "loc-1", user_id: "portal-user-1", avatar_url: null },
    { id: "client-2", tenant_id: "tenant-1", branch_id: "loc-2", user_id: null, avatar_url: null },
    { id: "client-x", tenant_id: "tenant-2", branch_id: "loc-1", user_id: null, avatar_url: null },
  ];
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  storage.put.mockReset().mockResolvedValue(undefined);
  storage.get.mockReset().mockRejectedValue(new Error("get no configurado en este test"));
  getAvatarStorageMock.mockReset().mockImplementation(() => storage);
  storage.remove.mockReset().mockResolvedValue(undefined);
});

// ── A. Upload / authorization ─────────────────────────────────────

describe("uploadClientAvatar — autorización", () => {
  it("2. Client inexistente -> 404, cero upload", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadClientAvatar(session("super_admin"), "nope", await jpegFile());
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("3. Client de otro tenant -> 404, cero upload (lookup filtra por tenant efectivo)", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadClientAvatar(session("super_admin"), "client-x", await jpegFile());
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(db.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client-x", tenant_id: "tenant-1" } }),
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("4. branch_admin fuera de su sucursal -> 403, cero upload", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db, { role: "branch_admin" }));
    const r = await uploadClientAvatar(session("branch_admin"), "client-2", await jpegFile());
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("5. reception fuera de su sucursal -> 403, cero upload", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db, { role: "reception" }));
    const r = await uploadClientAvatar(session("reception"), "client-2", await jpegFile());
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("trainer / client -> rechazados por el gate inicial, sin resolver contexto", async () => {
    for (const role of ["trainer", "client"]) {
      const r = await uploadClientAvatar(session(role), "client-1", await jpegFile());
      expect(r).toMatchObject({ ok: false, status: 403 });
    }
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("6. reception de la sucursal permitida -> upload + update avatar_url interno", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db, { role: "reception" }));
    const r = await uploadClientAvatar(session("reception"), "client-1", await jpegFile());

    expect(r.ok).toBe(true);
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { write: true });
    expect(storage.put).toHaveBeenCalledTimes(1);
    const [, body, contentType] = storage.put.mock.calls[0];
    expect(contentType).toBe("image/webp");
    const meta = await sharp(body).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();
    expect(rows[0].avatar_url).toMatch(new RegExp(`^/api/avatars/clients/client-1\\?v=${UUID.source}$`));
    expect(storage.put.mock.calls[0][0]).toBe(versionKey("tenant-1", "client-1", versionOf(rows[0].avatar_url)!));
    expect(r.ok && r.url).toBe(rows[0].avatar_url);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("7. SUPPORT_RUNTIME (READ_ONLY) -> bloqueado antes del Storage y de la DB", async () => {
    requireOperationalContextMock.mockRejectedValue(READ_ONLY());
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("8. RUNTIME_CLIENT -> usa context.client y el tenant efectivo con rol LIVE", async () => {
    const runtimeRows: Row[] = [
      { id: "client-r", tenant_id: "tenant-runtime", branch_id: "loc-r", user_id: null, avatar_url: null },
    ];
    const db = makeDb(runtimeRows);
    // JWT dice super_admin, pero el rol LIVE es reception de otra sucursal → deny.
    requireOperationalContextMock.mockResolvedValue(
      handle(db, { role: "reception", tenantId: "tenant-runtime", locationId: "loc-other" }),
    );
    const denied = await uploadClientAvatar(
      session("super_admin", { auth_scope: "RUNTIME_CLIENT", tenant_id: "tenant-runtime" }),
      "client-r",
      await jpegFile(),
    );
    expect(denied).toMatchObject({ ok: false, status: 403 });
    expect(storage.put).not.toHaveBeenCalled();

    requireOperationalContextMock.mockResolvedValue(
      handle(db, { role: "reception", tenantId: "tenant-runtime", locationId: "loc-r" }),
    );
    const ok = await uploadClientAvatar(
      session("reception", { auth_scope: "RUNTIME_CLIENT", tenant_id: "tenant-runtime" }),
      "client-r",
      await jpegFile(),
    );
    expect(ok.ok).toBe(true);
    expect(storage.put.mock.calls[0][0]).toMatch(keyPattern("tenant-runtime", "client-r"));
    expect(db.client.update).toHaveBeenCalledTimes(1);
  });

  it("9. nunca toca el Prisma global (proxy lanzaría)", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    await expect(uploadClientAvatar(session("super_admin"), "client-1", await jpegFile())).resolves.toMatchObject({ ok: true });
  });

  it("10. MIME inválido (image/gif) -> 400, cero upload", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97])], "a.gif", { type: "image/gif" });
    const r = await uploadClientAvatar(session("super_admin"), "client-1", gif);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("10b. MIME declarado jpeg pero contenido no-imagen -> 400", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const fake = new File([new TextEncoder().encode("<script>alert(1)</script>")], "x.jpg", { type: "image/jpeg" });
    const r = await uploadClientAvatar(session("super_admin"), "client-1", fake);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("11. límite 4 MB: exactamente 4 MB pasa la validación de tamaño; > 4 MB -> 413", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const big = new File([new Uint8Array(MAX_AVATAR_UPLOAD_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    const r = await uploadClientAvatar(session("super_admin"), "client-1", big);
    expect(r).toMatchObject({ ok: false, status: 413, error: "El archivo supera el límite de 4 MB." });
    expect(storage.put).not.toHaveBeenCalled();

    // Exactamente 4 MB: no se rechaza por tamaño (sí por contenido: bytes nulos no son imagen).
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const exact = new File([new Uint8Array(MAX_AVATAR_UPLOAD_BYTES)], "exact.jpg", { type: "image/jpeg" });
    const r2 = await uploadClientAvatar(session("super_admin"), "client-1", exact);
    expect(r2).toMatchObject({ ok: false, status: 400 });
    expect(MAX_AVATAR_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
  });

  it("12/13. object key = tenant + client del servidor; el nombre original no participa", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile("../../tenants/tenant-2/evil.jpg"));
    const key = storage.put.mock.calls[0][0];
    expect(key).toMatch(keyPattern("tenant-1", "client-1"));
    expect(key).not.toContain("evil");
    expect(key).not.toContain("..");
  });

  it("14. error de DB sin avatar previo -> error y se elimina el objeto nuevo", async () => {
    const db = makeDb(rows);
    db.client.update.mockRejectedValueOnce(new Error("db down"));
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());
    errSpy.mockRestore();

    expect(r).toMatchObject({ ok: false, status: 500 });
    const newKey = storage.put.mock.calls[0][0];
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(newKey);
    expect(rows[0].avatar_url).toBeNull();
  });

  it("error de Storage -> 502, sin update en DB", async () => {
    const db = makeDb(rows);
    storage.put.mockRejectedValueOnce(new Error("storage down"));
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("sin archivo -> 400 (tras autorizar)", async () => {
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadClientAvatar(session("super_admin"), "client-1", "not-a-file");
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

// ── Objetos versionados — atomicidad lógica (regresiones A–E) ─────

describe("uploadClientAvatar — reemplazo versionado", () => {
  it("A. avatar previo + upload OK + DB falla -> borra SOLO el nuevo; anterior intacto", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    const db = makeDb(rows);
    db.client.update.mockRejectedValueOnce(new Error("db down"));
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());
    const logged = JSON.stringify(errSpy.mock.calls);
    errSpy.mockRestore();

    expect(r).toMatchObject({ ok: false, status: 500 });
    const newKey = storage.put.mock.calls[0][0];
    expect(newKey).not.toBe(versionKey("tenant-1", "client-1", OLD_V));
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(newKey);
    expect(storage.remove).not.toHaveBeenCalledWith(versionKey("tenant-1", "client-1", OLD_V));
    expect(rows[0].avatar_url).toBe(activeUrl("client-1"));
    expect(logged).not.toContain("tenants/");
  });

  it("B. upload + DB OK -> avatar_url apunta a la versión nueva y se limpia la anterior", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());

    expect(r.ok).toBe(true);
    const newVersion = versionOf(rows[0].avatar_url)!;
    expect(newVersion).not.toBe(OLD_V);
    expect(storage.put.mock.calls[0][0]).toBe(versionKey("tenant-1", "client-1", newVersion));
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(versionKey("tenant-1", "client-1", OLD_V));
    // Orden: subir nuevo -> update DB -> limpiar anterior.
    expect(storage.put.mock.invocationCallOrder[0]).toBeLessThan(db.client.update.mock.invocationCallOrder[0]);
    expect(db.client.update.mock.invocationCallOrder[0]).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);

    // La versión nueva es la que se sirve.
    storage.get.mockResolvedValue({ body: Buffer.from("new"), contentType: "image/webp" });
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    expect((await readClientAvatar(session("super_admin"), "client-1")).ok).toBe(true);
    expect(storage.get).toHaveBeenCalledWith(versionKey("tenant-1", "client-1", newVersion));
  });

  it("B2. avatar previo legacy (/uploads) -> no intenta borrar nada del bucket", async () => {
    rows[0].avatar_url = "/uploads/avatars/client-1-123.jpg";
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());
    expect(r.ok).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("C. fallo al limpiar la versión anterior -> sigue siendo éxito y DB apunta a la nueva", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    storage.remove.mockRejectedValueOnce(new Error("storage hiccup"));
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile());
    const logged = JSON.stringify(errSpy.mock.calls);
    errSpy.mockRestore();

    expect(r.ok).toBe(true);
    expect(rows[0].avatar_url).not.toBe(activeUrl("client-1"));
    expect(r.ok && r.url).toBe(rows[0].avatar_url);
    expect(db.client.update).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain("tenants/");
    expect(logged).not.toContain(OLD_V);
  });
});

// ── B. Avatar retrieval ───────────────────────────────────────────

describe("readClientAvatar — acceso privado", () => {
  const image = { body: Buffer.from("webp-bytes"), contentType: "image/webp" };

  it("15. tenant correcto + staff autorizado -> imagen desde el key tenant-aware", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    storage.get.mockResolvedValue(image);
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows), { role: "reception" }));
    const r = await readClientAvatar(session("reception"), "client-1");
    expect(r).toEqual({ ok: true, body: image.body, contentType: "image/webp" });
    expect(storage.get).toHaveBeenCalledWith(versionKey("tenant-1", "client-1", OLD_V));
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything());
  });

  it("16. tenant incorrecto -> 404, nunca consulta Storage", async () => {
    rows[2].avatar_url = activeUrl("client-x");
    storage.get.mockResolvedValue(image);
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    const r = await readClientAvatar(session("super_admin"), "client-x");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("staff fuera de sucursal -> 404", async () => {
    rows[1].avatar_url = activeUrl("client-2");
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows), { role: "reception" }));
    const r = await readClientAvatar(session("reception"), "client-2");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("17. role client -> solo su propio avatar", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    rows[1].avatar_url = activeUrl("client-2");
    storage.get.mockResolvedValue(image);

    requireOperationalContextMock.mockResolvedValue(
      handle(makeDb(rows), { role: "client", userId: "portal-user-1" }),
    );
    const own = await readClientAvatar(session("client", { id: "portal-user-1" }), "client-1");
    expect(own.ok).toBe(true);

    requireOperationalContextMock.mockResolvedValue(
      handle(makeDb(rows), { role: "client", userId: "portal-user-1" }),
    );
    const other = await readClientAvatar(session("client", { id: "portal-user-1" }), "client-2");
    expect(other).toMatchObject({ ok: false, status: 404 });
  });

  it("trainer -> 404 (sin canManageClient)", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows), { role: "trainer" }));
    const r = await readClientAvatar(session("trainer"), "client-1");
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("avatar_url legacy (no interno) -> 404, no consulta el bucket", async () => {
    rows[0].avatar_url = "/uploads/avatars/client-1-123.jpg";
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    const r = await readClientAvatar(session("super_admin"), "client-1");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("Support Session (lectura) -> permitido; no exige write", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    storage.get.mockResolvedValue(image);
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows), { readOnly: true }));
    const r = await readClientAvatar(session("super_admin"), "client-1");
    expect(r.ok).toBe(true);
  });

  it("D. el GET sirve SOLO la versión activa persistida (versiones antiguas no son recuperables)", async () => {
    const ACTIVE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    rows[0].avatar_url = activeUrl("client-1", ACTIVE);
    storage.get.mockResolvedValue({ body: Buffer.from("active"), contentType: "image/webp" });
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    // El servicio no recibe versión del request: no existe forma de pedir OLD_V.
    expect(readClientAvatar.length).toBe(2);
    await readClientAvatar(session("super_admin"), "client-1");
    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(storage.get).toHaveBeenCalledWith(versionKey("tenant-1", "client-1", ACTIVE));
    expect(storage.get).not.toHaveBeenCalledWith(versionKey("tenant-1", "client-1", OLD_V));
  });

  it("E. otro tenant no puede adivinar versión/key: lookup por tenant efectivo", async () => {
    // client-x es de tenant-2 y el atacante conoce su versión.
    rows[2].avatar_url = activeUrl("client-x");
    storage.get.mockResolvedValue({ body: Buffer.from("x"), contentType: "image/webp" });
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows), { tenantId: "tenant-1" }));
    const r = await readClientAvatar(session("super_admin"), "client-x");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(storage.get).not.toHaveBeenCalled();

    // avatar_url con versión inválida / traversal -> nunca se construye key.
    rows[0].avatar_url = "/api/avatars/clients/client-1?v=../../tenant-2/clients/client-x/avatars/x";
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    expect(await readClientAvatar(session("super_admin"), "client-1")).toMatchObject({ status: 404 });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("7. avatar_url activo + fallo de descarga -> 502 genérico, NO 404", async () => {
    rows[0].avatar_url = activeUrl("client-1");
    storage.get.mockRejectedValue(
      new Error("bucket=gym-avatars path=tenants/tenant-secret/clients/client-secret/avatars/version.webp secret=test-secret"),
    );
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await readClientAvatar(session("super_admin"), "client-1");
    const logged = JSON.stringify(errSpy.mock.calls);
    errSpy.mockRestore();
    expect(r).toEqual({ ok: false, status: 502, error: "No se pudo cargar la imagen." });
    expect(storage.get).toHaveBeenCalledWith(versionKey("tenant-1", "client-1", OLD_V));
    for (const leak of ["gym-avatars", "tenants/", "tenant-secret", "test-secret", OLD_V]) {
      expect(JSON.stringify(r)).not.toContain(leak);
      expect(logged).not.toContain(leak);
    }
  });

  it("8. avatar_url null / legacy -> 404 sin llamar a Storage", async () => {
    for (const url of [null, "/uploads/avatars/client-1-123.jpg", "https://cdn.example/a.png"]) {
      rows[0].avatar_url = url;
      requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
      expect(await readClientAvatar(session("super_admin"), "client-1")).toMatchObject({ ok: false, status: 404 });
    }
    expect(storage.get).not.toHaveBeenCalled();
    expect(getAvatarStorageMock).not.toHaveBeenCalled();
  });

  it("9. Storage sin configurar -> 503 (lectura y upload)", async () => {
    const { AvatarStorageNotConfiguredError } = await import("@/core/storage/storage-types");
    getAvatarStorageMock.mockImplementation(() => {
      throw new AvatarStorageNotConfiguredError();
    });
    rows[0].avatar_url = activeUrl("client-1");
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    expect(await readClientAvatar(session("super_admin"), "client-1")).toEqual({
      ok: false,
      status: 503,
      error: "Almacenamiento de avatares no configurado.",
    });
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    expect(await uploadClientAvatar(session("super_admin"), "client-1", await jpegFile())).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("18. respuestas de error nunca incluyen bucket/key/secretos", async () => {
    process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY = "test-secret-should-never-leak";
    rows[0].avatar_url = activeUrl("client-1");
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(rows)));
    const r = await readClientAvatar(session("super_admin"), "client-1");
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("tenants/");
    expect(serialized).not.toContain("gym-avatars");
    expect(serialized).not.toContain("test-secret-should-never-leak");
    delete process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY;
  });
});
