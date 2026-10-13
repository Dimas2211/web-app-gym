// ─────────────────────────────────────────────────────────────────
// core/storage — avatar-storage.test.ts
//
// Keys deterministas tenant-aware + adapter S3-compatible con S3Client
// MOCKEADO: los comandos son los reales del SDK, pero `send` es un mock —
// ningún test realiza requests de red ni toca un bucket real.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sendMock, s3ClientCtor } = vi.hoisted(() => ({
  sendMock: vi.fn<(command: unknown) => Promise<unknown>>(async () => ({})),
  s3ClientCtor: vi.fn<(config: unknown) => void>(),
}));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  class FakeS3Client {
    constructor(config: unknown) {
      s3ClientCtor(config);
    }
    send = sendMock;
  }
  return { ...actual, S3Client: FakeS3Client };
});

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import {
  avatarObjectKey,
  avatarInternalUrl,
  isInternalAvatarUrl,
  parseInternalAvatarVersion,
  newAvatarVersion,
} from "./avatar-keys";
import { MAX_AVATAR_UPLOAD_BYTES } from "./avatar-limits";
import { validateAvatarFile } from "./avatar-image";
import {
  createS3AvatarStorage,
  DEFAULT_OBJECT_STORAGE_BUCKET,
  DEFAULT_OBJECT_STORAGE_REGION,
} from "./s3-storage";
import { AvatarStorageNotConfiguredError, AvatarStorageReadError } from "./storage-types";

// Valores de test (ficticios). Ninguno puede aparecer en logs ni errores.
const TEST_ENDPOINT = "https://test-account-endpoint.example.invalid";
const TEST_ACCESS_KEY_ID = "TEST-ACCESS-KEY-ID-should-never-leak";
const TEST_SECRET = "test-secret-access-key-should-never-leak";
const TEST_BUCKET = "test-private-bucket";
const SECRET_KEY = "tenants/tenant-secret/clients/client-secret/avatars/version.webp";

