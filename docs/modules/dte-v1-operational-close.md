# DTE V1 — Cierre técnico-operativo

## Estado

**Módulo `commerce/dte` V1 cerrado operativamente.**

FE 01, CCFE 03, NC 05 e Invalidación probados end-to-end en ambiente TEST del Ministerio de Hacienda de El Salvador. Todos los documentos fueron aceptados con sello recibido y entregados al sistema externo MariaDB. El flujo es operable directamente desde `/dashboard/sales` mediante el Panel Fiscal DTE.

---

## 1. Arquitectura final

### Separación de módulos

```
commerce/sales      → operación comercial interna
                      crea y confirma ventas
                      descuenta inventario (SALE_OUT)
                      expone Panel Fiscal DTE en /dashboard/sales
                      NO firma, NO transmite, NO contiene lógica fiscal
                      consume actions de commerce/dte vía Server Actions

commerce/dte        → documento fiscal electrónico
                      generación JSON (FE 01, CCFE 03, NC 05)
                      validación contra JSON Schemas oficiales MH (AJV)
                      firma electrónica vía firmador local
                      transmisión a API Hacienda (TEST / PRODUCCIÓN)
                      invalidación fiscal
                      delivery externo a MariaDB
                      estado fiscal independiente de Sale.status

commerce/inventory  → stock real por location
                      se ejecuta antes del DTE (SALE_OUT al confirmar)
                      el flujo DTE NO modifica inventario

commerce/cash       → pagos y sesiones de caja (pendiente)

sistema externo     → PDF, envío por email, archivo documental
                      recibe los DTEs aceptados desde MariaDB
```

### Regla crítica de separación

`commerce/sales` consume actions de `commerce/dte` pero **no contiene lógica fiscal**. Todo el ciclo de generación, validación, firma, transmisión, invalidación y delivery vive en `commerce/dte`.

---

## 2. Documentos DTE probados y aceptados en MH TEST

| Tipo | Código | Descripción | Estado MH |
|------|--------|-------------|-----------|
| Factura Electrónica | FE 01 | Consumidor final | ACCEPTED (PROCESADO) |
| Comprobante de Crédito Fiscal | CCFE 03 | Receptor fiscal con NRC | ACCEPTED (PROCESADO) |
| Nota de Crédito | NC 05 | Desde CCFE 03 aceptado | ACCEPTED (PROCESADO) |
| Invalidación | Anulación | DTE sin relaciones | ACCEPTED |

---

## 3. Flujo end-to-end confirmado por tipo

### FE 01

```
Venta confirmada
  → DteOutgoingDocument PENDING_GENERATION
  → JSON FE 01 generado (montos con IVA incluido)
  → Validado contra schema oficial (AJV)
  → SCHEMA_VALIDATED
  → POST /firmardocumento/  → signed_jws recibido
  → SIGNED
  → POST /seguridad/auth   → token Bearer cacheado
  → POST /fesv/recepciondte
  → ACCEPTED — mh_seal guardado
  → Delivery a MariaDB (tabla DTE)
  → UI mostrando estado ACCEPTED + sello + badges
```

Corrección confirmada durante pruebas: el receptor FE 01 consumidor final NO genera `receptor: null`.
Se construye un objeto receptor con `nombre: "Consumidor Final"` y campos mínimos válidos.

### CCFE 03

```
Venta confirmada + cliente con NIT/NRC/actividad completos
  → DteOutgoingDocument PENDING_GENERATION
  → JSON CCFE 03 generado (montos sin IVA, tributo "20" por línea)
  → Validado contra schema oficial (AJV)
  → SCHEMA_VALIDATED
  → Firma → SIGNED
  → Transmisión → ACCEPTED — mh_seal guardado
  → Delivery a MariaDB (tabla DTE)
```

### NC 05 (Nota de Crédito)

```
CCFE 03 en estado ACCEPTED
  → DteDocumentRelation CREDIT_NOTE_OF creado
  → JSON NC 05 generado
      - Usa montos positivos (no negativos)
      - Usa tributos ["20"] y resumen.tributos
      - No usa ivaItem ni totalIva
      - Schema: fe-nc-v3
  → Validado (AJV)
  → Firma → SIGNED
  → POST /fesv/recepciondte → ACCEPTED — mh_seal guardado
  → Delivery a MariaDB (tabla DTE)
```

### Invalidación

