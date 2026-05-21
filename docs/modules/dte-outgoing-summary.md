# DTE Outgoing — resumen técnico de diseño

Estado: en diseño técnico (Fase 1). No implementado.

Fuentes de referencia usadas:
- `docs/dte-official/extracts/catalogos-dte-resumen.md`
- `docs/dte-official/extracts/manual-tecnico-firma-transmision.md`
- `docs/dte-official/extracts/normativa-dte-reglas-clave.md`
- `docs/dte-official/data/dte-catalogos-minimos.json`

---

## Propósito del módulo

`commerce/dte` gestiona el ciclo de vida del documento fiscal electrónico emitido (DTE outgoing): generación del JSON DTE, firma electrónica, transmisión al Ministerio de Hacienda de El Salvador, recepción de respuesta y seguimiento del estado fiscal.

El módulo DTE no es la venta. Es el documento fiscal que puede nacer a partir de una venta confirmada.

---

## Diferencia entre DTE outgoing y DTE import de compras

| Aspecto        | DTE import (purchases)                         | DTE outgoing (sales/dte)                          |
|----------------|------------------------------------------------|---------------------------------------------------|
| Dirección      | Documento recibido de proveedor                | Documento emitido por nuestra empresa             |
| Módulo origen  | `commerce/purchases` (cerrado y operativo)     | `commerce/sales` + `commerce/dte` (en diseño)     |
| Acción         | Importar JSON DTE recibido para crear Purchase | Generar, firmar y transmitir DTE a Hacienda       |
| Sello MH       | Sello ya obtenido por el proveedor             | Nuestro ERP solicita el sello a Hacienda          |
| Estado fiscal  | Solo referencia, no gestionamos               | Gestionamos el ciclo completo                     |

No confundir los dos flujos. No reutilizar adaptadores ni servicios de DTE import en el módulo DTE outgoing.

---

## Tipos DTE — MVP

Solo estos dos tipos están en alcance para el MVP:

| Código | Nombre oficial                            | Abreviatura | Uso |
|--------|-------------------------------------------|-------------|-----|
| `01`   | Factura / Factura Electrónica             | FE          | Ventas a consumidor final |
| `03`   | Comprobante de Crédito Fiscal Electrónico | CCFE        | Ventas entre contribuyentes con NRC |

Regla de nomenclatura: no usar "CCF consumidor final". El código `01` es la Factura Electrónica para consumidor final. El código `03` es el Comprobante de Crédito Fiscal.

---

## Tipos DTE fuera del MVP

| Código | Nombre                              | Estado   |
|--------|-------------------------------------|----------|
| `05`   | Nota de Crédito Electrónica (NCE)   | V2/futuro |
| `06`   | Nota de Débito Electrónica (NDE)    | V2/futuro |
| `08`   | Comprobante de Liquidación          | V2/futuro |
| `14`   | Factura de Sujeto Excluido (FSEE)   | V2/futuro |
| `11`   | Factura de Exportación (FEXE)       | V2/futuro |
| —      | Contingencia                        | V2/futuro |
| —      | Invalidación fiscal                 | V2/futuro |
| —      | Recepción por lotes                 | V2/futuro |

No implementar ninguno de estos en el MVP. Documentarlos solo como referencia.

---

## Entidades conceptuales

### DteIssuerConfig

Configuración del emisor DTE por `tenant_id + location_id`. Cada location puede tener su propio establecimiento fiscal.

| Campo                    | Tipo      | Descripción                                                          |
|--------------------------|-----------|----------------------------------------------------------------------|
| `id`                     | UUID      | Identificador único                                                  |
| `tenant_id`              | UUID      | Tenant propietario                                                   |
| `location_id`            | UUID      | Location configurada como emisor                                     |
| `nit`                    | String    | NIT del emisor (sin guiones)                                         |
| `nrc`                    | String    | NRC del emisor                                                       |
| `business_name`          | String    | Nombre o razón social del emisor                                     |
| `trade_name`             | String?   | Nombre comercial                                                     |
| `activity_code`          | String    | Código de actividad económica (CAT-019)                              |
| `activity_name`          | String    | Descripción de la actividad económica                                |
| `establishment_type_code`| String    | Tipo de establecimiento CAT-009 (`01` Sucursal, `02` Casa Matriz...) |
| `establishment_code`     | String?   | Código del establecimiento asignado                                  |
| `point_of_sale_code`     | String?   | Código del punto de venta                                            |
| `dept_code`              | String    | Código de departamento                                               |
| `municipality_code`      | String    | Código de municipio                                                  |
| `address_complement`     | String    | Complemento de dirección                                             |
| `phone`                  | String?   | Teléfono del emisor                                                  |
| `email`                  | String?   | Email del emisor                                                     |
| `environment_code`       | String    | Ambiente CAT-001: `00` prueba, `01` producción                       |
| `is_active`              | Boolean   | Si esta configuración está activa                                    |
| `created_at`             | DateTime  | Auditoría                                                            |
| `updated_at`             | DateTime  | Auditoría                                                            |

