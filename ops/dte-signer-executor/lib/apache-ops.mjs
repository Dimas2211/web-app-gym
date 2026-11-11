// ─────────────────────────────────────────────────────────────────
// ops/dte-signer-executor/lib/apache-ops.mjs
//
// FISCAL-ONBOARDING — operaciones de Apache/cPanel del ejecutor y su
// diagnóstico seguro. Sin dependencias (Node >= 18).
//
// Dos backends con la MISMA interfaz { rebuild, configtest, graceful }:
//
//   - "direct": ejecuta los binarios desde el proceso del ejecutor. Ese
//     proceso corre con ProtectSystem=strict/ProtectHome/PrivateTmp y
//     ReadWritePaths acotados; los scripts de cPanel (rebuildhttpdconf)
//     escriben en rutas no documentadas fuera de esa lista, por lo que
//     pueden fallar aquí aunque funcionen en una sesión root interactiva.
//   - "helper": pide a systemd que ejecute la unidad oneshot fija
//     zolvi-apache-helper@<op>.service (fuera del sandbox del ejecutor).
//     Solo existen tres instancias válidas; no hay parámetros libres.
//
// Ningún backend reinicia Apache: solo graceful (SIGUSR1 vía apachectl).
// ─────────────────────────────────────────────────────────────────

import { execFile } from "node:child_process";

export const APACHE_BIN = Object.freeze({
  apachectl: "/usr/sbin/apachectl",
  rebuild:   "/usr/local/cpanel/scripts/rebuildhttpdconf",
  systemctl: "/usr/bin/systemctl",
});

/** Configuración global generada por cPanel (EasyApache 4). Solo se lee y, en recuperación, se restaura byte a byte. */
export const HTTPD_CONF = "/etc/apache2/conf/httpd.conf";

/** Operaciones del helper privilegiado: lista cerrada. */
export const HELPER_OPS = Object.freeze(["rebuild", "configtest", "graceful"]);
export const HELPER_UNIT_PREFIX = "zolvi-apache-helper@";
export const HELPER_RESULT_DIR = "/run/zolvi-apache-helper";

/** Timeouts por operación (ms). El transporte de Zolvi corta a los 180 s. */
export const APACHE_TIMEOUTS = Object.freeze({ rebuild: 90_000, configtest: 30_000, graceful: 30_000 });

/** Comando fijo de cada operación (sin parámetros externos). */
export const HELPER_COMMANDS = Object.freeze({
  rebuild:    [APACHE_BIN.rebuild, []],
  configtest: [APACHE_BIN.apachectl, ["-t"]],
  graceful:   [APACHE_BIN.apachectl, ["-k", "graceful"]],
});

// ── Ejecución de procesos ─────────────────────────────────────────

/** Variables que nunca se heredan a procesos hijos (secreto HMAC, tokens…). */
const SECRET_ENV_RE = /SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|^ZOLVI_SIGNER_EXECUTOR_/i;

export function childEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k, v]) => v !== undefined && !SECRET_ENV_RE.test(k)));
}

/**
 * execFile sin shell que conserva TODA la evidencia del fallo:
 * código de salida, señal, timeout, error de arranque y duración.
 */
export function runCommand(cmd, args, { timeoutMs = 120_000, env } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: false, env: env ?? childEnv() }, (err, stdout, stderr) => {
      const durationMs = Date.now() - started;
      const base = { stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), durationMs };
      if (!err) return resolve({ code: 0, signal: null, timedOut: false, spawnError: null, ...base });
      const spawnError = typeof err.code === "string" && err.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? err.code : null;
      const overflow = err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
      resolve({
        code: typeof err.code === "number" ? err.code : 1,
        signal: err.signal ?? null,
        timedOut: !overflow && !spawnError && err.killed === true,
        spawnError,
        outputOverflow: overflow,
        ...base,
      });
    });
  });
}

