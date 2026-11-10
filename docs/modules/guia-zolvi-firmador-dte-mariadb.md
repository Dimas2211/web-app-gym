# Zolvi — Firmadores DTE por cliente y entrega externa a MariaDB

**Versión de la guía:** 1.0 · Corte original 26 de octubre de 2026 (hora El Salvador; 27 de octubre UTC)  
**Fuente:** `Guia_Zolvi_Firmador_DTE_MariaDB.pdf` (11 páginas). Conversión íntegra de su contenido textual a Markdown, con títulos, subtítulos y listas. No incluye secretos.

> **Atención:** los estados de la guía representan lo verificado **al 26 de octubre de 2026**. No confundir con el estado actual: revisar el **Anexo de actualización verificada** al final. La parte de automatización es un **diseño propuesto**, no un mecanismo ya desplegado.

Procedimiento comprobado con MetaTraining TEST · Diagnóstico de incidentes ·
Diseño de automatización multiempresa
ESTADO VALIDADO / PENDIENTE DE CIERRE
FE01 MetaTraining en Hacienda TEST: ACCEPTED MariaDB MetaTraining: sin integración configurada y sin
intentos
Firma: guardada; sello de recepción: guardado PRODUCCIÓN: no certificada para MetaTraining
Aislamiento fiscal: API Key y contenedor exclusivos Onboarding automatizado: propuesta; aún no implementado
Alcance: runbook interno para despliegue de firmadores fiscales y handoff de DTE a bases MariaDB externas. No incluye secretos ni
contraseñas. No equivale a autorización fiscal productiva.
Evidencia utilizada: conversación técnica de puesta en marcha MetaTraining/TrustMe; documentación maestra y diseño commerce/sales +
commerce/dte del proyecto; lectura de código GitHub y consultas de solo lectura a Supabase del 27 oct 2026.

## 01 Resumen y estado realmente comprobado

MetaTraining superó el proceso completo de generación → validación → firma → transmisión →
aceptación para una Factura Electrónica FE 01 en ambiente TEST. El objetivo de esta guía es
reproducir ese resultado sin volver a improvisar configuraciones para cada nuevo cliente.
Prueba / componente Resultado al cierre
Venta de certificación VTA-2026-10-0006; USD 100.00
Documento técnico 5870cfa6-2a32-411a-bc62-1f99d561c9f6
Ambiente y tipo TEST; FE 01
Estado fiscal ACCEPTED, firma y sello persistidos
Firmador propio dte-firmador-metatraining-test, loopback 127.0.0.1:8115
Entrada pública https://firmador-metatraining-test.getzolvi.com/firmardocumento/
Credencial emisor ISSUER_CREDENTIAL; API Key individual correcta tras ajuste
Destino MariaDB NO CONFIGURADO en Control Plane para MetaTraining
DTE en MariaDB No comprobado; 0 logs EXTERNAL_DELIVERY de ese DTE

### Distinción obligatoria de estados

- ACCEPTED confirma respuesta de Hacienda TEST; no confirma entrega externa, impresión, correo ni operación en
PRODUCCIÓN.
- EXTERNAL_DELIVERY es otra operación, posterior a la aceptación fiscal, con trazabilidad específica.
- El funcionamiento de MetaTraining en TEST no autoriza trasladar credenciales o certificados de TrustMe.

### Separación de clientes

El despliegue utiliza un firmador por cliente/ambiente y claves de acceso independientes. En el entorno runtime
auditado, las consultas de MetaTraining se realizaron sobre una base física que también aloja datos de TrustMe, con
filtrado lógico por tenant/location. Por tanto, no debe declararse aislamiento físico dedicado de base de datos como
validado en este caso; es una verificación de arquitectura pendiente.

## 02 Arquitectura operativa y límites

Capa Implementación comprobada / contrato
Cliente Zolvi Aplicación Next.js selecciona tenant/location, emisor y ambiente fiscal.
Credencial del emisor DteCredential cifrado: signerUrl, signerNit, signerPrivateKeyPassword y signerApiKey.
Firmador por cliente Docker `svfe/svfe-api-firmador:v20230109` + certificado privado + puerto local dedicado.
Borde HTTPS Apache/cPanel + dominio de firmador; exige X-DTE-Signer-Key.
Hacienda Firma JWS previa, transmisión TEST/PRODUCTION por ambiente, recepción de sello.
MariaDB opcional Resolver por organización desde PlatformExternalIntegration tipo DTE_MARIADB.

