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
//     zolvi-apache-helper@<op>-<nonce>.service (fuera del sandbox del
//     ejecutor). Solo tres operaciones válidas; el nonce (16 hex) solo
//     correlaciona el resultado; no hay parámetros libres.
//
// Ningún backend reinicia Apache: solo graceful (SIGUSR1 vía apachectl).
// ─────────────────────────────────────────────────────────────────

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

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
// Sufijos de unidad systemd: el saneador de correos no debe ocultar qué unidad falló.
const SYSTEMD_UNIT_RE = /\.(service|socket|timer|target|mount|automount|slice|scope|path|device|swap)$/;
// Unidades del propio helper (formato exacto, sin datos): se protegen enteras para
// que el nonce no caiga en las reglas hex/numéricas.
const HELPER_UNIT_TOKEN_RE = /\bzolvi-apache-helper@(?:rebuild|configtest|graceful)-[0-9a-f]{16}\.service\b/g;
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
  const units = [];
  let s = String(text ?? "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)?/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(HELPER_UNIT_TOKEN_RE, (m) => { units.push(m); return `\u0001ZU${units.length - 1}\u0001`; })
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
    // Correos; NO nombres de unidades systemd (zolvi-apache-helper@rebuild-….service).
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (m) => (SYSTEMD_UNIT_RE.test(m) ? m : "[EMAIL REDACTADO]"))
    // Base64/base64url largo (claves, certificados sin cabecera). Una ruta
    // tiene varias "/" y no mezcla mayúsculas, minúsculas y dígitos como un blob.
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, (m) => (
      (m.match(/\//g) ?? []).length < 3 && /[A-Z]/.test(m) && /[a-z]/.test(m) && /\d/.test(m) ? "[B64 REDACTADO]" : m
    ))
    .replace(/\u0001ZU(\d+)\u0001/g, (_, i) => units[Number(i)] ?? "");
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
 * Correlación por NONCE en el nombre de instancia (no por InvocationID):
 * una unidad oneshot que termina bien queda inactiva y systemd la DESCARGA
 * (GC); un `systemctl show` posterior devuelve InvocationID vacío. Eso hizo
 * que el APPLY del 2026-11-10 rechazara un rebuild que SÍ se ejecutó.
 * Cada llamada usa ahora una instancia propia e irrepetible
 * `zolvi-apache-helper@<op>-<nonce>.service` y lee SOLO
 * `/run/zolvi-apache-helper/<op>-<nonce>.json`: un resultado viejo o de otra
 * llamada tiene otro nombre de archivo y no puede tomarse por el actual.
 * 16 hex (64 bits) bastan para unicidad y quedan bajo el umbral de redacción
 * hex (>= 24): el nombre de la unidad sigue legible en el diagnóstico.
 */
export const HELPER_NONCE_RE = /^[0-9a-f]{16}$/;
const HELPER_INSTANCE_RE = new RegExp(`^(${HELPER_OPS.join("|")})-([0-9a-f]{16})$`);

export const newHelperNonce = () => randomBytes(8).toString("hex");

/** Nombre de instancia → { op, nonce } o null. Comparación exacta, sin normalizar. */
export function parseHelperInstance(instance) {
  const m = typeof instance === "string" ? HELPER_INSTANCE_RE.exec(instance) : null;
  return m ? { op: m[1], nonce: m[2] } : null;
}

export const helperUnit = (op, nonce) => `${HELPER_UNIT_PREFIX}${op}-${nonce}.service`;
export const helperResultPath = (op, nonce) => `${HELPER_RESULT_DIR}/${op}-${nonce}.json`;

/**
 * Integridad del archivo de resultado: directorio y archivo reales (no
 * enlaces), propiedad de root, sin escritura de grupo/otros, tamaño
 * acotado y esquema estricto (op y nonce exactos). Devuelve
 * { result } | { invalid: motivo } | { missing: true }.
 */
export function readHelperResult(fs, op, nonce) {
  if (!HELPER_OPS.includes(op) || !HELPER_NONCE_RE.test(String(nonce ?? ""))) return { invalid: "op o nonce no válidos" };
  const path = helperResultPath(op, nonce);
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
    && j.nonce === nonce
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
 * Backend helper: `systemctl start zolvi-apache-helper@<op>-<nonce>.service`.
 * `systemctl start` de un oneshot bloquea hasta que termina y sale != 0 si
 * la unidad falla. El resultado se acepta SOLO si:
 *   1. la plantilla está instalada (LoadState=loaded de la instancia);
 *   2. existe /run/zolvi-apache-helper/<op>-<nonce>.json con ESE nonce
 *      (aleatorio por llamada → un resultado viejo no es reutilizable);
 *   3. el archivo pasa la verificación de integridad y esquema;
 *   4. su startedAt no es anterior a esta llamada;
 *   5. lo que dice el archivo coincide con el código de `systemctl start`.
 * Tras leerlo, el archivo se elimina (no se acumulan en /run).
 * Nada se consulta a systemd DESPUÉS del start: la instancia puede haber
 * sido descargada (GC) y eso no es un fallo.
 * Las llamadas se serializan dentro del proceso.
 */
export function createHelperApache(run, fs, { now = () => Date.now(), nonce = newHelperNonce } = {}) {
  let queue = Promise.resolve();
  const fail = (op, kind, extra = {}) => ({ ok: false, op, diagnostic: diagnose(op, { code: null, ...extra, kind, backend: "helper" }) });

  const execOnce = async (op) => {
    if (!HELPER_OPS.includes(op)) throw new Error(`Operación de helper no permitida: ${op}`);
    const n = nonce();
    if (!HELPER_NONCE_RE.test(String(n))) throw new Error("nonce de helper inválido");
    const unit = helperUnit(op, n);
    const shown = parseShow((await run(APACHE_BIN.systemctl, ["show", "-p", "LoadState", unit], { timeoutMs: 10_000 })).stdout);
    if (shown.LoadState !== "loaded") return fail(op, "HELPER_UNAVAILABLE", { stderr: `LoadState=${shown.LoadState ?? "desconocido"} (${unit})` });
    const t0 = now();
    const started = await run(APACHE_BIN.systemctl, ["start", unit], { timeoutMs: APACHE_TIMEOUTS[op] + 15_000 });
    if (started.spawnError) return fail(op, "SPAWN_FAILED", started);
    if (started.timedOut) return fail(op, "TIMEOUT", started);
    const read = readHelperResult(fs, op, n);
    try { fs.unlinkSync(helperResultPath(op, n)); } catch { /* no existía */ }
    if (read.missing) return fail(op, "HELPER_RESULT_MISSING", { ...started, stderr: `${started.stderr ?? ""}\nsin resultado de ${unit} (systemctl start exit ${started.code})` });
    if (read.invalid) return fail(op, "HELPER_RESULT_INVALID", { stderr: `${read.invalid} (${unit})` });
    const result = read.result;
    if (Date.parse(result.startedAt) < t0 - CLOCK_SKEW_MS) {
      return fail(op, "HELPER_RESULT_MISSING", { stderr: `el resultado es anterior a esta llamada (${unit})` });
    }
    const fileOk = result.exitCode === 0 && !result.timedOut;
    const unitOk = started.code === 0;
    if (fileOk !== unitOk) {
      return fail(op, "HELPER_RESULT_INCONSISTENT", { stderr: `archivo exit=${result.exitCode}; systemctl start exit=${started.code} (${unit})` });
    }
    if (fileOk) return { ok: true, op, backend: "helper", unit };
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
export function createApache({ run, fs, mode, now, nonce }) {
  return mode === "helper" ? createHelperApache(run, fs, { now, ...(nonce ? { nonce } : {}) }) : createDirectApache(run);
}
