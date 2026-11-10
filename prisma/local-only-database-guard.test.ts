import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalOnlyDatabase, checkLocalOnlyDatabase } from "./local-only-database-guard";

// Entradas sintéticas: ninguna URL corresponde a una base real.
const LOCAL = "postgresql://dev:devpass@localhost:5432/zolvi_local";
const REMOTE = "postgresql://app:s3cr3t@db.internal.example.com:5432/zolvi";
const SUPABASE = "postgresql://postgres.abcdefghijklmnop:s3cr3t@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const rejected = (env: Record<string, string | undefined>) => {
  const r = checkLocalOnlyDatabase(env);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.reason;
};

describe("checkLocalOnlyDatabase", () => {
  it("permite PostgreSQL local en desarrollo (localhost, 127.0.0.1, ::1)", () => {
    for (const url of [LOCAL, "postgres://u:p@127.0.0.1:5432/db", "postgresql://u:p@[::1]:5432/db"]) {
      expect(checkLocalOnlyDatabase({ NODE_ENV: "development", DATABASE_URL: url, DIRECT_URL: url })).toEqual({ ok: true });
    }
    expect(checkLocalOnlyDatabase({ DATABASE_URL: LOCAL })).toEqual({ ok: true });
  });

  it("rechaza un host PostgreSQL remoto", () => {
    expect(rejected({ NODE_ENV: "development", DATABASE_URL: REMOTE })).toContain("DATABASE_URL");
  });

  it("rechaza una URL de Supabase aunque la base se llame como una local", () => {
    rejected({ DATABASE_URL: SUPABASE });
    rejected({ DATABASE_URL: "postgresql://u:p@db.abcdefghijklmnop.supabase.co:5432/zolvi_local" });
  });

  it("rechaza NODE_ENV=production aunque la base sea local", () => {
    expect(rejected({ NODE_ENV: "production", DATABASE_URL: LOCAL, DIRECT_URL: LOCAL })).toContain("production");
    rejected({ NODE_ENV: " Production ", DATABASE_URL: LOCAL });
  });

  it("rechaza la ejecución dentro de Vercel", () => {
    rejected({ VERCEL: "1", DATABASE_URL: LOCAL });
    rejected({ VERCEL_ENV: "preview", DATABASE_URL: LOCAL });
  });

  it("rechaza DIRECT_URL remoto aunque DATABASE_URL sea local", () => {
    expect(rejected({ DATABASE_URL: LOCAL, DIRECT_URL: SUPABASE })).toContain("DIRECT_URL");
    expect(rejected({ DATABASE_URL: LOCAL, DIRECT_URL: "   " })).toContain("DIRECT_URL");
  });

  it("rechaza URLs malformadas, ausentes o ambiguas", () => {
    rejected({});
    rejected({ DATABASE_URL: "" });
    rejected({ DATABASE_URL: "not a url" });
    rejected({ DATABASE_URL: "postgresql://user:p@ss:word@" });
    rejected({ DATABASE_URL: "mysql://u:p@localhost:3306/db" });
    rejected({ DATABASE_URL: "postgresql://u:p@localhost.evil.example.com:5432/db" });
    rejected({ DATABASE_URL: "postgresql://u:p@localhost,db.example.com:5432/db" });
    rejected({ DATABASE_URL: "postgresql://u:p@localhost:5432/db?host=db.example.com" });
    rejected({ DATABASE_URL: "postgresql://u:p@localhost:5432/db?hostaddr=10.0.0.5" });
  });

  it("nunca incluye credenciales, host ni URL en el motivo", () => {
    for (const env of [
      { DATABASE_URL: REMOTE },
      { DATABASE_URL: LOCAL, DIRECT_URL: SUPABASE },
      { DATABASE_URL: "postgresql://user:s3cr3t@" },
    ]) {
      const reason = rejected(env);
      for (const leak of ["s3cr3t", "example.com", "supabase", "postgresql://", "app:", "user:"]) {
        expect(reason).not.toContain(leak);
      }
    }
  });
});

describe("assertLocalOnlyDatabase", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aborta con exit 1 sin imprimir la URL", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => assertLocalOnlyDatabase({ DATABASE_URL: SUPABASE }, "seed-x")).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    const printed = log.mock.calls.flat().join(" ");
    expect(printed).toContain("seed-x");
    expect(printed).not.toContain("s3cr3t");
    expect(printed).not.toContain("supabase");
  });

  it("no hace nada en una base local de desarrollo", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    assertLocalOnlyDatabase({ NODE_ENV: "development", DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }, "seed-x");
    expect(exit).not.toHaveBeenCalled();
  });
});