```
DTE en estado ACCEPTED (sin documentos relacionados activos)
  → DteInvalidationEvent DRAFT creado
  → event_json generado contra anulacion-schema-v2
  → Firma del evento de invalidación
  → POST /fesv/anulardte
  → Si DTE tiene relaciones: REJECTED por Hacienda (controlado)
  → Si DTE limpio: ACCEPTED
  → DteOutgoingDocument.dte_status = INVALIDATED
  → DteOutgoingDocument.invalidated_at poblado
  → DteTransmissionLog INVALIDATE creado
  → Delivery de invalidación a MariaDB (tabla invalidaciones)
```

---

## 4. Endpoints MH confirmados

### Autenticación

```
POST /seguridad/auth
Content-Type: application/x-www-form-urlencoded
Body: user=<DTE_MH_USER>&pwd=<DTE_MH_PASSWORD>
Respuesta: { "body": { "token": "..." } }
```

El token se cachea en memoria del servidor. No se persiste en base de datos. No se expone al cliente.

### Firma (firmador local)

```
POST /firmardocumento/
Content-Type: application/json
Body: { "nit": "...", "activo": true, "passwordPri": "...", "dteJson": "{...}" }
Respuesta: { "status": "OK", "body": "<JWS>" }
```

### Transmisión de DTE

```
POST /fesv/recepciondte
Content-Type: application/json
Authorization: Bearer <token>
Body: { "ambiente": "00", "idEnvio": N, "version": 1, "tipoDte": "01|03|05", "documento": "<JWS>", "codigoGeneracion": "<UUID>" }
Respuesta aceptada: { "estado": "PROCESADO", "selloRecibido": "...", ... }
```

### Invalidación

```
POST /fesv/anulardte
Content-Type: application/json
Authorization: Bearer <token>
Body: { "ambiente": "00", "idEnvio": N, "version": 1, "documento": "<JWS evento invalidación>" }
```

### Delivery externo DTE (MariaDB)

```
INSERT INTO <EXTERNAL_DTE_MARIADB_TABLE>
Payload: { ...json_document, codigoEmpresa, responseMH, token }
```

### Delivery externo invalidación (MariaDB)

```
INSERT INTO <EXTERNAL_DTE_MARIADB_INVALIDATION_TABLE>
Payload: { ...event_json, codigoEmpresa, responseMH, token }
```

---

## 5. Variables de entorno requeridas

### Firmador local

| Variable | Descripción |
|----------|-------------|
| `DTE_SIGNER_URL` | URL base del firmador local (ej: `http://localhost:8113`) |
| `DTE_SIGNER_TIMEOUT_MS` | Timeout del firmador en milisegundos |
| `DTE_SIGNER_NIT` | NIT del emisor — debe coincidir con el certificado instalado |
| `DTE_SIGNER_PASSWORD` | Contraseña del certificado del emisor |

### API Ministerio de Hacienda

| Variable | Descripción |
|----------|-------------|
| `DTE_ENVIRONMENT` | `00` pruebas / `01` producción |
| `DTE_MH_USER` | Usuario API del contribuyente en portal Hacienda |
| `DTE_MH_PASSWORD` | Contraseña del usuario API de Hacienda |
| `DTE_MH_AUTH_URL_TEST` | URL de autenticación TEST |
| `DTE_MH_RECEPTION_URL_TEST` | URL de recepción TEST |
| `DTE_MH_TIMEOUT_MS` | Timeout de llamadas MH en milisegundos |

### MariaDB externa

| Variable | Descripción |
|----------|-------------|
| `EXTERNAL_DTE_MARIADB_ENABLED` | `true` para activar delivery externo |
| `EXTERNAL_DTE_MARIADB_HOST` | Host del servidor MariaDB externo |
| `EXTERNAL_DTE_MARIADB_PORT` | Puerto (default `3306`) |
| `EXTERNAL_DTE_MARIADB_USER` | Usuario de la base de datos |
| `EXTERNAL_DTE_MARIADB_PASSWORD` | Contraseña del usuario |
| `EXTERNAL_DTE_MARIADB_DATABASE` | Nombre de la base de datos |
| `EXTERNAL_DTE_MARIADB_TABLE` | Tabla destino de DTEs aceptados |
| `EXTERNAL_DTE_MARIADB_INVALIDATION_TABLE` | Tabla destino de invalidaciones aceptadas |
| `EXTERNAL_DTE_MARIADB_TIMEOUT_MS` | Timeout de conexión MariaDB |

