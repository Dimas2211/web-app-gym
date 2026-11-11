// FISCAL-ONBOARDING — diagnóstico de Apache, helper privilegiado y
// ejecución de procesos. Usa procesos reales SOLO con `node` (timeout y
// ENOENT); nunca invoca cPanel, Apache ni systemctl reales.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  sanitizeOutput, diagnose, describeDiagnostic, childEnv, runCommand, readHelperResult,
  createHelperApache, createDirectApache, HELPER_OPS, HELPER_RESULT_DIR, APACHE_BIN, HELPER_RESULT_MAX_BYTES,
  helperResultPath, parseHelperInstance,
} from "./lib/apache-ops.mjs";
import { runHelperOp, HELPER_EXIT } from "./zolvi-apache-helper.mjs";

const INV = () => randomBytes(16).toString("hex");

// ── Saneamiento ────────────────────────────────────────────────────
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
    for (const s of [key, "MIIEvQ", "hunter2", "abc.def", b64]) expect(out).not.toContain(s);
    expect(out).toContain("/usr/local/cpanel/3rdparty/perl/536/lib/perl5/cpanel_lib/Cpanel/Foo.pm");
    expect(out).toContain("Read-only file system");
  });

  // Regresión: formatos que la primera versión NO cubría.
  const leaks = [
    ["variable de entorno compuesta", "ZOLVI_SIGNER_EXECUTOR_SECRET=s3cr3t-valor-largo", "s3cr3t-valor-largo"],
    ["JSON con comillas", '{"apiKey":"k-abc-123","dbPassword": "pw-xyz"}', "k-abc-123"],
    ["JSON con comillas (2)", '{"apiKey":"k-abc-123","dbPassword": "pw-xyz"}', "pw-xyz"],
    ["cabecera del firmador", "X-DTE-Signer-Key: deadbeefcafe", "deadbeefcafe"],
    ["credenciales en URL", "connect mysql://zolvi:Pa55w0rd@127.0.0.1:3306/dte failed", "Pa55w0rd"],
    ["Bearer", "Authorization: Bearer abcDEF123456789", "abcDEF123456789"],
    ["Basic", "Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA"],
    ["JWT", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl", "eyJzdWIiOiIxMjMifQ"],
    ["base64url largo", "blob aZ9_-Kq3xY7mN2pL8vR4tW6uE1oI5sD0fG", "aZ9_-Kq3xY7mN2pL8vR4tW6uE1oI5sD0fG"],
    ["hex de 24-31", "id 0123456789abcdef01234567", "0123456789abcdef01234567"],
    ["certificado MH (XML) — clave privada", "<privateKey><encodied>QUJDREVGR0hJSktMTU5PUA==</encodied></privateKey>", "QUJDREVGR0hJSktMTU5PUA"],
    ["certificado MH (XML) — clave", "<clave>MiClaveSecreta</clave>", "MiClaveSecreta"],
    ["NIT con guiones", "emisor 0614-010190-101-3", "0614-010190-101-3"],
    ["NIT 14 dígitos", "cert/06140101901013.crt", "06140101901013"],
    ["DUI", "dui 01234567-8", "01234567-8"],
    ["correo", "contacto admin@hospital.example.com", "admin@hospital.example.com"],
    ["PEM truncado sin BEGIN", "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----", "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7"],
    ["contraseña en español", "contraseña: Hospital2026!", "Hospital2026!"],
    ["cookie", "Cookie=session_id_ABC123xyz", "session_id_ABC123xyz"],
    ["clave corta 'pass'", "db_pass=Clave2026", "Clave2026"],
  ];
  for (const [name, input, secret] of leaks) {
    it(`no filtra: ${name}`, () => expect(sanitizeOutput(input)).not.toContain(secret));
  }

  it("elimina secuencias de control/terminal que podrían ocultar o falsear el log", () => {
    const out = sanitizeOutput("ok\u001b[2K\u001b]0;titulo\u0007\u0000\u0008fin");
    expect(out).toBe("okfin");
  });

  it("no destruye la evidencia: errores de Apache, rutas, 'token' en sintaxis y marcas de tiempo", () => {
    const text = [
      "AH00526: Syntax error on line 12 of /etc/apache2/conf/httpd.conf: unexpected token",
      "Tests passed: rebuild bypassed nothing",
      "2026-11-10 22:28:13.123456789 -0600 /etc/apache2/conf.d/userdata/ssl/2_4/getzolvi/firmador-rec-test.getzolvi.com",
    ].join("\n");
    expect(sanitizeOutput(text)).toBe(text);
  });

  it("devuelve solo la cola acotada (últimas líneas)", () => {
    const out = sanitizeOutput(Array.from({ length: 100 }, (_, i) => `línea ${i}`).join("\n"), { maxLines: 5 });
    expect(out.split("\n")).toEqual(["línea 95", "línea 96", "línea 97", "línea 98", "línea 99"]);
  });

  it("CLI de saneamiento (usado por el diagnóstico del VPS) aplica las mismas reglas en flujo", async () => {
    const key = randomBytes(32).toString("hex");
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("./lib/sanitize-cli.mjs", import.meta.url))], {
      input: Array.from({ length: 300 }, (_, i) => `l${i} Define K ${key}`).join("\n"), encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(key);
    expect(r.stdout.split("\n").filter(Boolean)).toHaveLength(300); // sin recorte de líneas
  });
});

