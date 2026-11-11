// ─────────────────────────────────────────────────────────────────
// ops/dte-signer-executor/zolvi-signer-executor.mjs
//
// FISCAL-ONBOARDING — ejecutor del VPS (WHM/cPanel) para firmadores DTE
// por organización/ambiente. Sin dependencias (Node >= 18).
//
// Principios de seguridad:
//   - SOLO operaciones predefinidas: inspect | apply | verify | rollback.
//     No existe ninguna vía para ejecutar comandos arbitrarios.
//   - Comandos con ruta absoluta fija vía execFile (sin shell); los
//     argumentos se derivan de parámetros validados por signer-core.mjs.
//   - Contenedores PROTECTED_CONTAINERS (p.ej. MetaTraining TEST) y
//     contenedores sin label zolvi.managed nunca se modifican.
//   - El certificado .crt lo coloca el operador (nunca viaja por Zolvi);
//     el ejecutor solo verifica su presencia y huella.
//   - La API Key nunca se devuelve ni se registra: solo su huella.
//   - ROLLBACK revierte únicamente recursos que el manifiesto atribuye al
//     runId indicado.
//   - Modo HTTP: escucha solo en 127.0.0.1, exige firma HMAC-SHA256 con
//     timestamp (±300 s) y nonce no repetido.
//
// Uso CLI (operador, en el VPS):
//   node zolvi-signer-executor.mjs inspect --spec /root/spec.json
//   node zolvi-signer-executor.mjs verify  --spec /root/spec.json
// Uso servicio: ver ops/dte-signer-executor/README.md (systemd).
// ─────────────────────────────────────────────────────────────────

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { signExecutorRequest, createRequestVerifier, createFileNonceStore } from "./lib/executor-auth.mjs";
import * as nodeFs from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import {
  TEMPLATE_VERSION,
  PROTECTED_CONTAINERS,
  PROTECTED_HOSTNAMES,
  validateSignerSpec,
  validateApiKey,
  deriveResourceNames,
  renderCompose,
  renderVhostInclude,
  renderApiKeyDefine,
} from "./lib/signer-core.mjs";

