// FISCAL-ONBOARDING — ejecutor VPS con fs y comandos SIMULADOS:
// nunca toca Docker, Apache ni el disco real.

import { randomBytes, randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  createExecutor, createExecutorHandler, createRequestVerifier, signExecutorRequest, BIN,
} from "./zolvi-signer-executor.mjs";
import { createFileNonceStore } from "./lib/executor-auth.mjs";
import { HTTPD_CONF, HELPER_RESULT_DIR } from "./lib/apache-ops.mjs";
import { runHelperOp } from "./zolvi-apache-helper.mjs";
import {
  validateSignerSpec, deriveResourceNames, renderCompose, renderVhostInclude, renderApiKeyDefine,
  allocatePort, validatePort, RESERVED_PORTS,
} from "./lib/signer-core.mjs";

const SPEC = { slug: "cliente-a", environment: "TEST", hostname: "firmador-cliente-a-test.getzolvi.com", port: 8120, signerNit: "06140000000000", cpanelUser: "zolvi" };
const SPEC_PROD = { ...SPEC, environment: "PRODUCTION", hostname: "firmador-cliente-a-prod.getzolvi.com", port: 8121 };
const KEY = () => randomBytes(32).toString("hex");

// ── Simulación de VPS ─────────────────────────────────────────────
// httpd.conf simulado: cPanel lo genera a partir de los includes userdata presentes.
const renderHttpdConf = (files) => [
  "# httpd.conf (cPanel)",
  ...[...files.keys()].filter((p) => p.startsWith("/etc/apache2/conf.d/userdata/") && p.endsWith(".conf")).sort().map((p) => `Include "${p}"`),
  "",
].join("\n");

