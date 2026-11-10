/**
 * scripts/showcase/capture.ts — npm run showcase:capture [-- opciones]
 *
 * Genera las capturas reales del producto para la landing (zolvi-landing):
 * levanta la app contra cada base de vitrina, inicia sesión con el usuario
 * adecuado y guarda PNG 2× en zolvi-landing/public/capturas/.
 *
 * Requisitos: npm run showcase:setup (bases zolvi_showcase_*), Microsoft
 * Edge o Google Chrome instalado (playwright-core no descarga navegadores).
 *
 * Opciones:
 *   --only=dashboard,ventas   solo esas capturas (nombre de archivo sin .png)
 *   --out=<carpeta>           carpeta de salida (default: ../zolvi-landing/public/capturas)
 *   --port=3100               puerto del servidor temporal
 *   --no-server               usar un servidor ya levantado en --port (un solo destino,
 *                             arrancado con TZ=UTC y la base de vitrina correspondiente)
 *
 * El servidor temporal usa NEXT_DIST_DIR=.next-showcase para no chocar con
 * un `next dev` normal que esté corriendo en el mismo repo.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { showcaseEnv, type ShowcaseTarget } from "./showcase-env";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const PORT = Number(args.port ?? 3100);
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(
  args.out ?? path.join(__dirname, "../../../zolvi-landing/public/capturas")
);
const ONLY = args.only ? new Set(args.only.split(",")) : null;
const PASSWORD = "Demo1234!";

type Ratio = "16:10" | "4:3";
const VIEWPORT: Record<Ratio, { width: number; height: number }> = {
  "16:10": { width: 1280, height: 800 }, // ×2 = 2560 × 1600
  "4:3": { width: 1200, height: 900 }, // ×2 = 2400 × 1800
};

type Shot = {
  file: string;
  target: ShowcaseTarget;
  user: string;
  /** Nombre de sucursal activa (solo super_admin, cookie active_location_id). */
  location?: string;
  path: string;
  ratio: Ratio;
  /** Ajustes previos a la captura (abrir un selector, hacer scroll, etc.). */
  prepare?: (page: Page) => Promise<void>;
  /** Viewport 1440×900 (misma proporción, más contenido visible). Solo 16:10. */
  wide?: boolean;
};

const COMMERCE_ADMIN = "gerencia@elroble.demo";

/** Selecciona la primera fila de la tabla principal (llena el panel de detalle). */
const selectFirstRow = async (page: Page) => {
  await page.locator("tbody tr").first().locator("td").first().click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
};

/** Filtra el primer <select> que tenga la opción "Activa(s)" (membresías vigentes). */
const selectStatusActive = async (page: Page) => {
  const selects = page.locator("select");
  for (let i = 0; i < (await selects.count()); i++) {
    const opt = selects.nth(i).locator("option", { hasText: /^Activas?$/ });
    if ((await opt.count()) > 0) {
      await selects.nth(i).selectOption({ label: (await opt.first().textContent())!.trim() });
      return;
    }
  }
  throw new Error('No se encontró un filtro con la opción "Activa".');
};
const MATRIZ = "Casa Matriz — San Salvador";

const SHOTS: Shot[] = [
  {
    file: "dashboard",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/reports/commerce",
    ratio: "16:10",
    wide: true,
  },
  {
    file: "productos",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/products",
    ratio: "16:10",
    prepare: selectFirstRow,
  },
  {
    file: "inventario",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/inventory",
    ratio: "16:10",
    prepare: selectFirstRow,
  },
  {
    file: "ventas",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/sales",
    ratio: "16:10",
  },
  {
    file: "compras",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/purchases",
    ratio: "16:10",
  },
  {
    file: "caja",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/cash",
    ratio: "16:10",
  },
  {
    file: "dte",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/dte/outgoing",
    ratio: "16:10",
  },
  {
    file: "clientes",
    target: "commerce",
    user: COMMERCE_ADMIN,
    location: MATRIZ,
    path: "/dashboard/customers",
    ratio: "4:3",
    prepare: selectFirstRow,
  },
  {
    file: "membresias",
    target: "gym",
    user: "direccion@fuerzatotal.demo",
    location: "Sede San Benito",
    path: "/dashboard/memberships/client-memberships",
    ratio: "16:10",
    prepare: selectStatusActive,
  },
  {
    file: "clases",
    target: "gym",
    user: "direccion@fuerzatotal.demo",
    location: "Sede San Benito",
    path: "/dashboard/classes",
    ratio: "16:10",
  },
  {
    file: "multisucursal",
    target: "gym",
    user: "direccion@fuerzatotal.demo",
    location: "Sede San Benito",
    path: "/dashboard/reports/memberships/revenue-by-branch",
    ratio: "16:10",
    wide: true,
  },
  {
    file: "portal",
    target: "gym",
    user: "roberto.sanchez@fuerzatotal.demo",
    path: "/portal",
    ratio: "4:3",
  },
];

// Oculta solo elementos de desarrollo (indicador de Next.js dev).
const CLEANUP_CSS = `
  nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
  *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
`;

async function waitForServer(proc: ChildProcess, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null)
      throw new Error("El servidor Next.js terminó antes de estar listo.");
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return;
    } catch {
      /* aún no escucha */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`El servidor no respondió en ${timeoutMs / 1000}s (puerto ${PORT}).`);
}

