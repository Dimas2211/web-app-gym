# DTE Outgoing — Firma y transmisión a Hacienda

## Estado

**Fases 4I-5 (firma) y 4I-6 (transmisión) cerradas.**

FE 01 y CCFE 03 probados end-to-end en ambiente TEST del Ministerio de Hacienda. Ambos documentos aparecen aceptados en el portal MH TEST con sello recibido.

Bases de datos locales y Supabase sincronizadas. `npx prisma migrate status` confirmó "Database schema is up to date" en ambas.

Validaciones ejecutadas al cierre:
- `npx prisma migrate status` — OK en local y Supabase.
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores nuevos (warnings preexistentes no relacionados).

---

## Documentos DTE aceptados en MH TEST

| Tipo | Código | Receptor | Estado MH |
|------|--------|----------|-----------|
| Factura Electrónica | FE 01 | Consumidor final | ACCEPTED (PROCESADO) |
| Comprobante de Crédito Fiscal | CCFE 03 | Receptor fiscal con NRC | ACCEPTED (PROCESADO) |

---

## Flujo end-to-end confirmado

```
Venta confirmada
  → DteOutgoingDocument creado con status PENDING_GENERATION
  → JSON DTE generado (FE 01 o CCFE 03 según tipo de venta)
  → JSON validado contra schema local (AJV)
  → DteOutgoingDocument.status = SCHEMA_VALIDATED
  → POST http://localhost:8113/firmardocumento/  (firmador MH local)
  → signed_jws recibido
  → DteOutgoingDocument.status = SIGNED
  → POST /seguridad/auth  (autenticación MH TEST)
  → token Bearer obtenido y cacheado en memoria
  → POST /fesv/recepciondte  (transmisión MH TEST)
  → respuesta: estado PROCESADO
  → DteOutgoingDocument.status = ACCEPTED
  → mh_seal guardado
  → mh_response guardado (sanitizado)
  → DteTransmissionLog registrado
  → UI mostrando estado ACCEPTED
  → documento visible en portal MH TEST
```

---

## Archivos implementados

### Firma (signer)

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/adapters/dte-signer.adapter.ts` | Llama al firmador local, recibe JWS |
| `src/modules/commerce/dte/config/dte-signer.config.ts` | Lee variables de entorno del firmador |
| `src/modules/commerce/dte/types/dte-signer.types.ts` | Tipos de request/response del firmador |
| `src/modules/commerce/dte/services/sign-dte-document.service.ts` | Orquesta firma y actualiza DteOutgoingDocument |
| `src/modules/commerce/dte/actions/sign-dte-document.action.ts` | Server Action que expone la firma a la UI |

### Autenticación MH

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/adapters/dte-auth.adapter.ts` | Obtiene y cachea token de la API MH |
| `src/modules/commerce/dte/config/dte-mh.config.ts` | Lee variables de entorno MH |
| `src/modules/commerce/dte/types/dte-mh-auth.types.ts` | Tipos de autenticación MH |

### Transmisión MH

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/adapters/dte-transmission.adapter.ts` | Envía DTE firmado a MH, registra log |
| `src/modules/commerce/dte/types/dte-transmission.types.ts` | Tipos de request/response de transmisión |
| `src/modules/commerce/dte/services/transmit-dte-document.service.ts` | Orquesta transmisión y actualiza estado |
| `src/modules/commerce/dte/actions/transmit-dte-document.action.ts` | Server Action que expone la transmisión a la UI |

### Generación de JSON DTE

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/services/generate-fe-json.service.ts` | Genera JSON FE 01 — montos con IVA incluido |
| `src/modules/commerce/dte/services/generate-ccfe-json.service.ts` | Genera JSON CCFE 03 — lógica tributaria separada |
| `src/modules/commerce/dte/utils/dte-control-number.ts` | Construye `numeroControl` con cod_estable_mh + cod_punto_venta_mh |

### Configuración emisor

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/dte/services/dte-issuer-config.service.ts` | Recupera y valida configuración del emisor activo |
| `src/modules/commerce/dte/queries/get-active-dte-issuer-config.ts` | Query del emisor activo por tenant/location |
| `src/modules/commerce/dte/queries/list-dte-issuer-configs.ts` | Lista configuraciones del emisor |
| `src/modules/commerce/dte/schemas/dte-issuer-config.schemas.ts` | Schemas Zod de validación del emisor |
| `src/modules/commerce/dte/types/dte.types.ts` | Tipos compartidos del módulo DTE |

### UI

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/modules/commerce/sales/components/sales-client.tsx` | Botones de firma y transmisión por DTE; muestra estado ACCEPTED |