// ── Saneamiento y clasificación ───────────────────────────────────

/**
 * Elimina de una salida de comando todo lo que pueda ser secreto antes de
 * devolverla a Zolvi o guardarla en la bitácora: bloques PEM, valores
 * Define de API Key, cadenas hex/base64 largas, pares clave=valor sensibles.
 * Devuelve solo la cola útil (las últimas líneas suelen contener el error).
 */
export function sanitizeOutput(text, { maxLines = 15, maxChars = 1200 } = {}) {
  let s = String(text ?? "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(-----END [A-Z0-9 ]+-----|$)/g, "[PEM REDACTADO]")
    .replace(/(Define\s+\S+\s+)\S+/gi, "$1[REDACTADO]")
    .replace(/\b(authorization|bearer|password|passwd|pass|secret|token|api[_-]?key|x-dte-signer-key)(\s*[:=]\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi, "$1$2[REDACTADO]")
    .replace(/\b[a-f0-9]{32,}\b/gi, "[HEX REDACTADO]")
    // Base64 largo (claves, certificados sin cabecera). Las rutas del sistema
    // —la evidencia más útil— se conservan: tienen varias "/" y no mezclan
    // mayúsculas, minúsculas y dígitos como un blob aleatorio.
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (m) => (
      (m.match(/\//g) ?? []).length < 3 && /[A-Z]/.test(m) && /[a-z]/.test(m) && /\d/.test(m) ? "[B64 REDACTADO]" : m
    ));
  const lines = s.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  s = lines.slice(-maxLines).join("\n");
  return s.length > maxChars ? `…${s.slice(-maxChars)}` : s;
}

const PERMISSION_RE = /read-only file system|\bEROFS\b|permission denied|\bEACCES\b|\bEPERM\b|operation not permitted/i;
const CONFIG_RE = /syntax error|AH00526|invalid command|configuration test failed|failed to (validate|test)|not a valid|could not open configuration file|httpd: syntax|config(uration)? (check|test) (failed|error)/i;

/** Tipos de fallo distinguibles para la operación de Apache. */
export const FAILURE_KINDS = Object.freeze([
  "SPAWN_FAILED", "TIMEOUT", "OUTPUT_OVERFLOW", "PERMISSION_DENIED", "CONFIG_ERROR", "SIGNALED", "NONZERO_EXIT",
  "HELPER_UNAVAILABLE", "HELPER_RESULT_MISSING",
]);

/**
 * Convierte el resultado crudo de un comando en un diagnóstico seguro.
 * El orden importa: un timeout o un error de arranque explican el fallo
 * aunque la salida parcial contenga otras palabras.
 */
export function diagnose(op, r) {
  const output = `${r.stderr ?? ""}\n${r.stdout ?? ""}`;
  let kind;
  if (r.kind && FAILURE_KINDS.includes(r.kind)) kind = r.kind;
  else if (r.spawnError) kind = "SPAWN_FAILED";
  else if (r.timedOut) kind = "TIMEOUT";
  else if (r.outputOverflow) kind = "OUTPUT_OVERFLOW";
  else if (PERMISSION_RE.test(output)) kind = "PERMISSION_DENIED";
  else if (CONFIG_RE.test(output)) kind = "CONFIG_ERROR";
  else if (r.signal) kind = "SIGNALED";
  else kind = "NONZERO_EXIT";
  return {
    op,
    kind,
    exitCode: typeof r.code === "number" ? r.code : null,
    signal: r.signal ?? null,
    spawnError: r.spawnError ?? null,
    durationMs: typeof r.durationMs === "number" ? r.durationMs : null,
    backend: r.backend ?? null,
    stderr: sanitizeOutput(r.stderr),
    stdout: sanitizeOutput(r.stdout, { maxLines: 8, maxChars: 600 }),
  };
}

/** Resumen de una línea, seguro para error_message y la UI. */
export function describeDiagnostic(d) {
  const parts = [`${d.op} ${d.kind}`];
  if (d.exitCode !== null && d.exitCode !== 0) parts.push(`exit ${d.exitCode}`);
  if (d.signal) parts.push(`señal ${d.signal}`);
  if (d.spawnError) parts.push(d.spawnError);
  if (d.durationMs !== null) parts.push(`${Math.round(d.durationMs / 100) / 10}s`);
  const last = (d.stderr || d.stdout || "").split("\n").filter(Boolean).at(-1);
  return `${parts.join(", ")}${last ? ` — ${last.slice(0, 240)}` : ""}`;
}

// ── Backends ──────────────────────────────────────────────────────

/** Backend directo: los binarios corren dentro del sandbox del ejecutor. */
export function createDirectApache(run) {
  const exec = async (op) => {
    const [cmd, args] = HELPER_COMMANDS[op];
    const r = await run(cmd, args, { timeoutMs: APACHE_TIMEOUTS[op] });
    return r.code === 0 && !r.timedOut ? { ok: true, op, backend: "direct" } : { ok: false, op, diagnostic: diagnose(op, { ...r, backend: "direct" }) };
  };
  return { backend: "direct", rebuild: () => exec("rebuild"), configtest: () => exec("configtest"), graceful: () => exec("graceful") };
}

/**
 * Backend helper: `systemctl start zolvi-apache-helper@<op>.service`.
 * La unidad oneshot escribe /run/zolvi-apache-helper/<op>.json con el
 * resultado ya saneado; se acepta solo si su invocationId coincide con la
 * invocación que systemd acaba de ejecutar (evita leer un resultado viejo).
 */
export function createHelperApache(run, fs) {
  const exec = async (op) => {
    if (!HELPER_OPS.includes(op)) throw new Error(`Operación de helper no permitida: ${op}`);
    const unit = `${HELPER_UNIT_PREFIX}${op}.service`;
    const started = await run(APACHE_BIN.systemctl, ["start", unit], { timeoutMs: APACHE_TIMEOUTS[op] + 15_000 });
    const shown = await run(APACHE_BIN.systemctl, ["show", "-p", "InvocationID", "--value", unit], { timeoutMs: 10_000 });
    const invocationId = String(shown.stdout ?? "").trim();
    let result = null;
    try { result = JSON.parse(fs.readFileSync(`${HELPER_RESULT_DIR}/${op}.json`, "utf8")); } catch { result = null; }
    const fresh = result && invocationId && result.invocationId === invocationId && result.op === op;

    if (!fresh) {
      // Sin resultado propio: la unidad no existe, no arrancó o expiró el job.
      const kind = started.spawnError ? "SPAWN_FAILED"
        : started.code !== 0 && /not (be )?found|not loaded|No such file/i.test(`${started.stderr}`) ? "HELPER_UNAVAILABLE"
        : started.timedOut ? "TIMEOUT" : "HELPER_RESULT_MISSING";
      return { ok: false, op, diagnostic: diagnose(op, { ...started, kind, backend: "helper" }) };
    }
    const r = { code: result.exitCode, signal: result.signal, timedOut: result.timedOut, spawnError: result.spawnError, outputOverflow: result.outputOverflow, durationMs: result.durationMs, stderr: result.stderr, stdout: result.stdout, backend: "helper" };
    return result.exitCode === 0 && !result.timedOut ? { ok: true, op, backend: "helper" } : { ok: false, op, diagnostic: diagnose(op, r) };
  };
  return { backend: "helper", rebuild: () => exec("rebuild"), configtest: () => exec("configtest"), graceful: () => exec("graceful") };
}

/** Selecciona backend por ZOLVI_SIGNER_APACHE_MODE (helper | direct; por defecto direct). */
export function createApache({ run, fs, mode }) {
  return mode === "helper" ? createHelperApache(run, fs) : createDirectApache(run);
}