export const BIN = Object.freeze({
  docker:     "/usr/bin/docker",
  ss:         "/usr/sbin/ss",
  apachectl:  "/usr/sbin/apachectl",
  rebuild:    "/usr/local/cpanel/scripts/rebuildhttpdconf",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExecutorError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function defaultRun(cmd, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: false }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

function sha16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function firstLine(text) {
  return String(text ?? "").split("\n")[0] ?? "";
}

/**
 * Crea un ejecutor con dependencias inyectables (tests sin Docker/Apache).
 * deps: { run, fs, now, httpProbe }
 */
export function createExecutor(deps = {}) {
  const run = deps.run ?? defaultRun;
  const fs = deps.fs ?? nodeFs;
  const now = deps.now ?? (() => new Date());
  const httpProbe = deps.httpProbe ?? defaultHttpProbe;

  function requireSpec(params) {
    const spec = params?.spec;
    const v = validateSignerSpec(spec);
    if (!v.ok) throw new ExecutorError("INVALID_SPEC", v.errors.join(" "));
    return spec;
  }

  function readText(path) {
    try { return fs.readFileSync(path, "utf8"); } catch { return null; }
  }

  function readManifest(n) {
    const raw = readText(n.manifestFile);
    if (!raw) return { id: n.id, templateVersion: TEMPLATE_VERSION, resources: {} };
    try { return JSON.parse(raw); } catch { return { id: n.id, templateVersion: TEMPLATE_VERSION, resources: {} }; }
  }

  function writeManifest(n, manifest) {
    fs.writeFileSync(n.manifestFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  }

  async function listContainers() {
    const r = await run(BIN.docker, ["ps", "-a", "--format", "{{json .}}"]);
    if (r.code !== 0) throw new ExecutorError("DOCKER_UNAVAILABLE", "No se pudo listar contenedores Docker.");
    return r.stdout.split("\n").filter(Boolean).map((line) => {
      try {
        const j = JSON.parse(line);
        const labels = Object.fromEntries(String(j.Labels ?? "").split(",").filter(Boolean).map((kv) => {
          const i = kv.indexOf("=");
          return i === -1 ? [kv, ""] : [kv.slice(0, i), kv.slice(i + 1)];
        }));
        return { name: j.Names, state: j.State, ports: j.Ports ?? "", labels };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async function listListeningPorts() {
    const r = await run(BIN.ss, ["-ltnH"]);
    if (r.code !== 0) return [];
    const ports = new Set();
    for (const line of r.stdout.split("\n")) {
      const local = line.trim().split(/\s+/)[3];
      const m = local && local.match(/:(\d+)$/);
      if (m) ports.add(Number(m[1]));
    }
    return [...ports].sort((a, b) => a - b);
  }

  async function observe(spec) {
    const n = deriveResourceNames(spec);
    const containers = await listContainers();
    const listening = await listListeningPorts();
    const mine = containers.find((c) => c.name === n.containerName) ?? null;

    const apiKeyRaw = readText(n.apiKeyFile);
    const apiKeyMatch = apiKeyRaw?.match(/Define\s+\S+\s+([a-f0-9]{64})/);
    let certFingerprint = null;
    try { certFingerprint = sha16(fs.readFileSync(n.certFile)); } catch { certFingerprint = null; }
    const compose = readText(n.composeFile);
    const vhost = readText(n.vhostIncludePath);

    // Otros includes en el vhost del mismo hostname (firmador existente de
    // TrustMe/MetaTraining u otro id de Zolvi): escribir el nuestro allí
    // añadiría un segundo proxy al dominio de otro firmador.
    const vhostDir = n.vhostIncludePath.slice(0, n.vhostIncludePath.lastIndexOf("/"));
    let vhostForeignIncludes = [];
    try {
      vhostForeignIncludes = (fs.readdirSync?.(vhostDir) ?? [])
        .map(String)
        .filter((f) => !f.startsWith(n.vhostIncludeName));
    } catch {
      vhostForeignIncludes = [];
    }

    // Otros recursos que ocupan el mismo puerto (no el contenedor propio).
    const portOwners = containers
      .filter((c) => c.name !== n.containerName && new RegExp(`:${spec.port}->`).test(c.ports))
      .map((c) => c.name);

    return {
      names: { id: n.id, containerName: n.containerName, dir: n.dir, vhostIncludePath: n.vhostIncludePath },
      container: mine && {
        name: mine.name,
        state: mine.state,
        managed: mine.labels["zolvi.managed"] === "true" && mine.labels["zolvi.signer.id"] === n.id,
        templateVersion: mine.labels["zolvi.template.version"] ?? null,
        loopbackOnly: mine.ports === "" || !/0\.0\.0\.0:|\[::\]:|:::/.test(mine.ports),
        boundToExpectedPort: new RegExp(`127\\.0\\.0\\.1:${spec.port}->`).test(mine.ports),
      },
      protected: PROTECTED_CONTAINERS.includes(n.containerName) || PROTECTED_HOSTNAMES.includes(spec.hostname),
      vhostForeignIncludes,
      portInUse: listening.includes(spec.port),
      portOwners,
      dirExists: fs.existsSync(n.dir),
      cert: { present: certFingerprint !== null, fingerprint: certFingerprint },
      apiKey: { present: !!apiKeyMatch, fingerprint: apiKeyMatch ? sha16(apiKeyMatch[1]) : null },
      compose: { present: compose !== null, templateVersion: compose ? firstLine(compose).replace(/^#\s*/, "").split(" ")[0] : null, matches: compose === renderCompose(spec) },
      vhost: { present: vhost !== null, templateVersion: vhost ? firstLine(vhost).replace(/^#\s*/, "").split(" ")[0] : null, matches: vhost === renderVhostInclude(spec) },
      manifest: readManifest(n),
      observedAt: now().toISOString(),
      allContainers: containers.map((c) => ({ name: c.name, managed: c.labels["zolvi.managed"] === "true", ports: c.ports })),
      listeningPorts: listening,
    };
  }

  async function inspect(params) {
    const spec = requireSpec(params);
    return { ok: true, op: "inspect", observed: await observe(spec) };
  }

  function assertMutable(spec, observed) {
    const n = deriveResourceNames(spec);
    if (PROTECTED_CONTAINERS.includes(n.containerName)) {
      throw new ExecutorError("PROTECTED_RESOURCE", `El contenedor ${n.containerName} es administrado manualmente y está protegido.`);
    }
    if (PROTECTED_HOSTNAMES.includes(spec.hostname)) {
      throw new ExecutorError("PROTECTED_RESOURCE", `El hostname ${spec.hostname} pertenece a un firmador administrado manualmente y está protegido.`);
    }
    if ((observed.vhostForeignIncludes ?? []).length > 0) {
      throw new ExecutorError("CONFLICT_UNMANAGED", `El vhost de ${spec.hostname} ya tiene includes ajenos (${observed.vhostForeignIncludes.join(", ")}); no se modifica.`);
    }
    if (observed.container && !observed.container.managed) {
      throw new ExecutorError("CONFLICT_UNMANAGED", `Existe un contenedor ${n.containerName} no administrado por Zolvi; no se modifica.`);
    }
    if (observed.portOwners.length > 0) {
      throw new ExecutorError("PORT_CONFLICT", `El puerto ${spec.port} ya está publicado por: ${observed.portOwners.join(", ")}.`);
    }
    if (observed.portInUse && !observed.container) {
      throw new ExecutorError("PORT_CONFLICT", `El puerto ${spec.port} ya está en uso en el VPS.`);
    }
    if (observed.vhost.present && !String(observed.vhost.templateVersion ?? "").startsWith("zolvi-signer-")) {
      throw new ExecutorError("CONFLICT_UNMANAGED", "Existe un include Apache no generado por Zolvi en la ruta destino.");
    }
  }

  function writeIfChanged(path, content, mode, manifest, key, runId, steps) {
    const current = readText(path);
    if (current === content) {
      steps.push({ op: key, status: "UNCHANGED" });
      return false;
    }
    if (current !== null) {
      fs.writeFileSync(`${path}.bak-${runId}`, current, { mode: 0o600 });
      manifest.resources[key] = { ...(manifest.resources[key] ?? {}), updatedBy: runId, backup: `${path}.bak-${runId}` };
    } else {
      manifest.resources[key] = { createdBy: runId };
    }
    fs.writeFileSync(path, content, { mode });
    steps.push({ op: key, status: current === null ? "CREATED" : "UPDATED" });
    return true;
  }

  async function apacheReload(steps) {
    // El script de cPanel --graceful puede detener el httpd compartido y cortar
    // la propia conexión HTTPS del ejecutor. No usar restartsrv_httpd aquí.
    const rebuild = await run(BIN.rebuild, []);
    if (rebuild.code !== 0) return { ok: false, phase: "rebuild", detail: "rebuildhttpdconf falló." };
    const test = await run(BIN.apachectl, ["-t"]);
    if (test.code !== 0) return { ok: false, phase: "syntax", detail: `apachectl -t falló: ${firstLine(test.stderr).slice(0, 200)}` };
    const graceful = await run(BIN.apachectl, ["-k", "graceful"]);
    if (graceful.code !== 0) return { ok: false, phase: "signal", detail: "apachectl -k graceful falló." };
    steps.push({ op: "APACHE_RELOAD", status: "OK" });
    return { ok: true };
  }

  async function apply(params) {
    const spec = requireSpec(params);
    const runId = params?.runId;
    if (!UUID_RE.test(String(runId ?? ""))) throw new ExecutorError("INVALID_RUN_ID", "runId UUID requerido.");
    const n = deriveResourceNames(spec);
    const observed = await observe(spec);
    assertMutable(spec, observed);

    const steps = [];
    const manifest = readManifest(n);
    manifest.templateVersion = TEMPLATE_VERSION;

    // 1. Carpetas privadas
    for (const [key, dir] of [["DIR", n.dir], ["CERT_DIR", n.certDir]]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
        manifest.resources[key] = { createdBy: runId };
        steps.push({ op: key, status: "CREATED" });
      } else {
        steps.push({ op: key, status: "UNCHANGED" });
      }
    }
    writeManifest(n, manifest);

    // 2. API Key (nunca se rota implícitamente en reejecuciones)
    if (observed.apiKey.present) {
      steps.push({ op: "API_KEY", status: "KEPT", detail: `huella ${observed.apiKey.fingerprint}` });
    } else {
      if (!validateApiKey(params.apiKey)) throw new ExecutorError("API_KEY_REQUIRED", "Se requiere API Key nueva (64 hex) para el primer APPLY.");
      fs.writeFileSync(n.apiKeyFile, renderApiKeyDefine(spec, params.apiKey), { mode: 0o600 });
      manifest.resources.API_KEY = { createdBy: runId };
      steps.push({ op: "API_KEY", status: "CREATED", detail: `huella ${sha16(params.apiKey)}` });
      writeManifest(n, manifest);
    }

    // 3. Certificado: lo coloca el operador. Sin él no se levanta el contenedor.
    if (!fs.existsSync(n.certFile)) {
      steps.push({ op: "CERT", status: "BLOCKED", detail: `Coloque el certificado del emisor en ${n.certFile} (0640, solo lectura para el contenedor).` });
      return { ok: false, op: "apply", code: "CERT_MISSING", steps, observed: await observe(spec) };
    }
    steps.push({ op: "CERT", status: "PRESENT", detail: `huella ${sha16(fs.readFileSync(n.certFile))}` });

    // 4. Compose + contenedor
    writeIfChanged(n.composeFile, renderCompose(spec), 0o640, manifest, "COMPOSE", runId, steps);
    writeManifest(n, manifest);
    const up = await run(BIN.docker, ["compose", "-f", n.composeFile, "-p", n.composeProject, "up", "-d"]);
    if (up.code !== 0) {
      writeManifest(n, manifest);
      return { ok: false, op: "apply", code: "CONTAINER_FAILED", steps: [...steps, { op: "CONTAINER", status: "FAILED", detail: firstLine(up.stderr).slice(0, 200) }], observed: await observe(spec) };
    }
    if (!observed.container) manifest.resources.CONTAINER = { createdBy: runId };
    steps.push({ op: "CONTAINER", status: observed.container ? "ENSURED" : "CREATED" });
    writeManifest(n, manifest);

    // 5. Include Apache del vhost SSL (cPanel userdata) con verificación y auto-reversión.
    const vhostDir = n.vhostIncludePath.slice(0, n.vhostIncludePath.lastIndexOf("/"));
    if (!fs.existsSync(vhostDir)) fs.mkdirSync(vhostDir, { recursive: true, mode: 0o755 });
    const previousVhost = readText(n.vhostIncludePath);
    const changed = writeIfChanged(n.vhostIncludePath, renderVhostInclude(spec), 0o644, manifest, "VHOST", runId, steps);
    writeManifest(n, manifest);
    if (changed) {
      const reload = await apacheReload(steps);
      if (!reload.ok) {
        if (previousVhost === null) fs.unlinkSync(n.vhostIncludePath);
        else fs.writeFileSync(n.vhostIncludePath, previousVhost, { mode: 0o644 });
        delete manifest.resources.VHOST;
        writeManifest(n, manifest);
        // Si falló la comprobación ANTES de señalizar Apache, no hay razón
        // para recargar una segunda vez. Si falló la señal, restaurar la
        // configuración anterior con otra recarga gradual, nunca un restart.
        const recovery = await run(BIN.rebuild, []);
        const recoveryTest = recovery.code === 0 ? await run(BIN.apachectl, ["-t"]) : { code: 1 };
        let recovered = recovery.code === 0 && recoveryTest.code === 0;
        if (recovered && reload.phase === "signal") {
          const restoreSignal = await run(BIN.apachectl, ["-k", "graceful"]);
          recovered = restoreSignal.code === 0;
        }
        return {
          ok: false, op: "apply", code: recovered ? "APACHE_FAILED" : "APACHE_RECOVERY_FAILED",
          steps: [...steps, { op: "VHOST", status: "REVERTED", detail: reload.detail },
            { op: "APACHE_RECOVERY", status: recovered ? "OK" : "FAILED", detail: recovered ? "Configuración anterior validada." : "Revisar Apache manualmente; sin reinicio automático." }],
          observed: await observe(spec),
        };
      }
    }

    return { ok: true, op: "apply", steps, observed: await observe(spec) };
  }

  async function verify(params) {
    const spec = requireSpec(params);
    const observed = await observe(spec);
    const checks = [];
    const add = (code, ok, detail) => checks.push({ code, status: ok ? "ok" : "failed", ...(detail ? { detail } : {}) });

    add("CONTAINER_RUNNING", observed.container?.state === "running");
    add("CONTAINER_MANAGED", !!observed.container?.managed);
    add("PORT_LOOPBACK_ONLY", !!observed.container?.loopbackOnly && !!observed.container?.boundToExpectedPort);
    add("CERT_PRESENT", observed.cert.present);
    add("API_KEY_PRESENT", observed.apiKey.present);
    add("COMPOSE_TEMPLATE_CURRENT", observed.compose.matches);
    add("VHOST_TEMPLATE_CURRENT", observed.vhost.matches);
    const probe = observed.container?.state === "running" ? await httpProbe(`http://127.0.0.1:${spec.port}/`) : { ok: false, status: null };
    add("SIGNER_LOCAL_HTTP", probe.ok, probe.status ? `HTTP ${probe.status}` : "sin respuesta");
    const test = await run(BIN.apachectl, ["-t"]);
    add("APACHE_SYNTAX", test.code === 0);

    return { ok: checks.every((c) => c.status === "ok"), op: "verify", checks, observed };
  }

  async function rollback(params) {
    const spec = requireSpec(params);
    const runId = params?.runId;
    if (!UUID_RE.test(String(runId ?? ""))) throw new ExecutorError("INVALID_RUN_ID", "runId UUID requerido.");
    const n = deriveResourceNames(spec);
    if (PROTECTED_CONTAINERS.includes(n.containerName) || PROTECTED_HOSTNAMES.includes(spec.hostname)) {
      throw new ExecutorError("PROTECTED_RESOURCE", "Recurso protegido.");
    }
    const observed = await observe(spec);
    const manifest = readManifest(n);
    const r = manifest.resources ?? {};
    const steps = [];
    let vhostTouched = false;

    if (r.VHOST?.createdBy === runId) {
      if (fs.existsSync(n.vhostIncludePath)) fs.unlinkSync(n.vhostIncludePath);
      delete r.VHOST; vhostTouched = true;
      steps.push({ op: "VHOST", status: "REMOVED" });
    } else if (r.VHOST?.updatedBy === runId && r.VHOST.backup && fs.existsSync(r.VHOST.backup)) {
      fs.writeFileSync(n.vhostIncludePath, fs.readFileSync(r.VHOST.backup, "utf8"), { mode: 0o644 });
      vhostTouched = true;
      steps.push({ op: "VHOST", status: "RESTORED" });
    }
    if (vhostTouched) {
      const reload = await apacheReload(steps);
      if (!reload.ok) steps.push({ op: "APACHE_RELOAD", status: "FAILED", detail: reload.detail });
    }

    if (r.CONTAINER?.createdBy === runId && observed.container?.managed) {
      const down = await run(BIN.docker, ["compose", "-f", n.composeFile, "-p", n.composeProject, "down"]);
      steps.push({ op: "CONTAINER", status: down.code === 0 ? "REMOVED" : "FAILED" });
      if (down.code === 0) delete r.CONTAINER;
    }
    if (r.COMPOSE?.createdBy === runId && fs.existsSync(n.composeFile)) {
      fs.unlinkSync(n.composeFile); delete r.COMPOSE;
      steps.push({ op: "COMPOSE", status: "REMOVED" });
    } else if (r.COMPOSE?.updatedBy === runId && r.COMPOSE.backup && fs.existsSync(r.COMPOSE.backup)) {
      fs.writeFileSync(n.composeFile, fs.readFileSync(r.COMPOSE.backup, "utf8"), { mode: 0o640 });
      steps.push({ op: "COMPOSE", status: "RESTORED" });
    }
    if (r.API_KEY?.createdBy === runId && fs.existsSync(n.apiKeyFile)) {
      fs.unlinkSync(n.apiKeyFile); delete r.API_KEY;
      steps.push({ op: "API_KEY", status: "REMOVED" });
    }
    // El certificado NUNCA se borra (lo colocó el operador).
    steps.push({ op: "CERT", status: "UNTOUCHED" });

    manifest.resources = r;
    if (fs.existsSync(n.dir)) writeManifest(n, manifest);
    return { ok: !steps.some((s) => s.status === "FAILED"), op: "rollback", steps, observed: await observe(spec) };
  }

  return { inspect, apply, verify, rollback, observe };
}

function defaultHttpProbe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode ?? null });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: null }); });
    req.on("error", () => resolve({ ok: false, status: null }));
  });
}

// ── Autenticación: ver lib/executor-auth.mjs ──────────────────────

export { signExecutorRequest, createRequestVerifier };

export const ALLOWED_OPS = Object.freeze(["inspect", "apply", "verify", "rollback"]);

export function createExecutorHandler(executor, verifyRequest) {
  let busy = false;
  return async function handle(rawBody, signature) {
    const v = verifyRequest(rawBody, signature);
    if (!v.ok) return { status: 401, body: { ok: false, code: v.code } };
    const { op, params } = v.request;
    if (!ALLOWED_OPS.includes(op)) return { status: 400, body: { ok: false, code: "OP_NOT_ALLOWED" } };
    const mutating = op === "apply" || op === "rollback";
    if (mutating && busy) return { status: 409, body: { ok: false, code: "BUSY" } };
    if (mutating) busy = true;
    try {
      return { status: 200, body: await executor[op](params) };
    } catch (err) {
      const code = err instanceof ExecutorError ? err.code : "INTERNAL";
      const message = err instanceof ExecutorError ? err.message : "Error interno del ejecutor.";
      return { status: 422, body: { ok: false, code, message } };
    } finally {
      if (mutating) busy = false;
    }
  };
}

// ── Entrada CLI / servicio ──────────────────────────────────────────

async function main(argv) {
  const [cmd, ...rest] = argv;
  const arg = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  const executor = createExecutor();

  if (cmd === "serve") {
    const secret = process.env.ZOLVI_SIGNER_EXECUTOR_SECRET ?? "";
    // Anti-replay persistente: sobrevive a reinicios (StateDirectory de systemd).
    const nonceFile = process.env.ZOLVI_SIGNER_EXECUTOR_NONCE_FILE || "/var/lib/zolvi-signer-executor/nonces.json";
    const verifyRequest = createRequestVerifier(secret, { store: createFileNonceStore(nonceFile) });
    const handle = createExecutorHandler(executor, verifyRequest);
    const port = Number(arg("--port") ?? 9750);
    const server = http.createServer((req, res) => {
      // Health check local (solo 127.0.0.1; Apache publica únicamente /v1/execute). Sin datos del VPS.
      if (req.method === "GET" && req.url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true,"service":"zolvi-signer-executor"}');
        return;
      }
      if (req.method !== "POST" || req.url !== "/v1/execute") { res.writeHead(404).end(); return; }
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
      req.on("end", async () => {
        const out = await handle(body, req.headers["x-zolvi-signature"]);
        res.writeHead(out.status, { "content-type": "application/json" }).end(JSON.stringify(out.body));
      });
    });
    server.listen(port, "127.0.0.1", () => console.log(`[zolvi-signer-executor] escuchando en 127.0.0.1:${port}`));
    return;
  }

  if (cmd === "inspect" || cmd === "verify") {
    const specPath = arg("--spec");
    if (!specPath) throw new Error("--spec requerido");
    const spec = JSON.parse(nodeFs.readFileSync(specPath, "utf8"));
    const out = await executor[cmd]({ spec });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.error("Uso: zolvi-signer-executor.mjs serve [--port 9750] | inspect --spec f.json | verify --spec f.json");
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[zolvi-signer-executor] ${err instanceof Error ? err.message : "error"}`);
    process.exitCode = 1;
  });
}