// ── Clasificación ──────────────────────────────────────────────────
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

// ── Procesos hijos ────────────────────────────────────────────────
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

// ── fs simulado con metadatos (lstat) ─────────────────────────────
function memFs() {
  const files = new Map(); // path -> { content, uid, mode, symlink }
  const dirs = new Map([[HELPER_RESULT_DIR, { uid: 0, mode: 0o700, symlink: false }]]);
  const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return {
    files, dirs,
    put(p, content, meta = {}) { files.set(p, { content: String(content), uid: 0, mode: 0o600, symlink: false, ...meta }); },
    readFileSync: (p) => { if (!files.has(p)) throw enoent(); return files.get(p).content; },
    writeFileSync: (p, c, o = {}) => {
      if (o.flag === "wx" && files.has(p)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
      files.set(p, { content: String(c), uid: 0, mode: o.mode ?? 0o644, symlink: false });
    },
    renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
    unlinkSync: (p) => { if (!files.delete(p)) throw enoent(); },
    mkdirSync: (p, o = {}) => { if (!dirs.has(p)) dirs.set(p, { uid: 0, mode: o.mode ?? 0o755, symlink: false }); },
    lstatSync: (p) => {
      if (dirs.has(p)) { const d = dirs.get(p); return { uid: d.uid, mode: d.mode, size: 0, isDirectory: () => !d.symlink, isFile: () => false }; }
      if (files.has(p)) { const f = files.get(p); return { uid: f.uid, mode: f.mode, size: Buffer.byteLength(f.content), isDirectory: () => false, isFile: () => !f.symlink }; }
      throw enoent();
    },
  };
}

// ── Helper privilegiado (script) ──────────────────────────────────
const NONCE = () => randomBytes(8).toString("hex");

describe("zolvi-apache-helper — instancias no autorizadas, contexto systemd y directorio seguro", () => {
  const okRun = (calls) => async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0, stdout: "", stderr: "" }; };

  it("instancia = <rebuild|configtest|graceful>-<16 hex>, comparación exacta: cualquier otra sale 64 sin ejecutar nada", async () => {
    expect(HELPER_OPS).toEqual(["rebuild", "configtest", "graceful"]);
    const n = NONCE();
    const calls = [];
    for (const inst of [
      // sin nonce (formato anterior) y operaciones ajenas
      "rebuild", "configtest", "graceful", "restart", "stop", "reload", `restart-${n}`, `stop-${n}`,
      // nonce mal formado
      "rebuild-", `rebuild-${n.toUpperCase()}`, `rebuild-${n.slice(1)}`, `rebuild-${n}0`, `rebuild-${"g".repeat(16)}`, `rebuild--${n}`,
      // inyección / escapes / normalización
      `rebuild-${n};id`, `rebuild-${n} `, ` rebuild-${n}`, `Rebuild-${n}`, `rebuild-${n}\n`, `rebuild\\x2d${n}`, `rebuild/${n}`,
      `../../bin/sh-${n}`, `graceful-stop-${n}`, "", undefined, null, [`rebuild-${n}`],
    ]) {
      expect((await runHelperOp(inst, { run: okRun(calls), fs: memFs(), env: { INVOCATION_ID: INV() } })).exitCode).toBe(HELPER_EXIT.OP_NOT_ALLOWED);
    }
    expect(calls).toEqual([]);
    expect(parseHelperInstance(`configtest-${n}`)).toEqual({ op: "configtest", nonce: n });
  });

  it("fuera de systemd (sin INVOCATION_ID válido) no ejecuta nada", async () => {
    const calls = [];
    for (const env of [{}, { INVOCATION_ID: "" }, { INVOCATION_ID: "x".repeat(32) }, { INVOCATION_ID: "../../etc" }]) {
      expect((await runHelperOp(`rebuild-${NONCE()}`, { run: okRun(calls), fs: memFs(), env })).exitCode).toBe(HELPER_EXIT.NOT_UNDER_SYSTEMD);
    }
    expect(calls).toEqual([]);
  });

  it("directorio de resultados inseguro (enlace, no-root, escribible por otros) → 66 sin ejecutar nada", async () => {
    const calls = [];
    for (const meta of [{ symlink: true }, { uid: 1000 }, { mode: 0o777 }, { mode: 0o720 }]) {
      const fs = memFs();
      fs.dirs.set(HELPER_RESULT_DIR, { uid: 0, mode: 0o700, symlink: false, ...meta });
      expect((await runHelperOp(`rebuild-${NONCE()}`, { run: okRun(calls), fs, env: { INVOCATION_ID: INV() } })).exitCode).toBe(HELPER_EXIT.RESULT_DIR_UNSAFE);
    }
    expect(calls).toEqual([]);
  });

  it("ejecuta el comando fijo y escribe el resultado saneado (0600) en <op>-<nonce>.json", async () => {
    const fs = memFs();
    const key = randomBytes(32).toString("hex");
    const inv = INV();
    const n = NONCE();
    const calls = [];
    const run = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 255, signal: null, timedOut: false, spawnError: null, durationMs: 1200, stderr: `Define K ${key}\nfailed: Read-only file system /etc/userdatadomains`, stdout: "" }; };
    const out = await runHelperOp(`rebuild-${n}`, { run, fs, env: { INVOCATION_ID: inv, ZOLVI_SIGNER_EXECUTOR_SECRET: "x" } });
    expect(calls).toEqual([[APACHE_BIN.rebuild]]);
    expect(out.exitCode).toBe(255);
    const saved = fs.files.get(helperResultPath("rebuild", n));
    expect(saved.mode).toBe(0o600);
    expect(saved.content).not.toContain(key);
    expect(JSON.parse(saved.content)).toMatchObject({ op: "rebuild", nonce: n, invocationId: inv, exitCode: 255, stderr: expect.stringContaining("/etc/userdatadomains") });
    expect([...fs.files.keys()].filter((p) => p.endsWith(".tmp"))).toEqual([]);
  });

  it("configtest y graceful usan apachectl con argumentos fijos (graceful, nunca restart); el nonce nunca llega al comando", async () => {
    const calls = [];
    await runHelperOp(`configtest-${NONCE()}`, { run: okRun(calls), fs: memFs(), env: { INVOCATION_ID: INV() } });
    await runHelperOp(`graceful-${NONCE()}`, { run: okRun(calls), fs: memFs(), env: { INVOCATION_ID: INV() } });
    expect(calls).toEqual([[APACHE_BIN.apachectl, "-t"], [APACHE_BIN.apachectl, "-k", "graceful"]]);
  });

  it("la unidad usa %i literal (no %I, que convierte '-' en '/'), un argumento, CollectMode y sin [Install] ni reinicios", () => {
    const unit = readFileSync(new URL("./systemd/zolvi-apache-helper@.service", import.meta.url), "utf8");
    const exec = unit.split(/\r?\n/).find((l) => l.startsWith("ExecStart="));
    expect(exec).toBe('ExecStart=/opt/cpanel/ea-nodejs22/bin/node /opt/zolvi-signer-executor/zolvi-apache-helper.mjs "%i"');
    expect(unit).toMatch(/^CollectMode=inactive-or-failed$/m);
    expect(unit).not.toMatch(/^\[Install\]/m);
    expect(unit).toMatch(/^Type=oneshot$/m);
    expect(unit).toMatch(/^NoNewPrivileges=true$/m);
    expect(unit.split(/\r?\n/).filter((l) => !l.startsWith("#")).join("\n")).not.toMatch(/restart|ExecReload|ExecStop/i);
  });
});