**Aclaración crítica:** `DTE_SIGNER_PASSWORD` y `DTE_MH_PASSWORD` son credenciales completamente distintas. La primera corresponde al certificado del emisor instalado en el firmador local. La segunda corresponde al usuario API registrado en el portal de Hacienda.

**Regla de seguridad:** `.env` no se sube al repositorio. Solo `.env.example` queda documentado. No commitear certificados, llaves privadas, ni tokens.

---

## 6. Reglas fiscales importantes

### numeroControl

- Formato: `DTE-{tipoDte(2)}-{cod_estable_mh(4)}{cod_punto_venta_mh(4)}-{secuencia(15 dígitos)}`
- Ejemplo: `DTE-01-M001P001-000000000000001`
- Longitud fija: 31 caracteres.
- No hay guion entre el código de establecimiento y el código de punto de venta. Se concatenan.
- El año **no** forma parte del `numeroControl` — solo se usa en `DteCorrelative` para particionar la secuencia internamente.

### Alineación obligatoria del emisor

`DteIssuerConfig.nit`, `DTE_SIGNER_NIT` y el certificado instalado en el firmador deben corresponder al mismo contribuyente. Cualquier desalineación genera firma inválida y rechazo por Hacienda.

### FE 01 — montos con IVA incluido

- `precioUni` = precio unitario con IVA incluido.
- `ventaGravada` = (cantidad × precioUni) − descuento de línea.
- `ivaItem` = ventaGravada × (0.13 / 1.13) — IVA extraído del total (dato informativo).
- `totalIva` **no** se suma a `montoTotalOperacion`. Los montos FE 01 ya incluyen IVA.
- FE 01 no usa `tributos` por línea ni `resumen.tributos`.
- El receptor consumidor final NO es `null` — se construye objeto con `nombre: "Consumidor Final"`.

### CCFE 03 — montos sin IVA

- `precioUni` = precio unitario sin IVA.
- `ventaGravada` = (cantidad × precioUni) − descuento de línea.
- `ivaItem` no se usa en CCFE 03.
- `tributos` por línea = `["20"]` (código IVA).
- `resumen.tributos` = `[{ codigo: "20", descripcion: "IVA 13%", valor: IVA calculado }]`.
- `montoTotalOperacion` = base + IVA calculado (el IVA sí se suma en CCFE 03).
- Requiere receptor con NIT, NRC, actividad económica y dirección completos.

### NC 05 — Nota de Crédito

- Solo se genera desde CCFE 03 en estado ACCEPTED.
- Usa montos positivos (no negativos).
- Usa `tributos: ["20"]` por línea y `resumen.tributos`.
- No usa `ivaItem` ni `totalIva`.
- Schema oficial: `fe-nc-v3`.

### Invalidación

- `codigoGeneracionR = null` para invalidación tipo 2 (rescindir operación).
- Un DTE con documentos relacionados activos puede ser rechazado por Hacienda al intentar invalidarlo. Este caso está controlado y registrado como `DteInvalidationEvent.status = REJECTED`.

---

## 7. Estados utilizados

### DteOutgoingDocument.dte_status

| Estado | Descripción |
|--------|-------------|
| `PENDING_GENERATION` | Registro DTE creado. JSON no construido. |
| `GENERATED` | JSON DTE construido internamente. |
| `SCHEMA_VALIDATED` | JSON validado contra schema MH oficial (AJV). |
| `SIGNED` | Documento firmado — `signed_jws` recibido del firmador. |
| `ACCEPTED` | Hacienda emitió sello — `mh_seal` guardado. |
| `REJECTED` | Hacienda rechazó — `mh_response` guardado completo. |
| `OBSERVED` | Hacienda procesó con observaciones. |
| `INVALIDATION_PENDING` | Invalidación iniciada, pendiente de respuesta MH. |
| `INVALIDATED` | DTE invalidado ante Hacienda. `invalidated_at` poblado. |

### DteInvalidationEvent.status

| Estado | Descripción |
|--------|-------------|
| `DRAFT` | Evento creado, sin firmar. |
| `SIGNED` | Evento de invalidación firmado. |
| `SENT` | Enviado a `/fesv/anulardte`. |
| `ACCEPTED` | Hacienda aceptó la invalidación. |
| `REJECTED` | Hacienda rechazó la invalidación (ej: DTE con relaciones). |
| `CANCELLED` | Invalidación cancelada localmente. |