### Control fiscal

La misma venta no se regenera ni retransmite para probar MariaDB. Se reutiliza el DTE ya
ACCEPTED y se ejecuta solo la acción de entrega externa, una vez que el destino esté
validado.

## 03 Runbook reproducible: nuevo cliente TEST

Este es el proceso operativo derivado de MetaTraining. Las verificaciones están probadas; el asistente de
automatización descrito después todavía no existe. Los comandos aquí son diagnósticos de solo lectura, salvo las
acciones administrativas explícitas que requieren control de cambios.

### Paso A · Alta lógica y alcance

- Registrar la organización, tenant/location, hostname y ambiente TEST; documentar NIT, NRC y sucursal sin copiar
datos de otro emisor.
- Confirmar qué base runtime usa el cliente. Si la política de despliegue exige Dedicated DB Only, certificar físicamente
su perfil antes de producción.
- Asignar un identificador estable (slug) para el firmador y un puerto local libre. Nunca reutilizar el puerto o el volumen
de otro cliente.

### Paso B · Preparar firmador aislado

- Crear carpeta privada para certificados y montar únicamente el certificado autorizado del emisor como volumen
read-only.
- Usar contenedor independiente, límite de memoria, política de reinicio, logs y puerto publicado solo en 127.0.0.1.
- No exponer directamente el puerto de Docker a Internet. Mantener un respaldo de la configuración antes de tocar
Apache.

### Paso C · Exponer HTTPS y proteger

- DNS A del subdominio del firmador hacia el VPS, vhost HTTPS con certificado TLS válido,
ProxyPass/ProxyPassReverse hacia el puerto local.
- Generar un secreto aleatorio de alta entropía por emisor/ambiente. Guardarlo en archivo privado 0600 y configurar
Apache para exigir X-DTE-Signer-Key.
- Conservar excepción .well-known cuando corresponda para validación del certificado TLS; evitar alterar otros
virtualhosts.
- Modelar el vhost desde la plantilla probada, versionada y parametrizada; no improvisar reglas distintas por cliente.

### Paso D · Registrar credenciales fiscales en Zolvi

- Guardar URL completa terminada en /firmardocumento/, NIT del certificado, contraseña privada, datos MH y API
Key individual en sus campos correctos.
- Verificar que signerApiKey no sea igual a apiPassword ni a signerPrivateKeyPassword. No imprimir ni registrar
secretos.
- Bloquear el autocompletado accidental del navegador y validar la huella de la clave en servidor, no su valor legible.

### Paso E · Preflight antes de emitir

Verificación Resultado esperado
Apache `httpd -t` = Syntax OK; vhost correcto
Acceso sin clave HTTP 403; denegado
GET con clave válida HTTP 405 u otra respuesta del firmador que confirme acceso; depende del
endpoint
POST controlado con `{}` Respuesta JSON del servicio; no demuestra firma real
Huella de clave VPS, configuración Apache y credencial Zolvi coinciden
Aislamiento Firmadores/tenants ajenos inalterados

## 04 Incidente MetaTraining: diagnóstico y solución


### Secuencia observada

Hecho Evidencia
Tres intentos de firma fallidos HTTP 403; estado permaneció SCHEMA_VALIDATED
Apache generó AH00124 Bucle de redirecciones internas al procesar fallos; síntoma adicional, no causa
probada del rechazo
Se verificó el VPS API Key del archivo privado y condición de Apache: COINCIDE
Resolución Zolvi ISSUER_CREDENTIAL, no fallback global de TrustMe
Error real signerApiKey de MetaTraining era idéntica a apiPassword de Hacienda
Corrección realizada Se guardó la API Key correcta en campo signerApiKey
Prueba tras corrección Firma SIGNED y transmisión ACCEPTED con sello

### Huella de verificación (sin secretos)

