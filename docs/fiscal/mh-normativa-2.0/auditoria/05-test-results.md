# Fase 5 — Resultados de pruebas (2026-11-24)

Alcance (igual a la línea base): `src/modules/commerce/dte`, `src/modules/platform/dte-onboarding`,
`src/modules/commerce/purchases`, `src/modules/commerce/sales`, `prisma`.

| | Línea base (HEAD b682b70, antes de cambios) | Final (working tree) |
|---|---|---|
| Archivos de test | 136 (134 ok, 1 fallo, 1 omitido) | 142 (140 ok, 1 fallo, 1 omitido) |
| Tests | 1310 (1303 ok, 1 fallo, 6 omitidos) | 1375 (1368 ok, 1 fallo, 6 omitidos) |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run build` (local, sin deploy) | — | exit 0 |
| `eslint` archivos tocados | — | 0 errores, 8 warnings (`any` en un test) |

## Fallo preexistente (no introducido)

`src/modules/commerce/dte/certification/dte-internal-certification.test.ts:905`
"INVALIDATION > Incompatible invalidation blocked" — `TypeError: .toMatch() expects to receive a string, but got boolean`.
Mismo mensaje y línea en la línea base y al final. No se modificó el test ni se ocultó.

## Tests nuevos (65)

| Archivo | Tests | Cubre |
|---|---|---|
| `services/__golden__/mh12-golden.test.ts` | 8 | Golden MH_1_2 byte a byte capturados con el código previo: FE v1 (3), CCF v3 (2), FEX v3, FSE v1, NC v3; no escribe `mh_spec_profile` con interruptor OFF |
| `services/__golden__/mh20-fixtures.test.ts` | 17 | FE v2 (3), CCF v4 (2), FSE v2, NC v4 sobre CCF v4 y v3 validados contra el schema oficial original (AJV directo) + validador por versión + reglas semánticas; numeroControl no AT; sin territorio; bloqueo ivaRete1 FSE; FEX idéntica en ambos perfiles; negativas R20-TOT-01 (holgura ±0.01), R20-TERR-01 (CAT-013, Cabañas), R20-EST-01 |
| `spec/mh20-spec.test.ts` | 30 | SHA-256 de los 8 schemas vs original; FEX v3 = vigente; registro y versiones; schema por versión; AMBIGUOUS; bloqueados; pendingConfirmation PROD/TEST; interruptor OFF/ON; coherencia versión↔perfil; LEGACY_FALLBACK; versión desconocida; caché AJV; política de transición; proyección territorial sobre las 262 filas de Municipality (1.2 todas; 2.0 solo Cabañas falla; Delgado REVIEW_LABEL; resto idéntico a 1.2) |
| `prisma/seeds/data/dte-catalog-items-mh20.data.test.ts` | 6 | Catálogos 2.0 (conteos, CAT-028 = diff Fase 3, CAT-033 " TA-1", CAT-024 etiqueta, V1.2 intacto) |
| `prisma/scripts/mh20-territory-dry-run.test.ts` | 1 | Dry-run con fixtures en memoria |
| `services/dte-production-preflight.mh20.test.ts` | 3 | Codificación AT: ok / advertencia 1.2 / bloqueo 2.0 |

## Expectativa de test modificada (intencional)

`utils/cat013-fex-v3-municipalities.test.ts`: la prueba de aislamiento ahora admite
`cat013-municipalities.ts` como importador además de `fex11-v3-territory.ts`
(diseño D7: CAT-013 versionado único). No cambia datos ni comportamiento FEX.

## No ejecutado

- Ninguna transmisión real; reintentos solo con los mocks existentes (tests de transmit pasan sin cambios).
- Dry-run territorial no ejecutado contra bases (solo fixtures).
- E2E Playwright no ejecutado (sin cambios de UI).

Logs: scratchpad de la sesión (`baseline-vitest.txt`, `final-vitest.txt`, `final-tsc.txt`, `final-build.txt`).
