/**
 * dte-internal-certification.ts
 *
 * DTE-INTERNAL-CERTIFICATION — runner de la certificación interna
 * precomercial DTE (FE01, CCFE03, NC05, FSE14, FEX11 servicios,
 * invalidación). SIN Ministerio de Hacienda, SIN base de datos real,
 * SIN secretos reales:
 *
 *   - Ejecuta src/modules/commerce/dte/certification (vitest) con un
 *     entorno hijo depurado: sin DATABASE_URL/DIRECT_URL, sin DTE_*,
 *     sin EXTERNAL_DTE_*, sin PLATFORM_ENCRYPTION_KEY. No carga .env.
 *   - La suite usa una base runtime sintética en memoria (DMMF real),
 *     firmador/MH falsos a nivel fetch y trampas sobre Prisma global,
 *     Control Plane y MariaDB (ver docs/certification/).
 *   - Regresión: tests DTE existentes + TypeScript (+ build con
 *     --with-build).
 *   - Reporte legible + artefacto JSON saneado en
 *     .certification/dte-internal-certification/ (gitignored).
 *
 * USO:
 *   npm run dte:certify                 # certificación + regresión DTE + tsc
 *   npm run dte:certify -- --with-build # + npm run build
 *   npm run dte:certify -- --quick      # solo la suite de certificación
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CERT_ROOT_SUITE, CERT_SECTIONS } from "../../src/modules/commerce/dte/certification/harness/certification-catalog";

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".certification", "dte-internal-certification");
const CERT_DIR = "src/modules/commerce/dte/certification";
const REGRESSION_DIRS = ["src/modules/commerce/dte", "src/modules/commerce/sales/export", "src/app/api/dte"];
const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick");
const WITH_BUILD = args.has("--with-build");

const STRIPPED_ENV = /^(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|PLATFORM_ENCRYPTION_KEY|DTE_.*|EXTERNAL_DTE_.*|JWT_SECRET|AUTH_SECRET|NEXTAUTH_SECRET|VERCEL_.*|PLATFORM_TENANT_BINDING_ADMIN_KEY)$/;

type Status = "PASS" | "FAIL" | "MISSING" | "SKIPPED";
interface CaseResult { section: string; name: string; status: Status; durationMs: number | null; error: string | null }
interface StepResult { name: string; status: Status; detail: string; durationMs: number }

// ── Saneamiento: nada sensible sale a consola ni al artefacto ─────

function sanitize(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}/g, "[JWS_REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[REDACTED]")
    .replace(/mysql:\/\/[^\s"']+/gi, "mysql://[REDACTED]")
    .replace(/\b(password|passwordPri|pwd|apiPassword|token|apiKey|signerPrivateKeyPassword|encrypted_payload)(["':=\s]+)[^"',\s}]+/gi, "$1$2[REDACTED]")
    .replace(/cert-(pk|mh)-[A-Za-z0-9_-]+/g, "cert-$1-[REDACTED]")
    .slice(0, 800);
}

// ── Utilidades ────────────────────────────────────────────────────

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) if (!STRIPPED_ENV.test(k)) env[k] = v;
  return { ...env, NODE_ENV: "test", FORCE_COLOR: "0", ...extra } as NodeJS.ProcessEnv;
}

function run(command: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  const started = Date.now();
  const r = spawnSync(command, { cwd: ROOT, env, shell: true, encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status ?? (r.error ? -1 : 0), stdout: r.stdout ?? "", stderr: r.stderr ?? "", durationMs: Date.now() - started };
}

function git(cmd: string): string {
  const r = spawnSync(`git ${cmd}`, { cwd: ROOT, shell: true, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

interface VitestJson {
  numTotalTests: number; numPassedTests: number; numFailedTests: number;
  testResults: Array<{ name: string; message?: string; assertionResults: Array<{ ancestorTitles: string[]; title: string; status: string; duration?: number; failureMessages: string[] }> }>;
}

function readVitestJson(file: string): VitestJson | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as VitestJson;
  } catch {
    return null;
  }
}

// ── Preflight fail-closed ────────────────────────────────────────

function preflight(): string[] {
  const problems: string[] = [];
  if (process.env.NODE_ENV === "production") problems.push("NODE_ENV=production — la certificación interna nunca corre en producción.");
  if (process.env.VERCEL) problems.push("Entorno Vercel detectado — ejecutar solo en una estación local.");
  if (!fs.existsSync(path.join(ROOT, CERT_DIR, "dte-internal-certification.test.ts"))) problems.push("Suite de certificación no encontrada.");
  return problems;
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const started = new Date();
  const problems = preflight();
  if (problems.length > 0) {
    for (const p of problems) console.error(`ABORT: ${p}`);
    process.exit(2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dte-cert-"));
  const certJson = path.join(tmp, "cert.json");
  const evidenceFile = path.join(tmp, "evidence.json");
  const steps: StepResult[] = [];

  // 1. Suite de certificación
  const cert = run(
    `npx vitest run ${CERT_DIR} --reporter=json --outputFile="${certJson}"`,
    childEnv({ DTE_CERT_EVIDENCE_FILE: evidenceFile }),
    10 * 60_000,
  );
  const certReport = readVitestJson(certJson);
  const executed = new Map<string, { status: string; duration?: number; failureMessages: string[] }>();
  for (const file of certReport?.testResults ?? []) {
    for (const a of file.assertionResults) {
      if (a.ancestorTitles[0] !== CERT_ROOT_SUITE) continue;
      executed.set(`${a.ancestorTitles[1]}::${a.title}`, a);
    }
  }
  const cases: CaseResult[] = [];
  for (const [section, names] of Object.entries(CERT_SECTIONS)) {
    for (const name of names) {
      const a = executed.get(`${section}::${name}`);
      cases.push({
        section, name,
        status: !a ? "MISSING" : a.status === "passed" ? "PASS" : a.status === "skipped" || a.status === "pending" ? "SKIPPED" : "FAIL",
        durationMs: a?.duration ?? null,
        error: a && a.failureMessages.length > 0 ? sanitize(a.failureMessages.join("\n")) : null,
      });
    }
  }
  const harnessFailures = (certReport?.testResults ?? []).flatMap((f) =>
    f.assertionResults.filter((a) => a.ancestorTitles[0] !== CERT_ROOT_SUITE && a.status !== "passed")
      .map((a) => `${[...a.ancestorTitles, a.title].join(" > ")}: ${sanitize(a.failureMessages.join(" "))}`));
  const suiteLoadError = (certReport?.testResults ?? []).map((f) => f.message).filter(Boolean).map((m) => sanitize(m!));
  steps.push({
    name: "Certification suite",
    status: certReport && cert.code === 0 && harnessFailures.length === 0 ? "PASS" : "FAIL",
    detail: certReport ? `${certReport.numPassedTests}/${certReport.numTotalTests} tests` : `vitest no produjo reporte: ${sanitize(cert.stderr || cert.stdout)}`,
    durationMs: cert.durationMs,
  });

  // 2. Regresión
  if (!QUICK) {
    const regJson = path.join(tmp, "regression.json");
    const reg = run(`npx vitest run ${REGRESSION_DIRS.join(" ")} --reporter=json --outputFile="${regJson}"`, childEnv(), 15 * 60_000);
    const regReport = readVitestJson(regJson);
    const failed = (regReport?.testResults ?? []).flatMap((f) =>
      f.assertionResults.filter((a) => a.status === "failed").map((a) => `${path.relative(ROOT, f.name)} > ${a.title}`));
    steps.push({
      name: "Existing DTE unit tests",
      status: regReport && reg.code === 0 ? "PASS" : "FAIL",
      detail: regReport
        ? `${regReport.numPassedTests}/${regReport.numTotalTests} tests (${regReport.testResults.length} files)${failed.length ? ` — failed: ${failed.slice(0, 5).join("; ")}` : ""}`
        : sanitize(reg.stderr || reg.stdout),
      durationMs: reg.durationMs,
    });

    const tsc = run("npx tsc --noEmit", childEnv(), 15 * 60_000);
    const tscErrors = (tsc.stdout.match(/error TS\d+/g) ?? []).length;
    steps.push({
      name: "TypeScript",
      status: tsc.code === 0 ? "PASS" : "FAIL",
      detail: tsc.code === 0 ? "tsc --noEmit: 0 errores" : `${tscErrors} errores — ${sanitize(tsc.stdout.split("\n").slice(0, 5).join(" | "))}`,
      durationMs: tsc.durationMs,
    });

    if (WITH_BUILD) {
      const build = run("npm run build", childEnv({ NODE_ENV: "production" }), 30 * 60_000);
      steps.push({
        name: "Build",
        status: build.code === 0 ? "PASS" : "FAIL",
        detail: build.code === 0 ? "npm run build OK" : sanitize((build.stderr || build.stdout).split("\n").slice(-8).join(" | ")),
        durationMs: build.durationMs,
      });
    } else {
      steps.push({ name: "Build", status: "SKIPPED", detail: "usar --with-build", durationMs: 0 });
    }
  }

  // 3. Evidencia de seguridad (escrita por la suite)
  let evidence: Record<string, unknown> | null = null;
  try {
    evidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));
  } catch {
    evidence = null;
  }
  const traps = (evidence?.traps ?? {}) as Record<string, unknown[]>;
  const network = (evidence?.network ?? {}) as { calls?: Array<{ endpoint: string; kind: string }>; violations?: string[] };
  const realMhHosts = (network.calls ?? []).filter((c) => !/apitest\.dtes\.mh\.gob\.sv|\.dte-cert\.invalid/.test(c.endpoint));
  const safetyOk = !!evidence &&
    (network.violations ?? []).length === 0 && realMhHosts.length === 0 &&
    ["globalPrismaViolations", "controlPlaneViolations", "mariaDbViolations", "runtimeRouterViolations"].every((k) => (traps[k] ?? []).length === 0);

  const failedCases = cases.filter((c) => c.status !== "PASS");
  const failedSteps = steps.filter((s) => s.status === "FAIL");
  const ok = failedCases.length === 0 && failedSteps.length === 0 && safetyOk && harnessFailures.length === 0;
  const finished = new Date();

  // ── Consola ──────────────────────────────────────────────────
  const line = (label: string, status: string) => console.log(`${label} ${".".repeat(Math.max(2, 36 - label.length))} ${status}`);
  console.log("\nDTE INTERNAL CERTIFICATION\n");
  line("Environment", "INTERNAL / NO_MH");
  line("Git commit", `${git("rev-parse --short HEAD")}${git("status --porcelain") ? " (+cambios locales)" : ""}`);
  for (const [section, names] of Object.entries(CERT_SECTIONS)) {
    console.log(`\n${section}`);
    for (const name of names) {
      const c = cases.find((x) => x.section === section && x.name === name)!;
      line(name, c.status);
      if (c.error) console.log(`    ↳ ${c.error.split("\n")[0]}`);
    }
  }
  console.log("\nREGRESSION");
  for (const s of steps) {
    line(s.name, s.status);
    if (s.status !== "PASS") console.log(`    ↳ ${s.detail}`);
  }
  for (const h of harnessFailures) console.log(`HARNESS FAIL: ${h}`);
  for (const e of suiteLoadError) console.log(`SUITE ERROR: ${e}`);
  console.log("");
  line("REAL MH TRANSMISSION", safetyOk ? "NOT EXECUTED" : "VIOLATION — REVIEW");
  line("PRODUCTION DATA MUTATED", "NO");
  line("RESULT", ok ? "PASS" : "FAIL");

  // ── Artefacto JSON (saneado) ────────────────────────────────
  const stamp = started.toISOString().replace(/[:.]/g, "-");
  const artifact = {
    certification: "DTE_INTERNAL_CERTIFICATION",
    timestamp: started.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    git: { commit: git("rev-parse HEAD"), branch: git("rev-parse --abbrev-ref HEAD"), dirty: git("status --porcelain").length > 0 },
    node: process.version,
    environment: "INTERNAL / NO_MH",
    REAL_MH_TRANSMISSION: false,
    PRODUCTION_MUTATION: false,
    DATABASE_TOUCHED: false,
    mode: QUICK ? "quick" : WITH_BUILD ? "full+build" : "full",
    result: ok ? "PASS" : "FAIL",
    totals: {
      cases: cases.length,
      passed: cases.filter((c) => c.status === "PASS").length,
      failed: cases.filter((c) => c.status === "FAIL").length,
      missing: cases.filter((c) => c.status === "MISSING").length,
    },
    suites: Object.fromEntries(Object.keys(CERT_SECTIONS).map((s) => [s, cases.filter((c) => c.section === s)])),
    regression: steps,
    harnessFailures,
    safety: {
      ok: safetyOk,
      networkViolations: network.violations ?? [],
      networkCallsByKind: (network.calls ?? []).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {}),
      traps,
    },
    evidence: evidence ? { databases: evidence.databases, documents: evidence.documents, correlatives: evidence.correlatives, invalidationEvents: evidence.invalidationEvents, documentRelations: evidence.documentRelations } : null,
  };
  const serialized = JSON.stringify(artifact, null, 2);
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), serialized, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "latest.json"), serialized, "utf8");
  console.log(`\nArtefacto: ${path.relative(ROOT, path.join(OUT_DIR, `${stamp}.json`))}`);

  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

main();
