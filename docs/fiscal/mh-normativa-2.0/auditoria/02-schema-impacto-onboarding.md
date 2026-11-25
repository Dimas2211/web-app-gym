# Fase 2: impacto de los schemas 2.0 en el onboarding fiscal (MH TEST runs)

Alcance: los archivos localizados con `rg --files src` filtrando por `mh-test`, `test-run`, `fiscal-onboarding` y `dte-test`. Solo se siguieron sus imports directos. No se auditó todo el Control Plane.

## 1. Cadena de dependencias verificada

```
platform/dte-onboarding/mh-test-runs/mh-test-run.engine.ts
  └─ mh-test-run.runtime-port.ts (implementación concreta, líneas 151-259)
       ├─ commerce/dte/mh-test-runs/mh-test-documents.service.ts
       │    └─ mh-test-scenarios.ts → buildFeJsonFromLoadedData, buildCcfeJsonFromLoadedData,
       │                              buildFexJsonFromLoadedData, buildFseJsonFromLoadedData,
       │                              validateDteJsonAgainstOfficialSchema (imports :22-29)
       │    └─ generateNcJsonForDte (NC 05, :25)
       ├─ validate-dte-json-schema.service.ts (validate, :169)
       ├─ sign-dte-document / transmit-dte-document / dte-reconciliation
       ├─ create-invalidation-event → sign/transmit-invalidation-event (:204-223)
       └─ create-contingency-event → persist-contingency-event-json → sign/transmit (:232-259)
```

## 2. Resultado

| Pregunta | Resultado |
|---|---|
| ¿Reutiliza builders canónicos? | **Sí, totalmente.** FE, CCF, FEX y FSE usan `build*FromLoadedData`. NC usa `generateNcJsonForDte`. Los eventos usan los servicios de producción. |
| ¿Tiene generadores independientes? | **No.** No hay payloads propios de DTE ni de eventos. |
| ¿Versiones hardcodeadas propias? | **No.** Hereda las de los builders (ver `02-schema-impacto-zolvi.md` §3). `mh-test-run.planner.ts:30` (`version: z.literal(1)`) es la versión del plan interno, no del DTE. |
| ¿Fixtures incompatibles? | **Sí, en el contenido de datos.** Ver §3. |
| ¿Eventos nuevos sin generador? | **Retorno (tipo 18) y Operaciones Especiales (tipo 17) no tienen generador.** El onboarding solo cubre FE01, CCF03, NC05, FEX11 y FSE14, además de la invalidación (objetivos `FE01_IDENTIFICADO` y `CCFE03_ESTANDAR`) y la contingencia (`CONT01_FE`, `CONT03_CCFE`): `mh-test-scenarios.ts:33-53`. |

**Consecuencia directa.** Cuando los builders se adapten a la 2.0, el onboarding heredará el cambio sin código propio. Pero mientras sigan en v1/v3, **todo lote MH TEST contra un ambiente con schemas 2.0 fallará por versión** en el paso de transmisión (SCH20-001, -102, -222, -446, -513, -565). El paso de validación AJV local seguirá en verde, porque valida contra los schemas antiguos. El motor clasifica ese error como determinista y lo manda a revisión (`mh-test-run.engine.ts:306-307`).

## 3. Fixtures y datos del onboarding afectados

| Elemento | Ubicación | Impacto 2.0 | SCH20 / MH20 |
|---|---|---|---|
| Receptor identificado, contribuyente y sujeto excluido: piden solo `deptCode` + `municipalityCode` | `mh-test-scenarios.ts:63-64,75-76,100-101`; validaciones `:185,200,231` | Falta `distrito`. Además, el **significado de `municipio` cambia** con el CAT-013 2.0 (ver Fase 3). | SCH20-009, -111, -239; MH20-075 |
| Validación de actividad `^\d{5,6}$` | `mh-test-scenarios.ts:198` | Compatible con `codActividad` del 2.0 (minLength 5, maxLength 6) | — |
| Tipos de documento admitidos (`13`, `36`, `02`, `03`, `37`) | `mh-test-scenarios.ts:58,84,95,117,181,211,227,242` | Coinciden con el CAT-022 2.0. El schema 2.0 ya no los enumera. | SCH20-049 |
| NC 05 sobre un CCF aceptado | `mh-test-documents.service.ts:25,300` | El NC v4 exige `receptor.tipoDocumento/numDocumento` y totales por ítem nuevos; se elimina `receptor.nit` | SCH20-225, -240, -241, -248; MH20-037/038 |
| FSE 14 con receptor "excluded" | `mh-test-scenarios.ts:39,512-515` | El builder emite `sujetoExcluido`; la v2 espera `receptor` | SCH20-450/452/453; MH20-042 |
| Invalidación de tipo 2 con responsable y solicitante | `mh-test-run.runtime-port.ts:207-208` | La v3 elimina `fecAnula`, `montoIva` y `tipoEstablecimiento`, y exige `codEstableMH/codPuntoVentaMH` no nulos y `documento.correo/telefono` | SCH20-514…-545; MH20-052, INC-004/006 |
| Contingencia (tipo y motivo del plan) | `mh-test-run.runtime-port.ts:236-241` | La v4 exige `codPuntoVentaMH` y `codEstableMH` | SCH20-566…-574; MH20-055, INC-005 |
| Formulario del panel | `platform/components/platform-mh-test-runs-section.tsx` | Sin campo de distrito para los receptores de prueba | MH20-075 |

## 4. Brechas normativas del onboarding (no resolubles con schema)

- **MH20-087 / MH20-088**: pruebas mínimas por tipo de DTE y de eventos, incluidos Retorno y OE (INC-011). El plan actual no tiene escenarios de Retorno ni de OE. No se amplía el alcance comercial: se documenta para decisión.
- **MH20-090**: repetición de pruebas para emisores existentes. Sigue NO_DETERMINADO; condiciona si los emisores ya certificados deben repetir lotes con la 2.0.
- **MH20-094**: coexistencia de versiones. No se sabe si MH TEST acepta v1/v3 durante la transición.

## 5. Bloqueos para el onboarding

1. No se puede ejecutar ningún lote MH TEST 2.0 mientras los builders sigan emitiendo las versiones antiguas.
2. Para los receptores de prueba falta capturar el distrito y la correspondencia municipio/distrito 2.0 (Fase 3).
3. Hay que decidir si se incorporan los escenarios de Retorno y OE (MH20-088) sin ampliar los DTE ofrecidos.
