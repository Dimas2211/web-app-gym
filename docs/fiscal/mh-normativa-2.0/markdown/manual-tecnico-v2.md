<!-- Fuente: originales/Manual Técnico para la Integración Tecnológica del Sistema de Transmisión v2.pdf | Páginas: 35 | Derivado con PyMuPDF 2.0 reconstruyendo líneas desde coordenadas de caracteres (XML de MuPDF: bbox y texto de cada línea, incl. /ActualText); pymupdf4llm y la agrupación por bloques descartaban el texto de este PDF. Huecos horizontales amplios = doble espacio; las tablas quedan como filas de texto. El PDF original es la fuente oficial. -->


<!-- PAGE 1 / 35 -->

Manual Tecnológico para la Integración del

Sistema de Transmisión

V2.0

Ministerio de Hacienda

<!-- PAGE 2 / 35 -->

Control de Versiones

Detalle Versión  Fecha  Detalle de Cambios

1.0  10/2022  Versión inicial del documento.

2.0  05/2026  Se actualiza información por cambios en Normativa de Cumplimiento de los DTE versión 2.0 y apartado Consideraciones adiciones.

<!-- PAGE 3 / 35 -->

ContenidoIntroducción
................................  ................................  ................................  ................................  ............................  1
Objetivo General.  ................................  ................................  ................................  ................................  ..................  2
Objetivos Específicos.  ................................  ................................  ................................  ................................  .......... 2
1. Flujo de Autenticación  ................................  ................................  ................................  ................................  .. 3
1.1 Autenticación para API (Sistema de Transmisión DTE)  ................................  ................................  ........ 3
2. Solución de Firma Electrónica  ................................  ................................  ................................  ...................  4
2.1 Opciones  para Instalación  ................................  ................................  ................................  ........................  4
2.2 Consumo de Servicio de la Solución de Firma Electrónica  ................................  ...........................  10
3. Flujo para Recepción de Documentos  ................................  ................................  ................................  ... 12
3.1 Holguras en la transmisión  ................................  ................................  ................................  ......................  13
3.2 Proceso de Contingencia  ................................  ................................  ................................  ........................  13
3.2.1 Funcionamiento Operativo Evento de Contingencia  ................................  ................................  14
3.3 Política de Reintentos  ................................  ................................  ................................  ...............................  14
3. 4 Servicio de Recepción por Lotes  ................................  ................................  ................................  ........... 15
4. APIS - Sistema Transmisión de DTE  ................................  ................................  ................................  ......... 16
4.1 Servicio de Autenticación  ................................  ................................  ................................  .........................  16
4.2 Servicio de Recepción  ................................  ................................  ................................  ..............................  18
4.2.1 Modelo Uno a uno  ................................  ................................  ................................  .............................  18
4.2.2 Modelo en Lote  ................................  ................................  ................................  ................................  . 20
4.3 Servicio de Consulta  ................................  ................................  ................................  ................................  23
4.3.1 Consulta de DTE  ................................  ................................  ................................  ................................  23
4.3.2 Consulta de Lote DTE  ................................  ................................  ................................  ......................  25
4.4 Servicio de envío para Evento Contingencia  ................................  ................................  .....................  27
4.5 Servicio de envío para Evento de Invalidación  ................................  ................................  ..................  28
5. Código QR  ................................  ................................  ................................  ................................  ....................  30
6. Consideraciones adicionales  ................................  ................................  ................................  ...................  30
6.1 Formato y Estructura de Datos  ................................  ................................  ................................  .............. 30
6.2 Consumo de Servicios (API) y Endpoints  ................................  ................................  .............................  31
6.3 Cumplimiento Normativo y Reglas de Negocio  ................................  ................................  ................ 31
7. Glosario ................................  ................................  ................................  ................................  .........................  32

<!-- PAGE 4 / 35 -->

Intro

ducciónLa implementación exitosa de un sistema de facturación electrónica a nivel corporativo exige el desarrollo de canales de comunicación tecnológica robustos, seguros y altamente escalables. En este contexto, el presente Manual Tecnológico para la Integración

del Sistema de Transmisión V2.0

se constituye como el instrumento de referencia oficial y técnico que norma el proceso de conexión entre los
gestores de facturación electrónica  de los contribuyentes y las interfaces de
programación de aplicaciones (APIs)  provistas por la Administración Tributaria. Este documento

detalla las especificaciones necesarias para interactuar con los servicios web de autenticación, firma digital, transmisión por lotes y gestión de contingencias, garantizando que el flujo de inform
ación

transaccional sea seguro y eficiente.La justificación técnica de este manual reside en la necesidad de estandarizar las prácticas de desarrollo de software bajo principios de interoperabilidad y gobernanza de TI de nivel empresarial. Al proveer un

diseño de arquitectura tecnológica detallado  — que abarca desde la configuración de

contenedores Docker con seguridad TLS hasta las políticas de reintentos y holguras transaccionales
— se mitiga el riesgo de incompatibilidades en el intercambio de datos estr  ucturados

(JSON/JWS). Por consiguiente, la adopción de los estándares establecidos en este manual faculta a las empresas para automatizar sus flujos de trabajo, reducir costos operativos y asegurar el cumplimiento normativo en un entorno de negocios modern
o e interconectado.

<!-- PAGE 5 / 35 -->

Objetivo General.Establecer el marco técnico y metodológico para la integración estandarizada de los
gestores de
facturación electrónica  con la Interfaz de Programación de Aplicaciones (API) del Sistema de
Transmisión  de Documentos Tributarios Electrónicos (DTE), mediante la formalización de

protocolos de autenticación, firma digital y flujos de datos transaccionales, con el propósito de garantizar la interoperabilidad del ecosistema, la seguridad jurídica y la continu
idad operativa de los
contribuyentes.

Objetivos Específicos.

1. Determinar las especificaciones técnicas para la autenticación basada en tokens web (JWT) y el consumo del servicio de firma digital de documentos en formatos estructurados (JSON/JWS), garantiz
ando la compatibilidad con diversas infraestructuras de TI corporativas
(arquitecturas en Java, contenedores Docker y servicios locales de servidor).

2. Definir los puntos de acceso (endpoints), parámetros de cabecera y esquemas de respuesta para la transfer
encia de DTE mediante modelos de procesamiento síncronos y asíncronos,

sistematizando además las políticas de reintentos transaccionales y los procedimientos operativos de contingencia para mitigar el riesgo de indisponibilidad del servicio.

3. Especificar las condiciones lógicas y técnicas para  la transmisión seg  ura de DTE,
formalizando asimismo las reglas de sintaxis (codificación UTF  -8 y validación lógica del
esquema) y la separación de entornos (ambiente de pruebas y ambiente de producción)
para mantener la integridad de los datos.

<!-- PAGE 6 / 35 -->

1. Flujo de Autenticación

1.1 Autenticación para API (Sistema de  Transmisión  DTE )

El contribuyente que utilice los servicios del API de Recepción para el envío de  los DTE, deberá
autenticarse contra la API de Seguridad, para ello deberá enviar el usuario y contraseña a la URI contenido en la sección Servicio de Autenticación de este Manual
.

Las credenciales serán  verificadas  con los datos almacenados en la base de da  tos del módulo de

seguridad. Estas credenciales serán del tipo de aplicación
. Esta contraseña no tiene vencimiento, pero puede
ser modificada a demanda desde  la Consola de Administración de Facturación Electrónica  .

Al respecto del formato, la contraseña deberá contener letras, números, un carácter especial y debe estar entre el rango de 13 a 25 caracteres. En el caso de que las credenciales sean correctas y el usuario exista, se generará un
Token , que
brindar á el a cceso para  el consumo del resto de servicios del sistema de Documentos Tributarios