La comparación SHA-256 de 16 caracteres usada en la investigación fue c28ab3458908eb5d para la clave correcta del
VPS y de Zolvi tras corregirla. Es una huella parcial de referencia del incidente, no una contraseña ni un token para
reutilizar en nuevos clientes.

### Errores que no deben repetirse

- No asumir que todo 403 es un fallo de Apache: primero confirmar cuál clave envía la aplicación.
- No modificar varias capas simultáneamente: observar, aislar causa, cambiar un parámetro, comprobar, registrar.
- No confundir contraseña MH, contraseña de llave privada, contraseña del VPS y API Key del firmador.
- No registrar ni compartir la API Key real; cualquier secreto expuesto debe rotarse bajo un procedimiento controlado.
La huella sola no autentica.

### Controles preventivos propuestos

En el formulario de credenciales: autoComplete="new-password" o "off" según campo/navegador, nombres
inequívocos, confirmación visual de campos editados, chequeo servidor para detectar igualdad accidental entre API Key
y contraseña MH, y prueba de huellas/alcance por emisor antes de guardar como READY. El navegador puede ignorar
ciertas pistas de autocompletado; no basta con el atributo HTML.

### Consulta segura de estado en la base runtime

SELECT d.dte_status, d.environment,
(d.signed_jws IS NOT NULL) AS signed,
(d.reception_stamp IS NOT NULL) AS has_stamp
FROM dte_outgoing_documents d
WHERE d.id = :dte_id;
Utilizar un parámetro DTE autorizado y acceso de solo lectura. No mostrar signed_jws, documentos fiscales completos ni datos de clientes.

## 05 MariaDB: entrega pendiente y contrato existente

Al corte de esta guía la integración NO está configurada para MetaTraining en la tabla Control Plane
platform_external_integrations (tipo DTE_MARIADB), y el FE01 aceptado no registra operaciones
EXTERNAL_DELIVERY. Por tanto, no hay evidencia de inserción en MariaDB. Esta es la siguiente etapa, separada de la
certificación ante MH.

### Qué implementa hoy el repositorio

Componente Comportamiento comprobado en código
resolve-external-dte-destination.ts Resuelve por organizationId; si existe organización sin integración, retorna
NOT_CONFIGURED.
deliver-dte-to-external-db.service.ts Exige DTE recibido por MH con sello; construye payload, llama adapter y
registra DteTransmissionLog.
build-external-dte-payload.service.ts JSON DTE en raíz + codigoEmpresa (NRC) + responseMH + token (JWS).
external-dte-mariadb.adapter.ts Un INSERT preparado con mysql2/promise en tabla configurada; sin
SELECT, autocommit del servidor.
deliver-dte-to-external-db.action.ts Autorización/tenant/location; acceso runtime controlado, confirmación si
aplica.
Interfaz de DTE salientes Acción "Enviar DTE externo" y resumen Entregado / Intentos / Último error.

### Contrato INSERT-only

INSERT INTO `<database>`.`<table>`
(`json`, `estado`, `fechah_creacion`)
VALUES (?, ?, NOW());
El adapter pasa un JSON serializado y el estado "1". La base y tabla provienen del destino configurado por organización. No se
permite SELECT con la credencial externa de inserción.

### Antes de conectar a MetaTraining

- Definir y aprobar si MetaTraining tendrá MariaDB propia o una base/tabla del proveedor estrictamente segregada.
No suponer que el destino de TrustMe corresponde a MetaTraining.
- Obtener host, puerto, base, tabla, usuario INSERT-only, contraseña, reglas de red y esquema requerido del receptor;
guardar cifrado, nunca en chat ni PDF.
- Crear la integración activa de tipo DTE_MARIADB asociada exclusivamente a la organización MetaTraining en
Control Plane. Primero validar disponibilidad/conectividad sin insertar DTE reales.
- Verificar que el payload de TEST sea aceptado por el destino previsto y que el receptor soporte documentos de
ambiente TEST.

### La primera entrega de MetaTraining

Tras configurar y comprobar el destino: seleccionar el DTE ACCEPTED existente en la interfaz de DTE salientes, revisar
la organización, ambiente y nombre de destino, y ejecutar una sola vez "Enviar DTE externo" con autorización
administrativa. No volver a firmar ni retransmitir a MH. Confirmar log EXTERNAL_DELIVERY con ok=true,
affectedRows >= 1, tabla/base esperadas y la constancia del sistema receptor. Si hay resultado incierto, no reintentar a
ciegas.

