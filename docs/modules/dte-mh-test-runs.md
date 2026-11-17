# DTE — Pruebas de Hacienda TEST desde el onboarding fiscal (DTE-MH-TEST-RUNS)

Estado (2026-11-16): **en producción con la función apagada** (PR #29, merge `2ac97c5`). Migración aplicada y verificada (PASS 19/19) en runtime `vkoyw…` y Control Plane `nygdq…`. `DTE_MH_TEST_RUNS_ENABLED`, `DTE_MH_TEST_TICK_SECRET` y el timer del VPS **no** están configurados: el tick responde 404 y no se procesa ninguna corrida.

Ruta en la UI: Control Plane → Organización → Onboarding fiscal → ambiente TEST → **Pruebas de Hacienda (TEST)**.

## Qué hace

Desde el Control Plane, solo un Platform Admin emite lotes de documentos de prueba en el ambiente **TEST** de Hacienda. Usa el motor DTE real: genera, valida contra el esquema oficial, firma con el firmador del emisor, transmite y consulta.

| Tipo | Escenarios |
|---|---|
| 01 FE | consumidor final, receptor identificado, contingencia |
| 03 CCFE | estándar, contingencia |
| 05 NC | sobre un CCFE de la misma corrida (ya aceptado) |
| 11 FEX | servicios |
| 14 FSE | servicios (sujeto excluido, retención de renta del 10 %) |
| Invalidación | sobre FE identificado o CCFE no usado por una NC |
| Evento de contingencia | agrupa los 01 y 03 de contingencia de la corrida |

**No** crea ventas, compras, clientes, proveedores, inventario, caja ni contabilidad. **No** consume cuota comercial ni medición fiscal (`purpose` distinto de `OPERATIONAL`).

## Barreras (siempre activas, con o sin flag)

1. **Propósito**: `dte_outgoing_documents.purpose` (`OPERATIONAL` | `MH_TEST_CERTIFICATION`).
   - Todas las acciones operativas del runtime (generar/firmar/transmitir/NC/invalidar/reabrir/conciliar/JSON) rechazan documentos de certificación (fail-closed, `utils/dte-document-purpose.ts`).
   - Panel Fiscal, listados, resúmenes y vista de cliente filtran `OPERATIONAL_DTE_WHERE`.
2. **CHECK en base**:
   - un documento de certificación es solo `TEST`, sin `sale_id` ni `purchase_id`;
   - `certification_item_key` solo existe con ese propósito;
   - las corridas solo existen en `TEST`.
3. **Exclusión MariaDB absoluta**: se verifica antes de construir el payload y antes del adaptador, tanto en la entrega DTE como en la invalidación, el worker y el descubrimiento. Si un trabajo de outbox existe por error, queda `CANCELLED` con 0 INSERT y no se reintenta. Las pruebas demuestran 0 INSERT y que la entrega operativa sigue funcionando.
4. **Solo plataforma**:
   - `requireSuperAdmin` en cada acción;
   - el modo "operar como cliente" (solo lectura) bloquea las escrituras;
   - el ambiente no es un parámetro: TEST está forzado;
   - el emisor debe ser TEST.
5. **Una corrida activa por organización**: índice único parcial `platform_dte_mh_test_runs_one_active`.
6. **BUG-2** (incluido): el Evento de Contingencia se autentica con el `DteCredential` de **su** emisor, leído en la misma base runtime. Un evento con documentos de emisores distintos no se transmite, y el emisor queda acotado al tenant/location del evento.

## Correlativos

- El operador elige, por tipo, la **cantidad** por escenario y el **primer correlativo**. La UI muestra el rango y el siguiente disponible.
- `reserveDteControlNumberBlock` reserva el bloque contiguo en la misma fila `dte_correlatives` (lock de fila) que el asignador operativo.
  - Piso = máx(`last_sequence`, máximo usado en `dte_outgoing_documents`, base).
  - Si el primer número ya está usado, devuelve `FIRST_SEQUENCE_ALREADY_USED` con el siguiente disponible y no reserva nada.
- El alta de la fila del correlativo usa `createMany … skipDuplicates`, así que no hay P2002 en la carrera de primera alta.
- Los números reservados **quedan consumidos** aunque la corrida se cancele o un ítem se abandone. No se reutilizan.

## Ejecución

- La corrida se crea en el Control Plane (`platform_dte_mh_test_runs` + `_items`) solo después de validar el plan:
  - Zod;
  - dependencias;
  - receptores ingresados por el operador (no se inventan NIT/DUI);
  - preflight;
  - dry-run de cada escenario contra el esquema oficial;
  - rango contra el siguiente disponible;
  - confirmación escrita `INICIAR PRUEBAS TEST`.
- Avance por **tramos acotados**: el tick HTTPS (`POST /api/platform/dte-mh-test-runs/tick`) o el botón "Avanzar ahora". Presupuesto de 45 s por tick, `maxDuration = 60`.
- **Lease con fencing**:
  - `lease_epoch` es monotónico;
  - cada escritura bloquea la corrida (`FOR UPDATE`) y valida dueño, epoch y vencimiento;
  - un proceso viejo no puede escribir;
  - la transmisión exige un *claim* (`TRANSMITTING` + `claim_epoch`).
- **Recuperación por `certification_item_key`** (`runId:seq`, UNIQUE). Si un tick muere tras materializar, el siguiente encuentra los documentos y no reserva de nuevo. Los eventos de invalidación/contingencia existentes se recuperan por documento (cualquier estado).
- **Incertidumbre**:
  - Un `TRANSMITTING` con lease vencido, o una respuesta ambigua, pasa a `UNCERTAIN` y se consulta a Hacienda (`reconcileDteWithMh`).
  - Solo una respuesta oficial resuelve. Un "no encontrado" inconcluso no se toma como rechazo.
  - Tras 6 consultas pasa a `NEEDS_REVIEW`.
  - Los eventos no tienen servicio de consulta: incertidumbre → `NEEDS_REVIEW`.
- **Nunca** hay retransmisión automática con resultado incierto, documentos sustitutos ni promesa de exactamente-una-vez.
  - Solo se reintenta solo un fallo de autenticación previo al envío (`*_AUTH_FAILED` registrado por el adaptador), hasta 3 veces.
  - Retransmitir es una decisión del operador (`RETRANSMIT_SAME`, con nota): reenvía el **mismo** documento firmado y nunca crea uno nuevo.
- Decisiones del operador:
  - `RETRANSMIT_SAME`;
  - `RETRY_STEP` (solo desde `FAILED`);
  - `ABANDON` (el número queda consumido; un DTE sin firmar se cancela).
- Pausar / Reanudar / Cancelar (`CANCELAR`).
  - Pausar y cancelar se permiten con el flag apagado; crear, avanzar, decidir y reanudar, no.
  - Apagar el flag **no** pausa corridas ni desactiva barreras.
- La identidad auditada es `run.authorized_by` (usuario de plataforma), registrada en el Control Plane. **No necesita existir en la base runtime** (en runtimes SHARED no existe). En el runtime se escribe el mismo id solo si existe en el tenant; si no, `null` en las FK de auditoría nullables (mismo mecanismo que el registro de credenciales del onboarding). Ver `resolveMhTestRuntimeActor` y su prueba de nulabilidad. "Activar TEST" sigue exigiendo el usuario en el runtime (no cambia con esto).

## Configuración

| Variable | Dónde | Uso |
|---|---|---|
| `DTE_MH_TEST_RUNS_ENABLED` | app (Vercel) | `true` exacto habilita; cualquier otro valor deshabilita. |
| `DTE_MH_TEST_TICK_SECRET` | app (Vercel) | ≥ 32 caracteres; sin él el tick responde 404. |
| `DTE_MH_TEST_TICK_BUDGET_MS` | app (opcional) | 20 000–45 000, por defecto 45 000. |
| `MH_TEST_TICK_URL` / `MH_TEST_TICK_TOKEN` | VPS (`/etc/zolvi-dte-mh-test-tick.env`) | Solo URL y token. Ver `ops/dte-mh-test-tick/README.md`. |

## Despliegue (orden obligatorio; nada de esto está ejecutado)

El cliente Prisma nuevo lee y escribe `purpose`, así que **toda** base que use el código nuevo debe tener la migración **antes** del deploy.

1. **Inventario**: listar las bases realmente activas (Control Plane + cada runtime enrutado por `withOrganizationRuntimePrisma`). Se usa la misma lista que el runner de migraciones runtime.
2. **Backup** de cada base (receta de `zolvi-backups/`).
3. `npx prisma migrate deploy` por base, apuntando explícitamente a cada una. La migración es aditiva: `ADD COLUMN` con DEFAULT constante no reescribe la tabla en PG ≥ 11, y los CHECK pasan porque todo queda `OPERATIONAL`.
4. **Compuerta**: `VERIFY_DB_URL=… npx tsx prisma/scripts/verify-dte-purpose-migration.ts` en **cada** base, con resultado `PASS` (19 comprobaciones). Es de solo lectura. Si una falla, no desplegar.
5. Desplegar el código con `DTE_MH_TEST_RUNS_ENABLED` **sin definir**.
6. Verificar en Vercel antes de habilitar:
   - que el plan permite `maxDuration = 60` para funciones Node (en Hobby el tope es menor: ajustar `DTE_MH_TEST_TICK_BUDGET_MS` y `maxDuration`, o no habilitar);
   - la región de la función respecto del Control Plane;
   - que no haya protección de despliegue (Vercel Authentication) delante de `/api/platform/*` que bloquee el tick;
   - que el timeout de la llamada a MH + firmador quepa en un paso (`MIN_STEP` 20 s).
7. Definir `DTE_MH_TEST_TICK_SECRET` y luego `DTE_MH_TEST_RUNS_ENABLED=true`, y redeploy.
8. Instalar el timer en el VPS (`ops/dte-mh-test-tick/`) y hacer un tick manual: `200`, sin corridas.
9. Primera corrida mínima (1 FE consumidor final) con un emisor TEST ya probado en "Prueba de conexión y firma".

## Rollback (conserva las barreras)

- **Detener**: deshabilitar el timer y quitar `DTE_MH_TEST_RUNS_ENABLED`. Pausar o cancelar las corridas activas desde el panel.
- **Código**:
  - Se puede volver a un commit **posterior** a esta rama con el flag apagado.
  - **Nunca** volver a código previo a los filtros de propósito si ya existen documentos `MH_TEST_CERTIFICATION`: aparecerían en el Panel Fiscal, el metering y el worker MariaDB.
  - Si fuera imprescindible, primero confirmar con `verify-dte-purpose-migration.ts` que el conteo de certificación es 0.
- **Base**: no eliminar columnas, enum, CHECK ni tablas. La migración es aditiva y compatible con el código anterior (el DEFAULT cubre los INSERT viejos). No hay migración "down".

## Observaciones conocidas

- **Carrera pre-existente del asignador operativo** (`reserveDteControlNumber`, código no modificado): la primera alta concurrente de una fila `dte_correlatives` (tipo/año nuevo) con `upsert` puede lanzar P2002 en las transacciones perdedoras.
  - Reproducido en PG real: 9 de 10 fallan.
  - No genera números duplicados; la venta falla y puede reintentarse.
  - Fuera de alcance; se sugiere una corrección aparte con `createMany skipDuplicates`, como en el bloque.
- Los DTE de certificación aceptados **sí cuentan** en `MH_TEST_ACCEPTED` del onboarding. Es intencional: prueban el firmador + credencial del emisor.
- La prueba pre-existente `dte-internal-certification.test.ts > INVALIDATION > Incompatible invalidation blocked` ya fallaba en `f63853c`, antes de esta rama.
- Límite: 200 ítems por corrida; 5 corridas por tick.

## Archivos principales

- Runtime (commerce): `src/modules/commerce/dte/mh-test-runs/`
  - `mh-test-scenarios.ts`;
  - `mh-test-documents.service.ts`;
  - `utils/dte-document-purpose.ts`;
  - `reserveDteControlNumberBlock` en `services/dte-correlative.service.ts`;
  - constructores puros en `generate-fe-json.service.ts` / `generate-ccfe-json.service.ts` (refactor; revisar con `git diff -w`).
- Control Plane: `src/modules/platform/dte-onboarding/mh-test-runs/`
  - planner, repository, engine, runtime-port, service, flags;
  - acciones en `src/modules/platform/actions/mh-test-run.action.ts`;
  - UI en `src/modules/platform/components/platform-mh-test-runs-section.tsx`.
- Tick: `src/app/api/platform/dte-mh-test-runs/tick/route.ts`; plantillas en `ops/dte-mh-test-tick/`.
- Migración: `prisma/migrations/20261116000000_dte_mh_test_runs/`; verificación en `prisma/scripts/verify-dte-purpose-migration.ts`.
- Pruebas PG reales (opcionales): `MH_TEST_PG_URL=<base desechable> npx vitest run mh-test-runs.pg`.
