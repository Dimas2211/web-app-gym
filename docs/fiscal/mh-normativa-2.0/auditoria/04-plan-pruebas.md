# Fase 4: plan de pruebas MH 2.0

**Estado: diseñado, no ejecutado.** Stack: Vitest (lógica y runtime-write con base local), el harness `certification/harness` (fake-fiscal-network, in-memory-prisma), `npm run dte:certify`, y MH TEST real solo con autorización.

## 1. Regla transversal: regresión 1.2 primero

Antes de tocar cualquier builder (IMP20-013 a IMP20-019):

1. Se capturan **golden fixtures** del JSON actual por tipo:
   - FE v1, CCF v3, NC v3 y FSE v1;
   - INV v2 y CONT v3;
   - FEX v3.

   Las fixtures se generan con `build*FromLoadedData` y una fecha fija.
2. Cada PR de la implementación debe mantener **byte a byte** esas fixtures con el perfil `MH_1_2`.
3. La FEX debe mantenerse idéntica en los dos perfiles.

## 2. Pruebas unitarias

| Área | Casos | Tarea |
|---|---|---|
| Registro de especificaciones | Versión por (perfil, tipo). `pendingConfirmation` en FEX 2.0 y CONT 2.0. Inferencia: FEX v3 → AMBIGUOUS. SHA de los schemas `v2_0/` = originales. | IMP20-001 |
| Validador versionado | Un histórico v1/v3 valida con su schema. FE v2 valida con fe-f-v2. Una versión desconocida da error explícito. La caché compila una sola vez. | IMP20-002 |
| Guardia de versión | Sin firmar y con otro perfil → error de regeneración. Firmado → se transmite con su versión. `body.version` = `identificacion.version`. | IMP20-003, 006 |
| Activación | Interruptor OFF → MH_1_2. NULL → MH_1_2. TEST y PROD independientes. PROD + pendiente → bloqueo. | IMP20-004 |
| Territorio | Las 262 filas de `municipalities.data.ts`: 260 OK, Delgado `REVIEW_LABEL` y Cabañas `CAT_INC_001_CABANAS` (solo MH_2_0). FEX sin cambios. Distrito = `code`. Jerarquía inconsistente → fail-closed. | IMP20-007 |
| Código de establecimiento | `M001`/`S010`/`B002`/`P003` válidos y `X001`/`m001`/`M01` inválidos. Con 2.0 bloquea; con 1.2 advierte. | IMP20-011 |
| FE v2 / CCF v4 | Campos eliminados ausentes, renombres, `observaciones` ≤ 3000, distrito en emisor y receptor, consumidor final sin dirección | IMP20-013, 014 |
| NC v4 | Fórmulas por ítem: Σ totalIva = resumen.totalIva, dentro de la holgura MH20-031. Receptor `36`+NIT. NC total y parcial. | IMP20-015 |
| FSE v2 | `receptor` en lugar de `sujetoExcluido`. Sin `ivaRete1`. `totalDescu` numérico. Retención del 1 % → error. | IMP20-016, 029 |
| INV v3 / CONT v4 | `fecEmi`/`horEmi`. `codEstableMH`/`codPuntoVentaMH` no nulos. `correo`/`telefono` presentes. `codPuntoVentaMH` desde `cod_punto_venta_mh`. Tabla de plazos UNSET → bloqueo en PROD. | IMP20-018, 019 |
| Reglas semánticas | Por familia de condicional retirado: un caso inválido se rechaza y no hay falsos positivos sobre los golden v2 | IMP20-020 |
| Retorno | Límites (50 documentos, 2000 ítems, código único por evento), suma acumulada ≤ DTE, solo FE/FEX/FSE aceptados, plazo configurable | IMP20-022 |
| OE | Sin autorización → rechazo en el backend. Rangos `docDel`/`docAl` según el schema. | IMP20-023 |
| Catálogos | El runner y el seed dan el mismo conjunto. No se elimina ninguna fila. Upsert idempotente. | IMP20-009 |
| Mínimos de onboarding | El preset MF 2.0 se reparte en corridas ≤ 200. NC ≤ CCF. OE = 0 sin autorización. | IMP20-032 |

## 3. Integración (runtime-write con base local)

Se amplían los tests existentes `*.runtime-write.test.ts` de:

- `generate-{fe,ccfe,nc,fse,fex}-json.service`;
- `create-credit-note-dte.service`;
- `create-invalidation-event.service`;
- `persist-contingency-event-json.service`;
- `sign-*` y `transmit-*`;
- `dte-correlative.service.baseline`.

Casos:

