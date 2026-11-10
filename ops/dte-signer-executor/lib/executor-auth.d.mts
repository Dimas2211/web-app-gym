export interface NonceStore {
  has(key: string, nowMs: number): boolean;
  add(key: string, expMs: number, nowMs: number): boolean;
  size(): number;
}

export function signExecutorRequest(secret: string, body: string): string;
export function createMemoryNonceStore(opts?: { maxEntries?: number }): NonceStore;
export function createFileNonceStore(
  filePath: string,
  opts?: { fs?: unknown; maxEntries?: number },
): NonceStore;
export function createRequestVerifier(
  secret: string,
  opts?: { now?: () => number; skewMs?: number; store?: NonceStore },
): (rawBody: string, signature: unknown) =>
  | { ok: true; request: { op: string; params: unknown; ts: number; nonce: string } }
  | { ok: false; code: string };