function fakeVps({ containers = [], listening = [], apacheTestFails = false, httpdConf = true } = {}) {
  const files = new Map();
  const dirs = new Set(["/"]);
  // rebuildFailure: { code, stderr, stdout, timedOut, signal, spawnError, times } — falla las primeras `times` veces (∞ por defecto).
  const state = { containers: [...containers], listening: [...listening], apacheTestFails, calls: [], rebuildFailure: null, gracefulFails: false, rebuilds: 0 };
  if (httpdConf) files.set(HTTPD_CONF, renderHttpdConf(files));
  const fs = {
    readFileSync: (p) => { if (!files.has(p)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return files.get(p); },
    // Ganchos (state.onWrite/onUnlink/onRebuild/onConfigtest/onComposeUp) simulan a cPanel u otro administrador actuando en paralelo.
    writeFileSync: (p, c) => { files.set(p, String(c)); state.onWrite?.(p, files); },
    existsSync: (p) => { state.onExists?.(p, files); return files.has(p) || dirs.has(p); },
    mkdirSync: (p) => { dirs.add(p); },
    unlinkSync: (p) => { files.delete(p); state.onUnlink?.(p, files); },
    renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); state.renames = [...(state.renames ?? []), b]; },
    statSync: (p) => { if (!files.has(p)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return { mode: 0o100644 }; },
    lstatSync: (p) => {
      if (dirs.has(p)) return { uid: 0, mode: 0o700, size: 0, isDirectory: () => true, isFile: () => false };
      if (files.has(p)) return { uid: 0, mode: 0o600, size: Buffer.byteLength(files.get(p)), isDirectory: () => false, isFile: () => true };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    readdirSync: (d) => [...files.keys()].filter((f) => f.slice(0, f.lastIndexOf("/")) === d).map((f) => f.slice(f.lastIndexOf("/") + 1)),
  };

  // systemd simulado: `systemctl start zolvi-apache-helper@<op>-<nonce>` ejecuta el script
  // REAL del helper FUERA del sandbox (hostRun con sandboxed=false). Modela el GC real de
  // systemd: al terminar, la instancia oneshot se descarga y `show` devuelve InvocationID
  // vacío (lo que rompió el APPLY del 2026-11-10 con la correlación por InvocationID).
  state.helperCalls = [];
  state.helperResults = [];
  const hostRun = async (cmd, args) => { state.helperCalls.push([cmd, ...args]); return host(cmd, args, { sandboxed: false }); };
  async function systemd(args) {
    const unit = args.at(-1);
    const m = /^zolvi-apache-helper@(.*)\.service$/.exec(unit);
    if (args[0] === "show") {
      const load = m && state.helperInstalled !== false ? "loaded" : "not-found";
      return { code: 0, stdout: `LoadState=${load}\nInvocationID=\nExecMainStatus=0\nResult=success\n`, stderr: "" };
    }
    if (args[0] === "start" && m) {
      const inv = randomBytes(16).toString("hex");
      const out = await runHelperOp(m[1], { run: hostRun, fs, env: { INVOCATION_ID: inv }, now: () => new Date() });
      if (out.result) state.helperResults.push({ unit, ...out.result });
      if (state.dropHelperResult?.(m[1])) for (const f of [...files.keys()]) if (f.startsWith(HELPER_RESULT_DIR)) files.delete(f);
      return { code: out.exitCode === 0 ? 0 : 1, stdout: "", stderr: out.exitCode === 0 ? "" : `Job for ${unit} failed.` };
    }
    return { code: 1, stdout: "", stderr: "operación systemctl no simulada" };
  }

  // Proceso del ejecutor: todo lo que corre aquí está dentro del sandbox.
  const run = async (cmd, args) => {
    state.calls.push([cmd, ...args]);
    if (cmd === BIN.systemctl) return systemd(args);
    return host(cmd, args, { sandboxed: true });
  };

  const host = async (cmd, args, { sandboxed }) => {
    if (cmd === BIN.rebuild) {
      state.rebuilds += 1;
      // Causa confirmada en el VPS: dentro del sandbox, cPanel no puede crear el lock de Cloudflare
      // en /etc/apache2/conf.d/includes ni sincronizar /home/<usuario>/.htpasswds.
      if (sandboxed && state.sandboxBlocksRebuild) {
        return { code: 255, stdout: "", durationMs: 2100, stderr: [
          "Cpanel::Exception::IO::FileCreateError/(XID 9k2m) The system failed to create the file “/etc/apache2/conf.d/includes/cloudflare.conf.lock” because of an error: Read-only file system",
          "  at Cpanel::Template::Plugin::ApacheConfig::generate_cloudflare_config",
          "Cpanel::FileProtect::Sync::sync_user_homedir: /home/getzolvi/.htpasswds: Permission denied",
        ].join("\n") };
      }
      state.onRebuild?.(files);
      const f = state.rebuildFailure;
      if (f && (f.times === undefined || state.rebuilds <= f.times)) {
        if (f.writesBeforeFail) files.set(HTTPD_CONF, renderHttpdConf(files));
        state.afterRebuild?.(files);
        return { code: f.code ?? 1, stdout: f.stdout ?? "", stderr: f.stderr ?? "", timedOut: !!f.timedOut, signal: f.signal ?? null, spawnError: f.spawnError ?? null, durationMs: f.durationMs ?? 1500 };
      }
      files.set(HTTPD_CONF, renderHttpdConf(files));
      return { code: 0, stdout: "Built /etc/apache2/conf/httpd.conf OK", stderr: "" };
    }
    // gracefulFails: true = siempre; número = solo las primeras N señales.
    if (cmd === BIN.apachectl && args[0] === "-k" && state.gracefulFails) {
      state.graceful = (state.graceful ?? 0) + 1;
      if (state.gracefulFails === true || state.graceful <= state.gracefulFails) {
        return { code: 1, stdout: "", stderr: "httpd (pid 1234?) not running" };
      }
    }
    if (cmd === BIN.docker && args[0] === "ps") {
      return { code: 0, stdout: state.containers.map((c) => JSON.stringify({ Names: c.name, State: c.state ?? "running", Ports: c.ports ?? "", Labels: c.labels ?? "" })).join("\n"), stderr: "" };
    }
    if (cmd === BIN.ss) return { code: 0, stdout: state.listening.map((p) => `LISTEN 0 128 127.0.0.1:${p} 0.0.0.0:*`).join("\n"), stderr: "" };
    if (cmd === BIN.docker && args[0] === "compose" && args.at(-2) === "up") state.onComposeUp?.(files);
    if (cmd === BIN.apachectl && args[0] === "-t") state.onConfigtest?.(files);
    if (cmd === BIN.docker && args[0] === "compose" && args.at(-2) === "up") {
      const project = args[args.indexOf("-p") + 1];
      const id = project.replace("zolvi-signer-", "");
      const spec = id.endsWith("-prod") ? SPEC_PROD : SPEC;
      if (!state.containers.some((c) => c.name === `dte-firmador-${id}`)) {
        state.containers.push({ name: `dte-firmador-${id}`, ports: `127.0.0.1:${spec.port}->8113/tcp`, labels: `zolvi.managed=true,zolvi.signer.id=${id},zolvi.template.version=zolvi-signer-v1` });
        state.listening.push(spec.port);
      }
      return { code: 0, stdout: "", stderr: "" };
    }
    if (cmd === BIN.docker && args[0] === "compose" && args.at(-1) === "down") {
      const id = args[args.indexOf("-p") + 1].replace("zolvi-signer-", "");
      state.containers = state.containers.filter((c) => c.name !== `dte-firmador-${id}`);
      return { code: 0, stdout: "", stderr: "" };
    }
    if (cmd === BIN.apachectl && args[0] === "-t" && state.strictIncludes) {
      const missing = [...String(files.get(HTTPD_CONF) ?? "").matchAll(/Include "([^"]+)"/g)].map((m) => m[1]).filter((f) => !files.has(f));
      if (missing.length) return { code: 1, stdout: "", stderr: `AH00526: Syntax error: Include ${missing[0]}: No such file or directory` };
    }
    if (cmd === BIN.apachectl) {
      // El fallo sintáctico simulado nace del include NUEVO: al retirarlo,
      // Apache vuelve a validar. Un fallo global persistente usa otro flag.
      const newVhost = [...files.keys()].some((p) => p.endsWith("/zolvi-signer-cliente-a-test.conf"));
      const invalid = state.apacheTestFailsAlways || (state.apacheTestFails && newVhost);
      return invalid ? { code: 1, stdout: "", stderr: "Syntax error on line 3" } : { code: 0, stdout: "", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  return { fs, run, files, dirs, state };
}

function placeCert(vps, spec = SPEC) {
  const n = deriveResourceNames(spec);
  vps.dirs.add(n.dir); vps.dirs.add(n.certDir);
  vps.files.set(n.certFile, "<certificado de prueba>");
}

const ex = (vps) => createExecutor({ run: vps.run, fs: vps.fs, now: () => new Date("2026-11-10T00:00:00Z"), httpProbe: async () => ({ ok: true, status: 200 }), apacheMode: "direct", stateDir: "/var/lib/zolvi-signer-executor" });

// ── signer-core ───────────────────────────────────────────────────
describe("signer-core — validación, nombres y plantillas", () => {
  it("aisla TEST/PROD: nombres, carpetas, include y Define distintos", () => {
    const t = deriveResourceNames(SPEC), p = deriveResourceNames(SPEC_PROD);
    for (const k of ["containerName", "composeProject", "dir", "apiKeyFile", "vhostIncludePath", "defineName", "signerUrl"]) expect(t[k]).not.toBe(p[k]);
    expect(t.containerName).toBe("dte-firmador-cliente-a-test");
  });

  it("rechaza hostname sin sufijo de ambiente, dominio ajeno, puertos reservados y NIT inválido", () => {
    expect(validateSignerSpec({ ...SPEC, hostname: "firmador-cliente-a-prod.getzolvi.com" }).ok).toBe(false);
    expect(validateSignerSpec({ ...SPEC, hostname: "firmador-x-test.evil.com" }).ok).toBe(false);
    for (const p of RESERVED_PORTS) expect(validatePort(p)).toBe(false);
    expect(validateSignerSpec({ ...SPEC, signerNit: "0614-000000-000-0" }).ok).toBe(false);
    expect(validateSignerSpec({ ...SPEC, slug: "a;rm -rf /" }).ok).toBe(false);
  });

  it("asignación de puertos sin colisiones ni reservados; agotamiento -> null", () => {
    expect(allocatePort({ usedPorts: [8120, 8121] })).toBe(8122);
    expect(allocatePort({ usedPorts: [8120], preferred: 8120 })).toBe(8121);
    expect(allocatePort({ preferred: 8115 })).toBe(8120);
    expect(allocatePort({ usedPorts: Array.from({ length: 80 }, (_, i) => 8120 + i) })).toBeNull();
  });

  it("compose: solo loopback, volumen de certificado de solo lectura, labels de propiedad", () => {
    const c = renderCompose(SPEC);
    expect(c).toContain('"127.0.0.1:8120:8113"');
    expect(c).toContain(":/uploads:ro");
    expect(c).toContain("zolvi.managed");
    expect(c).not.toMatch(/0\.0\.0\.0/);
  });

  it("include Apache: exige header, deja .well-known abierto, sin ErrorDocument (AH00124) y sin secreto inline", () => {
    const v = renderVhostInclude(SPEC);
    expect(v).toContain("X-DTE-Signer-Key");
    expect(v).toContain('ProxyPass "/.well-known/" "!"');
    expect(v).not.toMatch(/ErrorDocument|RewriteRule/);
    expect(v).not.toMatch(/[a-f0-9]{64}/);
  });

  it("Define de API Key solo acepta 64 hex (sin inyección de directivas)", () => {
    expect(() => renderApiKeyDefine(SPEC, "abc\nInclude /etc/passwd")).toThrow();
    expect(renderApiKeyDefine(SPEC, "a".repeat(64))).toContain("Define ZOLVI_SIGNER_KEY_CLIENTE_A_TEST ");
  });
});

// ── Ejecutor ─────────────────────────────────────────────────────
describe("ejecutor — APPLY idempotente, conflictos y rollback", () => {
  let vps;
  beforeEach(() => { vps = fakeVps({ containers: [{ name: "dte-firmador-metatraining-test", ports: "127.0.0.1:8115->8113/tcp" }], listening: [8113, 8114, 8115] }); });

  it("sin certificado: no levanta contenedor y devuelve CERT_MISSING", async () => {
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "CERT_MISSING" });
    expect(vps.state.calls.some((c) => c.includes("up"))).toBe(false);
  });

  it("hostname del firmador protegido (MetaTraining TEST) con otro slug -> PROTECTED_RESOURCE, sin escribir nada", async () => {
    const spec = { ...SPEC, slug: "otro", hostname: "firmador-metatraining-test.getzolvi.com", port: 8130 };
    placeCert(vps, spec);
    const before = new Map(vps.files);
    await expect(ex(vps).apply({ spec, runId: randomUUID(), apiKey: KEY() })).rejects.toMatchObject({ code: "PROTECTED_RESOURCE" });
    await expect(ex(vps).rollback({ spec, runId: randomUUID() })).rejects.toMatchObject({ code: "PROTECTED_RESOURCE" });
    expect(vps.files).toEqual(before);
    expect(vps.state.calls.some((c) => c[0] === BIN.apachectl && c.includes("graceful") || c.includes("up"))).toBe(false);
  });

  it("vhost con includes ajenos (firmador existente en ese hostname) -> CONFLICT_UNMANAGED, sin tocar Apache", async () => {
    placeCert(vps);
    const n = deriveResourceNames(SPEC);
    const dir = n.vhostIncludePath.slice(0, n.vhostIncludePath.lastIndexOf("/"));
    vps.files.set(`${dir}/firmador-proxy.conf`, "ProxyPass / http://127.0.0.1:8113/");
    const obs = await ex(vps).inspect({ spec: SPEC });
    expect(obs.observed.vhostForeignIncludes).toEqual(["firmador-proxy.conf"]);
    await expect(ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() })).rejects.toMatchObject({ code: "CONFLICT_UNMANAGED" });
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);
    expect(vps.state.calls.some((c) => c[0] === BIN.apachectl && c.includes("graceful"))).toBe(false);
  });

  it("APPLY completo y re-APPLY idempotente (sin rotar API Key, sin recargar Apache)", async () => {
    placeCert(vps);
    const key = KEY();
    const first = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: key });
    expect(first.ok).toBe(true);
    const n = deriveResourceNames(SPEC);
    const keyFile = vps.files.get(n.apiKeyFile);
    expect(keyFile).toContain(key);

    const reloadsBefore = vps.state.calls.filter((c) => c[0] === BIN.apachectl && c.includes("graceful")).length;
    const second = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(second.ok).toBe(true);
    expect(second.steps.find((s) => s.op === "API_KEY").status).toBe("KEPT");
    expect(second.steps.find((s) => s.op === "VHOST").status).toBe("UNCHANGED");
    expect(vps.files.get(n.apiKeyFile)).toBe(keyFile);
    expect(vps.state.calls.filter((c) => c[0] === BIN.apachectl && c.includes("graceful")).length).toBe(reloadsBefore);
    expect(JSON.stringify(second)).not.toContain(key);
  });

  it("TEST y PROD de la misma organización conviven sin pisarse", async () => {
    placeCert(vps); placeCert(vps, SPEC_PROD);
    expect((await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() })).ok).toBe(true);
    expect((await ex(vps).apply({ spec: SPEC_PROD, runId: randomUUID(), apiKey: KEY() })).ok).toBe(true);
    expect(vps.state.containers.map((c) => c.name)).toEqual(expect.arrayContaining(["dte-firmador-cliente-a-test", "dte-firmador-cliente-a-prod", "dte-firmador-metatraining-test"]));
  });

  it("el contenedor protegido de MetaTraining TEST nunca se modifica", async () => {
    const spec = { ...SPEC, slug: "metatraining", hostname: "firmador-metatraining-test.getzolvi.com", port: 8130 };
    await expect(ex(vps).apply({ spec, runId: randomUUID(), apiKey: KEY() })).rejects.toMatchObject({ code: "PROTECTED_RESOURCE" });
    await expect(ex(vps).rollback({ spec, runId: randomUUID() })).rejects.toMatchObject({ code: "PROTECTED_RESOURCE" });
  });

  it("contenedor homónimo no administrado / puerto ocupado -> conflicto, sin cambios", async () => {
    placeCert(vps);
    const unmanaged = fakeVps({ containers: [{ name: "dte-firmador-cliente-a-test", ports: "" }] });
    await expect(ex(unmanaged).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() })).rejects.toMatchObject({ code: "CONFLICT_UNMANAGED" });
    const busy = fakeVps({ containers: [{ name: "otro", ports: "127.0.0.1:8120->80/tcp" }], listening: [8120] });
    await expect(ex(busy).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() })).rejects.toMatchObject({ code: "PORT_CONFLICT" });
    const bare = fakeVps({ listening: [8120] });
    await expect(ex(bare).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() })).rejects.toMatchObject({ code: "PORT_CONFLICT" });
  });

  it("APPLY usa apachectl -k graceful y nunca el restart de cPanel", async () => {
    placeCert(vps);
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.ok).toBe(true);
    expect(vps.state.calls).toContainEqual([BIN.apachectl, "-k", "graceful"]);
    expect(vps.state.calls.some((c) => c[0].includes("restartsrv_httpd"))).toBe(false);
    expect(vps.state.calls.filter((c) => c[0] === BIN.apachectl && c.includes("graceful"))).toHaveLength(1);
  });

  it("fallo de sintaxis no envía señal graceful ni reinicia el Apache compartido", async () => {
    placeCert(vps);
    vps.state.apacheTestFails = true;
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_FAILED");
    expect(vps.state.calls.some((c) => c[0] === BIN.apachectl && c.includes("graceful"))).toBe(false);
  });

  it("Apache inválido -> revierte el include y devuelve APACHE_FAILED", async () => {
    placeCert(vps);
    vps.state.apacheTestFails = true;
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_FAILED" });
    expect(vps.files.has(deriveResourceNames(SPEC).vhostIncludePath)).toBe(false);
  });

  it("error de Apache persistente tras revertir -> APACHE_RECOVERY_FAILED sin recargar", async () => {
    placeCert(vps);
    vps.state.apacheTestFailsAlways = true;
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_RECOVERY_FAILED" });
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY")).toMatchObject({ status: "FAILED" });
    expect(vps.files.has(deriveResourceNames(SPEC).vhostIncludePath)).toBe(false);
    expect(vps.state.calls.some((c) => c[0] === BIN.apachectl && c.includes("graceful"))).toBe(false);
  });

  it("ROLLBACK solo revierte lo creado por SU runId y jamás borra el certificado", async () => {
    placeCert(vps);
    const runA = randomUUID();
    await ex(vps).apply({ spec: SPEC, runId: runA, apiKey: KEY() });
    const n = deriveResourceNames(SPEC);

    const foreign = await ex(vps).rollback({ spec: SPEC, runId: randomUUID() });
    expect(foreign.steps.map((s) => s.op)).toEqual(["CERT"]);
    expect(vps.state.containers.some((c) => c.name === n.containerName)).toBe(true);

    const own = await ex(vps).rollback({ spec: SPEC, runId: runA });
    expect(own.ok).toBe(true);
    expect(vps.state.containers.some((c) => c.name === n.containerName)).toBe(false);
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);
    expect(vps.files.has(n.apiKeyFile)).toBe(false);
    expect(vps.files.has(n.certFile)).toBe(true);
    expect(vps.state.containers.some((c) => c.name === "dte-firmador-metatraining-test")).toBe(true);
  });

  it("VERIFY tras APPLY: todos los checks ok", async () => {
    placeCert(vps);
    await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    const v = await ex(vps).verify({ spec: SPEC });
    expect(v.checks.filter((c) => c.status !== "ok")).toEqual([]);
  });
});

