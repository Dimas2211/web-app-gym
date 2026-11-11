// FISCAL-ONBOARDING — diagnóstico de Apache, helper privilegiado y
// ejecución de procesos. Usa procesos reales SOLO con `node` (timeout y
// ENOENT); nunca invoca cPanel, Apache ni systemctl reales.

import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  sanitizeOutput, diagnose, describeDiagnostic, childEnv, runCommand,
  createHelperApache, createDirectApache, HELPER_OPS, HELPER_RESULT_DIR, APACHE_BIN,
} from "./lib/apache-ops.mjs";
import { runHelperOp } from "./zolvi-apache-helper.mjs";

describe("sanitizeOutput — sin secretos, con la evidencia útil", () => {
  it("redacta API Key (64 hex), Define, PEM, base64 y pares clave=valor; conserva rutas del sistema", () => {
    const key = randomBytes(32).toString("hex");
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
    const b64 = "QWxhZGRpbjpvcGVuIHNlc2FtZQ9QWxhZGRpbjpvcGVuIHNlc2FtZQ9";
    const out = sanitizeOutput([
      `Define ZOLVI_SIGNER_KEY_REC_TEST ${key}`,
      `key leaked ${key}`,
      pem,
      `password=hunter2 token: abc.def`,
      `blob ${b64}`,
      "open /usr/local/cpanel/3rdparty/perl/536/lib/perl5/cpanel_lib/Cpanel/Foo.pm: Read-only file system",
    ].join("\n"));
    expect(out).not.toContain(key);
    expect(out).not.toContain("MIIEvQ");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain(b64);
    expect(out).toContain("/usr/local/cpanel/3rdparty/perl/536/lib/perl5/cpanel_lib/Cpanel/Foo.pm");
    expect(out).toContain("Read-only file system");
  });

  it("devuelve solo la cola acotada (últimas líneas)", () => {
    const out = sanitizeOutput(Array.from({ length: 100 }, (_, i) => `línea ${i}`).join("\n"), { maxLines: 5 });
    expect(out.split("\n")).toEqual(["línea 95", "línea 96", "línea 97", "línea 98", "línea 99"]);
  });
});

describe("diagnose — distingue los tipos de fallo", () => {
  const cases = [
    [{ code: 1, spawnError: "EACCES" }, "SPAWN_FAILED"],
    [{ code: 1, timedOut: true, signal: "SIGTERM", stderr: "Syntax error" }, "TIMEOUT"],
    [{ code: 1, outputOverflow: true }, "OUTPUT_OVERFLOW"],
    [{ code: 255, stderr: "mkdir /etc/foo: Read-only file system" }, "PERMISSION_DENIED"],
    [{ code: 13, stderr: "open: Permission denied" }, "PERMISSION_DENIED"],
    [{ code: 1, stderr: "AH00526: Syntax error on line 3 of /etc/apache2/conf/httpd.conf" }, "CONFIG_ERROR"],
    [{ code: 1, signal: "SIGKILL" }, "SIGNALED"],
    [{ code: 3, stderr: "algo raro" }, "NONZERO_EXIT"],
  ];
  for (const [r, kind] of cases) {
    it(`${kind}`, () => expect(diagnose("rebuild", r).kind).toBe(kind));
  }

  it("el resumen de una línea incluye tipo, código, duración y última línea de error", () => {
    const d = diagnose("rebuild", { code: 255, durationMs: 4200, stderr: "x\nFailed: Read-only file system /etc/userdatadomains" });
    expect(describeDiagnostic(d)).toBe("rebuild PERMISSION_DENIED, exit 255, 4.2s — Failed: Read-only file system /etc/userdatadomains");
  });
});

