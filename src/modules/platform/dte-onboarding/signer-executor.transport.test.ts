import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSignerExecutorTransport } from "./signer-executor.transport";

const url = "https://private-host.example.test/v1/execute";
const secret = "s".repeat(64);
const params = {
  spec: {
    slug: "testing",
    environment: "TEST",
    hostname: "firmador-testing-test.getzolvi.com",
    cpanelUser: "getzolvi",
    nit: "01234567890123",
    port: 8120,
    dteIssuerConfigId: "00000000-0000-4000-8000-000000000001",
  },
};

describe("HttpSignerExecutorTransport — safe network diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs an allowlisted nested network cause, never secrets or body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const err = Object.assign(new Error("private URL and secret"), { code: "ETIMEDOUT" });
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: err }));
    const transport = new HttpSignerExecutorTransport(url, secret, fetchMock as unknown as typeof fetch);
    const result = await transport.call("inspect", params);

    expect(result).toMatchObject({ ok: false, code: "EXECUTOR_UNREACHABLE" });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain("op=inspect result=UNREACHABLE cause_codes=ETIMEDOUT");
    expect(logged).not.toContain(url);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain("private URL");
    expect(logged).not.toContain("01234567890123");
  });

  it("redacts untrusted cause codes and still classifies failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error("secret"), { code: "SECRET_KEY_VALUE" }));
    const transport = new HttpSignerExecutorTransport(url, secret, fetchMock as unknown as typeof fetch);
    const result = await transport.call("inspect", params);
    expect(result.code).toBe("EXECUTOR_UNREACHABLE");
    expect(String(warn.mock.calls[0][0])).toContain("cause_codes=UNKNOWN_CAUSE_CODE");
    expect(String(warn.mock.calls[0][0])).not.toContain("SECRET_KEY_VALUE");
  });

  it("preserves timeout classification and does not leak abort details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = Object.assign(new Error("sensitive abort context"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(error);
    const transport = new HttpSignerExecutorTransport(url, secret, fetchMock as unknown as typeof fetch);
    const result = await transport.call("inspect", params);
    expect(result.code).toBe("EXECUTOR_TIMEOUT");
    expect(String(warn.mock.calls[0][0])).toContain("op=inspect result=TIMEOUT cause_codes=NO_CAUSE_CODE");
    expect(String(warn.mock.calls[0][0])).not.toContain("sensitive abort context");
  });

  it("does not warn for valid executor response", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true, op: "inspect" }) });
    const transport = new HttpSignerExecutorTransport(url, secret, fetchMock as unknown as typeof fetch);
    const result = await transport.call("inspect", params);
    expect(result).toMatchObject({ ok: true, op: "inspect" });
    expect(warn).not.toHaveBeenCalled();
  });
});
