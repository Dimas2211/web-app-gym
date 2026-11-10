// FISCAL-ONBOARDING — clasificación de resultados del adapter MariaDB
// INSERT-only. mysql2 simulado: ninguna conexión real.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { createConnectionMock, executeMock, queryMock, endMock } = vi.hoisted(() => ({
  createConnectionMock: vi.fn(),
  executeMock: vi.fn(),
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: { createConnection: createConnectionMock },
}));

import { ExternalDteMariaDbAdapter, classifyMariaDbInsertError } from "./external-dte-mariadb.adapter";

const CONFIG = { host: "h", port: 3306, user: "u", password: "secret-pw", database: "db_x", table: "dtes_x", invalidationTable: "inv_x", enabled: true, timeoutMs: 3000 };

beforeEach(() => {
  createConnectionMock.mockReset();
  executeMock.mockReset();
  queryMock.mockReset();
  endMock.mockReset().mockResolvedValue(undefined);
  createConnectionMock.mockResolvedValue({ execute: executeMock, query: queryMock, end: endMock });
});

function sqlError(props: Record<string, unknown>, message = "err") {
  return Object.assign(new Error(message), props);
}

describe("classifyMariaDbInsertError", () => {
  it("antes de ejecutar -> NOT_INSERTED", () => {
    expect(classifyMariaDbInsertError(new Error("ECONNREFUSED"), "CONNECT")).toBe("NOT_INSERTED");
    expect(classifyMariaDbInsertError(new Error("x"), "VALIDATE")).toBe("NOT_INSERTED");
  });
  it("error SQL no fatal devuelto por el servidor -> NOT_INSERTED", () => {
    expect(classifyMariaDbInsertError(sqlError({ errno: 1146, sqlState: "42S02", code: "ER_NO_SUCH_TABLE", fatal: false }), "EXECUTE")).toBe("NOT_INSERTED");
  });
  it("clave duplicada -> DUPLICATE", () => {
    expect(classifyMariaDbInsertError(sqlError({ errno: 1062, code: "ER_DUP_ENTRY", sqlState: "23000" }), "EXECUTE")).toBe("DUPLICATE");
  });
  it("timeout / conexión perdida / fatal -> UNCERTAIN", () => {
    expect(classifyMariaDbInsertError(sqlError({ code: "PROTOCOL_SEQUENCE_TIMEOUT", fatal: true }), "EXECUTE")).toBe("UNCERTAIN");
    expect(classifyMariaDbInsertError(sqlError({ code: "ECONNRESET" }), "EXECUTE")).toBe("UNCERTAIN");
    expect(classifyMariaDbInsertError(sqlError({ errno: 1053, sqlState: "08S01", fatal: true }), "EXECUTE")).toBe("UNCERTAIN");
  });
});

describe("ExternalDteMariaDbAdapter.insert", () => {
  it("CONFIRMED con affectedRows >= 1; usa INSERT preparado con timeout y contrato json/estado/fechah_creacion", async () => {
    executeMock.mockResolvedValue([{ insertId: 5, affectedRows: 1 }]);
    const r = await new ExternalDteMariaDbAdapter().insert(CONFIG, { a: 1 });
    expect(r).toMatchObject({ ok: true, outcome: "CONFIRMED", affectedRows: 1, targetTable: "dtes_x" });
    const [opts, values] = executeMock.mock.calls[0];
    expect(opts.sql).toBe("INSERT INTO `db_x`.`dtes_x` (`json`, `estado`, `fechah_creacion`) VALUES (?, ?, NOW())");
    expect(opts.timeout).toBe(3000);
    expect(values).toEqual([JSON.stringify({ a: 1 }), "1"]);
    expect(endMock).toHaveBeenCalled();
  });

  it("affectedRows = 0 -> no se declara éxito (UNCERTAIN)", async () => {
    executeMock.mockResolvedValue([{ insertId: 0, affectedRows: 0 }]);
    const r = await new ExternalDteMariaDbAdapter().insert(CONFIG, {});
    expect(r).toMatchObject({ ok: false, outcome: "UNCERTAIN", errorCode: "NO_ROWS_AFFECTED" });
  });

  it("timeout durante la ejecución -> UNCERTAIN", async () => {
    executeMock.mockRejectedValue(sqlError({ code: "PROTOCOL_SEQUENCE_TIMEOUT", fatal: true }, "Query inactivity timeout"));
    const r = await new ExternalDteMariaDbAdapter().insert(CONFIG, {});
    expect(r).toMatchObject({ ok: false, outcome: "UNCERTAIN", errorCode: "INSERT_UNCERTAIN" });
  });

  it("fallo de conexión -> NOT_INSERTED y el mensaje no expone la contraseña", async () => {
    createConnectionMock.mockRejectedValue(new Error("Access denied for user 'u'@'x' (using password: YES) password=secret-pw"));
    const r = await new ExternalDteMariaDbAdapter().insert(CONFIG, {});
    expect(r).toMatchObject({ ok: false, outcome: "NOT_INSERTED" });
    expect(JSON.stringify(r)).not.toContain("secret-pw");
  });

  it("receptor con deduplicación (ER_DUP_ENTRY) -> DUPLICATE tratado como ya entregado", async () => {
    executeMock.mockRejectedValue(sqlError({ errno: 1062, code: "ER_DUP_ENTRY", sqlState: "23000" }));
    const r = await new ExternalDteMariaDbAdapter().insert(CONFIG, {});
    expect(r).toMatchObject({ ok: true, outcome: "DUPLICATE", affectedRows: 0 });
  });

  it("identificador SQL inválido -> NOT_INSERTED sin abrir conexión", async () => {
    const r = await new ExternalDteMariaDbAdapter().insert({ ...CONFIG, table: "x; DROP TABLE y" }, {});
    expect(r).toMatchObject({ ok: false, outcome: "NOT_INSERTED" });
    expect(createConnectionMock).not.toHaveBeenCalled();
  });
});

describe("ExternalDteMariaDbAdapter.testConnectivity — nunca inserta", () => {
  it("EXPLAIN INSERT OK -> INSERT_PLAN_OK; jamás llama execute (INSERT real)", async () => {
    queryMock.mockResolvedValue([[{ id: 1 }]]);
    const r = await new ExternalDteMariaDbAdapter().testConnectivity(CONFIG);
    expect(r).toMatchObject({ ok: true, level: "INSERT_PLAN_OK" });
    expect(queryMock.mock.calls[0][0].sql.startsWith("EXPLAIN INSERT INTO `db_x`.`dtes_x`")).toBe(true);
    expect(executeMock).not.toHaveBeenCalled();
  });
  it("EXPLAIN falla -> CONNECTED (sin validar tabla)", async () => {
    queryMock.mockRejectedValue(sqlError({ errno: 1142, sqlState: "42000" }, "INSERT command denied"));
    const r = await new ExternalDteMariaDbAdapter().testConnectivity(CONFIG);
    expect(r).toMatchObject({ ok: true, level: "CONNECTED", errorCode: "INSERT_PLAN_FAILED" });
  });
  it("sin conexión -> FAILED", async () => {
    createConnectionMock.mockRejectedValue(new Error("ETIMEDOUT"));
    const r = await new ExternalDteMariaDbAdapter().testConnectivity(CONFIG);
    expect(r).toMatchObject({ ok: false, level: "FAILED" });
  });
});
