// commerce/dte — dte-mh-fh-procesamiento.utils.ts
//
// FASE IV-B.1 — Corrección 4 — parser explícito de `fhProcesamiento`
// (formato documentado: dd/MM/yyyy HH:mm:ss), SOLO como utilidad para
// diagnóstico futuro.
//
// NO se usa para persistir accepted_at/observed_at en esta fase: el
// Manual documenta el formato pero no la zona horaria contractual de
// ese string, y `new Date(year, month, ...)` interpreta los componentes
// en la timezone del proceso — no es una fuente segura para un
// timestamp fiscal todavía. `fhProcesamiento` se conserva RAW dentro de
// `mh_response`/`DteTransmissionLog.response_body`.

export function parseMhFhProcesamiento(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const [, dd, MM, yyyy, HH, mm, ss] = match;
  const day = Number(dd);
  const month = Number(MM);
  const year = Number(yyyy);
  const hour = Number(HH);
  const minute = Number(mm);
  const second = Number(ss);

  // Rechazar componentes fuera de rango en vez de dejar que Date "normalice"
  // silenciosamente un 32/13/etc. hacia el mes/día siguiente.
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const d = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(d.getTime())) return null;
  // Verificar que Date no "corrigió" una fecha inválida (ej. 31/02).
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;

  return d;
}