### Prisma

| Archivo | Descripción |
|---------|-------------|
| `prisma/schema.prisma` | Modelos DteIssuerConfig, DteOutgoingDocument, DteTransmissionLog, DteCorrelative |
| `migrations/20260520052610_add_cod_estable_mh_to_dte_issuer_config` | Agrega `cod_estable_mh` requerido para `numeroControl` |
| `prisma/seeds/seed.dte-local-test-data.ts` | Seed de datos de prueba para emisor y correlativo locales |

---

## Variables de entorno requeridas

### Firmador local

| Variable | Descripción |
|----------|-------------|
| `DTE_SIGNER_URL` | URL del firmador local (ej: `http://localhost:8113`) |
| `DTE_SIGNER_TIMEOUT_MS` | Timeout del firmador en milisegundos |
| `DTE_SIGNER_NIT` | NIT del emisor — debe coincidir con el certificado instalado en el firmador |
| `DTE_SIGNER_PASSWORD` | Contraseña del certificado del emisor — no es la contraseña MH |

### API Ministerio de Hacienda

| Variable | Descripción |
|----------|-------------|
| `DTE_ENVIRONMENT` | `00` para pruebas, `01` para producción |
| `DTE_MH_USER` | Usuario API del contribuyente en el portal Hacienda |
| `DTE_MH_PASSWORD` | Contraseña del usuario API de Hacienda — no es la del certificado |
| `DTE_MH_AUTH_URL_TEST` | URL de autenticación TEST |
| `DTE_MH_RECEPTION_URL_TEST` | URL de recepción TEST |
| `DTE_MH_TIMEOUT_MS` | Timeout de llamadas MH en milisegundos |

**Regla crítica:** `DTE_SIGNER_PASSWORD` y `DTE_MH_PASSWORD` son credenciales completamente distintas. La primera corresponde al certificado del emisor instalado en el firmador. La segunda corresponde al usuario API registrado en Hacienda.

Reglas de seguridad:
- No commitear `.env` al repositorio.
- No commitear certificados ni llaves privadas.
- No imprimir tokens en logs.
- No guardar passwords en `DteTransmissionLog` ni en `mh_response`.

---

## Campos críticos de DteIssuerConfig

Para que la transmisión sea aceptada, estos campos deben estar correctamente configurados y alineados con el contribuyente registrado en Hacienda:

| Campo | Descripción |
|-------|-------------|
| `nit` | Debe coincidir con `DTE_SIGNER_NIT` y con el certificado instalado |
| `nrc` | NRC del emisor registrado en Hacienda |
| `nombre` / `business_name` | Razón social del contribuyente |
| `cod_actividad` / `activity_code` | Código de actividad económica real del contribuyente (CAT-019) |
| `desc_actividad` / `activity_name` | Descripción de la actividad correspondiente |
| `tipo_establecimiento` / `establishment_type_code` | CAT-009 — `01` Sucursal, `02` Casa Matriz, etc. |
| `cod_estable_mh` | Código de establecimiento asignado por Hacienda (ej: `M001`) |
| `cod_punto_venta_mh` | Código de punto de venta asignado por Hacienda (ej: `P001`) |
| `dept_code` | Código de departamento fiscal (CAT-012) |
| `municipality_code` | Código de municipio fiscal (CAT-013) |
| `address_complement` | Complemento de dirección fiscal |
| `phone` | Teléfono del emisor |
| `email` | Email del emisor |

**Regla de consistencia:** `DteIssuerConfig.nit`, `DTE_SIGNER_NIT` y el certificado instalado en el firmador deben pertenecer al mismo contribuyente emisor. Cualquier desalineación entre ellos genera firma inválida y rechazo por Hacienda.

---

## Endpoints MH confirmados

### Autenticación

```
POST /seguridad/auth
Content-Type: application/x-www-form-urlencoded

body: user=<DTE_MH_USER>&pwd=<DTE_MH_PASSWORD>
```

