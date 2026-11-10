/**
 * scripts/showcase/showcase-env.ts
 *
 * URLs de las bases de vitrina, derivadas de DATABASE_URL del .env local
 * (mismo servidor/credenciales, otro nombre de base). Solo localhost.
 */
import "dotenv/config";

export const SHOWCASE_DBS = {
  commerce: "zolvi_showcase_commerce",
  gym: "zolvi_showcase_gym",
} as const;
export type ShowcaseTarget = keyof typeof SHOWCASE_DBS;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function showcaseUrl(dbName: string): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL no está definida en .env");
  const url = new URL(raw.trim());
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Las bases de vitrina solo se crean en un PostgreSQL local (DATABASE_URL no es localhost).");
  }
  url.pathname = `/${dbName}`;
  return url.toString();
}

/** Entorno de proceso hijo apuntando DATABASE_URL y DIRECT_URL a la base de vitrina. */
export function showcaseEnv(target: ShowcaseTarget): NodeJS.ProcessEnv {
  const url = showcaseUrl(SHOWCASE_DBS[target]);
  return { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
}
