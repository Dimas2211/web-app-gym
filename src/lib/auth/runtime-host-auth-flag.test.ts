// ─────────────────────────────────────────────────────────────────
// lib/auth — runtime-host-auth-flag.test.ts
//
// FASE VI-C — ETAPA U. undefined/false/inválido → disabled;
// true explícito ("true" o "1") → enabled.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isRuntimeHostAuthEnabled } from "./runtime-host-auth-flag";

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isRuntimeHostAuthEnabled", () => {
  it("undefined → disabled", () => {
    delete process.env.RUNTIME_HOST_AUTH_ENABLED;
    expect(isRuntimeHostAuthEnabled()).toBe(false);
  });

  it('"false" → disabled', () => {
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "false");
    expect(isRuntimeHostAuthEnabled()).toBe(false);
  });

  it("valor inválido → disabled", () => {
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "yes-please");
    expect(isRuntimeHostAuthEnabled()).toBe(false);
  });

  it("cadena vacía → disabled", () => {
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "");
    expect(isRuntimeHostAuthEnabled()).toBe(false);
  });

  it('"true" explícito → enabled', () => {
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    expect(isRuntimeHostAuthEnabled()).toBe(true);
  });

  it('"1" explícito → enabled', () => {
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "1");
    expect(isRuntimeHostAuthEnabled()).toBe(true);
  });

  it('"TRUE" (mayúsculas) → enabled', () => {
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "TRUE");
    expect(isRuntimeHostAuthEnabled()).toBe(true);
  });
});