// ── Reconstrucción de Apache: diagnóstico y recuperación ───────────
describe("Apache — diagnóstico de rebuildhttpdconf y recuperación sin segundo rebuild", () => {
  const RO_STDERR = [
    "info [rebuildhttpdconf] Rebuilding Apache configuration",
    "Cpanel::Exception::IO::FileCreateError/(XID abc123) The system failed to create the file “/etc/userdatadomains.json.tmp” because of an error: Read-only file system",
    "  at /usr/local/cpanel/Cpanel/Config/userdata/UpdateCache.pm line 210.",
  ].join("\n");
  // Otro cliente del Apache compartido (no Zolvi): nunca debe cambiar.
  const FOREIGN = "/etc/apache2/conf.d/userdata/ssl/2_4/dhsoft/examenescpo.com.dhsoftware.app/custom.conf";
  const FOREIGN_BODY = "# configuración del hospital\nProxyPass /api http://127.0.0.1:9000/\n";
  const isGlobalRestart = (c) => c.some((a) => /restartsrv|^restart$|^stop$|^reload$/.test(String(a))) || (c.includes("-k") && !c.includes("graceful"));

  let vps;
  beforeEach(() => {
    vps = fakeVps({ containers: [{ name: "dte-firmador-metatraining-test", ports: "127.0.0.1:8115->8113/tcp" }], listening: [8113, 8114, 8115], httpdConf: false });
    vps.files.set(FOREIGN, FOREIGN_BODY);
    vps.files.set(HTTPD_CONF, renderHttpdConf(vps.files));
  });

  it("1. reconstrucción exitosa: rebuild → -t → graceful, copia previa de httpd.conf guardada", async () => {
    placeCert(vps);
    const before = vps.files.get(HTTPD_CONF);
    const runId = randomUUID();
    const r = await ex(vps).apply({ spec: SPEC, runId, apiKey: KEY() });
    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD")).toMatchObject({ status: "OK", detail: "backend direct" });
    expect(vps.files.get(HTTPD_CONF)).toContain(deriveResourceNames(SPEC).vhostIncludePath);
    expect(vps.files.get(`/var/lib/zolvi-signer-executor/httpd.conf.pre-${runId}`)).toBe(before);
    const apacheCalls = vps.state.calls.filter((c) => c[0] === BIN.rebuild || c[0] === BIN.apachectl);
    expect(apacheCalls).toEqual([[BIN.rebuild], [BIN.apachectl, "-t"], [BIN.apachectl, "-k", "graceful"]]);
  });

  it("2. error de permisos (sandbox read-only): diagnóstico PERMISSION_DENIED con la ruta, sin segundo rebuild", async () => {
    placeCert(vps);
    const before = vps.files.get(HTTPD_CONF);
    vps.state.rebuildFailure = { code: 255, stderr: RO_STDERR };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_FAILED" });
    const failed = r.steps.find((s) => s.op === "APACHE_RELOAD");
    expect(failed.diagnostic).toMatchObject({ op: "rebuild", phase: "rebuild", kind: "PERMISSION_DENIED", exitCode: 255, httpdConfChanged: false, backend: "direct" });
    expect(failed.diagnostic.stderr).toContain("/etc/userdatadomains.json.tmp");
    expect(failed.diagnostic.stderr).toContain("Read-only file system");
    expect(r.message).toContain("PERMISSION_DENIED");
    expect(r.message).not.toBe("rebuildhttpdconf falló.");
    expect(vps.state.rebuilds).toBe(1);
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY")).toMatchObject({ status: "OK" });
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").detail).toContain("sin cambios");
    expect(vps.files.get(HTTPD_CONF)).toBe(before);
    expect(vps.files.has(deriveResourceNames(SPEC).vhostIncludePath)).toBe(false);
    expect(vps.state.calls.some((c) => c.includes("graceful"))).toBe(false);
  });

  it("3. error de sintaxis tras rebuild: CONFIG_ERROR y httpd.conf restaurado byte a byte sin reconstruir de nuevo", async () => {
    placeCert(vps);
    const before = vps.files.get(HTTPD_CONF);
    vps.state.apacheTestFails = true;
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_FAILED" });
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic).toMatchObject({ op: "configtest", phase: "syntax", kind: "CONFIG_ERROR", httpdConfChanged: true });
    expect(vps.files.get(HTTPD_CONF)).toBe(before);
    expect(vps.state.rebuilds).toBe(1);
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").detail).toContain("restaurado");
    expect(vps.state.calls.some((c) => c.includes("graceful"))).toBe(false);
  });

  it("4. timeout del rebuild: diagnóstico TIMEOUT (no se confunde con error de configuración)", async () => {
    placeCert(vps);
    vps.state.rebuildFailure = { code: 1, timedOut: true, signal: "SIGTERM", stderr: "Syntax error parcial", durationMs: 90_000 };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    const d = r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic;
    expect(d).toMatchObject({ kind: "TIMEOUT", signal: "SIGTERM", durationMs: 90_000 });
    expect(r.message).toMatch(/TIMEOUT.*SIGTERM.*90s/);
  });

  it("4b. script ausente / no ejecutable: SPAWN_FAILED", async () => {
    placeCert(vps);
    vps.state.rebuildFailure = { code: 1, spawnError: "ENOENT" };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic).toMatchObject({ kind: "SPAWN_FAILED", spawnError: "ENOENT" });
  });

  it("5. recuperación exitosa tras fallo de la señal graceful: restaura, valida y re-señaliza (nunca restart)", async () => {
    placeCert(vps);
    const before = vps.files.get(HTTPD_CONF);
    vps.state.gracefulFails = 1; // la primera señal falla; la de recuperación funciona
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_FAILED" });
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic).toMatchObject({ phase: "signal", op: "graceful" });
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY")).toMatchObject({ status: "OK", detail: expect.stringContaining("graceful de recuperación OK") });
    expect(vps.files.get(HTTPD_CONF)).toBe(before);
    expect(vps.files.has(deriveResourceNames(SPEC).vhostIncludePath)).toBe(false);
    expect(vps.state.rebuilds).toBe(1);
    expect(vps.state.calls.filter(isGlobalRestart)).toEqual([]);
  });

  it("5b. recuperación exitosa (rebuild intermitente que alcanzó a escribir httpd.conf)", async () => {
    placeCert(vps);
    const before = vps.files.get(HTTPD_CONF);
    vps.state.rebuildFailure = { code: 1, stderr: "Error: unexpected failure", writesBeforeFail: true };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_FAILED" });
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic).toMatchObject({ kind: "NONZERO_EXIT", httpdConfChanged: true });
    expect(vps.files.get(HTTPD_CONF)).toBe(before);
    expect(vps.state.rebuilds).toBe(1);
  });

  it("6. recuperación fallida: APACHE_RECOVERY_FAILED con diagnóstico propio y ruta de la copia previa", async () => {
    placeCert(vps);
    vps.state.rebuildFailure = { code: 2, stderr: RO_STDERR };
    vps.state.apacheTestFailsAlways = true;
    const runId = randomUUID();
    const r = await ex(vps).apply({ spec: SPEC, runId, apiKey: KEY() });
    expect(r).toMatchObject({ ok: false, code: "APACHE_RECOVERY_FAILED" });
    const rec = r.steps.find((s) => s.op === "APACHE_RECOVERY");
    expect(rec.status).toBe("FAILED");
    expect(rec.diagnostic).toMatchObject({ op: "configtest", kind: "CONFIG_ERROR" });
    expect(rec.detail).toContain(`httpd.conf.pre-${runId}`);
    expect(vps.state.calls.some((c) => c.includes("graceful"))).toBe(false);
  });

  it("7+8. APPLY parcial de REC (sin include): reutiliza API Key, certificado, compose y contenedor; solo crea el include", async () => {
    // Estado real tras el primer APPLY de REC: todo creado salvo el include HTTPS.
    const rec = { slug: "rechightraining", environment: "TEST", hostname: "firmador-rec-test.getzolvi.com", port: 8120, signerNit: "06140000000000", cpanelUser: "getzolvi" };
    const n = deriveResourceNames(rec);
    const firstRun = randomUUID();
    const key = KEY();
    vps.dirs.add(n.dir); vps.dirs.add(n.certDir);
    vps.files.set(n.certFile, "<certificado REC>");
    vps.files.set(n.apiKeyFile, renderApiKeyDefine(rec, key));
    vps.files.set(n.composeFile, renderCompose(rec));
    vps.files.set(n.manifestFile, JSON.stringify({ id: n.id, templateVersion: "zolvi-signer-v1", resources: { DIR: { createdBy: firstRun }, API_KEY: { createdBy: firstRun }, COMPOSE: { createdBy: firstRun }, CONTAINER: { createdBy: firstRun } } }));
    vps.state.containers.push({ name: n.containerName, ports: "127.0.0.1:8120->8113/tcp", labels: `zolvi.managed=true,zolvi.signer.id=${n.id},zolvi.template.version=zolvi-signer-v1` });
    vps.state.listening.push(8120);
    const snapshot = { key: vps.files.get(n.apiKeyFile), cert: vps.files.get(n.certFile), compose: vps.files.get(n.composeFile) };

    // a) intento que falla por permisos (como el 2026-11-10) → nada se pierde.
    vps.state.rebuildFailure = { code: 255, stderr: RO_STDERR, times: 1 };
    const failed = await ex(vps).apply({ spec: rec, runId: randomUUID() });
    expect(failed.code).toBe("APACHE_FAILED");
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);

    // b) reintento con el helper ya operativo → completa solo lo pendiente.
    const r = await ex(vps).apply({ spec: rec, runId: randomUUID() }); // sin apiKey: no se genera ninguna
    expect(r.ok).toBe(true);
    const st = Object.fromEntries(r.steps.map((s) => [s.op, s.status]));
    expect(st).toMatchObject({ DIR: "UNCHANGED", API_KEY: "KEPT", CERT: "PRESENT", COMPOSE: "UNCHANGED", CONTAINER: "ENSURED", VHOST: "CREATED", APACHE_RELOAD: "OK" });
    expect(vps.files.get(n.apiKeyFile)).toBe(snapshot.key);
    expect(vps.files.get(n.certFile)).toBe(snapshot.cert);
    expect(vps.files.get(n.composeFile)).toBe(snapshot.compose);
    expect(vps.state.containers.filter((c) => c.name === n.containerName)).toHaveLength(1);
    expect(r.observed.container).toMatchObject({ managed: true, boundToExpectedPort: true });
    const manifest = JSON.parse(vps.files.get(n.manifestFile));
    expect(manifest.resources).toMatchObject({ API_KEY: { createdBy: firstRun }, CONTAINER: { createdBy: firstRun }, COMPOSE: { createdBy: firstRun } });
    expect(manifest.resources.VHOST.createdBy).not.toBe(firstRun);
    expect(JSON.stringify([failed, r])).not.toContain(key);

    // c) re-APPLY: idempotente, sin tocar Apache.
    const callsBefore = vps.state.calls.length;
    const again = await ex(vps).apply({ spec: rec, runId: randomUUID() });
    expect(again.steps.find((s) => s.op === "VHOST").status).toBe("UNCHANGED");
    expect(vps.state.calls.slice(callsBefore).some((c) => c[0] === BIN.rebuild || c.includes("graceful"))).toBe(false);
  });

  it("9+10. ningún reinicio global y la configuración de otros clientes y firmadores protegidos no cambia", async () => {
    placeCert(vps);
    const scenarios = [
      () => { vps.state.rebuildFailure = { code: 255, stderr: RO_STDERR }; },
      () => { vps.state.rebuildFailure = null; vps.state.apacheTestFails = true; },
      () => { vps.state.apacheTestFails = false; vps.state.gracefulFails = true; },
      () => { vps.state.gracefulFails = false; },
    ];
    for (const setup of scenarios) {
      setup();
      await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    }
    expect(vps.files.get(FOREIGN)).toBe(FOREIGN_BODY);
    expect(vps.files.get(HTTPD_CONF)).toContain(`Include "${FOREIGN}"`);
    expect(vps.state.containers.some((c) => c.name === "dte-firmador-metatraining-test" && c.ports === "127.0.0.1:8115->8113/tcp")).toBe(true);
    expect(vps.state.calls.filter(isGlobalRestart)).toEqual([]);
    // Los únicos binarios invocados son los fijos (sin shell, sin rutas libres).
    expect(new Set(vps.state.calls.map((c) => c[0]))).toEqual(new Set([BIN.docker, BIN.ss, BIN.rebuild, BIN.apachectl]));
  });

  it("ROLLBACK con rebuild fallido: conserva include, API Key y contenedor (nada queda referenciado y ausente)", async () => {
    placeCert(vps);
    const runId = randomUUID();
    expect((await ex(vps).apply({ spec: SPEC, runId, apiKey: KEY() })).ok).toBe(true);
    const n = deriveResourceNames(SPEC);
    const include = vps.files.get(n.vhostIncludePath);
    const httpd = vps.files.get(HTTPD_CONF);
    vps.state.rebuildFailure = { code: 255, stderr: RO_STDERR };
    const r = await ex(vps).rollback({ spec: SPEC, runId });
    expect(r).toMatchObject({ ok: false, code: "APACHE_FAILED" });
    expect(vps.files.get(n.vhostIncludePath)).toBe(include);
    expect(vps.files.has(n.apiKeyFile)).toBe(true);
    expect(vps.state.containers.some((c) => c.name === n.containerName)).toBe(true);
    expect(vps.files.get(HTTPD_CONF)).toBe(httpd);
    expect(JSON.parse(vps.files.get(n.manifestFile)).resources.VHOST).toMatchObject({ createdBy: runId });
  });

  // ── Cambios concurrentes en httpd.conf (cPanel / AutoSSL / otro administrador) ──
  const FOREIGN_LINE = 'Include "/etc/apache2/conf.d/userdata/ssl/2_4/dhsoft/examenescpo.com.dhsoftware.app/autossl.conf"';
  const addForeign = (files) => files.set(HTTPD_CONF, `${files.get(HTTPD_CONF)}${FOREIGN_LINE}\n`);
  const HTTPD_LOCK = `${HTTPD_CONF}.lock`;

  it("concurrencia A: rebuild escribe lo propio + otro proceso cambia otra cosa → NO restaura (CONCURRENT_CHANGE)", async () => {
    placeCert(vps);
    vps.state.rebuildFailure = { code: 1, stderr: "Error: unexpected failure", writesBeforeFail: true };
    vps.state.afterRebuild = addForeign; // cambio ajeno en la misma ventana
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_RECOVERY_FAILED");
    const rec = r.steps.find((s) => s.op === "APACHE_RECOVERY");
    expect(rec.diagnostic).toMatchObject({ kind: "CONCURRENT_CHANGE" });
    expect(rec.detail).toMatch(/cambios propios y ajenos/);
    expect(vps.files.get(HTTPD_CONF)).toContain(FOREIGN_LINE); // el trabajo ajeno sigue ahí
    expect(vps.state.renames ?? []).not.toContain(HTTPD_CONF);
    expect(vps.state.calls.some((c) => c.includes("graceful"))).toBe(false);
  });

  it("concurrencia B: el rebuild no escribió y otro proceso cambió httpd.conf sin tocarnos → no se escribe, recuperación OK", async () => {
    placeCert(vps);
    vps.state.rebuildFailure = { code: 255, stderr: RO_STDERR };
    vps.state.onRebuild = addForeign;
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_FAILED");
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").detail).toMatch(/otro proceso.*no se toca/);
    expect(vps.files.get(HTTPD_CONF)).toContain(FOREIGN_LINE);
    expect(vps.state.renames ?? []).not.toContain(HTTPD_CONF);
  });

  it("concurrencia C: lock de cPanel activo al restaurar → no escribe", async () => {
    placeCert(vps);
    vps.state.apacheTestFails = true;
    vps.state.onConfigtest = (files) => files.set(HTTPD_LOCK, "12345");
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_RECOVERY_FAILED");
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").detail).toMatch(/lock de cPanel/);
    expect(vps.state.renames ?? []).not.toContain(HTTPD_CONF);
  });

  it("concurrencia D: httpd.conf cambia entre el fallo y la restauración → no escribe", async () => {
    placeCert(vps);
    vps.state.apacheTestFails = true;
    const n = deriveResourceNames(SPEC);
    // Justo antes de restaurar (comprobación del lock), otro proceso cambia httpd.conf.
    let fired = false;
    vps.state.onExists = (p, files) => { if (p === HTTPD_LOCK && !fired) { fired = true; addForeign(files); } };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_RECOVERY_FAILED");
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").detail).toMatch(/cambió después del fallo/);
    expect(vps.files.get(HTTPD_CONF)).toContain(FOREIGN_LINE);
    // httpd.conf sigue referenciando el include → se CONSERVA (nunca un Include roto).
    expect(vps.files.has(n.vhostIncludePath)).toBe(true);
    expect(r.steps.find((s) => s.op === "VHOST" && s.status === "KEPT")).toBeTruthy();
  });

  it("concurrencia E: carrera durante la escritura del temporal (compare-and-swap) → no renombra y borra el temporal", async () => {
    placeCert(vps);
    vps.state.apacheTestFails = true;
    vps.state.onWrite = (p, files) => { if (p.endsWith(".zolvi-restore")) addForeign(files); };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_RECOVERY_FAILED");
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").detail).toMatch(/cambió durante la restauración/);
    expect(vps.files.get(HTTPD_CONF)).toContain(FOREIGN_LINE);
    expect(vps.files.has(`${HTTPD_CONF}.zolvi-restore`)).toBe(false);
    expect(vps.state.renames ?? []).not.toContain(HTTPD_CONF);
  });

  it("concurrencia F: la copia se toma justo antes del rebuild (cambios ajenos previos no se revierten)", async () => {
    placeCert(vps);
    vps.state.onComposeUp = addForeign; // ocurre antes del paso Apache
    vps.state.rebuildFailure = { code: 255, stderr: RO_STDERR };
    const runId = randomUUID();
    const r = await ex(vps).apply({ spec: SPEC, runId, apiKey: KEY() });
    expect(r.code).toBe("APACHE_FAILED");
    expect(vps.files.get(`/var/lib/zolvi-signer-executor/httpd.conf.pre-${runId}`)).toContain(FOREIGN_LINE);
    expect(vps.files.get(HTTPD_CONF)).toContain(FOREIGN_LINE);
  });

  it("error de escritura al restaurar se informa como RESTORE_FAILED (no como concurrencia)", async () => {
    placeCert(vps);
    vps.state.apacheTestFails = true;
    const orig = vps.fs.renameSync;
    vps.fs.renameSync = (a, b) => { if (b === HTTPD_CONF) throw Object.assign(new Error("EROFS"), { code: "EROFS" }); return orig(a, b); };
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_RECOVERY_FAILED");
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").diagnostic).toMatchObject({ kind: "RESTORE_FAILED", stderr: "error EROFS" });
  });

  it("restauración legítima (solo cambios propios) conserva el resultado exacto y no deja temporales", async () => {
    placeCert(vps);
    const before = vps.files.get(HTTPD_CONF);
    vps.state.apacheTestFails = true;
    const r = await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    expect(r.code).toBe("APACHE_FAILED");
    expect(vps.files.get(HTTPD_CONF)).toBe(before);
    expect(vps.files.has(`${HTTPD_CONF}.zolvi-restore`)).toBe(false);
  });

  it("ROLLBACK con cambios ajenos concurrentes tampoco restaura httpd.conf", async () => {
    placeCert(vps);
    const runId = randomUUID();
    expect((await ex(vps).apply({ spec: SPEC, runId, apiKey: KEY() })).ok).toBe(true);
    vps.state.rebuildFailure = { code: 1, stderr: "Error", writesBeforeFail: true };
    vps.state.afterRebuild = addForeign;
    const r = await ex(vps).rollback({ spec: SPEC, runId });
    expect(r.ok).toBe(false);
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY").diagnostic).toMatchObject({ kind: "CONCURRENT_CHANGE" });
    expect(vps.files.get(HTTPD_CONF)).toContain(FOREIGN_LINE);
    expect(vps.files.has(deriveResourceNames(SPEC).vhostIncludePath)).toBe(true);
  });

  it("VERIFY informa el diagnóstico de apachectl -t", async () => {
    placeCert(vps);
    await ex(vps).apply({ spec: SPEC, runId: randomUUID(), apiKey: KEY() });
    vps.state.apacheTestFailsAlways = true;
    const v = await ex(vps).verify({ spec: SPEC });
    expect(v.checks.find((c) => c.code === "APACHE_SYNTAX")).toMatchObject({ status: "failed", detail: expect.stringContaining("CONFIG_ERROR") });
  });
});