Electrónicos. A continuación, se especifica el proceso de autenticación para API.La vigencia del token generado mediante

el Servicio de Autenticación  será configurable e  n la
plataforma de servicio, de tal forma que no será necesario realizar por cada envío de documento electrónico el proceso de autenticación, sino
sólo una autenticación cada 24 horas.

<!-- PAGE 7 / 35 -->

2. Solución  de Firma Electrónica

La Administración Tributaria comparte un proyecto de firma de documentos, basado en JAVA, que permitirá al contribuyente firmar los documentos acordes al estándar dictado por el Ministerio de Hacienda. La aplicación es Standalone y no necesita conectividad ha
cia afuera de la infraestructura
del contribuyente. Las opciones son las siguientes:

• Proyecto  Java Spring Boot  .
• Contenedor Docker (con SSL y sin SSL).
• Servicio de Windows.

2.1 Opciones para Instalación

Proyecto  Java Spring  B oot
El proyecto  Java svfe - api -firmador.zip  brinda a los contribuyentes la posibilidad de personalizar a
su gusto la solución provista, para agregar cualquier posible control  adicional.  Este proyecto  se
pondrá a disposición de los contribuyentes  mediante  los canales que esta  Administración Tributaria
estime conveniente  s .

Contenedor Docker Sin SSLLa segunda opción es la instalación y configuración de una imagen de Docker, lista para ejecutar, una vez instalado el software base de Docker, debe proceder
se con los siguientes pas  os para
habilitar el servicio de firmado:

Lo primero  que se necesita es tener instalado Docker Desktop en Windows, o en Linux, las guías

de instalación oficiales las pueden encontrar en el siguiente link:https://docs.docker.com/engine/install/Posteriormente

esta Administración Tributaria le  proporcionará  el archivo  dte -firmador.zip  ,
mediante los canales que estime convenientes  . Leer las indicaciones e  n la carpeta  certificado  . Se
recomienda descomprimir el archivo en una ruta accesible ya sea en Windows y/o Linux.

Luego seguir los pasos a continuación:

1. Ingresar a la carpeta  docker , en ella  se encontrarán  la carpeta certificado,  los archivos
docker -compose.yml  y svfe - api.env .
2. Dentro de la carpeta  certificado  (opcional:  puede ajustar el nombre de la carpeta  donde
aloje sus certificados  dependiendo del  nombre especificado en el apartado  volúmenes  del
archivo docker - compose  . yml )se debe agregar el certificado que fue descargado del sitio,
y renombrarlo solo con el número de NIT del contribuyente.
3. Una vez que se tenga el certificado en la carpeta  certificado  , regresar a la carpeta  d ocker
4. Si:
a. Se usa Windows, abrir una consola de P  owerShell, e ir a la carpeta de  docker y
ejecutar el comando siguiente:  docker compose up  - d .
b. Si se usa Linux, debe ubicar en la ruta donde está la carpeta y ejecuta  r el comando
siguiente:  docker compose up  - d .

<!-- PAGE 8 / 35 -->

5. Confirmar que el contenedor se está ejecutando con el siguiente comando:  docker ps  . Se
mostrar á una respuesta como  la siguiente:

Contenedor Docker con SSL
• Es requerido que est  é instalado la herramienta Docker y ejecutándose en el servidor o
computadora desde el cual se generará la firma, si no  está instalado  se puede descargar e
instalar desde el siguiente link: https://www.docker.com/products/docker  - desktop

Extraer la carpeta  descargada (recomendación C:  \ )

Copiar el certificado proporcionado por  la Administración Tributaria en la carpeta
RUTA_EXTRACCION_CARPETA  \ docker \ certificado  , y renombrarlo sólo con el número de NIT:

<!-- PAGE 9 / 35 -->

Luego regresar a la carpeta  RUTA_EXTRACCION_CARPETA  \ docker

Configuración de SSLDirigirse a la sección:
Ejecución del servicio con docker  - compose  , si no se utilizar  á SSL.

Para utilizar SSL, debe agregar su certificado en la carpeta  ssl , como se muestra a continuación:

En el archivo  docker -compose.yml  , puede cambiar el puerto que se encuentra por defecto (443),
por otro que desee utilizar.

En el archivo  svfe - api.env , se debe actualizar la variable SVFE_ARCHIVO, con el nombre del archivo
correspondiente al certificado  que se ubicó en la carpeta  ssl .

De igual forma, se debe ingresar en el valor de la variable SVFE_PASSWORD, la contraseña que corresponde al certificado anterior.

<!-- PAGE 10 / 35 -->

Ejecución del servicio con docker  -compose

• Si no desea utilizar SSL,  Cambie  la variable SPRING_PROFILES_ACTIVE  = ssl a
SPRING_PROFILES_ACTIVE  = nonssl (Puede comentar las otras variables de entorno)
del archivo  svfe - api.env

A continuación, abr  a una consola de PowerShell  y diríjase  a la carpeta de  docker y ejecut e el

siguiente comando:docker> docker
compose up  - d

La primera vez que se descargue la imagen se ver  á de la forma siguiente:

Para confirmar que la imagen est  á arriba, utilice el siguiente comando:

docker> docker ps

Servicio de WindowsDada las diferentes arquitecturas que pueden poseer los contribuyentes, es conveniente poder proveer una solución aplicable para entornos Windows. A continuación, el detalle para instalar el servicio de firmado, como un servicio más dentro del entorno de Windows. E
l certificado SSL debe
ser el provisto por su organización:

<!-- PAGE 11 / 35 -->

Paso 1.Parametrizar variable de sistema “CERTIFICATE_HOME” con la ruta en la que se ubicará el certificado d
el contribuyente  .

Además, agregar la variable CERTIFICATE_PROFILE con el valor de  ssl o nonssl según sea lo
requerido.

Paso 2.Colocar el certificado de
l contribuyente  con el NIT respectivo  .

<!-- PAGE 12 / 35 -->

Paso 3.
D escomprimir la carpeta FIRMADOR

Paso 4.Mover la carpeta
FIRMADOR a la ubicación deseada y ubicarse ahí mismo (para este ejemplo se
usará C: \FIRMADOR)

Paso 5.Ejecutar:
WinSW.exe install WinSW.xmlWinSW.exe start WinSW.xml

Paso 6: Corroborar instalación y ejecutar: WinSW.exe status WinSW.xml.

Abrir la aplicación de servicio (modo gráfico)

<!-- PAGE 13 / 35 -->

Corroborar en ruta:  http:// IP :8113/firmardocumento/status

Flujo Alterno:

Paso A. En caso necesitar
detener el servicio, ejecutar: sc stop FIRMADOR  - SERVICE

Paso B. En caso de necesitar eliminar el servicio, ejecutar: sc delete FIRMADOR
- SERVICE

En caso de necesitar cambiar el servicio por otra versión:Ejecutar:

Paso A - > Paso B  -> Cambiar el JAR que se encuentra en la carpeta FIRMADOR  - > Paso 5  - > Paso 6

2.2 Consumo de Servicio de  la Solución de  Firma Electrónica

Posterior  mente al proceso de instalación/configuración del servicio de firmado, se detallan los
datos para poder hacer uso del servicio de firmado de  DTE :

<!-- PAGE 14 / 35 -->

URL URL
http://localhost:8113/firmardocumento/
Método  POST

Nota 1: La URL puede variar de acuerdo a la implementació  n.
Nota 2: En caso de experimentar algún inconveniente con la implementación, le recomendamos
descarga  r la última versión.