// Error del SDK deliberadamente malicioso: nada de esto puede aparecer en
// logs, errores ni respuestas.
const EVIL_PROVIDER_MESSAGE = `bucket=${TEST_BUCKET} key=${SECRET_KEY} endpoint=${TEST_ENDPOINT} akid=${TEST_ACCESS_KEY_ID} secret=${TEST_SECRET}`;
function evilSdkError() {
  const err = new Error(EVIL_PROVIDER_MESSAGE);
  err.name = "NoSuchKey-provider-internal-name";
  return Object.assign(err, { $metadata: { httpStatusCode: 403, requestId: "req-secret" }, Code: "AccessDenied" });
}
const FORBIDDEN = [
  EVIL_PROVIDER_MESSAGE,
  "NoSuchKey-provider-internal-name",
  "AccessDenied",
  "req-secret",
  TEST_BUCKET,
  DEFAULT_OBJECT_STORAGE_BUCKET,
  "tenants/",
  "tenant-secret",
  "client-secret",
  "version.webp",
  TEST_ENDPOINT,
  "example.invalid",
  TEST_ACCESS_KEY_ID,
  TEST_SECRET,
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

const ENV_KEYS = [
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_FORCE_PATH_STYLE",
];
let saved: Record<string, string | undefined>;

function configure(extra: Record<string, string> = {}) {
  process.env.OBJECT_STORAGE_ENDPOINT = TEST_ENDPOINT;
  process.env.OBJECT_STORAGE_ACCESS_KEY_ID = TEST_ACCESS_KEY_ID;
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = TEST_SECRET;
  Object.assign(process.env, extra);
}

/** Último comando enviado al S3Client mockeado. */
function lastCommand() {
  return sendMock.mock.calls.at(-1)?.[0] as { input: Record<string, unknown> };
}

/** Body de GetObject tal como lo expone el SDK (SdkStreamMixin). */
function sdkBody(text: string) {
  return { transformToByteArray: async () => new TextEncoder().encode(text) };
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  s3ClientCtor.mockClear();
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

describe("createS3AvatarStorage (S3-compatible, S3Client mockeado)", () => {
  it("1. configuración incompleta -> AvatarStorageNotConfiguredError, sin crear cliente", () => {
    expect(() => createS3AvatarStorage()).toThrow(AvatarStorageNotConfiguredError);
    for (const missing of [
      "OBJECT_STORAGE_ENDPOINT",
      "OBJECT_STORAGE_ACCESS_KEY_ID",
      "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ]) {
      configure();
      delete process.env[missing];
      expect(() => createS3AvatarStorage()).toThrow(AvatarStorageNotConfiguredError);
    }
    configure({ OBJECT_STORAGE_ENDPOINT: "not a url" });
    expect(() => createS3AvatarStorage()).toThrow(AvatarStorageNotConfiguredError);
    expect(s3ClientCtor).not.toHaveBeenCalled();
  });

  it("1b. el error de configuración no revela qué variable falta ni sus valores", () => {
    configure();
    delete process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
    let thrown: unknown;
    try {
      createS3AvatarStorage();
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe("Almacenamiento de avatares no configurado.");
    expect((thrown as Error).message).not.toContain("OBJECT_STORAGE");
    expectNoLeak(`${(thrown as Error).message} ${String((thrown as Error).stack)}`);
  });

  it("cliente: endpoint/credenciales server-side, region default auto, virtual-hosted por defecto", () => {
    configure();
    createS3AvatarStorage();
    expect(DEFAULT_OBJECT_STORAGE_REGION).toBe("auto");
    expect(s3ClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: TEST_ENDPOINT,
        region: "auto",
        forcePathStyle: false,
        credentials: { accessKeyId: TEST_ACCESS_KEY_ID, secretAccessKey: TEST_SECRET },
      }),
    );
  });

  it("OBJECT_STORAGE_FORCE_PATH_STYLE: ausente/false/inválido -> false; true -> true", () => {
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, false],
      ["false", false],
      ["true", true],
      [" TRUE ", true],
      ["1", false],
      ["yes", false],
      ["", false],
    ];
    for (const [value, expected] of cases) {
      s3ClientCtor.mockClear();
      configure();
      if (value === undefined) delete process.env.OBJECT_STORAGE_FORCE_PATH_STYLE;
      else process.env.OBJECT_STORAGE_FORCE_PATH_STYLE = value;
      createS3AvatarStorage();
      expect(s3ClientCtor).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: expected }));
    }
  });

  it("OBJECT_STORAGE_FORCE_PATH_STYLE nunca aparece en logs/errores", async () => {
    configure({ OBJECT_STORAGE_FORCE_PATH_STYLE: "path-style-marker-should-never-leak" });
    const s = createS3AvatarStorage();
    for (const run of [
      () => s.put(SECRET_KEY, Buffer.from("x"), "image/webp"),
      () => s.get(SECRET_KEY),
      () => s.remove(SECRET_KEY),
    ]) {
      sendMock.mockRejectedValueOnce(evilSdkError());
      const { logged, surfaced } = await captureSanitized(run);
      for (const text of [logged, surfaced]) {
        expect(text).not.toContain("path-style-marker-should-never-leak");
        expect(text).not.toContain("FORCE_PATH_STYLE");
        expectNoLeak(text);
      }
    }
  });

  it("respeta OBJECT_STORAGE_REGION", () => {
    configure({ OBJECT_STORAGE_REGION: "us-east-1" });
    createS3AvatarStorage();
    expect(s3ClientCtor).toHaveBeenCalledWith(expect.objectContaining({ region: "us-east-1" }));
  });

  it("2/3/4/13. PutObject: bucket default zolvi-private, key del lifecycle, image/webp, sin ACL", async () => {
    configure();
    const key = "tenants/t/clients/c/avatars/11111111-1111-4111-8111-111111111111.webp";
    await createS3AvatarStorage().put(key, Buffer.from("x"), "image/webp");

    expect(DEFAULT_OBJECT_STORAGE_BUCKET).toBe("zolvi-private");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = lastCommand();
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({ Bucket: "zolvi-private", Key: key, ContentType: "image/webp" });
    expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
    expect(cmd.input).not.toHaveProperty("ACL");
    expect(JSON.stringify(cmd.input)).not.toContain("public-read");
  });

  it("2b. respeta OBJECT_STORAGE_BUCKET en put/get/remove", async () => {
    configure({ OBJECT_STORAGE_BUCKET: "custom-bucket" });
    const s = createS3AvatarStorage();
    await s.put("k", Buffer.from("x"), "image/webp");
    expect(lastCommand().input.Bucket).toBe("custom-bucket");
    sendMock.mockResolvedValueOnce({ Body: sdkBody("i"), ContentType: "image/webp" });
    await s.get("k");
    expect(lastCommand()).toBeInstanceOf(GetObjectCommand);
    expect(lastCommand().input).toEqual({ Bucket: "custom-bucket", Key: "k" });
    await s.remove("k");
    expect(lastCommand()).toBeInstanceOf(DeleteObjectCommand);
    expect(lastCommand().input).toEqual({ Bucket: "custom-bucket", Key: "k" });
  });

  it("5. GetObject devuelve Buffer correctamente", async () => {
    configure();
    sendMock.mockResolvedValueOnce({ Body: sdkBody("img"), ContentType: "image/webp" });
    const got = await createS3AvatarStorage().get("k");
    expect(Buffer.isBuffer(got.body)).toBe(true);
    expect(got.body.toString()).toBe("img");
    expect(got.contentType).toBe("image/webp");
  });

  it("4b. upload: excepción del SDK con message malicioso -> log y error sanitizados", async () => {
    configure();
    sendMock.mockRejectedValueOnce(evilSdkError());
    const { thrown, logged, surfaced } = await captureSanitized(() =>
      createS3AvatarStorage().put(SECRET_KEY, Buffer.from("x"), "image/webp"),
    );
    expect(thrown).toBeInstanceOf(Error);
    expect(logged).toBe(JSON.stringify([["[s3-storage] upload failed"]]));
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("6. download: excepción del SDK con message malicioso -> AvatarStorageReadError sanitizado", async () => {
    configure();
    sendMock.mockRejectedValueOnce(evilSdkError());
    const { thrown, logged, surfaced } = await captureSanitized(() => createS3AvatarStorage().get(SECRET_KEY));
    expect(thrown).toBeInstanceOf(AvatarStorageReadError);
    expect((thrown as Error).message).toBe("No se pudo cargar la imagen.");
    expect(logged).toBe(JSON.stringify([["[s3-storage] download failed"]]));
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("6b. download: Body ausente o lectura del stream fallida -> mismo error genérico", async () => {
    configure();
    const s = createS3AvatarStorage();
    sendMock.mockResolvedValueOnce({});
    const a = await captureSanitized(() => s.get(SECRET_KEY));
    expect(a.thrown).toBeInstanceOf(AvatarStorageReadError);
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Promise.reject(evilSdkError()) },
    });
    const b = await captureSanitized(() => s.get(SECRET_KEY));
    expect(b.thrown).toBeInstanceOf(AvatarStorageReadError);
    for (const r of [a, b]) {
      expectNoLeak(r.logged);
      expectNoLeak(r.surfaced);
    }
  });

  it("7. remove: excepción del SDK con message malicioso -> log y error sanitizados", async () => {
    configure();
    sendMock.mockRejectedValueOnce(evilSdkError());
    const { thrown, logged, surfaced } = await captureSanitized(() => createS3AvatarStorage().remove(SECRET_KEY));
    expect(thrown).toBeInstanceOf(Error);
    expect(logged).toBe(JSON.stringify([["[s3-storage] remove failed"]]));
    expectNoLeak(logged);
    expectNoLeak(surfaced);
  });

  it("NoSuchKey / AccessDenied / outage no se distinguen: todos -> AvatarStorageReadError", async () => {
    configure();
    const s = createS3AvatarStorage();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const name of ["NoSuchKey", "AccessDenied", "InvalidAccessKeyId", "ECONNREFUSED"]) {
      sendMock.mockRejectedValueOnce(Object.assign(new Error(name), { name }));
      const err = await s.get("k").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AvatarStorageReadError);
      expect((err as Error).message).toBe("No se pudo cargar la imagen.");
    }
    errSpy.mockRestore();
  });
});
