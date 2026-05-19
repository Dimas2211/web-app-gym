// commerce/dte — dte-signer.config.ts

export interface DteSignerConfig {
  signerUrl:  string;
  timeoutMs:  number;
  healthUrl:  string;
}

function resolveHealthUrl(signerUrl: string): string {
  const base = signerUrl.endsWith("/") ? signerUrl : `${signerUrl}/`;
  return `${base}status`;
}

export function getDteSignerConfig(): DteSignerConfig {
  const signerUrl =
    process.env["DTE_SIGNER_URL"] ?? "http://localhost:8113/firma/firmardocumento/";

  const timeoutMs =
    Number(process.env["DTE_SIGNER_TIMEOUT_MS"] ?? "10000");

  return {
    signerUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000,
    healthUrl: resolveHealthUrl(signerUrl),
  };
}