Respuesta: `{ "body": { "token": "..." } }`

El token se cachea en memoria durante la sesión del servidor. No se persiste en base de datos ni se expone al cliente.

### Transmisión

```
POST /fesv/recepciondte
Content-Type: application/json
Authorization: Bearer <token>

{
  "ambiente": "00",
  "idEnvio": <número incremental>,
  "version": 1,
  "tipoDte": "01",
  "documento": "<JWS firmado completo>",
  "codigoGeneracion": "<UUID del DTE>"
}
```

Para CCFE 03, `tipoDte` es `"03"`. El resto del contrato es idéntico.

Respuesta aceptada: `{ "estado": "PROCESADO", "selloRecibido": "...", ... }`

---

## Fórmula FE 01 — montos con IVA incluido

En FE 01 (Factura Electrónica a consumidor final), **todos los montos van con IVA incluido**. El IVA se reporta como dato informativo extraído, no como carga adicional.

### Por línea FE 01

```
precioUni     = precio unitario con IVA incluido
ventaGravada  = (cantidad × precioUni) − descuento de línea
ivaItem       = ventaGravada × (0.13 / 1.13)   ← IVA extraído del total
tributos      = null  (FE 01 no declara tributos por línea)
```

### Resumen FE 01

```
totalGravada         = suma de ventaGravada de líneas
subTotalVentas       = totalNoSuj + totalExenta + totalGravada
subTotal             = subTotalVentas − descuentos globales
montoTotalOperacion  = subTotal + totalNoGravado
totalPagar           = montoTotalOperacion − retenciones + saldoFavor
totalIva             = suma de ivaItem de líneas
```

**Regla crítica FE 01:** `totalIva` no se suma a `montoTotalOperacion`. Los montos FE 01 ya incluyen IVA. Sumarlo nuevamente genera rechazo por Hacienda.

---

## Fórmula CCFE 03 — lógica tributaria separada

En CCFE 03 (Comprobante de Crédito Fiscal), los montos son **sin IVA**. El IVA se declara explícitamente como tributo separado usando el código oficial `"20"`.

### Por línea CCFE 03

```
precioUni     = precio unitario sin IVA
ventaGravada  = (cantidad × precioUni) − descuento de línea
ivaItem       = no se usa en CCFE 03
tributos      = ["20"]  ← lista de códigos de tributo aplicados a la línea
```

### Resumen CCFE 03

```
totalGravada         = suma de ventaGravada de líneas (sin IVA)
subTotalVentas       = totalNoSuj + totalExenta + totalGravada
subTotal             = subTotalVentas − descuentos globales
montoTotalOperacion  = subTotal + IVA calculado
totalPagar           = montoTotalOperacion

resumen.tributos     = [{ codigo: "20", descripcion: "IVA 13%", valor: IVA calculado }]
```

**Regla crítica CCFE 03:** `resumen.totalIva` no se usa como campo de resumen de la misma forma que en FE 01. El IVA se declara en `resumen.tributos` con código `"20"`. `montoTotalOperacion` sí incluye el IVA.

---

## Diferencias clave FE 01 vs CCFE 03

| Aspecto | FE 01 | CCFE 03 |
|---------|-------|---------|
| Receptor | Consumidor final | Contribuyente con NRC |
| Montos de línea | Con IVA incluido | Sin IVA |
| `ivaItem` por línea | Sí — IVA extraído | No se usa |
| `tributos` por línea | `null` | `["20"]` |
| `resumen.tributos` | No presente | `[{ codigo: "20", ... }]` |
| `montoTotalOperacion` | Ya incluye IVA | Base + IVA sumado |
| Cliente requerido | No obligatorio | Sí — con NRC |

---

## Estados DTE — decisión V1

| Estado | Significado |
|--------|-------------|
| `PENDING_GENERATION` | DteOutgoingDocument creado al confirmar venta |
| `GENERATED` | JSON DTE construido internamente |
| `SCHEMA_VALIDATED` | JSON validado localmente contra schema MH oficial (AJV) |
| `SIGNED` | Documento firmado — `signed_jws` recibido del firmador |
| `ACCEPTED` | Hacienda emitió sello — `mh_seal` guardado |
| `OBSERVED` | Hacienda procesó con observaciones |
| `REJECTED` | Hacienda rechazó — `mh_response` guardado completo |