Parámetros: Parámetro
Descripción  Tipo  Tipo Dato  Ejemplo
content -  application/JSON
Tipo de Contenido  Headers  String
Type

nit  Nit del contribuyente que realizada el proceso de Firmado  String  String  “11111111111114”

Indicador  si
activo  contribuyente está activo  Boolean  Boolean  True

passwordPri  Contraseña de la llave privada del certificado de firma simple  String  String  “123456”

dteJson  Documento JSON del DTE que se desea firmar  String  JSON  [JSON DTE]

Respuesta Exitosa: Campo
Descripción  Tipo Dato
status  Estado resultante de la transacción  String
body  Documento firmado  String

Ejemplos respuesta

ÉxitoCódigo: HTTP/1.1 200 OK
{
    "status": "OK",

    "body": "eyJhbGciOiJSUzUxMiJ9.ew0KICAiaWRlbnRpZmljYWNpb24iIDogew0KICAgICJ2ZXJzaW9uIiA6IDIsDQogICAgImFtYmllbnRlIiA6ICIwMSIsDQogICAgImNvZGlnb0dlbmVyYWNpb24iIDogImQ2Y2ZmZDcxLWUxZGUtNGUyNi05MzU1LTgzOWI1Y2QxMzUyMiIsDQogICAgImZUcmFuc21pc2lvbiIgOiAiMjAyMS0wMy
0yNyIsDQogICAgImhUcmFuc21pc2lvbiIgOiAiMTA6NTE6MDMiDQ

ogIH0sDQogICJlbWlzb3IiIDogew0KICAgICJuaXQiIDogIjEzMTYxNzEwOTMxMDE0IiwNCiAgICAibmZhY3R1cmFkb3IiIDogIjEzMzAwMDQ1MCIsDQogICAgIm5vbWJyZSIgOiAiSm9zdWUgQ2hpY2FzIiwNCiAgICAibm9tYnJlUmVzcG9uc2FibGUiIDogIkpvc3VlIE
NoaWNhcyIsDQogICAgInRpcG9

Eb2NSZXNwb25zYWJsZSIgOiAxLA0KICAgICJub1RlbGVmb25vIiA6ICIyMjk5ODg3NyIsDQogICAgImNvcnJlb0VsZWN0cm9uaWNvIiA6ICJkYXZpZEBkYXZpZC5jb20iDQogIH0sDQogICJkZXRhbGxlRFRFIiA6IFsgew0KICAgICJub0l0ZW0iIDogMSwNCiAgICAiY29kaWdvR2VuZXJhY2lvbiIgOiAiNm
I

3MjcyNGMtYzg1Yi00MmQwLWI3YWMtZjk3YmVjYjRlNDlhIiwNCiAgICAidGlwb0RvYyIgOiAiMDEiDQogIH0sIHsNCiAgICAibm9JdGVtIiA6IDIsDQogICAgImNvZGlnb0dlbmVyYWNpb24iIDogIjYyNTgzNWJkLTFjMzItNDU1ZS1iZWVmLWJlMTkxMjg3YzhjMCIsDQogICAgInRpcG9Eb2MiIDogIjAxIg0KICB9IF0sDQogICJtb3Rpdm
8iIDogew0KICAgICJmSW5pY2lvIiA6ICIyMDIxLTAzLTI3IiwNCiAgI
CAiZkZpbiIgOiAiMjAyMS0wMy0yNyINCiAgfQ0KfQ.mXEP  -
a2x9KMFgWnfnsq97GUYUzFmJVsDaEvXTNqDl7H4lAKgThLYrlSMxw7dFD2aHGKrokc65eyL3hlyUazDJaPh6_SB9z7XU8VoTDtpDS3XJ_rh_R1o6YN30_HcPWI
-

<!-- PAGE 15 / 35 -->

4sgeM8FoiCuyBYAWkYPupUNLa1uE27Z  RfQYGxdX3nU1_E1lu47j4RamkOs_b6A9TVClz9E0KNb5
tk_8UQE_  -em6qOrgdDUjwB3qgmFQlgqJDgC_JGe_P289iMnxLK_CN  -
qfkHOgehi2XYtHRPkQZC7Xic9wRIawyvfnI7N4yELHBk  -
WH_aWvp0yc8Xv3OolgDfzk0vqH9qGtY6upqB  - w - g"
}

Error
{
    "status": "ERROR",
    "body": {
"codigo ": "809",
"mensaje":  [
"Formato  de NIT no valido - (00000000000000)"
]
}
}

 Flujo para Recepción de DocumentosEl proceso de envío de los documentos se describe a continuación:3.

Del diagrama anterior es importante  mencionar:
• La generación del token de seguridad es una vez cada N  m inutos. Para el caso  , en ambiente
de pruebas  será de 48 hrs y para producción será de 24 hrs  (y deberá de  actualizase
nuevamente de ser necesario)  .
• Posteriormente  , el emisor deberá enviar l  a solicitud de recepción al WS de Recepción y
desde el mismo se realizará la primera verificación de firma electrónica, si todo está
correcto , se continua  rá con el proceso.

<!-- PAGE 16 / 35 -->

• Una vez verificada la firma se procede con el envío del documento para su revisión  de
estructura y datos.

• Si el documento cumple con todos los requisitos, la administración emite un sello de recepción para el documento, que es la confirmación para el contribuyente emisor que el documento ha sido recibido con éxito.

3.1 Holguras en la  transmisión

Se recibirán documentos con un día posterior a la fecha de transmisión, exceptuando el último día del período tributario, donde solo se permitirá 30 min. de diferencia hacia adelante en referencia a la fecha y hora del servicio de recepción de
l Ministerio de Hacienda.

3.2 Proceso de Contingencia

La Administración Tributaria ha definido 3 pasos que conforman el proceso para envió de los DTE emitidos en contingencia
,los cuáles se detallan a continuación:

<!-- PAGE 17 / 35 -->

Es importante explicar cómo  operar á la contingencia:

1. Sí el emisor entra en contingencia por  alguna razón, al reestablecer la conexión, deberá
hacer lo siguiente:

a. Generar el evento de contingencia  informando  los DTE emitidos en el periodo de
la contingencia  .
b. Enviar el lote con los DTE  informados  en el literal anterior .

3. 2.1 Funcionamiento Operativo Evento de Contingencia

El envío de los DTE emitidos en contingencia  e informados  mediante el evento  respectivo  se realiza
mediante un servicio de lotes donde las  respuestas NO son inmediatas, dependiendo de la carga
de la plataforma  , un lote de 100 DTE (  q ue es el máximo permiti  do ) se procesa en un promedio de
2 a 3 minutos. Cuando el contribuyente envíe el lote, la plataforma de Documentos Tributarios Electrónicos
dará una respuesta de lote recibido y un código de lote asociado:

{
    "version": 1,
    "ambiente": "00",
    "versionApp": 1,
    "estado": "RECIBIDO",
    "idEnvio": "EC1C165D  - DE8E - 4BDD - B815 -A057A92A795F",
    "codigoLote":  "C86DD410  - 8BD7 - 48D3 - 8908 -61B8C46AFE33",
    "fhProcesamiento": "03/03/2026 09:27:28",
    "clasificaMsg": "10",
    "codigoMsg": "001",
    "descripcionMsg": "LOTE RECIBIDO"
}

Luego , con ese código de  lote el contribuyente consulta  el estado del lote  (pue de enviar cada N
minutos la consulta para verificar el estado), y cuando est  én procesado  s los Documentos
Tributarios Electrónicos, regresar  áun JSON conteniendo el resultado del procesamiento del lote
con el detalle  para cada DTE y su correspondiente Sello de recepción.  E n este Manual  se especifica
la URL y forma de invocación del servicio de consulta de lote.