Nota: las credenciales (usuario API, contraseña, certificado, llave privada) no se guardan en esta tabla. Ver sección de seguridad y `DteCredential`.

### DteCorrelative

Controlador de correlativos numéricos por tipo DTE, por `tenant_id + location_id`.

| Campo             | Tipo      | Descripción                                                   |
|-------------------|-----------|---------------------------------------------------------------|
| `id`              | UUID      | Identificador único                                           |
| `tenant_id`       | UUID      | Tenant propietario                                            |
| `location_id`     | UUID      | Location                                                      |
| `dte_type_code`   | String    | Código de tipo DTE (CAT-002): `01`, `03`, etc.                |
| `environment_code`| String    | Ambiente CAT-001: `00` prueba, `01` producción                |
| `last_number`     | Int       | Último número emitido                                         |
| `updated_at`      | DateTime  | Auditoría de último uso                                       |

El correlativo debe incrementarse dentro de una transacción atómica para evitar duplicados. El código de generación UUID (`codigoGeneracion`) del DTE es distinto del correlativo numérico; el UUID se genera con `crypto.randomUUID()` al construir el JSON DTE.

### DteOutgoingDocument

Registro del DTE emitido y su estado fiscal. Es la única fuente de verdad sobre el estado del documento ante Hacienda.

| Campo                 | Tipo      | Descripción                                                         |
|-----------------------|-----------|---------------------------------------------------------------------|
| `id`                  | UUID      | Identificador único interno                                         |
| `sale_id`             | UUID      | FK a `Sale`                                                         |
| `tenant_id`           | UUID      | Tenant propietario                                                  |
| `location_id`         | UUID      | Location emisora                                                    |
| `dte_type_code`       | String    | Código CAT-002 (`01` FE, `03` CCFE)                                 |
| `environment_code`    | String    | Ambiente CAT-001 (`00` prueba, `01` producción)                     |
| `generation_code`     | String    | UUID único del DTE (`codigoGeneracion`) — inmutable una vez asignado |
| `internal_number`     | Int       | Correlativo numérico asignado                                       |
| `dte_json`            | Json?     | JSON DTE generado (antes de firma)                                  |
| `signed_jws`          | Text?     | Documento firmado en formato JWS                                    |
| `mh_seal`             | String?   | Sello de recepción del Ministerio de Hacienda                       |
| `mh_response`         | Json?     | Respuesta completa del MH (sanitizada)                              |
| `dte_status`          | Enum      | Estado fiscal del documento                                         |
| `issued_at`           | DateTime? | Fecha/hora de emisión del DTE                                       |
| `sent_at`             | DateTime? | Fecha/hora de transmisión a Hacienda                                |
| `accepted_at`         | DateTime? | Fecha/hora de aceptación por Hacienda                               |
| `qr_url`              | String?   | URL QR de consulta pública del DTE                                  |
| `created_at`          | DateTime  | Auditoría                                                           |
| `updated_at`          | DateTime  | Auditoría                                                           |

### DteTransmissionLog

Registro de cada intento de comunicación con el firmador o con Hacienda. Inmutable. No contiene secretos.

| Campo             | Tipo      | Descripción                                                         |
|-------------------|-----------|---------------------------------------------------------------------|
| `id`              | UUID      | Identificador único                                                 |
| `dte_document_id` | UUID      | FK a `DteOutgoingDocument`                                          |
| `attempt_number`  | Int       | Número de intento (1, 2, 3...)                                      |
| `action`          | String    | Acción: `AUTH`, `SIGN`, `SEND`, `QUERY`, `CONTINGENCY`, `INVALIDATION` |
| `http_status`     | Int?      | Código HTTP de respuesta                                            |
| `response_summary`| Json?     | Respuesta sanitizada (sin secretos, sin tokens)                     |
| `error_message`   | String?   | Mensaje de error si aplica                                          |
| `created_at`      | DateTime  | Fecha/hora del intento                                              |

