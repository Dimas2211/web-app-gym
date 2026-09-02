# Cierre técnico — TrustMe FSE14 TEST (Runtime multiindustria)

Fecha de cierre: 01/09/2026.
Ambiente: TEST. No aplica a PRODUCTION.
Organización: TRUSTME-0001 — primer cliente validado sobre el Runtime Database Router.

## 1. Resumen ejecutivo

Se completó y validó de extremo a extremo el flujo fiscal FSE 14 (compras
sujetas a retención de renta) para el runtime **TrustMe**, corriendo sobre la
**plataforma base multiindustria** a través del **Runtime Database Router**
(no sobre la base Prisma global de la instancia GYM). El DTE fue generado,
validado contra el schema oficial de Hacienda, firmado con el firmador TEST
remoto, transmitido a Hacienda TEST, aceptado (`ACCEPTED`), y entregado a la
base MariaDB externa del cliente. No se tocó PRODUCTION en ningún paso.

Este cierre confirma que el patrón runtime-aware (una base de datos por
cliente, resuelta dinámicamente por el Runtime Database Router en lugar del
Prisma Client global) es viable para el ciclo fiscal completo de compras, y
deja la base para extender el mismo patrón a otros clientes runtime.

## 2. Alcance probado

Flujo cubierto (ver también docs/modules/dte-signer-routing-runbook.md para el diseño de
routing de firmadores por ambiente que este flujo reutiliza):

1. Auditoría runtime TrustMe (verificación de conexión y esquema del runtime
   antes de operar).
2. Health check del firmador TEST remoto.
3. `CREATE` FSE 14 TEST a partir de un `Purchase` existente en el runtime.
4. `GENERATE` del `json_document`.
5. `VALIDATE` contra el schema oficial MH `fse-14.schema.json`.
6. `SIGN` con el firmador remoto TEST.
7. `TRANSMIT` a Hacienda TEST.
8. `DELIVER` a la base MariaDB externa del cliente.
9. `VERIFY` final — estado `ACCEPTED` confirmado.

Fuera de alcance de este cierre (no probado ni tocado):

- PRODUCTION, en cualquiera de sus formas (firmador, endpoint MH, datos).
- Escritura runtime-aware desde la UI (`/dashboard/dte/outgoing` sigue
  siendo solo lectura runtime-aware; ver §8).
- Otros tipos de DTE sobre runtime (FE 01, CCFE 03, NC 05) — el cierre
  previo de esos tipos fue sobre la instancia GYM, no sobre runtime.

## 3. Evidencia del DTE aceptado

| Campo | Valor |
|---|---|
| DTE id | `1993feba-4a00-433d-bc5f-ca060007b97e` |
| Tipo DTE | 14 — FSE |
| Ambiente interno | TEST |
| Ambiente JSON MH | `00` |
| Control number | `DTE-14-M001P001-000000000020004` |
| Generation code | `A5C70414-49B4-4F88-80DF-8B66221FA645` |
| Purchase id | `a1229eb3-48a7-4cd3-8af3-cd129c945dce` |
| Purchase code | `8` |
| Proveedor | DANIEL ESCALANTE MEJIA |
| Total compra | 333.33 |
| Retención renta | 33.33 |
| Total a pagar | 300.00 |
| Estado final DTE | `ACCEPTED` |

Respuesta de Hacienda TEST:

```
mhEstado       = PROCESADO
codigoMsg      = 001
descripcionMsg = RECIBIDO
selloRecibido  = 2026795F691CBB2547F285D54AC1E41FE69DWLQH
```

## 4. Evidencia del delivery externo (MariaDB)

```
database     = tecnicodhcp_db_fe
table        = dtes_trustme
insertId     = 15
affectedRows = 1
```

Delivery ejecutado **después** de confirmado el `ACCEPTED`. El `dte_status`
permaneció `ACCEPTED` después del delivery — el insert externo no alteró el
estado fiscal del documento.

## 5. Qué NO se tocó

- No se tocó PRODUCTION en ningún punto del flujo.
- No se usó el endpoint MH de producción.
- No se usó el firmador de producción.
- No se volvió a firmar el documento después de `SIGN`.
- No se retransmitió a MH después de `ACCEPTED`.
- No se imprimieron secrets ni credenciales.
- No se imprimió el `signed_jws` completo en ningún log ni salida.
- No se guardó el JWS en archivo local.
- No se modificó `schema.prisma`, no se crearon migraciones, no se
  ejecutaron seeds.
- No se tocó UI, servicios productivos ni lógica de negocio existente.

**No se debe volver a correr `TRANSMIT EXECUTE` ni `DELIVER EXECUTE` para
este mismo DTE** — ya está `ACCEPTED` y ya tiene un delivery exitoso
registrado; repetir esos pasos sería un reenvío/reentrega duplicada.

## 6. Runners usados

- `prisma/scripts/audit-trustme-dte-runtime.ts` — audita el runtime TrustMe
  (conexión, esquema, datos base) antes de operar sobre él.
