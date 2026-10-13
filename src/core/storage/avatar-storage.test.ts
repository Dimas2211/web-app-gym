// ─────────────────────────────────────────────────────────────────
// core/storage — avatar-storage.test.ts
//
// Keys deterministas tenant-aware + adapter Supabase con cliente
// MOCKEADO (nunca red / bucket real).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type StorageErr = { message: string } | null;

const { createClientMock, bucketApi, fromMock } = vi.hoisted(() => {
  const bucketApi = {
    upload: vi.fn(async (): Promise<{ data: unknown; error: StorageErr }> => ({ data: {}, error: null })),
    download: vi.fn(async (): Promise<{ data: Blob | null; error: StorageErr }> => ({ data: null, error: null })),
    remove: vi.fn(async (): Promise<{ data: unknown; error: StorageErr }> => ({ data: [], error: null })),
  };
  const fromMock = vi.fn(() => bucketApi);
  return {
    bucketApi,
    fromMock,
    createClientMock: vi.fn<(...args: unknown[]) => { storage: { from: typeof fromMock } }>(() => ({ storage: { from: fromMock } })),
  };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import {
  avatarObjectKey,
  avatarInternalUrl,
  isInternalAvatarUrl,
  parseInternalAvatarVersion,
  newAvatarVersion,
} from "./avatar-keys";
import { MAX_AVATAR_UPLOAD_BYTES } from "./avatar-limits";
import { validateAvatarFile } from "./avatar-image";
import { createSupabaseAvatarStorage, DEFAULT_AVATAR_BUCKET } from "./supabase-storage";
import { AvatarStorageNotConfiguredError, AvatarStorageReadError } from "./storage-types";

// Mensaje del proveedor deliberadamente malicioso: nada de esto puede
// aparecer en logs, errores ni respuestas.
const EVIL_PROVIDER_MESSAGE =
  "bucket=gym-avatars path=tenants/tenant-secret/clients/client-secret/avatars/version.webp secret=test-secret";
const FORBIDDEN = [
  EVIL_PROVIDER_MESSAGE,
  "gym-avatars",
  "tenants/",
  "tenant-secret",
  "client-secret",
  "version.webp",
  "test-secret",
  "test-key",
  "example.supabase.co",
];

async function captureSanitized(run: () => Promise<unknown>) {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let thrown: unknown = null;
  try {
    await run();
  } catch (err) {
    thrown = err;
  }
  const logged = JSON.stringify(errSpy.mock.calls);
  errSpy.mockRestore();
  const surfaced = thrown instanceof Error ? `${thrown.name} ${thrown.message} ${String(thrown.stack)}` : String(thrown);
  return { thrown, logged, surfaced };
}

function expectNoLeak(text: string) {
  for (const needle of FORBIDDEN) expect(text).not.toContain(needle);
}

const ENV_KEYS = ["SUPABASE_STORAGE_URL", "SUPABASE_STORAGE_SERVICE_ROLE_KEY", "SUPABASE_AVATAR_BUCKET"];
let saved: Record<string, string | undefined>;

function configure(extra: Record<string, string> = {}) {
  process.env.SUPABASE_STORAGE_URL = "https://example.supabase.co";
  process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY = "test-key";
  Object.assign(process.env, extra);
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  createClientMock.mockClear();
  fromMock.mockClear();
  bucketApi.upload.mockClear();
  bucketApi.download.mockClear();
  bucketApi.remove.mockClear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

describe("avatar-keys (objetos versionados)", () => {
  it("key versionado por tenant + entidad + versión (sin nombre original)", () => {
    expect(avatarObjectKey("clients", "tenant-1", "client-1", V1)).toBe(
      `tenants/tenant-1/clients/client-1/avatars/${V1}.webp`,
    );
    expect(avatarObjectKey("users", "tenant-1", "user-1", V1)).toBe(
      `tenants/tenant-1/users/user-1/avatars/${V1}.webp`,
    );
    expect(avatarObjectKey("clients", "tenant-1", "c", V1)).not.toBe(avatarObjectKey("clients", "tenant-2", "c", V1));
    expect(avatarObjectKey("clients", "tenant-1", "c", V1)).not.toBe(avatarObjectKey("clients", "tenant-1", "c", V2));
  });

  it("newAvatarVersion genera UUIDs distintos y válidos para key", () => {
    const a = newAvatarVersion();
    const b = newAvatarVersion();
    expect(a).not.toBe(b);
    expect(() => avatarObjectKey("clients", "t", "c", a)).not.toThrow();
  });

  it("rechaza identificadores/versiones con traversal o formato inválido", () => {
    expect(() => avatarObjectKey("clients", "../tenant-2", "c", V1)).toThrow();
    expect(() => avatarObjectKey("clients", "t", "a/b", V1)).toThrow();
    expect(() => avatarObjectKey("clients", "t", "", V1)).toThrow();
    expect(() => avatarObjectKey("clients", "t", "c", "../../x")).toThrow();
    expect(() => avatarObjectKey("clients", "t", "c", "1712345678")).toThrow();
    expect(() => avatarInternalUrl("clients", "c", "evil")).toThrow();
  });

  it("parseInternalAvatarVersion: solo la versión de ESTA entidad, formato estricto", () => {
    const url = avatarInternalUrl("clients", "c1", V1);
    expect(url).toBe(`/api/avatars/clients/c1?v=${V1}`);
    expect(parseInternalAvatarVersion("clients", "c1", url)).toBe(V1);
    expect(isInternalAvatarUrl("clients", "c1", url)).toBe(true);
    expect(parseInternalAvatarVersion("clients", "c10", url)).toBeNull();
    expect(parseInternalAvatarVersion("users", "c1", url)).toBeNull();
    expect(parseInternalAvatarVersion("clients", "c1", `${url}&x=1`)).toBeNull();
    expect(parseInternalAvatarVersion("clients", "c1", "/api/avatars/clients/c1?v=123")).toBeNull();
    expect(parseInternalAvatarVersion("clients", "c1", "/uploads/avatars/c1.jpg")).toBeNull();
    expect(parseInternalAvatarVersion("clients", "c1", null)).toBeNull();
  });
});

describe("límite de tamaño (fuente única)", () => {
  it("MAX_AVATAR_UPLOAD_BYTES = 4 MiB; exactamente 4 MiB permitido, +1 byte rechazado", () => {
    expect(MAX_AVATAR_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
    expect(validateAvatarFile({ type: "image/png", size: MAX_AVATAR_UPLOAD_BYTES })).toEqual({ ok: true });
    expect(validateAvatarFile({ type: "image/png", size: MAX_AVATAR_UPLOAD_BYTES + 1 })).toMatchObject({
      ok: false,
      status: 413,
      error: "El archivo supera el límite de 4 MB.",
    });
  });
});

describe("createSupabaseAvatarStorage", () => {
  it("sin variables -> AvatarStorageNotConfiguredError (sin crear cliente)", () => {
    expect(() => createSupabaseAvatarStorage()).toThrow(AvatarStorageNotConfiguredError);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("bucket default gym-avatars, upsert=false (inmutable), sesión no persistida", async () => {
    configure();
    const s = createSupabaseAvatarStorage();
    await s.put("tenants/t/clients/c/avatar.webp", Buffer.from("x"), "image/webp");

    expect(DEFAULT_AVATAR_BUCKET).toBe("gym-avatars");
    expect(fromMock).toHaveBeenCalledWith("gym-avatars");
    expect(bucketApi.upload).toHaveBeenCalledWith(
      "tenants/t/clients/c/avatar.webp",
      expect.any(Buffer),
      expect.objectContaining({ upsert: false, contentType: "image/webp" }),
    );
    const opts = createClientMock.mock.calls[0][2] as { auth: { persistSession: boolean } };
    expect(opts.auth.persistSession).toBe(false);
  });

  it("respeta SUPABASE_AVATAR_BUCKET", async () => {
    configure({ SUPABASE_AVATAR_BUCKET: "custom-bucket" });
    bucketApi.download.mockResolvedValueOnce({ data: new Blob(["i"], { type: "image/webp" }), error: null });
    await createSupabaseAvatarStorage().get("k");
    expect(fromMock).toHaveBeenCalledWith("custom-bucket");
  });

  it("4. upload: error del proveedor con message malicioso -> log y error sanitizados", async () => {
    configure({ SUPABASE_STORAGE_SERVICE_ROLE_KEY: "test-secret" });
    bucketApi.upload.mockResolvedValueOnce({ data: null, error: { message: EVIL_PROVIDER_MESSAGE } });
    const { thrown, logged, surfaced } = await captureSanitized(() =>
      createSupabaseAvatarStorage().put("tenants/tenant-secret/clients/client-secret/avatars/version.webp", Buffer.from("x"), "image/webp"),
    );
    expect(thrown).toBeInstanceOf(Error);
    expect(logged).toContain("[supabase-storage] upload failed");
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("5. download: error del proveedor con message malicioso -> AvatarStorageReadError sanitizado", async () => {
    configure({ SUPABASE_STORAGE_SERVICE_ROLE_KEY: "test-secret" });
    bucketApi.download.mockResolvedValueOnce({ data: null, error: { message: EVIL_PROVIDER_MESSAGE } });
    const { thrown, logged, surfaced } = await captureSanitized(() =>
      createSupabaseAvatarStorage().get("tenants/tenant-secret/clients/client-secret/avatars/version.webp"),
    );
    expect(thrown).toBeInstanceOf(AvatarStorageReadError);
    expect((thrown as Error).message).toBe("No se pudo cargar la imagen.");
    expect(logged).toContain("[supabase-storage] download failed");
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("5b. download: excepción del SDK con message malicioso -> mismo error sanitizado", async () => {
    configure({ SUPABASE_STORAGE_SERVICE_ROLE_KEY: "test-secret" });
    bucketApi.download.mockRejectedValueOnce(new Error(EVIL_PROVIDER_MESSAGE));
    const { thrown, logged, surfaced } = await captureSanitized(() =>
      createSupabaseAvatarStorage().get("tenants/tenant-secret/clients/client-secret/avatars/version.webp"),
    );
    expect(thrown).toBeInstanceOf(AvatarStorageReadError);
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("6. remove: error del proveedor con message malicioso -> log y error sanitizados", async () => {
    configure({ SUPABASE_STORAGE_SERVICE_ROLE_KEY: "test-secret" });
    bucketApi.remove.mockResolvedValueOnce({ data: null, error: { message: EVIL_PROVIDER_MESSAGE } });
    const { thrown, logged, surfaced } = await captureSanitized(() =>
      createSupabaseAvatarStorage().remove("tenants/tenant-secret/clients/client-secret/avatars/version.webp"),
    );
    expect(thrown).toBeInstanceOf(Error);
    expect(logged).toContain("[supabase-storage] remove failed");
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("download: objeto ausente también lanza (sin colapsar a null); existente -> Buffer", async () => {
    configure();
    const s = createSupabaseAvatarStorage();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bucketApi.download.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
    await expect(s.get("k")).rejects.toBeInstanceOf(AvatarStorageReadError);
    bucketApi.download.mockResolvedValueOnce({ data: null, error: null });
    await expect(s.get("k")).rejects.toBeInstanceOf(AvatarStorageReadError);
    errSpy.mockRestore();
    bucketApi.download.mockResolvedValueOnce({ data: new Blob(["img"], { type: "image/webp" }), error: null });
    const got = await s.get("k");
    expect(got.contentType).toBe("image/webp");
    expect(got.body.toString()).toBe("img");
  });
});