### DteCredential (estrategia futura)

Las credenciales del emisor (usuario API, contraseña, certificado `.p12`, llave privada, `passwordPri`) nunca se guardan en texto plano en la base de datos.

Estrategia documentada para fase futura:

- Evaluar uso de un secrets manager (AWS Secrets Manager, HashiCorp Vault, o variable de entorno cifrada por tenant/location).
- Si se decide guardar en base de datos, cifrar con clave maestra (`AES-256-GCM` o equivalente) nunca en texto plano.
- `DteCredential` sería una tabla separada con campos cifrados: `encrypted_api_user`, `encrypted_api_password`, `encrypted_private_key_password`.
- La clave maestra de cifrado debe vivir en variable de entorno o en un KMS, nunca en la base de datos.
- No implementar cifrado todavía. Documentar la estrategia y bloquear cualquier intento de guardar credenciales en texto plano.

---

## Estados DTE

| Estado                  | Descripción                                                           |
|-------------------------|-----------------------------------------------------------------------|
| `NOT_REQUIRED`          | La venta no requiere DTE (servicio interno, etc.)                     |
| `PENDING_GENERATION`    | Venta confirmada, DTE aún no generado                                 |
| `GENERATED`             | JSON DTE construido, pendiente de validación                          |
| `SCHEMA_VALIDATED`      | JSON validado contra schema oficial local                             |
| `SIGNED`                | Documento firmado (JWS recibido del firmador)                         |
| `SENT`                  | Enviado al servicio de recepción del MH                               |
| `ACCEPTED`              | Hacienda emitió sello de recepción (`PROCESADO`)                      |
| `OBSERVED`              | Hacienda procesó con observaciones (`RECIBIDO CON OBSERVACIONES`)     |
| `REJECTED`              | Hacienda rechazó el documento (`RECHAZADO`)                           |
| `CONTINGENCY_PENDING`   | En espera de envío por contingencia (fuera del MVP)                   |
| `INVALIDATION_PENDING`  | Invalidación iniciada, pendiente de respuesta MH (fuera del MVP)      |
| `INVALIDATED`           | DTE invalidado ante Hacienda (fuera del MVP)                          |

Regla crítica: `Sale.status = CONFIRMED` no implica `DteOutgoingDocument.dte_status = ACCEPTED`. Son estados independientes.

---

## Flujo conceptual completo

```
1. Crear venta DRAFT (Sale)
      ↓
2. Agregar líneas (SaleItem)
      ↓
3. Confirmar venta
      → Sale.status = CONFIRMED
      → Genera SALE_OUT en inventory (si stockable)
      → DteOutgoingDocument creado con status = PENDING_GENERATION
      → FIN DE LA TRANSACCIÓN PRISMA
      ↓
4. Generar JSON DTE (proceso separado, posterior)
      → DteOutgoingDocument.status = GENERATED
      → Guardar dte_json
      ↓
5. Validar JSON contra schema oficial (local)
      → DteOutgoingDocument.status = SCHEMA_VALIDATED
      ↓
6. Firmar con servicio local firmador (dte-signer.adapter)
      → POST http://localhost:8113/firmardocumento/
      → DteOutgoingDocument.signed_jws = JWS recibido
      → DteOutgoingDocument.status = SIGNED
      → DteTransmissionLog.action = SIGN (registrar intento)
      ↓
7. Transmitir a Hacienda (dte-transmission.adapter)
      → POST https://api[test].dtes.mh.gob.sv/fesv/recepciondte
      → DteOutgoingDocument.status = SENT
      → DteTransmissionLog.action = SEND (registrar intento)
      ↓
8. Guardar respuesta MH
      → Si PROCESADO: status = ACCEPTED, guardar sello, generar QR URL
      → Si RECHAZADO: status = REJECTED, guardar respuesta completa
      → Si OBSERVACIONES: status = OBSERVED
      → DteTransmissionLog.action = SEND (actualizar con respuesta)
```

---

## Regla transaccional crítica

La llamada externa al firmador (`http://localhost:8113/firmardocumento/`) y la llamada a Hacienda (`https://api.dtes.mh.gob.sv/fesv/recepciondte`) **no deben ejecutarse dentro de la transacción Prisma** de confirmación de venta.

