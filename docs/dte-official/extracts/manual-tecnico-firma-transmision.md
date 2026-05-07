# Extracto operativo - Manual Tecnico para la Integracion del Sistema de Transmision DTE

Fuente original: `Manual Técnico para la Integración Tecnológica del Sistema de Transmisión.pdf`.
Uso previsto: guiar fases futuras de autenticacion, firma, transmision, consulta, contingencia, invalidacion y QR.

## Advertencia de alcance

Este extracto sirve para diseno tecnico y prompts de implementacion. No sustituye el manual oficial ni los JSON Schemas oficiales. Para implementar transmision real, contrastar endpoint, parametros y estructura contra la version vigente del manual y ambiente de pruebas.

## 1. Conceptos tecnicos relevantes

El manual define:

- DTE: Documento Tributario Electronico.
- JSON: formato ligero de intercambio de datos.
- JWS: JSON Web Signature, usado como base para firma de JSON.
- JWT: token de acceso para seguridad de DTE.
- API: interfaz REST para consumir servicios.

## 2. Autenticacion para API

El emisor debe autenticarse contra la API de Seguridad para obtener un token que permite consumir los servicios del sistema DTE.

### Reglas extraidas

- Las credenciales son de tipo aplicacion.
- La contrasena de aplicacion no vence automaticamente, pero puede modificarse desde la consola correspondiente.
- El token no debe solicitarse por cada DTE si sigue vigente.
- En el manual se indica que para API la autenticacion puede hacerse una vez cada 24 horas; tambien se menciona vigencia configurable y, para ambiente de pruebas, vigencia de token de 48 horas en el flujo de recepcion.

### Endpoint de autenticacion

| Ambiente | URL | Metodo |
|---|---|---|
| TEST | `https://apitest.dtes.mh.gob.sv/seguridad/auth` | POST |
| PROD | `https://api.dtes.mh.gob.sv/seguridad/auth` | POST |

### Content-Type

`application/x-www-form-urlencoded`

### Parametros principales

| Campo | Ubicacion | Descripcion |
|---|---|---|
| `User-Agent` | Header | Agente desde donde se origina la peticion |
| `user` | Body | Usuario asignado |
| `pwd` | Body | Contrasena asignada |

### Respuesta esperada

La respuesta exitosa incluye:

- `status`
- `body.user`
- `body.token`
- informacion de rol
- `tokenType`
- `roles`

### Implicacion para el ERP

Crear un adaptador `dte-auth.adapter.ts` que:

- obtenga token solo cuando no exista token vigente;
- guarde fecha estimada de expiracion;
- nunca exponga token en UI;
- registre errores sin guardar contrasenas ni secretos en logs.

## 3. Solucion de Firma Electronica

El manual indica que la Administracion Tributaria comparte un proyecto de firma basado en Java. La aplicacion es standalone y no necesita conectividad hacia afuera de la infraestructura del contribuyente.

Opciones indicadas:

- Proyecto Java Spring Boot.
- Contenedor Docker con SSL y sin SSL.
- Servicio de Windows.

### Servicio local de firma

URL local del firmador:

`http://localhost:8113/firmardocumento/`

Metodo:

`POST`

### Parametros del servicio de firma

| Campo | Tipo | Descripcion |
|---|---|---|
| `content-Type` | Header | `application/JSON` |
| `nit` | Body | NIT del contribuyente que firma |
| `activo` | Body | Booleano que indica si el contribuyente esta activo |
| `passwordPri` | Body | Contrasena de llave privada del certificado |
| `dteJson` | Body | Documento JSON del DTE a firmar |

### Respuesta de firma

Respuesta exitosa:

- `status`: `OK`
- `body`: documento firmado, en formato JWS

Respuesta de error:

- `status`: `ERROR`
- `body.codigo`
- `body.mensaje[]`

### Implicacion para el ERP

Crear un adaptador futuro `dte-signer.adapter.ts` que:

- reciba JSON DTE generado y validado;
- envie el JSON al firmador;
- reciba JWS firmado;
- guarde el JWS en `DteOutgoingDocument.signed_jws`;
- no guarde `passwordPri` en texto plano;
- no llame al firmador dentro de transaccion Prisma.

## 4. Flujo de Recepcion de Documentos