3. 3 Política de Reintentos

Los contribuyentes emisores implemen  tarán una política de reintentos en cada  proceso de envío
de DTE, respetando las siguientes reglas:

1. Si al momento de enviar un DTE, el servicio de Documentos Tributarios Electrónicos no responde después
de 8 segundos.
a. Enviar consulta de estado sobre el documento  transmitido  , para verificar si no  ha
sido recibido.
b. Si no ha sido recibido,  enviar una nueva solicitud para recepción. Repetir hasta
obtener la respuesta exitosa, un máximo de 2 veces  .

2. Si al momento de enviar un DTE, el servicio del emisor falla y no procesa la respuesta del servicio de
recepción.

<!-- PAGE 18 / 35 -->

a. Enviar consulta de estado sobre el documento  transmitido  , para verificar si no ha
sido recibido.
b. Si no ha sido recibido,  enviar una nueva solicitud para recepción. Repetir hasta
obtener la respuesta exitosa, un máximo de 2 veces  .

El umbral de  espera está configurando  inicialmente en  8 segundos, previo  a las optimizaciones de

infraestructura.Si después de aplicar la política de reintentos
los documentos  no puede  n ser recibid  os por el
Ministerio de Hacienda, y/o procesad  as las respuestas  por el sistema del emisor, se inici  a
operaciones en modalidad de contingencia.

3. 4 Servicio de Recepción por Lotes

i. Ambiente de pruebasPara el procesamiento de la información de lotes en ambiente de pruebas, el máximo de DTE por lote será de 100 documentos, en un máximo de hasta
400 lotes.

Los que serán procesados, cada lote de 100 DTE en un  promedio de 2 a 3 minutos  cada uno. El
horario de recepción  de lotes será de 08:00 am a 05:00 pm  .

ii. Ambiente productivo

<!-- PAGE 19 / 35 -->

Para el procesamiento de lotes  de documentos  en ambiente productivo, el máximo de DTE por
lote será de 100 documentos, en un máximo de  400 lotes.

Los que se  rán procesados, cada lote de 100 DTE en un  promedio de 1 a 3 minutos  cada uno. El
horario de recepción ser  á de 10:00 pm a 05:00 am.

iii. Diferencia para emisión de DTE en Contingencia

El evento de contingencia hace uso del servicio de lotes y el servicio de  consulta de lotes para la
transmisión  y recepción de los DTE,  los horari os para el envío de lotes de DTE por contingencia
están abiert  o s 24 horas del día 365 días del año.

La restricción de horarios para la  transmisión  de lotes  de documentos  está establecida para los
contribuyentes que  posean facturación cíclica.

4. APIS - Sistema  Transmisión de  DTE

A continuación, se detallan los aspectos necesarios para integración y consumo de los servicios de documentos tributarios electrónicos.
L os servici os de documentos tributarios electrónicos son del
tipo REST .

4.1 Servicio de AutenticaciónEl servicio de autenticación es el componente que habilitar
á al contribuyente emisor a obtener, con
sus credenciales de acceso, un token de seguridad que le habilitar  á para el consumo del resto de
servicios dentro del  módulo de recepción de la plataforma de documentos tributarios electrónicos.
Sin la generación de  dicho token, es imposible consumir los servicios de recepción.

URL URL TEST
https://apitest.dtes.mh.gob.sv/seguridad/auth
URL PROD  htt ps://api.dtes.mh.gob.sv/seguridad/auth
Método  POST

Parámetros Parámetro
Descripción  Tipo  Tipo Dato  Comentarios
content - Tipo de Contenido
Headers  String  application/x  - www - form -urlencoded
Type

Agente de usuario desde donde se origina
User - Agent  Headers  String
la petición
user  Usuario  Body  String  facturador01
pwd  Contraseña  Body  String  Password del usuario asignado

<!-- PAGE 20 / 35 -->

Respuesta: Campo
Descripción  Tipo Dato
status  estado de la petición  String
body.user  usuario que solicita acceso  String
body.token  token/clave de acceso para consumo de servicio de recepción  String

body.rol.nombre  nombre del rol asignado  String
body.rol.codigo  código del rol asignado  String
body.rol.descripcion  descripción del rol asignado  String
body.rol.rolSuperior  Rol padre del rol asignado al usuario  Object
body.rol.nivel  nivel de rol asignado  String
body.rol.activo  Estado del rol devuelto para el usuario  Boolean
body.rol.permisos  permisos asignados al rol  Array
tokenType  Tipo de token utilizado  String
roles  listado de roles asignado al usuario  Array

Ejemplos respuestaÉxitoCódigo: HTTP/1.1 200 OK

{
    "status": "OK",
    "body": {
"user": "10101010101010",
"token": "Bearer eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI0NDQ0NDQ0NDQ0NDQ0MyIsImF1d

Ghvcml0aWVzIjpbIlVTRVIiLCJVU0VSX0FQSSIsIlVzdWFyaW8iXSwiY19uaXQiOiI0NDQ0NDQ0NDQ0NDQ0MyIsImNfZHVpIjoiNDQ0NDQ0NDQ0NDQ0NDMiLCJpYXQiOjE3NzI1NTE3ODcsImV4cCI6MTc3MjYzODE4N30.fBU8HLEQQ8rebeIcnECCK4UP5rjWj
-
nwpzTuwei7nUHiZznaRF033yaUzltE3Y4Ygd98S_clrNfM5LsdfzuIrQ",
"rol": {
"nombre":  "Usuario",
"codigo":  "ROLE_USER",
"descripcion":  null ,
"rolSuperior":  null ,
"nivel": null ,
"activo" : null ,
"permisos":  null
},
"roles": [
"ROLE_USER"
],
"tokenType":  "Bearer"
}
}

Error
{
    "status": "ERROR",
    "error": "Unauthorized",
    "message":  "Usuario no valido"
}

<!-- PAGE 21 / 35 -->

El servicio de  autorización se deber  áejecutar una vez en el día o según sea el modelo de facturación
del contribuyente.

E l token es necesario en  el uso de cada servicio pues es la llave que permite la ejecución de

los servicios de documentos tributarios electrónicos.Código de Respuesta

Código de respuesta  Respuesta

200  Status: okBody: Se recupera el JSON
Web Token
Status: Error  controlado
200
Body: Se presenta un mensaje describiendo el posible fallo.
100  ERROR USUARIO INCORRECTO
101  ERROR CONTACTAR CON SOPORTE  TÉCNICO
102  ERROR NO SE PUDO AUTENTICAR EL USUARIO
103  CONTRASEÑA EXPIRADA, POR FAVOR ACTUALIZAR
104  ERROR EN ACTUALIZACIÓN DE CONTRASEÑA
105  LA NUEVA CONTRASEÑA Y LA CONFIRMACIÓN DEBE SER LA MISMA
106  CREDENCIALES INVÁLIDAS
107  ERROR TOKEN INVÁLIDO
108  ERROR TOKEN ES REQUERIDO
109  ERROR EN GENERACION DE TOKEN
110  ERROR EN TIPO REQUERIDO
111  ERROR EN PARÁMETRO SOLICITADO

4.2 Servicio de Recepción

La recepción  de documentos  puede ser procesada  uno a uno o  en lote:

4.2.1 Modelo Uno a uno

URL URL TEST
https://apitest.dtes.mh.gob.sv/fesv/recepciondte
URL PROD  https://api.dtes.mh.gob.sv/fesv/recepciondte
Método  POST