**Decisión V1 — sin estado SENT persistido:** la transmisión es síncrona en esta fase. El DTE pasa directamente de `SIGNED` a `ACCEPTED`, `OBSERVED` o `REJECTED` según la respuesta de Hacienda. Si ocurre un error técnico durante la transmisión, el DTE queda en `SIGNED` y puede reintentarse manualmente desde la UI. El estado `SENT` existe en el enum pero no se persiste como estado intermedio en V1.

---

## Correcciones aplicadas durante las pruebas

### 1. Firma no válida

- **Causa:** certificado instalado en el firmador no correspondía al emisor declarado en `DteIssuerConfig.nit`.
- **Solución:** instalar el certificado oficial del contribuyente y alinear `DTE_SIGNER_NIT` con el mismo NIT.

### 2. `numeroControl` inválido

- **Causa:** se usaba formato sin separación correcta de establecimiento/punto de venta.
- **Formato correcto:** `DTE-01-M001P001-000000000000001`
- **Regla:** no hay guion entre el código de establecimiento (`M001`) y el código de punto de venta (`P001`). Se concatenan directamente.
- **Implicación:** se agregó el campo `cod_estable_mh` a `DteIssuerConfig` mediante migración.

### 3. `codActividad` no corresponde al contribuyente

- **Causa:** código de actividad económica en `DteIssuerConfig` no coincidía con el registrado por Hacienda para ese NIT.
- **Solución:** actualizar `activity_code` en `DteIssuerConfig` con el código real del contribuyente.

### 4. Montos FE 01 mezclados (con y sin IVA)

- **Causa:** `generate-fe-json.service.ts` calculaba algunos campos sin IVA y otros con IVA.
- **Solución:** estandarizar todos los montos FE 01 con IVA incluido. Ver fórmula FE 01 arriba.

### 5. `precioUni` sin IVA en FE 01

- **Causa:** `precioUni` seguía siendo precio neto mientras `ventaGravada` ya incluía IVA.
- **Solución:** en FE 01, `precioUni` debe ser precio con IVA incluido.

### 6. `multipleOf` — precisión decimal

- **Causa:** valores como `0.29` pueden fallar validación AJV estricta por error de punto flotante en `multipleOf: 0.01`.
- **Solución:** redondear todos los valores monetarios a 2 decimales antes de incluirlos en el JSON.

### 7. CCFE 03 — `ivaItem` incorrecto

- **Causa:** se intentó reusar la lógica FE 01 para CCFE 03, incluyendo `ivaItem` por línea.
- **Solución:** CCFE 03 usa `tributos: ["20"]` por línea y `resumen.tributos` en el resumen. `ivaItem` no aplica.

### 8. `POST /seguridad/auth` — Content-Type incorrecto

- **Causa:** se enviaba `application/json` en lugar del formato requerido.
- **Solución:** usar `application/x-www-form-urlencoded` con campos `user` y `pwd`.

---

## Impacto en bases de datos y sincronización local/remota

| Base | Estado |
|------|--------|
| Local (DATABASE_URL) | Al día — migración `20260520052610` aplicada |
| Supabase (DIRECT_URL) | Al día — misma migración aplicada |
| Sincronización | `npx prisma migrate status` confirmó "Database schema is up to date" en ambas |

No se requiere ninguna migración adicional al cerrar esta fase.

---

## Pendientes futuros

- QR URL pública tras aceptación (`https://admin.factura.gob.sv/consultaPublica?...`).
- PDF / representación gráfica (`DteRenderedDocument` ya modelado en schema).
- Envío por email al cliente (`DteDelivery` ya modelado en schema).
- Vista de logs DTE desde la UI.
- Política de reintentos automática (manual MH: máx. 2 reintentos, consulta previa por `codigoGeneracion`).
- Integración MariaDB externa y delivery documental externo.
- Invalidación fiscal (`DteInvalidationEvent` ya modelado en schema).
- Notas de crédito / débito.
- Estrategia de firmador externo para Vercel/producción (el firmador actual es local).
- Configuración final por tenant/location en producción.
- Cambiar `DTE_ENVIRONMENT` a `01` y URLs a endpoints de producción MH cuando aplique.