### DteTransmissionLog.operation_type

| Tipo | Descripción |
|------|-------------|
| `SIGN` | Intento de firma con el firmador local. |
| `SEND` | Transmisión de DTE a Hacienda. |
| `INVALIDATE` | Transmisión de evento de invalidación. |
| `EXTERNAL_DELIVERY` | Delivery de DTE aceptado a MariaDB externa. |
| `EXTERNAL_INVALIDATION_DELIVERY` | Delivery de invalidación aceptada a MariaDB externa. |

---

## 8. Delivery externo MariaDB

### DTEs normales

**Tabla:** `EXTERNAL_DTE_MARIADB_TABLE`

**Payload:**

```json
{
  "...json_document completo...",
  "codigoEmpresa": "<NRC del emisor>",
  "responseMH": "<respuesta de Hacienda>",
  "token": "<signed_jws>"
}
```

Donde:
- `token` = `signed_jws` del DTE firmado.
- `codigoEmpresa` = NRC del emisor desde `DteIssuerConfig`.
- `responseMH` = respuesta recibida de Hacienda.

### Invalidaciones

**Tabla:** `EXTERNAL_DTE_MARIADB_INVALIDATION_TABLE`

**Payload:**

```json
{
  "...event_json completo...",
  "codigoEmpresa": "<NRC del DTE original>",
  "responseMH": "<respuesta de invalidación de Hacienda>",
  "token": "<signed_jws del evento de invalidación>"
}
```

Donde:
- `token` = `signed_jws` del evento de invalidación firmado.
- `codigoEmpresa` = se toma del DTE original.
- `responseMH` = respuesta recibida de Hacienda al anular.

---

## 9. Seguridad

### Nunca se expone en UI ni en logs

- `signed_jws` completo.
- `token` de autenticación MH.
- `json_document` completo.
- `event_json` completo.
- Credenciales de MariaDB.
- Credenciales de Hacienda (`DTE_MH_PASSWORD`).
- Contraseña del certificado (`DTE_SIGNER_PASSWORD`).
- `passwordPri` del firmador.

### Reglas activas

- El token MH vive solo en memoria del servidor — no se persiste ni se envía al browser.
- `DteTransmissionLog` guarda solo respuestas sanitizadas (sin tokens ni keys).
- `mh_response` en `DteOutgoingDocument` se guarda sanitizado.
- `.env` no se commitea al repositorio.
- Certificados y llaves privadas no se commitean.
- La autorización para operar DTE se valida en la Server Action, no solo en UI.

---

## 10. UI operativa en /dashboard/sales

### Panel Fiscal DTE

El Panel Fiscal DTE se muestra en el panel de detalle de la venta seleccionada (`sale-dte-fiscal-panel.tsx`). Incluye:

| Campo visible | Descripción |
|---------------|-------------|
| Estado fiscal | Badge con color según estado (`ACCEPTED`, `REJECTED`, `INVALIDATED`, etc.) |
| Tipo DTE | FE 01 / CCFE 03 / NC 05 |
| Sello MH | `mh_seal` recibido de Hacienda |
| Número de control | `control_number` del DTE |
| Código de generación | `generation_code` (UUID del DTE) |
| NC relacionada | Si existe `DteDocumentRelation CREDIT_NOTE_OF`, muestra la NC |
| Invalidación relacionada | Si existe `DteInvalidationEvent`, muestra estado y tipo |
| Entrega externa DTE | Badge: enviado / error / no enviado |
| Entrega externa invalidación | Badge: enviado / error / no enviado |

### Botones contextuales

Los botones se muestran u ocultan según el estado fiscal actual:

| Acción | Condición |
|--------|-----------|
| Generar DTE | Venta CONFIRMED + sin DTE activo |
| Generar JSON | DTE en PENDING_GENERATION |
| Validar schema | DTE en GENERATED |
| Firmar | DTE en SCHEMA_VALIDATED |
| Transmitir | DTE en SIGNED |
| Crear NC 05 | DTE CCFE 03 en ACCEPTED + sin NC activa |
| Invalidar | DTE ACCEPTED + sin invalidación activa |
| Enviar a sistema externo | DTE ACCEPTED + entrega no enviada |
| Enviar invalidación a externo | Invalidación ACCEPTED + entrega no enviada |

