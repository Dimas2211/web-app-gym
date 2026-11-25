# MH 2.0, Fase 7: impacto comercial y datos maestros

Fecha: 2026-11-24 · Rama `feat/mh-normativa-2.0` · HEAD `b682b70` · sin commit. Interruptor `DTE_MH20_PROFILE_ENABLED` **OFF**.

**Veredicto: FASE_7_PARTIAL.** Todo lo implementable localmente quedó hecho. Lo que falta depende de bloqueos externos:

- MT-GAP-001: no hay endpoint para el Retorno.
- COR-01: falta la decisión interna.
- COR-03: falta resolución de la AT.

También queda pendiente la captura comercial de bienes para FEX 2.0.

## 1. Tareas IMP20 de la fase

| Tarea | Estado | Resumen |
|---|---|---|
| IMP20-011 | IMPLEMENTED | Códigos AT del emisor: advertencia en la UI y bloqueo 2.0 antes de reservar el correlativo |
| IMP20-028 | IMPLEMENTED | Vista previa territorial 2.0 en emisor, clientes y proveedores |
| IMP20-030 | PARTIAL | Servicio de efectos comerciales del Retorno y consulta trazable. Sin acción de operador (MT-GAP-001) |
| IMP20-017 | PARTIAL | Bienes FEX 2.0 siguen bloqueados por falta de captura CAT-033/CAT-028 |
| IMP20-039 | PARTIAL | COR-01 preparada como tarea independiente; COR-03 bloqueada |

Conteo de las 39 tareas: IMPLEMENTED 22 · PARTIAL 12 · NOT_STARTED 4 · DEFERRED 1 (ver `07-task-status.json`).

## 2. Consumidores revisados

| Consumidor | Impacto 2.0 | Acción |
|---|---|---|
| Ventas FE/CCF (`dte-outgoing.service.ts`) | Códigos AT y perfil | Guarda antes de `reserveDteControlNumber` |
| NC (`create-credit-note-dte.service.ts`) | Ídem | Guarda antes de reservar |
| FSE (`createPendingDteForPurchase`) | `ivaRete1` (Fase 6) y códigos AT | Códigos AT añadidos a la validación previa |
| FEX (`export-sale.service.ts`) | Ídem | Guarda en `loadActiveIssuerConfigOrError`, **antes de crear y confirmar la venta**, para no dejar una venta confirmada sin DTE |
| Compras / inventario / caja | Solo a través del Retorno | Efectos explícitos con los servicios canónicos, sin cambios en esos módulos |
| Reportes (`commerce/reports`) | Comerciales por `sale_date`; no hay libro de IVA | Sin cambios. La consulta de Retornos expone la fecha fiscal (`fecEmi`) separada de los timestamps administrativos |
| Clientes / proveedores / emisor | Proyección territorial | Vista previa informativa |
| Productos / servicios | Ninguno nuevo (CAT-014 ya existe) | Sin cambios |

Los builders 2.0 de Fase 6 ya cubren campos obligatorios, observaciones explícitas, retenciones/percepciones, totales, NC, documentos relacionados y FSE. La Fase 7 no los modifica. Su cobertura sigue en `mh20-phase6.test.ts` y `mh20-fixtures.test.ts`.

## 3. Datos maestros (IMP20-028 / IMP20-011)

- `components/mh-territory-preview.tsx` muestra la proyección canónica (departamento CAT-012, municipio CAT-013, distrito):
  - avisa cuando el código 2.0 difiere del 1.2 (Cabañas);
  - avisa cuando la etiqueta cambió;
  - si la combinación no es válida, muestra un mensaje ámbar con su causa.
- **No bloquea**, no escribe ni añade columnas, y no altera los snapshots de documentos emitidos. Solo la emisión 2.0 rechaza el dato (R20-TERR-01).
- Para que el componente cliente no importe Prisma, la proyección se separó en `utils/dte-territory-projection.pure.ts`. `dte-territory-projection.ts` reexporta y conserva `resolveMhTerritory20`.
- El establecimiento y el POS usan la dirección del emisor. Los receptores de exportación y los sujetos excluidos usan los maestros Customer/Supplier.

