// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-invalidation-transmission.adapter.test.ts
//
// DTE-INTERNAL-CERTIFICATION — regresión del defecto hallado por la
// certificación interna: el adapter pedía el token MH SIN
// issuerConfigId, así que MhAuthAdapter nunca leía la DteCredential del
// emisor (solo el fallback .env de TEST; en PRODUCTION fallaba
// siempre). Ahora el token y su invalidación en 401 usan la misma
// clave por emisor que dte-transmission.adapter.ts.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { MhInvalidationTransmissionAdapter } from "./dte-invalidation-transmission.adapter";
import type { MhAuthAdapter } from "./dte-auth.adapter";

function fakeAuth() {
  return {
    getCachedToken: vi.fn().mockResolvedValue({ ok: true, authorizationHeader: "Bearer t" }),
    clearTokenCache: vi.fn(),
  };
}

const okBody = { estado: "PROCESADO", selloRecibido: "S".repeat(40), codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MhInvalidationTransmissionAdapter — credenciales MH por emisor", () => {
  it("obtiene el token con el issuerConfigId del DTE original", async () => {
    const auth = fakeAuth();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })));

    const result = await new MhInvalidationTransmissionAdapter(auth as unknown as MhAuthAdapter).transmit({
      environment: "PRODUCTION", issuerConfigId: "issuer-1", signedJws: "a.b.c", version: 2,
    });

    expect(result.ok).toBe(true);
    expect(auth.getCachedToken).toHaveBeenCalledWith("PRODUCTION", "issuer-1");
  });

  it("en 401 invalida y renueva el token del MISMO emisor", async () => {
    const auth = fakeAuth();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody), { status: 200 })));

    await new MhInvalidationTransmissionAdapter(auth as unknown as MhAuthAdapter).transmit({
      environment: "TEST", issuerConfigId: "issuer-1", signedJws: "a.b.c", version: 2,
    });

    expect(auth.clearTokenCache).toHaveBeenCalledWith("TEST", "issuer-1");
    expect(auth.getCachedToken).toHaveBeenNthCalledWith(2, "TEST", "issuer-1");
  });
});
