// commerce/dte — dte-signer.types.ts

// ── Input ─────────────────────────────────────────────────────────

export interface DteSignerInput {
  nit:        string;
  passwordPri: string;
  dteJson:    unknown;
  activo?:    boolean;
}

// ── Results ───────────────────────────────────────────────────────

export type DteSignerSuccessResult = {
  ok:        true;
  signedJws: string;
  signedAt:  Date;
};

export type DteSignerErrorResult = {
  ok:          false;
  errorCode:   string;
  message:     string;
  httpStatus?: number;
};

export type DteSignerResult = DteSignerSuccessResult | DteSignerErrorResult;

// ── Health ────────────────────────────────────────────────────────

export type DteSignerHealthResult =
  | { ok: true;  message?: string }
  | { ok: false; message: string; httpStatus?: number };

// ── Adapter error codes ───────────────────────────────────────────

export type DteSignerAdapterError =
  | "SIGNER_TIMEOUT"
  | "SIGNER_UNAVAILABLE"
  | "SIGNER_INVALID_RESPONSE";