Parámetros Parámetro
Descripción  Tipo  Tipo Dato  Comentarios
Authorizatio  Token de autorización
Headers  String  Token obtenido por el servicio de autenticación.
n
User - Agent  Agente de usuario  . Headers  String  Agente de usuario desde donde se origina la
petición.
content -  application/JSON
Tipo de Contenido  Headers  String
Type
Ambiente:  “00” P rueba; “01”
ambiente  Código de ambiente.  Body  String
P roducción.

<!-- PAGE 22 / 35 -->

Parámetro  Descripción  Tipo  Tipo Dato  Comentarios

idEnvio  Identificador de envío de la transmisión.  Body  Integer  Campo correlativo a discreción.

version  Versión del JSON del DTE.  Body  Integer  Debe coincidir con la versión del de la sección de Identificación del DTE.

Debe coincidir con  el tipo de DTE
tipoDte  Tipo de DTE.  Body  String  de la sección de Identificación del DTE.

documento  DTE .  Body  String  Documento Tributario Electrónico firmado a transmitir.
Número  identificador único,
codigoGeneracion  Código de Generación  Body  String  aleatorio y universal, en formato UUID versión 4, que servirá para
su correcta identificación

Respuesta Campo
Descripción  Tipo Dato
version  Versión de Respuesta  Integer
ambiente  Ambiente de Ejecución  String
versionApp  Versión de aplicación  Integer
estado  Estado resultando del procesamiento  String
Código de generación de DTE  (número identificador
codigoGeneracion  único, aleatorio y universal, en formato UUID versión 4, que servirá para  String
su correcta identificación  )
selloRecibido  Sello de Recepción del DTE Aceptado  String
fhProcesamiento  Fecha - Hora de procesamiento (dd/MM/yyyy HH:mm:ss  ) String
clasificaMsg  Código de clasificación de mensaje  String
codigoMsg  Código de Mensaje  String
descripcionMsg  Descripción del Mensaje  String
Observaciones  Detalle de observaciones  de validación del DTE  Array [ String]

Ejemplos de Respuesta

ÉxitoCódigo: HTTP/1.1 200 OK
– Sin Observaciones
{
    "version": 2,
    "ambiente" : "00",
    "versionApp" : 2,
    "estado" : "PROCESADO",
    "codigoGeneracion" : "FF84E5DB  - 79C5 - 42CE - B415 -EC510C53EFB5",
"selloRecibido" : "20219E9D4DC0292F4681AD759B0B0F5CA99DC23G",
    "fhProcesamiento" : "12/0  2 /202 6 13:29:04",
    "clasificaMsg" : "10",
    "codigoMsg": "001",
    "descripcionMsg": "RECIBIDO",
    "observaciones": ["",""]
}

<!-- PAGE 23 / 35 -->

NOTA : El servicio de recepción  tendrá como parte de su respuesta el campo observaciones, donde
para algunos campos, detall  ará los inconvenientes con  los datos  enviad os , lo que no afecta
directamente a la recepción del DTE.Código: HTTP/1.1 200 OK
– Con Observaciones

{
    "version":  2,
    "ambiente": "00",
    "versionApp": 2,
    "estado": "PROCESADO",
    "codigoGeneracion": "412A16EF  - A3C9 - 145A - 9B13 -3999CE86FC66",
    "selloRecibido": "20265AE21DAEFC7D4F908350E64BA38F95BDVXW3",
    "fhProcesamiento": "  1 3/0 2 /2026 09:58:57",
    "cla sificaMsg": "10",
    "codigoMsg": "002",
    "descripcionMsg": "RECIBIDO CON OBSERVACIONES",
    "observaciones": [        "identificacion.fecEmi Difiere de la fecha de envío."
]
}

ErrorCódigo: HTTP/1.1 400 Bad Request

{
    "version":  2,
   "ambiente":  "00",
   "versionApp":  2,
   "estado":  "RECHAZADO",
    "codigoGeneracion":  "CF89B21E  - 4268 - 4711 - 832D -8A54866B1763",
   "selloRecibido":  null,
    "fhProcesamiento":  null,
    "clasificaMsg" : null,
    "codigoMsg":  "ERROR_CODIGO",
"descripcionMsg":  "ERROR_DESCRIPCION",
    "observaciones":  null
}

4.2.2 Modelo en Lote

URL URL TEST
https://apitest.dtes.mh.gob.sv/fesv/recepcionlote
URL PROD  https://api.dtes.mh.gob.sv/fesv/recepcionlote
Método  POST

<!-- PAGE 24 / 35 -->

Parámetros: Parámetro
Descripción  Tipo  Tipo Dato  Comentarios
Header  Token obtenido por  el servicio de
Authorization  Token de autorización  String
s  autenticación.
Header
User - Agent  Agente de usuario.  String  Agente de usuario desde donde se origina la petición.
s
Header
content - type Tipo de contenido  String  application/JSON
s

Ambiente: “00”  Prueba; “01”
ambiente  Código de ambiente.  Body  String
Producción.
idEnvio  Identificador de control de envió  Body  String  Debe cumplir con estándar UUID v4, todo en MAYUSCULA.

version  Versión del JSON Schema de Lotes.  Body  Integer

nitEmisor  NIT del emisor  . Body  String  NIT del emisor, sin  guiones
Array[Strin
documentos  Lista de DTE  Body  Lista de Documentos Tributarios Electrónicos
g]  Firmados a procesar

Respuesta: Campo
Descripción  Tipo Dato
version  Versión de Respuesta  Integer
ambiente  Ambiente de Ejecución  String
versionApp  Versión de aplicación  Integer
estado  Estado de la respuesta  String
idEnvio  ID específico del envió de solicitud  String
codigoLote  Código de generación del lote  (número identificador único,  String
aleatorio y universal, en formato UUID versión 4, que servirá para
su correcta identificación  )
fhProcesamiento  Fecha/Hora de procesamiento dd/MM/yyyy HH:mm:ss  String
clasificaMsg  Clasificación de Mensaje  String
codigoMsg  Código de Mensaje  String
descripcionMsg  Descripción del Mensaje  String

ÉxitoCódigo:
HTTP/1.1 200 OK
JSON devuelto ej.:
{
    "version": 1,
    "ambiente": "00",
    "versionApp": 1,
    "estado": "RECIBIDO",
    "idEnvio": "EC1C165D  - DE8E - 4BDD - B815 -A057A92A795F",
    "codigoLote": "C86DD410  - 8BD7 - 48D3 - 8908 -61B8C46AFE33",
"fhProcesamiento": "03/03/2026 09:27:28",
    "clasificaMsg": "10",
    "codigoMsg": "001",
    "descripcionMsg": "LOTE RECIBIDO"
}

<!-- PAGE 25 / 35 -->

Códigos de Respuesta Servicio de Recepción

