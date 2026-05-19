// commerce/dte — dte-signer.adapter.ts
//
// Adapter HTTP para el firmador oficial MH (svfe-api-firmador).
//
// Hallazgo confirmado en FirmarDocumentoFilter.java + FirmarDocumentoController.java:
//   dteJson se declara como Object en Java. Spring/Jackson lo deserializa
//   como LinkedHashMap desde el JSON del request body. El controller lo
//   re-serializa con ObjectMapper.writeValueAsString() antes de firmar.
//   Por lo tanto, dteJson DEBE enviarse como objeto JSON, NO como string.

import { getDteSignerConfig } from "../config/dte-signer.config";
import type {
  DteSignerInput,
  DteSignerResult,
  DteSignerHealthResult,
} from "../types/dte-signer.types";

// Estructura del response del firmador MH
interface MhSignerResponse {
  status: "OK" | "ERROR" | string;
  body:   unknown;
}

function stripDashes(nit: string): string {
  return nit.replace(/-/g, "");
}

function isMhSignerResponse(value: unknown): value is MhSignerResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "body" in value
  );
}

export class MhHttpDteSignerAdapter {
  async sign(input: DteSignerInput): Promise<DteSignerResult> {
    const { signerUrl, timeoutMs } = getDteSignerConfig();

    const payload = {
      nit:        stripDashes(input.nit),
      passwordPri: input.passwordPri,
      dteJson:    input.dteJson,
      activo:     input.activo ?? true,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(signerUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, errorCode: "SIGNER_TIMEOUT", message: "Firmador no respondió en el tiempo configurado." };
      }
      return { ok: false, errorCode: "SIGNER_UNAVAILABLE", message: "No se pudo conectar con el firmador MH." };
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = await raw.json();
    } catch {
      return {
        ok:         false,
        errorCode:  "SIGNER_INVALID_RESPONSE",
        message:    "Respuesta del firmador no es JSON válido.",
        httpStatus: raw.status,
      };
    }

    if (!isMhSignerResponse(parsed)) {
      return {
        ok:         false,
        errorCode:  "SIGNER_INVALID_RESPONSE",
        message:    "Respuesta del firmador tiene estructura inesperada.",
        httpStatus: raw.status,
      };
    }

    if (parsed.status === "OK") {
      const jws = typeof parsed.body === "string" ? parsed.body.trim() : "";
      if (!jws) {
        return {
          ok:         false,
          errorCode:  "SIGNER_INVALID_RESPONSE",
          message:    "El firmador respondió OK pero body vacío.",
          httpStatus: raw.status,
        };
      }
      return { ok: true, signedJws: jws, signedAt: new Date() };
    }

    // status === "ERROR"
    const errorBody = parsed.body as Record<string, unknown> | null;
    const errorCode = typeof errorBody?.["codigo"] === "string" ? errorBody["codigo"] : "SIGNER_ERROR";
    const message   = typeof errorBody?.["mensaje"] === "string" ? errorBody["mensaje"] : "Error del firmador MH.";

    return { ok: false, errorCode, message, httpStatus: raw.status };
  }

  async checkHealth(): Promise<DteSignerHealthResult> {
    const { healthUrl, timeoutMs } = getDteSignerConfig();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(healthUrl, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, message: "Health check timeout.", httpStatus: undefined };
      }
      return { ok: false, message: "Firmador no disponible." };
    } finally {
      clearTimeout(timer);
    }

    if (raw.ok) {
      return { ok: true };
    }
    return { ok: false, message: "Firmador respondió con error.", httpStatus: raw.status };
  }
}