describe("childEnv / runCommand — procesos hijos", () => {
  it("los hijos no heredan el secreto HMAC ni otras credenciales", () => {
    const env = childEnv({ PATH: "/usr/bin", LANG: "C", DOCKER_CONFIG: "/opt/x/.docker", ZOLVI_SIGNER_EXECUTOR_SECRET: "s", ZOLVI_SIGNER_EXECUTOR_NONCE_FILE: "/x", GITHUB_TOKEN: "t", DB_PASSWORD: "p" });
    expect(env).toEqual({ PATH: "/usr/bin", LANG: "C", DOCKER_CONFIG: "/opt/x/.docker" });
  });

  it("timeout real: timedOut=true con señal, no un 'exit 1' anónimo", async () => {
    const r = await runCommand(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.code).not.toBe(0);
    expect(diagnose("rebuild", r).kind).toBe("TIMEOUT");
  });

  it("binario inexistente: spawnError ENOENT", async () => {
    const r = await runCommand("/no/existe/rebuildhttpdconf", [], { timeoutMs: 2000 });
    expect(r.spawnError).toBe("ENOENT");
    expect(diagnose("rebuild", r).kind).toBe("SPAWN_FAILED");
  });

  it("exit != 0 conserva código y stderr", async () => {
    const r = await runCommand(process.execPath, ["-e", "process.stderr.write('Read-only file system /etc/x'); process.exit(7)"], { timeoutMs: 5000 });
    expect(r).toMatchObject({ code: 7, timedOut: false, spawnError: null });
    expect(diagnose("rebuild", r)).toMatchObject({ kind: "PERMISSION_DENIED", exitCode: 7 });
  });

  it("el hijo no ve el secreto aunque esté en el entorno del ejecutor", async () => {
    process.env.ZOLVI_SIGNER_EXECUTOR_SECRET = "no-debe-verse-0123456789";
    try {
      const r = await runCommand(process.execPath, ["-e", "process.stdout.write(String(process.env.ZOLVI_SIGNER_EXECUTOR_SECRET))"]);
      expect(r.stdout).toBe("undefined");
    } finally {
      delete process.env.ZOLVI_SIGNER_EXECUTOR_SECRET;
    }
  });
});

// ── Helper privilegiado ───────────────────────────────────────────
function memFs() {
  const files = new Map();
  return {
    files,
    readFileSync: (p) => { if (!files.has(p)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return files.get(p); },
    writeFileSync: (p, c) => { files.set(p, String(c)); },
    renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
    mkdirSync: () => {},
  };
}

describe("zolvi-apache-helper — lista cerrada y resultado saneado", () => {
  it("solo rebuild | configtest | graceful; cualquier otra instancia sale 64 sin ejecutar nada", async () => {
    expect(HELPER_OPS).toEqual(["rebuild", "configtest", "graceful"]);
    const calls = [];
    const run = async (...a) => { calls.push(a); return { code: 0 }; };
    for (const op of ["restart", "stop", "../../bin/sh", "rebuild;id", "", undefined]) {
      expect((await runHelperOp(op, { run, fs: memFs() })).exitCode).toBe(64);
    }
    expect(calls).toEqual([]);
  });

  it("ejecuta el comando fijo y escribe el resultado saneado con el InvocationID", async () => {
    const fs = memFs();
    const key = randomBytes(32).toString("hex");
    const calls = [];
    const run = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 255, signal: null, timedOut: false, spawnError: null, durationMs: 1200, stderr: `Define K ${key}\nfailed: Read-only file system /etc/userdatadomains`, stdout: "" }; };
    const out = await runHelperOp("rebuild", { run, fs, env: { INVOCATION_ID: "abc123", ZOLVI_SIGNER_EXECUTOR_SECRET: "x" } });
    expect(calls).toEqual([[APACHE_BIN.rebuild]]);
    expect(out.exitCode).toBe(255);
    const saved = fs.files.get(`${HELPER_RESULT_DIR}/rebuild.json`);
    expect(saved).not.toContain(key);
    expect(JSON.parse(saved)).toMatchObject({ op: "rebuild", invocationId: "abc123", exitCode: 255, stderr: expect.stringContaining("/etc/userdatadomains") });
  });

  it("configtest y graceful usan apachectl con argumentos fijos (graceful, nunca restart)", async () => {
    const calls = [];
    const run = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0 }; };
    await runHelperOp("configtest", { run, fs: memFs(), env: {} });
    await runHelperOp("graceful", { run, fs: memFs(), env: {} });
    expect(calls).toEqual([[APACHE_BIN.apachectl, "-t"], [APACHE_BIN.apachectl, "-k", "graceful"]]);
  });
});