C ó digo Descripci  ó n
1  RECIBIDO
2  RECIBIDO CON OBSERVACIONES
3  [campo] VALOR NO  VALIDO
4  [campo] YA EXISTE UN REGISTRO CON ESE VALOR
5  [campo] DEBE PROPORCIONAR UN VALOR
6  [campo] FORMATO NO VALIDO
7  [campo] VALOR NO ES PERMITIDO
8  [campo] NO CORRESPONDE A CONTRIBUYENTE
9  [campo] NIT CONTRIBUYENTE NO EXISTE
10  [campo] CONTRIBUYENTE NO SE ENCUENTRA ACTIVO
11  [campo] NO ES CONTRIBUYENTE IVA
12  [campo] NO EXISTE EVENTO DE CONTINGENCIA
13 [campo] NO ESTA ENTRE PERIODO REPORTADO EN EVENTO DE CONTINGENCIA
14  [campo] NO EXISTE UN REGISTRO CON ESTE DATO
15  [campo] DOCUMENTO SE ENCUENTRA INVALIDADO
16 [campo] MONTO ES MAYOR AL DOCUMENTO RELACIONADO
17  [campo] FECHA NO ES CORRECTA
18  [campo] FECHA FUERA DE PLAZO PERMITIDO
19  [campo] ERROR EN CORRELATIVO
20  [campo] CALCULO INCORRECTO
21  [campo] NO SE PUEDE  VALIDAR CAMPO
22  [firma] SERVICIO DE VALIDACION DE FIRMA NO DISPONIBLE
23  [campo] FALTAN DATOS PARA VALIDAR INFORMACION
24  [campo] VALOR EN CAMPO NO APLICA
25  [campo] VALORES REPETIDOS
26  [campo] NO SE PERMITEN VALORES DIFERENTES
27  [campo] DATO NO  COINCIDE CON DTE
28  [campo] DTE ESTA RELACIONADO CON OTRO DTE
29  [campo] NIT DE CONTRIBUYENTE NO ES VALIDO
30  [campo] NIT FUSION NO ES VALIDO
31  [campo] NIT DE CONTRIBUYENTE NO AUTORIZADO
32  [campo] DIFIERE DE LA FECHA DE ENVIO
33  [campo] DOCUMENTO  SIN SELLO
34  [campo] EXCEDE HOLGURA DE 30 MINUTOS
94  PARAMETROS NO SON VALIDOS
95 CONTRIBUYENTE NO AUTORIZADO PARA EMITIR TIPO DE DTE
96 DOCUMENTO NO CUMPLE CON NORMATIVA DE CUMPLIMIENTO

<!-- PAGE 26 / 35 -->

C ó digo Descripci  ó n
97  NO SE HA PROPORCIONADO DATOS PARA VALIDAR
98  DATOS NO  CUMPLEN ESTANDAR JSON
99  ERROR NO CATALOGADO
100  ERROR USUARIO INCORRECTO
101  ERROR CONTACTAR CON SOPORTE T  É CNICO
102  ERROR NO SE PUDO AUTENTICAR EL USUARIO
103  CONTRASE  ÑA EXPIRADA, POR FAVOR ACTUALIZAR /auth/update  -password
104  ERROR EN ACTUALIZACI  Ó N DE CONTRASE  Ñ A: [campo]
105  LA NUEVA CONTRASE  Ñ A Y LA CONFIRMACI  Ó N DEBE SER LA MISMA
106  CREDENCIALES INV  Á LIDAS
107  ERROR TOKEN INV  Á LIDO: [campo]
108  ERROR TOKEN ES REQUERIDO
109  ERROR EN GENERACION DE TOKEN: [campo]
110  ERROR EN TIPO REQUERIDO:  [campo]
111  ERROR EN PAR  ÁMETRO SOLICITADO: [campo]
112 CODIGO DE GENERACION REEMPLAZO, NO EXISTES: [campo]
113  Numero de Documento es solicitado: [campo] para invalidar
114  Tipo de Documento es solicitado: [campo] para invalidar
115  ERROR NO SE  PERMITEN TRIBUTOS DE USO INFORMATIVO: [campo]
116  Fecha menor a 01  - 01 -2000: [campo]
4.3 Servicio de Consulta

4.3.1 Consulta de DTE

URL URL TEST
https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte
URL PROD  https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte
Método  POST

Parámetros Parámetro
Descripción  Tipo  Tipo Dato  Comentarios

Authorization  Token de autorización  Headers  String  Token obtenido por el servicio de autenticación.

User - Agent  Agente de usuario.  Headers  String  Agente de usuario desde donde se origina la petición.

content - type  Tipo de contenido  Headers  String  application/JSON
nitEmisor  NIT del emisor.  Body  String  NIT del emisor, sin guiones
tdte  Tipo de DTE.  Body  String  Tipo de DTE a buscar
codigoGeneracion  Código de Generación  Body  String  Código de Generación de documento a buscar

<!-- PAGE 27 / 35 -->