// ── Integridad del resultado ──────────────────────────────────────
describe("readHelperResult — integridad del archivo de resultado", () => {
  const n = "0123456789abcdef";
  const good = () => ({ op: "rebuild", nonce: n, invocationId: INV(), startedAt: new Date().toISOString(), exitCode: 0, signal: null, timedOut: false, spawnError: null, durationMs: 10, stderr: "", stdout: "" });
  const P = helperResultPath("rebuild", n);

  it("acepta un resultado íntegro", () => {
    const fs = memFs(); fs.put(P, JSON.stringify(good()));
    expect(readHelperResult(fs, "rebuild", n).result).toBeTruthy();
  });

  it("solo lee <op>-<nonce>.json: un resultado de otra llamada (otro nonce) no existe para ésta", () => {
    const fs = memFs(); fs.put(P, JSON.stringify(good()));
    expect(readHelperResult(fs, "rebuild", "fedcba9876543210")).toEqual({ missing: true });
    expect(readHelperResult(fs, "rebuild", "../../etc/passwd").invalid).toBeTruthy();
  });

  const bad = [
    ["enlace simbólico", (fs) => fs.put(P, JSON.stringify(good()), { symlink: true })],
    ["no es de root", (fs) => fs.put(P, JSON.stringify(good()), { uid: 1000 })],
    ["escribible por otros", (fs) => fs.put(P, JSON.stringify(good()), { mode: 0o666 })],
    ["directorio escribible por otros", (fs) => { fs.dirs.set(HELPER_RESULT_DIR, { uid: 0, mode: 0o777 }); fs.put(P, JSON.stringify(good())); }],
    ["demasiado grande", (fs) => fs.put(P, JSON.stringify({ ...good(), pad: "x".repeat(HELPER_RESULT_MAX_BYTES) }))],
    ["JSON inválido", (fs) => fs.put(P, "{no")],
    ["op distinta", (fs) => fs.put(P, JSON.stringify({ ...good(), op: "graceful" }))],
    ["nonce distinto dentro del archivo", (fs) => fs.put(P, JSON.stringify({ ...good(), nonce: "fedcba9876543210" }))],
    ["InvocationID mal formado", (fs) => fs.put(P, JSON.stringify({ ...good(), invocationId: "abc" }))],
    ["exitCode fuera de rango", (fs) => fs.put(P, JSON.stringify({ ...good(), exitCode: 300 }))],
    ["timedOut no booleano", (fs) => fs.put(P, JSON.stringify({ ...good(), timedOut: "no" }))],
    ["stderr enorme", (fs) => fs.put(P, JSON.stringify({ ...good(), stderr: "x".repeat(9000) }))],
    ["señal inventada", (fs) => fs.put(P, JSON.stringify({ ...good(), signal: "rm -rf" }))],
  ];
  for (const [name, setup] of bad) {
    it(`rechaza: ${name}`, () => {
      const fs = memFs(); setup(fs);
      expect(readHelperResult(fs, "rebuild", n).invalid).toBeTruthy();
    });
  }
});