- `prisma/scripts/health-check-dte-signer-test.ts` — health check del
  firmador TEST remoto, sin firmar ni transmitir nada real.
- `prisma/scripts/fse14-test-purchase-runner.ts` — ejecuta el ciclo completo
  CREATE → GENERATE → VALIDATE → SIGN → TRANSMIT → DELIVER → VERIFY para un
  FSE 14 TEST sobre una `Purchase` del runtime.

Estos tres runners quedaron **pendientes de commit explícito** (no usar
`git add .`). No deben commitearse junto con este cambio:

- `gym_system_db_before_dte_alignment.backup`
- `prisma/scripts/reset-user-password.ts`
- `.env*`
- `*.backup`
- `*.jws`

## 7. Variables requeridas (sin valores)

Firmador TEST (routing por ambiente, ver
docs/modules/dte-signer-routing-runbook.md):

- `DTE_SIGNER_URL_TEST`
- `DTE_SIGNER_TIMEOUT_MS`
- `DTE_SIGNER_API_KEY` *(requerida por el firmador; valor no documentado
  aquí)*

Hacienda (MH) TEST:

- credenciales de autenticación MH TEST del emisor TrustMe *(no
  documentadas aquí)*

Delivery externo MariaDB:

- `EXTERNAL_DTE_MARIADB_HOST` / puerto / base de datos
- `EXTERNAL_DTE_MARIADB_USER`
- `EXTERNAL_DTE_MARIADB_PASSWORD` *(no documentada aquí)*

Runtime Database Router (conexión al runtime TrustMe):

- credenciales/connection string del runtime TrustMe, resueltas por el
  router — no se documentan valores aquí.

## 8. Decisiones arquitectónicas

### 8.1 Firmador: una instancia por certificado/ambiente, no multi-NIT por instancia

El firmador oficial de Hacienda **no debe asumirse como multi-certificado
por NIT** dentro de una misma instancia corriendo. El patrón correcto para
multiempresa/multi-NIT es una instancia de firmador dedicada por
certificado/ambiente:

- Cliente A TEST → firmador TEST Cliente A
- Cliente A PRODUCTION → firmador PROD Cliente A
- Cliente B TEST → firmador TEST Cliente B
- Cliente B PRODUCTION → firmador PROD Cliente B

Las variables globales `DTE_SIGNER_URL_TEST` / `DTE_SIGNER_URL_PRODUCTION`
(ver docs/modules/dte-signer-routing-runbook.md) sirven para la etapa actual con
TrustMe como único cliente runtime activo, pero **no escalan** a
multi-cliente real. Pendiente futuro: diseñar un `SignerProfile` (o
configuración equivalente) resuelto por tenant/emisor/ambiente a partir de
`DteIssuerConfig`/`DteCredential`, en lugar de depender de una variable
global por ambiente.

### 8.2 UI runtime-aware: lectura sí, escritura todavía no

`/dashboard/dte/outgoing` ya lista DTEs runtime-aware en modo lectura. El
botón "Enviar DTE externo" de esa pantalla **sigue usando el Prisma Client
global** y no debe habilitarse a la fuerza dentro de "Operar como cliente",
porque ese modo es intencionalmente read-only. Para operación multi-cliente
real hace falta diseñar escrituras runtime-aware con permisos específicos
propios — no apagar el read-only global existente como atajo.

## 9. Riesgos y pendientes

1. El `SignerProfile` por tenant/emisor/ambiente no existe todavía — con un
   segundo cliente runtime en TEST simultáneo, la variable global de
   firmador dejaría de ser suficiente.
2. Las escrituras runtime-aware (generar, validar, firmar, transmitir,
   entregar externo) no están diseñadas — hoy ese ciclo solo corre vía
   runner de soporte, no desde UI operativa.
3. Falta decidir explícitamente qué parte de este ciclo queda permanentemente
   como runner de soporte (uso interno/operación asistida) y qué parte debe
   migrar a UI operativa para el cliente final.
4. Limpieza pendiente de variables sensibles locales usadas durante la
   validación.

## 10. Próximo paso recomendado

Antes de repetir este flujo con un segundo cliente runtime o de avanzar
hacia producción:

1. Validar el código de los tres runners (`tsc --noEmit`, `eslint`) y
   commitearlos explícitamente (sin `git add .`, excluyendo los archivos
   listados en §6).
2. Documentar formalmente el corte runner-de-soporte vs. UI-operativa (§9.3).
3. Diseñar el `SignerProfile` por tenant/emisor/ambiente (§8.1) antes de
   incorporar un segundo cliente runtime en TEST.
4. Diseñar las escrituras runtime-aware con permisos propios (§8.2) como
   condición previa a habilitar cualquier acción de escritura DTE fuera del
   runner de soporte.
5. Solo después de lo anterior, preparar un checklist de primer flujo
   productivo separado — este cierre es exclusivamente TEST.