function startServer(target: ShowcaseTarget): ChildProcess {
  console.log(`\n▶ Servidor temporal (${target}) en ${BASE} …`);
  const proc = spawn(`npx next dev -p ${PORT}`, {
    // TZ=UTC igual que producción (Vercel): columnas @db.Date (p. ej. sale_date)
    // se formatean en el servidor y en UTC-6 se verían un día antes.
    env: {
      ...showcaseEnv(target),
      NEXT_DIST_DIR: ".next-showcase",
      NEXT_TELEMETRY_DISABLED: "1",
      TZ: "UTC",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Log completo del servidor para diagnóstico; los errores también a consola.
  fs.mkdirSync(".next-showcase-logs", { recursive: true });
  const log = fs.createWriteStream(path.join(".next-showcase-logs", `server-${target}.log`));
  proc.stdout?.pipe(log);
  proc.stderr?.on("data", (d) => {
    log.write(d);
    const s = String(d);
    if (/error/i.test(s)) process.stderr.write(`  [next] ${s}`);
  });
  return proc;
}

function stopServer(proc: ChildProcess) {
  if (proc.pid === undefined || proc.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* ya terminó */
    }
  } else {
    proc.kill("SIGTERM");
  }
}

async function launchBrowser(): Promise<Browser> {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      /* probar el siguiente */
    }
  }
  throw new Error("No se encontró Microsoft Edge ni Google Chrome instalados.");
}

async function capture(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    viewport: shot.wide ? { width: 1440, height: 900 } : VIEWPORT[shot.ratio],
    deviceScaleFactor: 2,
    locale: "es-419", // es-SV no existe en Chromium y cae a "es" (separador de miles con punto)
    timezoneId: "America/El_Salvador",
    colorScheme: "light",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);

  await page.goto(`${BASE}/login`);
  await page.fill("#email", shot.user);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click("button[type=submit]"),
  ]);

  if (shot.location) {
    const locationId = await resolveLocationId(shot);
    await context.addCookies([{ name: "active_location_id", value: locationId, url: BASE }]);
  }

  // Con `next dev` en frío un fetch de cliente puede quedar colgado mientras
  // compila su ruta: se reintenta una vez recargando la página.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "load" });
      await page.addStyleTag({ content: CLEANUP_CSS });
      await page.evaluate(() => document.fonts.ready);
      await waitForLoaders(page);
      if (shot.prepare) {
        await shot.prepare(page);
        await waitForLoaders(page);
      }
      break;
    } catch (err) {
      if (attempt >= 2) throw err;
      console.log(`  … reintentando ${shot.file} (${err instanceof Error ? err.message : err})`);
    }
  }
  await page.waitForTimeout(600);

  const file = path.join(OUT, `${shot.file}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${shot.file}.png  (${shot.path})`);
  await context.close();
}

/**
 * Espera a que la página quede estable sin indicadores de carga ("Cargando…",
 * "Actualizando…"). Los fetch de cliente arrancan tras la hidratación, así que
 * se exigen varias comprobaciones limpias consecutivas, no solo la primera.
 */
async function waitForLoaders(page: Page) {
  const deadline = Date.now() + 180_000; // incluye compilación en frío de `next dev`
  let clean = 0;
  while (clean < 4) {
    if (Date.now() > deadline) {
      const stuck = await page.evaluate(() =>
        document.body.innerText.split(/\r?\n/).filter((l) => /Cargando|Actualizando/i.test(l))
      );
      throw new Error(`La página ${page.url()} no terminó de cargar: ${JSON.stringify(stuck)}`);
    }
    await page.waitForTimeout(500);
    const loading = await page.evaluate(
      () =>
        /Cargando|Actualizando/i.test(document.body.innerText) ||
        document.querySelector(".animate-pulse") !== null // skeletons
    );
    clean = loading ? 0 : clean + 1;
  }
  // Algunas pantallas consultan periódicamente (p. ej. estado de caja) y nunca
  // quedan "idle": se intenta brevemente y se continúa.
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
}

/** Busca el id de sucursal por nombre directamente en la base de vitrina. */
const locationCache = new Map<string, string>();
async function resolveLocationId(shot: Shot): Promise<string> {
  const key = `${shot.target}|${shot.location}`;
  if (locationCache.has(key)) return locationCache.get(key)!;
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: showcaseEnv(shot.target).DATABASE_URL });
  const branch = await db.branch.findFirst({
    where: { name: shot.location },
    select: { id: true },
  });
  await db.$disconnect();
  if (!branch) throw new Error(`Sucursal no encontrada: ${shot.location}`);
  locationCache.set(key, branch.id);
  return branch.id;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Salida: ${OUT}`);
  const shots = SHOTS.filter((s) => !ONLY || ONLY.has(s.file));
  if (shots.length === 0) throw new Error("Ninguna captura coincide con --only.");

  const browser = await launchBrowser();
  try {
    for (const target of ["commerce", "gym"] as ShowcaseTarget[]) {
      const group = shots.filter((s) => s.target === target);
      if (group.length === 0) continue;
      // --no-server: usar un servidor ya levantado en --port (iteración rápida).
      const server = args["no-server"] ? null : startServer(target);
      try {
        if (server) await waitForServer(server);
        for (const shot of group) await capture(browser, shot);
      } finally {
        if (server) stopServer(server);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n✅ ${shots.length} captura(s) en ${OUT}\n`);
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