## 06 MariaDB: verificación y riesgos técnicos


### Consulta de auditoría para el DTE MetaTraining

SELECT operation_type, created_at,
response_body->>'ok' AS ok,
response_body->>'affectedRows' AS affected_rows,
response_body->>'targetDatabase' AS target_database,
response_body->>'targetTable' AS target_table,
error_message
FROM dte_transmission_logs
WHERE dte_document_id = :dte_id
AND operation_type = 'EXTERNAL_DELIVERY'
ORDER BY created_at DESC;
Estado observado al corte: cero filas. Esta lectura audita el resultado del adaptador registrado por Zolvi; no sustituye la confirmación del receptor
cuando el resultado de una inserción es incierto.

### Hallazgos de endurecimiento antes de automatizar

Hallazgo Acción recomendada
No hay integración MetaTraining en Control Plane Registrar destino propio. El backend debe seguir rechazando
NOT_CONFIGURED.
El adapter reconoce resultado del INSERT por
affectedRows numérico
Exigir explícitamente affectedRows >= 1 antes de declarar éxito; agregar
prueba.
Inserción externa y escritura de log son dos
acciones separadas
Crear outbox/idempotency key durable para no repetir INSERT si se
pierde el log.
No se observó guard de duplicados previo al
INSERT en el service
Agregar defensa antes de implementar reintentos o envíos automáticos.
El éxito en el destino no garantiza entrega
PDF/email al receptor
Separar métricas "INSERT registrado" de "PDF/correo entregado".
Cadena de credenciales individual Impedir fallback entre organizaciones y pruebas cross-tenant de extremo
a extremo.

### Regla de reintentos segura

No automatizar reintentos de MariaDB con el adaptador actual sin antes resolver idempotencia. El contrato vigente es
INSERT-only; si hay timeout después de un INSERT aceptado, el emisor puede no saber si el receptor persistió el
registro. La solución objetivo es un identificador estable por documento/organización/ambiente con deduplicación
aceptada por el destino o un acuse externo verificable, sin conceder SELECT al usuario INSERT-only.

### Evidencia de cierre MariaDB - criterio GO

- Destino por organización activo, segregado y auditado.
- Prueba de conectividad segura, con puerto y tabla esperados.
- Un EXTERNAL_DELIVERY exitoso del FE01 TEST, con affectedRows >= 1 y evidencia del sistema externo.
- Prueba de no duplicación ante doble clic, timeout y reintento.
- Prueba negativa de organización ajena: nunca escribe en el destino de TrustMe.

## 07 Automatización propuesta: onboarding fiscal

Objetivo: convertir el proceso de cinco horas de MetaTraining en un alta repetible de tres pasos
operativos, manteniendo aprobación humana para secretos, configuración fiscal y pruebas reales.
Este diseño es una propuesta; no se ha implementado ni certificado todavía.
Etapa objetivo Responsabilidad de la plataforma
1. Registrar emisor Wizard: organización, tenant/location, ambiente, NIT/NRC, hostname y opción de entrega
externa.
2. Preparar infraestructura Orquestador idempotente: puerto/contendor/volumen, DNS/TLS, proxy HTTPS, API Key,
credencial Zolvi, rotación y auditoría.
3. Certificar y activar Preflight automático seguro + firma TEST expresamente autorizada + sello MH + delivery
externo opcional.

### Diseño mínimo del orquestador

- Una especificación declarativa por organización/ambiente: slug, identity IDs, runtime profile, signer profile, hostname,
tipo de certificado, destino opcional MariaDB y estado deseado.
- Aplicación idempotente: si existe el recurso, verificar drift y reparar solo lo permitido; nunca crear dos contenedores,
dos claves o dos vhosts por reintento.
- Plantillas versionadas Docker Compose + Apache/cPanel, despliegue transaccional por etapas: provisionar, validar,
habilitar. Certificado montado read-only, UID/permiso restringido, sin exposición pública del puerto.
- Secretos separados por organización/ambiente: acceso administrativo restringido, cifrado en Control Plane y rotación
con pruebas, sin impresión en terminales o logs. Nunca una clave global por defecto para un runtime dedicado.
- Preflight por capas: DNS/TLS, HTTP sin clave 403, autenticado responde desde backend, prueba de
certificado/identidad de emisor, firma autorizada, validación MH TEST, aislamiento cruzado y MariaDB solo si
corresponde.
- Registro de auditoría y reversión: entradas por fase, origen del error, hash no reversible, tiempo, responsable, run ID y
rollback del recurso propio sin alterar otros clientes.