Razón: las llamadas HTTP externas pueden tardar segundos, fallar con timeout o ser reintentos. Una transacción Prisma que espera una llamada HTTP externa puede dejar conexiones bloqueadas, generar deadlocks y romper la consistencia de la base de datos.

El flujo correcto es:
1. Confirmar venta en transacción Prisma (solo operaciones de base de datos).
2. Crear `DteOutgoingDocument` con estado `PENDING_GENERATION` dentro de la misma transacción.
3. Ejecutar el flujo DTE (generación, firma, transmisión) fuera de la transacción, en un servicio separado o proceso asíncrono.

---

## Configuración del emisor

`DteIssuerConfig` se define por `tenant_id + location_id`.

Cada location puede tener su propio código de establecimiento, punto de venta, tipo de establecimiento y ambiente (prueba/producción).

Esto permite que una empresa con múltiples sucursales pueda tener configuraciones DTE independientes por location.

---

## Adaptadores técnicos futuros

| Adaptador                      | Responsabilidad                                              |
|-------------------------------|--------------------------------------------------------------|
| `dte-auth.adapter.ts`         | Obtener y cachear token de la API del MH. Nunca exponer token en UI. |
| `dte-signer.adapter.ts`       | Llamar al firmador local, recibir JWS. No guardar `passwordPri` en texto plano. |
| `dte-transmission.adapter.ts` | Enviar DTE firmado a Hacienda. Manejar reintentos (máx. 2 según manual). Consultar estado antes de reintentar. |

Reglas de los adaptadores:
- No llamar desde componentes React ni desde acciones de UI directamente.
- No exponer tokens, JWS incompletos ni credenciales en logs.
- Registrar intentos sanitizados en `DteTransmissionLog`.

---

## Política de reintentos (documentada, no implementada en MVP)

Según el manual técnico oficial:
- Si el servicio no responde en 8 segundos, consultar estado por `codigoGeneracion`.
- Si no fue recibido, reenviar (máx. 2 reintentos).
- Si luego de reintentos no hay respuesta, iniciar contingencia (fuera del MVP).

---

## Código QR

Cuando el DTE sea aceptado, generar URL de consulta pública en formato:

```
https://admin.factura.gob.sv/consultaPublica?ambiente={ambiente}&codGen={codigoGeneracion}&fechaEmi={fechaEmi}
```

Guardar en `DteOutgoingDocument.qr_url`.

---

## Seguridad

Reglas no negociables:
- No guardar certificados `.p12`, llaves privadas, `passwordPri`, tokens de API MH ni contraseñas en texto plano en base de datos.
- No exponer credenciales en logs de aplicación.
- No incluir `passwordPri` en ningún response de API.
- Los tokens de autenticación del MH no deben enviarse al cliente.
- El campo `mh_response` en `DteOutgoingDocument` debe ser sanitizado antes de guardarse (remover cualquier dato sensible de la respuesta HTTP).

---

## Holguras temporales (manual técnico oficial)

- Los DTE pueden transmitirse hasta un día posterior a la fecha de emisión.
- Excepción: el último día del período tributario solo permite 30 minutos de diferencia.
- El ERP debe registrar fecha/hora de emisión y de transmisión.
- No asumir que un DTE puede transmitirse siempre diferido.

---

## Pendientes para Fase 2 (Prisma schema)

- Definir modelos Prisma exactos para `DteIssuerConfig`, `DteCorrelative`, `DteOutgoingDocument`, `DteTransmissionLog`.
- Definir enums Prisma para `DteStatus` y `DteTypeCode`.
- Definir índices por `tenant_id + location_id`, `generation_code`, `sale_id`.
- Definir relación `Sale` → `DteOutgoingDocument` (1:1 por sale en MVP, puede ser 1:N si se implementan correcciones en el futuro).

---

## Pendientes para fases posteriores

- Definir estructura interna exacta del JSON DTE para FE código `01` y CCFE código `03` contra JSON Schemas oficiales del MH.
- Configurar ambiente de pruebas MH y credenciales de prueba.
- Implementar `dte-auth.adapter.ts` con caché de token.
- Implementar el firmador local (proyecto Java / Docker según manual técnico oficial).
- Implementar `dte-signer.adapter.ts`.
- Implementar `dte-transmission.adapter.ts` con reintentos y consulta previa.
- Implementar generación de QR.
- Fuentes oficiales necesarias más adelante: JSON Schemas oficiales del MH para FE y CCFE (no disponibles en este paquete de extractos), versión legible de normativa de cumplimiento.