## 4. Validación 2.0 antes de reservar correlativo (§11)

`services/mh20-pre-reservation-guard.ts`:

- `ensureMh20ReadyBeforeReservation` resuelve el perfil del emisor y comprueba que la generación esté permitida.
- Con MH_2_0 exige la estructura AT `^[MSBP]\d{3}$` / `^P\d{3}$`.
- Con el interruptor OFF devuelve MH_1_2 **sin consultar la BD**, de modo que el comportamiento 1.2 queda idéntico.
- Si se rechaza, la transacción aborta antes de reservar: no se consume correlativo ni queda un DTE incompleto.

## 5. Retorno: efectos comerciales (IMP20-030)

`services/dte-return-commercial-effects.service.ts` (`applyReturnCommercialEffects`):

| Efecto | Implementación |
|---|---|
| Retorno fiscal | Ciclo `DteReturnEvent` (Fases 6 y 6.1); este servicio no lo toca |
| Devolución física | Opcional y explícita (`restock`): `RETURN_IN` para venta 01/11 y `RETURN_OUT` para FSE 14, con `recordInventoryMovement`. Solo líneas stockables (snapshot de la venta, o `Product.is_stockable` para FSE) |
| Reembolso | Opcional y explícito (`refund`): `REFUND_OUT` para venta y `MANUAL_IN` para FSE, con `recordCashMovement` en una sesión OPEN. Importe > 0 y ≤ `total_returned` |
| Ajuste CxC / CxP | `NOT_SUPPORTED`: no existe ese módulo |
| Reportes | `queries/get-return-events-by-dte.ts`: periodo fiscal desde `fecEmi`; solo los ACCEPTED cuentan para los acumulados; la venta original sigue visible |

Precondiciones:

- Retorno `ACCEPTED` con sello.
- Sin invalidación SIGNED, SENT o ACCEPTED.
- Scope tenant/location.
- Ambiente TEST sin efectos, salvo opt-in explícito.

El servicio nunca invalida ni modifica el DTE original (`originalDteModified: false`).

Idempotencia por efecto:

- inventario: `reference_entity = dte_return_event`, `reference_id = <id>:<no_item>`;
- caja: `reference = DTE-RET:<codigoGeneracion>`.

Los servicios canónicos abren su propia transacción, así que cada efecto es atómico por separado. Si alguno falla, el resultado es `PARTIAL` con la evidencia de cada efecto, y al re-ejecutar se aplican solo los faltantes (reconciliación).

## 6. COR-01

Ver `decisiones/COR-01-reinicio-anual.md`:

- un test de caracterización;
- el helper puro `utils/dte-fiscal-year.ts`, **no conectado**;
- el plan de pruebas y la migración M-COR-01 propuesta.

No se modificaron secuencias, constraints ni `dte-correlative.service.ts`. COR-03 sigue bloqueado.

## 7. Riesgos

- **Carrera en efectos del Retorno.** Dos ejecuciones simultáneas del mismo Retorno podrían duplicar un efecto entre la comprobación del marcador y el registro. Hoy es una acción manual y no existe aún un caller. Mitigación propuesta al cablear la acción: un advisory lock por `return_id`.
- **Captura FEX 2.0.** Sin captura comercial de régimen y recinto por línea, FEX de bienes con 2.0 sigue bloqueado.
- **Reportes fiscales.** No existe un libro de IVA. Cuando exista, deberá usar `fiscalPeriod` y no `created_at`.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: sin cambios en Fase 7.
- Migraciones nuevas: ninguna.
- Bases tocadas: ninguna. Todas las pruebas usan mocks.
- `DATABASE_URL` y `DIRECT_URL` (ambas `localhost/TrustmeDB`) no se consultaron ni se modificaron.
- Pendiente: lo mismo que en Fase 6, es decir, M1, M1b y M2 sin aplicar en cualquier base real.
