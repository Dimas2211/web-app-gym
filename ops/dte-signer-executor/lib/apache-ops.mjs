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
// Nombre de clave sensible, también dentro de identificadores compuestos
// (ZOLVI_SIGNER_EXECUTOR_SECRET, dbPassword, x-api-key, "apiKey"…).
const SECRET_KEY = String.raw`[A-Za-z0-9_.-]*(?:secret|token|passw(?:or)?d|pwd|pass\b|api[_-]?key|signer[_-]?key|private[_-]?key|authorization|cookie|credential|clave|contrase(?:n|ñ)a|session)[A-Za-z0-9_.-]*`;
const SECRET_PAIR_RE = new RegExp(String.raw`(["']?\b${SECRET_KEY}["']?)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;}&]+)`, "gi");
// Separado solo por espacio: únicamente palabras exactas (evita borrar "passed", "token" de errores de sintaxis…).
const SECRET_WORD_RE = /\b(password|passwd|secret|api[_-]?key|x-dte-signer-key|contraseña|clave)(\s+)("[^"\n]*"|'[^'\n]*'|\S+)/gi;
// Elementos XML del certificado MH (.crt es XML: clave privada en <encodied>, <clave>…).
const SECRET_XML_RE = /<((?:[A-Za-z0-9_-]+:)?(?:encodied|encoded|clave|password|privateKey|secret|token|apiKey|key))\b[^>]*>[\s\S]*?(<\/\1>|$)/gi;

/**
 * Elimina de una salida de comando todo lo que pueda ser secreto o dato
 * fiscal/personal antes de devolverla a Zolvi o guardarla en la bitácora:
 * PEM (completos o truncados), XML del certificado, Define de API Key,
 * pares clave=valor (también JSON, cabeceras y nombres compuestos),
 * credenciales en URL, Bearer/Basic, JWT, hex >= 24, base64/base64url
 * largos, NIT/DUI, correos y caracteres de control. Las rutas del sistema
 * —la evidencia más útil— se conservan. Devuelve solo la cola útil.
 * Diseño: lista de denegación + heurística de entropía; ver tests de
 * regresión en apache-ops.test.mjs antes de relajar cualquier regla.
 */