describe("backend helper del ejecutor (systemctl start zolvi-apache-helper@<op>)", () => {
  function systemdSim({ unitMissing = false, stale = false, helperExit = 0, stderr = "" } = {}) {
    const fs = memFs();
    const calls = [];
    let inv = 0;
    const run = async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd !== APACHE_BIN.systemctl) throw new Error("solo systemctl");
      const unit = args.at(-1);
      const op = unit.replace("zolvi-apache-helper@", "").replace(".service", "");
      if (args[0] === "start") {
        if (unitMissing) return { code: 5, stdout: "", stderr: `Failed to start ${unit}: Unit ${unit} not found.` };
        inv += 1;
        if (!stale) fs.files.set(`${HELPER_RESULT_DIR}/${op}.json`, JSON.stringify({ op, invocationId: `inv${inv}`, exitCode: helperExit, signal: null, timedOut: false, spawnError: null, durationMs: 800, stderr, stdout: "" }));
        return { code: helperExit === 0 ? 0 : 1, stdout: "", stderr: helperExit === 0 ? "" : `Job for ${unit} failed.` };
      }
      return { code: 0, stdout: unitMissing ? "\n" : `inv${inv}\n`, stderr: "" };
    };
    return { fs, run, calls };
  }

  it("éxito: invoca solo las unidades fijas", async () => {
    const s = systemdSim();
    const a = createHelperApache(s.run, s.fs);
    expect((await a.rebuild()).ok).toBe(true);
    expect((await a.configtest()).ok).toBe(true);
    expect((await a.graceful()).ok).toBe(true);
    expect(s.calls.filter((c) => c[1] === "start").map((c) => c[2])).toEqual([
      "zolvi-apache-helper@rebuild.service", "zolvi-apache-helper@configtest.service", "zolvi-apache-helper@graceful.service",
    ]);
  });

  it("fallo del rebuild: diagnóstico con el stderr real del helper", async () => {
    const s = systemdSim({ helperExit: 255, stderr: "Read-only file system /etc/userdatadomains.json" });
    const r = await createHelperApache(s.run, s.fs).rebuild();
    expect(r.ok).toBe(false);
    expect(r.diagnostic).toMatchObject({ kind: "PERMISSION_DENIED", exitCode: 255, backend: "helper" });
  });

  it("unidad no instalada: HELPER_UNAVAILABLE", async () => {
    const s = systemdSim({ unitMissing: true });
    expect((await createHelperApache(s.run, s.fs).rebuild()).diagnostic.kind).toBe("HELPER_UNAVAILABLE");
  });

  it("resultado de una invocación anterior: no se acepta (HELPER_RESULT_MISSING)", async () => {
    const s = systemdSim({ stale: true });
    s.fs.files.set(`${HELPER_RESULT_DIR}/rebuild.json`, JSON.stringify({ op: "rebuild", invocationId: "vieja", exitCode: 0 }));
    const r = await createHelperApache(s.run, s.fs).rebuild();
    expect(r).toMatchObject({ ok: false, diagnostic: { kind: "HELPER_RESULT_MISSING" } });
  });

  it("backend directo conserva los comandos históricos", async () => {
    const calls = [];
    const a = createDirectApache(async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0 }; });
    await a.rebuild(); await a.configtest(); await a.graceful();
    expect(calls).toEqual([[APACHE_BIN.rebuild], [APACHE_BIN.apachectl, "-t"], [APACHE_BIN.apachectl, "-k", "graceful"]]);
  });
});
