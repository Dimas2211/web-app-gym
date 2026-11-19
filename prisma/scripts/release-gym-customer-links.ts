/** One-off authorized release. Runs Prisma migrations where the app's existing
 * credentials already live, without exporting them. Never part of normal builds.
 */
import { PrismaClient } from "@prisma/client";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
} from "../../src/modules/platform/lib/database-profile-url";

const MIGRATION = "20261119000000_gym_customer_links";
const CP_REF = "nygdqnlzoalmhrqwijjn";
const RUNTIME_REF = "vkoywmzlgygypaddxjtn";
const SHARED_ID = "2e9d66d5-0ab0-4346-aa1d-92bb30864793";

function verifyUrl(value: string, ref: string) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !(
      url.hostname === `db.${ref}.supabase.co` ||
      decodeURIComponent(url.username) === `postgres.${ref}`
    )
  ) {
    throw new Error("Unexpected database target; release aborted.");
  }
  // Supabase session pooler supports Prisma migration advisory locks.
  if (url.port === "6543") url.port = "5432";
  url.searchParams.delete("pgbouncer");
  return url.toString();
}

async function inspect(db: PrismaClient) {
  const migrations = await db.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >`
    SELECT migration_name,finished_at,rolled_back_at FROM public._prisma_migrations`;
  if (migrations.some((m) => !m.finished_at && !m.rolled_back_at))
    throw new Error("Unresolved database migration; release aborted.");
  const applied = new Set(
    migrations.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name)
  );
  const pending = readdirSync("prisma/migrations").filter(
    (name) => /^\d{14}_/.test(name) && !applied.has(name)
  );
  if (pending.some((name) => name !== MIGRATION))
    throw new Error(`Unrelated pending migrations: ${pending.join(", ")}`);
  const counts = await db.$queryRaw<Record<string, bigint>[]>`
    SELECT (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM customers) AS customers,
      (SELECT count(*) FROM clients) AS clients,
      (SELECT count(*) FROM sales) AS sales,
      (SELECT count(*) FROM purchases) AS purchases`;
  return {
    pending,
    counts: JSON.stringify(counts, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
  };
}

async function release(label: string, url: string, before: Awaited<ReturnType<typeof inspect>>) {
  const child = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      encoding: "utf8",
      timeout: 120_000,
    }
  );
  if (child.status !== 0)
    throw new Error(
      `${label}: migrate deploy failed: ${sanitizeDatabaseError(child.stderr || child.stdout || "no output")}`
    );
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const after = await inspect(db);
    if (after.pending.length || after.counts !== before.counts)
      throw new Error(`${label}: post-migration verification failed.`);
    const checks = await db.$queryRaw<{ rls: boolean; foreign_keys: bigint; links: bigint }[]>`
      SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.gym_customer_links'::regclass) AS rls,
        (SELECT count(*) FROM pg_constraint WHERE conrelid='public.gym_customer_links'::regclass AND contype='f') AS foreign_keys,
        (SELECT count(*) FROM public.gym_customer_links) AS links`;
    if (!checks[0]?.rls || Number(checks[0].foreign_keys) !== 2)
      throw new Error(`${label}: bridge constraints/RLS verification failed.`);
    console.log(
      `[gym-customer-release] ${label}: Prisma migration verified; existing row counts unchanged; RLS enabled; tenant foreign keys verified.`
    );
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  if (
    !process.argv.includes("--apply") ||
    process.env.ZOLVI_GYM_LINK_RELEASE_APPROVAL !== MIGRATION
  ) {
    throw new Error(
      "This one-off release requires --apply and the exact release approval environment variable."
    );
  }
  const cpUrl = verifyUrl(process.env.DIRECT_URL || process.env.DATABASE_URL || "", CP_REF);
  const cp = new PrismaClient({ datasources: { db: { url: cpUrl } } });
  let runtime: PrismaClient | undefined;
  try {
    const shared = await cp.platformSharedRuntimeTarget.findUnique({ where: { id: SHARED_ID } });
    if (!shared?.is_active) throw new Error("The configured REC runtime is unavailable.");
    const runtimeUrl = verifyUrl(buildDatabaseUrlFromProfile(shared), RUNTIME_REF);
    runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
    const rec = await runtime.runtimeTenant.findUnique({
      where: { id: "7c790122-58ad-4115-94df-e6b352deb563" },
      select: { slug: true },
    });
    if (rec?.slug !== "rechightraining")
      throw new Error("REC runtime identity verification failed.");
    // Inspect all targets before performing any mutation.
    const [cpBefore, runtimeBefore] = await Promise.all([inspect(cp), inspect(runtime)]);
    await runtime.$disconnect();
    runtime = undefined;
    await cp.$disconnect();
    await release("Control Plane", cpUrl, cpBefore);
    await release("REC runtime", runtimeUrl, runtimeBefore);
    console.log("[gym-customer-release] READY_FOR_DEPLOYMENT");
  } finally {
    await runtime?.$disconnect();
    await cp.$disconnect();
  }
}
main().catch((error) => {
  console.error("[gym-customer-release]", sanitizeDatabaseError(error));
  process.exitCode = 1;
});