Respuesta Campo
Descripción  Tipo Dato
version  Versión de Respuesta  Integer
ambiente  Ambiente de Ejecución  String
versionApp  Versión de aplicación  Integer
estado  Estado resultando del procesamiento  String
Código de generación de DTE  (número
codigoGeneracion  identificador único, aleatorio y universal, en formato UUID versión 4, que servirá para  String
su
correcta identificación  )
selloRecibido  Sello de Recepción del DTE Aceptado  String
Fecha -Hora de procesamiento (dd/MM/yyyy
fhProcesamiento  String
HH:mm:ss
clasificaMsg  Código de clasificación de mensaje
codigoMsg  Código de Mensaje  String
descripcionMsg  Descripción del Mensaje  String
o bservaciones  Detalle de observaciones en campos que no afectan el proceso de recepción del DTE  Array [String]

Ejemplos respuestaÉxitoCódigo: HTTP/1.1 200 OK

{
    "version": 2,
    "ambiente" : "00",
    "versionApp" : 2,
    "estado" : "PROCESADO",
    "codigoGeneracion" : "FF84E5DB  - 79C5 - 42CE - B415 -EC510C53EFB5",
    "selloRecibido" :  "20219E9D4DC0292F4681AD759B0B0F5CA99DC23G",
    "fhProcesamiento" : "12/04/2021 13:29:04",
    "clasificaMsg" : "10",
    "codigoMsg": "001",
    "descripcionMsg": "RECIBIDO",
    "observaciones": ["",""]
}

ErrorCódigo: HTTP/1.1 400 Bad Request

{
"version":  2,
   "ambiente":  "00",
   "versionApp":  2,
   "estado":  "RECHAZADO",
    "codigoGeneracion":  "CF89B21E  - 4268 - 4711 - 832D -8A54866B1763",
   "selloRecibido":  null,
    "fhProcesamiento":  "12/04/2021 13:29:04",
    "clasificaMsg" : null,
    "codi goMsg": "ERROR_CODIGO",
    "descripcionMsg":  "ERROR_DESCRIPCION",
    "observaciones":  null
}

<!-- PAGE 28 / 35 -->

4.3.2 Consulta de Lote DTE

URL URL TEST
https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadtelote/{codigoLote}
URL PROD  https://api.dtes.mh.gob.sv/fesv/recepcion/consultadtelote/{codigoLote}
Método  GET

Parámetros Parámetro
Descripción  Tipo  Tipo Dato  Comentarios

Authorizatio  Token de autorización
Headers  String  Token obtenido por el servicio de autenticación.
n
User - Agent  Agente de usuario.  Headers  String  Agente de usuario desde donde se origina la
petición.
content - type Tipo de contenido  Headers  String  application/JSON
codigoLote  Código de Lote  Path  String  Código de lote asignado durante el proceso de transmisión

Respuesta: Campo
Descripción  Tipo Dato
procesados  Resultado de  DTE procesados exitosamente.  JSON Array
rechazados  Resultado de  DTE rechazados  JSON Array

Éxito
{
    "procesados": [
{
"version": 2,
"ambiente": "00",
"versionApp": 2,
"estado": "PROCESADO",
            "codigoGeneracion": "C3AF84A7  - 8BB8 - 4867 - ABE4 -F40BB3AE3052",
            "selloRecibido": "2021606AB37149A642B3921AD9D9A4A4F934QDHB",
            "fhProcesamiento": "14/10/2021 10:36:15",
"clasificaMsg": "10",
"codigoMsg"  : "001",
            "descripcionMsg": "RECIBIDO Y PROCESADO",
"observaciones": []  ,
"index": 0
},
{
"version": 2,
"ambiente": "00",
"versionApp": 2,
"estado": "PROCESAD  O",
            "codigoGeneracion": "53DC5B96  - FBF9 - 4F86 - BB15 -0B6808188758",
            "selloRecibido": "20211F7FE700F5E74FDCB3AEB12C769A2AFFAA8A",
            "fhProcesamiento": "14/10/2021 10:36:15",
"clasificaMsg": "10",
"codigoMsg": "001",
            "descripcionMsg": "RECIBIDO Y PROCESADO",

<!-- PAGE 29 / 35 -->

"observaciones": []  ,
"index": 1
},
{
"version": 2,
"ambiente": "00",
"versionApp": 2,
"estado": "PROCESADO",
            "codigoGeneracion": "3EB5A0FC  - 4562 - 4C1D - A61B -B1FC17F30678",
            "selloRecibido": "2021092253A849CB43678D5806D92FABAD97F68F",
            "fhProcesamiento": "14/10/2021 10:36:16",
"clasifica Msg": "10",
"codigoMsg": "001",
            "descripcionMsg": "RECIBIDO Y PROCESADO",
"observaciones": []  ,
"index": 3
}
],
    "rechazados": [
{
"version": 2,
"ambiente": "00",
"versionApp": 2,
"estado": "RECHAZADO",
            "codigoGeneracion": "3EB5A0FC  - 4562 - 4C1D - A61B -B1FC17F30A30",
"selloRecibido": null,
            "fhProcesamiento": "14/10/2021 10:36:16",
"clasificaMsg":  "20",
"codigoMsg": "802",
"descripcionMsg": "No valido",
"observaciones": []  ,
"index": 2
},
{
"version": 2,
"ambiente": "00",
"versionApp": 2,
"estado": "RECHAZADO",
            "codigoGeneracion": "3EB5A0FC  - 4562 - 4C1D - A61B -B1FC17F30D25",
"selloRecibido": null,
            "fhProcesamiento": "14/10/2021 10:36:16",
"clasificaMsg": "20",
"codigoMsg": "  802",
"descripcionMsg": "No valido",
"observaciones": []  ,
"index": 4
}
]
}

<!-- PAGE 30 / 35 -->

4.4 Servicio de envío para Evento ContingenciaEl servicio de contingencia es el componente que
habilitará  al contribuyente emisor poder
transmitir  DTE que hayan sido  generados  durante un evento de fuerza mayor que imposibilite la
transmisión de dichos  documentos  para su verificación  ;después de haber transmitido el Evento de
Contingencia deberá hacer uso de l  os servicios uno a uno o por lote para transmitir los documentos
generados en contingencia.

URL URL TEST
https://apitest.dtes.mh.gob.sv/fesv/contingencia
URL PROD  https://api.dtes.mh.gob.sv/fesv/contingencia
Método  POST

Parámetros  :
Parámetro  Descripción  Tipo  Tipo Dato  Comentarios
Authorization  Token de autorización  Headers  String  Token obtenido por el servicio de autenticación.

User - Agent  Agente de usuario.  Headers  String  Agente de usuario desde donde se origina la petición.

content - Type Tipo de Contenido  Headers  String  Application/JSON
nit  NIT del emisor.  Body  String  NIT del emisor, sin guiones
JSON de  Evento de
documento  Evento.  Body  String  Contingencia firmado a transmitir.

Respuesta: Campo
Descripción  Tipo Dato
estado  Campo descriptivo, que indica si recibió o se rechazó solicitud  String
fechaHora  Fecha y hora en que se efectuó el proceso  String
mensaje  Mensaje con detalle del resultado de la operación  String
selloRecibido  En caso es recibido, se indica un código alfanumérico indicando su respectivo número de registro  String
Si existieran observaciones se presenta un objeto  con un
observaciones  Array[String]
arreglo del detalle de estas.

Ejemplos respuesta

ÉxitoCódigo: HTTP/1.1 200 OK
{
    "estado": "RECIBIDO",
    "fechaHora": "23/03/2021 10:09:18",
    "mensaje": "Documento recibido",
    "selloRecibido":  "202197AF602319654B9C95A5ECA40DAE13AEFB5N",
    "observaciones": []
}

<!-- PAGE 31 / 35 -->

Error
{
    "estado": "RECHAZADO",
    "fechaHora": "23/03/2021 09:59:12",
    "mensaje": "Validaciones no superadas",
    "selloRecibido": null,
    "observaciones": [        "OBSERVACION 1",
        "OBSERVACION N"
]
}

4.5 Servicio de envío para Evento de InvalidaciónEl servicio de invalidación es el componente que habilitar
á al contribuyente emisor para  trasmitir la
inactivación de un DTE  recibido previamente.

URL UR L TEST
https://apitest.dtes.mh.gob.sv/fesv/anulardte
URL PROD  https://api.dtes.mh.gob.sv/fesv/anulardte
Método  POST

Parámetros: Parámetro
Descripción  Tipo  Tipo Dato  Comentarios
Authorization  Token de autorización  Headers  String  Token obtenido por el servicio de autenticación.

User - Agent  Agente de usuario.  Headers  String  Agente de usuario desde donde se origina la petición.

content - Type  application/JSON
Tipo de Contenido  Headers  String

ambiente  Código de ambiente.  Body  String  Ambiente: “00” Prueba; “01” Producción.

idEnvio  Identificador de envío de la transmisión.  Body  Integer  Campo correlativo a discreción.

version  Versión del  JSON . Body  Integer  Versión del JSON de Invalidación.

documento  Evento .  Body  String  JSON Evento de Invalidación firmado a transmitir.

<!-- PAGE 32 / 35 -->

Respuesta: Campo
Descripción  Tipo Dato
version  Versión de Respuesta  Integer
ambiente  Ambiente de Ejecución  String
versionApp  Versión de aplicación  Integer
selloRecibido  Sello de Recepción del DTE  String
Fecha /Hora de procesamiento (dd/MM/yyyy
fhProcesamiento  String
HH:mm:ss  )
Código de generación de DTE  (número
codigoGeneracion  identificador único, aleatorio y universal, en formato UUID versión 4, que servirá para  String
su
correcta identificación  )
codigoMsg  Código de Mensaje  String
descripcionMsg  Descripción del Mensaje  String

Ejemplos respuesta

ÉxitoCódigo: HTTP/1.1
200 OK
{
    "version":  2,
    "ambiente":  "00",
    "versionApp":  1,
    "estado":  “PROCESADO”,
    "codigoGeneracion":  " CF89B21E  - 4268 - 4711 - 832D -8A54866B1763",
    "selloRecibido":  "20206DFFF66F78D247F7A66D155E68FC7318UADD",
    "fhProcesamiento  ": "11/08/2020 09:50.52",
    "codigoMsg":  "001",
    "descripcionMsg":  "Invalidación  Recibida y Procesada",
    "observaciones": null
]
}

Error
{
    "version":  2,
   "ambiente":  "00",
   "versionApp":  1,
   "estado":  "RECHAZADO",
"codigoGeneracion":  "CF89B21E  - 4268 - 4711 - 832D -8A54866B1763",
   "selloRecibido":  null,
    "fhProcesamiento":  null,
    "codigoMsg":  "ERROR_CODIGO",
    "descripcionMsg":  "ERROR_DESCRIPCION",
    "observaciones":  [
"Observación 1  ",
"Observación N  "
]
}

<!-- PAGE 33 / 35 -->

5.

 Código QREn las versiones electrónicas interpretadas y legibles del DTE, se requiere que se integre un parámetro de consulta dentro de un Código QR. Los parámetros para cada ambiente son los siguientes:

URLhttps://
admin.factura  .gob.sv/consultaPublica?ambiente=  {ambiente}  &codGen=  {cod_generacion}
&fechaEmi=  {fechaEmi}

