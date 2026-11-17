// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-contingency-transmission.adapter.test.ts
//
// BUG-2 (CONTINGENCY_AUTH_ISSUER_CREDENTIAL_GAP) — regresión: el adapter
// pedía el token MH con getCachedToken(env) SIN emisor, así que MhAuthAdapter
// nunca leía la DteCredential del emisor (solo el fallback global de TEST).
// Ahora el token y su invalidación en 401 usan la clave emisor+ambiente,
// igual que dte-transmission.adapter.ts y la invalidación (BUG-1).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { MhContingencyTransmissionAdapter } from "./dte-contingency-transmission.adapter";
import type { MhAuthAdapter } from "./dte-auth.adapter";

function fakeAuth() {
  return {
    getCachedToken: vi.fn().mockResolvedValue({ ok: true, authorizationHeader: "Bearer t" }),
    clearTokenCache: vi.fn(),
  };
}

const okBody = { estado: "RECIBIDO", mensaje: "OK", selloRecibido: "S".repeat(40), observaciones: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MhContingencyTransmissionAdapter — credenciales MH por emisor (BUG-2)", () => {
  it("obtiene el token con el issuerConfigId del evento", async () => {
    const auth = fakeAuth();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 })));

    await new MhContingencyTransmissionAdapter(auth as unknown as MhAuthAdapter).transmit({
      environment: "TEST", nit: "06140101011010", signedJws: "a.b.c", issuerConfigId: "issuer-1",
    });

    expect(auth.getCachedToken).toHaveBeenCalledWith("TEST", "issuer-1");
  });

  it("en 401 invalida y renueva el token del MISMO emisor", async () => {
    const auth = fakeAuth();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody), { status: 200 })));

    await new MhContingencyTransmissionAdapter(auth as unknown as MhAuthAdapter).transmit({
      environment: "TEST", nit: "06140101011010", signedJws: "a.b.c", issuerConfigId: "issuer-1",
    });

    expect(auth.clearTokenCache).toHaveBeenCalledWith("TEST", "issuer-1");
    expect(auth.getCachedToken).toHaveBeenNthCalledWith(2, "TEST", "issuer-1");
  });
});
