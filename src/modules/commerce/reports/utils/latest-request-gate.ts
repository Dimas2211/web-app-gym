// ─────────────────────────────────────────────────────────────────
// commerce/reports — latest-request-gate.ts
//
// Compuerta "solo la última consulta gana". Cada begin() invalida las
// consultas anteriores: su función isLatest() pasa a devolver false, de modo
// que una respuesta lenta de un periodo anterior no sobrescribe el estado
// del último periodo elegido. Sin dependencias de React (testeable).
// ─────────────────────────────────────────────────────────────────

export interface LatestRequestGate {
  /** Inicia una consulta y devuelve su comprobador de vigencia. */
  begin: () => () => boolean;
}

export function createLatestRequestGate(): LatestRequestGate {
  let current = 0;
  return {
    begin() {
      const mine = ++current;
      return () => mine === current;
    },
  };
}