// ── Causa raíz confirmada y recuperación de REC TEST con el helper ──
describe("REC TEST — causa raíz confirmada (sandbox) y recuperación vía helper", () => {
  const REC = { slug: "rechightraining", environment: "TEST", hostname: "firmador-rec-test.getzolvi.com", port: 8120, signerNit: "06140000000000", cpanelUser: "getzolvi" };
  const n = deriveResourceNames(REC);
  const existing = [
    { name: "dte-firmador-trustme-prod", ports: "127.0.0.1:8113->8113/tcp" },
    { name: "dte-firmador-trustme-test", ports: "127.0.0.1:8114->8113/tcp" },
    { name: "dte-firmador-metatraining-test", ports: "127.0.0.1:8115->8113/tcp" },
  ];
  const at = (mode) => (vps) => createExecutor({ run: vps.run, fs: vps.fs, now: () => new Date("2026-11-10T00:00:00Z"), httpProbe: async () => ({ ok: true, status: 200 }), apacheMode: mode, stateDir: "/var/lib/zolvi-signer-executor" });

  /** Estado real tras el primer APPLY de REC: todo creado salvo el include HTTPS. */
  function recVps() {
    const vps = fakeVps({ containers: existing, listening: [8113, 8114, 8115] });
    const firstRun = randomUUID();
    vps.dirs.add(n.dir); vps.dirs.add(n.certDir);
    vps.files.set(n.certFile, "<certificado REC>");
    vps.files.set(n.apiKeyFile, renderApiKeyDefine(REC, KEY()));
    vps.files.set(n.composeFile, renderCompose(REC));
    vps.files.set(n.manifestFile, JSON.stringify({ id: n.id, templateVersion: "zolvi-signer-v1", resources: { DIR: { createdBy: firstRun }, API_KEY: { createdBy: firstRun }, COMPOSE: { createdBy: firstRun }, CONTAINER: { createdBy: firstRun } } }));
    vps.state.containers.push({ name: n.containerName, ports: "127.0.0.1:8120->8113/tcp", labels: `zolvi.managed=true,zolvi.signer.id=${n.id},zolvi.template.version=zolvi-signer-v1` });
    vps.state.listening.push(8120);
    vps.state.sandboxBlocksRebuild = true; // el VPS real
    const photo = () => ({
      key: vps.files.get(n.apiKeyFile), cert: vps.files.get(n.certFile), compose: vps.files.get(n.composeFile),
      containers: JSON.stringify(vps.state.containers), listening: JSON.stringify([...vps.state.listening].sort()),
    });
    return { vps, firstRun, photo };
  }

  it("modo direct (el de producción hoy) reproduce el incidente: PERMISSION_DENIED con la ruta del lock de Cloudflare", async () => {
    const { vps } = recVps();
    const r = await at("direct")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(r.code).toBe("APACHE_FAILED"); // ahora con recuperación correcta (antes: APACHE_RECOVERY_FAILED)
    const d = r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic;
    expect(d).toMatchObject({ kind: "PERMISSION_DENIED", exitCode: 255, httpdConfChanged: false });
    expect(d.stderr).toContain("/etc/apache2/conf.d/includes/cloudflare.conf.lock");
    expect(d.stderr).toContain("/home/getzolvi/.htpasswds");
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);
  });

  it("modo helper: completa SOLO el include y llega a OK; certificado, API Key, contenedor y puertos intactos", async () => {
    const { vps, firstRun, photo } = recVps();
    const before = photo();
    const r = await at("helper")(vps).apply({ spec: REC, runId: randomUUID() }); // sin apiKey: nunca se genera una nueva
    expect(r.ok).toBe(true);
    expect(Object.fromEntries(r.steps.map((s) => [s.op, s.status]))).toMatchObject({
      DIR: "UNCHANGED", CERT_DIR: "UNCHANGED", API_KEY: "KEPT", CERT: "PRESENT", COMPOSE: "UNCHANGED", CONTAINER: "ENSURED", VHOST: "CREATED", APACHE_RELOAD: "OK",
    });
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").detail).toBe("backend helper");
    expect(photo()).toEqual(before); // API Key, certificado, compose, contenedores (TrustMe, MetaTraining, REC) y puertos
    expect(r.observed.container).toMatchObject({ name: n.containerName, managed: true, boundToExpectedPort: true, loopbackOnly: true });
    expect(vps.files.get(HTTPD_CONF)).toContain(n.vhostIncludePath);
    const manifest = JSON.parse(vps.files.get(n.manifestFile));
    expect(manifest.resources).toMatchObject({ API_KEY: { createdBy: firstRun }, CONTAINER: { createdBy: firstRun }, COMPOSE: { createdBy: firstRun } });
  });

  it("modo helper: el proceso del ejecutor NUNCA ejecuta cPanel/apachectl; solo arranca las 3 unidades fijas", async () => {
    const { vps } = recVps();
    await at("helper")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(vps.state.calls.some((c) => c[0] === BIN.rebuild || c[0] === BIN.apachectl)).toBe(false);
    const started = vps.state.calls.filter((c) => c[0] === BIN.systemctl && c[1] === "start").map((c) => c[2]);
    expect(started.map((u) => u.replace(/-[0-9a-f]{16}\.service$/, ""))).toEqual(["zolvi-apache-helper@rebuild", "zolvi-apache-helper@configtest", "zolvi-apache-helper@graceful"]);
    started.forEach((u) => expect(u).toMatch(/^zolvi-apache-helper@(rebuild|configtest|graceful)-[0-9a-f]{16}\.service$/));
    expect(vps.state.calls.filter((c) => c[0] === BIN.systemctl).every((c) => ["start", "show"].includes(c[1]))).toBe(true);
    // Fuera del sandbox el helper ejecutó exactamente los comandos fijos.
    expect(vps.state.helperCalls).toEqual([[BIN.rebuild], [BIN.apachectl, "-t"], [BIN.apachectl, "-k", "graceful"]]);
    // Docker: solo lectura y `compose up -d` idempotente; nada de down/rm/run/create/restart.
    const docker = vps.state.calls.filter((c) => c[0] === BIN.docker).map((c) => c.slice(1).join(" "));
    expect(docker.every((c) => c.startsWith("ps ") || /^compose -f \S+ -p zolvi-signer-rechightraining-test up -d$/.test(c))).toBe(true);
    expect(vps.state.helperResults.at(-1)).toMatchObject({ op: "graceful", exitCode: 0 });
    // Resultados leídos y borrados: nada se acumula en /run.
    expect([...vps.files.keys()].filter((f) => f.startsWith(HELPER_RESULT_DIR))).toEqual([]);
  });

  it("modo helper + re-APPLY: idempotente, sin rebuild ni graceful; VERIFY completo", async () => {
    const { vps } = recVps();
    expect((await at("helper")(vps).apply({ spec: REC, runId: randomUUID() })).ok).toBe(true);
    const helperBefore = vps.state.helperCalls.length;
    const again = await at("helper")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(again.steps.find((s) => s.op === "VHOST").status).toBe("UNCHANGED");
    expect(vps.state.helperCalls.length).toBe(helperBefore);
    const v = await at("helper")(vps).verify({ spec: REC });
    expect(v.checks.filter((c) => c.status !== "ok")).toEqual([]);
  });

  it("ROLLBACK del APPLY de recuperación retira SOLO el include; API Key, certificado y contenedor del primer APPLY quedan", async () => {
    const { vps, photo } = recVps();
    const before = photo();
    const runId = randomUUID();
    expect((await at("helper")(vps).apply({ spec: REC, runId })).ok).toBe(true);
    const rb = await at("helper")(vps).rollback({ spec: REC, runId });
    expect(rb.ok).toBe(true);
    expect(rb.steps.map((s) => `${s.op}:${s.status}`)).toEqual(["VHOST:REMOVED", "APACHE_RELOAD:OK", "CERT:UNTOUCHED"]);
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);
    expect(photo()).toEqual(before);
    expect(vps.files.get(HTTPD_CONF)).not.toContain(n.vhostIncludePath);
  });

  // ── Incidente APPLY 2026-11-10 23:57 (correlación por InvocationID + reversión prematura) ──
  const REC_FOREIGN = 'Include "/etc/apache2/conf.d/userdata/ssl/2_4/dhsoft/examenescpo.com.dhsoftware.app/autossl.conf"';

  it("estado que dejó el incidente (httpd.conf referencia el include REC ausente) → APPLY por helper lo completa y la config vuelve a ser válida", async () => {
    const { vps, photo } = recVps();
    vps.state.strictIncludes = true;
    // El rebuild del helper sí corrió y escribió httpd.conf con el include; luego el ejecutor lo borró.
    vps.files.set(n.vhostIncludePath, "x");
    vps.files.set(HTTPD_CONF, renderHttpdConf(vps.files));
    vps.files.delete(n.vhostIncludePath);
    expect((await at("helper")(vps).verify({ spec: REC })).checks.find((c) => c.code === "APACHE_SYNTAX").status).toBe("failed");
    const before = photo();
    const r = await at("helper")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.op === "VHOST").status).toBe("CREATED");
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").status).toBe("OK");
    expect(photo()).toEqual(before);
    const v = await at("helper")(vps).verify({ spec: REC });
    expect(v.checks.filter((c) => c.status !== "ok")).toEqual([]);
  });

  it("cambio MIXTO en httpd.conf: el include se CONSERVA, apachectl -t se ejecuta y la config en disco queda válida (antes: Include roto)", async () => {
    const { vps, photo } = recVps();
    vps.state.sandboxBlocksRebuild = false;
    vps.state.strictIncludes = true;
    vps.state.rebuildFailure = { code: 1, stderr: "Error: unexpected failure", writesBeforeFail: true };
    vps.state.afterRebuild = (files) => files.set(HTTPD_CONF, `${files.get(HTTPD_CONF)}${REC_FOREIGN}\n`);
    vps.files.set(REC_FOREIGN.slice(9, -1), "# ajeno");
    const before = photo();
    const r = await at("helper")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(r.code).toBe("APACHE_RECOVERY_FAILED");
    expect(r.message).toMatch(/config en disco válida; include conservado/);
    expect(r.steps.find((s) => s.op === "VHOST" && s.status === "KEPT")).toBeTruthy();
    const rec = r.steps.find((s) => s.op === "APACHE_RECOVERY");
    expect(rec).toMatchObject({ status: "FAILED", configValid: true, diagnostic: { kind: "CONCURRENT_CHANGE" } });
    expect(vps.files.has(n.vhostIncludePath)).toBe(true);
    expect(vps.files.get(HTTPD_CONF)).toContain(REC_FOREIGN);
    expect(vps.state.helperResults.map((x) => x.op)).toEqual(["rebuild", "configtest"]); // sin graceful
    // El manifiesto conserva el VHOST de esta corrida: un ROLLBACK posterior lo puede retirar.
    expect(JSON.parse(vps.files.get(n.manifestFile)).resources.VHOST).toBeTruthy();
    expect(photo()).toEqual(before);
    expect((await at("helper")(vps).verify({ spec: REC })).checks.find((c) => c.code === "APACHE_SYNTAX").status).toBe("ok");
  });

  it("resultado del helper perdido tras un rebuild que escribió solo lo propio → httpd.conf restaurado, include retirado, config válida", async () => {
    const { vps, photo } = recVps();
    vps.state.strictIncludes = true;
    vps.state.dropHelperResult = (inst) => inst.startsWith("rebuild-");
    const confBefore = vps.files.get(HTTPD_CONF);
    const before = photo();
    const r = await at("helper")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(r.code).toBe("APACHE_FAILED");
    const d = r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic;
    expect(d).toMatchObject({ kind: "HELPER_RESULT_MISSING", httpdConfChanged: true });
    expect(r.message).toMatch(/zolvi-apache-helper@rebuild-[0-9a-f]{16}\.service/); // la unidad se ve, no [EMAIL REDACTADO]
    expect(r.message).not.toMatch(/REDACTADO/);
    expect(r.steps.filter((s) => s.op === "VHOST").map((s) => s.status)).toEqual(["CREATED", "REVERTED"]);
    expect(r.steps.find((s) => s.op === "APACHE_RECOVERY")).toMatchObject({ status: "OK", configValid: true });
    expect(vps.files.get(HTTPD_CONF)).toBe(confBefore);
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);
    expect(photo()).toEqual(before);
  });

  it("helper no instalado: APPLY falla sin tocar Apache y revierte el include (HELPER_UNAVAILABLE)", async () => {
    const { vps, photo } = recVps();
    vps.state.helperInstalled = false;
    const before = photo();
    const r = await at("helper")(vps).apply({ spec: REC, runId: randomUUID() });
    expect(r.ok).toBe(false);
    expect(r.steps.find((s) => s.op === "APACHE_RELOAD").diagnostic.kind).toBe("HELPER_UNAVAILABLE");
    expect(vps.files.has(n.vhostIncludePath)).toBe(false);
    expect(vps.state.helperCalls).toEqual([]);
    expect(photo()).toEqual(before);
  });
});

