// ─────────────────────────────────────────────────────────────────
// ops/dte-signer-executor/zolvi-apache-helper.mjs
//
// FISCAL-ONBOARDING — helper privilegiado de Apache/cPanel.
//
// Lo ejecuta SOLO systemd como zolvi-apache-helper@<op>.service
// (oneshot), fuera del sandbox del ejecutor, porque rebuildhttpdconf
// necesita el entorno completo de root que cPanel asume. No escucha en
// red, no lee peticiones y no acepta parámetros: el único dato de entrada
// es el nombre de instancia, validado contra una lista cerrada:
//
//   rebuild    → /usr/local/cpanel/scripts/rebuildhttpdconf
//   configtest → /usr/sbin/apachectl -t
//   graceful   → /usr/sbin/apachectl -k graceful
//
// Nunca reinicia Apache (ni restartsrv_httpd ni systemctl restart httpd).
// El resultado (saneado: sin PEM, claves ni hex largos) queda en
// /run/zolvi-apache-helper/<op>.json con el InvocationID de systemd.
// ─────────────────────────────────────────────────────────────────

import * as nodeFs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  HELPER_OPS, HELPER_COMMANDS, HELPER_RESULT_DIR, APACHE_TIMEOUTS, INVOCATION_ID_RE, runCommand, sanitizeOutput,
} from "./lib/apache-ops.mjs";

/** Códigos de salida propios (sin ejecutar ningún comando). */
export const HELPER_EXIT = Object.freeze({ OP_NOT_ALLOWED: 64, NOT_UNDER_SYSTEMD: 65, RESULT_DIR_UNSAFE: 66 });

export async function runHelperOp(op, { run = runCommand, fs = nodeFs, env = process.env, now = () => new Date() } = {}) {
  // Lista cerrada; comparación exacta (sin normalizar mayúsculas, espacios ni escapes).
  if (typeof op !== "string" || !HELPER_OPS.includes(op)) return { exitCode: HELPER_EXIT.OP_NOT_ALLOWED, error: "OP_NOT_ALLOWED" };
  // Solo bajo systemd: el InvocationID es lo que liga el resultado a esta ejecución.
  if (!INVOCATION_ID_RE.test(String(env.INVOCATION_ID ?? ""))) return { exitCode: HELPER_EXIT.NOT_UNDER_SYSTEMD, error: "NOT_UNDER_SYSTEMD" };
  // El directorio lo crea systemd (RuntimeDirectory, 0700 root). Si no es un
  // directorio real de root, no se escribe nada ni se ejecuta el comando.
  fs.mkdirSync(HELPER_RESULT_DIR, { recursive: true, mode: 0o700 });
  try {
    const d = fs.lstatSync(HELPER_RESULT_DIR);
    if (!d.isDirectory() || d.uid !== 0 || (d.mode & 0o022) !== 0) return { exitCode: HELPER_EXIT.RESULT_DIR_UNSAFE, error: "RESULT_DIR_UNSAFE" };
  } catch {
    return { exitCode: HELPER_EXIT.RESULT_DIR_UNSAFE, error: "RESULT_DIR_UNSAFE" };
  }
  const [cmd, args] = HELPER_COMMANDS[op];
  const startedAt = now().toISOString();
  const r = await run(cmd, args, { timeoutMs: APACHE_TIMEOUTS[op] });
  const result = {
    op,
    invocationId: String(env.INVOCATION_ID ?? ""),
    startedAt,
    finishedAt: now().toISOString(),
    exitCode: r.code,
    signal: r.signal ?? null,
    timedOut: !!r.timedOut,
    spawnError: r.spawnError ?? null,
    outputOverflow: !!r.outputOverflow,
    durationMs: r.durationMs ?? null,
    stderr: sanitizeOutput(r.stderr, { maxLines: 40, maxChars: 4000 }),
    stdout: sanitizeOutput(r.stdout, { maxLines: 20, maxChars: 2000 }),
  };
  const target = `${HELPER_RESULT_DIR}/${op}.json`;
  const tmp = `${target}.${result.invocationId}.tmp`;
  try { fs.unlinkSync(tmp); } catch { /* no existía */ }
  fs.writeFileSync(tmp, JSON.stringify(result), { mode: 0o600, flag: "wx" }); // wx: falla si alguien plantó el archivo
  fs.renameSync(tmp, target);
  return { exitCode: r.code === 0 && !r.timedOut ? 0 : (r.code || 1), result };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const op = process.argv[2];
  runHelperOp(op).then(({ exitCode, result, error }) => {
    // Al journal de la unidad: solo la versión saneada.
    if (error) console.error(`[zolvi-apache-helper] ${error}: ${JSON.stringify(String(op ?? "").slice(0, 32))}`);
    else console.log(`[zolvi-apache-helper] ${op} exit=${result.exitCode} signal=${result.signal ?? "-"} timeout=${result.timedOut} ${result.durationMs}ms\n${result.stderr}\n${result.stdout}`.trim());
    process.exitCode = exitCode;
  }).catch((err) => {
    console.error(`[zolvi-apache-helper] ${err instanceof Error ? err.message : "error"}`);
    process.exitCode = 70;
  });
}
