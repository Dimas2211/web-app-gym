<!-- Fuente: ../Normativa de Cumplimiento de los Documentos Tributarios Electrónicos_Versión 1.2 17.11.2025.pdf | SHA-256 7b892cc9655965c87165763fa984bc0744e31e965ae0dae62ff37c6b1715c9a2 | Páginas: 112 | PDF escaneado (RICOH MP 3055, 18/11/2025) sin capa de texto. Contenido obtenido por OCR local: Tesseract 5.4.0 tessdata_best spa+eng, render PyMuPDF escala de grises 300 dpi, PSM 6. Texto OCR sin curar salvo notas [VERIFICADO]; puede contener errores. El PDF original es la fuente oficial. -->

<!-- PAGE 1 / 112 (OCR, poco texto) -->

* Xx
| * *
| * *
gl
* *
* og x
MINISTERIO DE HACIENDA
|
|
|
| NORMATIVA DE CUMPLIMIENTO
DE LOS DOCUMENTOS TRIBUTARIOS ELECTRONICOS
Version 1.2
|
17 de noviembre de 2025

<!-- PAGE 2 / 112 (OCR, poco texto) -->

Control de Cambios
No. Tipo Fecha Contenido Plazo de
adaptación
Se establecen disposiciones de
1.0 | Versión inicial 13/01/2023 | P4 | o fecha de su
Tributarios Electrónicos, de emisión
conformidad al artículo 119-A del
Código Tributario,
En el punto 15 se modifica la fecha de
coexistencia. A partir de la
11 Modificación | 04/06/2024 En los Anexos U y Y se modiles el fecha de su
o , me | EMISIÓN.
máximo de items en el campo 21 'N
de ítem”.
Se adiciona “Sección 7”, con campos Tres ¡mess #
12 Modificación 17/11/2025 ' P partir de la fecha
72 y 73 para FEXE. iy
de su emision.
2

<!-- PAGE 3 / 112 (OCR) -->