1. El ciclo completo **PENDING_GENERATION → ACCEPTED** con fake-fiscal-network en los dos perfiles.
2. **Transición**: un documento GENERATED con 1.2 y el perfil cambiado a 2.0 → la firma exige regenerar. Se regenera con el mismo `control_number` y `generation_code`.
3. **Firmado pendiente**: un SIGNED 1.2 se transmite como v1. Ante un rechazo simulado por versión, se reabre y se regenera.
4. **Retorno concurrente**: dos retornos en paralelo sobre la misma FE no superan el total (lock).
5. **Invalidación de un Retorno**: el CHECK de la base exige exactamente un destino.
6. **Correlativos (caracterización, COR-01)**: una reserva con el reloj simulado el 2027-01-01 **continúa** la secuencia. Documenta el comportamiento actual; no es una corrección.
7. **Compras**: importación de FE v2, CCF v4 y NC v4 recibidos (sin `subTotal` en la NC).
8. **MariaDB**: `build-external-dte-payload` con FE v2. Un destino sin `accepts_mh20` → `DELIVERY_BLOCKED_CONTRACT`, reintentable e idempotente (`deliver-dte-to-external-db.service.idempotency.test.ts`).

## 4. Aislamiento y seguridad

| Prueba | Archivo base |
|---|---|
| Cross-tenant: un emisor o documento de otro tenant no se lee, firma, transmite, retorna ni invalida | `deliver-dte-to-external-db.service.cross-tenant.test.ts`, `deliver-invalidation-to-external-db.service.cross-tenant.test.ts` (patrón para los eventos nuevos) |
| Alcance por `location_id` en las acciones nuevas (retorno, perfil, OE) | Tests de acción. La validación vive en el backend, no en la UI. |
| Perfil por ambiente: cambiar TEST no afecta a PRODUCTION | IMP20-004 |
| Dry-run: 0 escrituras (transacción read-only) | IMP20-008 |
| Sin secretos en `evidence`, logs ni reportes (JWS, tokens, passwordPri) | `mh-test-run.runtime-port.test.ts` |

## 5. Onboarding fiscal (MH TEST runs)

Se amplían:

- `mh-test-scenarios.test.ts`;
- `mh-test-run.planner.test.ts`;
- `mh-test-run.engine.test.ts`;
- `mh-test-run.runtime-port.test.ts`;
- `mh-test-runs.pg.test.ts`;
- `mariadb-certification-exclusion.test.ts`.

Casos:

1. **Plan 2.0 en seco**: todos los escenarios generan JSON válido contra el schema del perfil **antes** de reservar correlativos.
2. **Receptores**: `deptCode`/`municipalityCode` se proyectan. Cabañas se rechaza en el planner con un mensaje (CAT-INC-001).
3. **Emisor**: falta `cod_estable_mh`/`cod_punto_venta_mh` → el plan no se autoriza (INV v3 y CONT v4).
4. **`plan.specProfile`** distinto del perfil del emisor TEST → rechazo.
5. **Orden lógico**: FE → Retorno → invalidación del Retorno → invalidación de la FE, con `depends_on_item_id`. Si el padre falla, los hijos pasan a SKIPPED.
6. **Invariantes**:
   - `environment = TEST` siempre;
   - 0 inserciones MariaDB para todos los kinds, incluidos `RETURN_EVENT`/`SPECIAL_OPS_EVENT`;
   - correlativos solo por `reserveDteControlNumberBlock` en TEST;
   - sin usuarios creados en la base cliente;
   - auditoría en las filas `PlatformDteMhTestRun*`.
7. **Cantidades**: el preset MF 2.0 produce 90/75/50/90/25 DTE y 5/5/5/(5) eventos, en corridas de ≤ 200 ítems.

## 6. Certificación MH TEST real (IMP20-036)

**Prerrequisitos:**

- IMP20-035 en verde;
- disponibilidad de MH TEST con los schemas 2.0;
- autorización explícita del operador (texto de confirmación existente);
- emisor TEST con `mh_spec_profile = MH_2_0`;
- dry-run territorial OK.

| Bloque | Cantidad (MF 2.0 p. 79) | Observación |
|---|---|---|
| FE 01 | 90 | Incluye consumidor final e identificado |
| CCF 03 | 75 | Base para la NC |
| NC 05 | 50 | Sobre CCF v4 aceptados |
| FEX 11 | 90 | Primero servicios; bienes cuando existan CAT-028/033 |
| FSE 14 | 25 | Sin retención del 1 % |
| Invalidación | 5 | Sobre FE identificada y CCF. Ajustar al plazo vigente en TEST. |
| Contingencia | 5 | **Solo si se resuelve INC-005** o si MH TEST acepta v4 |
| Retorno | 5 | **Solo con endpoint (MT-GAP-001)** |
| OE | 5 | Solo con un emisor autorizado (MH20-063/088) |

**Evidencia:** acta por emisor en el Control Plane, con cantidades ACCEPTED, OBSERVED y REJECTED, y la reconciliación de los UNCERTAIN.

## 7. Comandos de validación por PR

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npx vitest run src/modules/commerce/dte src/modules/platform/dte-onboarding src/modules/commerce/purchases
npm run dte:certify
npm run build
```

## 8. Criterios de salida

| Nivel | Criterio |
|---|---|
| Implementación lista | Golden 1.2 intactos. Unitarias e integración en verde en los dos perfiles. Tests de aislamiento en verde. |
| Activación TEST | Lo anterior, más M1 aplicada en la base y el dry-run territorial OK |
| Activación PRODUCTION | Lo anterior, más el acta MH TEST, los bloqueos de activación resueltos (`04-bloqueos-activacion.md`) y `accepts_mh20` confirmado por el receptor MariaDB |
