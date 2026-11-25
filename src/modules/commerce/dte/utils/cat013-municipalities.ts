// ─────────────────────────────────────────────────────────────────
// commerce/dte — cat013-municipalities.ts
//
// MH20 (IMP20-007) — CAT-013 Municipio versionado por fuente oficial.
//
//   V1_2 → Catálogos MH v1.2 (10/2025). Es EXACTAMENTE el artefacto
//          histórico de FEX 11 (cat013-fex-v3-municipalities.ts), que no
//          se modifica ni se duplica.
//   V2_0 → Catálogos MH asociados a la Normativa 2.0. Según la Fase 3
//          (03-catalogos-diff.json, CAT20-307/308) solo cambian las dos
//          filas de Cabañas: 09|10 pasa a "CABAÑAS ESTE" y 09|11 a
//          "CABAÑAS OESTE" (intercambio respecto de V1.2).
//
// Fase 6.1 (consultas-mh-verificadas.md §13, RESUELTO_DOCUMENTALMENTE):
// no es una contradicción sino un cambio oficial. CAT-PDF "Control de
// Versiones", PDF p.2: "Versión 1.1 | 07/2026 | CAT-013 Municipio. Cambio: 2"
// y PDF p.18: "10 CABAÑAS ESTE / 11 CABAÑAS OESTE" (= Excel Hoja1!398-399).
// Las filas llevan `changedFromV1_2` (trazabilidad) y la proyección MH_2_0
// resuelve por nombre de municipio nuevo, sin reescribir códigos guardados.
// Historial: hasta Fase 6 se marcaban `disputed: "CAT-INC-001"` y fallaban
// cerrado. Pendiente externo (C1): desde qué fecha aplica a la estructura
// anterior; el perfil MH_1_2 sigue con la tabla V1.2 intacta.
//
// No se infiere ningún código: el resto de filas V2_0 es idéntico a V1_2
// (sin otras diferencias CAT-013 OFICIAL_V1.2→2.0 en la Fase 3).
// ─────────────────────────────────────────────────────────────────

import {
  CAT013_FEX_V3_MUNICIPALITIES,
  normalizeCat013Name,
} from "./cat013-fex-v3-municipalities";

export type Cat013Source = "V1_2" | "V2_0";

export interface Cat013Municipality {
  readonly departmentCode:   string;
  readonly municipalityCode: string;
  readonly municipalityName: string;
  /** Código cuyo significado cambió respecto de V1.2 (CAT-013 v1.1 "Cambio: 2"). */
  readonly changedFromV1_2?: "CAT-013-V1.1-CAMBIO-2";
}

export const CABANAS_DEPARTMENT_CODE = "09";

const V2_0_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  "09|10": "CABAÑAS ESTE",  // CAT20-307
  "09|11": "CABAÑAS OESTE", // CAT20-308
});

export const CAT013_V1_2: readonly Cat013Municipality[] = CAT013_FEX_V3_MUNICIPALITIES;

export const CAT013_V2_0: readonly Cat013Municipality[] = Object.freeze(
  CAT013_FEX_V3_MUNICIPALITIES.map((m) => {
    const key = `${m.departmentCode}|${m.municipalityCode}`;
    const override = V2_0_OVERRIDES[key];
    return Object.freeze(
      override
        ? { ...m, municipalityName: override, changedFromV1_2: "CAT-013-V1.1-CAMBIO-2" as const }
        : { ...m },
    );
  }),
);

export function getCat013Source(source: Cat013Source): readonly Cat013Municipality[] {
  return source === "V2_0" ? CAT013_V2_0 : CAT013_V1_2;
}

export { normalizeCat013Name };
