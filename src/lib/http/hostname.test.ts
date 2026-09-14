// ─────────────────────────────────────────────────────────────────
// lib/http — hostname.test.ts
//
// FASE VI-C — ETAPA U. Certifica normalizeRequestHostname() y
// resolveRequestHostname() de forma pura, sin Request real de Node.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { normalizeRequestHostname, resolveRequestHostname } from "./hostname";

function fakeRequest(headers: Record<string, string>): Request {
  return new Request("http://internal.invalid/", { headers });
}

describe("normalizeRequestHostname", () => {
  it("normaliza a minúsculas", () => {
    expect(normalizeRequestHostname("TrustMe.GetZolvi.com")).toBe("trustme.getzolvi.com");
  });

  it("quita puerto numérico", () => {
    expect(normalizeRequestHostname("trustme.getzolvi.com:443")).toBe("trustme.getzolvi.com");
    expect(normalizeRequestHostname("localhost:3000")).toBe("localhost");
    expect(normalizeRequestHostname("trustme.localhost:3000")).toBe("trustme.localhost");
  });

  it("quita punto final (trailing dot / FQDN)", () => {
    expect(normalizeRequestHostname("trustme.getzolvi.com.")).toBe("trustme.getzolvi.com");
  });

  it("recorta espacios externos", () => {
    expect(normalizeRequestHostname("  trustme.getzolvi.com  ")).toBe("trustme.getzolvi.com");
  });

  it("rechaza URL completa con protocolo", () => {
    expect(normalizeRequestHostname("https://trustme.getzolvi.com")).toBeNull();
    expect(normalizeRequestHostname("http://localhost:3000")).toBeNull();
  });

  it("rechaza valores con path", () => {
    expect(normalizeRequestHostname("trustme.getzolvi.com/login")).toBeNull();
    expect(normalizeRequestHostname("trustme.getzolvi.com/")).toBeNull();
  });

  it("rechaza vacío / null / undefined", () => {
    expect(normalizeRequestHostname("")).toBeNull();
    expect(normalizeRequestHostname("   ")).toBeNull();
    expect(normalizeRequestHostname(null)).toBeNull();
    expect(normalizeRequestHostname(undefined)).toBeNull();
  });

  it("rechaza espacios internos (host inválido)", () => {
    expect(normalizeRequestHostname("trust me.getzolvi.com")).toBeNull();
  });

  it("rechaza puerto no numérico / formato corrupto", () => {
    expect(normalizeRequestHostname("trustme.getzolvi.com:abc")).toBeNull();
    expect(normalizeRequestHostname(":3000")).toBeNull();
  });

  it("rechaza IPv6 defensivamente (múltiples ':' no soportados en VI-C)", () => {
    expect(normalizeRequestHostname("[::1]:3000")).toBeNull();
  });

  it("acepta hosts de un solo label", () => {
    expect(normalizeRequestHostname("localhost")).toBe("localhost");
  });

  it("acepta subdominios con guiones", () => {
    expect(normalizeRequestHostname("cert-runtime.localhost")).toBe("cert-runtime.localhost");
  });
});

describe("resolveRequestHostname", () => {
  it("prioriza x-forwarded-host sobre host", () => {
    const req = fakeRequest({
      "x-forwarded-host": "trustme.getzolvi.com",
      host: "internal-lb.vercel.internal",
    });
    expect(resolveRequestHostname(req)).toBe("trustme.getzolvi.com");
  });

  it("usa host cuando no hay x-forwarded-host", () => {
    const req = fakeRequest({ host: "localhost:3000" });
    expect(resolveRequestHostname(req)).toBe("localhost");
  });

  it("toma la primera entrada de una lista x-forwarded-host separada por comas", () => {
    const req = fakeRequest({
      "x-forwarded-host": "trustme.getzolvi.com, internal-proxy.vercel.internal",
    });
    expect(resolveRequestHostname(req)).toBe("trustme.getzolvi.com");
  });

  it("retorna null si no hay ningún header de host", () => {
    const req = fakeRequest({});
    expect(resolveRequestHostname(req)).toBeNull();
  });

  it("retorna null si el header de host es inválido", () => {
    const req = fakeRequest({ host: "not a host/path" });
    expect(resolveRequestHostname(req)).toBeNull();
  });
});