El manual describe que:

1. Se genera token de seguridad.
2. El emisor envia solicitud de recepcion al WS de recepcion.
3. El servicio verifica firma electronica.
4. Luego revisa estructura y datos.
5. Si el documento cumple requisitos, Hacienda emite sello de recepcion.

### Implicacion para estados DTE

Estados internos recomendados:

- `GENERATED`: JSON construido.
- `SCHEMA_VALIDATED`: JSON validado localmente contra schema oficial.
- `SIGNED`: JWS recibido del firmador.
- `SENT`: enviado a Hacienda.
- `ACCEPTED`: Hacienda responde con sello.
- `OBSERVED`: procesado con observaciones.
- `REJECTED`: rechazado.

## 5. Holguras en la transmision

El manual indica que se reciben documentos con un dia posterior a la fecha de transmision, excepto el ultimo dia del periodo tributario, donde solo se permite una diferencia de 30 minutos hacia adelante respecto a la fecha y hora del servicio de recepcion de Hacienda.

### Implicacion para el ERP

- Registrar fecha/hora de emision y de transmision.
- No asumir que un DTE antiguo siempre puede transmitirse.
- Para MVP, evitar flujos diferidos complejos salvo que se implemente control formal.

## 6. Politica de reintentos

El manual indica:

- Si el servicio no responde despues de 8 segundos, consultar estado del documento transmitido.
- Si no fue recibido, enviar nuevamente solicitud de recepcion.
- Repetir hasta obtener respuesta exitosa, con maximo de 2 reintentos.
- Si el sistema del emisor falla y no procesa la respuesta, tambien debe consultar estado antes de reenviar.
- Si luego de reintentos no se logra recibir o procesar respuesta, se inicia modalidad de contingencia.

### Implicacion para `DteTransmissionLog`

Registrar por intento:

- numero de intento;
- accion (`AUTH`, `SIGN`, `SEND`, `QUERY`, `CONTINGENCY`, `INVALIDATION`);
- HTTP status;
- respuesta sanitizada;
- error;
- fecha/hora.

## 7. Servicio de Recepcion uno a uno

### Endpoint

| Ambiente | URL | Metodo |
|---|---|---|
| TEST | `https://apitest.dtes.mh.gob.sv/fesv/recepciondte` | POST |
| PROD | `https://api.dtes.mh.gob.sv/fesv/recepciondte` | POST |

### Headers

| Campo | Descripcion |
|---|---|
| `Authorization` | Token obtenido por autenticacion |
| `User-Agent` | Agente de usuario |
| `content-Type` | `application/JSON` |

### Body principal

| Campo | Descripcion |
|---|---|
| `ambiente` | `00` prueba, `01` produccion |
| `idEnvio` | Identificador de envio |
| `version` | Version del JSON DTE; debe coincidir con identificacion del DTE |
| `tipoDte` | Tipo de DTE; debe coincidir con identificacion del DTE |
| `documento` | DTE firmado a transmitir |
| `codigoGeneracion` | Codigo de generacion del documento |

### Respuesta principal

| Campo | Descripcion |
|---|---|
| `version` | Version de respuesta |
| `ambiente` | Ambiente |
| `versionApp` | Version de aplicacion |
| `estado` | Estado del procesamiento |
| `codigoGeneracion` | Codigo de generacion del DTE |
| `selloRecibido` | Sello de recepcion si fue aceptado |
| `fhProcesamiento` | Fecha/hora de procesamiento |
| `clasificaMsg` | Codigo de clasificacion de mensaje |
| `codigoMsg` | Codigo de mensaje |
| `descripcionMsg` | Descripcion del mensaje |
| `observaciones` | Observaciones de validacion |

### Estados observados en ejemplos

- `PROCESADO`
- `RECHAZADO`

Mensajes observados:

- `RECIBIDO`
- `RECIBIDO CON OBSERVACIONES`

## 8. Servicio de Consulta DTE

### Endpoint

| Ambiente | URL | Metodo |
|---|---|---|
| TEST | `https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/` | POST |
| PROD | `https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte/` | POST |

### Body

| Campo | Descripcion |
|---|---|
| `nitEmisor` | NIT del emisor, sin guiones |
| `tdte` | Tipo de DTE |
| `codigoGeneracion` | Codigo de generacion del DTE a buscar |