Las acciones inválidas están bloqueadas — no se muestran en estados incompatibles.

---

## 11. Archivos implementados (resumen)

### Generación JSON

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/services/generate-fe-json.service.ts` | JSON FE 01 |
| `src/modules/commerce/dte/services/generate-ccfe-json.service.ts` | JSON CCFE 03 |
| `src/modules/commerce/dte/services/generate-nc-json.service.ts` | JSON NC 05 |
| `src/modules/commerce/dte/services/build-invalidation-event-json.service.ts` | JSON evento invalidación |
| `src/modules/commerce/dte/utils/dte-control-number.ts` | Construcción de `numeroControl` |
| `src/modules/commerce/dte/utils/numero-a-letras.ts` | `totalLetras` |
| `src/modules/commerce/dte/utils/fiscal-id.utils.ts` | Normalización NIT/NRC |

### Validación schema

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/services/validate-dte-json-schema.service.ts` | Validación AJV |

### Firma

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/adapters/dte-signer.adapter.ts` | Llama al firmador local |
| `src/modules/commerce/dte/config/dte-signer.config.ts` | Variables de entorno del firmador |
| `src/modules/commerce/dte/services/sign-dte-document.service.ts` | Orquesta firma de DTE |
| `src/modules/commerce/dte/services/sign-invalidation-event.service.ts` | Orquesta firma de invalidación |

### Autenticación y transmisión MH

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/adapters/dte-auth.adapter.ts` | Obtiene y cachea token MH |
| `src/modules/commerce/dte/adapters/dte-transmission.adapter.ts` | Envía DTE firmado a MH |
| `src/modules/commerce/dte/adapters/dte-invalidation-transmission.adapter.ts` | Envía evento de invalidación a MH |
| `src/modules/commerce/dte/config/dte-mh.config.ts` | Variables de entorno MH |
| `src/modules/commerce/dte/services/transmit-dte-document.service.ts` | Orquesta transmisión DTE |
| `src/modules/commerce/dte/services/transmit-invalidation-event.service.ts` | Orquesta transmisión invalidación |

### Nota de Crédito

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/services/create-credit-note-dte.service.ts` | Crea DteOutgoingDocument NC + DteDocumentRelation |
| `src/modules/commerce/dte/actions/create-and-transmit-credit-note.action.ts` | Orquesta flujo completo NC |

### Invalidación

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/services/create-invalidation-event.service.ts` | Crea DteInvalidationEvent |
| `src/modules/commerce/dte/actions/create-sign-transmit-invalidation.action.ts` | Orquesta flujo completo invalidación |

### Delivery externo

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/adapters/external-dte-mariadb.adapter.ts` | INSERT a MariaDB externa |
| `src/modules/commerce/dte/config/external-dte-mariadb.config.ts` | Variables de entorno MariaDB |
| `src/modules/commerce/dte/services/build-external-dte-payload.service.ts` | Construye payload DTE para MariaDB |
| `src/modules/commerce/dte/services/build-external-invalidation-payload.service.ts` | Construye payload invalidación para MariaDB |
| `src/modules/commerce/dte/services/deliver-dte-to-external-db.service.ts` | Orquesta delivery DTE |
| `src/modules/commerce/dte/services/deliver-invalidation-to-external-db.service.ts` | Orquesta delivery invalidación |
| `src/modules/commerce/dte/actions/deliver-dte-to-external-db.action.ts` | Server Action — entrega DTE |
| `src/modules/commerce/dte/actions/deliver-invalidation-to-external-db.action.ts` | Server Action — entrega invalidación |

### UI

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/sales/components/sale-dte-fiscal-panel.tsx` | Panel Fiscal DTE completo |
| `src/modules/commerce/sales/components/sales-client.tsx` | Botones contextuales DTE integrados al detalle de venta |

---

## 12. Correcciones aplicadas durante pruebas