// ── Autenticación del canal Zolvi -> ejecutor ──────────────────────
describe("canal HTTP del ejecutor — HMAC, anti-replay y lista blanca de operaciones", () => {
  const SECRET = "s".repeat(40);
  const T = 1_800_000_000_000;
  const body = (o) => JSON.stringify({ ts: T, nonce: randomBytes(12).toString("hex"), ...o });
  const handler = () => createExecutorHandler(
    { inspect: async () => ({ ok: true, op: "inspect" }), apply: async () => ({ ok: true }), verify: async () => ({ ok: true }), rollback: async () => ({ ok: true }) },
    createRequestVerifier(SECRET, { now: () => T }),
  );

  it("firma válida -> ejecuta; firma incorrecta -> 401", async () => {
    const h = handler();
    const b = body({ op: "inspect", params: {} });
    expect((await h(b, signExecutorRequest(SECRET, b))).status).toBe(200);
    expect(await h(b.replace("inspect", "apply"), signExecutorRequest(SECRET, b))).toMatchObject({ status: 401, body: { code: "BAD_SIGNATURE" } });
  });

  it("replay y peticiones viejas rechazadas", async () => {
    const h = handler();
    const b = body({ op: "inspect", params: {} });
    await h(b, signExecutorRequest(SECRET, b));
    expect((await h(b, signExecutorRequest(SECRET, b))).body.code).toBe("REPLAY");
    const old = JSON.stringify({ ts: T - 10 * 60_000, nonce: "n".repeat(20), op: "inspect" });
    expect((await h(old, signExecutorRequest(SECRET, old))).body.code).toBe("STALE_REQUEST");
  });

  it("operación fuera de la lista blanca (p.ej. exec) -> OP_NOT_ALLOWED", async () => {
    const h = handler();
    const b = body({ op: "exec", params: { cmd: "rm -rf /" } });
    expect(await h(b, signExecutorRequest(SECRET, b))).toMatchObject({ status: 400, body: { code: "OP_NOT_ALLOWED" } });
  });

  it("secreto corto -> el verificador no arranca", () => {
    expect(() => createRequestVerifier("corto")).toThrow();
  });
});