export function sanitizeOutput(text, { maxLines = 15, maxChars = 1200 } = {}) {
  let s = String(text ?? "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)?/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(-----END [A-Z0-9 ]+-----|$)/g, "[PEM REDACTADO]")
    .replace(/-----END [A-Z0-9 ]+-----/g, "[PEM REDACTADO]")
    .replace(SECRET_XML_RE, "<$1>[REDACTADO]</$1>")
    .replace(/(Define\s+\S+\s+)\S+/gi, "$1[REDACTADO]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(:[^\s/@]*)?@/gi, "$1[REDACTADO]@")
    .replace(/\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 [REDACTADO]")
    .replace(SECRET_PAIR_RE, "$1$2[REDACTADO]")
    .replace(SECRET_WORD_RE, "$1$2[REDACTADO]")
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[JWT REDACTADO]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[HEX REDACTADO]")
    .replace(/\b\d{4}-\d{6}-\d{3}-\d\b/g, "[NIT REDACTADO]")
    .replace(/\b\d{8}-\d\b/g, "[DUI REDACTADO]")
    .replace(/(?<![.\d])\d{9,17}\b/g, "[NUM REDACTADO]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL REDACTADO]")
    // Base64/base64url largo (claves, certificados sin cabecera). Una ruta
    // tiene varias "/" y no mezcla mayúsculas, minúsculas y dígitos como un blob.
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, (m) => (
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
  "HELPER_UNAVAILABLE", "HELPER_RESULT_MISSING", "HELPER_RESULT_INVALID", "HELPER_RESULT_INCONSISTENT",
  "CONCURRENT_CHANGE", "RESTORE_FAILED",
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

export const INVOCATION_ID_RE = /^[0-9a-f]{32}$/;
export const HELPER_RESULT_MAX_BYTES = 64 * 1024;
/** Tolerancia de reloj entre ejecutor y helper (mismo host). */
const CLOCK_SKEW_MS = 5_000;

function parseShow(stdout) {
  return Object.fromEntries(String(stdout ?? "").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
}

/**
 * Integridad del archivo de resultado: directorio y archivo reales (no
 * enlaces), propiedad de root, sin escritura de grupo/otros, tamaño
 * acotado y esquema estricto. Devuelve { result } o { invalid: motivo }.
 */
export function readHelperResult(fs, op) {
  const path = `${HELPER_RESULT_DIR}/${op}.json`;
  const owned = (st) => st.uid === 0 && (st.mode & 0o022) === 0;
  try {
    const d = fs.lstatSync(HELPER_RESULT_DIR);
    if (!d.isDirectory() || !owned(d)) return { invalid: "directorio de resultados no es de root o es escribible por otros" };
  } catch { return { missing: true }; }
  let st;
  try { st = fs.lstatSync(path); } catch { return { missing: true }; }
  if (!st.isFile()) return { invalid: "el resultado no es un archivo regular (¿enlace?)" };
  if (!owned(st)) return { invalid: "el resultado no es de root o es escribible por otros" };
  if (st.size > HELPER_RESULT_MAX_BYTES) return { invalid: "resultado demasiado grande" };
  let j;
  try { j = JSON.parse(fs.readFileSync(path, "utf8")); } catch { return { invalid: "resultado no es JSON válido" }; }
  const str = (v, max) => typeof v === "string" && v.length <= max;
  const ok = j && typeof j === "object"
    && j.op === op
    && str(j.invocationId, 32) && INVOCATION_ID_RE.test(j.invocationId)
    && (j.exitCode === null || (Number.isInteger(j.exitCode) && j.exitCode >= 0 && j.exitCode <= 255))
    && (j.signal === null || (str(j.signal, 16) && /^SIG[A-Z0-9]+$/.test(j.signal)))
    && typeof j.timedOut === "boolean"
    && (j.spawnError === null || (str(j.spawnError, 32) && /^E[A-Z0-9_]+$/.test(j.spawnError)))
    && (j.durationMs === null || (typeof j.durationMs === "number" && j.durationMs >= 0))
    && str(j.stderr, 8000) && str(j.stdout, 8000)
    && str(j.startedAt, 40) && !Number.isNaN(Date.parse(j.startedAt));
  return ok ? { result: j } : { invalid: "esquema del resultado inválido" };
}

/**
 * Backend helper: `systemctl start zolvi-apache-helper@<op>.service`.
 * El resultado de /run/zolvi-apache-helper/<op>.json se acepta SOLO si:
 *   1. la unidad está cargada (LoadState=loaded);
 *   2. el InvocationID posterior es nuevo (≠ al leído antes del start) y
 *      coincide con el del archivo — systemd genera uno aleatorio de 128
 *      bits por ejecución, así que un resultado viejo o de otra ejecución
 *      no puede reutilizarse;
 *   3. el archivo pasa la verificación de integridad y esquema;
 *   4. su startedAt no es anterior a esta llamada;
 *   5. lo que dice el archivo coincide con lo que systemd registró
 *      (ExecMainStatus/Result y código de `systemctl start`).
 * Las llamadas se serializan dentro del proceso: dos operaciones del propio
 * ejecutor nunca comparten unidad ni pisan el InvocationID de la otra.
 */
export function createHelperApache(run, fs, { now = () => Date.now() } = {}) {
  let queue = Promise.resolve();
  const show = async (unit) => parseShow((await run(APACHE_BIN.systemctl, ["show", "-p", "LoadState", "-p", "InvocationID", "-p", "ExecMainStatus", "-p", "Result", unit], { timeoutMs: 10_000 })).stdout);
  const fail = (op, kind, extra = {}) => ({ ok: false, op, diagnostic: diagnose(op, { code: null, ...extra, kind, backend: "helper" }) });

  const execOnce = async (op) => {
    if (!HELPER_OPS.includes(op)) throw new Error(`Operación de helper no permitida: ${op}`);
    const unit = `${HELPER_UNIT_PREFIX}${op}.service`;
    const before = await show(unit);
    if (before.LoadState !== "loaded") return fail(op, "HELPER_UNAVAILABLE", { stderr: `LoadState=${before.LoadState ?? "desconocido"}` });
    const t0 = now();
    const started = await run(APACHE_BIN.systemctl, ["start", unit], { timeoutMs: APACHE_TIMEOUTS[op] + 15_000 });
    if (started.spawnError) return fail(op, "SPAWN_FAILED", started);
    if (started.timedOut) return fail(op, "TIMEOUT", started);
    const after = await show(unit);
    const inv = after.InvocationID ?? "";
    if (!INVOCATION_ID_RE.test(inv) || inv === before.InvocationID) {
      return fail(op, "HELPER_RESULT_MISSING", { ...started, stderr: `${started.stderr ?? ""}\nsin invocación nueva de ${unit}` });
    }
    const read = readHelperResult(fs, op);
    if (read.missing) return fail(op, "HELPER_RESULT_MISSING", started);
    if (read.invalid) return fail(op, "HELPER_RESULT_INVALID", { stderr: read.invalid });
    const result = read.result;
    if (result.invocationId !== inv || Date.parse(result.startedAt) < t0 - CLOCK_SKEW_MS) {
      return fail(op, "HELPER_RESULT_MISSING", { stderr: "el resultado pertenece a otra invocación" });
    }
    const fileOk = result.exitCode === 0 && !result.timedOut;
    const unitOk = after.Result === "success" && after.ExecMainStatus === "0" && started.code === 0;
    if (fileOk !== unitOk) {
      return fail(op, "HELPER_RESULT_INCONSISTENT", { stderr: `archivo exit=${result.exitCode}; systemd Result=${after.Result} ExecMainStatus=${after.ExecMainStatus} start=${started.code}` });
    }
    if (fileOk) return { ok: true, op, backend: "helper" };
    return { ok: false, op, diagnostic: diagnose(op, { code: result.exitCode, signal: result.signal, timedOut: result.timedOut, spawnError: result.spawnError, outputOverflow: result.outputOverflow, durationMs: result.durationMs, stderr: result.stderr, stdout: result.stdout, backend: "helper" }) };
  };
  const exec = (op) => {
    const p = queue.then(() => execOnce(op));
    queue = p.catch(() => {});
    return p;
  };
  return { backend: "helper", rebuild: () => exec("rebuild"), configtest: () => exec("configtest"), graceful: () => exec("graceful") };
}

/** Selecciona backend por ZOLVI_SIGNER_APACHE_MODE (helper | direct; por defecto direct). */
export function createApache({ run, fs, mode, now }) {
  return mode === "helper" ? createHelperApache(run, fs, { now }) : createDirectApache(run);
}