### Uso en el ERP

- Antes de reintentar, consultar estado por `codigoGeneracion`.
- Si Hacienda ya recibio el documento, actualizar `DteOutgoingDocument` y no reenviar.

## 9. Recepcion por lotes

Fuera del MVP.

Puntos relevantes:

- Endpoint TEST: `https://apitest.dtes.mh.gob.sv/fesv/recepcionlote/`
- Endpoint PROD: `https://api.dtes.mh.gob.sv/fesv/recepcionlote/`
- Los lotes usan lista de DTE firmados.
- El envio devuelve `codigoLote`.
- Luego se consulta el lote por `codigoLote`.

Restricciones indicadas:

- Lote de hasta 100 DTE.
- En pruebas: hasta 300 lotes, procesamiento promedio 2 a 3 minutos por lote, horario 08:00 a 17:00.
- En produccion: hasta 400 lotes, procesamiento promedio 1 a 3 minutos por lote, horario 22:00 a 05:00.
- La contingencia usa servicio de lotes y esta disponible 24/7 segun el manual.

## 10. Contingencia

Fuera del MVP.

El manual indica que si el emisor entra en contingencia, al restablecer conexion debe:

1. Generar evento de contingencia informando DTE emitidos durante el periodo.
2. Enviar lote con los DTE informados.

### Endpoint de evento contingencia

| Ambiente | URL | Metodo |
|---|---|---|
| TEST | `https://apitest.dtes.mh.gob.sv/fesv/contingencia` | POST |
| PROD | `https://api.dtes.mh.gob.sv/fesv/contingencia` | POST |

### Parametros principales

| Campo | Descripcion |
|---|---|
| `Authorization` | Token de autenticacion |
| `nit` | NIT del emisor sin guiones |
| `documento` | Evento de contingencia firmado |

### Respuesta principal

- `estado`
- `fechaHora`
- `mensaje`
- `selloRecibido`
- `observaciones`

## 11. Invalidacion

Fuera del MVP.

El manual define un servicio para transmitir la inactivacion de un DTE recibido previamente.

### Endpoint de invalidacion

| Ambiente | URL | Metodo |
|---|---|---|
| TEST | `https://apitest.dtes.mh.gob.sv/fesv/anulardte` | POST |
| PROD | `https://api.dtes.mh.gob.sv/fesv/anulardte` | POST |

### Parametros principales

| Campo | Descripcion |
|---|---|
| `Authorization` | Token de autenticacion |
| `ambiente` | `00` prueba, `01` produccion |
| `idEnvio` | Identificador de envio |
| `version` | Version del JSON de invalidacion |
| `documento` | Evento de invalidacion firmado |

### Regla conceptual para el ERP

No confundir:

- Cancelacion interna de `Sale` antes de confirmar/transmitir.
- Invalidacion fiscal de un DTE ya recibido por Hacienda.

## 12. Codigo QR

El manual indica que las versiones electronicas interpretadas y legibles del DTE deben integrar un parametro de consulta dentro de un codigo QR.

Formato base:

`https://admin.factura.gob.sv/consultaPublica?ambiente={ambiente}&codGen={cod_generacion}&fechaEmi={fechaEmi}`

Parametros:

| Campo | Descripcion |
|---|---|
| `ambiente` | `00` prueba o `01` produccion |
| `codGen` | Codigo de generacion del DTE |
| `fechaEmi` | Fecha de generacion del DTE |

## Reglas arquitectonicas para nuestra plataforma

1. Confirmar venta interna no debe llamar a Hacienda dentro de la misma transaccion Prisma.
2. La firma debe estar en un adapter (`dte-signer.adapter.ts`).
3. La transmision debe estar en un adapter (`dte-transmission.adapter.ts`).
4. La autenticacion debe estar en un adapter (`dte-auth.adapter.ts`).
5. Los tokens y secretos no deben exponerse en UI ni logs.
6. El estado fiscal debe vivir en `DteOutgoingDocument`, no en `Sale`.
7. `DteTransmissionLog` debe registrar intentos y respuestas.
8. La consulta de DTE debe usarse antes de reintentar para evitar duplicidades.
