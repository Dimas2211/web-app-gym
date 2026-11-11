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
  HELPER_OPS, HELPER_COMMANDS, HELPER_RESULT_DIR, APACHE_TIMEOUTS, runCommand, sanitizeOutput,
} from "./lib/apache-ops.mjs";

export async function runHelperOp(op, { run = runCommand, fs = nodeFs, env = process.env, now = () => new Date() } = {}) {
  if (!HELPER_OPS.includes(op)) return { exitCode: 64, error: "OP_NOT_ALLOWED" };
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
  fs.mkdirSync(HELPER_RESULT_DIR, { recursive: true, mode: 0o700 });
  const target = `${HELPER_RESULT_DIR}/${op}.json`;
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(result), { mode: 0o600 });
  fs.renameSync(`${target}.tmp`, target);
  return { exitCode: r.code === 0 && !r.timedOut ? 0 : (r.code || 1), result };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const op = process.argv[2];
  runHelperOp(op).then(({ exitCode, result, error }) => {
    // Al journal de la unidad: solo la versión saneada.
    if (error) console.error(`[zolvi-apache-helper] ${error}: ${String(op).slice(0, 32)}`);
    else console.log(`[zolvi-apache-helper] ${op} exit=${result.exitCode} signal=${result.signal ?? "-"} timeout=${result.timedOut} ${result.durationMs}ms\n${result.stderr}\n${result.stdout}`.trim());
    process.exitCode = exitCode;
  }).catch((err) => {
    console.error(`[zolvi-apache-helper] ${err instanceof Error ? err.message : "error"}`);
    process.exitCode = 70;
  });
}