// ── Backend helper del ejecutor ───────────────────────────────────
describe("backend helper (systemctl start zolvi-apache-helper@<op>-<nonce>) — correlación por nonce, GC de systemd", () => {
  /**
   * Simula systemd con el comportamiento REAL que rompió el APPLY del
   * 2026-11-10: una instancia oneshot que termina queda inactiva y se
   * DESCARGA (GC) → `systemctl show` posterior devuelve InvocationID vacío.
   * `systemctl start` bloquea hasta terminar y sale 1 si la unidad falla.
   */
  function systemdSim(opts = {}) {
    const fs = memFs();
    const calls = [];
    let running = 0, maxRunning = 0;
    const run = async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd !== APACHE_BIN.systemctl) throw new Error("solo systemctl");
      const unit = args.at(-1);
      const m = /^zolvi-apache-helper@(.+)\.service$/.exec(unit);
      if (args[0] === "show") {
        // Plantilla instalada: cualquier instancia (aún no arrancada o ya descargada) da loaded e InvocationID vacío.
        return { code: 0, stdout: `LoadState=${opts.unitMissing ? "not-found" : "loaded"}\nInvocationID=\n`, stderr: "" };
      }
      running += 1; maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      if (opts.notStarted) return { code: 1, stdout: "", stderr: `Assertion failed on job for ${unit}.` };
      // El helper REAL valida la instancia y escribe su resultado.
      const helperRun = async () => ({ code: opts.helperExit ?? 0, signal: null, timedOut: false, spawnError: null, durationMs: 800, stderr: opts.stderr ?? "", stdout: "" });
      const out = await runHelperOp(m?.[1], { run: helperRun, fs, env: { INVOCATION_ID: INV() } });
      if (opts.afterHelper) opts.afterHelper(m?.[1]);
      const exit = opts.systemdExit ?? out.exitCode;
      return { code: exit === 0 ? 0 : 1, stdout: "", stderr: exit === 0 ? "" : `Job for ${unit} failed because the control process exited with error code.` };
    };
    return { fs, run, calls, maxRunning: () => maxRunning };
  }
  const starts = (s) => s.calls.filter((c) => c[1] === "start").map((c) => c[2]);

  it("REGRESIÓN 2026-11-10: aunque systemd descargue la instancia (InvocationID vacío), el rebuild exitoso se reconoce", async () => {
    const s = systemdSim();
    const a = createHelperApache(s.run, s.fs);
    expect(await a.rebuild()).toMatchObject({ ok: true, backend: "helper" });
    expect((await a.configtest()).ok).toBe(true);
    expect((await a.graceful()).ok).toBe(true);
    const units = starts(s);
    expect(units).toHaveLength(3);
    units.forEach((u, i) => expect(u).toMatch(new RegExp(`^zolvi-apache-helper@${["rebuild", "configtest", "graceful"][i]}-[0-9a-f]{16}\\.service$`)));
    expect(new Set(units).size).toBe(3);
    // Nada se consulta a systemd después del start y los resultados no se acumulan en /run.
    expect(s.calls.every((c) => c[1] === "start" || (c[1] === "show" && c[2] === "-p" && c[3] === "LoadState"))).toBe(true);
    expect([...s.fs.files.keys()].filter((p) => p.startsWith(HELPER_RESULT_DIR))).toEqual([]);
  });

  it("cada llamada usa un nonce nuevo", async () => {
    const s = systemdSim();
    const a = createHelperApache(s.run, s.fs);
    await a.configtest(); await a.configtest();
    const [u1, u2] = starts(s);
    expect(u1).not.toBe(u2);
  });

  it("fallo del rebuild: diagnóstico con el stderr real del helper", async () => {
    const s = systemdSim({ helperExit: 255, stderr: "Read-only file system /etc/userdatadomains.json" });
    const r = await createHelperApache(s.run, s.fs).rebuild();
    expect(r.ok).toBe(false);
    expect(r.diagnostic).toMatchObject({ kind: "PERMISSION_DENIED", exitCode: 255, backend: "helper" });
  });

  it("unidad no instalada: HELPER_UNAVAILABLE y no se intenta el start", async () => {
    const s = systemdSim({ unitMissing: true });
    expect((await createHelperApache(s.run, s.fs).rebuild()).diagnostic.kind).toBe("HELPER_UNAVAILABLE");
    expect(starts(s)).toEqual([]);
  });

  it("si la unidad no arrancó, un resultado anterior (otro nonce) NO se acepta", async () => {
    const s = systemdSim({ notStarted: true });
    const old = "0123456789abcdef";
    s.fs.put(helperResultPath("rebuild", old), JSON.stringify({ op: "rebuild", nonce: old, invocationId: INV(), startedAt: new Date().toISOString(), exitCode: 0, signal: null, timedOut: false, spawnError: null, durationMs: 1, stderr: "", stdout: "" }));
    const r = await createHelperApache(s.run, s.fs, { nonce: () => "fedcba9876543210" }).rebuild();
    expect(r).toMatchObject({ ok: false, diagnostic: { kind: "HELPER_RESULT_MISSING" } });
    // El diagnóstico nombra la unidad (el saneador ya no la confunde con un correo).
    expect(describeDiagnostic(r.diagnostic)).toContain("zolvi-apache-helper@rebuild-fedcba9876543210.service");
    expect(describeDiagnostic(r.diagnostic)).not.toContain("EMAIL");
  });

  it("resultado con startedAt anterior a la llamada no se acepta", async () => {
    const s = systemdSim({ afterHelper: (inst) => {
      const p = helperResultPath(...inst.split("-"));
      const j = JSON.parse(s.fs.files.get(p).content); j.startedAt = "2020-01-01T00:00:00.000Z";
      s.fs.put(p, JSON.stringify(j));
    } });
    expect((await createHelperApache(s.run, s.fs).rebuild()).diagnostic.kind).toBe("HELPER_RESULT_MISSING");
  });

  it("archivo dice 'éxito' pero systemctl start falló → HELPER_RESULT_INCONSISTENT (nunca ok)", async () => {
    const s = systemdSim({ helperExit: 0, systemdExit: 1 });
    expect(await createHelperApache(s.run, s.fs).rebuild()).toMatchObject({ ok: false, diagnostic: { kind: "HELPER_RESULT_INCONSISTENT" } });
  });

  it("archivo dice 'fallo' pero systemctl start salió 0 → HELPER_RESULT_INCONSISTENT", async () => {
    const s = systemdSim({ helperExit: 1, systemdExit: 0 });
    expect((await createHelperApache(s.run, s.fs).rebuild()).diagnostic.kind).toBe("HELPER_RESULT_INCONSISTENT");
  });

  it("resultado manipulado (no root) → HELPER_RESULT_INVALID", async () => {
    const s = systemdSim({ afterHelper: (inst) => { s.fs.files.get(helperResultPath(...inst.split("-"))).uid = 1000; } });
    expect((await createHelperApache(s.run, s.fs).rebuild()).diagnostic.kind).toBe("HELPER_RESULT_INVALID");
  });

  it("nonce inyectado inválido: excepción antes de llamar a systemd", async () => {
    const s = systemdSim();
    await expect(createHelperApache(s.run, s.fs, { nonce: () => "x;id" }).rebuild()).rejects.toThrow(/nonce/);
    expect(s.calls).toEqual([]);
  });

  it("llamadas concurrentes del ejecutor se serializan (nunca dos start a la vez)", async () => {
    const s = systemdSim();
    const a = createHelperApache(s.run, s.fs);
    const rs = await Promise.all([a.configtest(), a.configtest(), a.rebuild(), a.graceful()]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(s.maxRunning()).toBe(1);
  });

  it("backend directo conserva los comandos históricos", async () => {
    const calls = [];
    const a = createDirectApache(async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0 }; });
    await a.rebuild(); await a.configtest(); await a.graceful();
    expect(calls).toEqual([[APACHE_BIN.rebuild], [APACHE_BIN.apachectl, "-t"], [APACHE_BIN.apachectl, "-k", "graceful"]]);
  });
});

