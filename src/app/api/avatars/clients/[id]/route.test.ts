// ─────────────────────────────────────────────────────────────────
// api/avatars/clients/[id] — route.test.ts
//
// Frontera HTTP: sin sesión → 401 sin tocar servicio/Storage; el
// navegador no puede elegir tenant/path/bucket (solo se lee `file`);
// la imagen se sirve con cache privado y sin detalles internos.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { authMock, uploadMock, readMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  uploadMock: vi.fn(),
  readMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/modules/clients/avatar-service", () => ({
  uploadClientAvatar: uploadMock,
  readClientAvatar: readMock,
}));

import { GET, POST } from "./route";

const params = () => ({ params: Promise.resolve({ id: "client-1" }) });

function postRequest(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new NextRequest("http://localhost/api/avatars/clients/client-1", { method: "POST", body: fd });
}

const jpg = () => new File(["x"], "a.jpg", { type: "image/jpeg" });

beforeEach(() => {
  authMock.mockReset();
  uploadMock.mockReset();
  readMock.mockReset();
});

describe("POST /api/avatars/clients/[id]", () => {
  it("1. no autenticado -> 401, servicio nunca invocado", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(postRequest({ file: jpg() }), params());
    expect(res.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("solo `file` llega al servicio; tenant/path/bucket/avatar_url del body se ignoran", async () => {
    authMock.mockResolvedValue({
      user: { id: "u1", role: "reception", tenant_id: "tenant-1", location_id: "loc-1", auth_scope: "PLATFORM" },
    });
    uploadMock.mockResolvedValue({ ok: true, url: "/api/avatars/clients/client-1?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const res = await POST(
      postRequest({
        file: jpg(),
        tenant_id: "tenant-2",
        path: "tenants/tenant-2/clients/z/avatar.webp",
        bucket: "public",
        avatar_url: "https://evil.example/a.png",
      }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "/api/avatars/clients/client-1?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const call = uploadMock.mock.calls[0];
    expect(call).toHaveLength(3);
    expect(call[0]).toMatchObject({ id: "u1", tenant_id: "tenant-1", auth_scope: "PLATFORM" });
    expect(call[1]).toBe("client-1");
    expect(call[2]).toBeInstanceOf(File);
  });

  it("auth_scope desconocido se normaliza a undefined (fail closed)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t", auth_scope: "ROOT" } });
    uploadMock.mockResolvedValue({ ok: false, status: 403, error: "x" });
    await POST(postRequest({ file: jpg() }), params());
    expect(uploadMock.mock.calls[0][0].auth_scope).toBeUndefined();
  });

  it("propaga status de error del servicio", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t" } });
    uploadMock.mockResolvedValue({ ok: false, status: 403, error: "Modo solo lectura." });
    const res = await POST(postRequest({ file: jpg() }), params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Modo solo lectura." });
  });
});

describe("GET /api/avatars/clients/[id]", () => {
  it("no autenticado -> 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/avatars/clients/client-1"), params());
    expect(res.status).toBe(401);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("1. autorizado -> imagen con Cache-Control private, no-store y nosniff", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t" } });
    readMock.mockResolvedValue({ ok: true, body: Buffer.from("img"), contentType: "image/webp" });
    const res = await GET(new NextRequest("http://localhost/api/avatars/clients/client-1?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("cache-control")).not.toMatch(/max-age/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("img");
  });

  it("D (HTTP). la versión del query nunca llega al servicio: solo (sessionUser, id)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t" } });
    readMock.mockResolvedValue({ ok: true, body: Buffer.from("img"), contentType: "image/webp" });
    await GET(
      new NextRequest("http://localhost/api/avatars/clients/client-1?v=00000000-0000-4000-8000-000000000000&path=tenants/x"),
      params(),
    );
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(readMock.mock.calls[0]).toHaveLength(2);
    expect(readMock.mock.calls[0][1]).toBe("client-1");
  });

  it("2/3. ninguna respuesta de avatar (éxito o error) anuncia max-age > 0", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t" } });
    const results = [
      { ok: true, body: Buffer.from("img"), contentType: "image/webp" },
      { ok: false, status: 404, error: "Cliente no encontrado." },
      { ok: false, status: 502, error: "No se pudo cargar la imagen." },
      { ok: false, status: 503, error: "Almacenamiento de avatares no configurado." },
    ];
    for (const r of results) {
      readMock.mockResolvedValueOnce(r);
      const res = await GET(new NextRequest("http://localhost/api/avatars/clients/client-1"), params());
      const cc = res.headers.get("cache-control") ?? "";
      expect(cc).toContain("no-store");
      const maxAge = /max-age=(\d+)/.exec(cc);
      expect(maxAge === null || Number(maxAge[1]) === 0).toBe(true);
    }
  });

  it("GET 502 de Storage -> 502 genérico no-store (no 404)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t" } });
    readMock.mockResolvedValue({ ok: false, status: 502, error: "No se pudo cargar la imagen." });
    const res = await GET(new NextRequest("http://localhost/api/avatars/clients/client-1"), params());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "No se pudo cargar la imagen." });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("no autorizado -> 404 no-store", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "super_admin", tenant_id: "t" } });
    readMock.mockResolvedValue({ ok: false, status: 404, error: "Cliente no encontrado." });
    const res = await GET(new NextRequest("http://localhost/api/avatars/clients/client-1"), params());
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
