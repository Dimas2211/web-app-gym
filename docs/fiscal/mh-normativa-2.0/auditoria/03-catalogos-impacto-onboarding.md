# Fase 3: impacto de los catálogos 2.0 en el onboarding fiscal

Alcance: `commerce/dte/mh-test-runs/*`, `platform/dte-onboarding/mh-test-runs/*`, `platform/components/platform-mh-test-runs-section.tsx` y los seed-runners de catálogo usados en el onboarding de bases (`platform/lib/seed-runners/dte-catalog-items-runner.ts`, `dte-catalog-seed.constants.ts`, `tenant-fiscal-config-runner.ts`).

## 1. Datos de catálogo en los fixtures de MH TEST

| Dato del fixture | Ubicación | Catálogo 2.0 | Estado |
|---|---|---|---|
| Receptor: `deptCode` + `municipalityCode` | `mh-test-scenarios.ts:63-64,75-76,100-101,185,200,231` | CAT-012, CAT-013, **CAT-008** | **Incompatible.** `municipalityCode` es el código antiguo, que en 2.0 es el distrito. Falta el municipio 2.0 y no se captura el distrito. Los 262 códigos actuales no existen en el CAT-013 2.0, así que se espera un rechazo de MH. |
| Emisor (`MH_TEST_ISSUER_SELECT`) `dept_code`, `establishment_code`, `establishment_type_code` | `mh-test-scenarios.ts:262-280` | CAT-012/013/008, codificación de la AT | Mismo problema territorial. `establishment_type_code` (CAT-009) ya no se envía en FE/CCF/NC/INV (SCH20-004, -105, -223, -516). |
| Actividad `^\d{5,6}$` | `mh-test-scenarios.ts:198` | CAT-019 (sin cambios) | Compatible |
| País del receptor extranjero | `mh-test-scenarios.ts:86,214` | CAT-020 (sin cambios) | Compatible |
| Tipos de documento `13 / 36 / 02 / 03 / 37` | `mh-test-scenarios.ts:58,84,95,117,181,211,227,242` | CAT-022 (sin cambios de códigos) | Compatible |
| Forma de pago `"01"` y condición `"1"` | `mh-test-scenarios.ts:389,409,461,480` | CAT-017 y CAT-016 (sin cambios) | Compatible |
| Tributo IVA `13` | `mh-test-scenarios.ts:404` | CAT-015 "20" (sin cambios) | Compatible |
| Invalidación tipo `"2"` | `mh-test-run.runtime-port.ts:207` | CAT-024 "Motivo del evento" 2 = "Rescindir de la operación realizada" | El código es válido, pero **la etiqueta del seed Zolvi no coincide** (CAT20-418) y la UI o los informes de onboarding podrían describirlo mal |
| Contingencia `contingencyTypeCode` | `mh-test-run.runtime-port.ts:237`, `platform-mh-test-runs-section.tsx:82,134,210` | CAT-005 (sin cambios) | Compatible. En el código se le llama "CAT-023" por error (ver `03-catalogos-impacto-zolvi.md` §5). |
| Tipos de DTE del plan `01 / 03 / 05 / 11 / 14` | `mh-test-scenarios.ts:45-46` | CAT-002 (se agregan 17 y 18) | Compatible; no hay escenarios 17/18 (MH20-088) |

## 2. Seeds en el onboarding de bases

- `dte-catalog-items-runner.ts` tiene **una copia propia** de `CATALOG_ITEMS` (líneas 59-113, incluidos CAT-002 en :64-68 y `...FEX11_CATALOG_ROWS` en :113), con los mismos subconjuntos y etiquetas de `seed.dte-catalog-items.ts`. Hay dos fuentes duplicadas que hay que actualizar en paralelo. Un tenant nuevo hereda:
  - CAT-002 sin 11, 14, 17 ni 18;
  - CAT-017 con 6 de 12 códigos;
  - CAT-024 con la etiqueta errónea en el código 2;
  - CAT-028 en formato V1.2 (`EX-1.…`), incompatible con 2.0.
- El seed de `Municipality` (`municipalities.data.ts`, 262 filas) **ya tiene** `district_code`, `district_name`, `new_municipality_code` y `new_municipality_name`. Con ese dato se puede derivar el distrito y el municipio 2.0 sin modificar registros: la correspondencia es inequívoca en 261 de 262. Pendientes:
  - `06|19` Delgado, por revisar;
  - Cabañas, por CAT-INC-001.

## 3. Riesgos para emisores en onboarding

1. Un emisor configurado hoy (`DteIssuerConfig.municipality_code` = código antiguo) **no pasará** la validación territorial 2.0 en FE/CCF/NC/FSE hasta que se proyecte municipio/distrito. Antecedente: FEX v3 ya obligó a hacer esa proyección.
2. Si el emisor está en Cabañas, la proyección depende de una contradicción oficial sin resolver (CAT-INC-001).
3. Los emisores que exportan bienes (FEX con `tipoItemExpor` ≠ 2) necesitarán CAT-033 (`tipoRegimen`) y CAT-028 con formato 2.0. Hoy Zolvi envía `null` en ambos campos.

## 4. Sin impacto

CAT-001, 003, 004, 016, 018, 019, 020, 022 y 031 no tienen cambios de código que afecten a los fixtures.