### Estados propuestos para el onboarding

DRAFT -> VALIDATING -> INFRA_READY -> SIGNER_READY
-> MH_TEST_ACCEPTED -> [MARIADB_READY] -> READY_TEST
-> (aprobacion MH y controles PROD) -> READY_PROD
Los estados entre corchetes corresponden a capacidades opcionales; una organización sin MariaDB no debe quedar bloqueada para emitir DTE,
pero su entrega externa permanecerá deshabilitada.

## 08 Plan de implementación y criterios de aceptación

Fase Entregable No-GO si...
A · Corrección
inmediata
Formulario: campos seguros, preflight huella/cadena de origen,
mensajes de error específicos.
Se pueden confundir
apiPassword y signerApiKey.
B · Infra
reproducible
Plantillas versionadas + CLI/orquestador idempotente +
dry-run/rollback.
Dos clientes terminan
compartiendo certificado, puerto
o API Key.
C · Control Plane Wizard admin, estado de firmador por org/ambiente, aprobación
y auditoría.
Un usuario puede aprovisionar
otra organización.
D · MariaDB por
cliente
Configuración cifrada org-scoped, preflight, idempotencia,
observabilidad, tests.
No hay deduplicación o destino
puede heredarse de otro cliente.
E · Certificación de
regresión
TrustMe TEST/PROD intactos + MetaTraining TEST + emisor
sintético tercero.
No pasan pruebas cross-tenant o
TEST puede caer en PROD.

### Matriz mínima de pruebas automáticas

- API Key correcta/incorrecta/ausente; clave de un cliente distinta a la de otro; contraseña MH nunca enviada como
signerApiKey.
- Firma TEST en emisor correcto; rechazo si no coincide NIT/certificado, ambiente, tenant o location.
- Plantilla Apache: configuración valida, seguridad del puerto local, TLS, reglas .well-known y no interferencia en
TrustMe.
- MariaDB: destino org A/B distinto; NOT_CONFIGURED fail closed; usuario INSERT-only; cero duplicados con
retry/doble clic; logs correctos.
- Pruebas de recuperación: fail de DNS, vencimiento TLS, contenedor caído, clave rotada, timeout MH, timeout insert
externo.

### Priorización recomendada

Prioridad Qué hacemos
P0 · Ahora Cerrar destino MariaDB de MetaTraining, una prueba insert-only controlada y evidencia del
receptor.
P1 · Próximo sprint Protección de credenciales + preflight y diagnóstico sin secretos; documentar plantilla única
firmador.
P2 · Siguiente etapa Provisionador reproducible/idempotente y creación de integraciones MariaDB por
organización.
P3 · Antes de escalar Onboarding guiado, colas de entrega e idempotencia, pruebas integrales con cliente tercero.

## 09 Checklist de operación y handoff


### Antes de habilitar un emisor TEST

- [ ] Organización y ambiente correctos; tenant/location y base runtime confirmados.
- [ ] Certificado del NIT correcto, con permisos 0600 y volumen read-only.
- [ ] Contenedor aislado, puerto solo loopback, vhost HTTPS y TLS válidos.
- [ ] Clave VPS/Apache/Zolvi individual verificada por huella, sin divulgar secretos.
- [ ] Credenciales MH y firma independiente; preflight de red aprobado.
- [ ] FE01/otro tipo requerido: generado, validado, firmado y aceptado por MH TEST.
- [ ] DteTransmissionLog y sello registrados; evidencia archivada.

### Si la organización requiere MariaDB