describe("sanitizeOutput — nombres de unidades systemd", () => {
  it("no confunde unidades systemd con correos, pero sigue redactando correos reales", () => {
    const out = sanitizeOutput("Job for zolvi-apache-helper@rebuild-0123456789abcdef.service failed; httpd@x.socket; contacto ana.perez@empresa.com.sv");
    expect(out).toContain("zolvi-apache-helper@rebuild-0123456789abcdef.service");
    expect(out).toContain("httpd@x.socket");
    expect(out).not.toContain("ana.perez@empresa.com.sv");
    expect(out).toContain("[EMAIL REDACTADO]");
  });
});

// ── Diagnóstico del VPS: sin efectos sobre Apache ─────────────────
describe("diagnostics/apache-rebuild-readonly-diagnostic.sh — solo lectura", () => {
  const script = readFileSync(new URL("./diagnostics/apache-rebuild-readonly-diagnostic.sh", import.meta.url), "utf8");
  const code = script.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");

  it("no invoca rebuild, apachectl, httpd, restart/reload ni operaciones mutantes de systemd/docker", () => {
    expect(code).not.toMatch(/\bapachectl\b/);
    expect(code).not.toMatch(/\bhttpd\s+-k\b|restartsrv|graceful/);
    expect(code).not.toMatch(/\bsystemctl\s+(start|stop|restart|reload|try-restart|enable|disable|daemon-reload|kill|edit|set-property|mask|unmask)\b/);
    expect(code).not.toMatch(/\bdocker\s+(run|rm|stop|start|restart|compose|exec|kill|pull|create|update)\b/);
    expect(code).not.toMatch(/\b(rm|mv|cp|chmod|chown|truncate|install|ln|touch|mkdir)\s/);
    expect(code).not.toMatch(/sed\s+-i/);
    // rebuildhttpdconf solo aparece como argumento de lectura (ls/file/head/grep), nunca como comando.
    for (const line of code.split("\n").filter((l) => l.includes("rebuildhttpdconf"))) {
      expect(line.trim()).toMatch(/^(ls|file|head|grep|\/usr\/local\/cpanel\/Cpanel)/);
    }
  });

  it("las redirecciones solo van a /dev/null (no escribe archivos)", () => {
    const redirects = [...code.matchAll(/(?<![0-9&<-])>{1,2}\s*([^\s&|;)]+)/g)].map((m) => m[1]);
    expect(redirects.every((t) => t === "/dev/null")).toBe(true);
  });

  it("documenta expresamente la unidad transitoria de systemd-run y su alcance", () => {
    expect(script).toMatch(/systemd-run crea una unidad TRANSITORIA/);
    expect(script).toMatch(/\/run\/systemd\/transient/);
    expect(script).toMatch(/SKIP_TRANSIENT=1/);
  });

  it("toda la salida pasa por el saneador (falla cerrado si no está disponible)", () => {
    expect(script).toMatch(/sanitize-cli\.mjs/);
    expect(script).toMatch(/exit 3/);
  });
});