Parámetro  Descripción  Comentario
ambiente  Código de ambiente  Ambiente: “00” Prueba; “01” Producción.
Código de Generación

codGen  (número identificador único, aleatorio y universal, en formato UUID versión 4, que servirá para  Código de generación del DTE a consultar
su correcta
identificación  )
fechaEmi  Fecha de Generación  Fecha de generación del DTE

Ejemplo:

https:// admin .factura .gob.sv/consultaPublica?ambiente=  00 &codGen=  00000000  - 0000 - 0000 -
0000 -000000000000  &fechaEmi=  2022 - 05 - 01

 C onsideraciones adicionalesPara garantizar una implementación exitosa, estable y segura de6.

su gestor de  facturación
electrónica, los desarrolladores e integradores tecnológicos deben acatar de forma estricta los siguientes lineamientos operativos, de desarrollo y de infraestructura:

6.1 Formato y Estructura de DatosLimpieza en las tramas JSON: Es imperat
ivo enviar los datos limpios. No deben enviarse caracteres
inválidos, residuales o de fin de instrucción, como el punto y coma (;), al final de las cadenas de texto, en los valores de los campos o al final del documento JSON
.

Carácter referencial del JSON  Schema: El JSON Schema proporcionado  s en el sitio web
factura.gob.sv son  una guía estructural  referencial  . Su propósito es definir la jerarquía y los tipos de
datos del JSON. Sin embargo, el cumplimiento de este esquema no exime al integrador de aplicar

las reglas lógicas y cálculos fiscales exigidos por la ley.Codificación estándar: Toda comunicación, petición y archivo JSON debe estar codificado estrictamente bajo el estándar UTF
-8 para evitar la alteración de caracteres especiales (tildes, eñes,
etc.) .

<!-- PAGE 34 / 35 -->

6.2 Consumo de Servicios (API) y EndpointsExactitud en las URLs de los Endpoints: Se deben respetar con precisión absoluta las rutas de los endpoints proporcionados por el Ministerio de Hacienda. Las peticiones deben realizarse a la URL exacta sin inc

luir una barra diagonal (/) al final (trailing slash).Correcto: .../api/recepcionIncorrecto: .../api/recepcion/

6 . 3 Cumplimiento Normativo y Reglas de NegocioValidaciones específicas del rubro: Es responsabilidad exclusiva del emisor y su equipo de
desarrollo

asegurarse de que el sistema cumpla con la normativa vigente. Se deben implementar internamente todas las validaciones matemáticas, lógicas y de catálogo que correspondan específicamente a su rubro o sector económico antes de emitir y enviar un
Documento Tributario Electrónico (DTE).

Separación de Ambientes: Se debe asegurar que las pruebas de integración se realicen únicamente en el
Ambiente  de Pruebas provisto. Bajo ninguna circunstancia se deben enviar DTE de prueba al
ambiente de Producción  .

6.4 Seguridad, Gobernanza y Soberanía de la InfraestructuraSeguridad en integraciones API: Si la comunicación se realiza mediante APIs, es obligatorio mantener e implementar medidas de seguridad robustas en la capa de transporte (TLS 1.2 o superior), así como una gestión segura y encriptada de los tokens de autenticación y credenciales

de acceso.Jurisdicción y Localización de la Infraestructura: El manejo de la información tributaria y transaccional es de interés nacional y exige los más altos estánd
ares de trazabilidad, control y

mitigación de riesgos. Por consiguiente:De acuerdo con las políticas de seguridad de la información y salvaguarda de los activos digitales del Ministerio de Hacienda, toda la infraestructura tecnológica, bases de datos y servidores utilizados por el emisor para la facturación electrónica deben o

perar bajo marcos jurídicos que

permitan la cooperación internacional. Por motivos de control perimetral, auditoría forense y diligencia legal ante incidentes, el despliegue de las soluciones se restringe de forma mandatoria a jurisdicciones que mantengan
vigentes tratados internacionales de extradición y convenios de
asistencia mutua legal por delitos informáticos o ciberataques con nuestro país.

6.5 Archivo  s necesarios para envío a receptores

Los sujetos pasivos deberán entregar a sus receptores un  a Representación Gráfica y el  archivo DTE
electrónico de extensión JSON que constituya el Documento Tributario Electrónico o Evento que
corresponda, conteniendo:

a) La Estructura de Datos comprendiendo los campos establecidos en los Anexos II y III de esta No
rmativa por tipo de documento o evento.
b) La firma electrónica de acuerdo a lo establecido en  la regla 2.1 del presente Anexo I y
a las Guías y Manuales emitidos por la Administración Tributaria.
c) El Sello de Recepción otorgado por la Administración Tributa  ria.

<!-- PAGE 35 / 35 -->

Los sujetos pasivos deberán utilizar las “partes” y “objetos/ atributos base” tal como se encuentra establecido en el siguiente cuadro:

Archivo DTE
Partes  Objetos/ Atributos Base  Ejemplos
Llave de apertura  {  {

Estructura de  "identificacion":{},"emisor":{},"receptor":{}, "otrosDocumentos":,"documentoRelacionado":, "ventaTercero":,"compraTercero":{}, "cuerpoDocumento":[], "resumen":{},"apendice":,  "identificacion":{"version":,"ambiente":"", "tipoDte":"","numeroControl":"", "codi goGeneracion":"","tipoModelo":, "tipoOperacion":,
Datos

Firma Electrónica  "firmaElectronica": "..",  "firmaElectronica":"eyJhbGciOiJSUzUxMiJ9.ew0KICAiaWRlbnRpZmljYWNpb24iIDogew0KICAgICJjb2RpZ29HZW5l”,

"selloRecibido":"20  25207067DD7185424C8
Sello de Recepción  "selloRecibido": ""
E000A2598A776A1PG98"
Llave de cierre  }  }

El Sello de Recepción tendrá como nombre de objeto/ atributo base: “selloRecibido  ”

El Archivo DTE se presentará como en la siguiente muestra:{"identificacion":{
"version":,"ambiente":"","tipoDte":"","numeroControl":"","codigoGeneracion":"","tipo
Modelo":,"tipoOperacion":,"firmaElectronica":"eyJhbGciOiJSUzUxMiJ9.ew0KICAiaWRlbnRpZmljYWNpb24iIDogew0KICAgICJjb2RpZ29HZW5l”,"selloRecibido":"2025207067DD7185424C8E000A259

8 A776A1PG98"}Los Archivos DTE que no cumplan lo anterior no podrán ser confirmados por la Administración Tributaria.

7. Glosario

Termino  Descripción
DTE  Documento Tributario Electrónico
JSON, cuyo nombre corresponde a las siglas JavaScript Object  Notation
JSON  o Notación de Objetos de JavaScript, es un formato ligero de intercambio de datos, que resulta sencillo de leer y escribir para los programadores y simple de interpretar y generar para las máquinas.

JSON Web Signature (abreviado JWS) es un es  tándar propuesto por IETF
JWS  para la firma de JSON arbitrario.1  Se utiliza como base para una variedad
de tecnolog  ías basadas en la web, incluyendo JSON Web Token.

JWT  JSON Web Token (abreviado JWT) es el estándar abierto basado en JSON propuesto por IETF (RFC 7519) para la creación de tokens de acceso que permiten la propagación de identidad y privilegios o claims en inglés, utilizado para la parte de seguridad de los D
TE

API  Una API es una interfaz de programación de aplicaciones (del inglés API: Application Programming Interface). Es un conjunto de rutinas que provee acceso a funciones de un determinado software. Básico en el entorno de microservicios.