- [ ] Destino aprobado (host/puerto/base/tabla) y credenciales INSERT-only propias.
- [ ] PlatformExternalIntegration DTE_MARIADB activa, cifrada y vinculada a la organización.
- [ ] Prueba de aislamiento del destino y validación de esquema y entorno TEST.
- [ ] Mecanismo de idempotencia/duplicados revisado antes de reintentos.
- [ ] EXTERNAL_DELIVERY con ok, affectedRows >= 1 y tabla correcta.
- [ ] Acuse/verificación del receptor de PDF/correo si forma parte del servicio.

### No confundir estos cuatro hitos

Hito Prueba mínima
SIGNED JWS generada y persistida
ACCEPTED Sello de Hacienda recibido y persistido
EXTERNAL_DELIVERY INSERT confirmado y log creado contra destino autorizado
ENTREGADO AL CLIENTE PDF/correo/archivo confirmado por proveedor externo, si aplica

### Fuentes y alcance de evidencia

Documentación del proyecto: PLATAFORMA-MASTER.pdf; diseno_tecnico_commerce_sales_dte.pdf;
Especificacion_Tecnica_Plataforma_Modular.pdf; Guia_Operativa_Plataforma_Modular_Final.pdf;
Modelo_Despliegue_Plataforma_Base.pdf.
Código actual: DteCredential / dte-signer.config / dte-signer.adapter; deliver-dte-to-external-db.service;
resolve-external-dte-destination; build-external-dte-payload; external-dte-mariadb.adapter; action y UI de DTE salientes; tests de
aislamiento por organización. Repositorio Dimas2211/web-app-gym, revisión de rama predeterminada.
Consultas verificadas de solo lectura: runtime `trustme-runtime` (DTE ACCEPTED, sello y firma, cero EXTERNAL_DELIVERY) y
Control Plane (MetaTraining sin integración DTE_MARIADB). No se consultó ni modificó una instancia MariaDB externa.
Nota de seguridad: este documento excluye API Keys, contraseñas, certificado privado, URLs con credenciales y el token JWS. Los datos técnicos y
el estado operativo pueden cambiar con nuevas implementaciones; validar la versión antes de ejecutar cambios.

---

## Anexo — Actualización verificada posteriormente (10 de noviembre de 2026)

**Este anexo es posterior al PDF original; no modifica el texto histórico.** Se basa en lectura reciente del repositorio y consultas de solo lectura a las bases.

| Componente | Estado verificado |
|---|---|
| MetaTraining TEST | Emisor TEST activo, una credencial activa; FE01 aceptado por Hacienda |
| MariaDB MetaTraining | `PlatformExternalIntegration` tipo `DTE_MARIADB` activa; `last_test_status=SUCCESS` |
| Primera entrega externa | `EXTERNAL_DELIVERY` exitoso, `affectedRows=1`, tabla `dtes_metatraining`, 30/10/2026; **no volver a insertarlo** |
| MetaTraining PRODUCTION | No existe `DteIssuerConfig(PRODUCTION)` en el runtime consultado ni credenciales PROD allí |
| Base dedicada | MetaTraining no tiene `PlatformDatabaseProfile` registrado en Control Plane; antes de afirmar Dedicated DB Only debe reconciliarse dónde opera físicamente |
| Firmador MetaTraining PROD | Sin verificación de infraestructura ni autorización productiva MH |
| Aprovisionamiento WHM / Docker | Diseñado en la guía; no implementado como proceso automático |
| Alta guiada MariaDB y outbox | Pendientes; la integración manual por organización ya funciona |
| Preflight PROD actual | Comprueba algunas URLs de firmador globales; revisar su resolución por emisor |

**Seguimiento de implementación:** GitHub [issue #10](https://github.com/Dimas2211/web-app-gym/issues/10) (firmadores), [issue #12](https://github.com/Dimas2211/web-app-gym/issues/12) (MariaDB), [PR borrador #11](https://github.com/Dimas2211/web-app-gym/pull/11) (primer hito documental).

**Uso eficiente por Claude:** leer este Markdown como guía principal de onboarding fiscal; complementar únicamente con `CLAUDE.md`, `docs/context/current-state.md` y los archivos de código concretos del módulo. No abrir otra vez el PDF salvo una duda de presentación o una discrepancia de extracción. No volver a leer toda la documentación histórica.