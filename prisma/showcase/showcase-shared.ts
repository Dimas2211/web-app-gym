/**
 * prisma/showcase/showcase-shared.ts
 *
 * Utilidades comunes de los seeds "showcase" (datos de demostración para
 * las capturas de la landing getzolvi.com).
 *
 * USO EXCLUSIVO: bases locales desechables cuyo nombre empieza con
 * `zolvi_showcase`. Nunca la base de desarrollo `zolvi_local`, nunca una
 * base remota. No importar desde código de producción.
 */
import { checkLocalOnlyDatabase } from "../local-only-database-guard";

const SHOWCASE_DB_PREFIX = "zolvi_showcase";

/**
 * Barrera doble: además de la guarda local estándar (host local, no
 * producción, no Vercel), exige que DATABASE_URL y DIRECT_URL apunten a una
 * base cuyo nombre empiece con `zolvi_showcase`. Así un `.env` por defecto
 * (que apunta a `zolvi_local`) nunca recibe datos de vitrina.
 */
export function assertShowcaseDatabase(scriptName: string): void {
  const local = checkLocalOnlyDatabase(process.env);
  if (!local.ok) {
    console.error(`\n✗ ${scriptName}: abortado. ${local.reason}\n`);
    process.exit(1);
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const raw = process.env[name];
    if (!raw) continue;
    const dbName = new URL(raw.trim()).pathname.replace(/^\//, "");
    if (!dbName.startsWith(SHOWCASE_DB_PREFIX)) {
      console.error(
        `\n✗ ${scriptName}: abortado. ${name} no apunta a una base "${SHOWCASE_DB_PREFIX}*".\n` +
          `  Use: npm run showcase:setup (crea y apunta a las bases de vitrina).\n`,
      );
      process.exit(1);
    }
  }
}

/** PRNG determinista: los mismos datos en cada base nueva. */
export function createRandom(seed: number) {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  /** Elige según pesos relativos. */
  const weighted = <T,>(items: readonly { value: T; weight: number }[]): T => {
    const total = items.reduce((a, i) => a + i.weight, 0);
    let r = rand() * total;
    for (const i of items) {
      r -= i.weight;
      if (r <= 0) return i.value;
    }
    return items[items.length - 1].value;
  };
  const chance = (p: number) => rand() < p;
  return { rand, int, pick, weighted, chance };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

const SV_TZ = "America/El_Salvador"; // UTC-6 todo el año, sin horario de verano.

/** Fecha de hoy en El Salvador como Date a medianoche UTC (columnas @db.Date). */
export function todayInElSalvador(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: SV_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Instante real para "día @db.Date + hora local de El Salvador" (UTC-6). */
export function atLocalTime(day: Date, hour: number, minute = 0): Date {
  return new Date(day.getTime() + (hour + 6) * 3_600_000 + minute * 60_000);
}

/** Hora local actual en El Salvador (0-23). */
export function currentLocalHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: SV_TZ, hour: "numeric", hourCycle: "h23" }).format(
      new Date(),
    ),
  );
}

export const DEMO_PASSWORD = "Demo1234!";