// ── Anti-replay persistente (reinicio del ejecutor) ────────────────
describe("anti-replay persistente — sobrevive al reinicio del ejecutor", () => {
  const SECRET = "s".repeat(40);
  const FILE = "/var/lib/zolvi-signer-executor/nonces.json";
  const T0 = 1_800_000_000_000;

  // Disco simulado compartido entre "procesos" (solo readFile/writeFile/rename).
  function fakeDisk() {
    const files = new Map();
    return {
      files,
      readFileSync: (p) => { if (!files.has(p)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return files.get(p); },
      writeFileSync: (p, c) => { files.set(p, String(c)); },
      renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
    };
  }
  const ops = { inspect: async () => ({ ok: true, op: "inspect" }), apply: async () => ({ ok: true, op: "apply" }), verify: async () => ({ ok: true }), rollback: async () => ({ ok: true }) };
  const boot = (disk, now, extra = {}) => createExecutorHandler(ops, createRequestVerifier(SECRET, { now, store: createFileNonceStore(FILE, { fs: disk, ...extra }) }));

  it("request aceptada, reinicio, misma request -> REPLAY (sin ejecutar la operación)", async () => {
    const disk = fakeDisk();
    let t = T0;
    const b = JSON.stringify({ op: "apply", params: {}, ts: T0, nonce: randomBytes(16).toString("hex") });
    const sig = signExecutorRequest(SECRET, b);

    expect((await boot(disk, () => t)(b, sig)).status).toBe(200);

    // "Reinicio": proceso nuevo, memoria vacía, mismo disco, 1 min después.
    t = T0 + 60_000;
    let executed = false;
    const h2 = createExecutorHandler(
      { ...ops, apply: async () => { executed = true; return { ok: true }; } },
      createRequestVerifier(SECRET, { now: () => t, store: createFileNonceStore(FILE, { fs: disk }) }),
    );
    expect(await h2(b, sig)).toMatchObject({ status: 401, body: { code: "REPLAY" } });
    expect(executed).toBe(false);

    // Una request nueva (otro nonce) sigue funcionando: el aprovisionador no pierde idempotencia.
    const b2 = JSON.stringify({ op: "inspect", params: {}, ts: t, nonce: randomBytes(16).toString("hex") });
    expect((await h2(b2, signExecutorRequest(SECRET, b2))).status).toBe(200);
  });

  it("el archivo no contiene nonces, firmas ni secretos; las entradas vencidas se podan", async () => {
    const disk = fakeDisk();
    let t = T0;
    const h = boot(disk, () => t);
    const nonce = randomBytes(16).toString("hex");
    const b = JSON.stringify({ op: "inspect", params: {}, ts: T0, nonce });
    const sig = signExecutorRequest(SECRET, b);
    await h(b, sig);
    const stored = disk.files.get(FILE);
    expect(stored).not.toContain(nonce);
    expect(stored).not.toContain(sig);
    expect(stored).not.toContain(SECRET);
    expect(Object.keys(JSON.parse(stored).entries)).toHaveLength(1);

    // 11 min después (ventana 2×5 min vencida) otra request poda la anterior.
    t = T0 + 11 * 60_000;
    const b2 = JSON.stringify({ op: "inspect", params: {}, ts: t, nonce: randomBytes(16).toString("hex") });
    await boot(disk, () => t)(b2, signExecutorRequest(SECRET, b2));
    expect(Object.keys(JSON.parse(disk.files.get(FILE)).entries)).toHaveLength(1);
    // Y la request vieja sigue rechazada por la ventana de tiempo.
    expect((await boot(disk, () => t)(b, sig)).body.code).toBe("STALE_REQUEST");
  });

  it("almacén lleno o no escribible -> NONCE_STORE_UNAVAILABLE (fail closed, no ejecuta)", async () => {
    const disk = fakeDisk();
    const h = boot(disk, () => T0, { maxEntries: 1 });
    const mk = () => { const b = JSON.stringify({ op: "inspect", params: {}, ts: T0, nonce: randomBytes(16).toString("hex") }); return [b, signExecutorRequest(SECRET, b)]; };
    expect((await h(...mk())).status).toBe(200);
    expect(await h(...mk())).toMatchObject({ status: 401, body: { code: "NONCE_STORE_UNAVAILABLE" } });

    const broken = { ...fakeDisk(), writeFileSync: () => { throw new Error("EROFS"); } };
    expect((await boot(broken, () => T0)(...mk())).body.code).toBe("NONCE_STORE_UNAVAILABLE");
  });

  it("almacén corrupto -> el servicio no arranca (no olvida nonces vigentes)", () => {
    const disk = fakeDisk();
    disk.files.set(FILE, "{no-json");
    expect(() => createFileNonceStore(FILE, { fs: disk })).toThrow();
  });
});