---

---

## Fase 3C — Ampliaciones controladas del modelo DTE (modelado base)

### Catálogos DTE oficiales — DteCatalogItem

Tabla genérica `dte_catalog_items` para todos los catálogos oficiales MH:
- CAT-001 Ambiente de destino
- CAT-002 Tipo de Documento
- CAT-003 Modelo de Facturación
- CAT-004 Tipo de Transmisión
- CAT-016 Condición de la Operación
- CAT-017 Forma de Pago
- CAT-018 Plazo
- CAT-022 Tipo de Documento de Identificación del Receptor
- CAT-024 Tipo de Invalidación

No hardcodear catálogos en UI. Consumir desde `dte_catalog_items` con filtro por `catalog_code`.

Seed disponible: `prisma/seeds/seed.dte-catalog-items.ts`
Comando (no ejecutar sin instrucción explícita): `npx tsx prisma/seeds/seed.dte-catalog-items.ts`

### PDF / Representación gráfica — DteRenderedDocument

Tabla `dte_rendered_documents` para modelar el ciclo de vida de la representación gráfica del DTE (principalmente PDF).

- Relación N:1 con `DteOutgoingDocument`.
- Estados: `PENDING`, `GENERATED`, `FAILED`.
- Campos para almacenamiento: `storage_key`, `public_url`, `file_name`, `mime_type`, `file_size`.
- No genera PDF real en esta fase. Solo modela la estructura.

### Delivery / Envío — DteDelivery

Tabla `dte_deliveries` para registrar todos los intentos de entrega del DTE:
- `CUSTOMER_EMAIL` — correo al cliente receptor.
- `INTERNAL_EMAIL` — correo contable/interno para ventas rápidas.
- `PRINT` — impresión física.
- `DOWNLOAD` — descarga.

- Referencia opcional a `DteRenderedDocument` si el envío lleva un PDF adjunto.
- Estados: `PENDING`, `SENT`, `FAILED`, `SKIPPED`.
- No envía emails reales en esta fase. Solo modela la estructura.

### Documentos relacionados — DteDocumentRelation

Tabla `dte_document_relations` para vincular documentos DTE entre sí:
- Nota de crédito NCE 05 → Factura FE 01 original.
- Nota de débito NDE 06 → Factura FE 01 original.
- Reemplazos y referencias entre documentos.

Tipos de relación: `CREDIT_NOTE_OF`, `DEBIT_NOTE_OF`, `REPLACES`, `REFERENCES`.

No implementa lógica de creación de notas de crédito/débito en esta fase.

### Invalidación — DteInvalidationEvent

Tabla `dte_invalidation_events` para modelar el evento fiscal de invalidación.

- Separado de `Sale` y de `DteOutgoingDocument`.
- Estados: `DRAFT`, `PENDING_SIGNATURE`, `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`, `CANCELLED`.
- Campos para respuesta MH: `mh_estado`, `mh_sello_recibido`, `mh_codigo_msg`, etc.
- `invalidation_type_code` referencia CAT-024.
- No transmite invalidación a Hacienda en esta fase. Solo modela la estructura.

### Campos adicionales en Sale y SalePayment

- `Sale.payment_term_code` → CAT-018 (01 Días, 02 Meses, 03 Años).
- `Sale.payment_term_value` → número de días/meses/años para crédito.
- `SalePayment.mh_payment_form_code` → CAT-017 forma de pago MH.

Todos los campos son nullable. No rompen servicios existentes.

### Qué queda modelado pero no implementado en Fase 3C

- Generación real de PDF (requiere librería, fase futura).
- Envío real de emails (requiere Resend/SMTP, fase futura).
- Construcción de event_json de invalidación (requiere estructura JSON oficial).
- Firma del evento de invalidación.
- Transmisión de invalidación a Hacienda.
- Lógica de emisión de notas de crédito/débito.
- Queries y services para los modelos nuevos.

---

## Estado

**DTE V1 cerrado operativamente.**

- FE 01, CCFE 03, NC 05 e Invalidación implementados y probados end-to-end en MH TEST.
- Todos los documentos aceptados con sello y entregados a sistema externo MariaDB.
- Panel Fiscal DTE operativo en /dashboard/sales.
- Ver docs/modules/dte-v1-operational-close.md para el cierre técnico-operativo completo.