| Corrección | Causa | Solución |
|-----------|-------|----------|
| Firma inválida | Certificado instalado no correspondía al NIT del emisor | Instalar certificado oficial y alinear `DTE_SIGNER_NIT` |
| `numeroControl` inválido | Formato incluía año en el último segmento (35 chars) | Eliminar año — formato correcto 31 chars, 15 dígitos de secuencia |
| `codActividad` rechazado | No coincidía con el registrado por Hacienda para ese NIT | Actualizar `activity_code` en `DteIssuerConfig` con el código real |
| Montos FE 01 mixtos | Algunos campos sin IVA y otros con IVA | Estandarizar todos los montos FE 01 con IVA incluido |
| `precioUni` sin IVA en FE 01 | Precio neto mientras `ventaGravada` incluía IVA | `precioUni` debe ser precio con IVA incluido en FE 01 |
| `multipleOf` — precisión decimal | Valores como `0.29` fallan AJV con `multipleOf: 0.01` | Redondear todos los valores monetarios a 2 decimales |
| CCFE 03 con `ivaItem` | Se reutilizó lógica FE 01 para CCFE 03 | CCFE 03 usa `tributos: ["20"]` por línea; `ivaItem` no aplica |
| `POST /seguridad/auth` rechazado | Se enviaba `application/json` | Usar `application/x-www-form-urlencoded` con `user` y `pwd` |
| Receptor FE 01 era `null` | Se construía como objeto vacío o nulo | Construir objeto con `nombre: "Consumidor Final"` y campos mínimos válidos |

---

## 13. Impacto en bases de datos y sincronización local/remota

| Aspecto | Estado |
|---------|--------|
| `schema.prisma` | Sin cambios nuevos en este cierre |
| Base local (`DATABASE_URL`) | Al día con todas las migraciones DTE |
| Base remota Supabase (`DIRECT_URL`) | Al día — `npx prisma migrate status` confirmado en ambas |
| Migraciones nuevas | Ninguna en este cierre |

Las migraciones DTE ya aplicadas incluyen:
- `DteIssuerConfig`, `DteCorrelative`, `DteOutgoingDocument`, `DteTransmissionLog`
- `DteCatalogItem`, `DteRenderedDocument`, `DteDelivery`
- `DteDocumentRelation`, `DteInvalidationEvent`
- Enums `DteOutgoingStatus`, `DteEnvironment`, `DteInvalidationStatus`
- Migración `20260520052610_add_cod_estable_mh_to_dte_issuer_config`

No se requiere ninguna migración adicional para operar el flujo V1 completo.

---

## 14. Validaciones ejecutadas al cierre

```
npx tsc --noEmit      → sin errores
```

No se ejecutaron migraciones, seeds, transmisiones a Hacienda ni inserciones en MariaDB durante el cierre documental.

---

## 15. Pendientes reales (V2 / fases futuras)

| Pendiente | Descripción |
|-----------|-------------|
| Vista global `/dashboard/dte/outgoing` | Lista paginada de todos los DTEs emitidos con filtros por estado, tipo, fecha |
| Vista de logs DTE completa | Historial de `DteTransmissionLog` navegable desde UI |
| Reintentos controlados de delivery externo | Si MariaDB no responde, registrar error y permitir reintento manual o automático |
| Nota de Débito (ND 06) | No implementada en V1 |
| Contingencia | Envío diferido según manual técnico MH — fuera del alcance V1 |
| Despliegue productivo por cliente | Cambiar `DTE_ENVIRONMENT` a `01` y URLs a endpoints de producción MH |
| Estrategia del firmador en producción | El firmador actual es local (`localhost:8113`) — Vercel/cloud requiere alternativa |
| Automatizar delivery externo | Opción: ejecutar delivery inmediatamente después de ACCEPTED sin acción manual |
| NC parcial por líneas | Seleccionar líneas específicas de CCFE 03 para nota de crédito parcial (V2) |
| QR URL pública | `https://admin.factura.gob.sv/consultaPublica?...` — generación y persistencia en `qr_url` |
| PDF / representación gráfica | `DteRenderedDocument` ya modelado — generación real pendiente |
| Envío por email al cliente | `DteDelivery` ya modelado — envío real pendiente |

---

## 16. Reglas de no regresión

- No reabrir el diseño del flujo DTE V1 ya validado.
- No meter lógica fiscal en `commerce/sales`.
- No llamar a servicios DTE desde componentes React directamente — solo vía Server Actions.
- No exponer `signed_jws`, tokens ni credenciales en logs o respuestas de UI.
- No cambiar el formato de `numeroControl` sin análisis de impacto en correlativos existentes.
- No reutilizar la lógica FE 01 para CCFE 03 ni para NC 05 — cada tipo tiene su propio servicio.
- `Sale.status` y `DteOutgoingDocument.dte_status` son estados independientes — no mezclarlos.
