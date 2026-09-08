// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-period.util.ts
//
// FASE IV-A — resuelve el "period_key" comercial ("YYYY-MM") de
// fiscal.dte.monthly_issued a partir de un instante (`now`) y el
// timezone IANA de la PlatformOrganization.
//
// Reglas de docs/modules/platform-phase-4-dte-monthly-metering.md:
//   - El periodo mensual es el mes calendario LOCAL de la organización,
//     nunca UTC.
//   - NO hay fallback silencioso a "America/El_Salvador" ni a ningún
//     otro timezone — timezone ausente o inválido es un error
//     comercial/de configuración explícito (fail-closed), nunca una
//     suposición.
//   - Se usa Intl.DateTimeFormat con `timeZone` (API nativa de Node/V8,
//     con base de datos IANA/tz embebida) para resolver año/mes en el
//     timezone real, incluyendo DST — sin aritmética de offset manual
//     y sin agregar una dependencia nueva (date-fns-tz / Temporal no
//     están instaladas; ver justificación abajo).
//
// Por qué no se agregó una dependencia nueva:
//   Intl.DateTimeFormat({ timeZone }) ya resuelve conversión IANA
//   completa (incluye DST) sin necesitar date-fns-tz ni un polyfill de
//   Temporal — es una API nativa estable en el runtime Node de este
//   proyecto. Agregar una librería solo para esto sería sobre-
//   ingeniería sin beneficio real.
// ─────────────────────────────────────────────────────────────────

export type ResolveDteMonthlyPeriodKeyResult =
  | { ok: true; periodKey: string }
  | { ok: false; error: string };

/**
 * Valida que `timezone` sea un nombre de zona IANA reconocido por el
 * runtime. Intl.DateTimeFormat lanza RangeError ante un timeZone
 * inválido — se usa como validador, no solo como formateador.
 */
export function isValidIanaTimeZone(timezone: string | null | undefined): timezone is string {
  if (!timezone || timezone.trim() === "") return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve el period_key ("YYYY-MM") del mes calendario LOCAL de
 * `timezone` para el instante `now`. Pura y testeable — no depende de
 * Date.now() ni de I/O.
 *
 * Nunca asume UTC ni un timezone por defecto: si `timezone` es null,
 * vacío o no es un nombre IANA válido, devuelve `ok:false` con un
 * mensaje apto para el usuario final del error comercial.
 */
export function resolveDteMonthlyPeriodKey(
  now: Date,
  timezone: string | null | undefined,
): ResolveDteMonthlyPeriodKeyResult {
  const trimmed = typeof timezone === "string" ? timezone.trim() : "";

  if (trimmed === "") {
    return {
      ok: false,
      error:
        "La organización no tiene timezone configurado. Es requerido para calcular el periodo comercial de fiscal.dte.monthly_issued.",
    };
  }

  if (!isValidIanaTimeZone(trimmed)) {
    return {
      ok: false,
      error: `El timezone configurado ("${timezone}") no es una zona IANA válida.`,
    };
  }

  // Intl.DateTimeFormat con timeZone resuelve año/mes en la hora LOCAL
  // de esa zona (incluye DST donde aplique) — sin aritmética de offset.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: trimmed,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;

  if (!year || !month) {
    // No debería ocurrir con un timezone ya validado arriba, pero no se
    // inventa un period_key sin evidencia.
    return {
      ok: false,
      error: `No se pudo derivar año/mes local para el timezone "${timezone}".`,
    };
  }

  return { ok: true, periodKey: `${year}-${month}` };
}
