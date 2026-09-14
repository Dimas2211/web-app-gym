// ─────────────────────────────────────────────────────────────────
// lib/platform — platform-hosts.test.ts
//
// FASE VI-C — ETAPA U/V. Certifica isPlatformHostname() y
// getConfiguredPlatformHosts() con distintos valores de env,
// restaurando siempre el entorno original (vi.stubEnv/unstubAllEnvs).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPlatformHostname, getConfiguredPlatformHosts } from "./platform-hosts";

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getConfiguredPlatformHosts", () => {
  it("retorna [] si PLATFORM_HOSTS no está definida", () => {
    vi.stubEnv("PLATFORM_HOSTS", "");
    expect(getConfiguredPlatformHosts()).toEqual([]);
  });

  it("parsea y normaliza una lista separada por comas", () => {
    vi.stubEnv(
      "PLATFORM_HOSTS",
      "Web-App-Gym-Delta.vercel.app, getzolvi.com ,www.getzolvi.com",
    );
    expect(getConfiguredPlatformHosts()).toEqual([
      "web-app-gym-delta.vercel.app",
      "getzolvi.com",
      "www.getzolvi.com",
    ]);
  });

  it("descarta entradas inválidas sin romper el resto", () => {
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com,https://bad.com,  ,valid.host");
    expect(getConfiguredPlatformHosts()).toEqual(["getzolvi.com", "valid.host"]);
  });
});

describe("isPlatformHostname", () => {
  it("null nunca es plataforma", () => {
    expect(isPlatformHostname(null)).toBe(false);
  });

  it("hostname configurado explícitamente en PLATFORM_HOSTS es plataforma", () => {
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com,www.getzolvi.com");
    vi.stubEnv("NODE_ENV", "production");
    expect(isPlatformHostname("getzolvi.com")).toBe(true);
    expect(isPlatformHostname("www.getzolvi.com")).toBe(true);
  });

  it("en producción, localhost NO es plataforma por defecto", () => {
    vi.stubEnv("PLATFORM_HOSTS", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isPlatformHostname("localhost")).toBe(false);
    expect(isPlatformHostname("127.0.0.1")).toBe(false);
  });

  it("fuera de producción, localhost y 127.0.0.1 son plataforma por defecto", () => {
    vi.stubEnv("PLATFORM_HOSTS", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(isPlatformHostname("localhost")).toBe(true);
    expect(isPlatformHostname("127.0.0.1")).toBe(true);
  });

  it("un hostname *.vercel.app arbitrario NO es plataforma automáticamente", () => {
    vi.stubEnv("PLATFORM_HOSTS", "web-app-gym-delta.vercel.app");
    vi.stubEnv("NODE_ENV", "production");
    expect(isPlatformHostname("some-preview-xyz123.vercel.app")).toBe(false);
    expect(isPlatformHostname("web-app-gym-delta.vercel.app")).toBe(true);
  });

  it("hostname runtime de cliente no está en PLATFORM_HOSTS → false", () => {
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("NODE_ENV", "production");
    expect(isPlatformHostname("trustme.getzolvi.com")).toBe(false);
  });
});
