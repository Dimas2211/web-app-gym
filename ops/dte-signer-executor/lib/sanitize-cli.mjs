// ─────────────────────────────────────────────────────────────────
// ops/dte-signer-executor/lib/sanitize-cli.mjs
//
// Filtro stdin → stdout con las MISMAS reglas que sanitizeOutput (sin
// recortar líneas). Lo usa diagnostics/apache-rebuild-readonly-diagnostic.sh
// para que nada de lo que se entrega al operador contenga secretos.
// ─────────────────────────────────────────────────────────────────

import { sanitizeOutput } from "./apache-ops.mjs";

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  const out = sanitizeOutput(Buffer.concat(chunks).toString("utf8"), { maxLines: Number.MAX_SAFE_INTEGER, maxChars: Number.MAX_SAFE_INTEGER });
  process.stdout.write(`${out}\n`);
});