ÍNDICE
Control de Cambios .....—.«===:= ==." EVE SFL AREER AERTS SH NOR HELTER SS
O) (a JOOP |
2. Ámbito de aplicación... —ÚÑ IET
3. Definiciones... e. .:— ida AG Y
4. Documentos Tributarios Electrónicos .......................e.m eee IR E 9
5. Estructura de Datos y Formato Electrónico ..................=e.e e... 9
5.1 Especificaciones tecnológicas y con fines de control... 10
6. . EMISIÓN rennenmmeinninm——]——sr e o LO
6.1 Emisión con Transmisión Previa a la Administración Tributaria .......................... 10
6.2 Emisión con Transmisión Diferida a la Administración Tributaria......................... 10
7. Generación... . e CTE
7.1 Código de Generación... III RI III IR II DR RR RR LL
7.2 Número de Control cuisines RR Res 1
7.3 Regla de Redondeos.........== ==... cr Ll
a) Redondeos por Ítem: ...........W..eveeveeee DDD DDD DDD Dee 11
b) Redondeos en Sección Resumen: ........ mw...
7,4 Regla de HOolgura:=== == e o" ""]]——o ea SEs 3 SH DC 2
8. Firma electrónica... IR DD OD IDR e 12
9. Transmisión .......m000. m0. ÉL
9.1. Plataformas de Transmisión... III III TIRÉ ID E e 14
10. Reglas para el otorgamiento del Sello de Recepción... 14
10.14. Estados de los documentoS:= === — ee.""""]-"—;eééiexaoÉ KE
10.2. Registro y declaración de los DTE...........................e.e 0 16
11. Entrega de los DTE......===cmeaaóóó ÉL
11.1 Entrega con Transmisión Previa........................eemesree II 16
11.2 Entrega con Transmisión Diferida.......................=..m. mee 17
11.3 Versiones interpretadas y legibles del Documento Tributario Electrónico.......17
12. Conservación de los DTE ..............=..1meeeeeee RI 18
12.1 Anulación y destrucción de documentos fíSICOS ...=..=z= «== ví oo 18
13. EVENTOS O LO
13.1 Transmisión de los Eventos ............... ==... ..e=esieem ea 18

3

<!-- PAGE 4 / 112 (OCR) -->

13.1.1 Evento de Invalidación «=== === — ie. eee Ree I
13.1.2 Evento de Contingencia... III III III 19
13.2 Lineamientos para el evento de invalidaCión.................e.emeee 20

13.2.1 Reglas para invalidación de Facturas y Facturas de Exportación
Electrónicas............e.e.eeeeeier e ee sree rene recen cerco ne 20
13.2.2 Diferencia entre error y afectación................—...—=we.e..mee 20
13.3 Efectos del Evento de InvalidaCión...............=...... eee 20
13.4 Efectos del Evento de Contingencia.................emeeee III II II 2
14. CONsUlta ==. CNO A A EEL EE EA COD,
15. Coexistencia............. eee III RI ID RR RR DDD Dee ee eee e 2
16. Gratuidad... ..e———"— e E E A
17. Programa de Implementación............... eee II DI E 23
18. Fechas y condiciones para liberación de la presentación de informes..............23
19. Lineamientos para Versiones y Modificaciones de la Normativa........................23
20. Anexos ...........eeeecereeceiere eee e RR e Re ree re nernernerneeneene recen reercerene ene eee 24
21. Vigencid.====.——].""——e ss sisi sone saa se ai SS SLE ASAD ERR as se rr
1. GENERACIÓN DE LOS DTE................reereemeneeneene nte DDD DDD DDD 20
14.  COAIGO de Generación... oo ASR SRSA TA RD
12. Campos y Secciones................e=veeeee II RIIIE RR RR sine 2D
1.3. Definición de condiciones de campo.............. eme II III IZ 7
1.3.1. Restricciones de uso en los campos de los DTE......................= == == e... 27
14. Estructura de Datos................ 2.00... 28
1.5. Formato Electrónico... mm... iD Gad 50 48s 50 4S SIAR AAR CARE A
1.6. Reglas para el otorgamiento del Sello de Recepción de los DTE y Eventos 31
1.7. Or | c= Ue To [© 1 ee De Deere eee eee eee eee SL
E  A  ———.——————]]——]]]];Ú—;——];]_—][——————
2.1. Condiciones y mecanismos... III III II IR RI SL
3. TRANSMISIÓN... meno E UC DD EA HA RIE RR EAI TDD
31. Ambientes de Transmisión creer II III IR II
3.2. Servicio de Transmisión para Eventos de Invalidación y Contingencia .........33
3.3. AutenticaCión............e. eee DI III OIR OR RR RR ee RR Ree DI

4

<!-- PAGE 5 / 112 (OCR, poco texto) -->

|
|
34. ¡Recepción de los DTE....... mmm... BA
25. “Sello de Recepción. een tn sis smn sams masse meres seme BA
5. MÓDULOS.reme— ii ——————_———— NDA És DA
VALIDACIONES PARA CAMPOS EVENTOS ..........cnmeccnmocconscinneó ón 108
5

<!-- PAGE 6 / 112 (OCR) -->

* * x
* | *
* yk
e:
Xx A 4
* a *
MINISTERIO DE HACIENDA

La Dirección General de Impuestos Internos, con base a lo establecido en los artículos 1 y 3 de la

Ley Orgánica de la Dirección General de Impuestos Internos, 119-A inciso segundo del Código

Tributario y 160 de la Ley de Procedimientos Administrativos; y,

CONSIDERANDO:

I. Que mediante Decreto Legislativo No. 230, de fecha 14 de diciembre de 2000, publicado
en el Diario Oficial No. 241, Tomo 349, del 22 de ese mismo mes y año se emitió el Código
Tributario, el cual ha sido objeto de reformas mediante los Decretos respectivos. Que
dentro de esas reformas, se encuentra la contenida en el Decreto Legislativo No. 487, de
fecha 30 de agosto de 2022, publicado en el Diario Oficial No. 197 Tomo 436, de fecha 20
de septiembre de 2022, en el cual se adicionó al Código Tributario la Subsección Primera,
de la Sección Quinta del Capítulo | del Título Ill, sobre Documentos Tributarios Electrónicos.

I. Que, habiéndose aprobado las disposiciones legales específicas relativas al uso de los
Documentos Tributarios Electrónicos, es necesario emitir las correspondientes normas
administrativas, de acuerdo a lo establecido en el artículo 119-A inciso segundo del Código
Tributario.

II. Que el artículo 119-A inciso segundo del Código Tributario, establece que la Administración
Tributaria está facultada para emitir la normativa que garantice el adecuado cumplimiento
de las obligaciones relativas a los documentos tributarios electrónicos. Asimismo, que dicha
normativa será de estricto cumplimiento para los sujetos pasivos, pudiendo ejercerse las
facultades sancionatorias ante su incumplimiento.

IV. Que la Administracion Tributaria, dando cumplimiento al procedimiento descrito en el
articulo 162 de la Ley de Procedimientos Administrativos, desde el mes de abril de dos mil
veinte, ha atendido a diversos contribuyentes que voluntariamente presentaron solicitud
para el reemplazo de la documentacion fisica por el uso del sistema de emision de
Documentos Tributarios Electrónicos, con base al artículo 113 inciso primero del Código
Tributario; a partir de lo cual se recibieron oportunamente las recomendaciones o
sugerencias de parte de los contribuyentes involucrados en el Programa de
Implementación de Facturación Electrónica, así como las recopiladas en los eventos de
divulgación realizados con gremiales de profesionales, de comercio e industria, como las
formuladas por el público en general mediante los canales oficiales de comunicación
disponibles, las cuales han sido evaluadas y consideradas por la Administración Tributaria
para el modelo operativo del sistema, como para el desarrollo de los contenidos de la
presente Normativa.

V. Que los Documentos Tributarios Electrónicos facilitan los procesos tributarios a los sujetos
pasivos, generan optimización de recursos, a través de la reducción de los costos de
papelería, impresión, distribución y almacenaje de los documentos tradicionalmente
emitidos en formato físico.

POR TANTO, se emite la siguiente:

6

<!-- PAGE 7 / 112 (OCR) -->

NORMATIVA DE CUMPLIMIENTO DE LOS
DOCUMENTOS TRIBUTARIOS ELECTRÓNICOS
|
| 1. Objeto

La presente Normativa tiene por objeto establecer las condiciones necesarias para la correcta

generación, firma, transmisión, recepción y entrega de los Documentos Tributarios Electrónicos;

así como sus especificaciones y demás procedimientos, que garanticen el adecuado cumplimiento
de las obligaciones legales y de los Eventos relacionados a los mismos.

2. Ámbito de aplicación

Las disposiciones establecidas en la presente Normativa serán de estricto cumplimiento para los

sujetos pasivos emisores de documentos tributarios electrónicos, de acuerdo a lo establecido en
el artículo 119-A inciso segundo del Código Tributario.
| 3. Definiciones
Para los efectos de lo establecido en el Código Tributario y en la presente Normativa, se entenderá
por:
| a) Anexo: Documento emitido por la Administración Tributaria que forma parte integrante de
| esta Normativa y que contiene la descripcion de las caracteristicas, condiciones, mecanismos

tecnológicos para la generación, firma, transmisión, recepción y entrega al receptor de los

Documentos Tributarios Electrónicos y de los Eventos relacionados a los mismos, así como los
| demás mecanismos conforme al modelo operativo y a la plataforma informática dispuesta para tal
| efecto.

b) Archivo DTE: Es un archivo electronico de extension JSON que contiene: el texto plano
| del documento generado conforme a la Estructura de Datos contenida en el Anexo Il de esta
| Normativa, además del DTE firmado conforme se establece en el "Manual Tecnológico para la
| Integración del Sistema de Transmisión”, incorporando el Sello de Recepción otorgado por la
| Administracion Tributaria.
|
| Cc) Certificado de firma electrónica falso: Es el certificado que declara uno o más datos

alterados o manipulados a partir de su creación, para efecto de lo establecido en el artículo 199 del

Código Tributario.

d) Código de Generación: Es un número identificador único, aleatorio y universal, en formato

UUID (Identificador Unico Universal) versión 4, que servirá para la correcta identificación del

documento transmitido y efectuar la consulta del mismo en el sitio web del Ministerio de Hacienda.

e) Sitio emisores DTE: Es el servicio dispuesto por la Administración Tributaria para que los

emisores de DTE puedan realizar las gestiones operativas relacionadas con dichos documentos.
|
f) Contingencia: Se refiere a la situacion imprevista ocasionada por caso fortuito o fuerza
| mayor que impida la transmisión previa de los documentos a la Administración Tributaria.
| ag) Documento Electrónico: Información de cualquier naturaleza, contenida en soporte

electrónico, según un formato determinado. Para efectos de la presente Normativa, documento
7

<!-- PAGE 8 / 112 (OCR) -->

electrónico contentivo de los grupos de información y datos, que se encuentra firmado
electrónicamente a efecto de ser transmitido a la Administración Tributaria pero que no cuenta con
el Sello de Recepción otorgado conforme a las reglas previstas para ello.
h) Documento Electrónico Apócrifo: Es el documento tributario generado, firmado y
transmitido electrónicamente a la Administración Tributaria, con o sin Sello de Recepción otorgado
por la misma, que lesiona el interés fiscal, conforme a lo establecido en el artículo 199 inciso tercero
del Código Tributario y en la presente Normativa. Estos documentos son elaborados para soportar
operaciones inexistentes, con el fin de reducir el pago de impuestos.
i) Documento Tributario Electronico (DTE): Es el documento tributario generado con la
Estructura de Datos, Formato Electrónico, firmado y transmitido electrónicamente conforme a lo
establecido por la Administración Tributaria y que cuenta con el Sello de Recepción otorgado por
la misma.
j) Emisor: Sujeto que expide Documentos Tributarios Electrónicos.
k) Estructuras de Datos: Conjunto de elementos o campos que integran el formato
electrónico del documento.
) Evento: Se refiere a un mensaje de datos firmado electronicamente que contiene
informacion relacionada con los Documentos Tributarios Electrónicos, que es transmitido a la
Administración Tributaria y que cuenta con el Sello de Recepción otorgado por la misma.
m) Evento de Contingencia: Mensaje de datos firmado electrónicamente que se genera y
transmite a la Administración Tributaria una vez cese la situación de fuerza mayor que imposibilitó
la transmisión del documento electrónico a la Administración Tributaria.
n) Evento de Invalidación: Mensaje de datos firmado electrónicamente que se genera y
transmite a la Administración Tributaria en ocasión de errores, ajustes o rescisiones en los
Documentos Tributarios Electrónicos transmitidos, a efecto de la invalidación de los mismos.
0) Firma Electrónica: Son los datos en forma electrónica, consignados en un documento
generado, que permiten la identificación del emisor del documento transmitido a la Administración
Tributaria e indicar que el firmante aprueba la información recogida en el mensaje de datos o
documento electrónico, para el otorgamiento del Sello de Recepción.
p) Formato Electrónico: Corresponde a la especificación que define la forma en que se
organiza y se codifica la información de la Estructura de Datos de un documento electrónico
generado, que en el caso de Documentos Tributarios Electrónicos se refiere al formato JSON.
a) Generación: Proceso mediante el cual la Estructura de Datos se incorpora en el Formato
Electrónico JSON.
r) Holgura: Es la diferencia permitida en los campos numéricos de los DTE.
s) Plataforma Informatica: Corresponde al servicio dispuesto por la Administracion Tributaria,
en el cual los emisores podran transmitir los DTE y Eventos.

8

<!-- PAGE 9 / 112 (OCR) -->

t) Receptor: Persona natural o Juridica que recibe el Documento Tributario Electronico,
| conforme a las reglas previstas en la presente Normativa.

|

| u) Redondeo: Consiste en una regla fija para determinar en cada operación la última posición
| decimal dentro del rango, la cual se elevara cuando la primera posicion decimal fuera de rango sea
| igual o mayor a 5.

| v) Sello de Recepción: Consiste en un código especial otorgado por la Administración
| Tributaria que tiene como base un UUID Versión 4 y se le agregan caracteres alfanuméricos, que
| acredita la correcta transmisión y recepción de los documentos y Eventos generados y firmados,
| así como el carácter de Documento Tributario Electrónico que reúne los requisitos de idoneidad a
| que se refiere el articulo 206 inciso primero del Codigo Tributario.

w) Sitio web: Corresponde a la pagina digital de la Administracion Tributaria que contiene

informacion general, documentacion del sistema y consultas de facturacion electronica.

X) Transmisión: Proceso de envío de un documento generado y firmado electrónicamente
| hacia la plataforma informática de la Administración Tributaria, con el objetivo de obtener el Sello
de Recepción.

4. Documentos Tributarios Electrónicos
| Conforme a lo dispuesto en los artículos 119-C y 119-G del Código Tributario, los Documentos
| Tributarios Electrónicos que serán emitidos por parte de los sujetos pasivos a que hace referencia
| el numeral 2 de la presente Normativa, son los siguientes:

a) Comprobante de Crédito Fiscal Electrónico (CCFE).

b) Factura Electrónica (FE).

c) Factura de Exportación Electrónica (FEXE).

d) Nota de Remisión Electrónica (NRE).
| e) Nota de Crédito Electrónica (NCE)

f) Nota de Débito Electronica (NDE).

g) Comprobante de Liquidación Electrónico (CLE).

h) Comprobante de Retención IVA Electrónico (CRE).

i) Documento Contable de Liquidación Electrónico (DCLE).

j) — Factura de Sujeto Excluido Electrónica (FSEE).

k) Comprobante de Donación Electrónico (CDE).

Los Documentos Tributarios Electrónicos deben identificarse con el Código de Generación.

5. Estructura de Datos y Formato Electrónico

La Estructura de Datos para la emisión de los citados documentos deberá efectuarse conforme a

las especificaciones establecidas en el artículo 119-G del Código Tributario y conforme a lo

establecido en el Anexo Il: "ESTRUCTURA DE DATOS DTE" de la presente Normativa.

El Formato Electrónico para la emisión de los Documentos Tributarios Electrónicos se encuentra

descrito en el Anexo |: "ESPECIFICACIONES TECNOLÓGICAS" de esta Normativa.

9

<!-- PAGE 10 / 112 (OCR) -->

Cuando deban actualizarse las Estructuras de Datos y Formato Electrónico de los documentos,
dicha actualización será oportunamente comunicada y deberá cumplirse a efecto de mantener la
integridad y seguridad del sistema de emisión de los DTE, conforme a los plazos establecidos en
los Lineamientos para Versiones y Modificaciones de esta Normativa.
5.1 Especificaciones tecnológicas y con fines de control
Las especificaciones especiales a que se refiere el inciso segundo del artículo 119-G del Código
Tributario, necesarias por razones tecnológicas o con fines de control, se encuentran establecidas
e indicadas en la tabla de estructura de datos de dichos documentos, contenida en el Anexo II:
"ESTRUCTURA DE DATOS DTE" de la presente Normativa.
6. Emision
De conformidad a lo dispuesto en los articulos 119-A inciso primero literal a) y 119-C del Codigo
Tributario, la emision de Documentos Tributarios Electronicos debera cumplirse de la forma como
se indica a continuacion:
6.1 Emision con Transmision Previa a la Administracion Tributaria
Conforme a lo dispuesto en el inciso primero del artículo 119-C del Código Tributario, como
regla general, los sujetos pasivos deberán transmitir a la Administración Tributaria los
archivos electrónicos de los documentos tributarios por cada operación que realicen para
el otorgamiento del Sello de Recepción previamente a su entrega al receptor. Lo anterior
aplica para transmisiones de DTE uno a uno o por lote.
6.2 Emisión con Transmisión Diferida a la Administración Tributaria
Excepcionalmente, de conformidad a lo dispuesto en el inciso tercero del artículo 119-C
del Código Tributario, los contribuyentes estarán autorizados para transmitir en modalidad
diferida en los casos y condiciones en que realicen operaciones en contingencia, conforme
al siguiente orden: generación, firma electrónica, entrega al receptor conforme al punto
11.2 "Entrega con Transmisión Diferida” de esta Normativa, y superada la situación de fuerza
mayor que dio lugar a la contingencia, deberá transmitirse el correspondiente Evento de
Contingencia y posteriormente la transmisión de los documentos generados en
contingencia a la Administración Tributaria para el otorgamiento diferido del Sello de
Recepción, dentro del plazo establecido en el punto 2 del Cuadro 1: “Transmisión”, de esta
Normativa. Para este efecto, no se requiere resolución previa por parte de la Administración
Tributaria.
En ambas modalidades, los citados documentos deberán entregarse a sus receptores con la misma
estructura de datos y formato electrónico en que fueron generados y firmados.
Los sujetos pasivos deberán disponer de todos los medios adecuados y suficientes, tanto técnicos
o administrativos, que aseguren el cumplimiento de la emisión de los DTE.
10

<!-- PAGE 11 / 112 (OCR) -->

7. Generación
De conformidad a lo dispuesto en el artículo 119-A inciso primero literal b) del Código Tributario,
se establece que la Generación de los Documentos Tributarios Electrónicos es un procedimiento
que consiste en estructurar los datos que contendrán los documentos en formato electrónico.
7.1 Código de Generación
Durante el procedimiento de generación, deberá incorporarse al documento electrónico el Código
de Generación, cuyo detalle técnico se encuentra en el punto 1.1 “Código de Generación" del
Anexo |: "ESPECIFICACIONES TECNOLÓGICAS" de esta Normativa.
7.2 Número de Control
Durante el. .procedimiento de generación, deberá asignarse automáticamente el Número de
Control, el cual consiste en un código alfanumérico compuesto por estas cuatro secciones:
e 1% deberá iniciar con las letras "DTE" que hace referencia a los Documentos Tributarios
Electrónicos a emitir.
e 2%: contendrá el Código de Tipo de Documento según el Catálogo CAT-002 establecido
por la Administración Tributaria.
e 3%: contendrá cuatro dígitos alfanuméricos que representan el código de Casa Matriz,
Sucursal o Bodega, seguido de cuatro dígitos alfanuméricos con el código de Punto de
Venta.
e 4%: contendrá un número consecutivo de quince dígitos de longitud, que iniciará en 1 y
finalizará en 999999999999999.
| Tendrá la siguiente estructura: DTE-00-00000000-000000000000000 y deberá reiniciar al inicio
| de cada ejercicio impositivo o cuando se agote dentro del mismo.
7.3 Regla de Redondeos
Los campos numéricos de los DTE deberán cumplir con las siguientes reglas de redondeo:
|
|
| a) Redondeos por Ítem:
|
Se permitirá hasta ocho posiciones decimales (fraccionaria) en los campos numéricos
de los DTE: cantidad, precio, descuento y total de ventas por ítem. En consecuencia,
| cuando la novena posición decimal de estos campos sea igual o mayor a 5, la octava
posición decimal se deberá redondear 1 hacia arriba.
|
| Ejemplos: 1.123456784 > 1.12345678
| 1.123456785 > 1.12345679
| 1.123456786 > 1.12345679
| b) Redondeos en Sección Resumen:
| Se permitirá hasta dos posiciones decimales (fraccionaria) en los campos numéricos
| de la Seccion Resumen de los DTE. En consecuencia, cuando la tercera posicion
| 11
|

<!-- PAGE 12 / 112 (OCR) -->

decimal de estos campos sea igual o mayor a 5, la segunda posición decimal se deberá
redondear 1 hacia arriba.
Ejemplos: 1.124 > 1.12
1.125 > 1.13
1.126 > 1.13
7.4 Regla de Holgura:
La diferencia permitida en los campos numéricos de los DTE será de una centésima, de esta
forma:
Holgura (-0.01) | Holgura (+0.01)
1.124
1.125
1.126
En ese sentido, sin perjuicio de las posiciones decimales utilizadas por los sujetos pasivos en sus
operaciones internas, éstos deberán cumplir con las anteriores reglas de redondeos y holgura en
la generación de los DTE, ajustándose a ocho posiciones decimales los campos por ítem y a dos
posiciones decimales los campos de la Sección Resumen, dentro de la holgura antes establecida.
Ejemplo Sección Cuerpo:
Operación del sujeto Valor por ítem Sumatoria de Venta
pasivo (8 decimales) (Máximo 8 decimales)

Precio x cantidad Precio x cantidad Holgura (-0.01) Holgura (+0.01)
1.1234567845678901 1.12345678 111345678 1.13345678
1.1267890167890123 1.12678902 1.11678902 1.13678902

Ejemplo Sección Resumen:
Total de ventas Val Sumatoria de Venta
gravadas Holgura de ítem ator resumen (Maximo 2 decimales)
| (2 decimales)

(8 decimales) Holgura (-0.01) | Holgura (+0.01)

2.25024580 (0.00)

2.23024580 (0.01)

2.27024580 (+0.01)

Es decir, que los campos de la Sección Resumen se deben calcular con base a los decimales de

los campos por ítem del DTE y no con las posiciones decimales utilizadas por los sujetos pasivos

en sus operaciones internas.

8. Firma electronica

Con base a lo dispuesto en el artículo 119-C inciso cuarto del Código Tributario, los sujetos pasivos

deberán firmar electrónicamente los Documentos Tributarios Electrónicos que emitan, conforme
12

<!-- PAGE 13 / 112 (OCR) -->

|
a las condiciones y mecanismos de Firma Electrónica establecidos en el punto 2. FIRMA
ELECTRONICA, del Anexo |: "ESPECIFICACIONES TECNOLÓGICAS" de la presente Normativa.
Para hacer uso de la firma electrónica, deberá obtenerse previamente el certificado emitido por la
Administración Tributaria, el cual únicamente podrá utilizarse para emitir DTE.
La función de firma establecida se corresponde con el estándar JWS (JSON Web Signature), lo que
garantiza la identificación del sujeto pasivo, la integridad del contenido e indica que el firmante
aprueba la información contenida en el documento electrónico.
La Administración Tributaria podrá establecer la fecha a partir de la cual se permitirá el uso de
certificados emitidos por un proveedor autorizado de servicios de certificación, a que se refiere el
artículo 43 de la Ley de Firma Electrónica, a efecto de incorporar en los documentos que transmita
la firma electrónica certificada correspondiente.
| La firma electrónica otorga a los documentos el valor probatorio establecido en la Ley de Firma
| Electrónica; no obstante, son deducibles fiscalmente siempre y cuando cuenten con el Sello de
| Recepción correspondiente, de conformidad a lo establecido en los artículos 119-D inciso segundo
| y 206 del Código Tributario.
|
| Asimismo, según lo dispuesto en el artículo 199 inciso primero del Código Tributario, los
| documentos electrónicos firmados no transmitidos a la Administración Tributaria presumen la
| generación de ingresos gravados por las transferencias de bienes o prestación de servicios.
| 9. Transmisión
De conformidad a lo dispuesto en el artículo 119-A inciso primero literal d) del Código Tributario, la
| Transmisión de los Documentos Electrónicos a la Administración Tributaria se realizará según la
modalidad de emisión, en los siguientes plazos:
No. | Modalidad de Forma de Entrega al Tipo de Documento
LL . Plazo oa
Emision Transmision Receptor Electronico
1 Normal Previa Antes de su | Electrónica | Todos los descritos en el
entrega al numeral 4 de la presente
receptor. Normativa
2 Contingencia Diferida Hasta 72 horas | Electrónica | Únicamente para CCFE, FE,
contadas a partir FEXE, NRE, NDE y FSEE del
del otorgamiento numeral 4 de la presente
del Sello de Normativa.
Recepción del
Evento de
Contingencia.
Cuadro 1: Transmisión
| La forma y condiciones para la Transmisión de los Documentos Tributarios Electrónicos se
| encuentra establecida en el punto 3. TRANSMISIÓN del Anexo |: “ESPECIFICACIONES
TECNOLÓGICAS" de la presente Normativa.
|
| 13

<!-- PAGE 14 / 112 (OCR) -->

9.1. Plataformas de Transmisión
Las plataformas de transmisión de los DTE son:

e Sistema de Transmisión DTE: Su función es la transmisión de los datos de los DTE desde

el sistema de emisión de documentos de cada sujeto pasivo al servicio de recepción de los
DTE de la Administración Tributaria.
Los sujetos pasivos que utilicen este sistema deberán adecuar su sistema informático
interno de acuerdo a los requerimientos técnicos funcionales específicos a su modelo de
negocio, de forma que sean compatibles con los servicios de transmisión de documentos
y Eventos a la Administración Tributaria, sin perjuicio de poder utilizar las tecnologías que
mejor les resuelva dicha compatibilidad.

e Sistema de Facturación DTE: Su función es la transmisión de los datos de los DTE
utilizando el sistema de facturación de la Administración Tributaria incorporado en la página
web del Ministerio de Hacienda.

10. Reglas para el otorgamiento del Sello de Recepción
De conformidad a lo dispuesto en los artículos 119-A inciso primero literal f) y 119-C inciso quinto
del Código Tributario, una vez se hayan generado, firmado y transmitido los Documentos
Electrónicos y los Eventos respectivos, la Administración Tributaria verificará el cumplimiento de las
siguientes reglas, previo al otorgamiento del Sello de Recepción:
1. Cumplir con los contenidos y especificaciones formales, con fines tecnológicos y de
control descritas en las Estructuras de Datos que se encuentran establecidas en los Anexos ll:
"ESTRUCTURA DE DATOS DTE" y lll: "ESTRUCTURA DE DATOS EVENTOS”.
2. Haber sido generados en el Formato Electrónico establecido en el punto 1.5 “Formato
Electrónico" del Anexo |: "ESPECIFICACIONES TECNOLÓGICAS" para cada tipo de
Documento y Evento.
3. Incorporar firma electrónica de conformidad con las condiciones y mecanismos
establecidos para el efecto en el punto 2. FIRMA ELECTRÓNICA del Anexo |:
"ESPECIFICACIONES TECNOLÓGICAS".
4. Cumplir con los plazos o tiempos asociados a la transmisión de documentos electrónicos
y eventos previstos en los puntos 9. TRANSMISIÓN y 12.1 “Transmisión de los Eventos" de la
presente Normativa.
5. Cumplir con las reglas de validación para documentos y Eventos establecidas en los Anexos
IV: "VALIDACIONES PARA CAMPOS DTE" y V: "VALIDACIONES PARA CAMPOS EVENTOS" de
la presente Normativa.
Si cumple con las anteriores reglas, la Administración Tributaria otorgará el Sello de Recepción, con
lo cual los documentos electrónicos transmitidos tendrán el carácter de Documentos Tributarios
Electrónicos; y respecto a los Eventos, éstos surtirán los efectos de la Invalidación y Contingencia
descritos en los puntos 12.3 “Efectos del Evento de Invalidación” y 12.4 "Efectos del Evento de
Contingencia” de esta Normativa.
14

<!-- PAGE 15 / 112 (OCR) -->

De conformidad a lo dispuesto en el artículo 119-D inciso segundo del Código Tributario, a partir
del otorgamiento del Sello de Recepción el Documento Tributario Electrónico surte los efectos
fiscales establecidos en el artículo 206 inciso tercero del Código Tributario, por lo que podrá
amparar las deducciones de las erogaciones correspondientes.
Los documentos electrónicos transmitidos que no cumplan con las reglas para el otorgamiento del
Sello de Recepción, tendrán que ser corregidos o subsanados dentro del plazo de 24 horas
contadas a partir de la fecha de comunicación del motivo de rechazo por la Administración
Tributaria.
Los documentos electrónicos corregidos que sean retransmitidos para obtener el Sello de
Recepción, deberán llevar el mismo Código de Generación que poseían los documentos
rechazados originalmente.
En el caso de los Eventos, éstos deberán retransmitirse debidamente corregidos con el mismo
Código de Generación que poseían los eventos rechazados originalmente, dentro de los plazos
establecidos en los puntos 12.1.1 “Evento de Invalidación” y 12.1.2 "Evento de Contingencia” de esta
Normativa.
Una vez transcurridos los anteriores plazos, sin que los respectivos documentos y Eventos hayan
sido corregidos o subsanados, los sujetos pasivos deberán transmitir los respectivos documentos y
Eventos con un nuevo Código de Generación, a efecto de obtener el Sello de Recepción
correspondiente.
En caso la información contenida en el Documento Tributario Electrónico sea alterada
posteriormente al otorgamiento del Sello de Recepción por el sujeto pasivo, se considerará
Documento Electrónico Apócrifo, por lesión al interés fiscal, sin perjuicio de lo establecido en los
artículos 199 incisos segundo y tercero y 206 inciso quinto del Código Tributario.
Asimismo, conforme al inciso tercero del artículo 119-D del Código Tributario, el otorgamiento del
Sello de Recepción, no implica validación o autorización alguna de la operación que se documenta,
no obstante, el otorgamiento o no del citado Sello no afecta la validez jurídica de la operación o
negocio efectuado. Su otorgamiento tampoco implica que el documento no pueda ser objetado
por la Administración Tributaria en el ejercicio de sus facultades legales.
10.1. Estados de los documentos
Realizado el proceso para la obtención del Sello de Recepción, los documentos transmitidos
podrán tener los siguientes estados:
e Transmitido satisfactoriamente: Habiendo obtenido el Sello de Recepción se tiene por
efectuada la transmisión, adquiriendo el carácter de Documento Tributario Electrónico.
Dentro de este Estado se presentan las siguientes condiciones:
o Ajustado: Cuando el documento transmitido ha sido objeto de ajustes mediante
otro documento transmitido, que afectan la operación.
o Observado: El documento tiene observaciones de la Administración Tributaria, que
no afectan su validez jurídica.
e Rechazado: El documento no obtuvo el Sello de Recepción. No podrá amparar las
deducciones de las erogaciones correspondientes; no obstante, conforme al inciso
15
|

<!-- PAGE 16 / 112 (OCR) -->

primero del artículo 199 del Código Tributario, presumirá que ha sido generado para
documentar ingresos por las transferencias de bienes o prestación de servicios gravadas.

e Invalidado: El documento obtuvo el Sello de Recepción, pero posteriormente el emisor
transmitió un Evento de Invalidación para invalidarlo. El documento invalidado no posee
validez tributaria y quedará sin valor alguno la versión interpretada y legible entregada.

10.2. Registro y declaración de los DTE

Los documentos deberán registrarse en los libros de control del Impuesto a la Transferencia de
Bienes Muebles y a la Prestación de Servicios y en la contabilidad, según el caso, con la fecha en
que fueron generados, utilizando el Código de Generación, inclusive cuando no hubiesen sido
transmitidos; lo anterior, sin perjuicio de lo dispuesto en el artículo 119-C inciso quinto del Código
Tributario, que establece que los Documentos Tributarios Electrónicos han sido emitidos a partir
de la fecha en que la Administración Tributaria otorgue el Sello de Recepción.
Los receptores de documentos que excepcionalmente fueron generados por los sujetos pasivos
sin Sello de Recepción conforme a lo establecido en el punto 11.2 "Entrega con Transmisión
Diferida” de esta Normativa, deberán consultar en el sitio web del Ministerio de Hacienda, que los
documentos recibidos cuentan con el citado Sello, a efecto que amparen las deducciones de las
erogaciones correspondientes.
Asimismo, los sujetos pasivos deberán incorporar en sus declaraciones del Impuesto a la
Transferencia de Bienes Muebles y a la Prestación de Servicios, los documentos del período
tributario en que fueron generados.
11. Entrega de los DTE
Los documentos generados siempre deberán firmarse electrónicamente previo a su entrega.
De conformidad a lo dispuesto en el artículo 119-A inciso primero literal b) y 119-C inciso quinto del
Código Tributario, se establece que la entrega de los Documentos Tributarios Electrónicos al
receptor se realizará de forma electrónica, por lo que deberá entregarse un Archivo DTE y una
versión interpretada y legible, tomando en cuenta lo siguiente:
11.1 Entrega con Transmisión Previa
Los Documentos Tributarios Electrónicos generados y transmitidos a la Administración
Tributaria, deberán entregarse incorporando el Sello de Recepción otorgado por la misma
de forma electrónica al receptor, en la modalidad establecida en el numeral 6.1 de la
presente Normativa.
Conforme a lo dispuesto en el artículo 119-C inciso sexto del Código Tributario, es
obligación de los receptores exigir la entrega de los Documentos Tributarios Electrónicos,
lo que implica que deberán exigirlos con el respectivo Sello de Recepción otorgado por la
Administración Tributaria, excepto en los casos de Contingencia, que no contarán con
dicho Sello, pero deberán expresar en su contenido el valor de campo “Tipo de Transmisión
por contingencia” Código 2, conforme al CAT-004 Tipo de Transmisión.
El fedatario no se encuentra obligado a exigir la emisión de los Documentos Tributarios
Electrónicos, por ende, podrá en sus actuaciones verificar el cumplimiento de la obligación
16

<!-- PAGE 17 / 112 (OCR) -->

de emitir dichos documentos. Lo anterior, sin perjuicio de lo establecido en los artículos

179, 180 y 181 del Código Tributario.

11.2 Entrega con Transmisión Diferida

Los documentos electrónicos generados en la modalidad establecida en el numeral 6.2

“Emisión con Transmisión Diferida a la Administración Tributaria” de la presente Normativa,

se entregarán al receptor de forma electrónica sin contar con el Sello de Recepción, no

obstante, la transmisión de los documentos se deberá realizar posteriormente a la

Administración Tributaria conforme a lo establecido en el punto 9 “Transmisión” de esta

Normativa.

En ese sentido, deberá entregarse el formato electrónico del documento firmado (sin el

Sello de Recepción) y su versión interpretada y legible.

Sin perjuicio de lo anterior, de conformidad al inciso primero del artículo 199 del Código

Tributario, se presumirá que los documentos firmados no transmitidos, han sido generados

para documentar ingresos por las transferencias de bienes o prestación de servicios

gravadas.

11.3 Versiones interpretadas y legibles del Documento Tributario Electrónico
| De conformidad a lo dispuesto en el artículo 119-A inciso primero literal e) del Código

Tributario, los sujetos pasivos deberán generar y entregar en todo caso una versión

electrónica interpretada del DTE, que sea legible para el receptor.

La versión electrónica interpretada del DTE como expresión del mismo, deberá generarse

de manera simultánea y entregarse junto con dicho DTE por cada operación que realicen

los sujetos pasivos.

Estas versiones no tendrán validez probatoria en los mismos términos concedidos a los
| Documentos Tributarios Electrónicos que representan; su finalidad es la de expresar con
| claridad los datos de los citados documentos de forma ordenada y fácilmente

comprensible para el usuario.

Dichas versiones reciben el nombre genérico de Representación Gráfica, que deberán
| entregarse utilizando las tecnologías que mejor resuelvan el modelo de negocio del sujeto
| pasivo.
| Las versiones electrónicas interpretadas y legibles del DTE, deberán integrar un parámetro
| de consulta dentro de un Código QR. Los parámetros respectivos se establecen en el
| "Manual Tecnológico para la Integración del Sistema de Transmisión”.
| Los contenidos, características y especificaciones que deberán cumplir dichas versiones
| legibles se categorizan conforme a lo dispuesto en la columna “Version legible” de la
| estructura contenida en el Anexo II: "ESTRUCTURA DE DATOS DTE" de esta Normativa.
| Los sujetos pasivos deberán utilizar el diseño grafico idóneo para el cumplimiento de los
| mismos.

17
|
|

<!-- PAGE 18 / 112 (OCR) -->

12. Conservación de los DTE
Los Documentos Tributarios Electrónicos deberán ser conservados electrónicamente de forma
segura e inalterable durante el plazo exigido en el artículo 147 del Código Tributario, es decir,
conservando con exactitud la misma información, estructura de datos y formato electrónico con
que fueron generados, firmados y transmitidos a la Administración Tributaria.
De la misma forma deberán conservarse los documentos tributarios firmados y entregados que no
han sido transmitidos a la Administración Tributaria.
12.1 Anulación y destrucción de documentos físicos
Los documentos físicos relativos al control del Impuesto a la Transferencia de Bienes Muebles y a
la Prestación de Servicios y comprobantes de donación impresos que ya no deban utilizarse, por
haber sido reemplazados por DTE, tendrán que ser presentados a la Administración Tributaria para
su anulación y destrucción. Asimismo, deberá informarse los correlativos autorizados que ya no
deban ser utilizados de conformidad a lo antes establecido.
A excepción de los sujetos pasivos que utilicen únicamente la plataforma “Sistema de Facturación
DTE" operable dentro de la página web del Ministerio de Hacienda, ningún sujeto pasivo podrá
mantener documentos físicos o impresos, mientras la Administración Tributaria no establezca otra
condición.
Para efecto de lo establecido en el párrafo anterior, se entiende por documentos impresos inclusive
a los sistemas de emisión de documentos digitales, portables o imágenes, que no poseen la
estructura de datos ni el formato electrónico establecido por la Administración Tributaria.
13. Eventos
De conformidad con lo establecido en los artículos 119-E y 119-F del Código Tributario. los Eventos
relacionados con los Documentos Tributarios Electrónicos son los siguientes:
a) Evento de Invalidación.
b) Evento de Contingencia.
La Estructura de Datos de los citados Eventos se encuentra establecida en el Anexo lll:
"ESTRUCTURA DE DATOS EVENTOS" de la presente Normativa.
Conforme a lo dispuesto en el artículo 119-A inciso primero literal g) del Código Tributario, la
Administración Tributaria podrá establecer otros Eventos relacionados a los DTE, mediante la
modificación a la presente Normativa.
13.1 Transmisión de los Eventos
De conformidad a lo establecido en el inciso cuarto del artículo 119-D del Código Tributario,
deberán transmitirse los eventos de invalidación y de contingencia, informando los Documentos
Tributarios Electrónicos que serán invalidados o que fueron emitidos en contingencia. La
transmisión de los referidos Eventos deberá efectuarse de esta manera:
18

<!-- PAGE 19 / 112 (OCR) -->

|
|
|
|
13.1.1 Evento de Invalidación
vo] fm | REET | ee | wen | EER

| No. relacionado con el Caso Condición Transmitir el
| Legal
| Evento Evento
| iA Art. 119-E | Todos los | Errores que no | Que el error ocurra por | Un día siguiente
| inc. 1 documentos descritos | impliquen ajuste a la | causa del emisor en el | al otorgamiento
| literal a) en el numeral 4 de la | operación o negocio | ingreso de los datos de un | del Sello de
| Código presente Normativa. subyacente celebrado | DTE. Por ejemplo: | Recepción.
| Tributario con el receptor, sino la | Equivocación cometida al
| invalidación del DTE | introducir los datos de la
| que tiene el dato | fecha, nombre o

errado. descripción, entre otros, en

: el documento.

2 Art. 119-A | CCFE, NRE, NCE, NDE, | Cuando se rescinda | Que se rescinda totalmente | Un día siguiente
inc. 1 CLE, CRE, DCLE, FSEE | totalmente la | la operación o negocio | al otorgamiento
lit. g) y CDE del numeral 4 | operacion. celebrado con el receptor. | del Sello de
Código de la presente Por ejemplo: Cuando ocurra | Recepción.
Tributario | Normativa la devolución de los bienes

vendidos.

3 Art. 119-E | FE y FEXE del numeral | Cuando se rescinda | Que se rescinda o modifique | Dentro de tres
inc. 2 4 de la presente | totalmente la | la operación o negocio | meses contados
Código Normativa operación o se afecten | celebrado con el receptor. | a partir del
Tributario las operaciones | Por ejemplo: La reducción | otorgamiento

realizadas. del precio del bien o servicio | del Sello de
prestado o cambio de un | Recepción del
producto o servicio | documento a
diferente. invalidar.
| Cuadro 2: Invalidacion
13.1.2 Evento de Contingencia
| Previo a considerarse en contingencia, el emisor deberá cerciorarse de haber agotado la “política
| de reintentos” establecida en el “Manual Tecnológico para la Integración del Sistema de
| Transmisión".
| EERE o
| No. relacionado con el Caso Condición Transmitir el
| Legal
Evento Evento
| 1 Arts. 119- | Unicamente CCFE, FE, | Cuando se presenten | Que el imprevisto no es | 24 horas
| Ainc. 1 FEXE, NRE, NCE, NDE y | situaciones de fuerza | posible resistir. Por ejemplo: | contadas a partir
lit. 9) y FSEE del numeral 4 de | mayor que | Fallas ocasionadas por los | del cese de la
119-F la presente Normativa. | imposibiliten la | proveedores en el suministro | situación de
| Código transmisión de los | del servicio de Internet o | fuerza mayor
| Tributario documentos indisponibilidad de acceso a | que provocó la
| electrónicos a la | la plataforma informática | contingencia.
| Administracion establecida por la
| Tributaria. Administracion Tributaria.
Cuadro 3: Contingencia
El emisor debera reiniciar los reintentos como minimo cada quince minutos para asegurarse del
restablecimiento de la conectividad del sistema de emision DTE con los servicios de la
Administracion Tributaria.
19
|
|

<!-- PAGE 20 / 112 (OCR) -->

13.2 Lineamientos para el evento de invalidación
A excepción de la Nota de Crédito electrónica y el Comprobante de Liquidación electrónico,
cuando el motivo del Evento de Invalidación sea distinto a la rescisión total de la operación, previo
a la transmisión del citado Evento, deberá generarse y transmitirse el nuevo documento que ampara
la operación, debido a que la estructura del Evento de Invalidación contiene tanto la identificación
del documento a invalidar como del nuevo documento que ampara la operación.

En todo caso, la invalidación únicamente procederá respecto de documentos tributarios que hayan
obtenido previamente el Sello de Recepción.

13.2.1 Reglas para invalidación de Facturas y Facturas de Exportación Electrónicas
Cuando se trate de la invalidación de facturas electrónicas y facturas de exportación electrónicas,
por ajustes a las ventas que rebajen el débito fiscal, ésta deberá realizarse dentro del plazo de tres
meses contados a partir de la fecha de la entrega de los bienes o a partir de la fecha en la que se
preste el servicio.

Respecto de las operaciones cuyo monto total sea menor a tres salarios mínimos mensuales,
conforme a lo dispuesto en el artículo 119-G inciso primero literal b) número VII del Código
Tributario cuando se trate de Facturas electrónicas no será requerido la identificación del Receptor
para el otorgamiento del Sello de Recepción.

No obstante lo anterior, cuando se trate de un Evento de Invalidación de Factura electrónica, será
condición indicar el nombre y documento de identificación de la persona que solicita la invalidación
ante el sujeto pasivo emisor, además del nombre y documento de identificación del responsable
de realizar dicho Evento por parte del emisor.

13.2.2 Diferencia entre error y afectación
Se considera que existe error que no afecta la operación, cuando se trate de omisiones o
inexactitudes en los datos introducidos al DTE respecto de la transacción que se está
documentando, por ejemplo, cuando el precio de los bienes convenido en la operación difiera por
error del documentado.

La afectación implica una modificación realizada a una transacción previamente documentada, por
ejemplo, cuando el precio convenido en la operación sea modificado posteriormente por una
nueva negociación.

Por lo tanto, conforme a lo dispuesto en el artículo 119-E inciso cuarto del Código Tributario, si no
se trata de la corrección de errores, los Comprobantes de Crédito Fiscal y Comprobantes de
Retención que hayan obtenido el Sello de Recepción, deberán ser modificados para ajustar el
débito o crédito fiscal del Impuesto a la Transferencia de Bienes Muebles y a la Prestación de
Servicios, mediante Notas de Débito o Crédito, según corresponda, en los plazos establecidos para
tal efecto en la Ley de la materia.

13.3 Efectos del Evento de Invalidación
Una vez el Evento de Invalidación transmitido dentro de los plazos establecidos en el cuadro 2:
"Invalidación” haya obtenido el Sello de Recepción, el Documento Tributario Electrónico

20

<!-- PAGE 21 / 112 (OCR) -->

|
|
| relacionado con él quedará invalidado y no podrá utilizarse para amparar deducciones del Impuesto
| sobre la Renta y del Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios.
| En este caso, al sujeto pasivo emisor no le sera aplicable la sancion establecida en el articulo 239-
| A inciso primero literales g) y h) del Código Tributario.
| Transcurridos los plazos establecidos en el Cuadro 2: Invalidacion, los documentos no podran
invalidarse mediante la transmision del Evento de Invalidacion.
| Las invalidaciones de los DTE no constituyen ajustes al débito o crédito fiscal, por lo tanto, no le
| son aplicables las reglas o plazos establecidos en los artículos 62 y 63 de la Ley de Impuesto a la
| Transferencia de Bienes Muebles y a la Prestación de Servicios.
Por lo anterior, las declaraciones del referido impuesto deberán sujetarse a las siguientes reglas:
a. Si el Evento obtiene el Sello de Recepción en el mismo período tributario de
emisión del DTE objeto de invalidación, no ocasionará modificación alguna en la
declaración del período tributario.
b. Si el Evento obtiene el Sello de Recepcion en un periodo tributario posterior al de
la emisión del DTE objeto de invalidación, esta invalidación deberá reflejarse en la
declaración del período tributario en que obtuvo el Sello de Recepción el Evento de
Invalidación.
13.4 Efectos del Evento de Contingencia
Una vez el Evento de Contingencia transmitido dentro del plazo establecido en el cuadro 3:
| “Contingencia” haya obtenido el Sello de Recepción, los documentos electrónicos generados y
firmados en contingencia deberán transmitirse a la Administración Tributaria en un plazo no mayor
a setenta y dos horas contadas a partir de la obtención del citado Sello.
En este caso, al sujeto pasivo emisor no le será aplicable la sanción establecida en el artículo 239-
| A inciso primero literales q) y h) del Código Tributario.
| Cuando la contingencia persista por mas de cuatro dias consecutivos, el sujeto pasivo debera
presentar un Informe Técnico en las siguientes cuarenta y ocho horas dirigido a la Administracion
| Tributaria, en el que debera exponer las causas que producen la contingencia y los motivos para
| no superarla, indicando su plan de acciones a implementar para solventar la misma, asi como las
medidas de control interno que tomara para prevenir la recurrencia de tales situaciones.
| El citado Informe Técnico se presentará en la forma que establezca la Administración Tributaria.
| Las declaraciones del Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios
deberán reflejar las operaciones realizadas y documentadas en contingencia, una vez los
documentos respectivos cuenten con el Sello de Recepción, sin perjuicio de la sanción establecida
| en el articulo 239-A literal a) del Codigo Tributario, respecto de las operaciones cuyos documentos
| no sean transmitidos a la Administracion Tributaria.
| La entrega del documento electrónico en contingencia sin contar con el Sello de Recepción no
| exime a los emisores de la obligación de transmitir los documentos a la Administración Tributaria
21

<!-- PAGE 22 / 112 (OCR) -->

para el otorgamiento del citado Sello de Recepción, sin perjuicio de las sanciones establecidas en
el artículo 239-A literales a) y d) del Código Tributario, en caso no obtengan el referido Sello o no
sean transmitidos a la Administración Tributaria.
Lo anterior no es aplicable para los sujetos pasivos usuarios de la aplicación web denominada
“Sistema de Facturación DTE", los cuales mientras dure la contingencia, podrán utilizar los
documentos con numeración correlativa previamente autorizada (documentos preimpresos por
imprenta, Formulario único y Sistemas de emisión de documentos mediante imprentas digitales
(PDF)), mientras la Administración Tributaria no determine otra opción.
14. Consulta
El receptor podrá consultar el estado de los Documentos Tributarios Electrónicos recibidos, en el
sitio web del Ministerio de Hacienda, para cerciorarse que estos hayan obtenido el Sello de
Recepción, a afecto de respaldar debidamente las deducciones correspondientes.
La consulta de los Documentos Tributarios Electrónicos se puede efectuar en el sitio web de
facturación electrónica del Ministerio de Hacienda, durante el plazo que establezca la
Administración Tributaria.
Los emisores de Documentos Tributarios Electrónicos podrán consultar los documentos emitidos
y recibidos, mediante la página web del Ministerio de Hacienda.
15. Coexistencia
Los sujetos pasivos emisores de Documentos Tributarios Electrónicos de conformidad a las fechas
establecidas en el Programa de Implementación establecido por la Administración Tributaria, que
poseen autorizaciones para el uso de documentos equivalentes (tiquetes) a que se refiere el artículo
107 inciso segundo del Código Tributario, emitidos mediante máquinas registradoras o sistemas
computarizados, podrán continuar utilizandolos hasta el 31 de diciembre de 2024.1
A partir del 1 de enero de 2025! los sujetos pasivos emisores de Documentos Tributarios
Electrónicos, no podrán seguir utilizando documentos equivalentes (tiquetes), por lo que deberán
emitir Factura Electrónica por las operaciones que realicen con consumidores finales.
Asimismo, a partir de la sustitución de tiquetes por Factura Electrónica, los carteles de Caja
Registradora entregados por la Administración Tributaria cesarán totalmente en sus efectos.
16. Gratuidad
Para los efectos establecidos en el artículo 119-H del Código Tributario, la Administración Tributaria
pondrá a disposición de los sujetos pasivos una aplicación web para la emisión de los DTE,
denominada “Sistema de Facturación DTE" operable dentro de la página web del Ministerio de
Hacienda.
Dicha solución está dispuesta para los sujetos pasivos que cumplen los parámetros establecidos
por la Administración Tributaria.
1 Control de Cambios No. 1.1 Modificación 4 de junio de 2024

22

<!-- PAGE 23 / 112 (OCR) -->

| Asimismo, proveerá a los sujetos pasivos de otras soluciones tecnológicas gratuitas que considere
pertinentes.
17. Programa de Implementacion
La Administración Tributaria establecerá los grupos de contribuyentes y las fechas de inicio de la
obligación para emitir los Documentos Tributarios Electrónicos.
Los contribuyentes obligados en cada grupo serán notificados por la Administración Tributaria a
través de los medios pertinentes. La transmisión de los citados documentos a la plataforma
informática establecida por esta Administración Tributaria, deberá comenzar a partir de las fechas
de inicio de la obligación para emitir los DTE establecida en el Programa de Implementación
| respectivo. ’
Los contribuyentes emisores de DTE deberan implementar en todos sus establecimientos, todos
los tipos de documentos tributarios que emiten de conformidad a su operatividad y obligaciones;
| es decir, los mismos que le han sido autorizados por la Administracion Tributaria ademas de
| cualquier otro que surja de su operatividad.
Los contribuyentes podran optar por iniciar la emision de DTE previo a la fecha establecida por la
| Administración Tributaria.
Los contribuyentes para ser emisores de DTE, según la plataforma a utilizar, deberán cumplir con
| los siguientes requisitos:
a) Sistema de Transmisión: Contar con un sistema de emisión de DTE, de acuerdo a las
disposiciones pertinentes del Código Tributario, de esta Normativa y de las Guías y
Manuales emitidos por la Administración Tributaria para tal efecto. Asimismo, deberán
| completar satisfactoriamente las pruebas requeridas.
| b) Sistema de Facturación: Cumplir con los parámetros definidos por la Administración
Tributaria para la emisión de DTE y completar satisfactoriamente las pruebas de adaptación
requeridas. )
| 18. Fechas y condiciones para liberacion de la presentacion de informes
| Conforme al artículo 119-A inciso primero literal i) del Código Tributario, la Administración Tributaria
establecerá oportunamente las fechas a partir de las cuales los sujetos pasivos que emitan DTE,
quedarán liberados de las obligaciones de presentación de los informes regulados en dicho Código.
19. Lineamientos para Versiones y Modificaciones de la Normativa
| Cuando deba actualizarse la presente Normativa los sujetos pasivos deberán realizar las
| adaptaciones necesarias dentro de los siguientes plazos:
| Plazo de adaptación
1 Versiones Cambios sustanciales en las estructuras de | Dentro de los diez primeros días
datos, formato electrónico o firma de los | hábiles del tercer mes que sigue al
DTE y Eventos. período tributario en que fue
comunicado el cambio, a
excepción de la versión 1.0 (inicial).
23

<!-- PAGE 24 / 112 (OCR) -->

2 Modificaciones Cambios mínimos en las estructuras de | Dentro de los diez primeros días
datos de los DTE y Eventos. hábiles del mes siguiente al período
tributario en que fue comunicado el
cambio.
Cuadro 4: Modificaciones y Versiones
Los cambios en esta Normativa que no afecten las estructuras de datos, formato electrónico o
firma de los DTE y Eventos, tendrán vigencia a partir del día de su publicación.
La Administración Tributaria no otorgará el Sello de Recepción a los DTE y Eventos que no apliquen
los cambios respectivos dentro de los plazos de adaptación establecidos en el cuadro 4 anterior.
20. Anexos
Los siguientes Anexos forman parte integrante de la presente Normativa:
ANEXO |: ESPECIFICACIONES TECNOLÓGICAS
ANEXO II: ESTRUCTURA DE DATOS DTE
ANEXO III: ESTRUCTURA DE DATOS EVENTOS
ANEXO IV: VALIDACIONES PARA CAMPOS DTE
ANEXO V: VALIDACIONES PARA CAMPOS EVENTOS
21. Vigencia
La presente Normativa estará vigente a partir de la fecha de su emisión.
San Salvador, 17 de noviembre de 2025.
= — - TN e
4 == < nL. DE IMP,
7 a Ya El
/ ( / / / - 7 / a
( / a7 /, 7 E o o
E /A hyo eS
(/ / pra 7 y rd /
Maryin Sorto
Director General
/ Dirección General de Impuestos Internos
24

<!-- PAGE 25 / 112 (OCR) -->

| ANEXO |
| ESPECIFICACIONES TECNOLOGICAS

De conformidad a lo dispuesto en el artículo 119-A inciso primero literales b), c) y g) del Código
Tributario, el presente anexo comprende las instrucciones y especificaciones tecnológicas
requeridas para la emisión de los DTE y Eventos.
1. GENERACIÓN DE LOS DTE
11. Código de Generación
Es un UUID o Identificador Único Universal formado por un número de 16 bytes (128 bits). Se
expresa mediante 32 dígitos hexadecimales divididos en cinco grupos separados por guiones de la
forma 8-4-4-4-12 que totalizan 36 caracteres, utilizando letras mayúsculas (32 dígitos y 4 guiones).
Se utilizará UUID versión 4.
Por ejemplo: 550E8400-E29B-41D4-A716-446655440000
La generación del UUID versión 4 es diferente según el lenguaje de programación que se utilice, el
emisor deberá utilizar la librería correspondiente a la tecnología utilizada en sus sistemas. Este UUID
será la estructura requerida por la Administración Tributaria para la creación del Código de
Generación dentro del DTE y Evento emitido y será responsabilidad de cada emisor la generación
de este código.
El archivo DTE deberá identificarse con el Código de Generación.
1.2. Campos y Secciones
Los sujetos pasivos deberán implementar las Estructuras de Datos que integran el formato
electrónico JSON para la generación de los DTE.
Las Estructuras de los Documentos Tributarios Electrónicos son indicaciones del contenido y de
las especificaciones que deben cumplirse según el documento tributario que se esté generando;
de conformidad a lo establecido por la Administración Tributaria.
Estas estructuras están divididas en campos y secciones.
Los campos de los documentos son la información (datos) que la Administración Tributaria requiere
para generar, transmitir y recibir un DTE; es importante mencionar que cada tipo de documento
contiene sus campos con información específica.
Las secciones son agrupaciones de campos con información relacionada, en que se han dividido
las estructuras de los documentos tributarios, estas secciones son:

1. Sección “Identificación”: Sección obligatoria incluida en todas las estructuras, donde se

detallan las generales del documento que se está generando.
2. Sección “Documentos Relacionados": Este apartado deberá llenarse si existiere
documento a relacionar.
25

<!-- PAGE 26 / 112 (OCR) -->

3. Sección "Emisor": Sección obligatoria incluida en todos los documentos tributarios, donde
se describen los datos del emisor del documento. Es importante destacar que esta sección
puede llamarse de otras formas dependiendo del documento que se esté generando, de la
siguiente forma: Exportador para la FEXE, Agente de retención para el CRE, Comisionista
para el CLE, Agente perceptor para el DCLE y Donatario para el CDE.

4. Sección “Receptor”: En esta sección se describen los datos generales de quien está
recibiendo el documento tributario. Puede variar su nombre dependiendo del documento
realizado de la siguiente forma: Sujeto de retención para el CRE, Mandante para el CLE,
Afiliado para el DCLE y Donante para el CDE.

5. Sección “Documentos asociados”: Esta sección es opcional para la mayoría de los
documentos tributarios, y permite anexar información relevante de la operación; esta
información puede ser del emisor (contratos, resoluciones, etc.), del receptor (contratos,
resoluciones, autorizaciones, etc.), del médico (identificación, nombre, procedimiento,
etc.) y del medio de transporte (identificación, conductor, entre otros). Es obligatorio solo
para el CDE.

6. Sección "Venta a cuenta de terceros”: Utilizada para describir la información del sujeto
pasivo a cuenta de quien se está realizando la venta, incluida en la mayoría de los
documentos tributarios, exceptuando el CRE, DCLE, CLE, FSEE y CDE.

7. Sección "Compra por cuenta de terceros”: Utilizada para describir la información del
sujeto a cuenta de quien se está realizando la compra para la exportación, aplicable a FEXE.

8. Sección "Cuerpo del documento”: Sección obligatoria para todos los documentos
tributarios, en esta sección se detalla la información propia de cada documento tributario.

9. Sección “Resumen”: Contiene un resumen general de la información del cuerpo del
documento, es obligatoria y se encuentra en todos los documentos tributarios, excepto en
el DCLE.

10. Sección “Extensión”: Se detalla entre otros los datos generales de los responsables de
entregar y recibir el documento, esta sección es opcional para los DTE exceptuando el
DCLE.

11. Sección “Apéndice”: Esta sección es opcional y se encuentra a disposición para incluir
cualquier otra información dentro de los documentos.

El “Sello de Recepción” no es una sección ni un campo de los documentos tributarios, se incorpora
con la finalidad de hacer del conocimiento al sujeto pasivo que la Administración Tributaria enviará
un código encriptado con ese nombre, por cada documento tributario que haya sido
correctamente transmitido.

Asimismo, las especificaciones de cada campo se han detallado en las siguientes columnas:
1. N° de campo: Número secuencial que identifica cada campo en un documento Tributario.
2. N° Sección: Contiene el número de sección a la cual pertenece cada campo.
3. Campo JSON: Esta columna contiene el nombre de la sección y del campo en el JSON a

generar del documento.
26

<!-- PAGE 27 / 112 (OCR) -->

|

|

| 4. Versión legible: Esta columna indica si el campo debe ser colocado en la versión interpretada y
legible del documento, según una codificación alfabética.

5. Nombre del Campo: Contiene el nombre asignado a cada campo.

6. Descripción de contenido del campo: Esta columna describe la información específica
requerida en cada campo (valores, datos, códigos entre otros); pueden encontrarse fórmulas
para determinar el campo, ejemplos y algunas condiciones especiales.

7. Condición del campo: Determina si el campo es “Requerido para su transmisión”, “Requerido
por tipo de operación” u “Opcional”, conforme se detalla en el punto 1.3 “Definición de
condiciones de campo” de este anexo.

8. Tipo de dato: Columna que detalla si el campo es numérico o alfanumérico.

9. Longitud/precisión: Contiene la extensión permitida para el campo.

| 1.3. Definición de condiciones de campo
los Un campo es-un espacio de almacenamiento para un dato en particular contenido en la Estructura
N de Datos de los DTE que se detalla en el Anexo Il: "ESTRUCTURA DE DATOS DTE". Cada campo de
| la estructura comprende las siguientes condiciones:
| i. Requerido para su transmisión: Se coloca esta condición a los campos requeridos
| por la Administración Tributaria en la estructura JSON. Se rechazarán los
| documentos que no contengan estos campos con la información requerida.
| il. Requerido por tipo de operación: Se coloca esta condición a los campos que
deberán completarse cuando el tipo de operación o modalidad del negocio que se
está desarrollando lo requiera, ya sea por condiciones de lugar, giro o por el tipo
de obligaciones que se le ha asignado al sujeto pasivo.
il. Opcional: Esta condicion se coloca a los campos que dependiendo de la
necesidad de cada sujeto pasivo podrá hacer uso o no de ellos.
Cuando existan campos o secciones que por tipo de operación o modalidad del negocio no sean
utilizados y éstos tengan asignada la condición Requerido por tipo de operación u Opcional, se
deberán completar siguiendo las siguientes reglas:
Campos numéricos: Deberán completarse con 0.00.
Campos alfanuméricos: Deberán completarse con null.
Sección completa: Podrá completarse con null.
1.3.1. Restricciones de uso en los campos de los DTE
No se permitirá en los campos de los DTE:
| e Símbolos de monedas en los campos monetarios (5, €, B).
e Exceder la longitud establecida por tipo de campo.
| e Información no pertinente.
| e Imagenes.
| e Signo para valores negativos en los campos numéricos (-). No obstante, se podrá reflejar
| valores negativos en:
|
| 27
|

<!-- PAGE 28 / 112 (OCR) -->

- Campo "Cargos / Abonos que no afectan la base imponible” en Comprobante de Crédito
Fiscal electrónico, Factura y Factura de Exportación electrónicas.
- Cuando en el Comprobante de Liquidación Electrónico se registre la Nota de Crédito
Electrónica y los documentos invalidados.
1.4. Estructura de Datos
La Estructura de Datos de los DTE y Eventos, es un listado organizado de todos los datos pertinentes
que comprende los elementos o campos que integran el formato electrónico del documento, se
encuentran en los Anexos Il: "ESTRUCTURA DE DATOS DTE" y lll: "ESTRUCTURA DE DATOS
EVENTOS”, respectivamente.
1.5. Formato Electrónico
El formato electrónico de los DTE y Eventos se basa en un esquema JSON (JSON-schema). El
esquema define los elementos y atributos que aparecen en los documentos JSON.
Se proporciona una muestra de dicho esquema a continuación:
{
"identificacion": {
"version": 3,
"ambiente": "00",
"tipoDte": "03",
"numeroControl": "DTE-03-M001P001-000000000000002",
"codigoGeneracion": "516413E3-12A2-78D5-7A79-6B6DFE861395",
"tipoModelo": 1,
"tipoOperacion": 1,
"tipoContingencia": null,
"motivoContin": null,
"fecEmi": "2022-10-20",
"horEmi": "11:02:49",
“tipoMoneda": "USD"
),
"documentoRelacionado": null,
"emisor": {
"nit" "
"nombre": " “,
"codActividad": "62020",
"descActividad": " ",
"nombreComercial": " ",
"tipoEstablecimiento": "02",
"direccion": {
"departamento": "06",
"municipio": "14",
"complemento": " *
),
28

<!-- PAGE 29 / 112 (OCR, poco texto) -->

"telefono": " ",
"correo": "",
"codEstable": null,
"codPuntoVenta": null,
"codEstableMH": "4577",
"codPuntoVentaMH": "4578"
),
"receptor": {
"nrc"; "",
"nombre": " ",
"codActividad": "46495",
"descActividad": " ",
"direccion": {
"departamento": "05",
"municipio": "06",
"complemento": " "
),
"telefono": " ",
"correo": " ",
"nombreComercial": " ",
"nit
3
"cuerpoDocumento": [
{
"numitem": 1,
"tipoltem": 2,
"cantidad": 1,
"codigo": "",
"uniMedida": 99,
"descripcion": " ",
"precioUni": 0,
"montoDescu": 0,
"codTributo": null,
"ventaNoSuj": 0,
"ventaExenta": O,
"ventaGravada": 0,
"tributos": [
"20"
1,
"psv": O,
"noGravado": 0
),
1
"resumen"; {
"totalNoSuj": 0,
"totalExenta": 0,
| "totalGravada": 0,
|
| 29

<!-- PAGE 30 / 112 (OCR) -->

"subTotalVentas": 0,
"descuNoSuj": 0,
"descuExenta": 0,
"descuGravada": 0,
"porcentajeDescuento": 0,
"totalDescu": 0,
"tributos": [
{
"codigo": "",
"descripcion": "IVA",
"valor": 0
}
l
"subTotal": 0,
"ivaPerci1"; 0,
"ivaRete1": 0,
"reteRenta": 0,
"monto TotalOperacion": 0,
"totalNoGravado": 0,
"totalPagar": 0,
"totalLetras": " ",
"saldoFavor": 0,
"condicionOperacion": 1,
"pagos": null,
"numPagoElectronico": null
h
"extension": {
"nombEntrega": " ",
"docuEntrega": "",
"nombRecibe": " ",
"docuRecibe": " ",
"placaVehiculo": " ",
"observaciones": " "
),
"apendice"; null,
Los JSON de cada DTE y Evento se corresponden con la columna “campo JSON" de las Estructura
de Datos de los Anexos ||: "ESTRUCTURA DE DATOS DTE" y Ill: "ESTRUCTURA DE DATOS
EVENTOS".
La Administración Tributaria pondrá a disposición de los sujetos pasivos los JSON-schema por el
medio que estime conveniente. Dichos esquemas son herramientas útiles para validar y especificar
la estructura de los documentos JSON.
30

<!-- PAGE 31 / 112 (OCR) -->

1.6. Reglas para el otorgamiento del Sello de Recepción de los DTE y Eventos
La Administración Tributaria otorgará Sello de Recepción a los documentos transmitidos que
cumplan con las reglas previstas en el punto 10 “Reglas para el otorgamiento del Sello de
Recepción” de esta Normativa, conforme al ejemplo que se muestra a continuación:
"selloRecepcion": "2022B37C057541BB4B9B98580A0D1463D6B0A777”
Sin perjuicio de las validaciones descritas en los Anexos IV: "VALIDACIONES PARA CAMPOS DTE" y
V: "VALIDACIONES PARA CAMPOS EVENTOS" de esta Normativa y de las demás de uso interno de
la Administración Tributaria, se aplicarán las siguientes reglas de redondeos y holguras para los DTE:
17. Catálogos
Los catálogos son una lista sistematizada de codificaciones donde se refleja información importante
sobre los campos que se utilizan en los diferentes DTE; estos catálogos permiten conocer y
localizar los diferentes códigos asignados para describir la información clasificada por grupos de
acuerdo a los diferentes campos contenidos en las estructuras de los mencionados documentos.
Los catálogos de los Documentos Tributarios Electrónicos serán establecidos por la Administración
Tributaria, su utilización será obligatoria y estarán disponibles en la forma que ésta establezca.
2. FIRMA ELECTRÓNICA
21. Condiciones y mecanismos
En relación al modelo de firma electrónica para los Documentos Tributarios Electrónicos, se
utilizará la firma electrónica simple, mientras la Administración Tributaria no designe un mecanismo
de firma diferente. La Administración Tributaria es la responsable de la emisión y resguardo de la
información de los certificados de firma simple.
La validación de los referidos certificados la realizará la Administración Tributaria sobre cada
documento transmitido.
Es responsabilidad del emisor administrar su propia infraestructura y software de firma electrónica,
que le permita firmar todos los Documentos Tributarios Electrónicos generados.
La firma electrónica del documento se realizará conforme a los siguientes mecanismos:
Firmado de Documentos JSON Web Signature (JWS)
Estandar de Firmado CAdES - PKCS8EncodedKeySpec y como algoritmo de
encriptado RSA512
La firma electrónica deberá encriptar el documento tributario y los eventos de contingencia e
invalidación, utilizando la información especificada en el certificado electrónico proporcionado por
la Administración Tributaria.
Se proporciona una muestra a continuación:
"firma":
"eyJhbGciOiJSUZUxMiJ9.ewoglCIpZGVudGImaWNhY?2lvbilgOiB7CiAgICAidmVyc2IvbilgOiAZLAog!
31

<!-- PAGE 32 / 112 (OCR) -->

CAgImFtYmltbnRIASICIwMCISCiAgICAidGlwbOROZSIgOiAiMDMiILAogICAgIm51bWVybONvbnRyb2
wilDoglkRURSOwMyOONTC3NDUSOCOWMDAwMDAwMDAwMDAwMDIILAogICAgImNvZGInbOdl
bmVvyYWNpb24ilDogljUxNjQxMOUzLTExQTIENDNENSOSQTC5LTZCNKRGRTg2M TM5MSISCIAGICA
idGIwb01vZGVsby|lgOiAxL AogICAgInRpcG9PcGVyYYWNpb24ilDogMSwKkKICAgICJ 0aXBvQ29udGluz
2VuY2hliA6IG51bGwsCiAgICAibW90aXZvQ 2 9udGluliA61G51bGwsCIiAgICAiZmViRW1plA61CIYyMDI
yLTEwLTIwliwKICAgICJob3JFbWkilDogljEXOjAy OjQOSliwKICAgICJ0aXBv TW9uZWRhlIAGICIVUOQI
CiAgfSwkKICAiZG9jaW1lbnRvUmVsYWNpb25hZG8ilDogbnVsbCwkKICAiZW1pc29yliA6IHsKICAgICJ
uaXQilDogljA2MTQxMJAOMTAXMDEzIiwKICAgICJucmMilDogljlwMDk5NzUiLAoglCAgIm5vbWJyZ
SIgO¡AiR1JVUESQVEJFTULORyBTLkEuIERFIEMuVi4iLAoglCAgImNvZEFjdGl2aWRhZCIgOiAINjIwMjAi
LAoglICAgIMRIc2NBY3RpdmlkYWQilDoglkNvbnN1bHRvesOtYXMgeSBnZXNOacOzbiBkZSBzZXJ2a
WNpb3MgaW5mb3Jtw6F0aWNvceylsCiAgICAibm9tYnJIQ29t7XJjaWFsliA6ICIUURKVNSU5HliwKICA
glCJ0AaXBvRXNOYWIJISZWNpbWIilbnRvI¡A6ICIwMilsCiAgICAiZGlyZWNjaW9uliA6IHsKICAgICAgImRic
GFydGFtZW50bylgOi¡AiMDYiLAogICAgICAibXVuaWNpcGivl¡A6ICIXNCIsCiAgICAgICJjb21wbGVtZ W
50bylgOi¡AiMTEgQ?FsbGUgUG9uaWVudGUsICMgMZkKOOSw9Q29sb25pYSBFc2NhbMOzbiwgU2F
udGEg TWFydGEiCiAgICB9LAogICAgInRIbGVmb25vIliAGICION TAZKSAyNTA2LTM2MTUiLAogICAg|
mNvendibylgOiAiaW5mb0BOcmVtaWS5nLmNvbSIsCiAgICAiY29kRXNOYWJsZSIgOiBudWxsLAOogICA
glmNvZFB1bnRYWMYVudGEIlDogbnVsbCwKkKICAgICJjb2RFC3RhYmxlTUgilDogljQ1NzZCiLAogICAgi m
NvZFB1bnRYvWmVudGFNSCIgOi¡AINDUSOCIKICB9LAogICJyZWNiIcHRvcilgOiB7CiAgICAibngjIA6ICI
yOTkwOTEWIiwKICAgICJub2licmUilDoglk9QVEIDQVMgREUgRUwgUOFMVKFETLIsIFMuQS4gREU
gQy5WLIIsCIAgICAIY29kQWNO0aXZpZ GFkIIAGICION]Q5NSIsCIAgICAIZGVzYOFdGl2aWRhZCIgOiAi
VMVudGEgYWwgcG9y1G1heW9yIGRIGFydMOtY 3Vsb3MgZGUgw7NwdGlYSISCiAgICAiZGlyZWNj
aWOuliA6IHsKICAgICAgIMRIcGFydGFtZW50bylgOiAIMDUILAoglCAgICAIbXVuaWNpcGIvIIAGICIwN
iIsCiAgICAgICIjb21wbGVtZW50bylgOiAIMTEgQ2FsbGUgUGOuaWVudGUsICMgMzkOOSwgQ29sb
25pYSBFc2NhbMOzbiwgQOMsIEFBIgoglCAgfSWKICAGICIOZWxIZmOubylgOiAIKDUwMykgNzcxM
SOzNjk1iwKICAgICJjb3JyZW8ilDogliEyNDVAb3BOaWNhc2RIdmx5bi5jb20iLAogICAgIm5vbWIy ZU
NvbWVyY2lhbCIgOiAIREVWTFIOliwKICAgICJuaXQilDogljA2ZMTQwODAyMjExMDMwlgoglHOsCiAg
IMN1ZXJIwbORVY3VtZW50bylgOiBbIHsKICAgICIJudW1JdGVtiA6IDEsCIAgICAIdGIwbOl0ZWO0ilDog
MiwKICAgICJIjYW50aWRhZClgOiAxLjAsCiAglICAIY29kaWdvliAGICIPZGOVIIWKICAGICI1bmINZWRp
ZGEIlDOogO TksCiAgICAiZGVZY3JpcGNpb24:ilDoglltPZG9vXSBPZGO9vIENvbnN1bHRhbmNSIliwKICA
glCIwemVvjaW9VbmkilDogMjUwMDAuUMCwWKICAgICJER250b0RIC2N1NASIDAUMCWKICAgICIJb2R
UcmlidXRvI¡A6IG51bGwsCiAgICAidmVudGFOb1N1ailg O¡AwLAogICAgInZlbnRhRXhlbnRhIiAGIDAsC
¡AgICAidmVudGFHemF2YWRhIiA6IDITMDAwLjAsCiAgICAidHJpYnVOb3MilDogWyAiMjAilFOSCIAgIC
AicHN2A6IDAUMCWwKICAgICJubOdyYXZhZG8ilDogMAogIHOsIHsKICAgICJudW1JAGVENA6IDISCIA
gICAidGlwb0l07WO0ilDogMSwKICAgICJiYW50aWRhZCIgO¡AxLjAsCiAgICAiY29kaWdvliA61G51bGw
SCIAgICAidW5p TWVkaWRhl¡A6IDkK5LAogICAgImRic2NyaXBjaWSuliA6ICIMYXBObSAILAogICAginBy
ZWNpb1VuaSIgOiAxMjQ1LjAsCiAgICAibWSudG9EZXNjdSIgO¡AwLjAsCiAgICAiY29kVHJpYnVObylg
OiBudWxsLAogICAgInZIbnRhTm9TAWoilDogMCwkKICAgICI2ZW50YUV4Z W50YSIgOi¡AwLAOogICA
gInZlbnRhR3IhdMFRYSIgO¡AxMjQ1LjAsCiAg ICAidHIpYnVOb3MilDogWyAiMjAilFOsCiAgICAiCHN2 Ii
AGIDAUMCwWKICAgICJubOdyYX7hZG8ilDogMAog|HOgXSwkKICAicmVzdW1IbilgOiB7CiAgICAidG90
YWxOb1N1ailgO¡AwLAogICAgInRvdGFsRXhlbnRhI¡ASIDASsCiAgICAidG9OYWxHcmF2YWRhIiA61DI2
MjQ1LjAsCiAgICAic3ViVG9OYWxWZW50YXMilDogMjYyNDUUMCwKICAgICJKZXNjdUS5vU3SValiA61D
AsCiAgICAiZGVzY 3VFeGVudGEilDogMCwkKICAgICJKZXNjdaUdyYXZhZGEilDogMCwKICAgICJwb3Jj
ZW50YWpIRGVZY3VIbnRvI¡A6GIDAsCiAgICAidG9OYWxEZXNjdSIgO¡AwLjAsCiAgICAidHJpYn VOb3MiI
DogWyB7CiAgICAgICJjb2RpZ28ilDogljiwliwKICAgICAgImRic2NyaXBjaW9SuliA6ICJJVKEILAOgICAg|
CAidmFsb3lilDogMzQxMS44NQoglCAgfSBALAoglICAgINN1YIRvdGFsliAGIDIZMjQLLASCIAgICAiaXZ
hUGVyYY2kxliA6IDAsCIAgICAiaXZhUmVOZTEiIIDogMCwKICAgICJyZXRIUMVudGEiIDogMCwKICAgI
CJtb250b1RvdGFsT3BlcmFjaWouliA6IDISNjU2Ljg1LAogICAgINRvdGFsTmMIOHecmF2YWRVIIAGIDASCI
AglCAidG9OYWxQYWdhcilgOiAyOTY1Ni44NSwKICAgICJOb3RhbExldHJhcylgO¡AiVKVITIRITIVEVK
US TUIMIFNFSVNDSUVOVESTIENJTKNVRUSUQSBZIFNFSVMOQO9OIDgiLZEwMCISsCiAgICAic2FsZ
GIGYXZvcilgO¡AwLAogICAgImNvbmRpY2lvbk9wZXJhY2lvbilgO¡AxLAogICAgInBhZ29zliA6IG51bG
32

<!-- PAGE 33 / 112 (OCR) -->

wsCiAgICAibnVtUGFnbOVsZWNOcmSuaWnyvIiA6IG51bGwkKICB9LAoglCdleHRIbnNpb24ilDogewo
gICAgIm5vbWIJFbnRyZWdhl¡A6GICIGRURFUKIDTyBFUKSFUTRPIEFMRKFSTyIsCiAgICAiZG9jdUVudH
J1Z2EilDogljAzZODM4NZA3LTAiLAogICAgIm5vbWJSZWNpYmUilDogIk1BUKIPIEFMQRVSVE8gSEVST
kFOREValiwKICAgICJKb2N1UmViaWILIASICIwWMDQ1NDYONyOxliwKICAgICIWbGFjYVZlaGljdWxvili
A6ICIQNTYONzglliwKICAgICIvYnNIcnZhY2lvbmVzIiA6ICIJOQURBIFBPUIBFTCBNTO1FTIRPMIIKIC
BOLAogICIRCeGVuZGljZSIgOiBudWxsCn0.DWNzivG_t4Y HBIpVCcrBEnplrzaSPfteDazimzzGQGo8JKn
ZfXJ7rsNn-
ilaMklHoKghttr32UmYvIZNH]jA1zrsr38hQGtD33DLB68YWZIIG8uV1y5DLIR8DSYsktQsAyvHwlIn13Xaf
Z1YVkeu9VmJIzbpdcdXOot9g4WjStm7sULHQNEdERwWeXnDcGigK3tTOFCUrte6JRRIMFINOXIzS7Slv
ScqsuzMkRiRv8abwil 0T712IRvOD5LtBAXOoEx--VaY8cGk52qUeCKzjhS8Hhad8Hrg_oEQ-
EHASpRxeZLTrwkPutbVsYCXHGYZmenLAKO4VI13bHDUCRAOIbIB5A”.
Los códigos generados en el proceso de obtención de claves para la transmisión de documentos
serán de criptografía asimétrica:

: Llave privada: Es la que permite cifrar la informacion del documento, es decir, convertir los
datos de un formato legible a un codificado. Su uso es privado y exclusivo del titular del
certificado.

Llave pública: Es la que permite descifrar la información. Puede compartirse con los sujetos
que requieran utilizar la información cifrada.
Certificado: Contiene el certificado de firma emitido por la Administración Tributaria.
3. TRANSMISIÓN
La forma y condiciones para la Transmisión de los Documentos Tributarios Electrónicos se
| establecen a continuacion.
3.1 Ambientes de Transmision
La Administración Tributaria dispone de los siguientes ambientes para la transmisión de los
Documentos Tributarios Electrónicos:
. Ambiente para Pruebas: En este ambiente el sujeto pasivo deberá realizar las pruebas
necesarias para cerciorarse de la correcta transmisión de los Documentos Tributarios Electrónicos.
. Ambiente Productivo: Una vez finalizadas las pruebas necesarias, en este ambiente el sujeto
pasivo efectuará la transmisión de sus Documentos Tributarios Electrónicos por las operaciones
| que realice.

| 3.2. Servicio de Transmisión para Eventos de Invalidación y Contingencia

|

Los servicios de transmisión para Eventos de Invalidación y Contingencia se encuentran descritos

en el "Manual Técnico para la Integración Tecnológica del Sistema de Transmisión”.

3.3. Autenticación

| Para el uso de cada uno de los servicios del “Sistema de Transmisión DTE" se requiere de una

| autenticación previa del sujeto pasivo. El "Manual Técnico para la Integración Tecnológica del

33

<!-- PAGE 34 / 112 (OCR) -->

Sistema de Transmisión” contiene los detalles tecnológicos para el servicio de autenticación en
dicho sistema.
3.4. Recepcion de los DTE
La recepción de los DTE puede ser Uno a uno o en Lote. El "Manual Técnico para la Integración
Tecnológica del Sistema de Transmisión” contiene los detalles tecnológicos para el servicio de
recepción de los DTE.
3.5. Sello de Recepción
Consiste en un código otorgado por la Administración Tributaria que acredita el carácter de
Documento Tributario Electrónico, conforme a lo dispuesto en el artículo 119-D inciso segundo del
Código Tributario.
Dicho Sello se otorga a los documentos que han cumplido con las reglas establecidas en el punto
10. "Reglas para el otorgamiento del Sello de Recepción” de esta Normativa, es decir, con los
requisitos y condiciones establecidas para la correcta generación, firma, transmisión y recepción
de los mismos. En ese sentido, a partir de dicho otorgamiento los citados documentos podrán ser
admisibles para amparar las deducciones fiscales.
Tiene como base un UUID Versión 4 y se le agregan caracteres alfanuméricos. Para su generación,
no se utiliza información sensible del documento transmitido.
Ejemplo: 202179926FBFE844465396CA5B8913008732KCVY.
4. ENTREGA
Los DTE deberán entregarse a sus receptores en forma totalmente electrónica, con la misma
información, estructura de datos y formato electrónico con que fueron generados, firmados y
transmitidos a la Administración Tributaria. Debiendo contener el texto plano del documento
generado conforme a la Estructura de Datos, el DTE firmado y el Sello de Recepción otorgado por
la Administración Tributaria; dicho Archivo deberá nombrarse con el Código de Generación que le
corresponda.
El archivo DTE es único en su formalidad y contenido, pudiendo ser reproducido con la misma
integridad de datos y en tal sentido, tales reproducciones tendrán la misma originalidad que el
inicialmente emitido, por lo tanto, podrán amparar las deducciones tributarias correspondientes
siempre y cuando hayan obtenido el Sello de Recepción antes mencionado.
El medio de entrega deberá ser propicio para efectuarla, a través de los mecanismos de intercambio
de datos determinados entre las partes.
Asimismo, los sujetos pasivos deberán entregar una versión interpretada y legible de dichos DTE,
que cumpla con los requisitos dispuestos por la Administración Tributaria y que contenga un código
QR (Quick Response) que enlace a la consulta de los DTE de la Administración Tributaria.

34

<!-- PAGE 35 / 112 (OCR) -->

|
5. MÓDULOS
La plataforma tecnológica del sistema del sujeto pasivo emisor deberá poseer los siguientes
módulos:
1) Generación: En este módulo se recopilará toda la información de la transacción
ejecutada para ser procesada y consolidada como documento electrónico.
2) Firmado: Será el responsable de realizar el sellado/firmado de los documentos
electrónicos de conformidad a la Ley de Firma Electrónica.
3) Transmisión: Comprende el medio que se encargará de transmitir el documento
electrónico hacia los servicios de la plataforma de recepción de la Administración Tributaria
expuestos para dicha finalidad.
El diseño dela arquitectura que soporte el funcionamiento del sistema deberá, según sea necesario
de acuerdo al volumen de transacciones, contar con:
a) Plataforma de alta disponibilidad para garantizar la rapidez de los servicios de la misma
de forma óptima.
b) Plataforma con un plan de recuperación ante desastres.
c) Utilización de balanceadores de carga.
e) Infraestructura auto escalable, para ajustar la utilización de recursos según el consumo
de los servicios asociados a la plataforma.
6. SEGURIDAD
Cada sujeto pasivo establecerá su politica de seguridad interna y es responsabilidad del mismo
cerciorarse de que se cumplan para la correcta operatividad y transmisión de los documentos
electrónicos.
Asimismo, el sistema de emisión de DTE debe contar con las debidas condiciones de seguridad y
gestión de la plataforma, según sea necesario de acuerdo a sus políticas de seguridad y como
requerimientos mínimos, deberá contar con:
a) Protección contra ataques externos.
b) Control de acceso no autorizado por terceros a los servicios/datos/software/hardware.
C) Registro y reporte detallado de accesos de usuarios y administradores por dirección IP origen.
e) Administración de registro o historial de procesos (logs), establecidos como condiciones
generales y de requerimientos técnicos mínimos para el control.
Dentro de los lineamientos de seguridad asociados al documento, es importante mencionar dos
aspectos claves, la firma electrónica del documento y el número de trazabilidad del mismo, este
número de trazabilidad, que será el Código de Generación, permitirá identificar y asociar el detalle
35

<!-- PAGE 36 / 112 (OCR) -->

del documento en todo el ecosistema de documentos tributarios electrónicos tanto en los sistemas
del sujeto pasivo como de la Administración Tributaria.

A nivel de seguridad de documento, los lineamientos técnicos para Documentos Tributarios
Electrónicos de la Administración Tributaria, abarcan la utilización de los siguientes criterios:

e  JWS para firma de documentos JSON, que permitirá garantizar que dicho documento ha
permanecido inalterable desde su fuente al origen. Este firmado es adicional del
documento, se agrega junto con firma electrónica simple, bajo el estándar para transmisión
y seguridad de documentos JSON, que es JWS.

e El estándar para el archivo JSON será ECMA-404, que es un lineamiento reconocido para
manejo de información para el intercambio de datos bajo esta modalidad de archivo.

e UUIDv4 para trazabilidad de documentos.

7. FLUJO DE PROCESO DTE
DO e
E O
Si
ye No Código de
O = =O
4
| si
Evento de Error / Sello de
Invalidación |*-——-] Rescisión [+-—— Recepción
CT .
Base de Fin
datos
36

<!-- PAGE 37 / 112 (OCR) -->

|
ANEXO II
ESTRUCTURA DE DATOS DTE
| a 2 5° © lo) 5 7
c ro 0] = ho) O
| 8|ls| @ |o So 590 Er 3 86 5 co
E o > o vo =o a 0 2 E 5 0 =
e D o E aE 8c E CRS 3 20 f= ES
O) wn o Oo £ © = 0 © 5 © Co ‘© qa
2 o E Du o ogo 20 o Ox o oo
z > © 5 2 Pr o a — 2 a 032
O) > Nn o O) = 1 a
Sección 1: IDENTIFICACIÓN
Se deberá ingresar el número de la versión
del archivo JSON que se está trabajando,
la cual debe asegurarse que sea la última
versión vigente (sin punto, decimales ni
cero a la izquierda).
dent! Se deberá ingresar valor 3 para los Requerido Lengua
1 1 A Versión siguientes DTE: CCFE, NCE, NDE, NRE. para su Numérico dra TC | TODOS
n.versi tansmisión Mínimo: 1,
on Se deberá ingresar valor 2 para el siguiente Méximo: 2
DTE: FEXE V2.
Se deberá ingresar valor 1 para los
siguientes DTE: FE, CRE, DCLE, CLE, FSEE,
FEXE, CDE.
identif Deberá Ingresar el ambiente de trabajo por reqlistido Longue:
2 1 icacio le Ambiente |el cual se está transmitiendo el a ol ARIAS Mínimo: | TC | TODOS
| n.amb de destino | documento electrónico de acuerdo al me > -
| iente catálogo CAT-001 Ambiente de Destino. Máximo: 2
| identif Se deberá ingresar el código que 1 Longitud:
| 3 1 icacio A Tipo de corresponda al tipo del documento Reni Alfanumérico Minimo: F TODOS
| n.tipo Documento | electrónico a emitir, de acuerdo a E S 2 -
| Dte catálogo (CAT-002 Tipo de Documento). añ
| Maximo: 2
| Debe cumplir con la estructura definida
| por la Administración Tributaria con una
identif longitud de 31 caracteres (las siglas DTE +
| icacio código de tipo de documento + 8 dígitos
| ATA Número de alfanuméricos para describir código del Requerido Lora:
| 4 1 y A establecimiento y código de punto de para su Alfanumérico hue: F TODOS
| mero Control : ih ks 31
venta + un secuencial de 15 dígitos). | transmisión
| Contr
| ol Este número de control debe reiniciarse el
| 01 de enero; no debe repetirse en un año
calendario.
Debe cumplir con el estándar del UUID v4,
el cual debe ser único por documento (no
debe repetirse), longitud de 32 dígitos
, , separados por 4 guiones, haciendo un PU
nant total de 36 posiciones dividido en 5 bon
o 2d: grupos. Requerido E
5 | 1 [DEO a | Codunde parasu | Alfanumérico | Mínimo: | F | Topos
goGe Generación " ” j A 36,
i El Código de Generación consiste en un | transmisión ay
neraci , , a MD ; Máximo:
número identificador único, aleatorio y
on , 36
universal.
| Nota: Código de generación deberá
incluir solamente letras mayúsculas.
Debe mostrar el código asignado al
modelo de facturación que utilizará según
identif catálogo. Ver catálogo: CAT-003 Modelo
icacio de Facturación. Requerido mute
1 | ntipo | A So de para su Numérico Longa: TC | TODOS
acturacion . . PU NE. 1
Model Se ingresará el código 1 para modelo de | transmisión
o) facturación previo en todos los DTE.
Se permite el modelo de facturación
37

<!-- PAGE 38 / 112 (OCR) -->

z 2° = 0 Io] o 5
o [a Qa [0] oO Ko) + he] o £
o 0 2 oO So 5 oo co a ES o e Is o
E 2 > y vo 50 2 0 a D E] S 0 =
8S 7] o) [a aE ac & © E © 29 = En
n e he ES = 0 ® 5 ® co 5 >
o . £€ To roo E co 2 Sa [7] og
Z | =z Ss v z 00 o o 2 a o
O > as O) = [1] a
diferido (código 2) únicamente en
contingencia para los siguientes
documentos: FE, CCFE, NRE, NCE, NDE,
FEXE, FSEE.
Debe contener el código de acuerdo al
catálogo CAT-004 Tipo de Transmisión.
identif Se ingresará el tipo de transmisión normal
icacio , código 1 en todos los DTE. Requerido dk we
7 1 | ntipo| A T Tigo de para su Numérico Lengua: TC | TODOS
ransmisión . , E NE 1
Opera Se permite el tipo de transmisión por | transmisión
cion contingencia (código 2) únicamente en
contingencia para los siguientes
documentos: FE, CCFE, NRE, NCE, NDE,
FEXE, FSEE.
Deberá completarse este campo
únicamente si se elige el tipo de
transmisión "02-transmision por
identif Contingencia ; de lo contrario, cuando se Requerido por FE, CCFE,
lexcio utilice tipo de transmisión normal deberá tipo de NCE
i Tipo de enviar este campo con valor null. operación MU '
n.tipo , , " i Sol Longitud: NDE,
1 | C | Contingenci (únicamente si | Numériconull TC
Conti i ; , ; 1 NRE, CRE,
nash a Cuando se esté en contingencia, deberá tipo de FEXE
= contener código de acuerdo a catálogo: | trasmisión es FEE
CAT-005 Tipo de Contingencia. Contingencia)
Cuando el documento a generar sea
CRE deberá enviar este campo con null.
Campo de texto donde el contribuyente
pueda ampliar el motivo de la
Contingencia.
Requerido si en campo ‘Tipo de | Requerido por
Contingencia" se ingresa la opción 5-Otro. tipo de
; , dnde FE, CCFE,
identif operación Longitud: NCE
icacio Motivo de | Si el documento electrónico no se está | (Cuando tipo a 500 :
" j . , , Alfanumérico o NDE,
1 |n.mot | C | Contingenci | generando en Contingencia deberá enviar de null Mínimo:1 | TC NRE. CRE
ivoCo a este campo con null. Contingencia Máximo: FEXE !
ntin esté completo 500 y
; ; i , FSEE
Si en campo tipo de Contingencia se | con la opción
ingresa una opción diferente a 5, podrá 5)
enviar este campo con valor null.
Cuando el documento a generar sea
CRE deberá enviar este campo con null
, , La fecha de generación deberá tomarse
identif : : , ;
icacio Fecha de del sistema del contribuyente emisor en el Requerido Longitud:
10 1 A e momento de generar el documento, cuya para su Alfanumérico - F TODOS
n.fecE Generación a hal “e NE 10
“e estructura definida por la Administración | — transmisión
Tributaria es: YYYY-MM-DD.
La hora de generación deberá tomarse del
identif sistema del contribuyente emisor en el Requerido
rel 1 |icacio | A Hora de momento de generar el documento, cuya para su mn, Longitud: F TODOS
n.hor Generación | estructura definida por la Administración transmisión 8
Emi Tributaria es: HH:MM:SS (Formato de 24
horas)
38

<!-- PAGE 39 / 112 (OCR) -->

z | 2 3 O ú o 5 0
[= re [0] + 0 o
819] alc| BE ETE DE 2 50 || ES
o . = ‘5 (O) E) cL o ox [1] 09
| Z| =z 5 y) 2 50 o) E — 2 a 03
| O) 9 23 0 = 2 arc
| identif
icacio . Requerido hud-
| 12 1 | ntipo | C hi de Debe ser USD. para su Alfanumérico Longitud: TC | TODOS
Mone onda transmision
da
| Esta Sección deberá llenarse si existiere
| Documento documento a relacionar, de lo contrario
| se completara con null. Cuando aplique, Requerido Arreglo de MU
| Ss , : on p : Longitud:
| 2 B/D Relaciona- podrá relacionarse un máximo de 50 | por tipo de objeto 50
| dos documentos, completando todos los | operación null
| campos de la Sección por cada
| documento relacionado.
| Deberá indicar el código del documento
Is relacionado según el catálogo: CAT-002
| Tipo de Documento.
| NC Permitirá la relación con documentos
docu | Ey emitidos de forma física y de forma | NCE y NDE=
| ment | ND electronica, desde 1 hasta 50 documentos Requerido
| oRela | E=A Tipo de relacionados, todos del mismo tipo, es para su
ciona | (cc | Documento decir que no podrán relacionarse | transmisión Longitud: FE, CCFE,
13 2 : - : diferentes tipos de documentos en un | (CCFE, NRE y | Alfanumérico - F NRE,
do.tip | FE, Tributario mismo DTE FE= 2 NCE. NDE
oDoc | NR | Relacionado - Requerido por ’
Hen E Por ejemplo, en la factura electrónica, no tipo de
-B) podrán relacionarse notas de remisión y | operación)
documentos contables de liquidación
combinados.
Cuando no exista documento relacionado
este campo deberá enviarse con null.
docu Deberá ingresar código del tipo Ne y OE
ment Tipo de generación del documento de acuerdo al a ..
oRela Generación | catálogo CAT-007 tipo de generación del Eme FE CCFE
ciona del documento. - Longitud: E ’
14 2 ; Cc Numérico TC NRE,
do.tip Documento (CCFE, NRE y 1 NCE. NDE
oGen Tributario | Cuando no exista documento FE=Requerido '
eracio relacionado | relacionado, este campo deberá enviarse A
n con valor null. Dor no de
operación)
Deberá ingresar el numero del
documento que se está relacionando.
ce
docu FE, Si el documento relacionado ha sido | NCE y NDE=
ment NR emitido de forma electrónica, se ingresará Requerido
COREL Ey el código de “generación de dicho para su Longitud
dona Fe Número de documento relacionado. transmisión. 36 FE, CCFE,
15 2 don documento Si el documento relacionado ha sido | (CCFE, NRE y Alfanumérico Minimo 1 r MESE
Docu (NC emitido de forma tradicional (Fisico-papel) FE= 36 .
ment E y deberá indicar el número de correlativo | Requerido por
2 ND autorizado del documento (serie + tipo de
E= número). operación)
A)
Cuando no exista documento relacionado
este campo deberá enviarse con null.
39

<!-- PAGE 40 / 112 (OCR) -->

z 2 0 Lo) lo] S La
al5slo |= 9 o o e ° 25
E18] 28] ea 598 ES © 29 | 8] 58
Sie 9 |< SE OTE CE 5 Do = ES

[92] Re) En = ve De v [8] =
s o = 7 o oo 20 o O ow
o > no O Lu a Q
CC
FE, NCE y NDE=
NR Deberá indicar la fecha en que fue y Nis
docu , Requerido
E y generado el documento que se esté
ment Fecha de , ; ; para su
FE= » relacionando, independientemente haya in
oRela B Generacion id do el L i transmision Loraitud: FE, CCFE,
16 2 | elena del sido generado de manera electrónica o Alientimérico ongitud: F NRE
física, en formato — YYYY-MM-DD. 10 ;
do.fec (NC Documento (CCFE, NRE y NCE, NDE
haEmi Relacionado í ; FE=Requerido
N E y Cuando no exista documento relacionado .
sion . : por tipo de
ND este campo deberá enviarse con valor null. A
E=A operación)
)
Sección 3: EMISOR
Esta Sección contiene la información del
emisor del DTE. Para el caso del CRE el
emisor es el Agente de Retención; para Requerido Longitud:
3 A Emisor el CLE, es el Comisionista; para el DCLE, para su Objeto grua
es el Agente Perceptor; para la FEXE, es | transmisión
el Exportador; para el CDE, es el
Donatario.
FE, CCFE,
Longitud: NRE.
, NCE,
emiso Deberá contener el Número de NIT del Requerido 14 NDE
17 3 . A | NIT (Emisor) ; i ; para su Alfanumérico | Minimo: 9 | F :
r.nit emisor sin guiones. NET A CRE, CLE,
transmisión Máximo:
14 DCLE,
FEXE Y
FSEE
, Tipo de
emiso
r.tipo documento MU Requerido
18 3 Docu i de Para efecto , de CD Unicamente se para su Alfanumérico 2 TC CDE
identifica- | ingresará el código 36-NIT. NE.
ment oy transmision
. ción
(Donatario)
, Número de
emiso
documento ,
r.num de Deberá ingresar numero identificación Requerido Longitud
19 3 | Docu | A Na : ' , para su Alfanumérico F CDE
Identifica- | tributaria del donatario. A 9014
ment ba transmisión
i ción
(Donatario)
Requerido
para su
transmisión
A (CRE=
Deberá contener el número de NRC del | Requerido por
emisor sin guion. tipo de Longitud
20 | 3 | miso NAC operación) | Alfanumérico 8 F | TODOS
r.nrc yy (Emisor) Nota: Cuando el NRC no posea ceros a la Minimo 2
E- izquierda no deberá rellenar con ceros (CRE= máximo 8
B) para cumplir con la longitud. Requerido por
tipo de
operación)
(FSEE y CDE=
Opcional)
40

<!-- PAGE 41 / 112 (OCR) -->

|
|
|
|
Z 2 - 0 Ko o c y
c a [0] + he) oC
ajo a D Se 5 e Er 3 85 o co
E 3 ~ Q vo OS 0 a e E S 0 =
| 172) Q 0 Emo 0 Do o 5 o 5) a
Ss | E 7 8° To c © a 1 a 3 8 3
“| og = 38 O a Zu | 9
Nombre,
denominaci Longitud:
emiso on o razón | Deberá contener el nombre, Requerido 250
21 3 |r.nom| A social del | denominación o razón social del para su Alfanumérico | Mínimo: 1 F TODOS
bre contribu- | contribuyente emisor. transmisión Máximo:
yente 250
(Emisor)
Deberá ingresar código que corresponda Lonaitud:
emiso Código de [a cualquiera de las 3 actividades Requerido E -
r.cod Actividad | económicas registradas en el Registro q st fideo
22 3 ai C AND Ea , para su Alfanumérico | Mínimo: 5 | TC | TODOS
Activi Económica | Único de Contribuyentes (RUC). (ver transmisión Máximo:
| dad (Emisor) catálogo: CAT-019 Actividades 6 -
Económicas)
| Deberá ingresar nombre que corresponda MU
N J od Longitud:
emiso "un a cualquiera de las 3 actividades ; A
| Actividad a , ; Requerido 150Minim
23 3 r.desc A a económicas registradas en el Registro Alf se , F TODOS
oy , . para su anumérico o:
Activi TEmison Único de Contribuyentes (RUC). (ver transmisión 5Máximo:
| dad catálogo CAT-019 Actividades 150
| Económicas)
| FE, CCFE,
emiso Podrá incorporar el nombre comercial del Longitud:
| Nombre y : NDE,
| r.nom Comercial contribuyente emisor. 150 NRE. CRE
24 3 |breCo| C Opcional Alfanumérico | Mínimo: 1 | TC : ’
CLE
merci , Cuando no aplique deberá llenar el campo Máximo:
(Emisor) DCLE,
al con null. 150 FEXE y
CDE
FE.CCFE,
emiso NCE,
tino Tipo de Deberá incorporar “el tipo de RElendo NDE,
up establecimi- | establecimiento en el que se genera el q vi Longitud: NRE, CRE,
25 3 | Establ | A para su Alfanumérico E
aci ento documento electrónico, según catálogo AFONEISIÓN 2 CLE,
(Emisor) CAT-009 Tipo de Establecimiento. DCLE,
eno FEXE y
CDE
emiso Deberá indicar el código de
r.direc Dirección | Departamento en el cual se encuentra Requerido
26 3 cion.d A Departa- ubicada la casa matriz, sucursal, agencia, para su Alfanumérico Longitud: E TODOS
eparta mento bodega, patio, predio, otro, donde se ha transmisión 2
ment (Emisor) realizado la operación (ver catálogo: CAT-
[o] 012 Departamento).
emiso Deberá indicar el código del Municipio
r.direc Dirección | donde se encuentra ubicada la casa Requerido Lonalue:
27 3 cion. A Municipio | matriz, sucursal, agencia, bodega, patio, para su Alfanumérico grua F TODOS
; 2
muni (Emisor) predio, donde se ha realizado la operación | — transmisión
cipio (ver catálogo: CAT-013 Municipio).
emiso Longitud:
r.direc Dirección | Deberá detallar el complemento de la Requerido a -
28 3 |cion.c| A, comple- dirección de la casa matriz, sucursal, para su Alfmumérico | Minimo: 1) F TODOS
ompl mento agencia, bodega, patio, predio, otro donde WATSON Maximo:
emen (Emisor) se ha realizado la operacion. 200
to
| -
| ; Deberá incorporar el número de teléfono ; Long
| emo Teléfono | del emisor, se podrán ingresar hasta un Requena 30
| 29 3 rtelef | A N e ’ p i 9 et para su Alfanumérico | Minimo 8 | TC TODOS
(Emisor) maximo de 3 números telefónicos NE PD
| ono transmisión Máximo
| separados por comas. 20
|
| 41
|
|

<!-- PAGE 42 / 112 (OCR) -->

z Le _— 2 v ra lo) = 7)
sls ISI Eo ir Er 358 | §| £8
E Le) Le a] vo a 0 o © 2% a 05
S18] 9 |< SE OTE OE o 20 |E| Es

5 2 | 2 ES 525 E. o o 9 do
o o o 5 E e o Sa J} oy
pa z a 71) z uo o = >= o 25
O) > as O) = 1 o
emiso Correo "e found Requerido Longitud
30 3 rcorr | A electrónico Debera incorpora al Correo clectrónico para su Alfanumérico | máxima: | TC | TODOS
, el emisor, con dominio vigente. et
eo (Emisor) transmisión 100
" i ; FE, CCFE
A Podrá ingresar el código de Casa matriz / ; , 4
emiso Cc aa Sucursal / Agencia / Bodega /Predio / Otro sn Ng, SBE
r.cod : que la Administracion Tributaria le asigne. , Alfanumérico A
31 3 Establ Cc miento Opcional / null Máximo: | TC DCLE,
eMH Br Nota: Por el momento, durante la 4 Minimo: Fu
p transicion debera enviarlo con null. y
CDE
Código del A as . FE, CCFE
| Podrá de incorporar el código casa matriz/ 7 ; :
emiso estableci Sucursal / Agencia / Bodega /Predio /Otro Longiug NRE, CRE,
r.cod miento ue el contribuyente posea internamente Alfanumérico 4 CLE,
32 | 3 [Eb | € | asignado |9 yente p | Opcional E Máximo: | TC | DCLE,
por el ali Y A 4 Mínimo: FEXE,
e contribu- Cuando no posea código interno deberá 4 FSEE
enviarlo con null. y
yente CDE
Podrá incorporar el código asignado por la
Códido del Administración Tributaria para el punto de FE, CCFE,
emiso — de venta donde se genera el documento NRE, CRE,
r.cod Venta electrónico. Este código será informado Allenumerico | Lonaitua: CIE,
33 3 | Punto | C Eris) cuando la Administración Tributaria lo Opcional Frill 9 "| TC DELE,
Venta Asignado asigne. FEXE,
MH oh MH FRE
Nota: Por el momento, deberá enviar con CDE
null.
Código del | Podrá incorporar el código del punto de FE CCFE
Punto de [venta donde se genera el documento Lord NRE CRE
emiso Venta: electrónico que el emisor lleva u CLE '
34 3 r.cod le (Emisor) internamente. Opcional Alfanumérico/ Minimo: 1 | TC DCLE,
Punto asignado null Máximo: FEXE
Venta por el Cuando el emisor no posea código de wl - FSEE |
contribu- | punto de venta este campo se completará nid
yente con null.
Deberá seleccionar qué tipo de item está
emiso exportando (ver catálogo CAT-011 Tipo de Requerido
35 | z (069! o | pode ¡rem para su Numérico | LONI | tc | EXE
temEx item tr isió 1
por Nota: Este campo solo permitirá opciones ansmision
1293.
Cuando en campo "Tipo de item" se
N ingresen las opciones 1 o 3, deberá indicar
omiso ; el recinto fiscal de la operación (ver | Requerido por
36 | 3 | eon Recinto catálogo CAT-027 Recinto fiscal). tipo de Aanumérico/ Liu: TC | FEXE
al operación
Este campo será null cuando en campo
"Tipo de ítem” se ingrese la opción 2.
Cuando en campo ‘Tipo de ítem” se
ingresen las opciones 1 o 3 deberá
emiso PU ingresar el régimen de exportación a que | Requerido por A del ir
37 3 r.regi Reqrenos se somete la mercadería, utilizando el tipo de Afanumésico/ ngs TC FEXE
men Pp catálogo "CAT 028- Régimen” operación
Este campo será null cuando en campo
"Tipo de ítem” se ingrese la opción 2.
42

<!-- PAGE 43 / 112 (OCR) -->

[
|
z 2° 5 E © o 5 ©
o) = le) Q v Ke) Ko) + c 0 os
ELBIZIE|I 28 538 58 S 29 | 3] 58
3 ° 9 = DE ac E CE 3 50 E ES
re | © E | 2 ES 528 20 e) OL y Do
zlz| 5/51 ¢ x 6 8 9& | 8| 8%
oO 2 a (O) O) = rf} A
Sección 4: RECEPTOR
Contiene la información del receptor del
DTE.
Para el caso del CRE, el receptor es el , , Longitud:
4 A Receptor Sujeto de Retención; para el CLE, es el Requerido Onjete 1
Mandante; para el DCLE, es el Afiliado;
para el FSEE, es el Sujeto Excluido; para
el CDE, es el Donante.
Deberá seleccionar codificación de Requerido
acuerdo a catálogo de tipo de documento q
, : omni . para su
recep | A Tipo de de identificación (Receptor). Ver Catálogo transmisión
tor.tip documento | CAT-022 Tipo de documento del Lona | 7/T
38 4 | oDoc | (FE | de identifi- | receptor. (FE= Alfanumérico Ea - le FE, NRE,
umen | XE cacion Re uerido or CRE,
to =C) | (Receptor) | Nota: Se ingresará la opción 13-DUI para el i" E np FEXE,
caso de las personas naturales no inscritas 6 _ FSEE y
en IVA. p CDE
Requerido
recep Numero de para su Longitud: FE, NRE,
tor.nu documento o , transmisión 30 CRE,
59 | a Impoc! A | dete | Seberá ingresar numero de documento (FE= Alfanumérico | Mínimo: 9 | FT | FEXE,
A de identificacion del Receptor. : Grn A. Cc
umen cacion Requerido por Maximo: FSEE y
to (Receptor) tipo de 30 CDE
operación)
Longitud: CCFE
, i Requerido 14 '
recep NIT Debera de contener el NIT del receptor sin Sr pe NCE,
40 4 A A : para su Alfanumérico | Mínimo: 9 | F
tor.nit (Receptor) | guiones. A A NDE, CLE
transmisión Máximo:
14 y DCLE
A Requerido
para su
Deberá de contener el número de NRC iransraisión FE, CCFE,
CR del receptor sin guion, según el Registro (NRE, CRE Longitud NCE,
recep Único de Contribuyentes. : y 8 NDE,
E y NRC DCLE= am
41 4 | tor.nr FE= | (Receptor Requerido por Alfanumérico F | NRE, CRE,
Cc 8) p Nota: Cuando el NRC no posea ceros a la e o ih Minimo 2 CLE,
izquierda no debera rellenar con ceros a _— máximo 8 DCLE, y
(CD para cumplir con la longitud. P CDE
E (FEy CDE=
=C) Opcional)
Nombre, Requetito
denomi- A Longitud:
recep nacióno | Deberá contener el nombre, 250
42 | 4 |torno| A | razón social | denominación o razón social del (FE= Alfanumérico | Mínimo:1 | F TODOS
mbre del contri- | contribuyente receptor. Máximo:
Requerido por
buyente ino 250
(Receptor) tipo e
operación)
43

<!-- PAGE 44 / 112 (OCR) -->

z 2 = 53 © o 5 Pa
E o > y vo 288 Sa © 2D 5 @ =
SIRIOS ES: Bee Be 2 50 |E] Es
Oa 2 o ES 28 5 © © co Is) 5 ©
o o E E 50 PO 20 o Sa La) [O
Zz =z © 2 z Hi o) [o] 2 > o o >
O) E nov O) E Ll a
Requerido
para su FE, CCFE
transmisión NCE ’
rete Coin de El contribuyente deberá incorporar el Longitud: NDE
P '9 código de la actividad económica | (CRE y CDE= 6 +
tor.co Actividad : : í i _ ! Ay dime NRE, CRE,
43 4 dActiv e EECNÓNca registrada (primaria, secundaria o terciaria) | Requerido por | Alfanumérico | Mínimo: 5 | TC CLE
idad Receptor de acuerdo a NRC. (ver catálogo: CAT-019 tipo de Maximo: DCLE
P Actividades Económicas) operación) 6 y
FSEE y
(FE y FSEE= CDE
opcional)
A
(FE Requerido
— y El contribuyente deberá incorporar la para su Longitud:
tor .. cD Actividad | actividad económica registrada (primaria, | transmisión(C 150Mínim
44 4 scActi E= | Económica | secundaria o terciaria) de acuerdo a NRC. | RE=Requeri- | Alfanumérico 0.5 F TODOS
vidad QC) (Receptor) | (ver Catálogo: CAT-019 Actividades | do por tipo de Máximo:
(FSE Económicas) operación) 150
E=B (FE=opcional)
)

CCFE,
recep Longitud: NRE,
tor.no Nombre Podrá incorporar nombre comercial del Opcional / 150 NCE,

45 4 mbre | C Comercial | contribuyente receptor, de lo contrario po Alfanumérico | Minimo: 1 | TC NDE,
Come (Receptor) | deberá enviarlo con valor null. Máximo: CRE, CLE,
rcial 150 DCLE,

FEXE
mece Tipo de
an establecimi- | Campo requerido, únicamente aceptará Requerido LONGI:

46 4 PEC) A ento del codificación según catálogo CAT-009 para su Alfanumérico 2 1 TC DCL
mient afiliado Tipo de Establecimiento transmision
(Receptor)
o
A FE, CCFE,
recep ; NRE,
tor.dir | (FE | Dirección: | Deberá indicar el codigo del Requetan Longitud: NCE,
47 4 eccio | =C) | Departamen | Departamento donde se encuentra ED Altamiumético 2 F NDE,
n.dep to ubicada la dirección del receptor (ver Mínimo: 2 CRE, CLE,
artam | (CD | (Receptor) | catálogo: CAT-012 Departamento) (FE=opcional) Máximo: 2 DCLE,
ento | E=B on FSEE y
) CDE
A FE, CCFE,
recep $ —_ NRE,
tor.dir i .. | Deberá indicar el Municipio en el cual se Requends Lane: NCE,
; (FE | Dirección: A ; T para su 2
eccio ST encuentra ubicada la dirección del Do NDE,
48 4 =C) Municipio . . transmisión Alfanumérico F
n.mu receptor (ver catálogo: CAT-013 datan CRE, CLE,
us | (CD | (Receptor) su Mínimo: 2
nicipi Municipio). _ ; Elen DCLE,
E (FE= opcional) Máximo: 2
o -B) FSEE y
CDE
A
recep
tor.dir FE | Dirección: Requerido Longitud:
eco =C) comple- Deberá detallar el complemento de la mera su 200
49 4 n.co A e , transmisión Alfanumérico | Minimo: 1 F TODOS
mole mento dirección proporcionada por el receptor. Maximo:
P (CD | (Receptor) , -
ment E (FE= opcional) 200
o -B)
44

<!-- PAGE 45 / 112 (OCR) -->

|
|
|
| z | £2 D So © o 7
o] = re (3) © + 0 oO <
| a | © 2 oO Oo 5 > o) co 3 E Le 2 ps
E 0 5 q va 50 9 0 o Ú 2% [8] >=
| D o Cc oa £ 8c E © E Ko) ou = En
O) nN a 0 © = QO © Do So 8) 3
g o E D oc © oo 2o 9 Sa 5 DU
Zz | z © o z 00 o E = o E
Deberá detallar el código del país destino
de la exportación o de la nacionalidad del Longitud:
recep Código de | donante. (ver catálogo de codificación Requerido 4 FEXE
5+0| 4 |torco | C país CAT-020 País). para su Numérico Mínimo: 4 | TC y
dPais (receptor) transmisión Máximo:
País destino de Exportación para FEXE. 4
Nacionalidad del Donante para CDE.
Longitud:
recep País destino Requerido 50
51 4 tor.no A de la. Deberá ingresar el país destino de la para su Alfabético Co TC FEXE
mbre exportación | mercadería (ver catálogo CAT-020 País). Led Mínimo: 3
: transmisión AU
Pais (receptor) Máximo:
50
recep
tor.co - ‘1 i Requerido tud.
i 52 4 dDo lo Domicilio Deberá ingresar codificación de acuerdo a para su Alfanumérico Longitud: TC CDE
“ Fiscal catálogo CAT-032 Domicilio Fiscal NE. 4
micili transmision
ado
Podrá incorporar el código del
ad establecimiento asignado al contribuyente i
Código del Longitud
fasep estableci- receptor donde se genera el DTE. AMÍnimo:
5% 4 digoM c o Este código será informado Cuando la Opciona Alenimésico oy . TC DCLE
asignado has LA , i , Máximo:
H Administración Tributaria lo asigne, por el
por el MH . i 4
momento deberá enviar este campo con
null.
Podrá incorporar el código del punto de
tii venta asignado al contribuyente receptor
recep Codigo del donde se genera el DTE.
tor.pu Punto de Longitud:
54 4 | ntove| C Venta Este código será informado Cuando la Opcional Alfanumérico 4 TC DCLE
ntaM asignado ls LA , : ,
Administración Tributaria lo asigne, por el
H por el MH . N
momento deberá enviar este campo con
null.
recep ; Deberá ingresar el código en que son i
tor.bi Bienes entregados los bienes de acuerdo al Requerido e Longitud:
55 4 $ A | Remitidos a . , ; para su Alfanumérico F NRE
enTitu ; catálogo CAT-025 Título a que se remiten el 2
Titulo de ; transmision
lo los bienes.
recep 4 in ; !
tor tip Tipo de Deberá clasificar el tipo de receptor, entre Requerido Longitud:
56 4 , Cc persona jurídica o persona natural (ver para su Numérico TC FEXE
oPers Receptor . , TA 1
ona catálogo CAT-029 Tipo de receptor). transmision
Cc
Longitud
(FE Podrá incorporar el número de teléfono 30
reced | ye Teléfono | del receptor, se podrá ingresar hasta un
57 4 | tor.tel Lo de , - Opcional Alfanumérico es TC | TODOS
elo | Y (Receptor) | máximo de 3 números telefónicos mínimo 8
FSE separados por comas. máximo
E 30
=B)
A
= Requerido
recep | (FE Correo Deberá incorporar el correo electrónico mii Longitud
58 4 |tor.co | XE | electrónico | con dominio vigente del contribuyente (FE, CRE Alfanumérico máxima | TC TODOS
rreo as (Receptor) | receptor. FSEE y CDE= de 100
E opcional)
=B)
45

<!-- PAGE 46 / 112 (OCR) -->

z 3 - 0 [0] lo] n
c re] v + ho [o
812) 3 IU $e 533 58 5 EE
sil o lc SE OTE vE a 90 | 2 ES
ol a Ss Es £8 5 ® > so o 30
a o E = ou e 20 9 Sa Ú 09
Z|l2z| 8B | B > 00 S e = a | 8°
o) > Qu O = E Q
En estos campos se describen los
documentos asociados.
Se podrán describir desde 1 hasta 10
documentos asociados, excepto para la
FEXE, donde se podrán describir desde 1
hasta 20 documentos.
Cuando no se requieran, deberá enviar
esta sección con null.
Cuando aplique, si el campo
“Documento asociado” está completo
con las opciones 1 o 2, esta sección
deberá completarse desde el campo
"Documento asociado” hasta el campo | Requerido
“Descripción de documento asociado”. para su
Documento Transmisión= Arreglo de Longitud:
5 B/D € asociados Cuando aplique, si el campo CDE obleto / null 10(FEXE=
"Documento asociado" está completo | (Requerido J 20)
con la opción 3 “Médico”, deberá | por tipo de
completarse desde el campo "Nombre | operación)
de médico que presta el Servicio” hasta
el campo "Código del tipo de Servicio
realizado”.
En la FEXE, cuando el campo
"Documento asociado” esté completo
con la opción 4 “Transporte” deberá
completar desde el campo “Modo de
transporte” hasta el campo "Nombre y
apellido del conductor”.
En esta Sección para el CDE, será
obligatorio como mínimo ingresar los
datos de la resolución de sujeto excluido
del donatario.
BT Podrá describir si el documento asociado
Docu corresponde al emisor, al receptor, al
men médico o al transporte, según catálogo Requerido por FE CCFE
59 5 eses | © Documento | CAT-021 "Documentos asociados”. tipo d Alfanumérico | Longitud: TC FEXE '
- iado pos null 1 y
dDoc ao N operación CDE
Asoci Cuando no existan documentos
286 asociados deberá enviar este campo con
null
Debe describir el nombre del tipo de
documento asociado al que hace
referencia (por ejemplo: Resoluciones,
otros Licencias, Permisos, Contratos, Carta de
Docu Identificació | Venta. Otros).
ment del ReQUendo por Alfanumérico | Longitud: PE, CFE,
5 | os.de d nos Aplica cuando el campo "documento tipo de QuE: | FEXE y
ocumento E y . / null 100
SCDE ; asociado” esté descrito con la opción 1 o operación CDE
asociado
ocum 2.
ento
Para el CDE, será obligatorio como
mínimo ingresar los datos de la resolución
de sujeto excluido del donatario.
46

<!-- PAGE 47 / 112 (OCR) -->

|
|
|
|
| DA 2 — 2 Io] Lo) o = 7)
| [a ro v ° 0 oC
| 8 | vo 2 D So 5 Ya ko 3 TS o co
E O] Lo Lo) vo 28a 5 a © pt © 50
| Ss | o 0 c aE 8c E CE 5 DD = £2
| o a a 0 ES = 8 ® DE o se e) So
| o o E E os Oo FO a ao Q 8 5
| Zz | z Ss o z 00 o i= = a a
| o) > Ao O) ul
| Cuando no existan documentos
| asociados o cuando el campo
| "documento asociado" esté descrito con
| la opción 3 "médico" y 4 “transporte”, este
campo deberá enviarse con valor null.
| Deberá describir datos importantes del
| tipo de documento asociado (ejemplo: el
numero de resolucion, fechas, numero de
| contrato, otros).
| Aplica cuando el campo “documento
otros ; . A ; A
| Docu o asociado" esté descrito con la opción 1 o
| ment Descripción {2 Requerido por ro trar» FE, CCFE,
| de , Alfanumérico | Longitud:
| 61 5 | os.det d t tipo de 7 ul 300 TC FEXE y
| alleD ocumento | Deberá enviarse con null: operación nu CDE
| asociado
| ocum
| ento a) En caso no existan documentos
| asociados.
| b) Cuando el campo "Documento
| asociado" esté descrito con una opción
| diferente de 102.
| Este campo deberá completarse si en el
| campo "Documento asociado” se ha
| llenado con la opción 3 ‘médico’.
otros
| Docu Cuando aplique, deberá detallar el nombre
Nombre de el 4 el i í
ment it del médico que prestó el servicio. Requerido por E Longitud
| médico que " Alfanumérico Ma
62 5 |osme| C tipo de maxima | TC | FEy CCFE
| , presta el A , . / null A
dico.n Td Deberá enviarse con null: operación :100
Servicio ;
| ombr a) En caso no existan documentos
e asociados.
b) Cuando el campo "Documento
asociado" esté descrito con una opción
diferente a 3.
Este campo deberá completarse si el
campo "Documento asociado” se ha
llenado con la opción 3 "médico".
otros Cuando aplique, deberá detallar el NIT del Lora:
Docu NIT de médico que prestó el servicio. El NIT debe , gitud:
Po . : Requerido por 5 14
ment médico que | ingresarse sin guiones. ' Alfanumérico/ PE FE y
63 5 e tipo de Mínimo: | TC
os.me presta el e null mue" CCFE
| : oo , , , operación 9Máximo:
dico.n Servicio Deberá enviarse con null: 14
it a) En caso no existan documentos
asociados.
b) Cuando el campo "Documento
| asociado" esté descrito con una opción
diferente a 3.
|
|
47

<!-- PAGE 48 / 112 (OCR) -->

z a =i EM] © o c «
o) Cc Qa Q o D + O o £
a | © o D do 500 co 3 3% to £38
E O) > yv vo = De 0 QQ 2 0 =
s || lc SE BCE CE E 20 |E| ES
O34 - 0 ES 28m Do > so o =
o = (o) = 0 vo o) or DU
o E wn o) O = Cc ano v
Zz | = 4 (7) Zz 35 o Re a o 03
O > as O) | ad a a
Este campo deberá completarse si el
campo "Documento asociado” se ha
llenado con la opción 3 "medico".
otros Cuando aplique, deberá detallar el
Docu documento con el que se identifica al
Documento ae toni
ment | médico no domiciliado. y ;
e de Identifi- Requerido por NETS Longitud FE y
64 5 dico.d c cacion de Debera enviarse con null: eno. / null Hvis TC CCFE
oclde Eo a) En caso no existan documentos p -
Na domiciliado ,
nifica asociados.
cion b) Cuando el campo "Documento
asociado" este descrito con una opción
diferente a 3.
c) Si el médico que presta el servicio se
identifica con NIT.
Este campo deberá completarse si el
campo "Documento asociado” se ha
llenado con la opción 3 “medico”.
cos Cuando aplique, deberá detallar el Código
Ai según el catálogo CAT-010 “Código tipo .
A Código del | de servicio (Medico) Requerido por |. Afanumérico | Longitud:
65 5 |os.me| C Servicio - tipo de / null a | TC | FEy CCFE
dico.ti Realizado . , . operación
Ser Deberá enviarse con null:
pose a) En caso no existan documentos
asociados.
b) Cuando el campo "Documento
asociado" este descrito con una opción
diferente a 3.
Este campo deberd completarse si en el
campo "Documento asociado” se ha
elegido la opción 4-Transporte.
otros Deberá ingresar el tipo de transporte
Docu utilizado en la exportación según catálogo Reuerido sor
5 ment Modo de | CAT-030 "Modo de transporte”. au d P Numérico / Longitud: TC FEX
os.mo transporte tipo e null 11 E
doTra Deberá enviarse con null: eperación
nsp a) En caso no existan documentos
asociados.
b) Cuando el campo "Documento
asociado" esté descrito con una opción
diferente de 4.
Este campo deberá completarse si en el
campo "Documento asociado” se ha
elegido la opción 4-Transporte.
otros Deberá ingresar el número de Lonaitua:
Docu Número de | identificación del medio de transporte ; Jue
, e e CL Requerido por Lo 70
ment identifi- utilizado en la exportacion. , Alfanumérico PT
67 5 ostia esción del tipo de / null Mínima: 5 | TC FEXE
Pp , i . operacion Máxima:
calra transporte | Deberá enviarse con null: 70
ns a) En caso no existan documentos
asociados.
b) Cuando campo "Documento asociado”
esté descrito con una opción diferente de
4.
48

<!-- PAGE 49 / 112 (OCR) -->

|
|
21818 IB da 528 e 8 | 35 |g] 8
| E O) ue) Q Da Dos 0 o E o 5
| 8 D 9 [a o£ 8 CE VE o 50 = £2
n he) £3 C00 E 3 a) So
clo | £2] 59 BES es 2 SE | 8] ES
a 0 0) Zz vo o = _ 7 o
O > AO O) = Ki a
| Este campo deberd completarse si en el
campo "Documento asociado” se ha
elegido la opción 4-Transporte.
o Ne Se debera ingresar el numero de Longitud:
identificación del conductor + del ;
ment documento transporte Requerido por Atanimérico 100
5 |osnu| C de identifi- - tipo de Tru Mínima: 5 | TC FEXE
mCo cación del , ; , operación Máxima:
nduct Conductor Deberá enviarse con nuit: 100
oF a) En caso no existan documentos
asociados.
b) Cuando el campo "Documento
. asociado" esté descrito con una opción
diferente a 4.
Este campo deberá completarse si en el
campo "Documento asociado” se ha
elegido la opción 4- “Transporte”.
otros
Docu Se deberá escribir el nombre y apellidos Longitud:
ment Nombre y | del conductor del medio de transporte. Requerido por Alfenuimérico 100
5 |os.no | C | apellidos del tipo de / null Mínima: 5 | TC FEXE
mbre Conductor | Deberá enviarse con null: operación Máxima:
Cond a) En caso no existan documentos 200
uctor asociados.
b) Cuando el campo "Documento
asociado" esté descrito con una opción
diferente a 4.
Esta sección deberá completarse
cuando la venta es por cuenta de
terceros, de lo contrario, se completará
con null.
Ventas por Requerido Objeto
B/D | cuenta de | Importante: Si los documentos (FE, | por tipo de nil Longitud:1
terceros | CCFE, NCE, NDE, FEXE) son emitidos por | operación
cuenta de terceros deberá completarse
esta sección, para poder ingresar en el
CLE la información de los DTE emitidos
por cuenta de terceros.
Deberá contener el NIT del tercero,
cuando se realice una venta por cuenta de
terceros. Longitud: FE, CCFE.
venta NIT por Requerido por 14 NRE,
70 Terce cuenta de | NIT deberá ingresarse sin guiones. tipo de Alfanumérico | Mínimo: 9 | F NCE,
ro.nit Terceros operación Máximo: NDE,
Nota: Cuando las ventas no se realicen por 14 FEXE
cuenta de terceros deberá enviar el
campo con null.
Deberá de indicarse el nombre,
Nombre, denominación o razón social del tercero, Longitud: FE, CCFE,
venta ' cuando se realice una venta por cuenta de ;
Teres denomi- TEÍCEIOS Requerido por BN 250 NRE,
71 toño nación o - tipo de Alfanumérico | Mínimo: 1 F NCE,
; razon social . operacion Máximo: NDE,
mbre Nota: Cuando las ventas no se realicen por
del Tercero . : 250 FEXE
cuenta de terceros debera enviar campo
con null
49

<!-- PAGE 50 / 112 (OCR) -->

z 2 — 5 © o 5 ©
o [e Qo [7] © Le) + he] oc
a hel e oO Do 5 00 co 3 3 © 2 I o
E 3 7 Q vo TO 2 0 2 . Zu 0 5
3 O o) Cc aE ac & o E Lo a [8) = ES
n e: 0 £3 525 2 o o 8 oo
*(z/ BE | e. 25 5 a Ja | 8 85
ala = 38 O a 8] 6°
Esta Sección deberá completarse ,
Compra , Requerido
7 por cuenta cuando la compra se efectúe por cuenta por tipo de Objeto/ Null 1
d de terceros. Cuando no aplique, deberá LA
e terceros es e operación
transmitir la sección completa con null.
comp Número de | Deberá contener el numero del Longitud:
raTer documento | documento de identificacion del tercero, | Requerido por 20
72 7 cero. de cuando se realice una compra por cuenta tipo de Alfanumérico Mínimo: TC FEXE
numD identifica- | de terceros. operación 1
ocum cion del Maximo:
ento Tercero El número deberá ingresarse sin guiones. 20
comp Deberá de indicarse el nombre, ,
aer Nombre del | denominación o razón social del tercero Requerido por Longitud:
73 7 cero. A ! tipo de Alfanumérico TC FEXE
Tercero cuando se realice una compra por cuenta i 250
nomb d operacion
e terceros.
re
Sección 8: CUERPO DEL DOCUMENTO
Esta sección contiene la información
detallada de la operación realizada en
cada uno de los documentos.
En los campos numéricos que reflejen
valores monetarios en los DTE, se . Amegio de
pg fo im Requerido objeto 2000
A Cuerpo del permitirá un máximo de ocho posiciones para su (CRE y
Documento | decimales . (fraccionaria); en transmisión (DCL= CL= 500)
consecuencia, en los casos que se Objeto)
utilice más de 8 decimales cuando la )
novena posicion decimal de estos
campos sea igual o mayor a 5, la octava
posición decimal se deberá redondear 1
hacia arriba.

FE, CCFE,
cuerp En este campo se hará referencia a las filas NRE,
oDoc de los ítems por cada bien o servicio Reducido NCE,
umen Ba 7 vendido o prestado, por lo que deberá q oi Longitud: NDE,

74 A N° de item Le : para su Numérico TC
to.nu contener una numeración secuencial transmisión 4 CRE, CLE,
mite iniciando desde 1 hasta el máximo FEXE,
m permitido. FSEE y
CDE
Deberá indicar el tipo de ítem de la
operación que se está realizando, según
catálogo CAT- 011 Tipo de ítem.
Notas:
cuerp 1. Se deberá ingresar en este campo la FE, CCFE,
oDoc Tipo de opción 4, cuando se detallen impuestos Requerido Longitud: NRE,
75 umen | C hem cuyo valor esté sujeto al cálculo del IVA; es para su Alfanumérico 1 TC NCE,
to.tip decir, que se detalle en el ítem impuestos | — transmisión NDE,
oltem que correspondan a los códigos A8, 57, FSEE
D4, D5, A6, contenidos en catálogo CAT-
015 “tributos” apartado 2.
2. En FSEE no se permite el uso del código
4.
cuerp
oDoc £ eli , - ,
turien Tipo Deberá indicar el tipo de donación que se Requerido Lond:
76 tol Cc de ta está realizando según catálogo CAT-026 para su Alfanumérico a TC CDE
e "Tipo de donación”. transmisión
acion
50

<!-- PAGE 51 / 112 (OCR) -->

| o = Qo [3] © ° o os
| 2lo| Q o So 590 co Le 35 e c 3
[%) Q No Eo = O © Do zo [8] =>
| ° o E ra J oo 2 o ox Lo DO
z 7 © 2 2 0 5 o] a a o o) D
(O) o 80 O) = va a
Cuando el campo tipo de donación esté
completo con la opción 2 (Bien), deberá
ingresar el valor de la depreciación del
| bien donado.
cue Cuando no tenga efecto la depreciación
oDoc ;
en los bienes donados o cuando la ,
umen Depre- donación no sea en especie, deberá Requerido por
77 to.tip A TA ' tipo de Numérico 11,8 TC CDE
ciacion completar el campo con $0.00 e
oDepr operación
eciaci : Po Mor
on Permite un máximo de 11 posiciones en el
valor entero.
Podrá expresarse desde 1 hasta un
máximo de 8 decimales después del valor
entero.
Se deberá indicar el código del
documento relacionado según catálogo
CAT-002 "Tipo de Documento” .
Este campo podrá repetirse hasta un
máximo de 500 veces (indicando el tipo
de documento que se está detallando en
cada ítem).
cuerp Tipo de Notas:
oDoc Requerido rude
Documento NE . Po Longitud: CRE y
78 umen | A " i a) Se permitirá relacionar documentos para su Alfanumérico F
, Tributario in roi nd Ftd 2 CLE
to.tip ; emitidos de forma física y electrónica de | transmisión
Relacionado :
oDte manera conjunta o separada.
b) En el CRE no se podrán integrar
diferentes tipos de documentos (es decir
un CCFE con una FE).
c) En el CLE se permitirá relacionar
documentos de diferentes tipos. Por
ejemplo: En un mismo CLE podrán
relacionarse: CCF, F, FEX, NC y ND.
ENG Se seleccionará el tipo de generación del
P Tipo de documento según catálogo CAT-007 ,
oDoc e pe e. Requerido had:
generación | “Tipo de Generación”. e Longitud: CRE y
79 umen | C del para su Numérico 1 TC CLE
to.tip , ; transmisión
documento | Este campo podrá repetirse hasta un
oDoc NU
máximo de 500 veces.
Cuando aplique deberá ingresar el código
de generación o número correlativo del
documento que se está referenciando.
cuerp , CLE=
oDoc | C Notas: Requerido Longitud
umen para su 36 FE, CORR.
Número de |1. En el caso de CCFE, NRE, NCE, NDE, NE NRE,
to.nu | (CR , ha : transmision ny
documento | solo se podra ingresar los numeros de Alfanumérico fra F NCE,
mero | Ey a : Mínimo 1
relacionado | documentos relacionados que se ; A NDE,
Docu | CLE , N (Requerido máximo
encuentren descritos en la sección de i CRE, CLE
ment | =A) ; od por tipo de 36
documentos relacionados. Asimismo, este e
o , : opi operacion)
campo podrd repetirse un maximo de
2000 veces, debiendo ingresarse el
número del documento relacionado en
cada uno de los ítems, pudiendo
51

<!-- PAGE 52 / 112 (OCR) -->

z | 2 = ST © o 5 a
els o > So Soo e s 95 © 2 5
E o > Q vo 325 0 a © E25 a 0 =
Ss | o o c aE 8c E TE 3 DO = ED
o 1 a ho) En = me Do [eo] LO) 5 ©
o . E > [8] O29 co Q ox I] [SRY
ZZ z © tal 2 wu 5 o] Le + o (o) a
(O) 2 20 O E TA a
relacionarse desde 1 hasta 50
documentos.
2. Para el CLE se permitirá el ingreso del
código de generación o número
correlativo del documento una sola vez
con un mismo estado. Asimismo, ninguno
de los documentos informados en un CLE
(F, CCF, NC, ND, FEX) podrá ser ingresado
en otro CLE generado con posterioridad,
es decir, sólo se podrá relacionar una vez
un documento activo a un CLE.
3. Para CRE y CLE este campo podrá
repetirse un máximo de 500 veces,
debiendo ingresar un documento
relacionado por cada ítem.
cuerp
oDoc Fecha de Deberá ingresar la fecha de generación del ,
generación i Requerido tirarle
umen documento relacionado. La estructura fi? Longitud: CRE y
81 A del . ip " , , para su Alfanumérico F
to.fec documento definida por la Administración Tributaria trarmemisión 10 CLE
haEmi ; es: YYYY-MM-DD.
i relacionado
sion
Deberá indicar la cantidad del producto o
servicio que detalla por ítem.
Este campo se deberá completar con
valor 1 en los siguientes casos:

FE, CCFE,
cuerp a) Cuando se haga uso del campo "Cargos NRE,
oDoc / Abonos que no afectan la base Requerido NCE,

82 umen | A Cantidad | imponible”. para su Numérico 11,8 F NDE,
to.can transmisión FEXE,
tidad b) Cuando campo 'Tipo de item" esté FSEE y

llenado con la opción 4. CDE.
Permite un máximo de 11 posiciones en el

valor entero. Podrá expresarse desde 1

hasta un máximo de 8 decimales después

del valor entero.

Este campo podrá contener la

codificación con la que el Emisor

identifica sus productos o servicios.

Longitud: FE CEE,
cuerp Este campo podrá ser enviado con null en 2 - NRE,
oDoc los siguientes casos: NCE,

83 umen C Código a) El Emisor no cuenta con dicha Opcional Alfanumérico minima: 4 TC NDE,
to.co codificación. Méximo: FEXE,
digo b) Cuando se haga uso del campo "Cargos 25 - FSEE y

/ Abonos que no afectan la base CDE.
imponible”. ;
c) Cuando el campo "Tipo de ítem" esté
llenado con la opción 4.
Apartado especial para otros impuestos
cuerp i detallados en el cuerpo del documento
oDoc Tributo , A
umen suieto a sujetos al IVA. Requerido por Lonaitud: FE, CCFE,
84 ' C | dil de tipo de Alfanumérico THE TC | NRE,
me c ri Campo especial para el uso de la sección operación NCE, NDE
ut 2 del CAT-015 "tributos" (códigos A8, 57,
o 90, D4, D5, A6).
52

<!-- PAGE 53 / 112 (OCR) -->

z 2 _ 33 Ko} lo] 5 D
0 + [at
2183 |8| 8, Seg E 3 35 |2| ES
E o > Lo va 50 92 0 2 e EA o [a] =
O) 2 o 5 SE act OE Lo) 2% = ES
n o ES 505 Do o o D do
|x| EE |Z Ss 25 5° o 3a | 2 83
oO Le a (o) O) = i a
| Será requerido cuando en el campo "Tipo
| de ítem" se ingrese la opción 4 (si el
| campo ‘Tipo de item” tiene una opcion
| diferente, deberá enviar con null.
|
| Notas:
| 1, Cuando se haga uso de este campo, el
| valor calculado del impuesto deberá
| ingresarse en el campo ventas gravadas
| (ingresando en el campo “cantidad” el
| valor 1 y en el campo “precio unitario” el
| valor calculado del tributo).
| 2. Cuando se haga uso de este campo
| para CCFE, NRE, NCE y NDE se permitira
| únicamente el código 20-IVA en el campo
“Código del Tributo”. No se permitirá
adicionar otros códigos.
| 3. Cuando se haga uso de este campo
| para FE el campo “Código del Tributo "se
| deberá enviar con null.
| Deberá detallar el código de la unidad de
| medida que utiliza para la descripcion del
| producto por item (Ver catálogo CAT-014
| “unidad de medida”)
cuerp Se deberá ingresar la opción 99 (otra) de de
oDoc dicho catálogo cuando: Requerido o NCE.
85 umen | A tinidad de para su Numérico Longiug: F NDE
to.uni Medida a) El contribuyente preste un servicio. transmisión 2 FEXE
Medid b) No aplique unidad de medida o la CDE y
a unidad de medida no esté contemplada FSEE
dentro del catálogo proporcionado.
Cc) Se haga uso del campo "Cargos /
Abonos que no afectan la base imponible”.
d) El campo "Tipo de ítem” esté lleno con
la opción 4.
cuerp FE, CCFE,
C00 A Requerido Longitud: NCE,
Aen Deberá contener la descripción por item para su 1000 NDE,
to.des (CR | Descripción | que detalle el producto y/o servicio de la | transmisión Alfanumérico | Mínimo: 1 | F | NRE, CRE,
cripci E= operación. (CRE= Máximo: FEXE,
ón QC) opcional) 1000 FSEE y
CDE
Deberá indicar por ítem el precio unitario
de cada producto o servicio de la
operación.Permite un máximo de 11
posiciones en el valor entero. Podrá
ue expresarse desde 1 hasta un máximo de 8 kN
, decimales después del valor entero. Requerido g
umen Precio NCE,
87 to.pre A Uniterio _ para su Numérico 11,8 F NDE.
don Condiciones especiales: transmision FEXE y
| a) Cuando se haga uso del campo "Cargos FORE
/ Abonos que no afectan la base
imponible", deberá ingresarse el valor
| $0.00.
| 53
|
|
|

<!-- PAGE 54 / 112 (OCR) -->

z a — 3 Il o 5 v
ElSI 3 || 3, 50 o E 35 ||] £5
E TO 5 Ly vo a 0 a © E 3 0 =
Sl e) c E OTE DE E 20 = ES
O 2 © = OU © 5 © co ‘0 5
> wn ho) E 8 SE] og o o - @ Du
o E 77 o] O = Lo 1a >
Z| Z = 5] z 00 o 2 = o So
(O) q 80 O == un a
b) Cuando el campo "Tipo de ítem” se
complete con la opción 4 deberá
reflejarse el valor calculado del tributo
sujeto a IVA.
Deberá indicar el costo unitario de los
bienes o servicios donados.
cuerp Nota: Cuando la donación sea en efectivo, ;
oboc Valor deberá ingresar el monto total de la Requendo
88 umen | A FU E para su Numérico 11,8 F CDE
Unitario donación. A
to.Val transmisión
orUni a
En este campo podrán ingresarse valores
desde 1 hasta un máximo de 8 decimales
después del valor entero.
En este campo se detallarán por ltem los
descuentos, bonificaciones o rebajas
cuerp realizadas a los productos o servicios. FE, CCFE,
oDoc Descuento, ; uz di " NRE,
| Permite un máximo de 11 posiciones en el Requerido
umen Bonificacion 4 tal NCE,
A : valor entero. Podrá expresarse desde 1 para su Numérico 11,8 TC
to.mo , Rebajas MO , . NE NDE,
; hasta un máximo de 8 decimales después | transmisión
ntoDe por item FEXE,
del valor entero.
scu FSEE
Cuando no aplique el descuento deberá
ingresar el valor $0.00
Deberá detallar el valor de las ventas no
sujetas de la operación, las cuales están
dadas por el resultado de: [(precio unitario
* cantidad) - * Descuento, Bonificación,
Rebajas por ítem"]
Si no existen ventas no sujetas deberá
ingresar $0.00 :
Permite un máximo de 11 posiciones en el
cuerp valor entero. Podrá expresarse desde 1
oDoc hasta un máximo de 8 decimales después . FE, CCFE,
Requerido por
umen | 4 Ventas No | del valor entero. tino de Muniéfico 118 E NRE,
to.ven Sujetas o sl " NCE, NDE
taNos Se dará holgura de $ 0.01 ctvs. Hacia arriba p y CLE
uj y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la AT.
Nota: Para el CLE, será el resultado de
restar al "Total de operaciones Ventas no
sujetas" - el "Monto global de Descuento,
Bonificación, Rebajas y otros a Ventas no
sujetas” contenidos en el documento que
se está liquidando.
Deberá detallar el valor de las ventas
cuerp dea , ; FE. CCFL,
D Ventas exentas de la operacion, las cuales estan | Requerido por NRE
91 DURE | A dadas por el resultado de: [(precio unitario tipo de Numérico 11,8 F ,
umen Exentas * : : PRN NCE, NDE
cantidad) - "descuento, bonificación, operación
to.ven , , 3 y CLE
rebajas por item’)
54

<!-- PAGE 55 / 112 (OCR) -->

|
|
| z < — ST o] o o 2
cC 0 + he) [at
| 2s IE 3, 27. -— 3 35 || £8
E E e 2 vo 3D 0 o O =a LS) Is
(8) [7] o Cc aE ar E DE D o o = ES
[72] 0 Eon = QO © Do o [8] 3
o o E Dn o oxo go o) Ox 0 ow
Zz z © 20 2 0 5 o] 2 — = [oR o) =
| o TS 23 O = ala
| taExe
nta Si no existen ventas exentas deberá
| ingresar $0.00
|
| Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 8 decimales después
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la AT.
Nota:
Para el CLE, será el resultado de restar al
“Total de operaciones Ventas exentas" - el
“Monto global de Descuento,
Bonificación, Rebajas y otros a Ventas
exentas” contenidos en el documento que
se está liquidando.
Deberá detallar el valor de las ventas
gravadas de la operación, las cuales están
dadas por el resultado de: [(precio unitario
* cantidad) - "descuento, bonificación,
rebajas por item’]Si no existen ventas
gravadas deberá ingresar $0.00.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1 R id
cuerp hasta un máximo de 8 decimales después ( Sonne
oDoc del valor entero. por tipo de FE COPE,
temen TI operacion) “ NRE,
92 to.ven A Gravadas Se dara holgura de $ 0.01 ctvs. Hacia arriba FEXE= Numérico 18 F NCE,
, : ; " Requerido NDE, CLE
taGra y hacia abajo por diferencias entre los Are et FEXE
vada cálculos en el sistema del contribuyente y para su y
A . — transmisión
| la aplicación de fórmula para validación
| del cálculo de la AT.
Nota: Para el CLE, será el resultado de
restar al "Total de operaciones Ventas
| gravadas” - el “Monto global de
| Descuento, Bonificacion, Rebajas y otros a
| Ventas gravadas” contenidos en el
| documento que se esta liquidando.
| Deberá detallar únicamente los valores de
factura de exportación.
|
| Si no existen exportaciones deberá
| cuerp colocar $0.00.
| añor Requerido por
| 93 umen | 4 Exportacion | Se dará holgura de $ 0.01 ctvs. Hacia arriba tipo de Numético 118 F CLE
to.exp es y hacia abajo por diferencias entre los operación '
ortaci calculos en el sistema del contribuyente y de
ones la aplicación de fórmula para validación
del cálculo de la A.T.
Nota: Cuando se informen documentos
con estado invalidado/anulado, deberá
55

<!-- PAGE 56 / 112 (OCR) -->

z y — EM] © o 5 Oc
815 2 8] *?o Seo o 5 35 || £8
E o ue Q a 50 2 0 a .. Zu 0 0 =
8 La] 9 [a o ack CRS © 2% = ES
17.) 0 Eo = OU © Do o [9] =]
| EII ES Des eS 8 Sé || gs
a e 1) z Do o E > th o]
O > nv O E wl a
E ccc E e
negativo.
Deberá detallar el valor donado por cada
ítem, el cual estará dado por el resultado
de: ¡[(Valor Unitario * Cantidad) -
Depreciación].
cuerp Permite un máximo de 11 posiciones en el
oDoc Valor valor entero. Podrá expresarse desde 1 Requerido
94 umen | A D hasta un máximo de 8 decimales después para su Numérico 11,8 TC CDE
onado pue
to.val del valor entero. transmisión
or
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Deberá indicar en este campo el monto de
la venta, la cual estará dada por el
resultado de: [(precio unitario * cantidad) -
cuerp + E. ;
Descuento, bonificación, rebajas por ;
oDoc tern] Requerido
95 umen | A Ventas ' - para su Numérico 11,8 TC FSEE
to.Co ; hh del transmisión
mpra Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 8 decimales después
del valor entero.
Deberá indicar el código de los tributos
que apliquen al producto o servicio
detallado por ítem (Ver catálogo: CAT-015
“Tributos” Secciones 1 y 3).
Cuando en el documento existan ventas
gravadas el campo debe contener por lo
menos el código de tributo 20-IVA, se
exceptúa de esta condición la FE ya que
esta deberá presentar los valores con IVA
incluido.
Si en FE las ventas gravadas solo aplicaran
a IVA deberá ingresar este campo con null.
cuerp FE, CCFE,
oDoc edi Cuando aplique más de un código de | Requerido por MU NRE,
umen | C ke del tributo este deberá ingresarse entre tipo de Alfanumérico Longiua: TC NCE,
" ributo e 2
to.trib corchetes y separarse por comas. operación NDE, CLE,
utos y FEXE
Este campo se completara con null, en los
siguientes casos:
1- Cuando en el item se detallen Ventas no
sujetas.
2- Cuando en el item se detallen Ventas
exentas.
3- Cuando se haga uso del campo "Cargos
/ Abonos que no afectan la base
imponible”.
Para los casos de CCFE, NRE, NCE, NDE
cuando se haga uso de campo “Tributo
sujeto a cálculo de IVA” podrá ingresar en
el ítem únicamente el código 20-1VA.
56

<!-- PAGE 57 / 112 (OCR) -->

|
|
| Z i. — bu Io} o c y
[a fe] + 0 [at
a | + = o o 5 o o ° o 3 TS 3 2 O
| E 8) > Q vo 25 a 0 a 2D S 0 =
| Sla| 3 | SE BEE DE o 20 | = En
| O. 2 lo ES TES 25 o 5 9 do
| z |> = 5 ° $ o 5 a a [es 032
(O) Le ] 0 O) de re a
|
| Para el caso de FE cuando se haga uso de
| campo “Tributo sujeto a cálculo de IVA”
deberá ingresar este ítem la palabra null.
| Para el caso especial del CLE solo
| aplicarán los tributos contenidos en la
| sección 1 del catálogo CAT-015 “tributos”.
| Nota: Los tributos contenidos en este
campo se reflejarán en la sección
“resumen” de la siguiente manera:
|
| En el campo “resumen código de tributo”
se ingresará de manera consolidada (una
sola vez) cada tipo de tributo por medio
| del código que haya aplicado por ítem.
| En el campo “nombre del tributo” se
ingresará de manera consolidada (una sola
vez) la descripción correspondiente por
cada tipo de tributo detallado mediante
código en campo "Resumen Código de
Tributo”.
En el campo “valor de tributo” debe
contener la sumatoria consolidada de los
montos de tributos calculados por ítem,
de forma separada por tipo de tributo.
Deberá contener el precio sugerido de
venta (PSV) según aplique, de acuerdo alo
informado a la Administración Tributaria
en los formularios respectivos. El PSV
deberá detallarse por ítem.
cum Precio Nota: Este campo es sólo de uso | Requerido por
97 timer C | sugerido de | informativo. tipo de Numérico 11,8 TC | CCFE y FE
to.psv venta Si la naturaleza del negocio no lo requiere operación
i deberá enviar este campo con valor $0.00.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un maximo de 8 decimales después
del valor entero.
Podrán detallarse cargos o abonos al
receptor que no afecten la base
imponible.
cuerp Se incorporará el monto con signo
ener Cargos / negativo o positivo según sea el caso.
Abonos que Requerido
umen ; Sr CCFE, FE
to.no no afectan | Cuando no existan Cargos / Abonos que para su Numérico 11,8 F y FEXE
Crave la base no afecten la base imponible se deberá | transmisión
do imponible | llenar con valor $0.00.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 8 decimales después
del valor entero.
57

<!-- PAGE 58 / 112 (OCR) -->

Zz 2° — 3 © o 5 2
lo) - Qa v Ko) + 0 oc
a | © e o o 5 o lo) co 3 5 o o co
E 3 > 0a OL 0 a u E S 0 =
3 I) o c o ac E CRS Ko) 2 = ES

wn a 0 £ © = 0 © Do o Sy o Zo
o e E = o ES) co o Sa Lo) 09g
Z | z © La = 00 o = = o So
O > as O) E wl a
Este campo será de uso informativo, no
afecta los valores contenidos en el
documento.
Debe contener el monto computado del
IVA por cada ítem.
Para el CLE el valor de este campo estará
dado por el cálculo de: (campo "Ventas
Gravadas" *13%).
Para la FE el valor de este campo estará
dado por el cálculo de: [[(ventas gravadas
por item) /1.13]*13%]
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
cuer hasta un máximo de 8 decimales después
P del valor entero. i
oDoc Requerido
e." C ¡IVAporiem Se dará holgura de $ 0.01 ctvs. Hacia arriba para su Maménico 2.8 F FEyCLE
to.ival , , ; transmision
tem y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Este valor es de uso informativo, no tendrá
efecto para la sumatoria del campo "valor
de tributo” que corresponda a IVA en la
sección resumen del documento.
Condición especial:
En el caso del CLE, cuando el documento
a liquidar informado se encuentre con
estado invalidado/anulado, se ingresarán
los valores de IVA en negativo, a
excepción de la NC que se ingresará con
valores positivos.
Elie Deberá detallar el valor neto que fue sujeto
Suet de retención por cada documento
informado detallado en cada ítem. ;
umen Monto Requerido
100 tomo | A Sujeto a Permite un máximo de 11 posiciones en el para su Numérico 11.2 F CRE
ntoSu retencion [ . transmision
ietoGr valor entero. Podrá expresarse desde 1
J po hasta un maximo de 2 decimales después
del valor entero.
oa Deberá ingresar un código del catálogo
umen CAT-006 "Retención IVA MH" para cada
to.co Código uno de los documentos informados por Requerido Lonaitud:
101 di JOR C retención | item de acuerdo al tipo de retención que para su Alfanumérico 2 TC CRE
g MH se esté informando. transmisión
eteN .
NA Aplican los códigos 22, C4 o C9.
GUISA Deberá detallar el monto de retención IVA
Susp IVA efectuada en el documento relacionado. Requerido
102 A : Es el resultado del Monto Sujeto a ara su Numérico 11,2 F CRE
umen Retenido ; P
to Iva retención multiplicado por el porcentaje | transmisión
- legal.
58

<!-- PAGE 59 / 112 (OCR) -->

|
|
= z — 3 Li 0} lo) 5 7
c re [1] + o oc
alo o f=) To 5 De e 3 956 o co
E [a] > y oa “Da 0 a Zu Ss >=
slo e) c aE atc E DE Lo 50 = £2
O a a 0 En 00 5 © co 0 5
o " E “a roo) Oo 20 o) Sa o 09
Zz | 8 | 6 = 85 e a = |Z] 28
O) > a) O) [ri]
Reteni
do Permite un maximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
| la aplicación de fórmula para validación
| del cálculo de la A.T.
cuerp ;
| oDoc
| umen Fecha inicio Longitud:
to.per del período Deberá indicar la fecha inicial del período Requerido 200
| 103 iodoLi | A po a liquidar. Deberá cumplir con la siguiente para su Alfanumérico | Mínimo: 1 | F DCLE
quida INTL de aid estructura: YYYY-MM-DD. transmisión Máximo:
: Liquidación
cionF 200
| echal
| nicio
| cuerp
| oDoc
| umen , Longitud:
Fecha fin % rai j ; i
to.per celneriono Deberá indicar la fecha final del período a Requerido 200
104 iodoLi | A e: liquidar. Deberá cumplir con la siguiente para su Alfanumérico | Mínimo:1 | F DCLE
quida trade DA estructura: YYYY-MM-DD. transmisión Máximo:
| h Liquidación
cionF 200
echaF
in
cuerp
oDoc Podrá indicar el código interno de las Longitud:
umen e liquidaciones según controles de las A 30
105 to.co | C Código de administradoras de tarjetas. Opcional ANonuménco Mínimo: 1 | TC DCLE
dLiqui Liquidacion / null Máximo:
| dacio De no hacer uso del campo ingresar null. 30
n
cuerp tir
oDoc ; Podra indicar la cantidad de documentos Longing
men Cantidad de ue se están liquidando Numérico a Minimo,
106 ml Docu- | 9 q Opcional mo 1 TC | DCLE
tidad mentos De no hacer uso del campo ingresar null. mu
Doc
elier Deberá indicar el valor monetario total
cu (bruto incluyendo IVA, propina u otro) de
umen Valor de las | las transacciones a liquidar. Requerido
107 toval | A Oper. . Po para su Numérico 11,2 F DCLE
orOp ciones a Permite un máximo de 11 posiciones en el transmisión
eracio Liquidar valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
nes
del valor entero.
El agente de percepción podrá colocar el
cuerp monto de las operaciones a liquidar no
oDoc sujetas a percepción.
umen
| 108 to.mo A valores no Permite un máximo de 11 posiciones en el Opcional Numérico 112 TC DCLE
ntoSi a ción valor entero. Podrá expresarse desde 1 P .
| nPerc 5 P hasta un máximo de 2 decimales después
| epcio del valor entero.
| n
| De no hacer uso del campo ingresar $0.00
| 59
|
|
|
|

<!-- PAGE 60 / 112 (OCR) -->

z 2 = MO] [0] £ ©
2183 |5| $ 23 E 2 «5 IS| de
glo 5 |e ve ©3983 oo © 2% s o
sl 8] 9 SE OTE OE 4 55 |= | ES
O | & 2. e ES 28m 5 ® © co O) 50
o o E 5 roo E co o 9 a o) [9] u
| 3 o) z oo le) 2 a a oz

O) gL 30 O) E rt E

cuerp
ovoc Descripcion Podra indicar una breve descripcion de las
operaciones que identifiquen el origen de MU
109 todos A del valoro los montos no sujetos a percepción Opcional Avanumeneo | Longiug: TC DCLE
CREip sujeto a - / null 100
ie PETCEPCIÓN | De no hacer uso del campo ingresar null.
cepci
on
cuerp
oDoc , Podrá indicar una breve observación por os Longitud
110 umen Reta cada ítem. Opcional fi maxima TG CLE
to.obs De no hacer uso del campo ingresar null. de 3000
Item
cuerp "Longitud:
oDoc Queda a disposición de cualquier otra 200
111 umen | A Observacio | observación que el emisor desee colocar. Opcional Alfanumérico | Mínimo: TC DCLE
to.obs nes por ítem / null 5;
ervaci De no hacer uso del campo ingresar null. Máximo:
ones 200"
Deberá contener el valor resultante de
restar el campo "Valor de las Operaciones
a liquidar - "Valores no sujetos a
percepción”.
cuerp Permite un máximo de 11 posiciones en el
oDoc valor entero. Podrá expresarse desde 1 Requerido
112 umen | A Sub-Total | hasta un máximo de 2 decimales después para su Numérico 41,2 TC DCLE
to.sub del valor entero. transmisión
Total
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Deberá indicar el IVA de las transacciones,
que se calcula sobre el valor neto de las
operaciones reportadas por el afiliado.
Permite un máximo de 11 posiciones en el
cuerp IVA de las | valor entero. Podrá expresarse desde 1 ,
Al i 4 Requerido
13 oDoc A Opera- hasta un máximo de 2 decimales después para su NUE 112 F DCLE
umen ciones a del valor entero. E .
E. transmisión
to.IVA liquidar
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
cuerp Deberá indicar el valor neto de las
oDoc operaciones sobre el cual se efectua la
umen Monto percepcion IVA. ,
to.mo sujeto a Requerido Py
114 A ho! (os MU. para su Numérico 11,2 F DCLE
ntoSu percepción | Permite un maximo de 11 posiciones en el transmisión
jetoP sin IVA valor entero. Podrá expresarse desde 1
ercep hasta un máximo de 2 decimales después
cion del valor entero.
115 úrmer: A Percinido - para su Numérico 11,2 F DCLE
to.IVA (2%) Permite un máximo de 11 posiciones en el transmisión
60

<!-- PAGE 61 / 112 (OCR) -->

|
z a 0 fo} o S 4]
E a © © p= 0 oc
ESTAIS Sg 599 53 5 35 18] ES
s | 9] o SE OTE GE e 29 | = EG
O | & a | 5 ES E E > So © S50
o Ei E = oc © To co o) 9 A Io) (8) 9
z Zz © 5S Zz “oe o 2 = Q 95
(O) ds 80 O) = 1 a
percib valor entero. Podrá expresarse desde 1
ido hasta un máximo de 2 decimales después
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
| cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Deberá indicar el monto de la comisión
por el servicio.
cuerp
| ovo Permite un maximo de 11 posiciones en el Requerido
116 Eo A Comisión | valor entero. Podrá expresarse desde 1 para su Numérico 11,2 F DCLE
io hasta un máximo de 2 decimales después | transmisión
misio
| e del valor entero.
De no hacer uso del campo ingresar $0.00
cuerp
| oDoc
| umen Porcentaje | Podrá indicar el porcentaje de la comisión. Alañimérico Longitud
117 to.por | A de Opcional 7 null máxima: F DCLE
centC Comisión | De no hacer uso del campo ingresar null. 100
omisi
on
Deberá indicar el monto del IVA de la
comisión por el servicio.
Permite un máximo de 11 posiciones en el
valor entero.
cuerp Podrá expresarse desde 1 hasta un
oDoc máximo de 2 decimales después del valor Requerido
118 umen| A | Miden (eno para su Numérico 112 F | DCLE
to.IVA Comisión NE
: i transmisión
comis De no hacer uso del campo debe ingresar
ion $0.00.
Se dara holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Deberá indicar el valor líquido a pagar al
afiliado en la fecha o período pactado.
cuerp Permite un máximo de 11 posiciones en el
oDoc Valor líquido valor entero. Podrá expresarse desde 1 Requerido
119 umen | 4 a pagar al hasta un máximo de 2 decimales después para su Numérico 112 F DCLE
to.liqu afiliado del valor entero. transmisión ’
idoAp Se dará holgura de $ 0.01 ctvs. Hacia arriba
agar y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
cuerp ¡ tire
EE AE
umen Letras pagar. A PT
transmisión Mínimo: 8
to.tot
61
|
|
|

<!-- PAGE 62 / 112 (OCR) -->

z < = E o] o 5 vw
o) E Eel v o © - c ho gE
lol a |%| Sg Sea co E 365 || ES
E o Q vo De oo o E] Ko] DE
D o) = a & ac & OE ko) Do = ES
o) Q q © = © © co 3
1 0 ES 525 B53 o o o 0
>|: E TE o gg c y Sa 9 | 3%
pa 0 v a vo o i= =~ 7] no
O > ao (O) A
alLetr Máximo:
as 200
Sección 9: RESUMEN
Esta Sección contiene un resumen
general de la información del cuerpo del
documento, es obligatoria y se
encuentra en todos los documentos
tributarios, excepto en el DCLE.
En los campos numéricos de la sección Loñaltua:
A Resumen | resumen de los DTE se permitirá un Requerido Objeto E -
máximo de dos posiciones decimales
(fraccionaria). En consecuencia, en los
casos que se utilice más de 2 decimales
cuando la tercera posición decimal de
estos campos sea igual o mayor a 5, la
segunda posición decimal se deberá
redondear 1 hacia arriba.
Deberá contener el valor total de las
operaciones no sujetas realizadas, será el
resultado de la sumatoria de todos los
valores contenidos por ítem en los
resum Total de campos de las ventas no sujetas. i
en.tot Opera- Reguerido
121 p A í ; " dei para su Numérico 11,2 F
alNoS ciones no | Permite un máximo de 11 posiciones en el tid ’
; ; . transmision
uj sujetas valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después FE, CCFE,
del valor entero. NRE,
Cuando no existan ventas no sujetas, este NCE, NDE
campo deberá enviarse con $0.00. y CLE
Deberá contener el valor total de las
operaciones exentas realizadas, será el
resultado de la sumatoria de todos los
valores contenidos por ítem en los
campos de las ventas exentas.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
resum Total, de Soi ' . ,
A Opera- hasta un máximo de 2 decimales después Requerido
122 - A i del valor entero. para su Numérico 11,2 F
alExe ciones ro
ña exentas transmisión
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T. FE, CCFE,
NRE,
Cuando no existan ventas exentas, este NCE, NDE
campo deberá enviarse con $0.00. y CLE
62

<!-- PAGE 63 / 112 (OCR) -->

|
|
|
|
| v
= 2° — Do © o 5 a
Cc ro 7] + he) Oc
| g s 2 > o Sea 20 Le! 3% 9 co
0 = un Dec 0 a o = 0 RS 23
| S|&| 2 ISI ES 255 Cy: E e || 5e
| ole | Elo Go E E. 8 Se |8| 8%
pa © 7] z vo [e] i= = a o
| O > AO O Lu 3 (a)
| Deberá contener el valor total de las
| operaciones gravadas realizadas, sera el
| resultado de la sumatoria de todos los
| valores contenidos por ítem en los
| campos de las ventas gravadas.
| Permite un máximo de 11 posiciones en el
| resum Total de valor entero. Podra expresarse desde 1 Requerido
| 123 en.tot A Opera- hasta un maximo de 2 decimales después ora el Numérico 112 F
| alGrav ciones del valor entero. para su '
| ada Gravadas transmisión
A Se dará holgura de $ 0.01 ctvs. hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y FE, CCFE,
: la aplicacion de formula para validacion NRE,
del cálculo de la A.T.Cuando no existan NCE,
ventas gravadas, este campo deberá NDE, CLE
enviarse con $0.00. y FEXE
Deberá contener la sumatoria de
operaciones de exportación realizadas
(detallar únicamente valores contenidos
en FEXE).
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Cuando no existan ventas por
resum Total de ; e . ,
en.ex Opera- operaciones de exportación, se deberá Requerido “
| 124 porta A ciones de | Enviar campo con $0.00. para su Numérico 11,2 F CLE
| ; e transmisión
clon Exportación Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la AT.
Nota: Deberán restarse los valores de los
documentos con estado
invalidado/anulado, que se hayan
ingresado con valores negativos en el
cuerpo del documento.
Deberá contener la sumatoria de todas las
| operaciones realizadas.
|
| Permite un máximo de 11 posiciones en el
| FE valor entero. Podra expresarse desde 1
emtot Total de hasta un máximo de 2 decimales después Requerido
| 125 alcom A Opera- del valor entero. para su Numérico 11,2 TC
| ciones transmision
| pra Se dará holgura de $ 0.01 ctvs. Hacia arriba
| y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
| la aplicación de fórmula para validación
| del cálculo de la AT. FSEE
|
|
| 63
|

<!-- PAGE 64 / 112 (OCR) -->

Zz 2 = 30 © o 5 2
= re] 7) + ne oc
s || lc DE BCE TE E 20 |E| ES
O) $ o 5 2 E hai co Iv) 5
Ola 5 ES £33 ES o 52 [S| Se
zlz| El: o 25 5 a Je |8| 03
Oo 3 = 28 (8) = a a
Deberá contener la sumatoria de todos los
valores donados.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
val Total de la hasta un máximo de 2 decimales después Requerido
126 orTot A Denación del valor entero. para su Numérico 11,2 TC CDE
al transmisión
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Deberá contener la sumatoria de todas las
operaciones realizadas (será el resultado
del "Total de operaciones No sujetas” más
el "Total de operaciones Exentas” más el
"Total de operaciones Gravadas").
resum , " de
Suma de | Permite un máximo de 11 posiciones en el i FE, CCFE,
en.su : , Requerido
127 bTotal | A operaciones valor entero. Podrá expresarse desde 1 para su Numérico 112 F NCE,
Venta sin hasta un máximo de 2 decimales después ATER NDE, NRE
2 impuestos | del valor entero. y CLE
Se dará holgura de $ 0.01 ctvs. hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Se deberá indicar el monto de descuento,
bonificación, rebajas y otros, que el emisor
realice al campo "Total de operaciones no
sujetas”.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
Monto del valor entero.Cuando no aplique, se
global de enviará con $ 0.00.
e E —] Nota:La aplicación de este campo es Requerido FE, CCFE,
128 scuN Rebajas y diferente respecto al campo "Descuento, para su Numérico 11,2 TC | NCE, NDE
oSuj ! win bonificacion, rebajas por ítem" que se | transmisión y NRE
vers no aplica en el cuerpo del documento.
seras La diferencia consiste en que el descuento
para este campo es aplicado de manera
global sobre el monto del total de
operaciones no sujetas y se refleja en el
resumen del documento, mientras que el
campo denominado "Descuento,
bonificación, rebajas por ítem” es aplicado
por cada ítem y se refleja en el cuerpo del
documento.
64

<!-- PAGE 65 / 112 (OCR) -->

|
| z 2 = E © o 5 2
| o e re v o © + ° oc
| a | © 2 D Do 500 co 3 S 5 2 co
Elo |* Do RES Sa o ge |S] 23
A] fi) o c a EF ACE DE Do Do = E o
| Iv: o 0 € © = 000 DO o 50 [o] Do
| o N: E 7 co © oo co q Sa (a) 09
Z| =z © ® => 00 o E >= a SE
| O) po Ao O) = ul a
| Se deberá indicar el monto de descuento,
| bonificación, rebajas y otros, que el emisor
| realice al campo "Total de operaciones
| exentas".
|
| Permite un maximo de 11 posiciones en el
| valor entero. Podrá expresarse desde 1
| hasta un maximo de 2 decimales después
| del valor entero.
| Monto
| global de | Cuando no aplique, se enviará con $ 0.00.
resum Descuento, ,
| en.de Bonificación | La aplicación de este campo es diferente Reguendo un FE, CCFE,
129 : x para su Numérico 11,2 TC | NCE, NDE
SCUEX , Rebajas y | respecto al campo Descuento, EA
a ; rea" transmisión y NRE
| enta otros a bonificación, rebajas por ítem” que se
| ventas aplica en el cuerpo del documento.
| exentas
| La diferencia consiste en que el descuento
| para este campo es aplicado de manera
| global sobre el monto del total de
| operaciones exentas y se refleja en el
resumen del documento, mientras que el
campo denominado "Descuento,
bonificación, rebajas por ítem” es aplicado
| por cada ítem y se refleja en el cuerpo del
documento.
Se deberá indicar el monto de descuento,
bonificación, rebajas y otros, que el emisor
| realice al campo "Total de operaciones
| gravadas”.
|
| Permite un máximo de 11 posiciones en el
| valor entero. Podrá expresarse desde 1
| hasta un maximo de 2 decimales después
| del valor entero.
| Monto
| global de | Cuando no aplique, se enviará con $ 0.00.
|
| Resum Descuento. o Requerido FE, CCFE,
| en.de Bonificación | La aplicación de este campo es diferente es
130 i para su Numérico 11,2 TC | NCE, NDE
| scuGr , Rebajas y | respecto al campo Descuento, uu
— : Em de transmisión y NRE
| avada otros a bonificación, rebajas por ítem” que se
| ventas aplica en el cuerpo del documento.
| gravadas
| La diferencia consiste en que el descuento
| para este campo es aplicado de manera
| global sobre el monto del total de
operaciones gravadas y se refleja en el
| resumen del documento, mientras que el
| campo denominado "Descuento,
| bonificación, rebajas por item” es aplicado
| por cada ítem y se refleja en el cuerpo del
| documento.
|
|
65
|

<!-- PAGE 66 / 112 (OCR) -->

Zz E — 3 Lo) © o S D
o S a v © ke} = 0 Oc
alo 2 ID do 590 co Zz TS 5 | 8 .
E o > Q vo DL 0 Q ra E] Oo 0 =
So o c gE oc E DE o 20 = Ew
[07] 2 0 Eo = 0 ® Do so oO 30
o E > ES To cu 3 Sa 3 83
= |= E (7) Zz 96 o) Le a a oz
O > as O | a 17 [a]
Se deberá indicar el monto de descuento,
bonificación, rebajas y otros, que el emisor
realice al campo "Total de operaciones
afectas”.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Monto
global de | Cuando no aplique, se enviará con $ 0.00
resum Descuento, ,
en.de Bonificación | La aplicación de este campo es diferente Requerido
131 - : . para su Numérico 14,2 TC FEXE
scuen , Rebajas y | respecto al campo Descuento, Ne
PA ; Earn transmisión
to otros a bonificación, rebajas por ítem” que se
ventas aplica en el cuerpo del documento.
afectas
La diferencia consiste en que el descuento
para este campo es aplicado de manera
global sobre el monto del total de
operaciones afectas y se refleja en el
resumen del documento, mientras que el
campo denominado "Descuento,
bonificación, rebajas por ítem” es aplicado
por cada ítem y se refleja en el cuerpo del
documento.
Se deberá indicar el monto de descuento,
bonificación, rebajas y otros, que el emisor
realice al campo "Total de operaciones”.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Monto
gob de Cuando no aplique, se enviará con $ 0.00.
Descuento,
resum Bonificacion La aplicación de este campo es diferente Requerido
132 en.de , Rebajas y p POS para su Numérico 12 TC FSEE
respecto al campo Descuento, a
scu otros al total E ; ; " transmision
de bonificación, rebajas por ítem” que se
, aplica en el cuerpo del documento.
Operacione
3 La diferencia consiste en que el descuento
para este campo es aplicado de manera
global sobre el Total de Operaciones y se
refleja en el resumen del documento,
mientras que el campo denominado
"Descuento, bonificación, rebajas por
ítem” es aplicado por cada ítem y se refleja
en el cuerpo del documento.
En este campo se podrá indicar el
, porcentaje global de descuento,
Porcentaje Pg . :
resum del mento bonificación, rebajas y otros, que el emisor
enpo global de da sobre la sumatoria de operaciones FE, CCFE,
133 aleDe C | Descuento, p - Opcional Numérico 3,2 TC NRE y
) Bonificacion i (os I~ FEXE
scuen A Permite un maximo de 3 posiciones en el
, Rebajas y :
to valor entero. Podrá expresarse desde 1
otros e , 5
hasta un maximo de 2 decimales después
del valor entero.
66

<!-- PAGE 67 / 112 (OCR) -->

| z q a 2g © lo) 5 ©
[= re [0] Ke) = o Oc
B12 SIE $e 538 ES 8 35 8 &8
| Sl 8] 9 | SE BEE DE 3 20 |= | ES
|| BS] ES 525 es 9 ES I8| de
| z|z| & | § 2 25 o a 4 1 o
| (O) a O) (O) E re e
Cuando no aplique se deberá enviar
| campo con $0.00.
Este campo sólo será de uso informativo,
| a efecto de mostrar la sumatoria de los
descuentos aplicados por cada [tem más
los descuentos globales al total de
operaciones por tipo de ventas.
Total del FE, COPE,
resum monto de Permite un máximo de 11 posiciones en el Requerido NRE,
134 en.tot le Descuanto valor entero. Podrá expresarse desde 1 he Numérico 112 TC NCE,
alDes "| hasta un maximo de 2 decimales después para su ’ NDE,
Bonificacion transmision
cu Rebajas del valor entero. FEXE,
’ FSEE
Se dará holgura de $ 0.01 ctvs. hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Se deberá indicar de forma consolidada el
| codigo de los tributos que se hayan
aplicado en el campo "Código del Tributo”.
Cada código de tributo sólo se podrá
aplicarse una vez, aunque su código se
hubiera aplicado 2000 o 500 veces en el
documento, según corresponda.
No se detallarán los tributos sujetos al
cálculo del IVA que van detallados en el
cuerpo del documento correspondientes
he Resumen | a la Sección 2 del CAT-015 “tributos”. Requerido por Longitud: FEE
135 Osc Cc Código de tipo de Alfanumérico > - F NCE NDE
odigo Tributo Deberá ingresar null cuando: operación y CLE
1- En el item se detallen Ventas no
sujetas.
2- En el item se detallen Ventas
exentas
3- Se haga uso del campo "Cargos /
Abonos que no afectan la base imponible”.
| Nota: Deberá mostrar a nivel informativo
| los códigos de diferenciales de precios
| contenidos en la Sección 3 del catálogo
CAT-015 “tributos”, es decir, no se
sumarán a los totales.
Se deberá describir el nombre del tributo
que corresponda a los códigos ingresados
en el campo "Resumen código de tributo”.
A Se deberá mostrar una sola vez el nombre Requerido por FE, CCFE,
136 tos d Nombre del | de todos los tributos aplicados por ítem. tipo de Alfanumérico Longitud: F NRE,
escrip Tributo . operación 300 NCE, NDE
ción Nota: Deberá mostrar a nivel informativo y CLE
los códigos de diferenciales de precios
contenidos en la Sección 3 del catálogo
CAT-015 “tributos” (no se sumarán a los
totales)
67

<!-- PAGE 68 / 112 (OCR) -->

v vv — — c
ols] 38] = LL 8 2 wz 12] %6
o | © br o Do 500 co Lo 50 a co
E a 7 Lo vo o. 0 o ° 2% + 5
8 La) e) c aE ATTE CRS © 20 = En
7 e o ES To ® Do o so 5 5
o bi E ia ou SEG co o Sa [a] 09
Zlz| 8&8 | z 00 o e = a So
O > Ao (O) = [1] a
Debe contener la sumatoria consolidada
de los valores calculados de los tributos
detallados en el campo "Resumen Código
de Tributo", es decir, en un solo monto,
aunque se hubiera aplicado 2000 veces
en los ítems.
No se detallarán los tributos sujetos al
cálculo del IVA que van detallados en el
cuerpo del documento correspondientes
a la Sección 2 del CAT-015 “tributos”.
resum Permite un máximo de 11 posiciones en el | Requerido por RE COPE,
en.trib Valor del 4 . du NRE,
137 y valor entero. Podrá expresarse desde 1 tipo de Numérico 11,2 F
utos.v Tributo de : á i NCE, NDE
hasta un maximo de 2 decimales después operacion
alor y CLE
del valor entero.
Se dará holgura de $ 0.01 ctvs. hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Nota: Deberá mostrar a nivel informativo
los códigos contenidos en la Sección 3 del
catálogo CAT-015 “tributos” (no se
sumarán a los totales).
Deberá contener el resultado del campo
("Sumatoria de operaciones sin
impuestos") (-) [("Monto global de
descuento, bonificación, rebajas y otros a
ventas no sujetas” (+) "Monto global de
descuento, bonificación, rebajas y otros a
ventas exentas" (+) "Monto global de
descuento, bonificación, rebajas y otros a
ventas gravadas”)]
Nota: Para FSEE deberá contener el
resultado del campo “Total de ; FE CCFE,
recu Operaciones" (-) "Monto global de Requerido NRE
138 en.su A Sub-Total p SA 9 para su Numérico 11,2 TC :
Descuento, Bonificacion, Rebajas y otros NE. NCE, NDE
bTotal 6 " transmision
al total de operaciones’. y FSEE
Permite un maximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
68

<!-- PAGE 69 / 112 (OCR) -->

|
|
|
z he oz LM] Lo! S Pa
El Bl 2 | 2 go 28a oo bY 2 S © 2
So e) c SE OTE DE + 50 i= Eo
9 a 2 | © ES 0 DS o so o 3
° o E 7 o Oo co Sa 9] La)
z | z © 5 > 36 o E ~ e 2 >
o) > A o O ul
Deberá contener la sumatoria de los
campos "Monto sujeto a retención” de los
documentos relacionados.
resum Permite un máximo de 11 posiciones en el
en.tot valor entero. Podrá expresarse desde 1 !
alSuje Total Monte hasta un máximo de 2 decimales después Requerido Ae
139 A Sujeto a para su Numérico 11,2 F CRE
toRet del valor entero. rots
, retención transmisión
eNCEi e
on Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
: la aplicación de fórmula para validación
| del cálculo de la A.T.
¥ Cuando la operación esté sujeta a
| percepción, deberá contener el monto
computado del impuesto percibido.
| De no existir IVA percibido deberá
completar el campo con $0.00.
| resum IVA Permite un máximo de 11 posiciones en el | Requerido por CCFE,
140 en.iva NU valor entero. Podrá expresarse desde 1 tipo de Numérico 11,2 F NCE y
i Percibido ZA i , i
| Percil hasta un maximo de 2 decimales después operacion NDE
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Cuando la operación esté sujeta a
percepción, deberá contener el monto a
liquidar del impuesto percibido.
De no existir IVA percibido deberá
completar el campo con $0.00.
resum IVA Permite un máximo de 11 posiciones en el | Requerido por
141 en.iva Percibido | valor entero. Podrá expresarse desde 1 tipo de Numérico 11,2 F CLE
Perci liquidado | hasta un máximo de 2 decimales después operación
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
|
| 69
|
|
|
|
|

<!-- PAGE 70 / 112 (OCR) -->

c E 2 Io] o © Lo o 5 a
ga | wo 2 > 5 o S 20 ae 3 86 Le 3 5
Elo] 2 | 2 un vo Se o 53 |e | 235
SIE 81s SE TE DE © 28 |5| Es
% O EB 525 vo o o o e)
o " E 5 o oo co 2 Si Ú og
Z21ZI5|15) 2 ÚS 5 e = |3| 8°
O) > as O = wi Q
Cuando la operación esté sujeta a
retención IVA, deberá contener el monto
computado del impuesto retenido.
De no existir IVA retenido deberá
completar el campo con $0.00.
resum IVA Permite un máximo de 11 posiciones en el | Requerido por FE, CCFE,
142 en.iva , valor entero. Podrá expresarse desde 1 tipo de Numérico 11,2 F | NCE, NDE
Retenido Loft " . a
Retel hasta un maximo de 2 decimales después operacion y FSEE
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Cuando la operación esté sujeta a
retención renta, deberá contener el
monto computado del Impuesto retenido
renta.
De no existir renta retenida deberá
resum completar el campo con $0.00.
en ret Retención Requerido por FE, CCFE,
143 ’ Permite un máximo de 11 posiciones en el tipo de Numérico 11,2 TC | NCE, NDE
eRent Renta g lA
5 valor entero. Podrá expresarse desde 1 operación y FSEE
hasta un máximo de 2 decimales después
del valor entero.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Cuando aplique, se deberá indicar el valor
del seguro de la exportación.
Si el campo ‘Tipo de ítem” contiene la
resum opción 2 “servicios” deberá llenar con | Requerido por
144 ense | C Seguro $0.00. tipo de Numérico 11,2 TC FEXE
guro operación
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Cuando aplique, se deberá indicar el valor
del flete de la exportación.
Si el campo "Tipo de ítem” contiene la
resum opción 2 “servicios” deberá llenar con | Requerido por
145 en.flet | C Flete $0.00. tipo de Numérico 11,2 TC FEXE
e operacion
Permite un maximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
en.m suma del campo "Sub Total” (+) los valores Gi
146 A de la ; N . para su Numérico 11,2 F NRE,
ontoT ” contenidos en el campo "Valor de Tributo”. gl
Operacion transmision NCE,
otalO
70

<!-- PAGE 71 / 112 (OCR) -->

|
pd 3 — 3 v Dv lo) £ 7
o = Q v xo) Ko) = 0 [E
2 o 9 c a € fils 0 E 5 DD = ER
=z 55 9 TE ES 2 E | 8 39
z | z © 0 z 00 o ts =. o 85
oO o a) O) = ul Aa
peraci Para NCE y NDE se deberá colocar el NDE, CLE,
on resultado del campo “Subtotal” más los FEXE
valores contenidos en el campo “Valor del
tributo” más “IVA Percibido” menos “IVA
Retenido” menos “Retención Renta”.
Para CLE se deberá colocar el resultado de
los campos: "Suma de operaciones sin
impuesto” más los valores contenidos en
el campo “Valor del tributo”.
Para FEXE se deberá colocar el resultado
de los campos: "Total de operaciones
afectas” menos el campo "Monto global
de Descuento, Bonificación, Rebajas y
otros a ventas afectas” más el campo
"Seguro" y el campo “Flete”.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Nota: Se excluyen de este campo los
valores calculados para los tributos de uso
informativo C5, C6 y C7.
Deberá indicar la suma de los valores
contenidos en el campo "Cargos / Abonos
que no afectan la base imponible”.
Se deberá calcular el total de los abonos a
Total favor del receptor (resta) y/o los cargos
resum efectuados al receptor (suma) que no
Cargos / ; , , ,
en.tot ABEÑOS estén afectos a la base imponible. Requerido FE CCFE
que ” , ,
147 alNo ño alectan para su Numérico 11,2 TC FEXE
Grava la base Cuando no existan "Cargos / Abonos que | transmision
do imponible no afectan la base imponible” deberá
completar con valor $0.00.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Deberá contener el valor total a pagar.
Para CCFE este campo será el resultado
de: “Monto total de la operación” (+/-)
(IVA Percibido”, “IVA Retenido”, “Retención
Renta”, “Total Cargos / Abonos que no
afectan la base imponible”).
on tot Total 2 Requerido FE, CCFE,
148 alPag A Pagar Para FE este campo será el resultado de: para su Numérico 11,2 F FEXE y
ar “Monto total de la operación” (+/-) (IVA | transmisión FSEE
Retenido”, “Retención Renta”, “Total
Cargos / Abonos que no afectan la base
imponible”).
| Para FEXE este campo será el resultado de:
“Monto Total de la Operación” (+/-) “Total
| Cargos/Abonos que no afectan la base
| 71
|

<!-- PAGE 72 / 112 (OCR) -->

z E = EC] © o Ss o
& ro v he] o
81s] 3 || Do 529 cg E 35 || £8
elo 8 e vo De © a a EZ o 5
slo o c aE OTE CE 3 DU = ES
O [07] [eX 0 Eo =O © Do co Oo 3
o M E 5 Sc © oo co o Sa Ú og
zlz| 85 |§5| 2 $5 5 = = |8| de
O) > as O) = wi a
imponible”.
Para FSEE este campo será el resultado de:
‘Sub-Total’ (-) “IVA Retenido” (-) "Retención
Renta”.
Nota: Cuando el campo “Total Cargos /
Abonos que no afectan la base imponible”,
sea mayor al resultado del campo "Monto
total de la operación” en el campo “Total a
pagar” se deberá ingresar $0.00.
Se dará holgura de $ 0.01 ctvs. Hacia arriba
y hacia abajo por diferencias entre los
cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
del cálculo de la A.T.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Deberá contener el valor total a liquidar
que será el resultado de: "Monto total de
la operación” más “IVA - Percibido
resum liquidado”. Requerido
149 entot | A Total para su Numérico 112 F CLE
al Permite un máximo de 11 posiciones en el | transmisión
valor entero. Podrá expresarse desde 1
hasta un máximo de 2 decimales después
del valor entero.
Deberá contener la suma de los campos
resum "IVA Retenido”.
en.tot Total IVA Requerido
150 allVAr | A Eetenido Permite un máximo de 11 posiciones en el para su Numérico 11,2 F CRE
etenid valor entero. Podrá expresarse desde 1 | transmisión
o) hasta un máximo de 2 decimales después
del valor entero.
eu Longitud:
allvAr Valor en Deberá contener el valor del monto total Requerido 200
151 etenid A Letras IVA | del IVA retenido por el emisor agregando para su Numérico Mínimo: 8 | TC CRE
retenido el sufijo USD transmisión Máximo:
oLetr 200
as
Longitud: FE. CORE.
resum 200 NRE
Debera contener el valor total a pagar por Requerido NCE,
en.tot Valor en i” > Mínimo: 8
152 A el receptor en letras agregando el sufijo para su Numérico — TC | NDE, CLE,
alLetr Letras a Maximo:
AE USD. transmisión 200 FEXE,
FSEE,
CDE
Este campo será de uso informativo, no
afectará los valores contenidos en el i
resum documento Requerido
153 en.tot | C IVA 13%: - para su Numérico 11,2 F FE
mu Deberá contener el monto computado del TIGMEPAIÓN
IVA como resultado de: La sumatoria de
72

<!-- PAGE 73 / 112 (OCR) -->

|
|
z 2 = 5D © o 5 ©
e Le 2 2 o o 5 o o > o Xu E e © 2 5
E [8] > Q OQ 5a Sa 2% © 59
sie o c SE 8c E CE 5 50 = En
wn a 0 Em 0 5 © Ei 59 (8) ss
o o E & ou 0 0 co 2 Sa [7] 09g
z z © En > vo o) = = o 5
O) > a O) = Ll a
los campos “IVA por ítem” menos el IVA
que corresponda al descuento global
sobre el total de las operaciones gravadas.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1
| hasta un máximo de 2 decimales después
del valor entero.
| Se dará holgura de $ 0.01 ctvs. Hacia arriba
| y hacia abajo por diferencias entre los
| cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación
| del cálculo de la AT.
| Podrá indicar el saldo a favor (otros
| créditos o pagos) del receptor. Dicho valor
| se registrará en negativo.
me Saldo a Permite un máximo de 11 posiciones en el
154 dorar e Favor valor entero. Podrá expresarse desde 1 Opcional Numérico 11,2 TC | FE, CCFE
or hasta un maximo de 2 decimales después
del valor entero.
Cuando no aplique se deberá llenar con
$0.00
Se deberá indicar la condición de la
operación (Ver catálogo CAT-016
“Condición de la Operación”).
resum FE, CCFE,
en.co Condición _ ; Requerido Mead NCE,
ie Cuando deban indicarse operaciones as Longitud:
155 ndicio | A de la mixtas (parte crédito y parte pa se para su ii 1 F ¡NDECIE
noper Operación deberá elegir la opción 3 - Otra transmisión FEXE y
acion - FSEE
Cuando el receptor posea saldo a favor
deberá seleccionar: 1 - contado.
Deberá seleccionar modalidad de pago
(ver catálogo CAT-017 “Forma de pago”).
Para CCFE, FE, FEXE y FSEE se deberá
completar siempre que se haya ingresado
| en el campo “Condiciones de la
Operación" la opción 1-contado o 3-otro.
Para el CDE, se deberá utilizar si el campo
"Tipo donación” esté llenado con código
1.
| resum Código de Requerido por ss Fg, da
| 156 enpa | c forma de | Notas: tipo de Alfanumérico Long TC PERE:
Ei pago 1. Podrá seleccionar "n” formas de pago. operación CDE
Cuando se detalle más de una forma de
pago deberá ingresarse entre corchetes y ’
separadas por comas.
2. Para el CDE será null cuando el campo
"Tipo de donación” esté llenado con
código 2 0 3.
| 3. Cuando el receptor posea saldo a favor
| debera seleccionar codigo de forma de
| pago 99- otros
73

<!-- PAGE 74 / 112 (OCR) -->

z 2 _ 2 v o o = D
o = Q v o o = o 35
O — — vo 0 E [)) zu o 9 ro
8 hl 9 c a E oc E VE Do 29 = E
wv o ca SEU 2 o 58 [a] Zo
Sle] E | 2 o 25 5 a sE |! 83
(O) o = 80 O) = ih as
Deberá indicar el valor monetario que se
ha aplicado con cada forma de pago
descrita en el campo "Código de forma de
pago”.
Para CCFE, FE, FEXE y FSEE este campo
deberá completarse cuando en el campo
"Condiciones de la Operación" se haya
ingresado la opción 1- Contado o 3- Otro
enpa Monto por Para el CDE, se deberá utilizar si el campo Requerido por FE, CCFE,
157 gosm| C forma de Mu donación” esté lerads con código tipo de Numérico 11,2 TC fie
ontop pago operacion CDE
9 Cuando el campo "Condiciones de la
Operación" esté llenado con la opción 2-
Crédito, el campo "Monto por forma de
pago" deberá completarse con $0.00.
Permite un máximo de 11 posiciones en el
valor entero.
Podrá expresarse desde 1 hasta un
máximo de 2 decimales después del valor
entero.
Contendrá el número de referencia de
cada modalidad de pago.
Este campo podrá ser null cuando:
resum Referencia |1. El campo "Tipo donación” esté Opcional . FE, CCFE,
en.pa de completo con la opcion 2 0 3 Longhua FEXE
158 gos.R | C i - Requerido Alfanumérico | máxima F -
modalidad : FSEE y
efere i Ei por Tipo de 50
cia de pago 2. Si la forma de pago es "Billetes y Operación CDE
Monedas" deberá enviar campo con null.
3. Cuando el campo “Condición de la
Operación” esté completo con la opción 2
- a crédito, " deberá enviar campo con null.
Si en el campo "Condiciones de la
resi Operación" se selecciona la opción 02 -
en.pa crédito, deberá contener el tiempo | Requerido por Altamumético | Lonaitua: FE, CCFE,
159 np L C Plazo otorgado, detallando el plazo de acuerdo Tipo de / null a - F FEXE y
gop al catálogo CAT-018 "Plazo’. Operacion FSEE
De no hacer uso del campo ingresar null.
Será requerido si el campo "Condición de
la operación” es a crédito. En este campo
resum se deberá ingresar el número de días,
en.pa . meses o años en que se otorga el plazo. Requerido por _ FE, CCFE,
Período de 4 Numérico / Longitud:
160 gosp | C o Tipo de F FEXE y
: plazo Ejemplo: si el plazo es 6 meses, en este I null 3
eriod np e Operación FSE
o campo se deberá ingresar únicamente el
número 6.
De no hacer uso del campo ingresar null.
resum Numero de Longitud
en.nu Campo destinado para indicar el numero í ad 9 FE, CCFE,
161 Cc Pago — ; Opcional Alfanumérico | máxima | TC
mPag ei de pago electrónico cuando exista (NPE). NDE y
Electrónico 100
oElect FEXE
74

<!-- PAGE 75 / 112 (OCR) -->

| lo) [a re v Ko) Ko) > ho) OC
| a o 2 > © 9 500 co © ERS o co
| 3 = 4 vc 0 2 © Ea ko 23
| a O e) c OE ac E& OE Ko) 20 i= EG
O a a 0 En = 0 ® 50 2 co 5 5
| (| 8 |B G © RE” s° o IE | 8 83
| “18 |g = 88 3 E Ñ| 6°
| ronic
o
| Deberá indicar el código de los términos y
| condiciones pactadas en la exportacion
| para la entrega de las mercancias (Ver
| resum Catálogo CAT 031- INCOTERMS). Requerido por
en.co INCO- ; E. Longitud:
162 dinco c TERMS Será requerido cuando en el campo "Tipo tino de Rimes 2 Te
oe? oo A operación
terms de ítem” se ingresen las opciones 1 0 3.
Será null cuando en el campo “Tipo de
: ítem" se ingrese la opción 2. FEXE
| Deberá colocar la descripción según
resum catálogo CAT 031- “INCOTERMS”.
en.de Descripción , , pu Requerido por Longitud
163 scinc | C INGO. co ps meli mo o Toe jo a Alfanumérico e TC
oterm TERMS 9 P - operación 150
5 Será null cuando en el campo "Tipo de
ítem" se ingrese la opción 2. FEXE
rou Podrá detallar otra observación que desee ;
en.ob ; " Longitud
164 seva | C Observacio | agregar. Opcional Alfanumérico máxima | TE
, nes / null
cone De no hacer uso del campo ingresar null de 500
s Bona FEXE
Sección 10: EXTENSIÓN
Se detalla entre otros los datos generales
10 A/C | Extensión de los responsables de entregar y recibir Reauerido Obieto Longitud:
el documento, esta sección es opcional q J 1
para los DTE exceptuando el DCLE.
exten FE, CCFE,
, Nombre del | Podrá ingresar el nombre de la persona | Opcional(DCL , NRE,
sion.n rt | e Longitud
165 | 10 | ombE | A/C responsable | que entrega el documento electrónico o | E= Requerido | Alfanumérico/ máxima TC NCE,
ntre que Genera | enviar este campo con null. Campo para su null de 100 NDE,
9 el DTE obligatorio para el DCLE. Transmision) CRE, CLE
a
y DCLE
exten Documento Podrá completar documento de Epcional de
sion.d ficación de identificación de quien entrega el (DCLE= Alfanumético/ Longitud NCE
166 | 10 | ocuE | A/C : documento o enviar este campo con null. i máxima | TC ’
quien Requerido null NDE,
ntreg de 25
a genera al Campo es obligatorio para el DCLE paraa CRE, CLE
DTE p 9 P : Transmisión) y DCLE
exten Congo de Podrá indicar el código del responsable de A
ea emplesto efectuar la liquidación a los afiliados Longitud
167 | 10 | odEm | C | responsable - Opcional Alfanumérico máxima TC DCLE
plead , de la x De no hacer uso del campo ingresar null. deis
e) liquidación
Nombra del Podrá ingresar el nombre de la persona FE, CCFE,
exten responsable = ;
sienñ de la responsable de la operación por parte del Alfanumérico/ Longitud NRE,
168 | 10 embR G operación receptor. Opcional nl maxima TC NCE,
— de 100 NDE, CRE
E A De no hacer uso del campo ingresar null. y CLE
75

<!-- PAGE 76 / 112 (OCR) -->

z 2 — 0 @ o 5 D
[a ro = ho) Cc
sls] EII E, = o E E 35 |8] £8
E18 Ie un ves o o 52 | 8] 8%
8 O 2 c Qa E oc E TE © 2 o = ES
(%] 0 En - UE oO © v [O] = |
Z| =z © 0 z 00 9 a = a So
O) > ao O = 2 a
Documento
de iden-
exten tificacion Podrá indicar el documento de FE, CCFE,
siend del identificación del responsable de la Alfaruimatico/ Longitud NRE,
169 | 10 ocuR C | responsable | operación por parte del receptor. Opcional wil maxima | TC NCE,
ecibe de la de 25 NDE, CRE
operación | De no hacer uso del campo ingresar null. y CLE
por parte
del receptor
Deberá ingresar el número de placa del
vehículo del receptor.
exten Aplica para aquellos contribuyentes Requerido por í
sony Placa de emisores que se dediquen a venta de ipo de Alfanumérico Longitud
170 | 10 | lacaV : i : operacion maxima TC | FEy CCFE
" vehiculo combustibles, — lubricantes y otros null
ehicul . de 10
o (gasolineras). (FE=opcional)
Cuando no tenga aplicación, este campo
se deberá completar con null.
exten FE, CCFE,
, Podrá detallar otra observación que desee , NRE,
Sena Obser- agregar ; Alfanumérico Longiug NCE
171 | 10 | bserv | C , - Opcional máxima | TC '
acion vaciones null de 3000 NDE,
De no hacer uso del campo ingresar null. CRE, CLE,
es
y FSEE
Para información propia del emisor.
Cuando aplique, esta sección podrá
1 Cc Sección ingresarse desde 1 hasta un máximo de Opcional Arreglo de Longitud:
apéndice |10 veces completando todos los objeto null 10
campos.
De no hacer uso del campo ingresar null.
Podrá ingresar el nombre del campo que j
apena Nombre del | se está adicionando en el apéndice Longitud
172 | 11 |iceca| C campo - Opcional Alfanumérico máxima | TC TODOS
mpo De no hacer uso del campo ingresar null. de 25
173 | 11 |iceeti| C | Descripción - Opcional Alfanumérico máxima TC | TODOS
musa De no hacer uso del campo ingresar null. deco
apend Podrá ingresar un valor alfanumérico o Longitud
174 | 11 |ice.val | C Valor/Dato | valor monetario. Opcional Alfanumérico máxima TC | TODOS
or De no hacer uso del campo ingresar null. de 150
No es una sección ni un campo de los
documentos tributarios, se incorpora con
la finalidad de hacer del conocimiento al ,
contribuyente que la Administración
Tributaria enviará un código encriptado
175 | 12 A Sello de con ese nombre, por cada documento F TODOS
Recepción | tributario que haya sido correctamente
transmitido.
Deberá incorporar el sello de recepción
enviado por la Administración Tributaria en
el DTE que entregue al receptor
76

<!-- PAGE 77 / 112 (OCR, poco texto) -->

z < — 3 © o 5 2
c re v © o [o
also o D So Soo co E 85 o co
ETS e © 0a De Sa > ET 8 5
8 o o Cc aE ac E VE © o O = ES
[92] a O En = 0 ® 5 © v Oo 3
y E £ r os 00 2 o o O @ ow
Z|lz| 8 | & z 55 3 = = | &| 85
o) > a) O) = re} a
(exceptuando las operaciones generadas
en Contingencia).
Nota: Las columnas “Versión Legible” y "Condición del Campo” pueden tener dos o más valores que se corresponden el primero (indicado sin paréntesis)
a la regla general para los documentos, el resto (indicado entre paréntesis) a las excepciones para documentos a la regla general. Se podrá auxiliar de
la columna “Descripción de contenido del campo” para tal efecto.
77

<!-- PAGE 78 / 112 (OCR, poco texto) -->

— Wii A
conformidad con la Ley
LD | = Serepresentaelcampoconunguion — |
78

<!-- PAGE 79 / 112 (OCR) -->

ANEXO lI
ESTRUCTURA DE DATOS EVENTOS
o | Campo Campos Ld , Condición , ,
JSON del Evento Descripción de Contenido del Campo del Campo Tipo de dato Longitud Evento
IDENTIFICACIÓN DEL EVENTO
1 im A Se deberá ingresar el número de la versión Requerido e Langa: 2 Invalidacion
| acion.ve Version ; para su Numérico Mínimo: 1, i ;
| , vigente. SA Eras Contingencia
| rsion Transmision Maximo: 2
identific Se deberá ingresar el ambiente de trabajo por Requerido Longitud: 2 o
Ambiente el cual se ésta transmitiendo el evento -. CC Invalidación
2 acion.a ; , : para su Alfanumérico Mínimo: 2, ; :
; de Destino | electrónico pudiendo seleccionar 00 - modo e o. Contingencia
mbiente ÍA Transmisión Máximo: 2
de pruebas o 01 - modo de producción.
identific Deberá contener el código de generación
acion.c Código de que cumpla con el estándar del UUID va, el Requerido Longitud: 36 Invalidación
3 odigoG sw cual debe ser unico, con longitud de 32 para su Alfanumérico Mínimo: 36, Contingencia
eneraci dígitos separados por 4 guiones haciendo un | Transmisión Máximo: 36 9
on total de 36 posiciones dividido en 5 grupos.
Debera ingresar la fecha de generacion del
evento, la cual deberá tomarse del sistema
identific Fecha del del conato ame enel momento de Requerido
4 ación.fe evento de 9 - para su Alfanumérico Longitud: 10 Invalidación
cAnula invalidacion im e Se ; Transmision
| La estructura definida es: año, mes y dia
| como se detalla a continuación: YYYY-MM-
| DD.
| Deberá ingresar la fecha de generación del
| evento, la cual deberá tomarse del sistema
identific Fecha del del contribuyente emisor en el momento de ,
. , Requerido
| ación.fT evento de generar dicho evento. Ai NU i ;
| 5 ies : para su Alfanumérico Longitud: 10 Contingencia
| ransmisi contin- Transiisión
| on gencia La estructura definida es: año, mes y día
como se detalla a continuación: YYYY-MM-
| DD.
Deberá ingresar la hora de generación del
identific Hora del evento, la cual deberá tomarse del sistema Requerido
ación.h evento de del contribuyente emisor en el instante de para su Alfanumérico Longitud: 8 Invalidación
orAnula invalidación | generarlo, utilizando esta estructura: hora, | Transmisión
minutos y segundos (HH:MM: SS).
; iB Hora de Deberá ingresar la hora de generación del
identific NE i : :
ol transmision | evento, la cual deberd tomarse del sistema Requerido
acion.h , " ; a , ,
7 Treinerii del evento del contribuyente emisor en el instante de para su Alfanumérico Longitud: 8 Contingencia
sion de contin- generarlo, utilizando esta estructura: hora, | Transmisión
gencia minutos y segundos (HH:MM: SS).
IDENTIFICACIÓN DEL EMISOR
emisor NIT Requerido Longitud:14 |. validación
nit - (Emison: Deberá de contener el NIT sin guiones. para su Alfanumérico Mínimo: 9 Contingencia
- Transmisión Máximo: 14 9
Nombre,
denomina- Lonaitud:
, cion o Deberá contener el nombre, denominación o Requerido qua e
emisor. ji . : ; ; : Sr 250 Invalidación
razón social | razón social del contribuyente emisor, tal cual para su Alfanumérico E ; ;
nombre " iy ? IA Mínimo: 1 Contingencia
del contri- aparezca en la última tarjeta de NRC. Transmisión ira.
Máximo: 250
buyente
(Emisor)
emisor Nombre del
nombre responsable | Deberá ingresar el nombre de la persona Requerido Loñaltud
10 del responsable del establecimiento que informa para su Alfanumérico ong , Contingencia
Respons i NE máxima: 100
estableci- el evento. Transmisión
able ;
miento
|
| 79
|
|
|
|
|

<!-- PAGE 80 / 112 (OCR) -->

o | Campo Campos ind 2 Condición , i
JSON del Evento Descripción de Contenido del Campo del Campo Tipo de dato Longitud Evento
emisor.t Tipo de Deberá colocar el código de documento de ,
: , A A Requerido
ipoDoc documento | identificacion de la persona que informa el i a , ,
11 R : i : , 2 para su Alfanumérico Longitud: 2 Contingencia
espons de iden- evento de contingencia (según catálogo Transmisión
able tificación CAT-022 "Tipo de documento de receptor”).
emisor. Número de
numero Deberá colocar el número del documento de Requerido ;
documento | . e , Longitud , ;
12 | DocRes i identificación de la persona que informa el para su Alfanumérico a. Contingencia
de iden- " ; SA máxima: 25
ponsabl A evento de contingencia. Transmisión
e tificación
Deberá ingresar el código de tipo de
establecimiento en el que se emite el DTE
emisor.t tipo de (ver — catálogo CAT-009 “Tipo de ,
q i e E Requerido iden
ipoEstab estableci- establecimiento”). Po MU Invalidación
13 A " para su Alfanumérico Longitud: 2 , ;
lecimien miento le A Contingencia
, , , Transmisión
to (emisor) Para el caso del evento de contingencia
corresponde al establecimiento donde
ocurrió la contingencia.
emisor. Nombre de | Deberá ingresar el nombre de la casa matriz, i Longitud:
" " A . Requerido
14 nomeEst estableci- sucursal/agencia,  predio/patio, bodega, e 150 e
NA , , : ; , para su Alfanumérico PE Invalidación
ablecimi miento según aplique, del contribuyente emisor Transmisión Mínimo: 1
ento (Emisor) donde se genera el evento de invalidación. Máximo: 150
Podrá ingresar el código de la casa matriz /
Código del | Sucursal / Agencia / Bodega /Predio y/o
emisor. estableci- patio/Otro que la Administración Tributaria le Longitud 4 daria
. N . ‘os ql Invalidacion
15 | codEsta miento asigne. Opcional Alfanumérico Mínimo: 4 Contingencia
bleMH Asignado Máximo: 4 9
por el MH Nota: Por el momento podrá enviarlo con
null.
Codigo del Podra incorporar el código que el
CBI contribuyente posea internamente de la casa
; A matriz, sucursal / agencia, predio/patio, _—
emisor. miento , , Longitud: 10
: bodega, según aplique, desde donde se i Alfanumérico de irramos elect
16 | codEsta asignado TEA Opcional Mínimo: 1, Invalidación
genera el evento de invalidación. null AD
ble por el Máximo: 10
comin: Nota: Cuando no posea codigo interno
yente A ;
debera enviarlo con null.
Codigo de Podrá incorporar el código asignado por la
identificació Administración Tributaria para el punto de
" venta donde se genera el documento "
emisor. n del Punto A e en Longitud 4 —
17 electrónico. Este código sera informado , e E Invalidación
codPunt de Venta e Ta , ; : Opcional Alfanumérico Mínimo: 4 i ;
; cuando la Administracion Tributaria lo asigne. 0 Contingencia
oVenta (Emisor) Maximo: 4
Asignado Nota: Por el momento, deberá enviar con
por el MH
null.
Código del
Punto de Podrá incorporar el código del punto de
N Venta venta donde se genera el documento darte
emisor. i " : $ wl Longitud: 15
(Emisor) electronico que el emisor lleva internamente. ; Alfanumérico e ali
18 | codPunt ; Opcional Mínimo: 1, Invalidación
Asignado null chris
oVenta . ad Máximo: 15
porel Cuando el emisor no posea código de punto
contri- de venta este campo se completará con null.
buyente
emisor.t Teléfono Deberá incorporar el número de teléfono del Requerido - Longkud 30 Invalidacion
19 N a para su Alfanumérico mínimo 8 : A
elefono (Emisor) establecimiento donde se genera el evento. CA di Contingencia
Transmisión máximo 30
emisor. Coneo Deberá incorporar el correo electrónico del Requerido os Longitud Invalidación
20 electrónico ford para su Alfanumérico A. ; ;
correo : establecimiento donde se genera el evento. a maxima: 100 Contingencia
(Emisor) Transmision
Seccion 3:
INFORMACION DEL DTE EN CONTINGENCIA
80

<!-- PAGE 81 / 112 (OCR) -->

|
| o | Campo Campos —_ ; Condición . ,
N JSON del Evento Descripción de Contenido del Campo del Campo Tipo de dato Longitud Evento
En este campo se hará referencia a las filas de
los documentos generados en contingencia,
por lo que deberá contener una numeración
secuencial iniciando en 1 hasta un máximo de
1000 ítems. 1
detalleD . 6 , Requerido
21 | TE.nolte N° de item NOTA: En cada fem se debers detslar un para su Numérico Longitud: 4 Contingencia
documento generado en contingencia, A
m . l fon Transmision
pudiendo informar hasta un maximo de
10001
En caso se requiera informar más de 1000 !
documentos se deberá generar un nuevo
evento de contingencia.
Se deberá colocar el código del tipo de
documento electrónico generado en
= Tipo de contingencia de acuerdo a codificación
detalleD da según catálogo CAT-023 ‘Tipo de Requerido Longitud: 2
22 TE.tipo ; Documento en Contingencia”. para su Alfanumérico Mínimo: 2, Contingencia
en contin- E. Sra.
Doc encía Transmisión Máximo: 2
: 9 Se podrán emitir en contingencia los
siguientes documentos: 01-FE, 03-CCFE,05-
NCE, 06-NDE, 04-NRE, 11-FEXE y 14-FSEE.
Deberá incorporar el código de generación
de cada uno de los documentos emitidos en
detalleD | Código de | EOMingencia. Longitud: 36
TE.codi Generación , Requendo , ,
23 y Debe cumplir con el estándar del UUID v4, para su Alfanumérico PE Contingencia
goGene del iad Ii Mínimo: 36,
; que debe ser único por documento, con una | Transmisión lata
racion documento : i Maximo: 36
longitud de 32 dígitos separados por 4
guiones haciendo un total de 36 posiciones
dividido en 5 grupos.
MOTIVO DE LA CONTINGENCIA
Deberá detallar la fecha en que inició la
metivos Fecha inicio | contingencia. Requerido
24 in de Contin- para su Alfanumérico Longitud: 10 Contingencia
Inicio . _ = d IA
gencia La estructura definida es: año, mes y día, en | Transmisión
el siguiente formato: YYYY-MM-DD.
Deberá detallar la fecha en que finalizó la
motivo.f Fecha fin de | contingencia. Requerido
25 Fin - Contin- para su Alfanumérico Longitud: 10 Contingencia
gencia La estructura definida es: año, mes y día, en | Transmisión
el siguiente formato: YYYY-MM-DD.
Deberá detallar la hora en que inició la
motivo Hora inicio | contingencia. Requerido
26 i de Contin- para su Alfanumérico Longitud: 8 Contingencia
hinicio : E , , A
gencia La estructura es la siguiente: hora, minutos y | Transmisión
segundos (HH:MM:SS). En formato 24hr.
Deberá detallar la hora en que finalizó la
motivo Hora fin de | contingencia. Requerido
27 hFin - Contin- para su Alfanumérico Longitud: 8 Contingencia
gencia La estructura es la siguiente: hora, minutos y | Transmisión
segundos (HH:MM:SS). En formato 24hr.
. N Deberá seleccionar cualquiera de las 5 ;
motivo.t Tipo de opciones que aplique según el motivo de la Requerido
28 | ipoCont Contin- pe a Bute seg Mey para su Numeérico Longitud: 1 Contingencia
M , " contingencia (ver catálogo CAT-005 "Tipo de NA
ingencia gencia y ne Transmision
Contingencia”).
1 Control de Cambios No. 1.1 Modificación 4 de junio de 2024
81

<!-- PAGE 82 / 112 (OCR) -->

o | Campo Campos rr , Condición ,
JSON del Everto Descripción de Contenido del Campo del Campo Tipo de dato Longitud Evento
En este campo explicará la razón de la
contingencia.
Si el contribuyente emisor seleccionó la
motivo. Motivo de opción 5 deberá obligatoriamente especificar Requerido Longitud:
motivo , la razón de contingencia, tendrá un máximo N e 500 , ,
29 A Contin- por Tipo de Alfanumérico "¡co Contingencia
Conting ; de 500 caracteres. - Mínimo: 1
: gencia Operación eo
encia Maximo: 500
Podra enviar campo null siempre que haya
elegido motivo de contingencia diferente a 5
(Según catálogo CAT-005 ‘Tipo de
Contingencia”).
DETALLE DEL DTE A INVALIDAR
docume Tipo de Se deberá indicar el código del documento a Requerido Longitud: 2
30 | nto.tipo DTE a Invalidar según catálogo: CAT-002 “Tipo de para su Alfanumérico Mínimo: 2, Invalidación
Dte Invalidar Documento”. Transmisión Máximo: 2
Se deberá ingresar el código de generación
del documento a invalidar.
facing Codigo gs Debera enviar un codigo de generacion por Requerido
nto.codi | generacion Co e MU a
31 evento de invalidacion. para su Alfanumérico Longitud: 36 Invalidación
goGene del DTE a LA
; , ; Transmisión
racion invalidar .
Nota:
El documento a invalidar debe poseer sello
de recepción.
docume Sella de ai A Requerido Longitud: 40
nto.sello recepción Deberá ingresar el sello de recepción a e diario
32 e ; li para su Alfanumérico Mínimo: 40, Invalidación
Recibid del DTE a contenido en el DTE a invalidar. A dm.
; Transmisión Máximo: 40
e) Invalidar
docume | Número de ,
sd , Requerido
33 nto.num | control del | Deberá ingresar el numero de control para su Altenumético Longitud: 31 invelidación
eroCont DTE a contenido en el DTE a invalidar. AA -
: Transmisión
rol Invalidar
Fecha de ,
dogume generacion | Deberd ingresar la fecha de generacion Requengo
34 nto.fecE del DTE a contenida en el DTE ainvalidar: parasu Alfanumérico Longitud: 10 Invalidación
mi i Transmisión
Invalidar
Deberá ingresar el valor del campo "Monto
total de la operación” del DTE a invalidar
(aplica sólo a CCFE, FE y FEXE).
Cuando los documentos a invalidar sean
diferentes a CCFE, FE, y FEXE este campo
Monto total | podrá enviarlo con 0.00.
docume de la Requerido
35 nto.mo operacion Permite un maximo de 11 posiciones en el por Tipo de Numérico 11,2 Invalidación
nto del DTE a valor entero. Podrá expresarse desde 1 hasta Operación
Invalidar un máximo de 2 decimales después del valor
entero.
Permite un máximo de 11 posiciones en el
valor entero. Podrá expresarse desde 1 hasta
un máximo de 2 decimales después del valor
entero.
82

<!-- PAGE 83 / 112 (OCR) -->

|
|
|
| N° campo Campos Descripción de Contenido del Campo Condición Tipo de dato Longitud Evento
| JSON | del Evento del Campo
| Deberá completar este campo cuando el
campo ‘Tipo de invalidación” se encuentre
Código de lleno con el código 1 0 3. Por lo que previo al
decuma generación | envío del evento de invalidación, el
nto.codi del contribuyente deberá emitir un nuevo Requerido
36 - documento | documento que sustituya al DTE a invalidar. por Tipo de Alfanumérico Longitud: 36 Invalidación
goGene ia y
| racionR que Se exceptua de esta condicion la NCE y CLE. Operacion
| reemplaza
| al invalidado | Cuando la causa de la invalidación sea por
| rescisión de la operación realizada, este
| campo se llenará con null.
Deberá seleccionar codificación de acuerdo
| Tipo de a catálogo CAT-022 “Tipo de documento del
| docume 2 ¡ third
| nto tipo documento | receptor”. Requerido Longitud: 2
| 37 | pecum de iden- para su Numérico Mínimo: 2, Invalidación
| ento tificación Nota: Transmisión Máximo: 2
| (Receptor) Se ingresará la opción 13-DUI para el caso de
| < las personas naturales no inscritas en IVA.
- Deberá ingresar número de documento de
, identificación (Receptor) contenido en el DTE
| docume | Número de ; :
| a invalidar. ,
| nto. documento Requerido ;
, Gi Longitud rr
38 | numDo de Identi- Nota: para su Alfanumérico máxima: 20 Invalidación
cument ficación , A Transmisión -
Se ingresará null cuando la FE a invalidar no
o (Receptor) A
contenga número de documento de
identificación (Receptor).
Nombre,
denomina- Lenta:
docume ción o Deberá contener el nombre, denominación o Requerido >. -
39 nto.no razón social | razón social del contribuyente receptor del para su Alfanumérico Mínimo: 1 Invalidación
| mbre del con- DTE a invalidar. Transmisión Máximo: 200
| tribuyente -
| (Receptor)
docume Teléfono Podrá incorporar el número de teléfono del Longitud 30
40 | nto.telef receptor e ingresar hasta 3 números Opcional Alfanumérico mínimo 8 Invalidación
(Receptor)
ono separados por coma. máximo 30
docume Correo Podrá incorporar el correo electrónico del onatud
41 | nto.corr | electrónico | contribuyente receptor. Dicho correo deberá Opcional Alfanumérico ri 100 Invalidación
eo (Receptor) tener un dominio vigente. -
MOTIVO DE LA INVALIDACIÓN
motivo. Tino de Debe indicar el motivo por el cual está Requerido
| 42 | tipoAnul a invalidando el DTE según catálogo CAT-024 para su Numérico Longitud: 1 Invalidación
| acion "Tipo de invalidación”. Transmisión
| motivo. En este campo el contribuyente debera Requerido Longitud:
| 43 motivoA Motivo de describir el o los campos donde se encuentra ue su Alfanumérico 200 Invalidación
| nulacio Invalidación | el error que ocasiona el evento de e to Mínimo: 1
| n invalidacion. Maximo: 200
| motivo. de +. Reduerido Longitud:
| nombre ; ; Deberá ingresar el nombre de la persona q ei 100 duró
44 invalidar el N , para su Alfanumérico Pa Invalidación
Respons responsable de invalidar el DTE. o Mínimo: 1
| documento Transmision A
able Emisor Máximo: 100
| Tipo de
| motivo. documento Deberá seleccionar la codificación de Requerido
| 45 aon identifica- acuerdo a estao are ps Je para su Numérico Longitud: 1 Invalidación
P ción del , A Transmisión
ble responsable de invalidar el documento.
responsable
de Invalidar
83

<!-- PAGE 84 / 112 (OCR) -->

o | Campo Campos _— " Condicion ; ,
JSON del Evento Descripción de Contenido del Campo del Campo Tipo de dato Longitud
el
documento
(Emisor)
Número de
melo documento Deberá colocar el número de documento de Requerido Longitud: 14
numDo de ; RA 7 : A. — Mante
46 e identificación del responsable de invalidar el para su Alfanumérico Mínimo: 1 Invalidación
cRespo Identifica- , Co eo
ip documento (Emisor). Transmision Maximo: 14
nsable cion
(Emisor)
Nombre de a
¿ - ; Longitud:
motivo. quien o Requerido
in Deberá ingresar el nombre de la persona e 100 Co
47 | nombre solicita í A“. i para su Alfanumérico dolia Invalidación
o ; ; quien solicita invalidar el DTE. Ce Minimo: 1
Solicita invalidar el Transmision co ,
Máximo: 100
documento
Documento
de
motivo. Lente Deberá seleccionar codificación de acuerdo Requerido
48 | tipDocs (er a catálogo CAT-022 "Tipo de documento de para su Numérico Longitud: 1 Invalidación
olicita que identificación”. Transmisión
solicita
Invalidar el
documento
Número de
Identifica-
motivo. ción de Deberá ingresar el número de documento de Requerido Longitud: 14
49 | numDo quien identificación de quien solicita invalidar el para su Alfanumérico Mínimo: 1 Invalidación
cSolicita solicita DTE (receptor). Transmision Máximo: 14
Invalidar el
documento
*SELLO DE RECEPCION
No es una sección ni un campo de los
eventos, se incorpora con la finalidad de
50 hacer del conocimiento al contribuyente que Invalidación
la Administración Tributaria enviará un código Contingencia
encriptado con ese nombre, por cada evento
que haya sido correctamente transmitido.
84

<!-- PAGE 85 / 112 (OCR) -->

| ANEXO IV
VALIDACIONES PARA CAMPOS DTE
| Sección obligatoria incluida en todas las estructuras, donde se detallan las generales del documento que se está generando.
1. Campo requerido, se valida que ingrese el número de la versión JSON vigente por tipo de
1 Versión documento autorizada por la AT, número entero sin cero ni punto a la derecha. Versión de | TODOS
conformidad a indicaciones del campo 1 de cuadro “Estructura de datos DTE"
1. Campo requerido, se valida que campo contenga código según codificación asignada en
, catálogo CAT-001 Ambiente de Destino.
2 Amia de TODOS
00-Cuando se encuentre en Modo de pruebas.
01-Cuando se encuentre en Modo productivo.
Documento generando según catálogo CAT-002-Tipo de Documento.
1. Campo requerido, alfanumérico se valida la estructura definida por la A.T. con una longitud de
31 caracteres (las siglas DTE + código de tipo de documento + 8 dígitos alfanumérico para | TODOS
4 Número de describir código de sucursal o casa matriz y código punto de venta +15 dígitos).
Control
al 31 de diciembre.
1. Campo requerido, se valida que este código de generación sea único por documento longitud
Código de máxima de 36 dígitos incluyendo guiones. Debe cumplir con la estructura definida por la AT,
5 * UUID v4. TODOS
Generación
Nota: Se valida que la estructura tenga números y letras mayúsculas.
según CAT-003 Modelo de Facturación.
Modelo de FE, CCFE,
Facturación 2. Únicamente podrá utilizar "Modelo de Facturación Diferido” (Opción 2), con campo “tipo de | NRE, NCE,
transmisión” 2- “transmisión por contingencia”. NDE, FSEE,
FEXE
| con catálogo CAT-004 Tipo de Transmisión.
7 Tipo de FE, CCFE,
| Transmision 2. Únicamente podrá utilizar la opción 2-Transmision por contingencia con modelo de | NRE, NCE,
| transmision diferido. NDE, FEXE,
FSEE
| FE, CCFE,
| 1. Se valida condición: Si en el campo el “Tipo de transmisión” selecciona 1” transmisión normal”, | NRE, NCE,
| “Tipo de contingencia” será campo nul. NDE, FSEE,
| FEXE
| 2. Se valida condición: Si campo “Ti ision” i ión 2- isió FE COPE.
: : po Tipo de transmisión se selecciona la opción 2-transmisión por NRE. NCE
| Tipo de contingencia, debe elegir el tipo de contingencia según catálogo CAT-005 Tipo de Contingencia NDE FSEE
Contingencia (Del 1 al 5). FEXE
FE, CCFE,
3. Únicamente será permitido tipo de contingencia de acuerdo a codificación establecida en | NRE, NCE,
catálogo CAT-005 Tipo de Contingencia. NDE, FSEE,
FEXE
FE, CCFE,
1. Será requerido si campo “Tipo de transmisión” esta completo con la opción 2 transmisión por | NRE, NCE,
contingencia y campo “Tipo de contingencia” contiene la opción 5- Otro motivo. NDE, FSEE,
FEXE
FE, CCFE,
Motivo de 2. Se podrá ingresar null si en el campo el “Tipo de transmisión” selecciona 1” transmisión | NRE, NCE,
Contingencia normal. NDE, FSEE,
FEXE
3. Se podrá ingresar null, cuando se trasmita en contingencia y campo Tipo de contingencia NRE. NCE
contiene una opción diferente a 5-otro (es decir que se ingrese tipo de contingencia con las NDE FSEÉ
opciones del 1 al 4). FEXE '
85

<!-- PAGE 86 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
us 4. Cuando el documento a generar sea CRE debe enviar este campo con null.
1. Campo Requerido con formato de fecha YYYY-MM-DD TODOS
Fecha de
10 IG 2. Se podrán transmitir con tolerancia de un día posterior con respecto a la fecha actual en casos | TODOS,
Generación p
especiales. Esta condición no aplicará en el último día del período tributario, para este caso | exceptuando
deberá colocar la fecha actual de la operación. FSEE
1. Campo requerido, se valida que cumpla con la estructura de hora de generación de la TODOS
Hora de operación de los documentos. Formato HH:MM:SS
11 CANsIación 2. Para el último día del mes se tendrá una holgura de 30 min posteriores a la generación del
documento por posibles diferencias entre la hora del contribuyente y la hora del sistema de la | TODOS
AT.
Tipo de , dad
1. Campo requerido se valida tipo de moneda USD. TODOS
Sección 2: DOCUMENTOS RELACIONADOS
Este apartado deberá llenarse si existiere documento a relacionar, de lo contrario está información se completará con null.
Cuando aplique podrá relacionarse un máximo de 50 documentos detallando la sección completa desde campo 13 tipo
documento relacionado hasta campo 16 Fecha generación documento relacionado, por cada documento relacionado.
1. Cuando no se requiera relacionar un DTE previamente emitido deberá ingresar en este campo | FE, CCFE,
la palabra null. NRE
2. Si la operación lo requiere deberá contener código identificador del Tipo de Documento que | FE, CCFE,
se está relacionando. NRE
Tipo de ir " o FE, CCFE,
Documento 3. Se permitirá hasta máximo de 50 documentos cumpliendo con la condición que los NRE. NCE
13 Tributario documentos relacionados deben ser del mismo tipo en un mismo DTE. NDE '
Relacionado FE CCFE
4. Permitirá relacionar documentos ya sean estos generados de forma física y de forma NRE NCE
electronica de manera conjunta o separada. NDE !
5. Este campo sera obligatorio (es decir siempre debe referenciar el documento campo no puede NCE. NDE
ser null). '
1. Se valida campo null (cuando no se relacione ningún documento para la generación de otro | FE, CCFE,
DTE). NRE
2. Será válido únicamente codificación de acuerdo a catálogo tipo de generación (1. Físico ó 2. NCE. NDE
Tipo de Electronico). NRE. '
Generación del FE CCFE
14 Co we 3. Campo requerido, solo si el campo "Tipo de Documento Tributario Relacionado" esta lleno. NRE, NCE,
ND
relacionado E
4. Este campo será obligatorio. NCE, NDE
FE, CCFE,
5. Este campo podrá ingresar desde 1 hasta un máximo de 50 veces. NRE, NCE,
NDE,
1. Permitirá el ingreso de códigos de generación de documentos generados electrónicamente y TODOS
correlativos de documentos generados en físico.
2. Solo se podrán relacionar documentos del mismo tipo, por ejemplo: Si se relaciona en una | FE, CCFE,
Nota de Crédito Electrónica, varios Comprobantes de Crédito Fiscal, tanto los códigos de | NRE, NCE,
generación o números correlativos descritos deberán corresponder a CCF. NDE
Número de FE, CCFE,
15 | documento 3. No se pueden relacionar documentos electrónicos con estado de invalidados o rechazados. | NRE, NCE,
relacionado NDE
4. Para FE y CCFE podrá relacionar NR o DCL que aún no hayan obtenido el sello de recepción. | FE, CCFE
5. Cuando no exista un documento a relacionar para la generación del DTE deberá enviar este | FE, CCFE,
campo con null. NRE
6. Número de documento relacionado será requerido. NCE, NDE
86

<!-- PAGE 87 / 112 (OCR) -->

| CAMPO VALIDACIONES PARA CAMPOS DTE
| FE, CCFE,
| 7. Podrá ingresar desde 1 hasta un máximo de 50 documentos. NRE, NCE,
| NDE
1. Deberá de indicar la fecha de emisión del documento relacionado, en el siguiente formato:
NRE, NCE,
| YYYY-MM-DD.
NDE
| 2. Debe cumplir con plazos para fecha establecidos por la AT:
|
| a) Si se genera una FE o un CCFE relacionando una NR, la FE o el CCFE deberá generarse en
el mismo periodo tributario en que se generó la NR, o a más tardar dentro de 3 días siguientes a
dicho periodo.
b) Si se genera una FE o un CCFE relacionando un DCL, la FE o el CCFE debe ser generado
en el mismo periodo tributario en el que fue emitido el DCL. FE, CCFE,
Fecha de NRE, NCE,
16 Generación del | c) Si se genera una NCE o NDE relacionando un CCF, la NCE o NDE deberá generarse a más | NDE
Documento tardar dentro de 3 meses posteriores a la generación del CCF, salvo en las excepciones legales.
¢ Relacionado
For d) Si se genera una NCE o NDE relacionando un CR, la NCE o NDE debera generarse dentro
x del mismo periodo tributario.
e) Si se genera una NRE relacionando un CCF o una F, podrá generar la NRE dentro de 6
meses siguientes a la emisión del CCF o F.
FE, CCFE,
3. Deberá ingresar la fecha en que ha sido generado el documento relacionado. NRE, NCE,
NDE
FE, CCFE,
4. Este campo podrá ingresar hasta desde 1 hasta un máximo de 50 veces. NRE, NCE,
NDE
Sección 3: EMISOR
Contiene la información del emisor del DTE. Para el caso del CRE el emisor es el Agente de Retención; para el CLE, es el
Comisionista; para el DCLE, es el Agente Perceptor; para la FEXE, es el Exportador; para el CDE, es el Donatario.
TODOS
1. Campo requerido NIT debe estar Registrado como contribuyente IVA activo según RUC.
CDE
TODOS
17 NIT (Emisor) 2. Contribuyente debe estar acreditado como emisor de DTE. exceptuando
CDE
TODOS
3. Longitud de estructura de NIT será de 9 o 14 dígitos sin guiones ni otros caracteres especiales. | exceptuando
CDE
Tipo de
documento de ne , e
18 identificación 1.Para efecto de CDE únicamente se ingresará el código 36-NIT. CDE
(Donatario)
Número de | 1. Se valida NIT activo, con longitud de estructura de NIT. 9 dígitos o 14 dígitos.
19 documento de
Identificación | 2. Se valida vigencia de informe de Donaciones CDE
(Donatario)
1. Se valida NRC activo con respecto a NIT, (que el NRC corresponda al NIT descrito), sin guion TODOS
, ni ceros a la izquierda.
20 | NRC (Emisor) [> Podrá enviar campo con null, cuando el agente de retención no posea NRC activo.
3. Se valida campo null. FSEE, CDE
Nombre,
denomina-
ción o razón 1. Campo requerido, que detalle el Nombre, denominación o razón social del contribuyente
21 h ; TODOS
social del emisor.
contribuyente
(Emisor)
87

<!-- PAGE 88 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
cacas 1. Campo Requerido, Debe contener código de una de las tres actividades económicas según
22 E PU Registro Único de Contribuyente (RUC), bajo la cual el contribuyente emisor está realizando la | TODOS
conómica wi dama " : ol - or
Emisod operación (codificación de acuerdo a catálogo 019 Código de Actividad Económica).
Actividad 1. Campo requerido, que describa la actividad económica detallada en campo “Código de
23 | Económica - Campo Tened: que de: p 9 TODOS
Actividad Económica (Emisor)
(Emisor)
Nombre TODOS
24 Comercial 1. Campo opcional, podrá ingresar el nombre comercial del contribuyente. exceptuando
(Emisor) FSEE
Tipo de ; ' Me , ee , , y TODOS
25 establecimient 1 Campo requerido, únicamente aceptará codificación según catálogo CAT-009 Tipo de exceptuando
: Establecimiento.
o (Emisor) FSEE
Direccion ; ña i — ; 7
1. Campo requerido, únicamente se valida codificación de Departamento según catálogo
26 | Departamento —— , , TODOS
Eisen (codificación del 01 al 14 según catálogo 012 Departamento).
Dirección 1. Campo requerido, únicamente se valida codificación de Municipio según catálogo CAT-013
27 | Municipio » Campo rea , PIO seg 9 TODOS
. Municipio.
(Emisor)
Dirección 1. Campo requerido que describa el complemente de la dirección donde está ubicado el
28 complemento y po req q P TODOS
i establecimiento.
(Emisor)
Teléfono , , , PU MU
29 (Emisor) 1. Campo requerido, tendrá una longitud mínima de 8 y máxima de 30 caracteres. TODOS
Correo
30 | electrónico 1. Campo requerido, Estructura de correo electrónico con dominio de nivel superior valido. TODOS
(Emisor)
Código del TODOS
3 establecimient | 1. Este campo es opcional, deberá ingresar el tipo de establecimiento que le asigne el MH cuando BREE EI
o asignado por | sea otorgado. pi NDE
el MH y
Código del
establecimient ; ; , e o PU , TODOS
, 1. Este campo es opcional, cuando desee ingresar información deberá ingresar el código de tipo
32 o asignado por e a , , exceptuando
de establecimiento que utilice el contribuyente internamente.
el NCE y NDE
contribuyente.
Código del
Punto de Venta $ AU Uli TODOS
33 Ernison L Sn opcional, cuando se otorgue debera ingresar el codigo del punto de venta que exceptuando
asignado por el 9 - NCE y NDE
MH
Código del
Punto de Venta . , lA , ai TODOS
A 1. Este campo es opcional, cuando requiera ingresar información deberá colocar el código de
sa temiso tipo de establecimiento que utilice el contribuyente internamente excopwango
asignado por el | *P q Y : NCE y NDE
contribuyente
1. Campo requerido, deberá seleccionar codificación de acuerdo a catálogo del tipo item que FEXE
está exportando. Ver catálogo: CAT-011 Tipo de Ítem.
35 Tipo de ítem
2. Únicamente se permitirá para la FEXE las opciones: 1. Bienes, 2. Servicios y 3. Ambos FEXE
1. Campo requerido, cuando en campo "Tipo de item” se escojan las opciones 1. Bienes o 3 FEXE
, , Ambos, deberá seleccionar codificación de acuerdo a catálogo CAT-027 Recinto fiscal.
36 Recinto fiscal = — e — -
2. Cuando en "Tipo de ítem” ingrese la opción 2. Servicios deberá completar este campo con FEXE
null.
1. Campo requerido cuando en campo ‘Tipo de item” se escojan las opciones 1. Bienes o 3 FEXE
37 Régimen de Ambos, deberá seleccionar codificación de acuerdo a catálogo CAT-027 Régimen.
exportación 2. Cuando en "Tipo de ítem” ingrese la opción 2. Servicios deberá completar este campo con FEXE
null.
88 |

<!-- PAGE 89 / 112 (OCR) -->

|
| CAMPO VALIDACIONES PARA CAMPOS DTE
| Sección 4: RECEPTOR
| Contiene la informacion del Receptor del DTE. Para el caso del CRE el receptor es el sujeto de Retención; para el CLE, es el
| Mandante; para el DCLE, es el Afiliado; para el CDE, es el Donante, para FSE, es el Sujeto Excluido.
| 1. Deberá seleccionar codificación de acuerdo a catálogo CAT-022 Tipo de documento de a
| Tipo de receptor. CDE, FSEE
| 3g | documento de | 2. Se valida campo null cuando monto total de la operación sea menor a $1095.00
| identificación | 3, Sera requerido cuando monto total de la operación sea igual o mayor a $1095.00
| (Receptor) FE NRE
| 5. Se ingresará la opción 13-DUI para el caso de las personas naturales no inscritas en IVA. FSEE !
| dis: vo ——_ iy NRE, CRE,
| 1. Se valida numero de documento de identificacion del receptor con una longitud maxima de FEXÉ, FSE
| “ 20 dígitos. CDE
Amero de 2. Cuando aplique número de documento de identificación del receptor con una longitud
documento de FE
39 am maxima de 20 digitos.
Identificación: :
(Receptor) -- 3. Se valida campo null cuando monto total de la operación sea menor a $1095.00
4. Sera requerido cuando monto total de la operación sea igual o mayora $1095.00
| 5. Cuando seleccione la opción (36-NIT) deberá validar que NIT este con estado activo y cumplir | FE, NRE,
| con longitud de estructura de NIT. Sin guiones ni otros caracteres especiales. CRE, CDE
| CCFE, NCE,
1. Campo requerido, NIT debe estar Registrado como contribuyente IVA activo segun RUC NDE, CLE,
DCLE
| 40 | NIT (Receptor) CCFE, NCE,
2. Longitud de estructura de NIT sin guiones ni otros caracteres especiales. NDE, CLE,
|
| DCLE
| 1. Campo opcional, cuando se complete debe corresponderse con el NIT descrito, sin guion ni | FE, CDE,
ceros a la izquierda. NRE,
|
| 41 | NRC (Receptor) | 2. Se valida campo null si NIT de contribuyente receptor no posee NRC.
| 3. Campo requerido, se valida NRC activo con respecto al NIT descrito, sin guion ni ceros a la NE CRE y
| izquierda. DCLE, CLE
| Nombre, TODOS
| denominación | 1. Campo requerido (excepto FE<
| 42 | © razón social $1095.00)
| del , lA i
contribuyente 2. Zar e mi Cuando el monto total de la operación sea igual o mayor a $1095.00, de lo FE
| (Receptor) o podrá ser null.
NU , oy ; . | TODOS
1. Debe contener Código de cualquiera de las Actividades Económicas contenidas según
| Código de excepto
g catálogo, del contribuyente receptor. FEXÉ
43 Actividad —
Económica 2. Podrá ingresar campo null. FE, FSEE
(Receptor) 3. Podrá ingresar null cuando en el campo domicilio fiscal se complete con la opción 2 (no CDE
| domiciliado).
1. Campo requerido, debe describir la actividad económica ingresada en campo código de TODOS
Actividad actividad económica.
44 | Económica 2. Podrá ingresar campo null FE, FSEE
(Receptor) 3. Podrá ingresar null cuando en el campo domicilio fiscal se complete con la opción 2 (no | cor
| domiciliado).
Nombre CCFE, NRE,
| , J. ; NCE, NDE,
45 Comercial 1. Podrá ingresar su nombre comercial.
(Receptor) CRE, DCLE,
| : CLE, FEXE
| Tipo de
| establecimient | 2. Campo requerido, únicamente aceptará codificación según catálogo CAT-009 Tipo de
| 46 i a DCLE
o del afiliado Establecimiento.
| (RECEPTOR)
Direccion TODOS
| 47 | Departamento | 1. Debe ingresar Departamento según catálogo CAT-012 Departamento. exceptuando
| (Receptor) FEXE
|
89

<!-- PAGE 90 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
2. Podrá ingresar campo null cuando el monto total de la operación sea mayor o igual a $ 1095.00
3. Podrá ser null cuando el donante sea no domiciliado.
TODOS
, , 1. Debe ingresar Municipio según catálogo CAT-013 Municipio. exceptuando
Dirección FEXE
48 | Municipio _
(Receptor) 2. Podrá ingresar campo null.
3. Podrá ser null cuando el donante sea no domiciliado.
, Bp 1. Cuando aplique debe ingresar dirección complemento. TODOS
Dirección
49 | Complemento | 2. Podrá ingresar campo null.
(Receptor)
3. Podrá ser null cuando el donante sea no domiciliado.
ihe pes 1.Campo requerido, se valida codificación del país según catálogo (CAT-020 País). FEXE, CDE
País destino de
51 la exportación | 1. Debe ingresar el nombre del país destino de la mercadería. FEXE
(Receptor)
Domicilio Fiscal | 1. Campo requerido con codificación de acuerdo a catálogo CAT-032 Domicilio Fiscal.
Código del
53 establecimient | 1. Este campo es opcional, deberá ingresar el tipo de establecimiento que le asigne el MH cuando DCLE
o asignado por | sea otorgado.
el MH
Código del
Punto de Venta | 2. Este campo es opcional, cuando se otorgue deberá ingresar el código del punto de venta que
54 4 DCLE
asignado por el | le asigne el MH.
MH
Bienes i fom BE i ; . m7
55 Remitidosa 1. Campo requerido Unicamente con codificación establecida según catálogo CAT-025 "Titulo a NRE
Titulo de que se remiten los bienes”.
56 Tipo de 1. Campo requerido, Únicamente aceptará codificación según catálogo CAT-029 Tipo de FEXE
Receptor receptor.
Teléfono 1. Campo opcional, cuando lo requiera podrá ingresar hasta un máximo de 3 números telefónicos
57 TODOS
(Receptor) separados por comas.
CCFE, NCE,
; ic ini A , ; NDE, NRE,
1. Campo requerido con estructura de correo electrónico con dominio de nivel superior valido. CLE. DCLE
Correo FEXE ’
58 electrónico : 7 TE,
Mecenton 2. Campo podrá ser null cuando campo "monto total de la operación" sea menor a $10,000.00 | FEXE
p 3. Campo requerido cuando "monto total de la operación" sea mayor o igual a $10,000.00 FEXE
4. Campo podrá se null FE, SRE
- - FSEE, CDE
Sección 5: DOCUMENTOS ASOCIADOS
En estos campos se describen los documentos asociados. Se podrán describir desde 1 hasta 10 documentos asociados excepto
para la FEXE donde se podrán describir desde 1 hasta 20 documentos.
Cuando no se requiera deberá enviar esta sección con null.
Cuando aplique:
a) Si campo "Documento Asociado” está completo con las opciones 1 o 2 esta sección deberá completarse desde campo
“Documento asociado” hasta campo “Descripción de documento asociado”.
b) Si campo "Documento Asociado" está completo con la opción 3 * Médico" deberá completarse desde el campo “Nombre de
médico que presta el Servicio” hasta campo "Código del Tipo de Servicio Realizado”.
c) Si campo "documento asociado” está completo con la opción 4 “Transporte” deberá completar desde el campo “Modo de
transporte” hasta el campo "Nombre y apellido del conductor”.
90

<!-- PAGE 91 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
1. Cuando aplique se deberá colocar código según catálogo (CAT-021 Documentos Asociados) | FE, CCFE,
a que corresponde el documento asociado. FEXE, CDE
| 2. Campo es requerido con código 1
| 59 Ck 3. El código 4 solo se utilizará para factura de exportación electrónica. FEXE
asociado
| 4. No se hará uso del código 3 FEXE, CDE
5. Se valida campo null, cuando no exista documento asociado de ninguna de las partes | FE, CCFE,
involucradas en la operación. FEXE
| 1. Aplica cuando campo "Documento asociado" este lleno con la opción 10 2 FE, CCFE,
| FEXE, CDE
| 2. Campo es requerido con identificación del documento asociado.
| Identificación 3. Se valida campo null cuando: , FE CCFE
del a) Campo "Documento asociado” también sea null. y ’
| A E. FEXE
| documento. b) Cuando campo Documento asociado” este lleno con la opción diferente a 1 02.
| Asociado 4. Puede describir desde 1 hasta 10 Documentos asociados. (ver nota de sección "Documentos | FE, CCFE,
asociados”). CDE
5. Puede describir desde 1 hasta 20 Documentos asociados. (ver nota de sección “otros FEXE
| documentos asociados”).
| 1. Aplica cuando campo "Documento asociado” este lleno con la opción 10 2 Fe, SCPE,
| - - FEXE, CDE
|
| 2. Cuando aplique debe describir el documento asociado. — au
o 3. Se valida campo null cuando: FE CCFE
Descripción de | a) Campo “Documento asociado" también sea null. FEXE *
| 61 documento b) Cuando campo este lleno con la opción diferente a 102 "
| asociado:
| 4. Campo es requerido con descripción del documento asociado.
| 5, Puede describir desde 1 hasta 20 Documentos asociados. (ver nota de sección "Documentos FEXE
| asociados”).
| 6. Puede describir desde 1 hasta 10 Documentos asociados. (ver nota de sección "Documentos | FE, CCFE,
| asociados"). CDE
| Nombre de y Fete campo deberá completarse si en campo "Documento asociado” se ha ingresado la opción FE, CCFE
médico que Ei - - :
| 62 presta el 2. Valida null, cuando campo "Documento asociado" este completo con código diferente a 3. FE, CCFE
Servicio 3. Sera requerido cuando campo "Documento asociado" este completo con código 3 FE, CCFE
| 4. Puede utilizarse desde 1 hasta 10 veces. (ver nota de sección "Documentos asociados”). FE, CCFE
1. Este campo deberá completarse si el campo "Documento asociado” está lleno con la opción
| de FE, CCFE
3-Médico.
NIT del médico . i , A
63 | que presta el 2. Longitud de estructura de NIT, sin guiones ni otros caracteres especiales. FE, CCFE
servido 3. NIT del médico que presta el servicio” será null cuando campo “Documento de identificación
ih i - FE, CCFE
de médico no domiciliados se encuentra null.
4. Puede describir desde 1 hasta 10 veces. (ver nota de sección "Documentos asociados”). FE, CCFE
1. Este campo deberá completarse si el campo "Documento asociado” se ha completado con la FE CCFE
Documento de | opción 3-Médico. '

64 | dentificación | 2. Campo es requerido cuando el "Nombre del médico que presta el servicio" se encuentre lleno | oo ccrr
de médico no | y "NIT del médico que presta el servicio" se encuentre null. '
domiciliados 3. Se valida campo null si campo "nombre de médico que presta el servicio" se encuentra null. _ | FE, CCFE

4. Puede describir desde 1 hasta 10 veces. (ver nota de sección "Documentos asociados”). FE, CCFE
Código del 1. Es requerido si en campo "Documento asociado “se ha completado con la opción 3-Médico. | FE, CCFE
ES Sou e 2. Se valida codificación de acuerdo a catálogo CAT-010 Código tipo de Servicio (médico). FE, CCFE
7 3. Se valida null si campo "nombre de médico que presta el servicio” se encuentra null. FE, CCFE
realizado
4. Puede describir desde 1 hasta 10 veces. (ver nota de sección "Documentos asociados”). FE, CCFE
1. Es requerido si en campo "Documento asociado" se ha completado con la opción 4-
FEXE
| Modo de Transporte.
| transporte 2. Se valida null cuando campo "Documento asociado" este completo con código diferente a 4. | FEXE
| 3. Cuando aplique, este deberá contener código según CAT 030-Modo de Transporte. FEXE
91

<!-- PAGE 92 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
1. Es requerido si en campo "Documento asociado” se ha completado con la opción 4- FEXE
Número de Transporte.
identificación 2. Cuando aplique deberá completarse el número de identificación del medio de transporte
67 : 0 I FEXE
del medio de utilizado para la exportacion.
transporte 3. Valida null cuando campo "Documento asociado” este completo con código diferente a 4 (ver FEXE
nota de sección "Documentos asociados”).
N* documento = Es requerido si en campo "Documento asociado” se ha completado con la opción 4- FEXE
de ransporte.
identificación 2. Cuando aplique deberá completar el número de identificación del conductor. FEXE
del conductor | 3. Valida null cuando campo "Documento asociado” este completo con código diferente a 4 (ver FEXE
nota de sección "Documentos asociados”).
1. Es requerido si en campo "Documento asociado” se ha completado con la opción 4- FEXE
Nombre y Transporte.
apellidos del 2. Cuando aplique deberá completar el nombre completo del Conductor. FEXE
Conductor 3. Valida null cuando campo "Documento asociado" este completo con código diferente a 4 (ver | ry -
nota de sección "Documentos asociados”).
Sección 6: VENTA A CUENTA DE TERCEROS
Este apartado deberá llenarse si la operación es a cuenta de terceros de lo contrario está sección se completará con null.
Importante: Si los documentos (FE, CCFE, NCE, NDE, FEXE) son emitidos por cuenta de terceros deberá completarse esta sección,
para poder ingresar en el CLE la información de los DTE emitidos por cuenta de terceros.
FE, CCFE,
1. Cuando lo requiera debe ingresar NIT de contribuyente IVA activo. NRE, NCE,
70 NIT por cuenta NDE, FEXE
de terceros FE, CCFE,
2. Longitud de estructura de NIT sin guiones ni otros caracteres especiales. NRE, NCE,
NDE, FEXE
FE, CCFE,
Nombre, 1. Se valida campo null cuando campo NIT por cuenta de tercero también sea null NRE, NCE,
71 denominacion NDE, FEXE
o razón social FE, CCFE,
del Tercero 2. Campo requerido cuando NIT por cuenta de tercero se encuentre lleno. NRE, NCE,
NDE, FEXE
Sección 7: COMPRA POR CUENTA DE TERCEROS
Esta Sección deberá completarse cuando la compra se efectúe por cuenta de terceros o mandantes. Cuando no aplique, deberá
transmitir la sección completa con null.
Número de 1. Cuando el "Número de documento de identificación del Tercero” esté lleno, el “Receptor”
documento de | deberá encontrarse enlistado como operador logístico por la Administración Tributaria.
72 identificación RENE
del Tercero 2. Longitud de número sin guiones ni otros caracteres especiales.
1. Se valida campo null cuando campo “Numero de documento de identificación del Tercero”
también sea null.
73 Nombre del FEXE
Tercero 2. Campo requerido cuando "Numero de documento de identificación del Tercero" se encuentre
lleno.
Sección 8: CUERPO
Esta sección contiene la información detallada de la operación realizada en cada uno de los documentos.

En los campos numéricos que reflejen valores monetarios en los DTE, se permitirá un máximo de ocho posiciones decimales
(fraccionaria); en consecuencia, en los casos que se utilice más de 8 decimales cuando la novena posición decimal de estos
campos sea igual o mayor a 5, la octava posición decimal se deberá redondear 1 hacia arriba.

, . , . , TODOS
1. Formato de números enteros correlativos, mayores a cero sin punto y sin decimales a su excepto el
derecha. DCLE
74 N* de ítem FE, NRE,
2. Podrá ingresar hast Axi de 2000 item SCPE, NCE,
. Podrá ingresa a un máximo ; NDE, FEXE,
FSEE, CDE
3. Podrá ingresar hasta un máximo de 500 ítem. CRE, CLE
92

<!-- PAGE 93 / 112 (OCR) -->

| CAMPO VALIDACIONES PARA CAMPOS DTE
FE.CCFE,
1. Campo requerido con codificación según catálogo CAT- 011 Tipo de Item. NRE, NCE,
NDE, FSEE
75 Tipo de Item 2. No se hará uso del código 4 (otros tributos por item). FSEE
3. Únicamente se ingresará la opción 4 cuando se detalle impuestos cuyo valor este sujeto al | FE, CCFE,
cálculo del IVA; es decir cuando se detallen en el ítem impuestos que correspondan a los códigos | NRE, NDE,
A8, 57, 90, D4, D5 o A6. contenidos en catálogo CAT-015 “tributos” apartado 2. NCE
Tengo 1. Campo requerido, se valida código según catálogo CAT- 026 Tipo de donación.
1. Valor monetario mayor o igual a cero.
1. Debe contener código identificador del Tipo de Documento 01-F, 03-CCF, 05-NC, 06-ND y/o
Tipo de 11-FEX ya sean estos físicos o electrónicos. Se permitirá relacionar diferentes tipos de documentos | CLE
78 Documento en un mismo CLE.
Tributario 2. Debe contener código identificador del Tipo de Documento 01-F, 03-CCF o 14-FSE ya sean CRE
Relacionado estos físicos o electrónicos. Cumpliendo con la regla que sean del mismo tipo.
3. Este campo se podrá ingresar desde 1 hasta un máximo de 500 veces. CRE, CLE
y 1. Campo requerido, se valida codificación de acuerdo a catálogo CAT-007.
Tinade CRE, CLE
79 Generación del | Tipo de Generación del Documento. ’
Documento 2. Este campo podrá ingresar desde 1 hasta un máximo de 500 veces. CRE, CLE
FE, CCFE,
1. Permitirá el ingreso de códigos de generación de documentos generados electrónicamente y | NRE, NCE,
correlativos de documentos generados en físico. NDE, CRE,
CLE
2. Solo se podrán relacionar documentos del mismo tipo. FE, CCFE,
Por ejemplo, si se relacionan a una FE varias notas de remisión, tanto los códigos de generación | NRE, NDE,
o números correlativos descritos deberán corresponder a notas de remisión. NCE, CRE
FE, CCFE,
3. Cuando no exista un documento a relacionar deberá enviar este campo con null. NRE, NDE,
NCE
4. Campo requerido, podrá ingresar desde 1 hasta un máximo de 500 documentos detallando un CLE. CRE
documento por cada ítem. '

‘0 I ; SU FE, CCFE,
| 5. Podrá ingresar desde 1 hasta un máximo de 50 documentos relacionados con un máximo de NRE. NDE
| 2000 ítem en el documento. NCE ’
| FE, CCFE,
| 6. Si el documento relacionado ha sido emitido de forma electronica, dicho documento debe | NRE, NDE,
| contar con sello de recepcion. NCE, CRE,
| CLE
| Número de ,
| documento 7. Únicamente podrá relacionar Código de Generación o número de correlativo de NR o DCL. FE, CCFE
| relacionado

8. Cuando se relacione a una FE o CCFE un DCLE o NRE podrán referenciarse sin sello de FE CCFE
recepción. .
9. Campo requerido con código 03- CCF y 07- CR. NCE, NDE
10. Únicamente podrá relacionar Código de Generación o número de correlativo de F, CCF o
FSE.
FE, NRE,
11. Los documentos relacionados deberán ser del mismo tipo dentro de un mismo DTE. CCFE, NCE,
NDE
FE, NRE,
12. Se podrá referenciar el mismo número de documento relacionado en varios DTE diferentes. | CCFE, NCE,
NDE
FE, CCFE,
13. Se permitirá ingresar el número de documento relacionado una sola vez dentro de un DTE. NRE, NDE,
NCE
| FE, CCFE,
| 14. Cuando el documento relacionado se haya generado en físico deberá ingresar el número de | NRE, NCE,
correlativo cuya longitud no de exceder de 20 dígitos (números y letras mayúsculas). NDE, CRE,
| CLE
| 93
|

<!-- PAGE 94 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
15. Este campo podrá ingresar desde 1 hasta un máximo de 2000 veces.
FE, CCFE,
Nota: cuando aplique campo "Número de documento relacionado" se podrá repetir hasta un | NRE, NCE,
máximo de 2000 veces, debiendo ingresar el número de documento relacionado en cada uno | NDE
de los ítems que detalle, pudiendo relacionar un máximo de 50 documentos.
FE, CCFE,
16. No se pueden referenciar documentos electronicos con estado de invalidados. NRE, NCE,
NDE, CRE
17. Se podrán referenciar documentos de diferente tipo FCF, CCF, NC, ND y FEX en un mismo
CLE.
18. Los códigos de generación de documentos que se encuentren con estado
anulado/invalidados se podrán relacionar una sola vez. (no pueden relacionarse más de una vez, | CLE
ni relacionarse en más de un CL).
19. Se permitirá repetir 2 veces el número de documento relacionado en un CL solo si los
documentos informados han sido invalidados dentro del mismo periodo que informe el CL, ya
que deberá ingresarse primero en un ítem el valor del documento generado en signo positivo CLE
(para el caso de la NC con signo negativo) y posteriormente en otro ítem en documento
Anulado/invalidado con signo negativo haciendo referencia al mismo documento (para NC se
deberá colocar ítem en signo positivo).
1. Deberá ingresar la fecha de generación del documento relacionado, en el siguiente formato CRE CLE
YYYY-MM-DD. ’
Fecha de 2. Debe cumplir con plazos de fecha establecidos por la AT, el CRE deberá generarse en el mismo | car
81 A del | período tributario en que se generó el CCF, la F o FSE relacionados.
ocumento
relacionado 3. Debe cumplir con plazos de fecha establecidos por la AT, el CLE deberá generarse en el mismo
CLE
período tributario en que se generó el CCF, F, NC, ND, FEX relacionados.
4. Debe ingresar la fecha de generación que contenga el DTE relacionado. CRE, CLE
FE, CCFE,
1. Campo requerido, Cantidad en números mayores a cero, separadas por punto con un máximo | NRE, NCE,
de 8 decimales después del entero. NDE, FEXE,
CDE, FSEE
82 Cantidad 2. Se deberá completar con valor 1 Cuando se haga uso de campo "Cargos/Abonos que no | FE, CCFE,
afectan la base imponible”. FEXE
3. Se deberá completar con valor 1 Cuando en campo "tipo de Item” está completo con la opción | FE, CCFE,
4 (cuando se detallen tributos A8,57,90, D4, D5 o A6). NCE. NDE
FE, CCFE,
1. Campo opcional, se validará campo null NRE, NICE.
- ' - NDE, FEXE,
si CDE, FSEE
83 Código FE, CCFE,
, NRE, NCE,
2. Cuando se ingrese no debe exceder de 25 caracteres. NDE, FEXE,
CDE, FSEE
1. Deberá ingresar un código de tributo contenido en la sección 2 del catálogo CAT- 015 "tributos NRE. NCE
(códigos A8, 57, 90, D4, D5 o AG6). u ’
NDE
5 Tributo sujeto a | 2- Cuando se haga uso de este campo solo se ingresará uno de los códigos de tributos contenidos | FE, CCFE,
4 cálculo de IVA. | en la sección 2 del catálogo CAT-015 “tributos”, y en campo “Código del Tributo” solo se permitirá | NRE, NCE,
el código 20 que corresponde a IVA 13% (no aplica otro tipo de tributo). NDE,
3. Requerido cuando en campo "tipo de ltem" se ingrese la opción 4 (si campo Tipo de item tiene eid
una opción diferente deberá enviar con null). NDE '
FE, CCFE,
85 Unidad de 1. Únicamente tomará como válida la codificación para unidades de medida establecida según | NRE, NCE,
Medida catálogo CAT-014 Unidad de Medida. NDE, FEXE,
CDE, FSEE
94

<!-- PAGE 95 / 112 (OCR) -->

|
| CAMPO VALIDACIONES PARA CAMPOS DTE
| FE, CCFE,
hi La , , u NRE, NCE,
2. Se deberá ingresar la opción del catálogo 99 (otra) cuando el contribuyente preste un servicio. NDE. FEXE
| CDE, FSEE
3. Se deberá ingresar la opción del catálogo 99 (otra) cuando se haga uso de campo | FE, CCFE,
“Cargos/Abonos que no afectan la base imponible”. FEXE
|
" la , wr , FE, CCFE,
| 4. Se deberá ingresar la opción del catálogo 99 (otra) cuando campo "Tipo de Item” este completo NRE. NCE
con la opción 4. : ’
| NDE
FE, CCFE,
i a , wi NRE, NCE,
1. Campo requerido, alfanumérico con longitud máxima de 1,000. Caracteres.
Descripció NDE, FEXE,
pción
CDE, FSEE
“ 2. Se validará campo null.
+ FE, CCFE,
7 1. Campo requerido, con valores monetarios >=0, separadas por punto con un máximo de 8 | NRE, NCE,
decimales. NDE, FEXE y
NE FSEE
CCFE, NRE,
2. Los precios en los DTE deberán expresarse a valores sin IVA. NCE, NDE,
FEXE y FSEE
3. Para FE los precios deberán expresarse a precios consumidor final es decir precios incluyendo FE
87 Precio Unitario | IVA.
4. Cuando se haga uso de campo "Cargos/Abonos que no afectan la base imponible”. Deberá | FE, CCFE,
ingresar valor $0.00. FEXE
5. Cuando en campo ‘Tipo de [tem” se haya completado con la opción 4 en campo "Precio
Unitario" deberá reflejarse el valor calculado del tributo. FE, CCFE,
NRE, NCE,
Este caso solo aplica cuando se detallen en el ítem tributos sujetos a cálculo de IVA contenidos | NDE
en de la sección 2 del catálogo 15- tributos.
88 Valor Unitario 1 campo requerido, con Valores monetarios > 0, Separadas por punto con un máximo de 8 CDE
decimales.
FE, CCFE,
1. Descuento se aplicará por ítem, en valores monetarios >=0 RRE NTE,
y p p , NDE, FEXE,
FSEE
FE, CCFE,
Co NRE, NCE,
Descuento. 2. Cuando no se apliqué descuento debe colocar valor $0.00 NDE, FEXÉ,
Bonificación, FSEE
Rebajas por FE, CCFE,
ítem , ; j ha NRE, NCE,
3. Descuento no podrá ser mayor al monto del ítem o línea de operación. NDE, FEXÉ,
FSEE
FE, CCFE,
4. Cantidad en números, separadas por punto con un máximo de 8 decimales NRE. NICE,
: sep por p NDE, FEXE,
FSEE
cmp , . FE, CCFE,
1. Campo se aplicará por ítem, debe ser un valor monetario >= cero, separadas por punto con un NRE. NCE
maximo de 8 decimales. NDE, CLE
Ventas No FE, CCFE,
: 2. Será el resultado de (Precio * Cantidad- Descuento, Bonificación, Rebajas por ítem). NRE, NCE,
Sujetas NDE
FE, CCFE,
3. Campo requerido, cuando no exista ventas no sujetas debe colocarse $0.00 NRE, NCE,
NDE, CLE
95

<!-- PAGE 96 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
4. Será el resultado de restar al “Total de operaciones Ventas no sujetas" - el "Monto global de
Descuento, Bonificación, Rebajas y otros a Ventas no sujetas” del documento que se está | CLE
liquidando.
5. Los documentos F, CCF, ND activos se ingresarán en valores positivos y sumarán en el CLE
documento.
6. Si el documento a informar es NC activa deberá ingresarse en valores negativos y se restará en CLE
el CLE.
7. Cuando se informen F, CCF, ND anulados/invalidados se deberá ingresarse con valor negativo CLE
y se restará en el CLE.
8. Si el documento anulado/invalidado a informar es NC deberá ingresarse con valor positivo.
9. Cuando se informe un mismo documento dentro un periodo a liquidar activo y
anulado/invalidado, deberá ingresarse primero un ítem con el valor del documento activo en
signo positivo (para nota de crédito con signo negativo) y posteriormente en otro ítem el | CLE
documento anulado/invalidado con valor negativo haciendo referencia al mismo documento
(para la nota de crédito con signo positivo).
10. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente mec
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE CLE
inmed , i FE, CCrE,
1. Campo se aplicará por ítem, debe ser un valor monetario >= cero, separadas por punto con un NRE. NCE
maximo de 8 decimales. NDE CLE
FE, CCFE,
2. será el resultado de [(Precio * Cantidad- Descuento, Bonificación, Rebajas por item)]. NRE, NCE,
NDE
FE, CCFE,
3. Campo requerido, cuando no exista ventas exentas debe colocarse $0.00 NRE, NCE,
NDE, CLE
4. Será el resultado de restar el “Total de operaciones Ventas Exentas” — "Monto global de
Descuento, Bonificación, Rebajas y otros a Ventas Exentas” contenido en el documento que se | CLE
está liquidando.
5. Los documentos F, CCF, ND activos se ingresarán en valores positivos y sumarán en el CLE
91 Ventas Exentas: | documento.
6. Si el documento a informar es NC activa deberá ingresarse en valores negativos y se restará en CLE
el CLE.
7. Cuando se informen F, CCF, ND anulados/invalidados se deberá ingresarse con valor negativo CLE
y se restará en el CLE.
8. Si el documento anulado/invalidado a informar es NC deberá ingresarse con valor positivo.
9. Cuando se informe un mismo documento dentro un periodo a liquidar activo y
anulado/invalidado, deberá ingresarse primero un ítem con el valor del documento activo en
signo positivo (para nota de crédito con signo negativo) y posteriormente en otro ítem el | CLE
documento anulado/invalidado con valor negativo haciendo referencia al mismo documento
(para la nota de crédito con signo positivo).
10. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente pue
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE CLE
1. Campo se aplicará por item, debe ser un valor monetario >= cero, separadas por punto con un RE NE
máximo de 8 decimales. NDE, FEXÉ
FE, CCFE,
2. Será el resultado de [(Precio * Cantidad- Descuento, Bonificación, Rebajas por item)]. NRE, NCE,
NDE, FEXE
92 Ventas FE, CCFE,
Gravadas 3. Campo requerido, cuando no exista ventas gravadas debe colocarse $0.00 NRE, NCE,
NDE, FEXE
4. Será el resultado de restar el “Total de operaciones Ventas Gravadas” — "Monto global de
Descuento, Bonificación, Rebajas y otros Ventas Gravadas”, contenido en el documento que se | CLE
está liquidando a valor neto, es decir sin IVA.
5. Para el caso específico del CLE cuando el documento a liquidar sea F y esta posea ventas CLE
gravadas deberá ingresar el valor sin IVA.
96

<!-- PAGE 97 / 112 (OCR) -->

|
|
|
| CAMPO VALIDACIONES PARA CAMPOS DTE
6. Los documentos F, CCF, ND activos se ingresaran en valores positivos y sumaran en el CLE
documento.
7. Si el documento a informar es NCE activa deberá ingresarse en valores negativos y tendrán CLE
| efecto resta en el CLE.
8. Cuando se informen F, CCF, ND anulados/invalidados se deberá ingresarse con valor negativo.
| 9. Si el documento anulado/invalidado a informar es NC deberá ingresarse con valor positivo.
10. Cuando se informe un mismo documento dentro un periodo a liquidar activo y
| posteriormente anulado/invalidado, deberá ingresarse primero un ítem con el valor del
documento activo en signo positivo (para nota de crédito con signo negativo) y posteriormente | CLE
en otro ítem el documento anulado/invalidado con valor negativo haciendo referencia al mismo
documento (para la nota de crédito con signo positivo).
| 11. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente gh)
| y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE FEXE
| 1. Deberá ingresar un valor monetario positivos o negativos, separadas por punto con un maximo CLE
| de 8 decimales.
2. Será el resultado de restar el “Total de operaciones Ventas gravadas” — “Monto global de
| Descuento, Bonificación, Rebajas y otros Ventas gravadas” contenido en la FEX que se está | CLE
| liquidando.
| 3. Campo requerido, cuando no exista ventas por exportación debe colocarse $0.00
| 4. Las FEX activas se ingresarán en valores positivos y sumarán en el documento.
93 Exportaciones | 5. Cuando se informen FEX anuladas/invalidadas se deberá ingresar con valor negativo y restara
al CL.
6. Cuando se informe una misma FEX dentro un periodo a liquidar activa y posteriormente
anulada/invalidada, deberá ingresarse primero un ítem con el valor de la FEX activa con signo CLE
| wet . 2, n ra . .
positivo y posteriormente en otro ítem la FEX anulada/invalidada con valor negativo haciendo
| referencia a la misma FEX.
| 7. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
| la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
| 1. Campo se aplicara por item, debe ser un valor monetario > cero, separadas por punto con un CDE
maximo de 8 decimales.
94 Valor Donado [2 Será el resultado de [ (Valor unitario * Cantidad) - (Depreciación).
3. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y CDE
la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
1. Campo se aplicará por ítem, debe ser un valor monetario >= cero, separadas por punto con un FSEE
máximo de 8 decimales.
95 Ventas 2. Será el resultado de [(Precio * Cantidad- Descuento, Bonificación, Rebajas por item). FSEE
3. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
| la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
1. Se valida códigos de acuerdo a catálogo CAT-015 tributos o contenidos en la sección 1 y 3 NDA
2. Se valida códigos de acuerdo a catálogo CAT-015 tributos o contenidos en la sección 1 y 3
Mo FE
exceptuando código 20-IVA.
FE, CCFE,
3. Se aplicará por ítem únicamente sobre las ventas gravadas. NRE, NCE,
| NDE, CLE
| 4. Este campo se completará con null, en los siguientes casos: FE, CCFE,
| Código del 1- Cuando en el ítem se detalle Ventas no sujetas. RE, ue
| Tributo 2- Cuando en el ítem se detalle Ventas exentas. '
| 5. Este campo se completará con null, Cuando se haga uso de campo *Cargos/Abonos que no | FE, CCFE,
| afectan la base imponible”. FEXE
| 6. Este campo se completará con null, Cuando campo” tipo de ítem” este completo con la opción
4.
| FE, CCFE,
| 7. Se pueden ingresar varios códigos de tributos en un mismo ítem, estos deberán estar entre | NRE, NCE,
corchetes separados por comas. NDE, FEXE,
CLE
97

<!-- PAGE 98 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
8. Cuando campo Tipo de ítem contenga la opción 4 solo permitirá ingresar Código 20 que | CCFE, NRE,
corresponde a IVA 13% (no aplica otro tipo de tributo). NCE, NDE
9. En este campo solo se podrán ingresar los códigos de tributos de las secciones 1 del catálogo CLE
CAT-015 tributos”.

10. Para el caso específico del CL cuando el documento a liquidar sea F y esta posea ventas
gravadas deberá adicionarse el código de tributo 20 ya que los valores solicitados a reportar en el | CLE
campo ventas gravadas cuando se trate de F es requerido sin IVA.
11. Se deberán ingresar Todos los tributos de la sección 1 que se encuentren detallados en el CLE
documento informado.
12. Campo requerido, únicamente con código C3- Impuesto al Valor Agregado (exportaciones) FEXE
0%
1. Valor monetario mayor o igual a cero. FE, CCFE
Precio sugerido | 2. Cuando aplique deberá detallarse por ítem a nivel informativo y no tendrá efectos en otros
97 , ; FE, CCFE
de venta cálculos. (solo aplica para productos y alcohol).
3. Cuando no aplique deberá enviarse campo con $0.00 FE, CCFE
1. Debe expresarse en valores monetarios positivos o negativos.
Cargos/Abonos , , , FE, CCFE,
que no afectan Nota: Estos valores deben ingresarse en el cuerpo del documento como un ítem más dentro de | FEXE
la base los 2000 ítems en cuerpo del documento.
imponible 2. Cuando no existan "Cargos/Abonos que no afectan la base imponible “se deberá completar | FE, CCFE,
campo con valor $0.00. FEXE
1. Campo requerido de uso informativo para la administración tributaria deberá contener el valor
de IVA que corresponda a cada ítem. FE, CLE
Nota: Campo no tendrá efecto en otros valores calculados en el documento.
IVA por ítem 2. Valor de IVA por ítem estará dado por el cálculo de: [[(ventas gravadas por ítem) /1.13]*13%]
3. Valor de IVA por ítem estará dado por el cálculo de: (ventas gravadas por ítem *13%).
4. Cuando la operación no sea afecta a IVA deberá detallar este campo con valor $0.00 FE, CLE
5. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
A 1. Campo requerido, deberá detallar el valor sujeto de retención (valor sin IVA) del Documento
Monto Sujeto a ' : . :
100 R e tributario que se está detallando por cada ítem, expresado en valores mayores a cero con un | CRE
etención e : ,
máximo de 2 decimales después del entero.
1. Campo requerido, por cada ítem se deberá indicar el código de la retención de acuerdo a
catálogo CAT-006 Retención IVA MH.
101 Código 22 - Retención IVA 1% CRE
Retención MH | C4- Retención IVA 13%
C9 - Otras retenciones especiales.
2. Únicamente se podrá relacionar un código de retención por cada item
1. Campo requerido, deberá detallar el Monto de retención IVA, efectuado en el documento
relacionado, el cual será expresado en valores monetarios mayores a cero, con un máximo de 2 | CRE
decimales después del entero.
2. Cuando en campo "Código Retención MH" se seleccione la opción 22, el valor estará dado
Ce ; > o CRE
por la multiplicación de Monto Sujeto a Retención *1%
102 IVA Retenido 3. Cuando en campo "Código Retención MH" se seleccione la opción C4, el valor estará dado por CRE
la multiplicación de: Monto Sujeto a Retención *13%
4. Cuando en campo "Código Retención MH" se seleccione la opción C9 CRE
el valor estará dado por la multiplicación de: Monto Sujeto a Retención *X%
5. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
Fecha inicio del , , rds til i _ tal
103 aricdo de 1. Campo requerido, deberá de indicar la fecha inicial del periodo a liquidar en el siguiente DCLE
periodo € formato: YYYY-MM-DD.
liquidación
Fecha fin del 1. Campo requerido, deberá de indicar la fecha fin del periodo a liquidar en el siguiente formato: DCLE
104 período de YYYY-MM-DD.
liquidación 2. La fecha fin del período no puede anteceder a la fecha inicio de la liquidación. DCLE
98

<!-- PAGE 99 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
1. Campo opcional, cuando se haga uso de este campo se permitirá hasta un máximo de 30
Código de caracteres para colocar el código interno de las liquidaciones según los controles de las
105 ogo de administradoras de tarjetas. DCLE
Liquidación:
Cuando no se haga uso de este campo se deberá ingresar null.
106 Cantidad de 1. Campo opcional, cuando se haga uso de este debe expresar cantidad con un número entero DCLE
documentos mayor a cero.
Valor da tas 1. Campo requerido, expresado en valores monetarios >0, separadas por punto con un maximo
107 | Operacionesa |; PO Ea » XP di por DCLE
tii de 2 decimales.
liquidar
Valores no 1. Campo opcional, expresado en valores monetarios >0, separadas por punto con un maximo
, y DCLE
108 sujetos a de 2 decimales.
percepción 2. Cuando no existan montos no sujetos a percepción deberá mostrar $0.00 DCLE
- ld 1. Este campo es opcional, cuando se haga uso de este podra ingresar una breve descripcion de
Dascripeion del las operaciones que identifiquen el origen de los montos no sujetos a percepción
109 valor no sujeto p a 2 J PEreepcion- | pcLE
a percepción Cuando no se haga uso de este campo deberá enviarse con null.
om 1. Campo opcional, cuando se utilice podrá ingresar un máximo de 200 caracteres.
1. Campo opcional, cuando se utilice podrá ingresar un máximo de 200 caracteres. DCLE
1. Campo requerido, expresado en valores monetarios >0, separadas por punto con un máximo DCLE
112 Sub Total de 2 decimales.
2. Será el resultado de restar el campo "Valor de las Operaciones a liquidar” -'Valores no sujetos a DCLE
percepción".
IVA de las 1. Campo requerido, expresado en valores monetarios >0, separadas por punto con un máximo
113 | Operacionesa |; <AmPO req OP dic pore DCLE
ars de 2 decimales.
liquidar
Monto sujeto a j ; "
114 percepción sin 1 Campo requerido, expresado en valores monetarios >0, separadas por punto con un maximo DCLE
de 2 decimales.
IVA
1. Campo requerido, expresado en valores monetarios >0, separadas por punto con un maximo DCLE
15 IVA Percibido de 2 decimales.
(2%) 2. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
DCLE
la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
1. Campo requerido, con valor monetario mayor o igual a cero expresado con un máximo de dos DCLE
116 | Comisión decimales.
2. Cuando no tenga aplicación deberá ingresar 0.00. DCLE
Porcentaje de |1. Campo opcional alfanumérico que deberá contener el porcentaje de la comisión.
117 LA 1 DCLE
Comisión Cuando no se haga uso de este campo deberá ingresar null.
IVA de la 1. Campo requerido, expresado en valores monetarios >=0, separadas por punto con un maximo DCLE
118 NE de 2 decimales.
Comisión
2. Este campo será el resultado de multiplicar el campo "Comisión" por 13%(IVA). DCLE
1. Campo requerido, expresado en valores monetarios >0, separadas por punto con un máximo DCLE
de 2 decimales.
Valor líquido a | 2- Valor líquido a pagar será el resultado de la siguiente aplicación de la siguiente fórmula:
119 ¡li Valor Líquido a Pagar = Valor de las Operaciones a liquidar - Comisión -IVA Percibido (2%) - IVA | DCLE
pagar al afiliado
de la Comisión
3. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y DCLE
la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
1. Campo requerido, formato alfanumérico que indique el valor total a pagar. DCLE
Sección 9: RESUMEN
Contiene el resumen general de la información del cuerpo del documento es obligatoria en Todos los DTE exceptuando DCLE.
En los campos numéricos de la sección resumen de los DTE se permitirá un máximo de dos posiciones decimales (fraccionaria). En
consecuencia, en los casos que se utilice más de 2 decimales cuando la tercera posición decimal de estos campos sea igual o
mayor a 5, la segunda posición decimal se deberá redondear 1 hacia arriba.
99

<!-- PAGE 100 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
FE, CCFE,
1. Deberá de contener la sumatoria de Todos los valores detalladas en campo ventas no sujetas. | NRE, NCE,
NDE, CLE
FE, CCFE,
2. Expresado en valores monetarios >=0, separadas por punto con un máximo de 2 decimales. | NRE, NCE,
Total de
121 Operaciones DELE
no sujetas FE. COFE
3. Campo requerido (cuando no existan ventas no sujetas deberá mostrar $0.00). NRE, NCE,
NDE, CLE
. , . , , , FE, CCFE,
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente NRE. NCE
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE CLE
FE. CCFE,
1. Deberá de contener la sumatoria de Todos los valores detalladas en campo ventas exentas. NRE, NCE,
NDE, CLE
FE, CCFE,
Total de 2. expresado en valores monetarios >=0, separadas por punto con un máximo de 2 decimales. | NRE, NCE,
122 Operaciones NDE, CLE
exentas FE, CCFE,
3. Campo requerido (cuando no existan ventas exentas deberá mostrar $0.00). NRE, NCE,
NDE, CLE
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
E. . A. ; es > : ; Todos
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
FE, CCFE,
1. Deberá de contener la sumatoria de Todos los valores detallados en campo ventas gravadas | NRE, NCE,
(suma de todas las operaciones afectas realizadas para FEX). NDE, CLE,
FEXE
FE, CCFE,
2. Expresado en valores monetarios >=0, separadas por punto con un máximo de 2 decimales. | NRE, NCE,
Total de
Operacione NDE GE
15 | Opcaciones FE, CCFE,
3. Cuando no existan ventas gravadas deberá mostrar $0.00 NRE, NCE,
Gravadas
NDE, CLE
FE, CCFE,
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente | NRE, NCE,
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE, CLE,
FEXE
5. Campo requerido. [
1. Deberá de contener la sumatoria de todas las operaciones de exportaciones realizadas.
Total de 2. Expresado en valores monetarios positivos o negativos, separadas por punto con un máximo CLE
- de 2 decimales.
124 Operaciones
de Exportación: | 3- Campo requerido (cuando no existan ventas por exportación deberá mostrar $0.00)
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
1. Deberá de contener la sumatoria de todas las operaciones de venta realizadas. FSEE
125 Total de 2. Expresado en valores monetarios >0, separadas por punto con un maximo de 2 decimales. FSEE
Operaciones 3. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
1. Deberá de contener la sumatoria de los campos “Valor Donado"
126 | Total de la 2. Expresado en valores monetarios > 0, separadas por punto con un máximo de 2 decimales
Donación 4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
i , ; FE, CCFE,
1. Campo requerido, expresado en valores monetarios mayores o iguales a cero, Separadas por NRE. NCE
Suma de punto con un maximo de 2 decimales. q ’
, ; A NDE, CLE
127 operaciones sin
impuestos 2. Será el resultado de la Sumatoria del total de operaciones (total de operaciones ventas exentas BE, Coke,
NRE, NCE
+ total de operaciones ventas no sujetas + total de operaciones ventas gravadas). NDE '
100

<!-- PAGE 101 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
3. Será el resultado de la Sumatoria del total de operaciones (total de operaciones ventas exentas
+ total de operaciones ventas no sujetas + total de operaciones ventas gravadas + total de
operaciones de exportación). CLE
Nota: en caso que los valores ingresados por documentos anulados/invalidados fuera mayor al
valor consolidado de los documentos activos, en este campo se ingresará $0.00
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente NE NE
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE CLE
, , , o FE, CCFE,
1. Campo requerido con valores monetarios mayores o iguales a cero, con un máximo de 2 NRE. NCE
Monto global | decimales. NDE ’
de Descuento, FE CCFE
128 Bonificación 2. Descuento no podrá ser mayor al monto del total de operaciones no sujetas. NRE, NCE,
Rebajas y otros NDE
a ventas no FE CCFE
sujetas ; 3. Cuando no exista descuento a ventas no sujetas se deberá colocar $0.00. NRE, NCE,
NDE
. . . , e FE, CCFE,
1. Campo requerido con valores monetarios mayores o iguales a cero, con un máximo de 2 NRE. NCE
Monto de decimales. NDE '
Descuento, FE CCFE
Bonificación, , j : d
129 $ 2. El descuento no podrá ser mayor al monto del Total de operaciones exentas. NRE, NCE,
Rebajas y otros NDE
a ventas
exentas i , FE, CORE,
3. Cuando no exista descuento a ventas exentas se deberá colocar $0.00 NRE, NCE,
NDE
, , , PU FE, CCFE,
1. Campo requerido con valores monetarios mayores o iguales a cero, con un máximo de 2 NRE. NCE
Monto de decimales. NDE E
Descuento, FE CCFE
Bonificación, . ; : :
130 : 2. Descuento no podrá ser mayor al monto del Total de operaciones gravadas. NRE, NCE,
Rebajas y otros NDE
a ventas FE CCFE
gravadas 3. Cuando no exista descuento a ventas gravadas se deberá colocar $0.00 NRE, NCE,
g
NDE
Monto global 4: Campo requerido con valores monetarios mayores o iguales a cero, con un máximo de 2 FEXE
de Descuento, | decimales. . :
131 Bonificación, 2. Descuento no podrá ser mayor al monto del Total de operaciones ventas gravadas. FEXE
Rebajas y otros , ,
a ventas afectas 3. Cuando no exista descuento a ventas afectas se deberá colocar $0.00 FEXE
Monto global 1. Campo requerido con valores monetarios mayores o iguales a cero, con un máximo de 2 SEE
de Descuento, | decimales. F
132 Rebajas y otros 2. Descuento no podrá ser mayor al Total de Operaciones. FSEE
al total de 3. Cuando no exista descuento a ventas se deberá colocar $0.00 FSEE
operaciones.
Porcentaje del | 1. Este campo es opcional cuando se haga uso, se expresará con un máximo de dos decimales | FE, CCFE,
monto global después del entero y sin simbolo de porcentaje. NRE, FEXE
133 de Descuento, FE CCFE
Bonificación, 2. Cuando no tenga aplicación deberá ingresar 0.0 NRE FEXE
Rebajas y otros ,
FE, CCFE,
, i NRE, NCE,
1. Este campo es de uso para el contribuyente no tendrá efecto en valores totales del documento. NDE. FEXE
Total, del FSEE
monto de FE, CCFE,
134 Descuento, 2. Las cantidades en este campo deberá ser expresadas en valores monetarios con un máximo | NRE, NCE,
Bonificación, de dos decimales después del valor entero. NDE, FEXE,
Rebajas FSEE
3. Cuando no exista ningún descuento deberá colocar $0.00 FARA
101

<!-- PAGE 102 / 112 (OCR) -->

NDE, FEXE,
FSEE
4. Debe contener la sumatoria del descuento por ítem + la cantidad de descuentos globales.
Será el resultado de la suma de los campos siguientes: FE, CCFE,
e , , NRE, NCE,
Y (Descuento, Bonificación, Rebajas por ítem) + campo (Monto global de Descuento,
IT , ; NDE
Bonificación, Rebajas y otros a ventas no sujetas) +campo (Monto global de Descuento,
Bonificación, Rebajas y otros a ventas exentas) + campo (Monto global de Descuento,
Bonificación, Rebajas y otros a ventas gravadas)
"Monto global de Descuento, Bonificación, Rebajas y otros al total de operaciones”).
6. Debe contener la Sumatoria de los campos: "Descuento, Bonificación, Rebajas por item o
línea de operación" (+) "Monto global de Descuento, Bonificación, Rebajas y otros a FEXE
operaciones afectas").
1. Deberá detallar cada uno de los códigos de tributo ingresados por ítem en el cuerpo del | FE, CCFE,
documento en el campo "Código del Tributo” de forma consolidada es decir cada código de | NRE, NCE,
tributo solo se indicará una vez, aunque este repetido en el cuerpo del documento "n" veces. NDE
FE, CCFE,
2. Se podrán colocar varios códigos de tributos diferentes. NRE, NCE,
NDE
FE, CCFE,
3. Se valida campo null con ventas no sujetas, ventas exentas NRE, NCE,
NDE, CLE
4. Se valida campo null cuando se haga uso del campo “Cargos/Abonos que no afectan la base FE CCFE
Resumen imponible '
135 | código de
cin
“tributos”. NDE, CLE
8. No se aplicarán códigos contenidos en el apartado 2 del catálogo 015 “tributos” ya que estos | FE, CCFE,
se encuentran detallados en el cuerpo del documento en campo "Código de tributo sujeto a | NRE, NCE,
cálculo de IVA MH”. NDE
Cuales no afectarán el valor del documento. ’
FE, CCFE,
10. Campo será requerido siempre que exista ventas gravadas mayores a cero NRE, NCE,
NDE, CLE
, taria i , , FE, CCFE,
código de tributo”. NDE, CLE
; , i , , FE, CCFE,
códigos de tributos contenidos en el campo "Resumen código de tributo”. : '
NDE, CLE
136 Nombre del
tributo 3. Podrá ingresar una longitud máxima de 300 caracteres. NRE, NCE,
NDE, CLE
FE, CCFE,
4. Se valida campo null con ventas no sujetas, ventas exentas. NRE, NCE,
NDE, CLE
imponible”. .
FE, CCFE,
1. Valor monetario mayor o igual a cero. NRE, NCE,
i NDE, CLE
137 Valor de tributo CCFE, NRE,
2. Campo será requerido siempre que exista ventas gravadas mayores a cero. NCE, NDE,
CLE
102

<!-- PAGE 103 / 112 (OCR) -->

|
CAMPO VALIDACIONES PARA CAMPOS DTE
a í A ; FE, CCFE,
3. Cuando aplique debe contener la sumatoria consolidada de los montos de tributos calculadas NRE. NCE
por items de forma separada por tipo de tributo. NDE CLE
FE, CCFE,
4. Se valida campo null con ventas no sujetas, ventas exentas. NRE, NCE,
NDE, CLE
5. Se valida campo null cuando se haga uso del campo “Cargos/Abonos que no afectan la base FE CCFE
imponible” '
6. Para el caso de la sección 3 se mostrará los valores de los tributos que solo serán de uso FE CCFE
informativo los cuales no afectarán el valor del documento. '
7. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente E
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE CLE
1. Será el resultado de: "sumatoria de ventas” (-) [ "monto global de descuento, bonificación, FE CCFE
e: rebajas y otros a ventas no sujetas" (+) "monto global de descuento, bonificación, rebajas y otros NRE NCE
a ventas exentas"(+) "monto global de descuento, bonificación, rebajas y otros a ventas NDE *
gravadas”)].
2. Sera el resultado de: Total de Operaciones - Monto global de Descuento, Bonificación, Rebajas FSEE
138 Sub-Total y otros a ventas.
FE, CCFE,
3. Campo requerido, expresado en valores monetarios >=0 con un maximo de 2 decimales. NRE, NCE,
NDE, FSEE
, i i , i ; FE, CCFE,
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente NRE. NCE
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. NDE FSEE
Total Monto 1. Campo requerido, deberá de contener la sumatoria de Todos los campos "Monto Sujeto a
139 Sujeto a Retención”; expresado en valores monetarios mayores a cero, con un maximo de 2 decimales | CRE
Retención después del entero.
1. Cuando aplique deberá ingresar el valor de IVA Percibido 1% eo NCE,
2. Solo aplica a ventas gravadas. oct NCE.
140 IVA Percibido CCFE NCE
3. Cuando no exista percepciones debe colocarse valor $0.00
4. Cantidad en números, separadas por punto con un máximo de 2 decimales E. NCE,
| 1. Valores monetarios iguales o mayores a cero.
IVA Percibido 2. Deberá contener la sumatoria de las percepciones aplicadas en los documentos a liquidar que
141 Co CLE
Liquidado se detallen.
| 3. Cuando no exista percepciones debe colocarse valor $0.00
, i. , CCFE, NCE,
1. Cuando aplique deberá ingresar el valor de IVA Retenido. NDE, CRE
, , e . ... | FE, CCFE,
2. Sera expresado en valores monetarios mayores a cero, con un maximo de 2 decimales después NRE. NCE
| del entero. NDE, FSEE
| 3. Cuando se ingresen valores en este campo deberá validar que el valor ingresado sea el FSEE
142 IVA Retenido: resultado de multiplicar el valor contenido en el campo "Sub-Total" por el 13%
CCFE, NRE,
| 4. Cuando no exista retenciones debe colocarse valor $0.00 NCE, NDE,
| FSEE
| , , . , , , CCFE, NRE,
| ; 5. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
| y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. FSEE
| 1. Cuando la operación esté sujeta a retención renta, deberá ingresar el valor expresado en FE COPE,
| i e . NCE, NDE,
| valores monetarios >=5$0.00, separadas por punto con un máximo de 2 decimales. FSEE
| 143 | Retención FE ÉCFE,
Renta NCE, NDE
2. De no existir renta retenida deberá completar campo con $0.00 FSEE ’
103

<!-- PAGE 104 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS DTE
FE, CCFE,
3. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente | NCE, NDE,
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. FSEE
1. Cuando aplique, cantidad en números mayores a cero, separadas por punto con un máximo
; FEXE
144 S de 2 decimales.
Eguro 2. Cuando no tenga aplicación deberá ingresar 0.00 FEXE
3. Campo no requerido cuando en campo "Tipo de Item" contenga opción 2-Servicios. FEXE
1. Cuando aplique, cantidad en números mayores a cero, separadas por punto con un máximo FEXE
de 2 decimales.
145 Flete -
2. Cuando no tenga aplicación deberá ingresar 0.00 FEXE
3. Campo no es requerido cuando en campo "Tipo de ltem" contenga opción 2-Servicios. FEXE
1. Deberá colocar el resultado de: Sub Total (+) los valores contenidos en campo "Valor de | FE, CCFE,
Tributo”. NRE
FE, CCFE,
2. Campo requerido con valores monetarios >= cero separados por punto con un máximo de 2 | NCE, NDE,
decimales. NRE, CLE,
FEXE
3. Deberá colocar el resultado de: Sub Total (+) los valores contenidos en campo "Valor de NCE NDE
146 | Monto Total de | Tributo" (+) IVA Percibido (-) IVA Retenido (-) Retención Renta. '
la Operacion 4. Deberá colocar la Suma de los campos: Suma de operaciones sin impuestos (+) los valores | ~ -
contenidos en campo "Valor de Tributo”.
5. Deberá colocar la Suma de los campos: "Total de operaciones afectas" - "Monto global de
Descuento, Bonificación, Rebajas otros a vetas afectas" + "Seguro" + "Flete".
FE, CCFE,
6. Se dará holgura de $ 0.01 ctvs. Hacia arriba y hacia abajo por diferencias entre los cálculos en | NCE, NDE,
sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. NRE, CLE,
FEXE
1. Contendrá la suma de campos “Cargos/Abonos que no afectan la base imponible”, Permitirá | FE, CCFE,
Total valores negativos y positivos (cuando sea cargo se suma y cuando sea Abono se resta). FEXE
147 Sorgosihancs 2. Cuando no existan Cargos/Abonos que no afectan la base imponible se debera completar | FE, CCFE,
: hase campo con valor $0.00. FEXE
imponible 3. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente | FE, CCFE,
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. FEXE
1. Total a pagar se calculará de la siguiente manera:
Monto Total de la Operación (+) IVA percibido (-) IVA Retenido (-) Retención Renta (+/-) Total CCFE
Cargos/Abonos que no afectan la base imponible.
2. Total a pagar se calculará de la siguiente manera:
Monto Total de la Operación (-) IVA Retenido (-) Retención Renta (+/-) Total Cargos/Abonos que FE
148 Total a Pagar no afectan la base imponible.
3. Total general se calculará de la siguiente manera: FEXE
Monto Total de la Operación (+/-) “Total Cargos/Abonos que no afectan la base imponible *
3. Cuando existan abonos a favor del receptor y el resultado de un valor negativo, deberá | FE, CCFE,
colocarse $0.00 FEXE
4. Total a pagar se calculará de la siguiente manera: Sub-Total (-) IVA Retenido (-) Retención Renta. | FSEE
5. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente | FE, CCFE,
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria. FEXE
1. Total a liquidar se calculará de la siguiente manera: Monto Total de la Operación (+) IVA CLE
percibido liquidado.
2. Campo requerido expresado en valor monetario igual o mayor a cero, separadas por punto CLE
149 Total con un máximo de 2 decimales.
3. Cuando los valores ingresados por documentos anulados/invalidados fuera mayor al valor
; A : " CLE
consolidado de los documentos activos, en este campo se ingresará $0.00
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
Total IVA 1. Total del IVA Retenido = Suma de los campos IVA Retenido, expresado en valores monetarios
150 , or : , CRE
Retenido mayores a cero, con un máximo de 2 decimales después del entero.
104

<!-- PAGE 105 / 112 (OCR) -->

|
|
|
| CAMPO VALIDACIONES PARA CAMPOS DTE
| Valor en Letras , os
VA retenido 1. Campo requerido, en formato alfanumérico.
| FE, CCFE,
NRE, NCE,
| 152 Valor en Letras | 1. Campo requerido, en formato alfanumérico. NDE, CLE,
FEXE, FSEE,
CDE
| 1. Campo requerido de uso informativo, deberá contener la sumatoria de Todos los campos “IVA
por item” — el IVA del campo “Monto global de Descuento, Bonificación, Rebajas y otros a ventas | FE
gravadas”.
153 | IVA13% 2. Valores monetarios >=0, expresados con dos decimales.
3. Cuando la operación no sea afecta a IVA deberá detallar este campo con valor $0.00
4. Se dará holgura de + $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
y la aplicación de fórmula para validación del cálculo de la Administración Tributaria.
“| 1. Permitirá el ingreso de valores monetarios menores a cero (negativos) para reflejar saldo a favor FE CCFE
154 Saldo a Favor del receptor cuando lo posea '
. 2. Cuando no se haga uso se debe completar con 0.0 FE, CCFE
FE, CCFE,
1. Campo requerido, únicamente permitirá codificación según catálogo CAT-016 Condición de | NCE, NDE,
Condición de la | la Operación. CLE, FEXE,
1 Operación FSEE
, en La FE, CCFE,
2. Si el total a pagar en el documento fuera $0.00 deberá ingresar opción 1 — Contado. CLE FEXE
ii oF 20d , FE, CCFE,
1. Deberá identificar el código de la forma de pago de acuerdo a catálogo CAT-017 Forma de FEXE FSEE
Pago. CDE
_. 4 i " or FE, CCFE,
2. Puede contener "n" formas de pago, para las cuales deberá repetirse del campo "condición de FEXE FSEE
la operación" al campo “referencia modalidad de pago* por cada forma de pago que se indique. CDE ’
156 Código de 3. Cuando el contribuyente receptor refleje o posea saldo a favor deberá seleccionar código de | FE, CCFE,
forma de pago | forma de pago 99- otros. FEXE
4. Será requerido cuando el campo "Condiciones de la Operación" este lleno con la opción 1- | FE, CCFE,
contado o 3- otro. FSEE FEXE,
5. Se valida campo null cuando campo * Condiciones de la Operación" esté completo con código | FE, CCFE,
2 FSEE FEXE,
6. Se valida campo null cuando campo “tipo de donación" esté completo con código 2 6 3.
FE, CCFE,
1. Cuando aplique deberá expresarse en valores monetarios >= cero. FEXE, FSEE,
CDE
e srl ; , , FE, CCFE,
2. Deberá indicar el valor monetario que se ha aplicado con cada forma de pago descrita en el FEXE, FSEE
campo "Código de forma de pago”. CDE ’
Monto por 3. Deberá seleccionar modalidad en que se entrega el efectivo donado (ver catálogo: CAT-017
157 pi, IO TA e CDE
forma de pago | Forma de pago), cuando campo "Tipo donación” esté completo con código 1.
4. Cuando campo “tipo de donación" esté completo con código 2 ¢ 3. podrá completar este A
campo con 0.00 ’ ’
CDE
"ni FE, CCFE,
5. La suma de las “n” formas de pago debe dar como resultado el Total a Pagar. Para el caso del FEXE, FSEE
CDE debe dar como resultado el Total de la Donación. CDE ’
, , . i mi FE, CCFE,
1. Cuando aplique tendrá una longitud máxima de 50 dígitos. FEXE, FSEE
2. Deberá ingresar la referencia de la modalidad de pago de la donación cuando campo "Tipo CDE
; donación" este completo con código 1.
Referencia de : = ,
: 3. Se valida campo null, cuando campo "Forma en que se entrega el efectivo donado" este
158 modalidad de La ; CDE
ado completo con la opción 01 (billetes y monedas).
pag 4. Cuando campo "Condición de la Operación" contenga la opción 2 - a crédito debe enviar la | FE, CCFE,
palabra null. FEXE, FSEE
5. Deberá ingresar referencia modalidad de pago cuando campo "Condición de la Operación” | FE, CCFE,
contenga las opciones 1 o 3. FEXE, FSEE
105

<!-- PAGE 106 / 112 (OCR) -->

, o , , FE, CCFE,
crédito. FEXE, FSEE
3. Cuando campo " Condición de la Operación" contenga una opción diferente a 2 - a crédito
debe enviar la palabra null. FEXE, FSEE
LC ; 0 i , FE, CCFE,
. Cuando aplique deberá ingresar periodo de plazo de acuerdo a catálogo CAT-018 Plazo. FEXE FSEE
160 Periodo de 2. Es requerido cuando en campo " Condición de la Operación" se haya elegido la opción 2 - a | FE, CCFE,
plazo crédito. FEXE, FSEE
3. Cuando campo * Condición de la Operación” contenga una opción diferente a 2 - a crédito | FE, CCFE,
debe enviar la palabra null. FEXE, FSEE
a. FE, CCFE
e [womans [e]
162 INCOTERMS Ambos, deberá seleccionar codificación de acuerdo a catálogo CAT-031 INCOTERMS.
Descripción , . , FEXE
escojan las opciones 1. Bienes o 3 Ambos.
Sección 10: EXTENSIÓN
Se detalla entre otros los datos generales de los responsables de entregar y recibir el documento, esta sección es opcional para los
DTE exceptuando a DCLE.
FE, CCFE,
1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null NRE NCE,
A NDE, CRE,
Nombre del CLE
que Genera el | afiliados.
DTE FE, CCFE,
3. Cuando se requiera no deberá exceder su longitud de 100 caracteres. NRE, NCE,
NDE, CRE,
CLE, DCLE
FE, CCFE,
1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null NRE NCE
, NDE, CRE,
Documento de CLE
de quien liquidación a los afiliados.
- genera el DTE FE, CCFE,
3. Cuando se requiera no deberá exceder su longitud de 25 caracteres
- - NDE, CRE,
CLE, DCLE
Codigo de Este campo es opcional cuando se requiera ingresar no debe exceder su longitud de 15
empleado
167 responsable de caracteres. DCLE
la liquidació Cuando no haga uso de este campo deberá ingresar null.
a liquidación
FE, CCFE,
. ; , NRE, NCE,
Nombre del 1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null. NDE CRE
responsable de CLE - ’
168 la operacion
FE. CCFE,
por parte del NRE. NCE
receptor 2. Cuando se requiera no deberá exceder su longitud de 100 caracteres. NDE CRE
CLE
106

<!-- PAGE 107 / 112 (OCR) -->

|
|
|
| CAMPO VALIDACIONES PARA CAMPOS DTE
| FE, CCFE,
Documento de ; ; NRE, NCE,
idenuticación 1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null.- NDE, CRE.
169 de responsable CLE
de la operacion FE, CCFE,
por parte del , , . NRE, NCE,
receptor 2. Cuando se requiera no deberá exceder su longitud de 25 caracteres. NDE, CRE,
CLE
170 Placa de 1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null. FE, CCFE
vehículo 2. Cuando se requiera no deberá exceder su longitud de 10 caracteres. FE, CCFE
FE, CCF,
1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null. Nos. un
_ CLE, FSEE
171 Observaciones FE, CCF,
, 2. Cuando se requiera no deberá exceder su longitud de 3000 caracteres. Nag hor
CLE, FSEE
”- Sección 11: APÉNDICE
Para informacion. propia del emisor, Cuando aplique esta sección podrá ingresarse hasta un máximo de 10 veces completando
Todos los campos.
172 Nombre del 1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null. TODOS
campo 2. Cuando se requiera no deberá exceder su longitud de 25 caracteres. TODOS
173 | Descripción 1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null. TODOS
Ue 2. Cuando se requiera no deberá exceder su longitud de 50 caracteres. TODOS
174 | Valor/dato 1. Este campo es opcional, cuando no lo requiera debe enviar la palabra null. TODOS
2. Cuando se requiera no deberá exceder su longitud de 150 caracteres. TODOS
Sección 12: SELLO DE RECEPCIÓN
No es una sección ni un campo de los documentos tributarios, se incorpora con la finalidad de
hacer del conocimiento al contribuyente que la Administración Tributaria enviará un código
Sello de encriptado con ese nombre, por cada documento tributario que haya sido correctamente
175 . o. TODOS
Recepción transmitido.
Deberá incorporar el sello de recepción enviado por la Administración Tributaria en el DTE que
entregue al receptor (exceptuando las operaciones generadas en Contingencia).
107

<!-- PAGE 108 / 112 (OCR) -->

ANEXO V
VALIDACIONES PARA CAMPOS EVENTOS
CAMPO VALIDACIONES PARA CAMPOS EVENTOS EVENTO
Sección 1: Identificación del evento
1. Campo requerido, debe ingresar el número de la versión invetidación
JSON vigente autorizada por la AT (será 2).
1 Versión
2. Campo requerido, debe ingresar el número de la versión Contingencia
JSON vigente autorizada por la AT (será 3). 9
1. Campo requerido, debe contener únicamente código según
2 Ambiente de destino codificación asignada en catálogo CAT-001 Ambiente de
1. Campo requerido, alfanumérico, debe cumplir con la
estructura definida por la AT, UUID v4. ¡ ¡
3 Código de generación 5
del evento idació
2. Código de generación debe ser único por tipo de
1. Campo requerido con Formato de fecha YYYY-MM-DD Invalidación
4 Fecha del evento de
Invalidación 2. No se aceptarán fechas que antecedan a la transmisión del anio
Invalidación
evento.
1. Campo requerido con formato de fecha YYYY-MM-DD
2. No se aceptarán fechas que antecedan a la transmisión del
5 Fecha transmisión del — | evento.
evento de contingencia | 3. Fecha transmisión del evento no deberá de exceder a 24
horas en referencia a la hora que se dio por finalizado el cese de ; ;
: e o NE Contingencia
la situación de fuerza mayor que impidió la transmisión de los
DTE.
Hora del Evento de 1. Campo requerido con estructura de hora de generación del invalidación
Invalidación evento de invalidación. Ejemplo HH:MM:SS (Formato 24 horas).
Hora transmisión del 1. Campo requerido con estructura de hora de generación del
7 : , evento de contingencia. Ejemplo HH:MM:SS (Formato 24 | Contingencia
evento contingencia
horas).
Sección 2: Identificación del Emisor
1. Campo requerido, NIT debe estar registrado como
contribuyente IVA activo según RUC.
NIT (Emisor) 2. Contribuyente debe ser emisor de DTE.
3. Longitud de estructura de NIT será de 9 o 14 dígitos sin
guiones ni otros caracteres especiales.
Nombre, denominación 1. Campo requerido, que detalle el nombre, denominación o
© razón social dal razón social del contribuyente emisor i i
contribuyente (Emisor) y :
Nombre del responsable | 1. Campo requerido, que detalle el nombre del responsable del , ,
10 e - : , . Contingencia
del establecimiento establecimiento que informa el evento de contingencia.
1. Campo requerido, deberá ingresar el código que corresponda
Tipo de documento de | al documento con el que se identifique el responsable del ; ;
11 ; e MU. , - , Contingencia
identificación. establecimiento que envía el evento de contingencia, de
acuerdo a catálogo CAT-022 Tipo de documento de receptor.
108

<!-- PAGE 109 / 112 (OCR) -->

| CAMPO VALIDACIONES PARA CAMPOS EVENTOS EVENTO
| Número de documento | 1. Debe ingresar el número de identificación del responsable del ; $
12 ; ei Le i i : Contingencia
| de identificación establecimiento para informar el evento de contingencia.
| 13 Tipo de establecimiento | 1. Campo requerido, únicamente aceptará codificación según
| (Emisor) catálogo CAT-009 Tipo de Establecimiento.
|
| Nombre de 1. Debera completar el nombre de casa
| 14 al : matriz/sucursal/agencia/bodega donde fue generado el evento Invalidación
| establecimiento (Emisor) AO
| de invalidación.
| Congo del 1. Este campo es opcional, deberá ingresar el tipo de
15 establecimiento Gori .
; establecimiento que le asigne el MH cuando sea otorgado. : :
| asignado por el MH Contingencia
| : Codigo del 1. Este campo es opcional, cuando desee ingresar información
establecimiento " oll : — Co
16 : deberá ingresar el código de tipo de establecimiento que utilice Invalidación
asignado por el : a
, el contribuyente internamente.
. - Contribuyente.
| Congo del Punto de 1. Este campo es opcional, cuando se otorgue deberá ingresar
17 Venta (Emisor) asignado eódico del tod t le asi LME
por el MH el código del punto de venta que le asigne el MH.
Código del Punto de 1. Este campo es opcional, cuando requiera ingresar
| 18 Venta (Emisor) asignado | informacion deberá colocar el código del punto de venta que Invalidación
| por el contribuyente utilice el contribuyente internamente.
| 1. Campo requerido, deberá ingresar el número de teléfono del
19 Teléfono (Emisor) establecimiento donde se genera el evento, tendrá una longitud -
| mínima de 8 y máxima de 30 caracteres.
20 Correo electrónico 1. Campo requerido, estructura de correo electrónico con
| (Emisor) dominio de nivel superior valido.
Sección 3: Información del DTE en contingencia.
1. Formato números correlativo mayores a cero, tendrá un , ;
o ; 1 Contingencia
21 N° de ítem máximo de 1000 ítem.
2. Número entero sin punto y sin decimales a su derecha.
1. Debe contener el código del tipo de documento en
. contingencia de acuerdo a catálogo CAT-023 Tipo de | Contingencia
22 Tipo de ke ti en | documento en contingencia.
Senungencis 2. Solo aplicarán en contingencia los siguientes DTE: O1-FE, 03- Continmencia
CCFE, 04-NRE, 05-NCE, 06-NDE, 11-FEXE y 14-FSEE. 9
1. Campo requerido, se valida que este codigo de generacion
sea Unico por documento longitud maxima de 36 digitos
incluyendo guiones. Debe cumplir con la estructura definida por
la AT, UUID v4. Contingencia
, Nota: Se valida que la estructura tenga números y letras
23 Código de generación mayúsculas.
Sel dosent 2. No debe ingresar DTE que hayan obtenido el sello de Conti .
o , " , ontingencia
recepción, ni documentos invalidados.
3. Se podrán ingresar desde uno hasta un máximo de 5000
códigos de generación de documentos electrónicos generados , i
. . A Contingencia
en contingencia, detallando un código de generación por cada
línea.
1 Control de Cambios No. 1.1 Modificación 4 de junio de 2024
109
|
|

<!-- PAGE 110 / 112 (OCR) -->

CAMPO VALIDACIONES PARA CAMPOS EVENTOS EVENTO
NOTA: Se podrá informar en este listado todos los diferentes
tipos de documentos que se hayan generado en contingencia.
(es decir que no necesariamente deben ser del mismo tipo).
Sección 4: Motivo de la Contingencia
24 Fecha inicio 1. Campo requerido, deberá ingresar fecha en que inicio la Contingencia
de contingencia contingencia con formato YYYY-MM-DD 9
1. Campo requerido, debera ingresar la fecha de finalizacion de Contingencia
25 Fecha fin contingencia con formato YYYY-MM-DD 9
de contingencia
2. Fecha fin debe ser mayor o igual que la fecha de inicio.
26 Hora inicio de 1. Campo requerido, debe ingresar hora en que dio inicio la Cantindenaia
Contingencia contingencia en formato HH:MM:SS (Formato 24 horas). 9
1. Campo requerido. debe ingresar hora en que finalizó la Conti .
, , . ontingencia
37 Hora fin de contingencia contingencia en formato HH:MM:SS (Formato 24 horas).
2. Hora fin debe ser mayor que la hora de inicio.
, . . 1. Campo requerido, con uno de los códigos contenidos en . .
22 Tipo de Contingencls catálogo CAT-005 Tipo de Contingencia. Contingencia
1. Sera requerido cuando campo tipo de contingencia este : i
Ce Contingencia
¿lleno con la opción 5.
2. Se validará campo null cuando en campo ‘Tipo de
29 Motivo de Contingencia | contingencia” este lleno con una opción diferente a 5. (podrá
describir motivo de contingencia cuando haya seleccionado | Contingencia
cualquiera de las opciones contenidas en el catálogo CAT-005
Tipo de contingencia).
Sección 5: Detalle del DTE a Invalidar
, . 1. Se deberá ingresar el código del documento a Invalidar según Ci
30 Tipo de DTE a Invalidar catálogo: CAT-002 Tipo de documento. Invalidación
1. Debe ingresar el código de generación contenido en el a
Ng A Invalidación
documento que se está invalidando.
2. El código de generación debe tener correspondencia con
Código de generación información del emisor y receptor descritos y contar con sello Invalidación
3 del DTE a invalidar | de recepción.
3. Cuando ingrese códigos de generación de CCFE o CRE estos
no deberán estar ajustados con NCE O NDE (si es necesaria la invelidación
invalidación deberá primero invalidar las NDE o NCE para
posteriormente invalidar el CCFE o CRE).
Sello de recepción del 1. Debe ingresar el sello de recepción contenido en el TE
32 , ; o ! Invalidación
DTE a invalidar documento que se está invalidando.
Número de Control del | 1. Deberá ingresar el número de control del DTE que se desea dsrió
33 : : , Invalidación
DTE a Invalidar invalidar
Fecha de generación del 1. Deberá ingresar la fecha contenida en campo ‘fecha de
34 9 generación” del DTE que se desea invalidar con formato YYYY- Invalidación
DTE a Invalidar
MM-DD.
1. Cuando el documento a Invalidar sea FE, CCFE o FEXE, será
Monto Total de la requerido completar el valor del campo "Monto total de la Invalidación
35 Operacion del DTE a operación” del DTE a Invalidar.
Invalidar 2. Cuando se detalle DTE distinto a CCFE, FE o FEXE, debera Ca
Invalidacion
completar con 0.00.
110

<!-- PAGE 111 / 112 (OCR) -->

|
CAMPO VALIDACIONES PARA CAMPOS EVENTOS EVENTO
1. Campo requerido, se deberá ingresar el código de generación
del nuevo documento que reemplace al invalidado cuando Invalidacion
campo ‘Tipo de Invalidación” contenga la opción 1 0 3.
Cadiao de generación 2 El DTE que reemplaza debe haber obtenido previamente sello
e recepción.
36 del documento que
reemplaza al invalidado | 3. Se valida con null cuando el campo ‘Tipo de DTE a Invalidar”
contenga los códigos 05-Nota de Crédito o 08- Comprobante Invalidación
de Liquidación este campo será null.
4. Deberá ingresar null cuando campo ‘Tipo de Invalidación” ich
os Invalidacion
contenga la opción 2.
1. Deberá ingresar el código que corresponda al tipo de
"E documento de identificación con el que se identificó al receptor Invalidación
37 Tipo de documento de | en el DTE a invalidar.
identificación (Receptor) | 2. Se valida campo null, si campo tipo de documento de
identificación del receptor en la factura también es null. Invalidación
(únicamente aplica a factura).
1. Deberá ingresar número de documento de Identificación del invalidación
Número de documento | receptor contenido en el DTE a invalidar.
38 de Identificación 2. Se valida campo null, si campo "Número de documento de
(Receptor) Identificación (Receptor) * en la factura también es null. Invalidación
(únicamente aplica a factura).
Nombre, denominación , inaria , ;
30 o razón social del 1. Campo requerido, Nombre, denominación o razón social del Invalidación
; receptor.
contribuyente (Receptor)
40 Teléfono (Receptor) de Campo opcional, cuando lo requiera podrá ingresar hasta un invalidación
máximo de 3 números telefónicos separados por comas.
Correo electrónico 1. Campo opcional, con estructura de correo electrónico con idarió
41 O ; : : Invalidación
(Receptor) dominio de nivel superior valido.
. Sección 6: Motivo de la invalidación
42 Tipo de Invalidación 1 Campo requerido con codificación según catálogo CAT-024 Invalidación
Tipo de Invalidación.
43 Motivo de Invalidación 1. Campo requerido. con descrinción delos Campos dente se Invalidación
encuentra el error que ocasiona el evento de invalidación.
Responsable de Invalidar | 1. Campo requerido, con nombre de la persona responsable. de do
44 ° - N Invalidación .
el documento (Emisor) | invalidar el DTE.
Tipo de documento de
45 identificación del 1. Deberá seleccionar codificación de acuerdo a catálogo CAT- Invalidación
responsable de Invalidar | 022 de tipo de documento de identificación.
el documento (Emisor)
Número de documento , ,
Lea 1. Campo requerido con número de documento de idarió
46 de Identificación , tie ma . Invalidacion
identificacion del responsable de Invalidar el documento.
(emisor)
Nombre de quien 1. Campo requerido con el nombre de la persona que solicita
47 solicita Invalidar el +. —-ampo TEduel P q Invalidación
invalidar de invalidar el DTE.
documento
Documento de
48 identificación de quien 1. Deberá seleccionar codificación de acuerdo a catálogo CAT- Invalidación
solicita Invalidar el 022 de tipo de documento de identificación
documento
111

<!-- PAGE 112 / 112 (OCR, poco texto) -->

CAMPO VALIDACIONES PARA CAMPOS EVENTOS EVENTO
. Número de . 1. Campo requerido, deberá ingresar número de documento de
Identificación de quien |: vo ii : A ; N —
49 NU , identificación de quien solicita invalidar el documento Invalidación
solicita Invalidar el
(receptor).
documento
Sección 7: Sello de Recepción
No es una sección ni un campo de los documentos tributarios,
se incorpora con la finalidad de hacer del conocimiento al
50 Sello de recepción contribuyente que la Administración Tributaria enviará un
código encriptado con ese nombre, por cada evento que haya
sido correctamente transmitido.
112
