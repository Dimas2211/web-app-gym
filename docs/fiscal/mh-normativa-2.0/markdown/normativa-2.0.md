<!-- Fuente: originales/Normativa de Cumplimiento de los Documentos Tributarios Electrónicos_Versión 2.0.pdf | Páginas: 137 | PDF escaneado (productor RICOH IM C6010) sin capa de texto: contenido obtenido por OCR local (Windows.Media.Ocr, es-MX) sobre render a 300 dpi. Filas reconstruidas por coordenadas; " | " = separación horizontal amplia (posible columna de tabla). Puede contener errores de OCR: el PDF original es la fuente oficial. -->


<!-- PAGE 1 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 1. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

[Escudo de la República de El Salvador]

MINISTERIO DE HACIENDA

NORMATIVA DE CUMPLIMIENTO

DE LOS DOCUMENTOS TRIBUTARIOS ELECTRÓNICOS

Versión 2.0

25 de mayo de 2026

<!-- PAGE 2 / 137 (OCR) -->

ÍNDICE

1. Objeto
2. Ámbito de aplicación .

2,1 Sujetos..

2.1.1 Sujetos Obligados

2.1.1.1 Sujetos obligados voluntariamente...

2.1.2 Responsabilidad de los sujetos

22 Programa de Implementación...

3. Definiciones
4. Documentos Tributarios Electrónicos y Eventos | -11

4.1 Efectos de los Documentos Tributarios Electrónicos y Eventos,..... | 12

5. Estructura de Datos y Formato Electrónico. | 12

5.1 Especificaciones tecnológicas y con fines de controL | . 13

6. Emisión | 13

6.1 Emisión con Transmisión Previa Normal a la Administración Tributaria. | . 13

6.2 Emisión con Transmisión Diferida Normal a la Administración Tributaria. Excepción, 13

6.3 Emisión con Transmisión Diferida por Contingencia a la Administración Tributaria 14

7. Generación. | 14

7.1 Contenido de los DTE y Eventos | 14

7.1.1 Código de | 15

7.1.2 Número de Control. | 15

7.2 Regla de Redondeos....-..--..-- | 16

a) Redondeos en Sección Cuerpo:.. | 16

b) Redondeos en Sección Resumen: | 16

7.3 Regla de Holgura: | 16
-
Cuadro 1: Holgura | 16
.
Cuadro 2: Cuerpo-.. | .17

Cuadro 3: Resumen .

8. Firma electrónica .
8.1 Efectos de la Firma electrónica | 18
..
9. Transmisión. | -18

Cuadro 4: Transmisión DTE, | 1.8

Cuadro 5: Transmisión Eventos | 19
.
9.1. | 19

9.2. Condiciones de Transmisión | 19
.

<!-- PAGE 3 / 137 (OCR) -->

9.3. Estado Transitorio del Documento Electrónico | .20

10. Reglas para el otorgamiento del Sello de Recepción

10.1- Estados de los documentos y eventos. | . 22

10.2. Registro y declaración de los DTE y Eventos | 22

11. Entrega de los DTEr Eventos y Representaciones Gráficas. Excepción. | 23

11.1 Entrega con Transmisión Previa. | 24

112 Entrega con Transmisión Diferida . | .24

11.3 Representaciones Gráficas | -25

11.3.1 Correspondencia con DTE o Evento

12. Conservación de los DTE, Eventos y Representaciones | -26

12.1 Orden y conservación

12.2 Protección de datos | 27

12.3 Certificación legal de los DTE y Eventos | 27

13. Eventos

13.1 Evento de Invalidación

Cuadro 6: invalidación. | 28

13.1.1 Lineamientos para el Evento de Invalidación | ...28
..... | .
13.1.1.1 Reglas para invalidación de Facturas, Facturas de Exportación Electrónicas y
Facturas de Sujeto Excluido | 29

13.1.1.2 Diferencia entre error y afectación . | .29

13.1.2 Efectos del Evento de

13.2 Evento de Contingencia - | -30

Cuadro 7: Contingencia

13.2.1 Lineamientos para el Evento de Contingencia..................

13.2.1.1 Informe Técnico de Contingencia - | 31

13.22 Efectos del Evento de Contingencia | 31

13.3 Evento de Retorno . | 31

Cuadro 8: | .. 32

Lineamientos para el Evento de Retorno | 32

13.32 Efectos det Evento de Retorno | 32

13.3.2.1 Diferencia entre retorno y | 32

13.3.2.2 Diferencia entre retorno e invalidación . | -32

13.4 Evento de Operaciones Especiales.--..-.. | -33

Cuadro 9: Operaciones Especiales | 33

13.4.1 Lineamientos para el Evento de Operaciones Especiales | 33
......
13.4.2 Efectos del Evento de Operaciones | 33

<!-- PAGE 4 / 137 (OCR) -->

14. Consulta | .34

15. Coexistencia
16. Gratuidad | -34

17. Fechas y condiciones para liberación de la presentación de informes..... | 34

18. Lineamientos para Actualizaciones y Versiones,.,.. | -34

19. Anexos | 35
.
20. Vigencia | 35

ANEXO I | 36

ESPECIFICACIONES TECNOLÓGICAS. | 36

1. Generación de los DTE y Eventos | 36
.
1.1. Transparencia tecnológica | 36

1.1.1 Recursos.. | 36

1.2. Código de Generación | .36
.
1.3. Número de Control.. | -36

1.4. Campos y Secciones............. | 37

1.5. Definición de condiciones de campo. | 39

1.6. Estructura de Datos | 39

Formato Electrónico | 39

1.8. Catálogos | .39
,
2. Firma electrónica | _ 40

2,1. Condiciones y mecanismos de firma | .40

Cuadro 10: Firma
2.2 Condiciones y mecanismos de validación.... | 41

3. Transmisión... | 41

3.1. Ambientes de Transmisión....... | 41

3.2. Autenticación | 42

3.3. Recepción de {os DTE y Eventos.. | 42

3.4. Sello de Recepción | .42
.
3.5. Consulta del Estado del Servicio de Recepción | 42
.
4. Entrega.
4.1. Archivo DTE | _ 43

Cuadro 11: Archivo DTE.... | _ 44

5. Módulos | .44

6. Seguridad. | 44

6.1. Copias de Seguridad. | 45

<!-- PAGE 5 / 137 (OCR) -->

7. Flujo de proceso DTE y Eventos

8. Glosario para estructuras DTE y Eventos | 47

ANEXO If | 48

ESTRUCTURA DE DATOS DTE | 48

Sección 1: IDENTIFICACIÓN | 48
_
Sección 2: DOCUMENTOS REIMCIONADOS

Sección 3: EMISOR | 51

Sección 4. RECEPTOR | 53
.
Sección 5: DOCUMENTOS ASOCIADOS. | 56

Sección 6: VENTAS POR CUENTA DE TERCEROS | .59

Sección 7: COMPRA POR CUENTA DE TERCEROS....- | .60

Sección 8: CUERPO | 61

Sección 9: RESUMEN | 71

Sección 10: EXTENSIÓN. | 79

Sección 11: APÉNDICE. | 79

Sección 12: SELLO DE RECEPCIÓN | 80

ANEXO III . | 81

ESTRUCTURA DE DATOS EVENTOS | 81
Sección 1: IDENTIFICACIÓN DEL EVENTO.... | 81

Sección 2: DOCUMENTOS RELACIONADOS | 82

Sección 3: IDENTIFICACIÓN DEL EMISOR | 83

Sección 4: INFORMACIÓN DEL DOCUMENTO/ EVENTO EN CONTINGENCIA | -85

Sección 5: MOTIVO DE LA CONTINGENCIA.. | 86

Sección 6: DETALLE DE APLICACIÓN DEL EVENTO | 87

Sección 7: VENTAS POR CUENTA DE TERCEROS | -89

Sección 8: COMPRA POR CUENTA DE TERCEROS | -89
.
Sección 9: CUERPO . | 9C)

Sección 10: RESUMEN - | 95

Sección 11: MOTIVO DEL EVENTO....

Sección 12: APÉNDICE.. | ...100

Sección 13: SELLO DE RECEPCIÓN | ..100

ANEXO IV. | -102

VALIDACIONES PARA CAMPOS | .102
Sección 1: IDENTIFICACIÓN | .102

Sección 2: DOCUMENTOS RELACIONADOS | .103

<!-- PAGE 6 / 137 (OCR) -->

Sección 3: EMISOR. | 104

Sección 4: RECEPTOR | 106

Sección 5: DOCUMENTOS ASOCIADOS | 107

Sección 6: VENTA POR CUENTA DE TERCEROS... | -109

Sección 7: COMPRA POR CUENTA DE TERCEROS.... | .109

Sección 8: CUERPO | 110

Sección 9: RESUMEN | .117

Sección 10: EXTENSIÓN | 122

Sección 11: APÉNDICE | 122

Sección 12: SELLO DE RECEPCIÓN | 122
ANEXO V | 123

VALIDACIONES PARA CAMPOS EVENTOS | 123
.
Sección 1: IDENTIFICACIÓN DEL EVENTO- | 123

Sección 2: DOCUMENTOS RELACIONADOS | .124

Sección 3: IDENTIFICACIÓN DEL EMISOR | 124
Sección 4' INFORMACIÓN DEL DOCUMENTO/ EVENTO EN CONTINGENCIA.. | 126

Sección 5: MOTIVO DE CONTINGENCIA. | .126

Sección 6: DETALLE DE APLICACIÓN DEL EVENTO | 126

Sección 7: VENTAS POR CUENTA DE TERCEROS.. | .128

Sección 8: COMPRA POR CUENTA DE TERCEROS | .128
.
Sección 9: CUERPO | 128

Sección 10: RESUMEN | 132

Sección 11: MOTIVO DEL EVENTO. | 134

Sección 12: APÉNDICE..... | 135

Sección 13: SELLO DE RECEPCIÓN | 135
ANEXO VI | .136

MODIFICACIONES.... | 136

<!-- PAGE 7 / 137 (OCR) -->

La Dirección General de Impuestos Internos, con base a 10 establecido en los artículos ly 3 de la
Ley Orgánica de la Dirección General de Impuestos Internos, 119-A inciso segundo del Código
Tributario y 160 de la Ley de Procedimientos Administrativos; y,

CONSIDERANDO:

Que mediante Decreto Legislativo No. 230, de fecha 14 de diciembre de 2000, publicado
en el Diario Oficial No. 241, Tomo 349, del 22 de ese mismo mes y año se emitió el Código
Tributario, el cual ha sido objeto de reformas mediante los Decretos respectivos. Dentro de
esas reformas, se encuentra la contenida en el Decreto Legislativo No. 487, de fecha 30 de
agosto de 2022, publicado en el Diario Oficial No. 197 Tomo 436, de fecha 20 de
septiembre de 2022, en el cual se adicionó al Código Tributario la Subsección Primera, de
la Sección Quinta del Capítulo ! del Título III, sobre Documentos Tributarios Electrónicos.

II. Que, habiéndose aprobado las disposiciones legales específicas relativas al uso de tales
documentos, esta Administración Tributaria de acuerdo a 10 dispuesto en el artículo 119-A
inciso segundo del Código Tributario, el día trece de enero de dos mil veintitrés emitió la
primera versión correspondiente a la Normativa de Cumplimiento de los Documentos
Tributarios Electrónicos y con fecha cuatro de junio de dos mil veinticuatro, emitió
modificaciones puntuales a dicha Normativa.

Que la dinámica vigente de los Documentos Tributarios Electrónicos requiere que los
procesos tributarios de los sujetos pasivos se desenvuelvan a través de las medidas
pertinentes que permitan su expresión electrónica en un ambiente de control que facilite
las operaciones, por 10 que es imperativo que la Administración Tributaria adopte tales
medidas conforme a sus facultades legales contenidas en el artículo 119-A inciso primero
literales a) y g) del Código Tributario, estableciendo reglas, forma, plazos y condiciones para
la generación de documentos y demás eventos que sean necesarios para el control de las
operaciones de los sujetos pasivos, relacionados con los citados documentos.

Que, por (o anterior, es necesario actualizar las correspondientes normas administrativas,
de acuerdo a 10 establecido en el artículo 119-A inciso segundo del Código Tributario, el
cual establece que la Administración Tributaria está facultada para emitir la normativa que
garantice el adecuado cumplimiento de las obligaciones relativas a dichos documentos.
Asimismo, que dicha normativa será de estricto cumplimiento para los sujetos pasivos,
pudiendo ejercerse las facultades sancionatorias ante su incumplimiento.

POR TANTO. se emite la siguiente:

NORMATIVA DE CUMPLIMIENTO DE LOS
DOCUMENTOS TRIBUTARIOS ELECTRÓNICOS

1. Objeto

La presente Normativa está compuesta por reglas enumeradas por categorías y tiene por objeto
establecer las condiciones necesarias para la correcta generación, firma, transmisión, recepción y
entrega de los Documentos Tributarios Electrónicos (DTE) y Eventos; así como sus especificaciones
y demás procedimientos aplicables, que garanticen el adecuado cumplimiento de las obligaciones
legales relacionados a los mismos.

z Ámbito de aplicación

7

<!-- PAGE 8 / 137 (OCR) -->

Las disposiciones establecidas en la presente Normativa serán de estricto cumplimiento para los
sujetos pasivos emisores de Documentos Tributarios Electrónicos y Eventos, de acuerdo con 10
establecido en el artículo 119-A inciso segundo del Código Tributario.

2.1 Sujetos

Los sujetos pasivos emisores de Documentos Tributarios Electrónicos y Eventos son los siguientes:

Contribuyentes del Impuesto a la Transferencia de Bienes Muebles y a la Prestación de
Sewicios.
Emisores de Comprobantes de Retención del Impuesto a la Transferencia de Bienes
Muebles y a la Prestación de Servicios designados por la Administración Tributaria.
Emisores de Comprobantes de Donación.

2.1.1 Sujetos Obligados

Los sujetos pasivos obligados para emitir DTE y Eventos son aquellos notificados para tal efecto por
la | 22 R
la Administración Tributaria a través de los medios pertinentes, conforme a regla Programa
de Implementación" de esta Normativa.

2.1.1.1 Sujetos obligados voluntariamente

Adquieren la calidad de sujetos obligados, los sujetos pasivos que opten por emitir Documentos
Tributarios Electrónicos Eventos sin estar notificados para ello, debiendo cumplir con las
y
disposiciones establecidas en el Código Tributario y la presente Normativa, según 10 dispuesto en
el artículo 119-C inciso octavo del referido Código.

2.12 Responsabilidad de los sujetos

La Administración Tributaria establecerá las condiciones de acceso y uso de las plataformas del
"Sisterna de Transmisión* y del "Sistema de Facturación", siendo responsabilidad de los sujetos
pasivos el buen uso de estas, por 10 que no se permitirá abusos a dichas plataformas, conductas
contrarias a la ley, a la presente Normativa, a derechos o intereses de terceros. En estos últimos
casos, la Administración Tributaria podrá enlistar a los sujetos pasivos responsables y/o pausar de
manera temporal preventiva los accesos a partes o a la totalidad de los servicios de recepción de
y
documentos electrónicos o a los contenidos de dichas plataformas, así como a sus opciones de
configuraciónt cuando se detecten dichos abusos o conductas del contribuyente. Asimismot les
infortnará los medios oficiales que estime pertinentes, el motivo de la pausa preventiva de los
por
servicios, a efecto que éstos corrijan e informen 10 pertinente a la Adrninistración Tributaria
mediante los canales oficiales establecidos en la opción de "Consultas" de la sección Contáctenos"
del sitio https://factura.gob.sv, | que les sea restablecido el acceso y uso de las referidas
para
plataforrnas.

2.2 Programa de Implementación

La Administración Tributaria establecerá tos grupos de sujetos pasivos y las fechas de inicio de la
obligación para emitir los Documentos Tributarios Electrónicos y Eventos.

8

<!-- PAGE 9 / 137 (OCR) -->

Los sujetos pasivos obligados en cada grupo serán notificados por ta Administración Tributaria a
través de los medios pertinentes y deberán solicitar y obtener la autorización para ser emisores de
tales documentos y el certificado de firma respectivo e iniciar la transmisión de todos los tipos de
Documentos Tributarios Electrónicos y Eventos que emiten de conformidad a su operatividad y
obligaciones, en todos sus establecimientos, a la plataforma informática establecida por la
Administración Tributaria.

Los sujetos pasivos usuarios de la plataforma VSistema de Transmisión" tendrán hasta un mes
contado a partir del día siguiente al de ta referida autorización, para iniciar la emisión de los
Documentos Tributarios Electrónicos y Eventos, siempre y cuando no excedan a la fecha de inicio
de la obligación antes mencionada.

3. Definiciones

Para los efectos de 10 establecido en el Código Tributario y en la presente Normativat se entenderá
por:

Anexo: Documento emitido por la Administración Tributaria que forma parte integrante de esta
Normativa y que contiene las instrucciones, condiciones especiales y mecanismos tecnológicos
para la generación, firma, transmisión, recepción y entrega al receptor de los Documentos
Tributarios Electrónicos y de los Eventos.

Archivo DTE: Es un archivo electrónico de extensión JSON que contiene: La Estructura de Datos
establecida en los Anexos II y III de esta Normativa por tipo de documento o evento, firmado de
acuerdo a las Guías y Manuales emitidos por la Administración Tributaria para tal efecto,
incorporando el Sello de Recepción otorgado por la Administración Tributaria. EI Archivo DTE
deberá identificarse de forma única y universal con el Código de Generación,

Campo: Es el componente de la estructura de datos que contiene la información relacionada con
las reglas, requisitos o especificaciones de tos Docutnentos Tributarios Electrónicos o Eventos.

Certificado de firma electrónica falso: Es el certificado que declara uno o más datos alterados o
manipulados a partir de su creación, para efecto de 10 establecido en el artículo 199 del Código
Tributario.

Código de Generación: Es un número identificador único, aleatorio y universal, en formato IJUID
(Identificador Único Universal) versión 4, que servirá para la correcta identificación e
individualización del documento o evento transmitido.

Contingencia: Se refiere a la situación imprevista ocasionada por caso fortuito o fuerza mayor que
impida la transmisión previa de los documentos o eventos a la Administración Tributaria.

Documento Electrónico Apócrifo: Es el documento electrónico generado para lesionar el interés
fiscal o de tercerost por vicios en su autenticidad de forma o contenido, conforme a 10 establecido
en el artículo 199 inciso tercero del Código Tributario y en la presente Normativa,

Documento Tributario Electrónico (DTE): Es el documento tributario generado con la Estructura
de Datos, Formato Electrónico, firmado y transmitido electrónicamente conforme a 10 establecido
por la Administración Tributaria y que cuenta con el Sello de Recepción otorgado por la misma.

9

<!-- PAGE 10 / 137 (OCR) -->

Emisor: Sujeto pasivo que expide Documentos Tributarios Electrónicos o Eventos, en
cumplimiento a 10 establecido en el Código Tributario, la presente Normativa de Cumplimiento,
Guías y Manuales emitidas por esta Administración Tributaria,

Establecimiento: Lugar donde se verifica el hecho generador de la obligación tributaria o se
realizan operaciones por los sujetos pasivos.

Estructuras de Datos: Conjunto de eletnentos o carnpos que integran el formato electrónico del
documento o evento.

Evento: Se refiere a un mensaje de datos estructurado firmado electrónicamente que contiene
información que se transmite a la Administración Tributaria y que cuenta con el Sello de Recepción
otorgado por la misma, en ocasión de operaciones que se relacionan con documentos
electrónicos u otros eventos vinculados a documentos previamente emitidos o datos para informar
operaciones de otros documentos de relevancia fiscal.

Evento de Contingencia: Mensaje de datos estructurado firmado electrónicamente que se genera
y transmite a la Administración Tributaria una vez cese la situación de caso fortuito o fuerza mayor
que imposibilitó la transmisión del documento electrónico o evento a la Administración Tributaria.

Evento de Invalidación: Mensaje de datos estructurado firmado electrónicatnente que se genera
y transnnite a la Administración Tributaria en ocasión de errores, ajustes o rescisiones en los
Documentos Tributarios Electrónicos o eventos transmitidos, a efecto de la invalidación de estos.

Evento de Retorno: Mensaje de datos estructurado firmado electrónicamente que se genera y
transmite a la Administración Tributaria y que cuenta con el Sello de Recepción otorgado por la
misrna, para reportar et retorno de bienes vendidos o comprados y la disminución o reembolso de
servicios, en operaciones que no implican ajuste a crédito fiscal para el receptor.

Evento de Operaciones Especiales: Mensaje de datos estructurado firmado electrónicamente que
se genera y transmite a la Administración Tributaria para informar operaciones de interés fiscal,
realizadas por los sujetos pasivos.

Fecha de Generación/ Fecha del Evento: Es la fecha del DTE o Evento, que se corresponde con
la fecha en que realiza la operación u ocurre el evento.

Fecha de Transmisión: Es la fecha en que se transmite el DTE o Evento a la Administración
Tributaria.

Firma Electrónica: Son los datos en forma electrónica, consignados en un documento o evento
generado, que permiten la identificación del emisor del documento o evento transmitido a la
Administración Tributaria e indicar que el firmante aprueba la información recogida en el mensaje
de datos o documento o evento electrónicot para el otorgamiento del Sello de Recepción.

Formato Electrónico: Corresponde a la especificación que define la forma en que se organiza y
se codifica la información de la Estructura de Datos de un documento o evento electrónico
generado, que en el caso de Documentos Tributarios Electrónicos y Eventos se refiere al formato
JSON

10

<!-- PAGE 11 / 137 (OCR) -->

Generación: Proceso mediante el cual la Estructura de Datos se incorpora en el Formato
Electrónico JSON.

Gestor de Facturación Electrónica: Es el conjunto organizado de componentes y funcionalidades
utilizadas por los sujetos pasivos, para la generación, firma, transmisión y entrega de los DTE y
Eventos.

Holgura: Es la diferencia permitida en los campos numéricos de los DTE y Eventos.

Número de Control: Código alfanumérico compuesto por cuatro secciones, que identifica los
datos relativos al tipo de documento electrónico, el código det establecimiento y punto de venta y
el número consecutivo del documento,

Plataforma Informática: Corresponde al servicio dispuesto por la Administración Tributaria para la
transmisión de los DTE y Eventos.

Punto de Venta: Es el lugar físico o virtual en que se utiliza el Gestor de Facturación Electrónica,
mediante un dispositivo local o remoto, para la emisión de los DTE y Eventos.

Receptor: Sujeto que recibe el Documento Tributario Electrónico o Evento que ampara la
operación efectuada o las deducciones de las erogaciones correspondientes.

Redondeo: Consiste en una regla fija para determinar en cada operación la última posición decimal
dentro del rango, la cual se elevará cuando la primera posición decimal fuera de rango sea igual o
mayor a 5.

Sello de Recepción: Código otorgado por la Administración Tributaria, que acredita la correcta
transmisión y recepción de los documentos y Eventos generados y firmados, así como el carácter
de Documento Tributario Electrónico. No otorga validez a la operación sino a la transmisión
conforme a la estructura de datos y formato electrónico establecidos.

Sitio Emisores DTE: Es el servicio dispuesto por la Administración Tributaria para que los Emisores
de DTE o Eventos puedan realizar las gestiones operativas relacionadas con los mismos.

Transmisión: Proceso de envio de un documento o evento firmado electrónicamente, hacia la
plataforma informática de la Administración Tributaria, con el objetivo de obtener el Sello de
Recepción.

Validación: Es el procedimiento realizado por la Administración Tributaria con el objetivo de
verificar el cumplimiento de las Reglas para el otorgamiento del Sello de Recepción establecidas
en la presente Normativa, en cada documento o evento electrónico transmitido a la misma.

4. Documentos Tributarios Electrónicos y Eventos

Conforme a 10 dispuesto en los artículos 119-C y 119C del Código Tributario, los Documentos
Tributarios Electrónicos que serán emitidos por parte de los sujetos pasivos a que hace referencia
el numeral 2.1 de la presente Normativa, son los siguientes:

a) Comprobante de Crédito Fiscal Electrónico (CCFE).
b) Factura Electrónica (FE).

11

<!-- PAGE 12 / 137 (OCR) -->

c) Factura de Exportación Electrónica (FEXE).
d) Nota de Remisión Electrónica (NRE).
e) Nota de Crédito Electrónica (NCE)
f) Nota de Débito Electrónica (NDE).
g) Comprobante de Liquidación Electrónico (CLE),
h) Comprobante de Retención IVA Electrónico (CRE).
i) Documento Contable de Liquidación Electrónico (DCLE).
j) Factura de Sujeto Excluido Electrónica (FSEE).
k) Cornprobante de Donación Electrónico (CDE)

La Factura de Venta Simplificada estará sujeta al Evento de Operaciones Especiales, conforme a 10
dispuesto en la regla 13.5 de esta Normativa.

Conforme a 10 establecido en los artículos 119-A inciso primero literal g), 119-E y 119-F del Código
Tributario, los Eventos que serán transtnitidos por parte de los sujetos pasivos a que hace referencia
el numeral 2.1 de la presente Normativa, son los siguientes:

a) Evento de Invalidación.
b) Evento de Contingencia,
c) Evento de Retorno.
d) Evento de Operaciones Especiales.

4.1 Efectos de los Documentos Tributarios Electrónicos y Eventos

Conforme a 10 dispuesto en el artículo 107 del Código Tributario los documentos establecidos en
et Título III, Capítulo l, Sección Quinta, que comprende la Subsección Primera, son emitidos para
sustentar las operaciones relacionadas con los tributos internos que regula dicho Código y dan
cuenta de ta existencia de la obligación tributaria.

Las negociaciones particulares que establezcan estipulaciones, condiciones u otras obligaciones
relativas a Documentos Tributarios Electrónicos, agregadas al documento o relacionadas mediante
instrumento separado, no tendrán efectos sobre los resultados propios del hecho generador, de
conformidad a 10 establecido en el artículo 17 del Código Tributario.

A partir del otorgamiento del Sello de Recepción las deducciones de las erogaciones que se
respalden con Documentos Tributarios Electrónicos, serán admitidas siempre y cuando dichos
documentos cumplan con 10 establecido en el artículo 206 inciso tercero del Código Tributario,
por 10 que podrán amparar las deducciones de las erogaciones correspondientes, según 10
dispuesto en el artículo 119-D inciso segundo del Código Tributario,

Los efectos de los Eventos se encuentran establecidos en las reglas: 13.1.2 "Efectos del Evento de
Invalidación", 13.2.2 "Efectos del Evento de Contingencia", 13.3.2 "Efectos del Evento de Retorno", y
13,42 "Efectos del Evento de Operaciones Especiales", de esta Normativa.

5. Estructura de Datos y Formato Electrónico

La Estructura de Datos la emisión de los citados documentos y eventos deberá efectuarse de
para
conformidad a las especificaciones establecidas en el artículo 119-G del Código Tributario y a 10
dispuesto en el artículo 119-A inciso primero literal g) det citado Código, conforme a los Anexos II
"ESTRUCTURA DE DATOS DTE y III "ESTRUCTURA DE DATOS EVENTOS" de la presente Normativa.

12

<!-- PAGE 13 / 137 (OCR) -->

EI Formato Electrónico para la emisión de los Docutnentos Tributarios Electrónicos y Eventos se
encuentra descrito en el Anexo l: "ESPECIFICACIONES TECNOLÓGICAS" de esta Normativa.

5.1 Especificaciones tecnológicas y con fines de control

Las especificaciones especiales a que se refiere el inciso segundo del artículo 119-G del Código
Tributario, necesarias por razones tecnológicas o con fines de control, se encuentran incorporadas
contenida el Anexo II: d ESTRUCTURA DE DATOS DTEa de la
en la tabla de estructura de datos | en
presente Normativa.

6. Emisión

Los sujetos pasivos, ser emisores de Documentos Tributarios Electrónicos y transmitir los
para
Eventos correspondientes, deberán obtener previamente la Autorización respectiva y el Certificado
de Firma Electrónica.

Además, deberán cumplir con las instrucciones contenidas en las Normas, Leyes, Guías y Manuales
emitidos por la Administración Tributaria y disponer de todos los medios adecuados y suficientes,
tanto técnicos o administrativos, que aseguren el cumplimiento de la emisión de los DTE y la
transmisión de los Eventos que correspondan.

De conformidad a 10 dispuesto en los artículos 119-A inciso primero literal a) y 119C del Código
Tributario, la emisión de Documentos Tributarios Electrónicos y la transmisión de los Eventos
deberá cumplirse de la forma como se indica a continuación:

6.1 Emisión con Transmisión Previa Normal a la Administración Tributaria

Conforme a 10 dispuesto en el inciso primero literal g) del artículo 119-A y artículo 119-C del
Código Tributario, como regla general, los sujetos pasivos deberán transmitir a la
Administración Tributaria los archivos electrónicos de los documentos y eventos para el
otorgamiento del Sello de Recepción previamente a su entrega al receptor. Lo anterior
aplica para transmisiones de documentos y eventos uno a uno o por lote, conforme a los
lineamientos establecidos en las Guías y Manuales emitidos por (a Administración Tributaria
para tal efecto.

6.2 Emisión con Transmisión Diferida Normal a la Administración Tributaria.
Excepción.

Excepcionalmente, de conformidad a 10 dispuesto en el inciso primero literal g) del artículo
119-A e inciso tercero del artículo 119-C del Código Tributario, la Administración Tributaria
podrá autorizar mediante resolución a tos sujetos pasivos para transmitir los documentos y
eventos en modalidad diferida normal, conforme al siguiente orden: generación, firma
electrónica, entrega al receptor del documento electrónico en estado transitorio (conforme
la regla 11.2 "Entrega con Transmisión Diferida" de esta Normativa) o del Evento respectivo
y posteriormente, la transmisión de los documentos o eventos a la Administración Tributaria
el otorgamiento diferido del Sello de Recepción, dentro del plazo establecido en la
para
regla 2 del Cuadro 4: Transmisión DTE" y en la regla 2 del Cuadro 5: Transmisión Eventos"
de la regla 9 Transmisión" de esta Normativa, siempre y cuando presenten prueba idónea
justifique la imposibilidad de realizar la transmisión y entrega de los mismos, según el
que

13

<!-- PAGE 14 / 137 (OCR) -->

orden dispuesto para la Transmisión Previa Normal. Lo anterior aplica únicamente para
transmisiones de DTE o Eventos por lote, conforme a los lineamientos establecidos en las
Guías y Manuales emitidos por la Administración Tributaria para tal efecto.

6.3 Emisión con Transmisión Diferida por Contingencia a la Administración Tributaria

De conformidad a 10 dispuesto en el inciso primero literal g) del artículo 119-A e inciso
tercero del artículo 119-C del Código Tributario, los sujetos pasivos estarán autorizados para
transmitir en modalidad diferida en los casos y condiciones en que realicen operaciones en
contingenciat conforme al siguiente orden: generación, firma electrónica, entreqa al
receptor del documento electrónico en estado transitorio (conforme la regla 11.2 "Entrega
con Transmisión Diferida" de esta Normativa) o del Evento respectivo, y superada la
situación de caso fortuito o fuerza mayor que dio lugar a la contingencia, deberá
transmitirse el respectivo Evento de Contingencia y posteriormente la transmisión a la
Administración Tributaria de los documentos y eventos correspondientes que fueron
generados en contingencia, para el otorgamiento diferido del Sello de Recepción, dentro
del plazo establecido en la regla 3 del Cuadro 4. "Transmisión DTE" y en la regla 3 del
Cuadro 5: "Transmisión Eventos", de la regla 9 'Transrnisión" de esta Normativa. Para este
efecto, no se requiere resolución previa por parte de la Administración Tributaria. Lo anterior
aptica para transmisiones uno a uno o por lote, conforme a los lineamientos establecidos
en las Guías y Manuales emitidos por la Administración Tributaria para tal efecto,

Los DTE se tendrán por emitidos cuando han sido generados, firmados, transmitidos a la
Administración Tributaria, poseen Sello de Recepción y han sido entregados al receptor.

Los Eventos se tendrán por transmitidos cuando han sido generados, firmados, enviados a (a
Administración Tributaria y poseen Sello de Recepción. No obstante, respecto de los Eventos de
Invalidación y Retorno, el sujeto pasivo emisor deberá entregarlos junto con su Representación
Gráfica a los receptores.

7. Generación

De conformidad a 10 dispuesto en el artículo 1194 inciso primero literales b) y g) del Código
Tributario, se establece que la Generación de los Documentos Tributarios Electrónicos y Eventos
es un procedimiento que consiste en estructurar los datos que contendrán los mismos en formato
electrónico.

Los DTE se generan cuando se causan los hechos generadores del impuesto a la Transferencia de
Bienes Muebles y a la Prestación de Servicios y en el caso de las donaciones, en el momento en
que efectivamente se hayan realizado.

Los Eventos se generan con la fecha en que ocurran dentro del plazo que establezca la
Administración Tributaria, de conformidad a 10 establecido en la presente Normativa.

7.1 Contenido de los DTE y Eventos

Conforme a 10 establecido en el artículo 119-G del Código Tributario, los Documentos Tributarios
Electrónicos deberán contener:

14

<!-- PAGE 15 / 137 (OCR) -->

a) Los requisitos expresados por tipo de documento en los literales a), b), c), d), e), f), g), h), i)
y j) del inciso primero del referido artículo.

b) Las demás requisitos o especificaciones especiales establecidas por la Administración
Tributaria en el Anexo tl "ESTRUCTURA DE DATOS DTEV de esta Normativa, conforme al
inciso segundo del cítado artículo.

Los Eventos deberán contener las especificaciones establecidas por la Administración Tributaria en
ei Anexo til nESTRUCTURA DE DATOS EVENTOS" de esta Normativa.

Los documentos y eventos podrán incorporar información complementaria siempre que sea:

i) | Compatible con la Estructura de Datos y contenido de los campos establecidos en los
referidos Anexos II y III, cuando afecta a los totales de la operación.

Exclusivamente informativa y no afecta a los totales de la operación.

Los emisores deberán ingresar correctamente los datos de los DTE/ eventos y se someterán a la
responsabilidad correspondiente en caso de informar datos inexactos o incompletos,

7.1.1 Código de Generación

Durante el procedimiento de generación, deberá incorporarse al documento o evento el Código
de Generación, comprendiendo 32 dígitos hexadecimales divididos en cinco grupos cuyo detalle
técnico encuentra la | 1.2 | de Generación& del Anexo l: Ñ ESPECIFICACIONES
se | en regla Código
TECNOLÓGICAS" de esta Normativa.

Los Documentos Tributarios Electrónicos y los Eventos deberán identificarse de forma única y
universal mediante el Código de Generación,

EI Código de Generación se genera aleatoriamente, no debe ser correlativo ni predecible,
debiéndose utilizar IJUID versión 4.

7.1.2 Número de Controt

Durante el procedimiento de generación, deberá incorporarse al documento electrónico el
Número de Control, cuya estructura comprende cuatro secciones de conformidad la regla 1.3
"Número de Control* del Anexo l: RESPECIFICACIONES TECNOLÓGICASH de esta Normativa.

La numeración consecutiva de la cuarta sección del KNúmero de Control" deberá configurarse de
esta forma:

a. Centralizada: cuando se trate de sujetos que no poseen establecimientos o en
caso poseerlos, estos mantienen la numeración secuencial de quince dígitos de forma
centralizada. Es decir, que el número consecutivo es continuo sin importar el
establecimiento desde donde se genere el DTE.

b. Por Establecimiento: cuando se trate de sujetos que poseen varios
establecimientos, deberá llevarse de manera que se agote la numeración secuencial de

15

<!-- PAGE 16 / 137 (OCR) -->

quince dígitos por cada uno de ellos. Es decir, cada establecimiento tendrá una numeración
consecutiva independiente.

No podrá asignarse la numeración consecutiva por Punto de Ventas o por tipo de
documento salvo autorización expresa por medio de resolución emitida por la
Administración Tributaria.

EI número consecutivo deberá reiniciarse en "000000000000001" a partir del prirner DTE
de cada ejercicio impositivo.

7.2 Regla de Redondeos

Los campos numéricos de los DTE o Eventos deberán cumplir con las siguientes reglas de
redondeo:

a) Redondeos en Sección Cuerpo:

Se permitirá hasta ocho posiciones decimales (fraccionaria) en los campos numéricos
de los DTE o Eventos. En consecuencia, cuando la novena posición decimal de estos
campos sea igual o nnayor a 5, la octava posición decimal se deberá redondear 1 hacia
arriba.

Ejemplos: 1.123456784 1.12345678
1.123456785 1.12345679
1.123456786 -9 112345679

b) Redondeos en Sección Resumen:

Se permitirá hasta dos posiciones decimales (fraccionaria) en los campos numéricos
de la Sección Resumen de los DTE o Eventos. En consecuencia, cuando la tercera
posición decimal de estos catT3pos sea igual o mayor a 5, la segunda posición decimal
se deberá redondear 1 hacia arriba.

Ejemplos: 1.124 -5 1.12
1.125 113
1.126 113

7.3 Regla de Holgura:

La diferencia permitida en los campos numéricos de los DTE o Eventos será de una centésima, de
esta forma

Valor | Redondeo | Hol ura (-001) Hol ura (40,01)
1.124 | 112 | 111 | 1.13
1125 | 1.13 | 1.12 | 1.14
1.126 | 1.13 | 1.12 | 14
Cuadro 1: Holgura

En ese sentido, sin perjuicio de las posiciones decimales utilizadas por los sujetos pasivos en sus
operaciones internas, éstos deberán cumplir con las anteriores reglas de redondeos y holgura en

16

<!-- PAGE 17 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 17. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

la generación de los DTE o Eventos, ajustándose a ocho posiciones decimales los campos por ítem
y a dos posiciones decimales los campos de la Sección Resumen, dentro de la holgura antes
establecida.

Ejemplo Sección Cuerpo:

| Operación del sujeto pasivo<br>Precio x cantidad | Valor por ítem (8 decimales)<br>Precio x cantidad | Sumatoria de Venta (Máximo 8 decimales)<br>Holgura (-0.01) | Sumatoria de Venta (Máximo 8 decimales)<br>Holgura (+0.01) |
|---|---|---|---|
| 1.1234567845678901 | 1.12345678 | 1.11345678 | 1.13345678 |
| 1.1267890167890123 | 1.12678902 | 1.11678902 | 1.13678902 |

Cuadro 2: Cuerpo

Ejemplo Sección Resumen:

| Total de ventas gravadas (8 decimales) | Holgura de ítem | Valor resumen (2 decimales) | Sumatoria de Venta (Máximo 2 decimales)<br>Holgura (-0.01) | Sumatoria de Venta (Máximo 2 decimales)<br>Holgura (+0.01) |
|---|---|---|---|---|
| 2.25024580 | (0.00) | 2.25 | 2.24 | 2.26 |
| 2.23024580 | (-0.01) | 2.23 | 2.22 | 2.24 |
| 2.27024580 | (+0.01) | 2.27 | 2.26 | 2.28 |

Cuadro 3: Resumen

Los campos de la Sección Resumen se deberán calcular con base a los decimales de los campos
por ítem del DTE o Evento y no con las posiciones decimales utilizadas por los sujetos pasivos en
sus operaciones internas.

8. Firma electrónica

Con base a lo dispuesto en el artículo 119-C inciso cuarto del Código Tributario, los sujetos pasivos
deberán firmar electrónicamente los Documentos Tributarios Electrónicos que emitan y los
Eventos que transmitan, conforme a las condiciones y mecanismos de Firma Electrónica
establecidos en la regla 2. FIRMA ELECTRÓNICA, del Anexo I: "ESPECIFICACIONES
TECNOLÓGICAS" de la presente Normativa.

Para hacer uso de la firma electrónica, deberá obtenerse previamente el certificado emitido por la
Administración Tributaria, el cual únicamente podrá utilizarse para emitir DTE o Eventos. El
certificado es único y tiene valor mientras dure su vigencia o no haya sido cancelado.

El sujeto pasivo será el único responsable en caso de uso indebido o erróneo del certificado de
firma y de su conservación, por lo que deberá cerciorarse de cumplir con las especificaciones e
instrucciones proporcionadas por la Administración Tributaria.

La función de firma establecida se corresponde con el estándar JWS (JSON Web Signature), lo que
garantiza la identificación del sujeto pasivo, la integridad del contenido e indica que el firmante
aprueba la información contenida en el documento o evento electrónico.

17

<!-- PAGE 18 / 137 (OCR) -->

La Administración Tributaria podrá establecer la fecha a partir de la cual se permitirá el uso de
certificados emitidos por un proveedor autorizado de servicios de certificación, a que se refiere el
artículo 43 de la Ley de Firma Electrónica, a efecto de incorporar en los documentos que transmita
la firma electrónica certificada correspondiente.

8.1 Efectos de la Firma electrónica

La firma electrónica otorga a los documentos el valor probatorio establecido en la Ley de Firma
Electrónica; no obstante, son deducibles fiscalmente siempre y cuando cuenten con el Sello de
Recepción correspondiente, de conformidad a 10 establecido en los artículos 1190 inciso segundo
y 206 del Código Tributario.

Asimismo, según 10 dispuesto en el artículo 199 inciso segundo del Código Tributario, los
documentos electrónicos firmados no transmitidos a la Administración Tributaria presumen la
generación de ingresos gravados por las transferencias de bienes o prestación de servicios,

La firma electrónica del documento o evento acredita la identidad del sujeto pasivo firmante,
vinculándolo con el acto tributario realizado e indica que este aprueba la información contenida en
los mismos de forma oponible, conforme a 10 dispuesto en el artículo 3 inciso primero literal l) de
la Ley de Firma Electrónica.

9. Transmisión

De conformidad a 10 dispuesto en el artículo 1194 inciso primero literal d) del Código Tributario, la
Transmisión de los Documentos Electrónicos a la Administración Tributaria, según la modalidad de
emisión, se realizará como se establece a continuación:

Forma de
Modalidad | Entrega at Tipo de Documento
No. | Transmisió | Plazo de Transmisión
de Emisión | Receptor | Electrónico
n
1 Normal | previa Antes de su entrega al receptor, | Electrónica Todos los descritos en el
numeral 4 de la presente
Normativa.
2 Normal Diferida Hasta un día posterior contado a partir Electrónica Únicamente para CCFE, NCE,
de la generación y entrega al receptor. | NDEI NRE, CRE, FE, FEXE y
FSEE, del numeral 4 de la
presente Normativa.
3 Contingencia Diferida Hasta 72 horas contadas a partir del Electrónica Unicamente para CCFE, NCEt
otorgamiento del Sello de Recepción | NDE, NRE, CRE, FE, FEXE y
del Evento de Contingencia. | FSEE, del numeral 4 de la
presente Normativa.
Cuadro 4: Transmisión DTE

De conformidad a 10 dispuesto en el artículo 119-A inciso primero literal g) del Código Tributario, la
Transmisión de los Eventos a la Administración Tributaria, según ta modalidad de emisión, se
realizará como se establece a continuación:

18

<!-- PAGE 19 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 19. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | Modalidad de Transmisión | Forma de Transmisión | Plazo de Transmisión | Entrega al Receptor | Tipo de Evento |
|---|---|---|---|---|---|
| 1 | Normal | Previa | Antes de su entrega al receptor. | Electrónica | Todos los descritos en este punto. |
| 2 | Normal | Diferida | Hasta un día posterior contado a partir de la generación y entrega al receptor. | Electrónica | Únicamente para el Evento de Retorno. |
| 3 | Contingencia | Diferida | Respecto del Evento de Invalidación, hasta 24 horas contadas a partir del cese de la situación de caso fortuito o fuerza mayor que provocó la contingencia.<br><br>Respecto del Evento de Retorno, hasta 72 horas contadas a partir del otorgamiento del Sello de Recepción del Evento de Contingencia. | Electrónica | Únicamente para el Evento de Retorno. |

Cuadro 5: Transmisión Eventos

La forma y condiciones para la Transmisión de los Documentos Tributarios Electrónicos y Eventos
se encuentra establecida en la regla 3. TRANSMISIÓN del Anexo I: "ESPECIFICACIONES
TECNOLÓGICAS" de la presente Normativa.

9.1. Plataformas

Las plataformas los DTE y Eventos son:

a) **Sistema de Transmisión:** Su función es la transmisión de los datos de los DTE y Eventos
desde el Gestor de Facturación Electrónica de cada sujeto pasivo al servicio de recepción
de la Administración Tributaria.

   Los sujetos pasivos que utilicen esta plataforma deberán adecuar su sistema informático
   interno de acuerdo con los requerimientos técnicos funcionales específicos a su modelo
   de negocio, de forma que sea compatible con los servicios de recepción de documentos
   y eventos de la Administración Tributaria, sin perjuicio de poder utilizar las tecnologías que
   mejor les resuelva dicha compatibilidad. El sistema deberá ajustarse a las disposiciones
   pertinentes del Código Tributario, de esta Normativa y de las Guías y Manuales emitidos por
   la Administración Tributaria para tal efecto y completar satisfactoriamente las pruebas
   mínimas requeridas.

b) **Sistema de Facturación:** Su función es la generación, firmado y transmisión de los datos
de los DTE y Eventos desde el Sitio Emisores DTE o mediante aplicación para dispositivos
móviles.

   Los sujetos pasivos que utilicen esta plataforma deberán cumplir con los parámetros
   definidos por la Administración Tributaria para la transmisión de los DTE y Eventos y
   completar satisfactoriamente las pruebas mínimas requeridas.

Los DTE y Eventos generados en ambiente para pruebas carecen de valor legal.

9.2. Condiciones de Transmisión

19

<!-- PAGE 20 / 137 (OCR) -->

La transmisión de los DTE y Eventos deberá efectuarse en el orden lógico para su procesamiento,
de manera que aquellos que afecten, ajusten, disminuyan o invaliden operaciones, se transmitan
posteriormente a los DTE y Eventos afectados, ajustados, disminuidos o invalidados. Lo anterior es
aplicable para transmisiones uno a uno o por lote de DTE, Evento de Retorno y Evento de
Operaciones Especiales, y para transmisiones uno a uno de los Eventos de invalidación y Evento de
Contingencia. Para afectar a un DTE con otro o con los Eventos de Invalidación y Retorno, el DTE
afectado deberá estar previarnente transmitido. Lo anterior es aplicable para afectar a un Evento
con otro,

Los sujetos pasivos deberán transmitir a la Administración Tributaria los documentos o eventos
firrnados de acuerdo con las Guías y Manuales respectivos, para efecto de obtener el Sello de
Recepción.

Los datos de acceso del Sitio Emisores DTE, las credenciales API para el uso de la plataforma del
"Sistema de Transmisión" y las claves de la firma electrónica, son exclusivos del sujeto pasivo y
deberán ser custodiados por este Asimismo, asumirá los riesgos de seguridad en caso de compartir
o permitir la exposición de sus datos, credenciales o claves a terceros, sin perjuicio de la
responsabilidad legal correspondiente frente a la existencia de abusos a la plataforma por tal causa,
y se hará acreedor a la sanción respectiva.

9,3. Estado Transitorio del Documento Electrónico

Se refiere al estado provisional del documento o evento electrónico cuya validez está condicionada
al otorgatniento del Sello de Recepción por la Administración Tributaria, encontrándose dentro de
los plazos de transrnisión establecidos en la presente Normativa, por contingencia u otra causa,
habiendo sido generado según el formato y estructura determinados y firrnado conforme a las
condiciones y mecanismos de Firrna Electrónica establecidos por la Administración Tributaria; por
10 tanto, el documento o evento electrónico en estado transitorio deberá registrarse
contablemente; sin perjuicio de las presunciones establecidas en el artículo 199 inciso segundo det
Código Tributario.

En caso de rechazo parte de la Administración Tributaria del documento o evento electrónico
por
en estado transitorio transmitido, la operación deberá corregirse y documentarse mediante la
generación, firma y transmisión de un documento o evento que obtenga el correspondiente Sello
de Recepción y realizar el ajuste contable respectivo de ser el caso.

Los referidos documentos y eventos electrónicos en estado transitorio no constituyen facturas
co:nerciales, en tanto consisten en mensajes de datos estructurados y firmados que deben ser
transmitidos a la Administración Tributaria para obtener el Sello de Recepción; por 10 que, el sujeto
pasivo deberá conservarlos durante el plazo correspondiente, sin perjuicio de la aplicación de
sanciones en caso de incurnplimiento.

10. Reglas para el otorgamiento del Sello de Recepción

De conformidad a 10 dispuesto en los artículos 119-A inciso pritnero literal f) y 119-C inciso quinto
del Código Tributario, una vez se hayan generado, firmado y transmitido los Documentos
Electrónicos los Eventos respectivos, la Administración Tributaria verificará el cumplimiento de las
y
siguientes reglas, previo al otorganniento del Sello de Recepción:

20

<!-- PAGE 21 / 137 (OCR) -->

1. Cumplir con los contenidos y especificaciones formales, con fines tecnológicos y de
control descritas en las Estructuras de Datos que se encuentran establecidas en los Anexos II:
"ESTRUCTURA DE DATOS DTEO y III: "ESTRUCTURA DE DATOS EVENTOS"

2, Haber sido generados en el Formato Electrónico establecido en la regla 1.7 Tormato
Electrónico" del Anexo l: "ESPECIFICACIONES TECNOLÓGICAS" para cada tipo de
Documento y Evento.

3, Incorporar firma electrónica de conformidad con las condiciones y mecanismos
establecidos para el efecto en la regla 2. FIRMA ELECTRÓNICA del Anexo l:
RESPECIFICACIONES TECNOLÓGICAS".

4. Cumplir con los plazos o tiempos asociados a la transmisión de documentos y eventos
previstos en la regla 9. Transmisióng de la presente Normativa.

5. Cumplir con las reglas de validación para documentos y eventos establecidas en los Anexos
IV: "VALIDACIONES PARA CAMPOS DTC-g y V: UVALIDACIONES PARA CAMPOS EVENTOS" de
la presente Normativa.

Si cumple con las anteriores reglas, la Administración Tributaria otorgará el Sello de Recepción, con
10 cual los documentos electrónicos transmitidos tendrán el carácter de Documentos Tributarios
Electrónicos y se tendrán por transmitidos los Eventos correspondientes, surtiendo los efectos
establecidos en la regla 4.1 "Efectos de los Documentos Tributarios Electrónicos y Eventos" de la
presente Normativa.

Los documentos y eventos transmitidos que no cumplan con las reglas para el otorgamiento del
Sello de Recepción, tendrán que ser corregidos o subsanados dentro del plazo de 24 horas
contadas a partir de la fecha de comunicación del motivo de rechazo por la Administración
Tributaria.

Los documentos y eventos corregidos que sean retransmitidos para obtener el Sello de Recepción,
deberán llevar el mismo Código de Generación que poseían los documentos rechazados
originalmente, salvo que el motivo de rechazo se deba a dicho Código. Deberá evitarse la
redundancia en la transmisión de los documentos y eventos una vez obtenida la respuesta de
recepción o rechazo de la Administración Tributaria.

En caso la información contenida en el Documento Tributario Electrónico sea alterada
posteriormente al otorgamiento del Sello de Recepción, se considerará que existe lesión al interés
fiscal para los efectos de 10 establecido en los artículos 199 incisos segundo y tercero y 206 inciso
quinto del Código Tributario.

Asimismo, conforme al inciso tercero del artículo 119-D del Código Tributario, el otorgamiento del
Sello de Recepción, no implica validación o autorización alguna de la operación que se documentat
ni que el documento o evento no pueda ser objetado por la Administración Tributaria en el ejercicio
de sus facultades legales. EI otorgamiento o no del citado sello no afecta la validez jurídica intrínseca
de la operación o negocio efectuado.

Cuando la Administración Tributaria actualice las Reglas para el otorgamiento del Sello de
Recepción, éstas serán comunicadas a los sujetos pasivos, quienes deberán implementarlas en
todos los DTE y Eventos aplicables dentro del plazo que la misma establezca.

21

<!-- PAGE 22 / 137 (OCR) -->

10.1. | Estados de los documentos y eventos

Realizado el proceso para la obtención del Sello de Recepción, los documentos y eventos
transmitidos podrán tener los siguientes estados

Transmitido satisfactoriamente: Habiendo obtenido el Sello de Recepción se tiene por
efectuada la transmisión. Dentro de este estado se presentan las siguientes condiciones:

o Ajustado Cuando el documento transmitido ha sido objeto de ajustes mediante
otro documento o evento.

o Observado: EI documento o evento tiene observaciones de la Administración
Tributaria, que no afectan su validez jurídica.

Rechazado: EI documento o evento no obtuvo el Sello de Recepción. Conforme al inciso
segundo del artículo 199 del Código Tributario, se presurnirá que et documento ha sido
generado para documentar ingresos por las transferencias de bienes o prestación de
servicios gravadas.

Invalidado: EI documento o evento obtuvo el Sello de Recepción, pero posteriormente el
emisor transmitió un Evento de Invalidación para invalidarlo. EI documento o evento
invalidado no posee validez tributaria y quedará sin valor alguno la Representación Gráfica
entregada.

Transitorio. EI documento o evento electrónico que se encuentra dentro de los plazos de
transmisión establecidos en la presente Normativa, habiendo sido generado según el
formato y estructura determinados y firmado conforme a las condiciones y mecanismos
de Firma Electrónica establecidos por la Administración Tributaria.

10.2. | Registro y declaración de los DTE y Eventos

Los documentos electrónicos en estado transitorio que fueron entregados sin Sello de Recepción
por los sujetos pasivos autorizados conforme a 10 establecido en la regla 11.2 "Entrega con
Transmisión Diferida" de esta Normativa, presumen ingresos por las transferencias de bienes o
prestación de servicios gravadas, de conformidad a 10 establecido en el artículo 199 inciso segundo
del Código Tributario, por 10 que deberán registrarse en los libros de control del Impuesto a la
Transferencia de Bienes Muebles y a la Prestación de Servicios y en la contabilidad, utilizando el
Código de Generación con la fecha en que fueron generados.

Los receptores de documentos electrónicos en estado transitorio que fueron entregados sin Sello
de Recepción por los sujetos pasivos autorizados conforme a 10 establecido en la regla 11.2 "Entrega
con Transmisión Diferida" de esta Normativa, podrán consultar en el sitio web del Ministerio de
Haciendat que los documentos recibidos cuenten con el citado Sello, a efecto de amparar las
deducciones de las erogaciones correspondientes. No serán deducibles los documentos recibidos
mientras no hayan obtenido el sello de recepción otorgado por la Administración Tributaria.

22

<!-- PAGE 23 / 137 (OCR) -->

Asimismo, los sujetos pasivos deberán incorporar los DTE/Eventos en sus declaraciones del
Impuesto a (a Transferencia de Bienes Muebles y a la Prestación de Servicios, según su Fecha de
Generación o Fecha del evento.

11- Entrega de tos DTE, Eventos y Representaciones Gráficas. Excepción.

La entrega al receptor de los Documentos Tributarios Electrónicos y de los Eventos de Invalidación,
y Retorno, se realizará de forma electrónica, conforme a 10 establecido en el artículo 119-A inciso
primero literal b) del Código Tributario, por 10 que deberá entregárseles un Archivo DTE
comprendiendo la información establecida en la regla 4.1 del Anexo I de esta Normativa, junto con
su Representación Gráfica para respaldar las deducciones de las erogaciones, la cual, únicamente
podrá utilizarse para tal efecto cuando se corresponda con su respectivo DTE,

EI medio de entrega al receptor deberá ser objeto de acuerdo entre este y et emisor, como parte
de la negociación comercial. Para este propósito, los emisores de DTE deberán instaurar (os medios
tecnológicos que sean necesarios. A falta de acuerdo, la entrega se realizará a través de medios
tecnológicos de comunícación que dejen rastro perceptible, de conformidad a 10 establecido en el
artículo 20 de la Ley de Firma Electrónica.

La entrega del D T E, Eventos y sus Representaciones Gráficast podrá efectuarse mediante
tecnologías inmediatas que brinden disponibilidad para su recepción, tales como: enlaces por
radiofrecuencia, correos electrónicos, aplicaciones de mensajería instantánea, mecanismos de
intercambio de datos determinados entre las partes a través de protocolos de transferencia de
archivos cliente-servidor y/o por medio de tecnologías mediatast tales corro: la descarga por el
receptor en sitio web expuesto por el emisor, mediante carga por el emisor en sitio web expuesto
por el receptor o mediante dispositivos portátiles para el almacenamiento de datos.

Los documentos electrónicos, eventos y sus Representaciones Gráficas, están entregados cuando
exista evidencia de su envío o disponibilidad en el repositorio concertado con el receptor.

En tos casos de fusión, liquidación y/o desinscripción del Impuesto a la Transferencia de Bienes
Muebles y a la Prestación de Servicios del emisor, que haya expuesto en sitio web la descarga por
el receptor, dicho sitio deberá continuar disponible durante el plazo de sesenta días hábiles a partir
del cese de actividades por tales causast a efecto que el receptor realice la correspondiente
descarga de los documentos y eventos, para su registro y declaración correspondientes.

Cuando el receptor no proporcione la información necesaria para recibir el DTE, Evento y su versión
legible, la entrega podrá efectuarse a través de un sitio de descarga segura y de confianza, para la
autogestión por el receptor, mediante enlaces URL o almacenados en Códigos QR (Quick
Response), especialmente destinados para ello, que deberán proporcionarse al receptor junto con
la información necesaria, para que este pueda acceder fácilmente a sus documentos electrónicos,
La descarga en sitio deberá estar disponible en todo momento y permitir al receptor su acceso
seguro y exclusivo tanto al Archivo DTE, Evento, como a su Representación Gráfica, EI emisor
también podrá utilizar el servicio de alojamiento de archivos o de almacenamiento masivo de datos
expuesto por el receptor, para 10 cual, éste deberá habilitarle al emisor los permisos respectivos y
proporcionarle la información necesaria para la transmisión del DTE o Evento y su Representación
Gráfica.

Excepcionalmente, en caso el receptor no pueda disponer de ningún medio tecnológico, a
solicitud de éste, podrá entregársele ta Representación Gráfica del DTE o Evento, en formato físico.

23

<!-- PAGE 24 / 137 (OCR) -->

En este caso, dicha Representación Gráfica estará condicionada a la comprobación de su
correspondencia con su DTE y que no haya sido invalidado, según 10 establecido en el inciso cuarto
del artículo 206 del Código Tributario y tendrá la función de consulta a que se refiere la regla 14.
"Consulta" de esta Normativa.

La omisión en la entrega de los documentos electrónicos, eventos y sus Representaciones Gráficas
dará lugar a las sanciones establecidas en el Código Tributario. La Administración Tributaria no
subrogará al emisor en el cumplimiento de la obligación de entregarlos.

Los documentos electrónicos en estado transitorio y eventos generados, firmados y entregados en
las modalidades de Emisión con Transmisión Diferida Normal y de Emisión con Transmisión
Diferida por Contingencia, conforme a 10 dispuesto en las reglas 6.2 y 6.3 de esta Normativa, no
poseen Sello de Recepción al momento de su entrega; no obstante, por estar firmados
electrónicamente tienen el valor probatorio que les concede la Ley de Firma Electrónica hasta la
obtención del citado Sello de Recepción. Los documentos electrónicos y eventos generados,
firmados y entregados en dichas modalidades, que no sean transmitidos a la Administración
Tributaria por el emisor dentro del plazo establecido en la regla 9, 'Transmisión" de esta Normativa
y que no posean dicho Sello, no estarán emitidos ni aplicados para efectos tributarios, sin perjuicio
de 10 establecido en el artículo 199 inciso segundo del Código Tributario y de la responsabilidad
frente al receptor que dicha omisión le hubiera causado.

Cuando se causen los hechos generadores del Impuesto a la Transferencia de Bienes Muebles y a
la Prestación de Servicios, la entrega de los DTE que documenten transferencias de bienes o
prestaciones de servicios no deberá diferirse o retenerse por la falta de pago.

Se deberá tomar en cuenta 10 siguiente:

11.1 Entrega con Transmisión Previa

Los Documentos Tributarios Electrónicos generados y transmitidos a la Administración
Tributaria, deberán entregarse íntegramente de forma electrónica al receptor, junto con su
Representación Gráfica, incorporando el Sello de Recepción otorgado por la mismat en la
modalidad establecida en la regla 6.1 de la presente Normativa.

Conforme a 10 dispuesto en el artículo 119-C inciso sexto det Código Tributario, es
obligación de los receptores exigir la entrega de los Documentos Tributarios Electrónicos,
10 que implica que deberán exigirlos con el respectivo Sello de Recepción otorgado por la
Administración Tributaria, excepto en los casos de Contingencia, que no contarán con
dicho Sello, pero deberán expresar en su contenido el valor de campo Tipo de
Transmisión" por contingencia, Código 2, conforme al CAT-004 'Tipo de Transmisión".

11.2 Entrega con Transmisión Diferida

EI documento electrónico en estado transitorio que haya sido generado en las modalidades
establecidas en los numerales 62 "Emisión con Transmisión Diferida Normal a la
Administración Tributaria" y 6.3 VEmisión con Transmisión Diferida por Contingencia a la
Administración Tributaria" de la presente Normativa, se entregará de fortna electrónica at
receptor, junto con su Representación Gráfica, sin contar con el Sello de Recepción, no
obstante, la transmisión de los documentos se deberá realizar posteriormente a la
Administración Tributaria conforme a 10 establecido en la regla 9 "Transmisión" de esta

24

<!-- PAGE 25 / 137 (OCR) -->

Normativa. Una vez recibido el Sello de Recepción, el emisor deberá integrarlo en el Archivo
DTE que finalmente podrá remitir al receptor.

Si los documentos entregados al receptor en las modalidades establecidas en los citados
numerales 6.2 y 6,3 difieren de los documentos recibidos por la Administración Tributaria,
prevalecerán estos últimos, de conformidad a 10 dispuesto en el artículo 206 inciso quinto
del Código Tributario,

Sin perjuicio de 10 anterior, de conformidad al inciso segundo del artículo 199 del Código
Tributario, se presumirá que los documentos que no fueron transmitidos a la Administración
Tributaria, han sido generados para documentar ingresos por las transferencias de bienes o
prestación de servicios gravadas.

Si la información contenida en el documento electrónico en estado transitorio entregado
al receptor conforme a las modalidades establecidas en las reglas 62 "Emisión con
Transmisión Diferida Normal a la Administración Tributaria" y 6.3 "Emisión con Transmisión
Diferida por Contingencia a la Administración Tributaria", es alterada para su transmisión y
otorgamiento del Sello de Recepción, dicho documento podrá considerarse lesivo al
interés fiscal.

11.3 Representaciones Gráficas

Los sujetos pasivos deberán generar y entregar en todo caso una versión electrónica
interpretada del DTE y Evento que sea fácilmente comprensible para el receptor, para 10
cual, deberán utilizar el diseño gráfico idóneo por tipo de documento tributario,
correspondiéndose con los datos del DTE o Evento transmitido a la Administración
Tributaria, cumpliendo los contenidos, características y especificaciones conforme a 10
dispuesto en la columna "Representación Gráfica" de las estructuras contenidas en los
Anexos II y III: *ESTRUCTURA DE DATOS DTE" y "ESTRUCTURA DE DATOS EVENTOS" de
esta Normativa.

Dicho diseño deberá ser utilizado de manera uniforme y única para cada tipo de DTE y
Evento que se representen mediante Representaciones Gráficas de un mismo sujeto pasivo,

La Representación Gráfica del DTE o Evento, como expresión de los mismos, deberá
generarse de manera simultánea y entregarse junto con dicho DTE o Evento por cada
operación que realicen los sujetos pasivos,

La Representación Gráfica del DTE o Evento deberá conservar en su formato los nombres
de cada campo descritos en tos citados Anexos II y III. No obstante, los sujetos pasivos
podrán agregar junto a dichos nombres, la denominación que en su modelo de negocio
cumpla igual función y valor.

Los documentos digitales en formato portable o imágenes y los documentos impresos, no poseen
la estructura de datos ni el formato electrónico establecido por la Administración Tributaria, por 10
tanto, no son Documentos Tributarios Electrónicos.

Las Representaciones Gráficas generadas en ambiente para pruebas deberán destacar la
advertencia de que dichos documentos carecen de valor legal por tratarse de documentación de
ensayo con información aparente.

25

<!-- PAGE 26 / 137 (OCR) -->

11.3.1 Correspondencia con DTE o Evento

Para los efectos de 10 dispuesto en el inciso cuarto del artículo 206 del Código Tributario,
las Representaciones Gráficas se corresponden con su Documento Tributario Electrónico
o Evento, cuando representan fielmente y con exactitud los datos contenidos en el
documento o evento que haya sido transmitido a la Administración Tributaria, permitiendo
la concurrencia lógica de la información independientemente de la posición en que se
representen en las mismas.

Una vez estas Representaciones Gráficas se correspondan con su respectivo Documento
Tributario Electrónico transmitido a la Administración Tributariat tendrán validez para
amparar las deducciones de las erogaciones correspondientes, siempre y cuando dicho
DTE no haya sido invalidado. Los sujetos pasivos podrán adicionarles información propia
de índole comercial que les resulte pertinente.

Los sujetos pasivos no podrán modificar, suprimir o sustituir los datos de la Representación
Gráfica de forma independiente al documento o evento que representa, sin previamente
invalidar dicho documento o evento para sustituirlos conno corresponda. No obstante, si el
error proviene únicamente de la Representación Gráfica, esta deberá modificarse para
hacerla corresponder fielmente a su DTE

La Administración Tributaria podrá determinar en el ejercicio de sus facultades establecidas
en el artículo 173 del Código Tributario, que las Representaciones Gráficas que no se
correspondan con su respectivo Documento Tributario Electrónico transmitido a la
Administración Tributaria, constituyan indicios de la existencia de lesión at interés fiscal,
conforme al inciso segundo del artículo 199 del Código Tributario, presumir ta existencia
de operaciones que no fueron transmitidas a la Administración Tributaria.

12. Conservación de los D T E, Eventos y Representaciones Gráficas

Conforme a 10 dispuesto en el artículo 40 del Reglamento de la Ley de Firma Electrónica, los
Documentos Tributarios Electrónicos y Eventos, por su naturaleza, deberán ser creados de forma
electrónica, desplegar sus efectos desde el ámbito electrónico y archivarse electrónicannente, por
10 que deberán conservarse de forma segura e inalterable durante el ptazo exigido en el artículo
147 del Código Tributario, preservando con exactitud la misma información, estructura de datos y
forrnato electrónico con que fueron generados, firmados y transmitidos a la Administración
Tributaria, sin modificación alguna desde el momento de su emisión.

De la misma forma deberán conservarse los documentos tributarios firnnados y entregados que no
han sido transmitidos a la Administración Tributaria.

Las Representaciones Gráficas de los DTE y Eventos deberán conservarse en el mismo formato y
medio en que fueron originalmente expedidas,

Et Archivo DTE y Evento son únicos en su formalidad y contenido, pudiendo ser reproducidos con
la misma integridad de datos y en ese sentido, tales reproducciones tendrán la misma originalidad
que los inicialmente etnitidos, por 10 tanto, podrán amparar las operaciones tributarias siempre y
cuando tengan el Sello de Recepción correspondiente,

26

<!-- PAGE 27 / 137 (OCR) -->

12.1 Orden y conservación

Los DTEt Eventos Representaciones Gráficas expedidos y recibidos deberán estar disponibles de
y
forma ordenada cronológicamente por períodos tributarios, que facilite su consulta o revisión.

De conformidad a 10 dispuesto en el artículo 147 inciso séptimo del Código Tributario, los DTE y
Eventos no podrán reponerse o almacenarse mediante los servicios de la Administración Tributaria,
por 10 que, en estos casos, se estará a 10 dispuesto en el artículo 11 de la Ley de Firma Electrónica.

Los DTE y Eventos expedidos y recibidos podrán ser descargados en el Sitio Ennisores DTE,
conforme 10 establezca la Administración Tributaria.

12.2 Protección de datos personales

Los sujetos pasivos deberán garantizar la seguridad, integridad disponibilidad y confidencialidad de
los datos personales contenidos en estos, evitando su alteración, pérdida, consulta o tratamiento
no autorizado. En ese sentido, procurarán abstenerse de utilizarlos para otros fines que no sean
estrictamente para el cumplimiento de las obligaciones tributarias o legales. Los sujetos pasivos
serán responsables de las filtraciones o uso inadecuado de su información, así también de las
vulneraciones o incidentes en materia de seguridad de la información o de cualquier hecho, acción
u omisión producidos por su Gestor de Facturación Electrónica, que lesionen intereses o alteren la
información propia o de terceros,

medidas de | la | 6. Ñ SEGURIDAD* del Anexo I
Para este propósito, se establecen | seguridad en regla
"ESPECIFICACIONES TECNOLÓGICAS" de la presente Normativa.

12.3 Certificación legal de los DTE y Eventos

La Administración Tributaria podrá certificar tanto los DTE o Eventos almacenados en su base de
datos como información contenida en éstos, rnediante el uso de tecnologías de la información y
la comunicación, que garanticen su conformidad o validez respecto al documento o evento
recibido por la misma.

13. Eventos

Los Eventos por contener firma electrónica son documentos electrónicos y poseen el valor
probatorio establecido en la Ley de Firma Electrónica; no obstante, para surtir efectos fiscales
deberán ser generados, firmados, transmitidos a la Administración Tributaria y poseer Sello de
Recepción, conforme a 10 establecido en esta Normativa y a las Guías y Manuales emitidos para tal
efecto.

13.1 Evento de Invalidación

De conformidad a 10 dispuesto en los artículos 119-A ínciso primero literal g) e inciso segundo y
119-E del Código Tributario, se establecen para el "Evento de Invalidación" las reglas, plazos y
condiciones siguientes:

Procederá la invalidación de DTE, siempre y cuando se cumplan las siguientes reglas:

27

<!-- PAGE 28 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 28. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | Base Legal | Tipo de documento / Evento | Caso | Condición | Plazo para Transmitir el Evento |
|---|---|---|---|---|---|
| 1 | Art. 119-E inc. 1 literal a) Código Tributario | CCFE, NRE, NCE, NDE, CLE, CRE, DCLE y CDE del numeral 4 de la presente Normativa. | En el caso de CCFE, NRE, NCE, NDE, CLE, CRE, DCLE y CDE del numeral 4 de la presente Normativa: a) Errores que no impliquen ajuste a la operación o negocio subyacente celebrado con el receptor, sino cesar los efectos del DTE que contiene el dato errado. b) Cuando se rescinda totalmente la operación. | Para CCFE, NRE, NCE, NDE, CLE, CRE, DCLE y CDE: Que el error ocurra por causa del emisor en el ingreso de los datos de un DTE o que se deje sin efecto la operación. Por ejemplo: Equivocación cometida al introducir los datos de la fecha, nombre o descripción, entre otros, en el documento. | Dentro de los diez primeros días hábiles del mes siguiente al periodo tributario en que el documento a invalidar obtuvo el Sello de Recepción. |
| 2 | Art. 119-E inc. 2 Código Tributario | FE, FEXE y FSEE del numeral 4 de la presente Normativa. | Cuando se rescinda totalmente la operación o se afecten las operaciones realizadas. | Que se rescinda o modifique la operación o negocio celebrado con el receptor. Por ejemplo: La reducción del precio del bien o servicio prestado o cambio de un bien o servicio diferente. | Dentro de tres meses contados a partir del otorgamiento del Sello de Recepción del documento a invalidar, a excepción del punto 3 siguiente. |
| 3 | Art. 119-E inc. 2 Código Tributario | FE y FEXE del numeral 4 de la presente Normativa. | Cuando se rescinda totalmente la venta de medicamentos y especialidades farmacéuticas perecederos para uso y consumo humano o se afecten las operaciones realizadas. | Que se rescinda o modifique la venta de medicamentos y especialidades farmacéuticas perecederos para uso y consumo humano. | Dentro de dos años contados a partir del otorgamiento del Sello de Recepción del documento a invalidar. |
| 4 | Art. 119-A inc. 1 literal g) Código Tributario | Evento de Retorno y Evento de Operaciones Especiales. | Cuando se constaten errores en su contenido. | Que el Evento de Retorno a invalidar posea Sello de Recepción. | Hasta los diez primeros días hábiles del mes siguiente al periodo tributario en que el evento a invalidar obtuvo el Sello de Recepción. |

Cuadro 6: Invalidación

13.1.1 Lineamientos para el Evento de Invalidación

La Fecha del Evento de Invalidación deberá estar comprendida dentro del plazo desde el mismo
día hasta el día posterior respecto de la Fecha de Generación del documento o la Fecha del Evento
a invalidar, sin perjuicio de la regla 13.1.1.1 "Reglas para invalidación de Facturas, Facturas de
Exportación Electrónicas y Facturas de Sujeto Excluido".

A excepción de la Nota de Crédito electrónica y el Comprobante de Liquidación electrónico,
cuando el motivo del Evento de Invalidación sea distinto a la rescisión total de la operación, previo
a la transmisión del citado Evento, deberá generarse y transmitirse el nuevo documento que ampara
la operación, con un nuevo Código de Generación y Número de Control, debido a que en la

28

<!-- PAGE 29 / 137 (OCR) -->

estructura del Evento de Invalidación se deberá relacionar tanto la identificación del documento a
invalidar como del nuevo documento que ampara la operación.

En todo caso, la invalidación únicamente procederá respecto de documentos tributarios que hayan
obtenido previamente el Sello de Recepción.

13.1.1.1 Reglas | invalidación de Facturas, Facturas de Exportación Electrónicas y
para
Facturas de Sujeto Excluido

Cuando se trate de la invalidación de Facturas Electrónicas, Facturas de Exportación Electrónicas y
Facturas de Sujeto Excluido Electrónica, la transmisión del Evento de Invalidación deberá efectuarse
dentro det plazo establecido en el cuadro anterior, respecto de la fecha en que se transmitió y
otorgó el Sello de Recepción al documento o evento a invalidar. Asimismo, la Fecha del Evento de
Invalidación deberá estar comprendida en el plazo establecido en el cuadro anterior, respecto de
la Fecha de Generación del documento o la Fecha del Evento a invalidar.

Respecto de las operaciones documentadas con Factura Electrónica cuyo monto total sea inferior
at legalmente establecido en el artículo 119C inciso primero literal b) número VII del Código
Tributario, no será exigible los datos del campo: "Nombre (Receptor)", para efectuar la invalidación
de la misma, cuando en dicha Factura se haya omitido. No obstante, en estos casos, deberá
indicarse el Nombre, Tipo de documento de identificación y Número de documento de
identificación, de quien solicita el evento; además del Nombre, Tipo de documento de
identificación Número de documento de identificación, de quien realiza el evento.
y

1&1.1.2 Diferencia entre error y afectación

Se considera existe error que no afecta la operación, cuando se trate de omisiones o
que
inexactitudes en los datos introducidos al DTE o Evento a invalidar, por ejemplo, cuando el precio
de los bienes contenido en el documento difiera del convenido en la operación.

Se considera existe afectación, cuando se trate de la modificación de las características
que
económicas de la operación contenida en DTE o Evento a invalidar, por ejemplo, cuando la
cantidad de los bienes convenido en la operación docurnentada, sea modificado por una nueva
negociación o cuando se devuelva una parte de los bienes vendidos.

Conforme a 10 dispuesto en et artículo 119-E inciso cuarto del Código Tributario, si no se trata de la
corrección de errores que no afectan la operación, los Comprobantes de Crédito Fiscal y
Comprobantes de Retención que hayan obtenido el Sello de Recepción, deberán ser modificados
rnediante Notas de Crédito o Débito, para ajustar el débito o crédito fiscal del Impuesto a ta
Transferencia de Bienes Muebles y a la Prestación de Servicios.

13.1.2 Efectos del Evento de Invalidación

EI Evento de Invalidación hará cesar completamente los efectos de los DTE o Eventos relacionados
con él, siempre y cuando se transmita dentro de los ptazos establecidos en el anterior cuadro 6 y,
por 10 tanto, dicha invalidación no implicará ajuste al débito o crédito fiscal sino su extinción; en
ese sentido, no le serán aplicables tas reglas establecidas en los artículos 62 y 63 de la Ley de
Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios.

29

<!-- PAGE 30 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 30. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

Las invalidaciones deberán declararse en el período tributario a que correspondan según la "Fecha
del Evento" de Invalidación respectivo. La fecha en que dicho evento obtenga el Sello de Recepción,
no afectará lo anterior.

La "Fecha del Evento" de Invalidación no deberá exceder a los plazos establecidos en los artículos
62 de la Ley de Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios y 111
del Código Tributario, respecto de la "Fecha de Generación" de los documentos de control del
citado impuesto.

13.2 Evento de Contingencia

De conformidad a lo dispuesto en los artículos 119-A inciso primero literal g) e inciso segundo y
119-F del Código Tributario, se establecen para el "Evento de Contingencia" las reglas, plazos y
condiciones siguientes:

Procederá la contingencia siempre y cuando se cumplan las siguientes reglas:

| No. | Base Legal | Tipo de documento / Evento | Caso | Condición | Plazo para Transmitir el Evento |
|---|---|---|---|---|---|
| 1 | Arts. 119-A inc. 1 literal g) y 119-F Código Tributario | Únicamente CCFE, NCE, NDE, CRE, NRE, FE, FEXE y FSEE del numeral 4 de la presente Normativa. | Cuando se presenten situaciones de caso fortuito o fuerza mayor que imposibiliten la transmisión de los documentos electrónicos a la Administración Tributaria. | Que el imprevisto no es posible resistir. Por ejemplo: Fallas ocasionadas por los proveedores en el suministro del servicio de Internet o indisponibilidad de acceso a la plataforma informática establecida por la Administración Tributaria. | 24 horas contadas a partir del cese de la situación de caso fortuito o fuerza mayor que provocó la contingencia. |
| 2 | Art. 119-A inc. 1 literal g) Código Tributario | Evento de Retorno | Cuando se presenten situaciones de caso fortuito o fuerza mayor que imposibiliten la transmisión del evento a la Administración Tributaria. | Que el imprevisto no es posible resistir. Por ejemplo: Fallas ocasionadas por los proveedores en el suministro del servicio de Internet o indisponibilidad de acceso a la plataforma informática establecida por la Administración Tributaria. | 24 horas contadas a partir del cese de la situación de caso fortuito o fuerza mayor que provocó la contingencia. |

Cuadro 7: Contingencia

13.2.1 Lineamientos para el Evento de Contingencia

Previo a considerarse en contingencia, el sujeto pasivo emisor deberá cerciorarse de haber agotado
la "Política de Reintentos" establecida en las Guías y Manuales emitidos por la Administración
Tributaria para tal efecto.

El sujeto pasivo deberá reiniciar los reintentos de transmisión a los servicios de la Administración
Tributaria como mínimo cada quince minutos, para asegurarse del restablecimiento de la
conectividad de su Gestor de Facturación Electrónica.

Podrá ocurrir contingencia para uno o varios DTE y Eventos, siempre que se presenten las causas
para ello.

30

<!-- PAGE 31 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 31. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

La entrega de documentos electrónicos en estado transitorio por contingencia sin contar con el
Sello de Recepción no exime a los sujetos pasivos emisores de la obligación de transmitirlos a la
Administración Tributaria para el otorgamiento del Sello de Recepción.

13.2.1.1 Informe Técnico de Contingencia

Cuando la contingencia del sujeto pasivo persista por más de tres días consecutivos, previo a
trasmitir el Evento respectivo, deberá presentar a la Administración Tributaria, en la forma y a través
de los medios que esta disponga, un "Informe Técnico de Contingencia", en el que exponga las
causas que producen la contingencia y los motivos para no superarla, indicando su plan de
acciones a implementar, así como las medidas de control interno que tomará para prevenir la
recurrencia de tales situaciones.

13.2.2 Efectos del Evento de Contingencia

Una vez el Evento de Contingencia transmitido dentro del plazo establecido en el cuadro anterior
obtenga el Sello de Recepción, los documentos electrónicos en estado transitorio y los Eventos
generados y firmados en contingencia deberán transmitirse a la Administración Tributaria en el
plazo de setenta y dos horas contadas a partir de la obtención del citado Sello.

Las declaraciones del Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios
deberán reflejar las operaciones de ventas realizadas en contingencia.

13.3 Evento de Retorno

De conformidad a lo dispuesto en el artículo 119-A inciso primero literal g) e inciso segundo del
Código Tributario, se establece el "Evento de Retorno" de acuerdo a las reglas, plazos y condiciones
siguientes:

Procederá reportar el retorno de bienes vendidos o comprados y la disminución o reembolso de
servicios, cumpliendo con las siguientes reglas:

| No. | Base Legal | Tipo de documento | Caso | Condición | Plazo para Transmitir el Evento |
|---|---|---|---|---|---|
| 1 | Art. 119-A inc. 1 literal g) Código Tributario | FE, FEXE y FSEE del numeral 4 de la presente Normativa. | Cuando se retornen bienes comprendidos en operaciones amparadas en DTE, efectuado por el receptor o por un tercero.<br><br>Cuando ocurran reembolsos, por defectos ocultos de bienes suministrados por el proveedor de servicios.<br><br>Cuando se recuperan depósitos de envases o empaques. *(continúa en p. 32)* | Que los documentos a relacionar posean Sello de Recepción. | Dentro de tres meses contados a partir del otorgamiento del Sello de Recepción del documento a relacionar con el retorno. |

31

<!-- PAGE 32 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 32. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

*(Continuación del Cuadro 8, fila 1, columna "Caso")*

| No. | Base Legal | Tipo de documento | Caso | Condición | Plazo para Transmitir el Evento |
|---|---|---|---|---|---|
| | | | Cuando ocurra la reimportación de bienes provenientes de exportación definitiva.<br><br>Cuando disminuya el valor de lo exportado por pérdida, merma o daño. | | |

Cuadro 8: Retorno

13.3.1 Lineamientos para el Evento de Retorno

El retorno no constituye un descuento ni deberá exceder al valor de lo vendido o comprado.

Cada Evento se relacionará a un solo tipo de documento. Los bienes o servicios retornados o
devueltos deberán individualizarse o identificarse apropiadamente.

El Evento se generará y entregará al receptor mediante su Archivo DTE junto con su Representación
Gráfica.

13.3.2 Efectos del Evento de Retorno

Una vez el Evento de Retorno obtenga el Sello de Recepción, se producirán para el emisor los
siguientes efectos:

a) En el caso de FE, la disminución de la venta y la del débito fiscal cuando proceda, en las
cuantías contenidas en el Evento.
b) Para el caso de FEXE, la disminución en la exportación y del Remanente de Crédito Fiscal
cuando proceda.
c) Respecto a FSEE, la disminución de la compra, en la cuantía contenida en el Evento.

13.3.2.1 Diferencia entre retorno y ajuste

Las operaciones realizadas mediante Evento de Retorno no generan crédito fiscal, por lo tanto, no
implican ajuste a crédito fiscal alguno para el receptor.

El Evento de Retorno no es ajustable mediante evento ni documento.

13.3.2.2 Diferencia entre retorno e invalidación

El retorno afecta siempre a la operación originalmente documentada y no produce la invalidación
de su documento de origen, inclusive si el monto del retorno cubre su valor total. En caso de
errores en el contenido del documento o rescisión de la operación, el documento deberá
invalidarse mediante evento.

El Evento de Retorno podrá invalidarse mediante evento, conforme a la regla 13.1 "Evento de
Invalidación" de esta Normativa.

32

<!-- PAGE 33 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 33. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

13.4 Evento de Operaciones Especiales

De conformidad a lo dispuesto en el artículo 119-A inciso primero literal g) e inciso segundo del
Código Tributario, se establece el "Evento de Operaciones Especiales" de acuerdo a las reglas,
plazos y condiciones siguientes:

Procederá la transmisión a la Administración Tributaria de la información de interés fiscal contenida
en los documentos y casos establecidos conforme a las siguientes reglas:

| No. | Base Legal | Tipo de documento | Caso | Condición | Plazo para Transmitir el Evento |
|---|---|---|---|---|---|
| 1 | Art. 119-A inc. 1 literal g) Código Tributario | Factura de Venta Simplificada (FVS). | Cuando el sujeto pasivo posea autorización de numeración correlativa de Facturas de Venta Simplificada. | Haber emitido Facturas de Venta Simplificada. | Hasta los diez primeros días hábiles del mes siguiente en que se emitan las FVS. |
| 2 | Art. 113 inc. 1 y 119-A inc. 1 literal g) Código Tributario | Comprobantes de Control Interno. | Cuando se realicen las operaciones autorizadas por la Administración Tributaria mediante resolución conforme al art. 113 inc. 1 del Código Tributario. | Cumplir con la forma, plazo y condiciones establecidas por la Administración Tributaria. | Hasta los diez primeros días hábiles del mes siguiente al que correspondan las operaciones que se informan. |

Cuadro 9: Operaciones Especiales

13.4.1 Lineamientos para el Evento de Operaciones Especiales

Los sujetos pasivos emisores de DTE cuya situación se encuentre en alguno de los casos
establecidos en el cuadro anterior, deberán iniciar la transmisión del Evento de Operaciones
Especiales.

Los Comprobantes de Control Interno mencionados en el segundo caso del cuadro anterior, son
los generados en ocasión de las operaciones expresamente designadas mediante resolución por la
Administración Tributaria, en la cual se autorice conforme a lo dispuesto en el artículo 113 del
Código Tributario, el sistema de control para el reemplazo de los documentos señalados en la
Sección Quinta del Capítulo I del Título II de dicho Código. En estos casos, los sistemas que se
postulen por los sujetos pasivos, deberán proponer las medidas de control interno que garanticen
una huella de auditoría fiable y demostrar el debido resguardo de la seguridad, cumplimiento y
exactitud de los impuestos causados.

Los sujetos pasivos cuyos sistemas de control hayan sido autorizados de la forma que antecede,
únicamente transmitirán el Evento de Operaciones Especiales respecto de las operaciones
designadas y para el resto, continuarán utilizando los DTE aplicables.

13.4.2 Efectos del Evento de Operaciones Especiales

Una vez el Evento de Operaciones Especiales obtenga el Sello de Recepción, se tendrá por recibida
la información de interés fiscal, establecida en el cuadro anterior o mediante resolución.

33

<!-- PAGE 34 / 137 (OCR) -->

14 Consulta

La consulta de los Documentos Tributarios Electrónicos o Eventos podrá efectuarse en el sitio web
del Ministerio de Hacienda, a efecto de verificar que estos hayan obtenido el Sello de Recepción y
respaldar debidamente las deducciones correspondientes.

Las Representaciones Gráficas del DTE o Evento, deberán integrar un parámetro dentro de un
Código QR (Quick Response) o en su defecto la dirección web que enlace al sitio de consulta de
la Administración Tributaria. Los parárxnetros respectivos se establecen en las Guías y Manuales
emitidos por ta Administración Tributaria para tal efecto.

Los emisores de Documentos Tributarios Electrónicos podrán consultar los documentos emitidos
y recibidos en el Sitio Emisores DTE,

15- Coexistencia

Los sujetos pasivos emisores de Documentos Tributarios Electrónicos, no podrán seguir utilizando
documentos equivalentes (tiquetes) a partir del 1 de enero de 2025, por 10 que deberán emitir
Factura Electrónica por las operaciones que realicen con consumidores finales, sin perjuicio de
incurrir en la sanción respectiva en caso de incumplimiento.

Los sistemas especiales o computarizados para el control de operaciones, autorizados a partir de
la vigencia de esta Normativa, de confortnidad con el artículo 113 inciso primero del Código
Tributario, así conno las Facturas de Venta Simplificada, podrán coexistir con la emisión de
Documentos Tributarios Electrónicos, siempre y cuando los sujetos pasivos emisores de DTE
transmitan el Evento de Operaciones Especiales, conforme a ta regla 13.4 establecida en esta
Normativa.

En ningún caso podrán coexistir con la emisión de DTE los sistemas especiales o computarizados
para el control de operaciones, autorizados previamente a la vigencia de esta Normativa, de
conformidad con ta referida disposición legal.

16. Gratuidad

Para los efectos establecidos en el artículo 119+ del Código Tributario, la Administración Tributaria
pondrá a disposición de los sujetos pasivos la plataforma "Sistema de Facturación" operable en el
Sitio Emisores DTE o mediante aplicación para dispositivos móviles.

Dicha solución está dispuesta para los sujetos pasivos que cumplen los parámetros establecidos
por la Administración Tributaria, Asimismo, proveerá a los sujetos pasivos de otras soluciones
tecnológicas gratuitas que considere pertinentes.

Fechas y condiciones para liberación de la presentación de informes

Conforme al artículo 119-A inciso primero literal i) del Código Tributario, la Administración Tributaria
establecerá oportunamente las fechas a partir de las cuales los sujetos pasivos emisores de DTE,
quedarán liberados de las obligaciones de presentación de los informes regulados en dicho Código.

18. Lineamientos para Actualizaciones y Versiones

34

<!-- PAGE 35 / 137 (OCR) -->

Las actualizaciones y versiones de esta Normativa que afecten la estructura de los datos, el formato
electrónico, los atributos de los campos de los DTE y Eventos, tendrán vigencia a partir del día de
su publicación, salvo que las disposiciones establecidas en las leyes dispongan fechas o plazos de
adaptación diferentes.

Para los sujetos pasivos usuarios de la plataforma "Sistema de Transmisión", en el caso de las
actualizaciones y versiones, deberán concluir las adaptaciones correspondientes dentro del plazo
que les establezca la Administración Tributaria.

Para los usuarios de la plataforma "Sistema de Facturación", las modificaciones serán aplicadas por
la Administración Tributaria.

Los cambios que no afecten la estructura de los datos, el formato electrónico ni los atributos de
los campos de los DTE y Eventos, tendrán vigencia a partir del día que sean informados a los sujetos
pasivos por los medios oficiales que la Administración Tributaria estime pertinentes.

19. Anexos

Los siguientes Anexos forman parte integrante de la presente Normativa:

ANEXO l: ESPECIFICACIONES TECNOLÓGICAS
ANEXO II: ESTRUCTURA DE DATOS DTE
ANEXO III: ESTRUCTURA DE DATOS EVENTOS
ANEXO IV: VALIDACIONES PARA CAMPOS DTE
ANEXO V: VALIDACIONES PARA CAMPOS EVENTOS
ANEXO VI: MODIFICACIONES

20. Vigencia

La presente Normativa estará vigente a partir del día de su publicación.

San Salvador, 25 de mayo e 026.

DE

Marvin Sorto
Director Ge ral
Di cción General de Impuestos Internos

35

<!-- PAGE 36 / 137 (OCR) -->

ANEXO
ESPECIFICACIONES TECNOLÓGICAS

De conformidad a 10 dispuesto en el artículo 119-A inciso primero literales b), c) y g) del Código
Tributariot el presente anexo comprende las instrucciones y especificaciones tecnológicas
requeridas para la emisión de los DTE y Eventos.

1. Generación de los DTE y Eventos

1.1. Transparencia tecnológica

Los sujetos pasivos obligados por la Administración Tributaria a emitir los Documentos Tributarios
Electrónicos y los que opten por emitirlos, podrán elegir el sistema gestor de facturación
electrónica que mejor se ajuste a su giro o actividad, sea mediante desarrollo propio o de mercado,
a la medida o tercerizado. No obstante, el sujeto pasivo emisor de los DTE, es el responsable del
cumplimiento de las obligaciones establecidas en et Código Tributario, la presente Normativa y las
Guías y Manuales emitidos por la Administración Tributaria.

1.1.1 Recursos

Los Gestores de Facturación Electrónica propios o de mercado, a la medida o tercerizados deberán
crear y organizar un conjunto de componentes y funcionalidades para la transmisión satisfactoria
de los documentos electrónicos en formato JSON, firmados electrónicamente, cumpliendo con la
Estructuras de Datos y Formato Electrónico establecidos por la Administración Tributaria, a efecto
que puedan obtener el Sello de Recepción.

1.2. Código de Generación

Es un UUID o Identificador Único Universal formado por un número de 16 bytes (128 bits). Se
expresa mediante 32 dígitos hexadecimales divididos en cinco grupos separados por guiones de la
forma 8-4-4-4-12 que totalizan 36 caracteres, utilizando letras mayúsculas (32 dígitos y 4 guiones).
Se deberá utilizar UUID versión 4.

Por ejemplo: 287BF64E-0246-4EIF-BC08-7B83C598DB93

EI nombre det Archivo DTE, del archivo del Evento y de la Representación Gráfica en formato digital,
será el Código de Generación que contiene, seguido de la extensión que corresponda al formato
utilizado. Por ejemplo: 287BF64E-0246-4EIF-BC08-7B83C598DB93,json, 287BF64E-0246-4EIF-
BC08-7B83C598DB93.pdf, 287BF64E-0246-4EIF-BC08-7B83C598DB93.png.

La generación del UUID versión 4 es diferente según el lenguaje de programación que se utilice, el
sujeto pasivo deberá importar la biblioteca correspondiente a la tecnología utilizada en sus sistemas,
cumpliendo las indicaciones establecidas en el Manual respectivo.

Este UIJID será la estructura requerida por la Administración Tributaria para la creación del Código
de Generación dentro del DTE y Evento emitido y será responsabilidad de cada emisor la
generación de este código.

1.3. Número de Control

36

<!-- PAGE 37 / 137 (OCR) -->

Durante el procedimiento de generación, deberá asignarse automáticamente el Número de
Control, ei cual tendrá la siguiente estructura: DTE-OO-OOOOOOOO-OOOOOOOOOOOOOOO,
comprendiendo cuatro secciones separadas por guiones:

10: deberá iniciar con las letras mayúsculas "DTE" que hace referencia a los Documentos
Tributarios Electrónicos a emitir.
20: contendrá el Código de Tipo de Documento según el Catálogo CAT-002 establecido
por la Administración Tributaria.
30: contendrá cuatro dígitos alfanuméricos que representan el código de Casa Matriz,
Sucursal, Bodega o Patio, seguido de cuatro dígitos alfanuméricos con el código de Punto
de Venta.
40: contendrá un número consecutivo de quince dígitos de longitud, que iniciará en 1 y
finalizará en 999999999999999.

Para codificar la Casa Matriz, Sucursal, Bodega o Patio y Punto de Venta de la tercera sección de la
citada estructura, los sujetos pasivos deberán utilizar la codificación establecida por la
Administración Tributaria.

1.4. Campos y Secciones

Los sujetos pasivos deberán implementar las Estructuras de Datos que integran el formato
electrónico JSON para la generación de los DTE y Eventos.

Las Estructuras de los Documentos Tributarios Electrónicos y Eventos son indicaciones del
contenido y de las especificaciones que deben cumplirse según el documento o evento que se
esté generando; de conformidad a 10 establecido por la Administración Tributaria.

Estas estructuras se dividen en campos y secciones.

Un campo es un espacio de almacenamiento para un dato en particular contenido en la Estructura
de Datos de los DTE/ Eventos. Los campos son la información (datos) que la Administración
Tributaria requiere para generart transmitir y recibir un DTE/ Evento. Cada tipo de documento o
evento contiene sus campos con información específica.

Las especificaciones de cada campo se han detallado en las siguientes columnas:

a) NO: Número secuencial que identifica cada campo en un documento o evento.
b) Campo JSON: Esta columna contiene el nombre de la sección y del campo en el JSON a
generar del documento o evento.
c) Representación Gráfica: Esta columna indica si et campo debe ser colocado en la
Representación Gráfica del documento o evento, según el detalle de categorías contenido
en la regla 8 *Glosario para Estructuras DTE/ Eventos" de este Anexo.
d) Nombre del Campo: Contiene el nombre asignado a cada campo del documento o

e) Descripción de contenido del campo: Esta columna describe la información especifica
requerida en cada campo (valores, datos, códigos entre otros); pueden encontrarse
fórmulas para determinar el campo, ejemplos y algunas condiciones especiales.
f) Condición del campo: Determina si el campo es "Requerido para su transmisión",
"Requerido por tipo de operación" u "Opcional", conforme se detalla en la regla 1.5
ADefinición de condiciones de campo* de este anexo.

37

<!-- PAGE 38 / 137 (OCR) -->

g) Tipo de dato: Columna que detalla si el carnpo es numérico o alfanumérico.
h) Longitud/precisión: Contiene la extensión permitida para el campo.
i) Documento / Evento: Establece los Tipos de Documentos o Eventos que contienen et
campo.

Las secciones son agrupaciones de campos con información relacionada, en que se han dividido
las estructuras de datos de los documentos o eventos.

Estas secciones, son.

A. Sección 'Identificación? Sección donde se detallan las generales del documento o evento
que se está transmitiendo
B. Sección 'Documentos Relacionados': En esta sección se detallarán los documentos o
eventos a relacionar, podrá detallar un máxirno de 50 documentos/ eventos y un máximo
de 2000 ítems o líneas.
C. Sección *Emisor": Contiene información del emisor del documento o evento. Para los
casos de establecimiento y punto de venta deberá detallarse la información desde donde
se transmite el documento/ evento. Para el caso del CRE el emisor es el Agente de
Retención; para el CLE, es el Comisionista. EI emisor para el DCLE, es el Agente Perceptor;
para la FEXE, es el Exportador: para el CDE, es el Donatario. Para el evento, los datos del
emisor deben ser los mismos detallados en el DTE al que se le aplique.
D. Sección *Receptor': Contiene la información del receptor del documento. Para el caso
del CRE, el receptor es el Sujeto de Retención; para el CLE, es el Mandante; para el DCLE,
es el Afiliado; para el FSEE, es el Sujeto Excluido; para el CDE, es el Donante.
E. Sección • Información del evento contingencia': Esta sección contiene la información
en
del evento en contingencia.
E Sección 'Documentos asociados": Esta sección es opcional para la mayoría de los
documentos tributarios y permite anexar información relevante de ta operación; esta
información puede ser del emisor (contratos, resoluciones, etc.), del receptor (contratos,
resoluciones, autorizaciones, etc.), del médico (identificación, nombre procedimiento,
etc.) y del rnedio de transporte (identificación, conductor, entre otros). Es obligatorio solo
para el CDE.
G. Sección 'Motivo de la Contingencia": En esta sección se deberá ingresar los datos que
identifiquen el tnotivo y el período en qué ocurrió la causa de fuerza mayor que imposibilitó
la transmisión en línea de los documentos/ eventos a la Administración Tributaria.
H. Sección 'Detalle de aplicación del evento': Hace referencia a tos datos de los
docutnentos/ eventos a los que se les aplica el evento.
Sección *Venta por cuenta de terceros*: Utilizada para describir la información det sujeto
pasivo por cuenta de quien se está realizando la venta.
J. Sección 'Compra por cuenta de terceros': Utilizada para describir la información del
tercero por cuenta de quien se está realizando la compra.
K. Sección -CuerpoR: Esta sección contiene la información detallada de la operación
realizada.
L. Sección *Resumen': Esta sección contiene un resumen de la información del cuerpo del
documento/ evento.
M. Sección *Extensión": Detalla los datos generales del responsable de generar el DCCE.
N. Sección *Motivo det evento": Deberá detallarse el motivo por el cual se genera el evento.
O. Sección E | Esta sección | encuentra | incluir
Apéndice': | es opcional y se | a disposición para
cualquier información adicional.

38

<!-- PAGE 39 / 137 (OCR) -->

EI "Sello de Recepciónn no es una sección ni un campo de los documentos o eventos, se incorpora
con la finalidad de hacer del conocimiento al sujeto pasivo que la Administración Tributaria enviará
un código encriptado con ese nombret por cada documento o evento que haya sido
correctamente transmitido.

1.5. Definición de condiciones de campo

Cada campo de la estructura comprende las siguientes condiciones:

Requerido para su transmisión: EI campo es requerido por la Administración
Tributaria en la estructura JSON. Se rechazarán los documentos que no
comprendan estos campos en su estructura.

ji. Requerido por tipo de operación: EI campo deberá completarse cuando la
operación o negocio que se está documentando 10 requiera, ya sea por
condiciones de lugar, giro o por el tipo de obligaciones que se le ha asignado al
sujeto pasivo.

iii. Opcional: EI campo se completará según la conveniencia de cada sujeto pasivo.

1.6. Estructura de Datos

La Estructura de Datos de los DTE y Eventos, es un listado organizado de todos los datos pertinentes
que comprende los elementos o campos que integran el formato electrónico del documento o
evento, se encuentran en los Anexos II: "ESTRUCTURA DE DATOS DTE" y III: "ESTRUCTURA DE
DATOS EVENTOS, respectivamente,

1.7. Formato Electrónico

EI formato electrónico de los DTE y Eventos se basa en un esquema JSON (JSON-schema). EI
esquema define los elementos y atributos que aparecen en los documentos JSON.

Los JSON de cada DTE y Evento se corresponden con la columna "Campo JSON" de las Estructura
de Datos de los Anexos II: UESTRUCTURA DE DATOS DTEP y III: UESTRUCTURA DE DATOS
EVENTOS".

La Administración Tributaria pondrá a disposición de los sujetos pasivos los JSON-schema por el
medio que estime conveniente. Dichos esquemas son herramientas para validar y especificar la
estructura de tos documentos JSON

1.8. Catálogos

Los catálogos son una lista sistematizada de codificaciones donde se refleja información importante
sobre tos campos que se utilízan en los diferentes DTE; estos catálogos permiten conocer y
localizar los diferentes códigos asignados para describir la información clasificada por grupos de
acuerdo a los diferentes campos contenidos en las estructuras de los mencionados documentos.

Los catálogos de los Documentos Tributarios Electrónicos serán establecidos por la Administración
Tributaria, su utilización será obligatoria y estarán disponibles en la forma que ésta establezca.

39

<!-- PAGE 40 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 40. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

2. Firma electrónica

2.1. Condiciones y mecanismos de firma

Los documentos y eventos utilizarán la firma electrónica simple, mediante certificados
proporcionados por la Administración Tributaria y mientras no designe un mecanismo de firma
diferente.

Es responsabilidad del emisor administrar su propia infraestructura y software de firma electrónica,
que le permita firmar todos los documentos y eventos generados, así como el resguardo de la
información de los certificados de firma simple.

La firma electrónica del documento se realizará conforme a los siguientes mecanismos:

| | |
|---|---|
| Firmado de Documentos | JSON Web Signature (JWS) |
| Estándar de Firmado | CAdES - PKCS8EncodedKeySpec y como algoritmo de encriptado RSA512 |

Cuadro 10: Firma

La firma electrónica deberá encriptar los documentos y eventos generados, utilizando la
información especificada en el certificado electrónico proporcionado por la Administración
Tributaria, conforme al ejemplo que se muestra a continuación:

```
"firmaElectronica":"eyJhbGciOiJSUzUxMiJ9.ewogICJpZGVudGlmaWNhY2lvbiIgOiB7CiAgICAidmVyc2lvbiIgOiAxLAogICAg ...
```

> ℹ️ **Ejemplo ilustrativo no transcrito carácter a carácter.** El original contiene ~38 líneas de un token JWS en base64 (continúa en páginas siguientes). Solo se transcribe el inicio, verificado visualmente y por decodificación (`{"alg":"RS512"}` . `{\n  "identificacion" : {\n    "version" : 1,\n    ...`). El resto no es legible con fiabilidad en el escaneo (confusiones l/I/1, O/0) y no contiene reglas normativas; consultar el PDF original, página 40, si se requiere el token completo.

40

<!-- PAGE 41 / 137 (OCR) -->

oglCAglm1vbnRvRGVzY3UilDogNDAwLAoglCAglnZlbnRhTm9TdWoilDogMCwKlCAglCJ2ZW50YUV4ZW50YSlgOiAwLAog}
CAglnZlbnRhR3JhdmFkYSlgOiAyMDAwMCwKlCAgiCdOcmlidXRvcylgOiBblCJEMSlslCJDOClgXSwKlCAglCJwc3YilDogMC
wKlCAglCJubOdyYXZhZG8ilDogMCwKlCAgtCJpdmFJdGVtliA61DlzMDAuODgKlCB91FOsCiAglnJlcSVtZW4ilDogewoglCAgl
nRvdGFsTm9TdWoiDogMCwKlCAglCOOb3RhbEV4ZW50YSlgOiAwLAoglCAglnRvdGFsR3JhdmFkYSlgOiAINjAwMCwKECAg
ICJzdWJUb3RhbFZlbnRhcylgOiAINjAwMCwK\CAglCJkZXNjdU5vU3VqliA61DAsCiAglCAiZGVzY3VFeGVudGEilDogMCwKlC
AglCOkZXNjdUdyYXZhZGEilDogNjAwMCwKlCAglCJwb3JjZW50YWptRGVzY3VlbnRvliA61DAsClAglCAidG90YWxEZXNjdStg
OiAyMTfwLAoglCAglnRyaWJ1dG9zliA61FsgewoglCAglCAiY29kaWdvliA61COEMSlsCiAglCAglCJkZXNjcmlwY21vbi\gOiAiRk9
WSUFMiCgkMC4yMCBDdHZzLiBwb31gZ2Fsw7NuKSlsCiAglCAg!C02YWxvcilgOAxNjAwClAglCB9LCB7CiAglCAglCJjb2RpZ
28ilDoglkM41iwKlCAglCAgimRlc2NyaXBjaW9uliA61CJDTIRSQU5TlCgkMC4xMCBDdHZzLiBwb31gZ2Fsw7NuKSlsCiAglCAgl
CJ2YWxvcilgOiA4MDAKlCAglHOgXSwKtCAglCJzdWJUb3RhbCfgOiAIMDAwMCwKlCAgiCJpdmFSZXRlMSlgOiAyNjAsCiAgl
CAicmVOZVJlbnRhliA61DAsCiAglCAibW9udG9Ub3RhbE9wZXJhY21vbilgOíAIMjQwMCwKlCAglCJOb3RhbE5vR3JhdmFkbyt
gO}AwLAogtCAglnRvdGFsUGFnYXlilDogNTlxNDAsCiAglCAidG90YWxMZXRyYXMilDoglkNJTkNVRU5UQSBZlERPUyBNSUw
gQOlFTtRPIENVOVJFTlRBIETDkOxBUkVTlCtsCiAglCAidG90YWxOdmEilDogNTc1Mi4yMSwKlCAglCJzYWxkbOZhdm9yliA61D
AsCiAglCAiY29uZGljaW9uT3BlcmFjaW9uliA61DEsCiAglCAicGFnb3MilDogWyB7CiAglCAg$CJjb2RpZ28i$DogljAxliwKlCAglCA
gim1vbnRvUGFnbylgOiAIMjEOMCwKlCAglCAglnBsYXpvliA61G51bGwsCiAgiCAglCOyZWZlcmVuY21hliA61CliUAoglCAglCAic
GVyaW9kbylgOiBudWxsCiAglCB91FOsCiAglCAibnVtUGFnbOVsZWNOcm9uaWNvliA61G51bGwKlCB9LAoglCOleHRlbnNpb24

IG51bGwsCiAgICAiZG9jdVJlY21iZSIgOiBudWxslAoglCAglm9ic2VydmFjaW9uZXMi!Doglmx2YWEibAoglCAglnBsYWNhVmVo
aWN1bG8ilDogbnVsbAoglHOsCiAgImFwZW5kaWNlliA61G51bGwKfQ.FwX7RHV6mb7nlNmr7AS-PHOMDZ2unbThi-
bBrG7qkt37L8qOku1kTEjtdSovikWrFHwsleN8kC-QVDXFX26glE5hdOTQf4kyXbi•

Los códigos generados en el proceso de obtención de claves para la transmisión de documentos
serán de criptografía asimétrica:

Llave privada: Es la que permite cifrar la información del documento, es decir, convertir los
datos de un formato legible a uno codificado. Su uso es privado y exclusivo del titular del
certificado.

Llave pública: Es la que permite descifrar la información. Debe compartirse con los sujetos
que requieran utilizar la información cifrada.

Certificado: Contiene el certificado de firma emitido por la Administración Tributaria.

2.2. Condiciones y mecanismos de validación

La validación de los certificados de firma la realizará la Administración Tributaria sobre cada
documento o evento transmitido.

3. Transmisión

La forma y condiciones para la Transmisión de los Documentos Tributarios Electrónicos y Eventos
se establecen a continuación.

3.1. Ambientes de Transmisión

La Administración Tributaria dispone de los siguientes ambientes de transmisión:

Ambiente para Pruebas: En este ambiente el sujeto pasivo deberá realizar las pruebas necesarias
para cerciorarse que su operatividad pueda documentarse electrónicamente y transmitirse
correctamente. Los documentos transmitidos en este ambiente no producen efectos tributarios.

Ambiente Productivo: En este arnbiente el sujeto pasivo autorizado por la Administración Tributaria
para emitir DTEt transmitirá electrónicamente sus documentos y eventos para producir los efectos
tributarios correspondientes.

41

<!-- PAGE 42 / 137 (OCR) -->

3.2. Autenticación

Para el uso de cada uno de los servicios de la plataforma "Sistema de Transmisión" se requiere de
una autenticación previa del sujeto pasivo. Las Guías y Manuales emitidos por la Administración
Tributaria contienen los detalles tecnológicos para el servicio de autenticación en dicho sistema,

EI uso de las claves de autenticación es exclusivo de los sujetos pasivos.

3.3. Recepción de los DTE y Eventos

La recepción de los DTE puede ser "uno a uno" o "en lote" Las Guías y Manuales emitidos por la
Administración Tributaria contienen los detalles tecnológicos para el servicio de recepción de los
DTE.

3.4. Sello de Recepción

Consiste en un código de 40 caracteres alfanuméricos sin guiones, utilizando letras mayúsculas,
que se otorga a los documentos que han cumplido con las reglas establecidas en la regla 10. "Reglas
para el otorgamiento del Sello de Recepciónn de esta Normativa, es decir, con los requisitos y
condiciones establecidas para la correcta generación, firma, transmisión y recepción de los
mismos, conforme al ejemplo que se muestra a continuación:

"selloRecibido": "202460F3AD86872C450B8A04FF84E02E38DCE3WJ"

EI Sello de Recepción tendrá como nombre de objeto/ atributo base en la estructura del Archivo
DTE: "selloRecibido"

3.5. Consulta del Estado del Servicio de Recepción

La Administración Tributaria dispondrá de los entaces de consulta de servicios para los ambientes
de pruebas y productivo, conforme a 10 establecido en las Guías y Manuales correspondientes.

4, Entrega

EI Archivo DTE es un archivo electrónico de extensión JSON que deberá contener la Estructura de
Datos establecida en los Anexos II y III de esta Normativa, además del documento firmado de
acuerdo a las Guías y Manuales emitidos por la Administración Tributaria para tal efecto,
incorporando el Sello de Recepción otorgado por la Administración Tributaria.

La Estructura de Datos establecida en los Anexos li y III de esta Normativa por tipo de documento/
eventot es el insumo utilizado para la firma del DTE/ Evento y, por to tantot deberá incorporarse al
Archivo DTE de forma íntegra para su entrega, sin perjuicio de considerarse lesivo al interés fiscal
por alteraciones a su contenido original.

Las reproducciones de los Archivos DTE, Eventos y su Representación Gráfica, deberán demostrar
con exactitud la información generada, firmada y transmitida a la Administración Tributaria, de
forma íntegra, completa y sin alteraciones de ningún tipo.

<!-- PAGE 43 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 43. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

Los sujetos pasivos deberán exportar los datos o valores de los campos JSON directamente a la
Representación Gráfica que deberá entregarse a los receptores.

Cuando dicha entrega se realice mediante un sitio de descarga de DTE y Eventos para la
autogestión por el receptor, el emisor le facilitará la información necesaria para que pueda acceder
a sus documentos electrónicos, incluyendo como mínimo: Nombre, denominación o razón social
y Número de Identificación Tributaria del emisor, modelo y tipo de trasmisión, hora y fecha de la
transacción, Código de Generación y Sello de Recepción, Código QR que enlace a la dirección del
sitio y/o ruta de descarga del receptor, además de una breve instrucción, para su acceso de forma
confiable, segura y exclusiva. En estos casos, el emisor será el responsable de garantizar una
plataforma de descarga exenta de programas maliciosos o de intervención en las comunicaciones
de cualquier naturaleza.

Cuando la entrega del Archivo DTE y su Representación Gráfica se realice mediante correo
electrónico, el mensaje únicamente deberá contener la información que se refiera a dicha entrega,
evitando contenido no deseado para el receptor, tales como mensajes publicitarios, promocionales
o encuestas.

4.1. Archivo DTE

El Archivo DTE deberá identificarse de forma única y universal con el mismo Código de Generación
del documento o evento.

Los sujetos pasivos deberán entregar a sus receptores un archivo electrónico de extensión JSON
que constituya el Documento Tributario Electrónico o Evento que corresponda, conteniendo:

a) La Estructura de Datos comprendiendo los campos establecidos en los Anexos II y III
de esta Normativa por tipo de documento o evento.

b) La firma electrónica de acuerdo a lo establecido en la regla 2.1 del presente Anexo I y
a las Guías y Manuales emitidos por la Administración Tributaria.

c) El Sello de Recepción otorgado por la Administración Tributaria.

Los sujetos pasivos deberán utilizar las "partes" y "objetos/ atributos base" tal como se encuentra
establecido en el siguiente cuadro:

**Archivo DTE**

| Partes | Objetos/ Atributos Base | Ejemplos |
|---|---|---|
| Llave de apertura | `{` | `{` |
| Estructura de Datos | `"identificacion":{},"emisor":{},"receptor":{},` `"otrosDocumentos":,"documentoRelacionado":,` `"ventaTercero":,"compraTercero":{},` `"cuerpoDocumento":[], "resumen":{},"apendice":,` | `"identificacion":{"version":,"ambiente":"",` `"tipoDte":"","numeroControl":"",` `"codigoGeneracion":"","tipoModelo":,` `"tipoOperacion":,` |
| Firma Electrónica | `"firmaElectronica": "..",` | `"firmaElectronica":"eyJhbGciOiJSUzUxMiJ9.ew0KICAiaWRlbnRpZmljYWNpb24iIDogew0KICAgICJjb2RpZ29HZW5l",` |
| Sello de Recepción¹ | `"selloRecibido": ""` | `"selloRecibido":"2025207067DD7185424C8E000A2598A776A1PG98"` |
| Llave de cierre | `}` | `}` |

<!-- Transcripción verificada visualmente contra el PDF (p. 43). Las estructuras se transcriben tal como aparecen en el original, incluidas las claves sin valor ("otrosDocumentos":, "apendice":, etc.); no se completaron con los schemas. Ejemplo de firma: la secuencia base64 se confirmó decodificándola ({"alg":"RS512"} . {\r\n  "identificacion" : {\r\n    "codigoGene...). Ejemplo de sello: en "E000A" el escaneo no permite distinguir con certeza 0 (cero) de O (letra); se transcribe como cero. -->

¹ El Sello de Recepción tendrá como nombre de objeto/ atributo base: "selloRecibido"

43

<!-- PAGE 44 / 137 (OCR) -->

Cuadro II: Archivo DTE

EI Archivo DTE se presentará como en la siguiente muestra:

tipoDte numeroControl codigoGeneracion tipo
"firma

8A776AIPG9814)

Los Archivos DTE que no cumplan 10 anterior no podrán ser confirmados por la Administración
Tributaria.

5. Módulos

La plataforma tecnológica del sistema del sujeto pasivo emisor deberá poseer los siguientes

1) Generación: En este módulo se recopilará toda la información de la transacción para ser
procesada y consolidada como documento electrónico.

2) Firmado: Será el responsable de efectuar el sellado/firmado del documento electrónico
de conformidad a la Ley de Firma Electrónica.

3) Transmisión: Comprende el medio que se encargará de transmitir el documento
electrónico hacia los servicios de recepción de la Administración Tributaria, expuestos para
dicha finalidad.

4) Entrega: Comprende los medios necesarios para entregar al receptor el Documento
Tributario Electrónico o Evento y su Representación Gráfica.

EI diseño de la arquitectura que soporte el funcionamiento del sistema deberát de acuerdo al
volumen de transacciones, contar con:

a) Plataforma de alta disponibilidad para garantizar la rapidez de los servicios.
b) Plan de recuperación ante desastres.
c) Balanceadores de carga.
d) Componentes de seguridad que garanticen la privacidad de la información.
e) Infraestructura auto escalable, para ajustar la utilización de recursos según el consumo de
los servicios asociados a la plataforrna.
f) Respaldo de datos.
g) Trazabilidad de operaciones,
h) Monitoreo de transacciones.
i) Reportes de sistema.

Seguridad

Et Gestor de Facturación Electrónica de los sujetos pasivos deberá contar con las debidas
recomendaciones de seguridad, incluyendo:

a) Protección contra ataques externos,

44

<!-- PAGE 45 / 137 (OCR) -->

b) Control de accesos no autorizados a los servicios/datos/software/hardware.
c) Registro y reporte de accesos de usuarios y administradores.
d) Garantizar la privacidad de la información.
e) Administración de registro o historial de procesos (logs).
f) Cifrado de información sensible.
g) Plan de continuidad por contingencia.
h) Gestión de incidentes,

Dentro de los lineamientos de seguridad asociados al documento o evento se encuentran la firma
electrónica el Código de Generación, que permitirán identificarlos y relacionarlos, tanto en los
y
sistemas del sujeto pasivo como de la Adninistración Tributaria.

A nivel de seguridad los lineamientos técnicos comprenden:

JWS para firma de documentos o eventos JSON, que permitirá garantizar que han
permanecido íntegros desde su origen.
EI estándar para el archivo JSON será ECMA-404, que es un lineamiento reconocido para
manejo de información para et intercambio de datos.
UUlDv4 para trazabilidad de documentos o eventos.

6.1. Copias de Seguridad

Los sujetos pasivos usuarios de la plataforma "Sistema de Transmisión" deberán mantener una copia
de respaldo de la base de datos de los archivos JSON transmitidos, junto con su respectivo Sello
de Recepción.

Si los sujetos pasivos cuentan con proveedores de Servicios de Almacenamiento de Documentos
Electrónicos estos deberán garantizarles que la información se encuentre disponible y pueda ser
consultada en cualquier momento,

Los sujetos pasivos usuarios de la plataforma "Sistema de Facturación" deberán conservar un
respaldo en un medio de almacenamiento electrónico.

45

<!-- PAGE 46 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 46. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

7. Flujo de proceso DTE y Eventos

**[Diagrama: "Flujo DTE Y EVENTOS" — transcripción textual verificada visualmente contra el PDF, p. 46]**

Carriles: **Contribuyente** (superior) y **Ministerio de Hacienda** (inferior).

Carril Contribuyente:

1. Inicio → **Genera JSON** → **Firma** → (Transmite) → compuerta exclusiva (X):
   - → **Uno a uno** → **Procesamiento**
   - → **Lote** → **Procesamiento**
2. Inicio → **Consulta** → (pasa al carril MH) **Sirve datos**.
3. Evento de mensaje "Retorna datos de consulta" (recibido desde **Sirve datos**).
4. Evento de mensaje de error (recibido desde las validaciones de MH).
5. **Recibe sello de recepción** → Fin.

Carril Ministerio de Hacienda:

1. **Procesamiento** → **Valida token** (en el escaneo se lee «Valida loken»; degradación de impresión) → ¿Error? — Sí: "Recibe mensaje de error" (mensaje al contribuyente) / No: continúa.
2. **Valida firma** → ¿Error? — Sí: "Recibe mensaje de error" / No: continúa.
3. **Valida Esquema** → ¿Error? — Sí: "Recibe mensaje de error" / No: continúa.
4. **Valida reglas de negocio** → ¿Error? — Sí: "Recibe mensaje de error" / No: continúa.
   - Desde **Valida reglas de negocio** sale un flujo punteado "Genera datos de consulta" hacia **Sirve datos**.
5. **Genera sello de recepción** → evento de mensaje → **Recibe sello de recepción** (carril Contribuyente).

**Sirve datos** → "Retorna datos de consulta" (mensaje al contribuyente).

46

<!-- PAGE 47 / 137 (OCR) -->

8- Glosario para estructuras DTE y Eventos

Detalle del contenido columna • Representación Gráfica"'
en

En las ESTRUCTURA DE DATOS DTE Y EVENTOS de los Anexos II y III de la presente Normativa, se
encuentra la columna g Representación Gráfica", categoriza la condición de obligatoriedad del
que
respectivo dentro del formato a entregar al receptor. Para 10 cual deberá cumplirse con 10
campo
siguiente:

A. Se requiere mostrar el campo con los datos en la Representación Gráfica.
Se requiere mostrar el campo con los datos cuando sea necesario de conformidad con la
Ley en la Representación Gráfica.
c: No se requiere mostrar obligatoriamente el campo en la Representación Gráfica.
D Se requiere el campo con un guion en la Representación Gráfica.

Detalle del contenido en columna 'Condición del campo*'

En las ESTRUCTURA DE DATOS DTE Y EVENTOS de los Anexos II y III de la presente Normativa, se
encuentra la columna "Condición del campo", que describe la condición de obligatoriedad del
dentro de la estructura JSON se transmitirá a la Administración Tributaria. Para 10 cual
campo | que
deberá cumplirse con 10 siguiente:

Requerido su transmisión: | Se requiere que el campo contenga datos.
para
Requerido por tipo de operación: Se requiere que el campo contenga datos cuando sea
necesario de conformidad con la Ley.
Opcional: | No se requiere obligatoriamente que el campo contenga
datos.

Las columnas "Representación Gráfica" y condición del Campo" pueden contener dos o más
valores se corresponden a los documentos en general y a las excepciones identificadas por
que
tipo de documento, para este efecto, podrá emplear la columna "Descripción de contenido del
campo" 10 establecido en la regla 1.5. *Definición de condiciones de campo" del Anexo I de esta
y
Normativat para identificar los valores correspondientes.

Detalle de documentos contenidos en columna 'Documento':

En la ESTRUCTURA DE DATOS DTE del Anexo II de la presente Normativa, se encuentra la columna
"Documento", que detalla tas siglas del tipo de documento a los que aplica el campo.

CCFE Comprobante de Crédito Fiscal Electrónico.
NCE: Nota de Crédito Electrónica.
NDE: Nota de Débito Electrónica.
NRE. Nota de Remisión Electrónica.
CRE. Comprobante de Retención Electrónico.
CLE. Comprobante de Liquidación Electrónico,
DCLE: Documento Contable de Liquidación Electrónico.
FCE: Factura Electrónica.
FEXE: Factura de Exportación Electrónica.
FSEE. Factura de Sujeto Excluido Electrónica,
CDE: Comprobante de Donación Electrónico.

47

<!-- PAGE 48 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 48. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

ANEXO II
ESTRUCTURA DE DATOS DTE

Sección 1: IDENTIFICACIÓN

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | A | Identificación | Sección donde se detallan las generales del documento que se está transmitiendo. | Requerido para su transmisión | Objeto | Longitud: 1 | |
| 1 | identificacion.version | A | Versión | Se deberá ingresar el número de la versión del archivo JSON que se está trabajando, la cual debe asegurarse que sea la última versión vigente (sin punto, decimales ni cero a la izquierda).<br><br>Se deberá ingresar valor 2 para los siguientes DTE: FE, CRE, CLE, DCLE, FEXE, FSEE y CDE.<br><br>Se deberá ingresar valor 4 para los siguientes DTE: CCFE, NRE, NCE y NDE. | Requerido para su transmisión | Numérico | Longitud: 2<br>Mínimo: 1<br>Máximo: 2 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 2 | identificacion.ambiente | C | Ambiente de destino | Deberá ingresar el ambiente de trabajo por el cual se está transmitiendo el documento electrónico de acuerdo al catálogo CAT-001 "Ambiente de destino".<br><br>(Los DTE generados en el ambiente Pruebas 00 no son Documentos Legales). | Requerido para su transmisión | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 3 | identificacion.tipoDte | A (Colocar descripción) | Tipo de documento | Se deberá ingresar el código que corresponda al tipo del documento electrónico a emitir, de acuerdo a catálogo (CAT-002 "Tipo de Documento/Evento"). | Requerido para su transmisión | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 4 | identificacion.codigoGeneracion | A | Código de Generación | Debe cumplir con el estándar del UUID v4, longitud de 32 dígitos separados por 4 guiones, haciendo un total de 36 posiciones dividido en 5 grupos.<br><br>El Código de Generación consiste en un número identificador único universal.<br><br>Deberá incluir solamente letras mayúsculas. | Requerido para su transmisión | Alfanumérico | Longitud: 36 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 5 | identificacion.numeroControl | A | Número de Control | Debe cumplir con la estructura definida por la Administración Tributaria (AT) con una longitud de 31 caracteres (las siglas DTE + 2 dígitos del código del tipo de documento + 8 dígitos alfanuméricos 4 del establecimiento y 4 del punto de venta + un consecutivo de 15 dígitos).<br><br>El número consecutivo deberá reiniciarse a partir del primer DTE de cada ejercicio impositivo. | Requerido para su transmisión | Alfanumérico | Longitud: 31 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 6 | identificacion.tipoModelo | A (Colocar descripción) | Modelo de Facturación | Debe mostrar el código asignado al modelo de facturación que utilizará según catálogo CAT-003 "Modelo de facturación". | Requerido para su transmisión | Numérico | Longitud: 1 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, *(continúa en p. 49)* |

48

<!-- PAGE 49 / 137 (OCR) -->

Se ingresará el código I modelo de | FEXE, FSEE y
para
facturación previo en todos los DTE. | CDE

En contingencia deberá ingresar el
código 2 para los siguientes documentos:
FE. CCFE, NERE, NCE. NDE, CRE. FEXE y

Debe contener et código de acuerdo al
catálogo CAT-004 Tipo de Transmisión».
FE. CCFE,
identific | Se ingresará el tipo de transmisión normal | NRE, NCE,
acion.tip | Tipo de código 1 en todos los DTE. | Requerido para | Longitud: NDE, CRE,
7 | Numérico
00pera | Transmisión | su transmisión | 1 | DCLE, CIE,
cion | En contingencia deberá ingresar et | FEXE, FSEEy
código 2 los siguientes documentos: | CDE
para
FE, CCFE, NRE, NCE, NDE FEXE y
FSEE.
Deberá completarse este carnpo
únicamente si se elige el tipo de
Requerido por
transmisión -02-Transmisión por
tipo de
identific | Contingencia'; de 10 contrario, cuando se | FE, CCFE,
operación
acion.tip | Tipo de utilice tipo de transmisión normal deberá | Numérico / Longitud. NRE, NCE,
8 | c | (únicamente si
0Contin | Contingencéa enviar este campo con valor null. | null | NDE, CRE,
tipo de
gencia | FEXE y FSEE
transmisión es
Cuando se esté en contingencia, deberá
Contingencia}
contener código de acuerdo a catátogo:
CAT-005 de Contin enciar.
Campo de texto donde et contribuyente
pueda ampliar el motivo de la
Contingencia,

Requerido si en campo 'Tipo de
Longitud:
Contingencia" se ingresa eI código 5-
identific | 500 FE, CCFE.
Otro. | Requerido
acion.m | Motivo de | Alfanumérico / Mínirno: NCE, NDE,
9 | c | por tipo de
otivoCo | Contingencia | null | 1 | NRE, CRE,
Si el documento electrónico no se está operación
ntin | Máximo: FEXE y FSEE
generando en Contingencia deberá
500
enviar este campo con null,

Si en campo tipo de Contingencia se
ingresa un código diferente a 5, podrá
enviar este campo con valor null-
FE, CCFE,
NRE. NCE,
identific | Es la fecha de la operación, cuya
Fecha de | Requerido para | Longitud: NDE, CRE,
10 acion.fe | estructura definida por la Adrninistrac\ón | Alfanumérico
Generación | su transmisión | 10 DCLE, CIE,
cEmi | Tributaria es. YYYY-MM-DD,
FEXE. FSEE y
CDE
FE, CCFE.
NRE. NCE.
identific | Es la hora de ta operación, cuya estructura
Hora de | Requerido para | Longitud: NDE, CRE,
acion.ho | definida por la Administración Tributaria | Alfanumérico
Generación | su transmisión | 8 | DCLE, CIE.
(Emi | es: | (Formato de 24 horas).
FEXE. FSEE y
CDE
FE, CCFE,
identific | NRE. NCE,
acion.tip | Requerido para | Longitud: NDE, CRE.
12 | c Tipo de Moneda Debe ser USD. | Alfanumérico
oMoned | su transmisión | 3 | DCLE, CLE.
a | FEXE, FSEEy
CDE
Podrá hacer uso de este campo el
contribuyente que legalrnente continúe
identific | Requerido por
con las obligaciones y derechos de otro | Longitud: NCE, NDE,
13 acion-fu c Fusiones y otros | tipo de Alfanumérico
haya emitido un documento previo | 9 0 14 CRE y CLE
que | operación
sion
con un NIT diferente, de conformidad a 10
establecido en el art. 69 inc. Ide la Le de

49

<!-- PAGE 50 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 50. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

*(Continuación de la fila anterior — p. 49 — columna "Descripción de contenido del campo")*

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios.<br><br>Cuando aplique debe ingresar en este campo el NIT del fusionado contenido en el documento de origen; en caso contrario deberá ingresar null. | | | | |

Sección 2: DOCUMENTOS RELACIONADOS

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | B/D | Documentos relacionados | Esta sección deberá llenarse si existiere documento a relacionar, de lo contrario se completará con null. Cuando aplique, podrá relacionarse un máximo de 50 documentos, completando todos los campos de la sección por cada documento relacionado. | Requerido por tipo de operación | Arreglo de objeto null | Longitud: 50 | |
| 14 | documentoRelacionado.tipoDocumento | NCE y NDE=A<br>(CCFE, NRE, FE y FEXE =B) | Tipo de documento relacionado | Deberá indicar el código del documento relacionado según el catálogo: CAT-002 "Tipo de documento/Evento".<br><br>Permitirá la relación con documentos emitidos de forma física y de forma electrónica, desde 1 hasta 50 documentos relacionados, todos del mismo tipo, es decir que no podrán relacionarse diferentes tipos de documentos en un mismo DTE.<br><br>Por ejemplo, en la factura electrónica, no podrán relacionarse notas de remisión y documentos contables de liquidación combinados.<br><br>Para FE, CCFE, NRE y FEXE = cuando no exista documento relacionado este campo deberá enviarse con null. | NCE y NDE= Requerido para su transmisión<br>(FE, CCFE, NRE y FEXE = Requerido por tipo de operación) | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE y FEXE |
| 15 | documentoRelacionado.tipoGeneracion | C | Tipo de generación del documento relacionado | Deberá ingresar código del Tipo de generación del documento relacionado de acuerdo al catálogo CAT-007 "Tipo de generación del documento".<br><br>Para FE, CCFE, NRE y FEXE cuando no exista documento relacionado, este campo deberá enviarse con valor null. | NCE y NDE= Requerido para su transmisión<br>(FE, CCFE, NRE y FEXE =Requerido por tipo de operación) | Numérico | Longitud: 1 | FE, CCFE, NRE, NCE, NDE y FEXE |
| 16 | documentoRelacionado.numeroDocumento | NCE y NDE=A<br>(CCFE, NRE, FE y FEXE =B) | Número de documento relacionado | Deberá ingresar el número del documento que se está relacionando.<br><br>Si el documento relacionado ha sido emitido de forma electrónica, se ingresará el código de generación de dicho documento.<br><br>Si el documento relacionado ha sido emitido de forma tradicional (Físico-papel) deberá indicar el número *(continúa en p. 51)* | NCE y NDE= Requerido para su transmisión.<br>(FE, CCFE, NRE y FEXE = Requerido por tipo de operación) | Alfanumérico | Longitud: 36<br>Mínimo: 1<br>Máximo: 36 | FE, CCFE, NRE, NCE, NDE y FEXE |

50

<!-- PAGE 51 / 137 (OCR) -->

correlativo autorizado del documento
(serie + número).

Cuando no exista documento
relacionado este campo deberá enviarse
con null-

Deberá indicar la fecha de generación
NCE y NDE-
NCE y | contenida en el documento que se esté
Requerido para
docume NDE=A | retacionando, en formato YYYY-MM-DD,
Fecha de | su transmisión
ntoRela | independientemente haya sido generado | FE, CCFE,
generación del | (FE. CCFE, NRE | Longitud:
17 cionado. (CCFE, | de manera electrónica o física. | Alfanumérico | NRE, NCE,
docurnento | Y FEXE | 10
fechaE NRE. FE | NDE y FEXE
relacionado | Requerido por
mision y FEXE | Para FE, CCFE, NRE y FEXE cuando no
tipo de
-8) | exista documento relacionado este
operación)
campo deberá enviarse con valor null.

Sección 3: EMISOR

Esta sección contiene la información
del emisor del DTE. Para eI caso del
CRE eI emisor es el Agente de
Retención; para el CIE, es ei Requerido para | Longitud:
Emisor | Objeto
Comisionista; para el OCLE. es et su transmisión | 1
Agente Perceptor; para la FEXE, es et
Exportador; para ei CDE. es
Donatario.
FE. CCFE.
NRE, NCE,
emisor,n | Deberá contener el NET del emisor sin Requerido para | Longitud:
18 | A | NIT {Emisor) | Alfanumérico | NDE CRE,
it | guiones, | su transmisión | 9 0 14
CLE. DCLE,
FEXE y FSEE

Tipo de
emisor.ti | Longitud:
documento de Para efecto de CDE únicamente se Requerido para
19 poDocu | Alfanumérico | CDE
identificación ingresará el código 36-NIT. | su transmisión | 2
mento
(Emisor)

Número de
en-úsor.n | Longitud:
documento de | Requerido para | CDE
20 urnDoc | Deberá ingresar el NIT del donatario, | Alfanumérico
identificación | su transmisión | 14
umento
(Emisor)

Requerido para
su transmisión
(CCFE, | Deberá contener el NRC del emisor Sin | Longitud: FE, CCFE,
CLE | guion, | 8 | NRE, NCE,
(NERE, NDE y
emisor.n DCLE | Mínimo: NDE. CRE,
y | NCE | Alfanumérico
21 | NRC (Emisor)
FEXE=A) | Cuando et NRC no posea ceros a la | 2 | OCLE, CIE.
rc
Requerido por | Máximo. FEXE, FSEE
izquierda no deberá rellenar con ceros | y
tipo de
cumplir con la longitud. | 8 | CDE
para
operación

51

<!-- PAGE 52 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 52. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | | *(continuación de p. 51)* (CRE, FSEE y CDE= Opcional) | | | |
| 22 | emisor.nombre | A | Nombre (Emisor) | Deberá contener el nombre, denominación o razón social del contribuyente emisor. | Requerido para su transmisión | Alfanumérico | Longitud: 250<br>Mínimo: 1<br>Máximo: 250 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 23 | emisor.codActividad | C | Código de actividad económica (Emisor) | Deberá ingresar el código de la actividad económica que corresponda a la operación, según catálogo CAT-019 "Código de actividad económica". | Requerido para su transmisión | Alfanumérico | Longitud: 6<br>Mínimo: 5<br>Máximo: 6 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 24 | emisor.descActividad | A | Actividad económica (Emisor) | Deberá ingresar nombre que corresponda al código descrito en campo "Código de Actividad Económica". | Requerido para su transmisión | Alfanumérico | Longitud: 150<br>Mínimo: 5<br>Máximo: 150 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 25 | emisor.nombreComercial | B | Nombre comercial (Emisor) | Podrá incorporar el nombre comercial del contribuyente emisor.<br><br>Cuando no aplique deberá llenar el campo con null. | Opcional | Alfanumérico | Longitud: 150<br>Mínimo: 1<br>Máximo: 150 | FE, CCFE, NCE, NDE, NRE, CRE, CLE, DCLE, FEXE y CDE |
| 26 | emisor.direccion.departamento | A | Dirección Departamento (Emisor) | Deberá indicar el código de Departamento en el cual se encuentra ubicada la casa matriz, sucursal, bodega o patio, donde se ha realizado la operación (Catálogo: CAT-012 "Departamento"). | Requerido para su transmisión | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 27 | emisor.direccion.municipio | A | Dirección Municipio (Emisor) | Deberá indicar el código del Municipio donde se encuentra ubicada la casa matriz, sucursal, bodega o patio, donde se ha realizado la operación (Catálogo: CAT-013 "Municipio"). | Requerido para su transmisión | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 28 | emisor.direccion.distrito | A | Dirección Distrito (Emisor) | Debe ingresar el distrito según la ubicación del Emisor según codificación del catálogo CAT-008 "Distrito".<br><br>Código de Distrito debe tener correspondencia con Departamento y Municipio | Requerido para su transmisión | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 29 | emisor.direccion.complemento | A | Dirección complemento (Emisor) | Deberá detallar el complemento de la dirección de la casa matriz, sucursal, bodega o patio, donde se ha realizado la operación, incluyendo el nombre del Distrito. | Requerido para su transmisión | Alfanumérico | Longitud: 200<br>Mínimo: 1<br>Máximo: 200 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 30 | emisor.telefono | A | Teléfono (Emisor) | Deberá incorporar el número de teléfono del emisor. | Requerido para su transmisión | Alfanumérico | Longitud: 30<br>Mínimo: 8<br>Máximo: 30 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |

52

<!-- PAGE 53 / 137 (OCR) -->

Longitud: FE. CCFE,
100 NRE, NCE,
Correo
emisorc | Deberá incorporar el correo electrónico Requerido para | Mínimo: NDE. CRE
31 | A | electrónico | Alfanumérico
orreo | del emisor, con dominio vigente. | su transmisión | 6 | OCLE, CLE,
(Emisor)
Máximo: FEXE, FSEEy
100 | CDE
Podrá incorporar el código de Casa
FE. CCFE,
Código del matriz, Sucursal, Bodega. Patio, que et
emisor.c | NRE, CRE,
establecimiento contribuyente posea internamente. | Alfanumérico / Longitud
32 odEstabl c | Opcional | CLE. DCCE.
asignado por el | null | 4
e | FEXE, FSEE Y
contribuyente Cuando no posea código interno deberá
CDE
enviarlo con null-
Podrá incorporar el código del punto de
Longltud.
Código del venta donde se ha realizado la operación, | FE. CCFE,
15
emisor.c | Punto de Venta que et emisor t(eva internamente. | NRE, CRE,
Alfanumérico/ M(nimo.
33 odPunto c | (Emisor) | Opcional | CLE, OCLE.
nult | 1
Venta | asignado el Cuando el ernisor no posea código de | FEXE, FSEE y
por | Máximo.
contribuyente punto de venta interno este campo se | CDE
15
com tetará con null.
Deberá ingresar et Tipo de exportación
emisor.ti | según catálogo CATm011 'Tipo de ítem'
Tipo de | Requerido para | Longitud:
34 pottemE c | Numérico | FEXE
exportación | su transmisión | 1
xpor | No se hará uso de los códigos 3 y 4 para
este cam o.
Cuando en el campo *Tipo de
exportación' se ingrese et código 1.
deberá indicar et código del Recinto fiscal
conforme at catálogo CAT-027 'Recinto Requerido por
Alfanumérico/ Longitud
35 ecintoFi B | Recinto fiscal fiscal'. | tipo de | FEXE
null | 2
scal | operación
Este campo será null cuando en el campo
'Tipo de exportación• se ingrese la opción
2.
Cuando en el campo *Tipo de
exportación' se ingrese et código 1
deberá indicar eI código det Tipo de
emisor.ti | régirnen conforrne al catálogo CAT-033 Requerido por
Tipo de | Alfanumérico/ Longitud.
36 poRegi | Tipo de Régimen". | tipo de | FEXE
Régimen | null | 4
men | operación
Este campo será null cuando en el campo
"Tipo de exportación- se ingrese el código
2,
Cuando en el campo "Tipo de
exportación• se ingrese eI código 1
deberá indicar el código del Réginnen de
exportación conforme al catátogo CAT- Requerido por
emisor.r | Régimen de | Alfanumérico/ Longitud:
028 'Régimen». | tipo de | FEXE
egimen | exportación | null | 13
operación
Este campo será null cuando en el campo
'Tipo de exportación» se ingrese el código
2.

Sección 4: RECEPTOR

53

<!-- PAGE 54 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 54. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | A | Receptor | Contiene la información del receptor del DTE.<br><br>Para el caso del CRE, el receptor es el Sujeto de Retención; para el CLE, es el Mandante; para el DCLE, es el Afiliado; para el FSEE, es el Sujeto Excluido; para el CDE, es el Donante. | Requerido | Objeto | Longitud: 1 | |
| 38 | receptor.tipoDocumento | A<br>(FEXE =C) | Tipo de documento de identificación (Receptor) | Deberá seleccionar codificación de acuerdo a Catálogo CAT-022 "Tipo de Documento de Identificación".<br><br>Se ingresará el código 13-DUI para el caso de las personas naturales que no posean NRC.<br><br>Para FE podrá enviar con null cuando el "Monto Total de la Operación" sea menor al monto legalmente establecido. | Requerido para su transmisión<br>(FE= Requerido por tipo de operación) | Alfanumérico | Longitud: 2 | FE, NRE, NCE, NDE, CRE, CLE, FEXE, FSEE y CDE |
| 39 | receptor.numDocumento | A | Número de documento de identificación (Receptor) | Deberá ingresar el número de documento de identificación del Receptor.<br><br>Para FE podrá enviar con null cuando el "Monto Total de la Operación" sea menor al monto legalmente establecido. | Requerido para su transmisión<br>(FE= Requerido por tipo de operación) | Alfanumérico | Longitud: 20<br>Mínimo: 1<br>Máximo: 20 | FE, NCE, NDE, NRE, CRE, CLE, FEXE, FSEE y CDE |
| 40 | receptor.nit | A | NIT (Receptor) | Deberá contener el NIT del receptor sin guiones. | Requerido para su transmisión | Alfanumérico | Longitud: 9 o 14 | CCFE y DCLE |
| 41 | receptor.nrc | A<br>(NRE, NCE, NDE, CRE y FE=B)<br>(CDE =C) | NRC (Receptor) | Deberá contener el NRC del receptor sin guion.<br><br>Cuando el NRC no posea ceros a la izquierda no deberá rellenar con ceros para cumplir con la longitud.<br><br>Será null cuando en DTE que se relacione también es null<br><br>Cuando el receptor no posea NRC, deberá llenar este campo con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 8<br>Mínimo: 2<br>Máximo: 8 | FE, CCFE, NCE, NDE, NRE, CRE, CLE, DCLE, y CDE |
| 42 | receptor.nombre | A | Nombre (Receptor) | Debe ingresar el nombre, denominación o razón social del receptor. | Requerido para su transmisión<br><br>FE= Requerido por tipo de operación | Alfanumérico | Longitud: 250<br>Mínimo: 1<br>Máximo: 250 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 43 | receptor.codActividad | C | Código de Actividad Económica (Receptor) | El contribuyente deberá incorporar el código de la actividad económica según catálogo CAT-019 "Código de actividad económica". | Requerido para su transmisión<br><br>CDE= Requerido por tipo de operación<br><br>FE y FSEE= Opcional | Alfanumérico | Longitud: 6<br>Mínimo: 5<br>Máximo: 6 | FE, CCFE, NCE, NDE, NRE, CRE, CLE, DCLE, FSEE y CDE |

54

<!-- PAGE 55 / 137 (OCR) -->

Requerido para
su transmisión
Longitud: FE. CCFE,
CDE=
EI contribuyente deberá incorporar la | 150 NRE, NCE.
receptor | Actividad | Requerido por | CRE,
CDE= B | actividad económica según catálogo | Mínimo: NDE,
44 .descAct | Económica | tipo de | Alfanumérico
CAF019 'Código de actividad | 5 | DCLE, CLE,
ividad | (Receptor) | operación | Máximo: | FSEE
FE y | económica' | y
FSEE= C | 150 | CDE

Y FSEE=
O cional
Podrá incorporar eI nombre comercial del | Longitud- CCFE, NRE,
receptor | Nombre | 150 NCE, NDE,
receptor. | Alfanumérico I
nombre
45 | c | Comercial | Opcional | Mínimo: I CRE, CIE.
Comerci | Null
(Receptor) Cuando no aplique deberá llenar el | Máximo: DCLE y
carn o con null. | 150 | FEXE
receptor | de | únicamente
Tipo | Campo requerido, | aceptará
.tipoEsta | Requerido para | Longitud.
46 | establecimiento codificación según catátogo CAT-009 | Alfanumérico | DCLE
blecimie | su transmisión | 2
{Receptor) 'Tipo de establecimiento"
nto
Deberá indicar el código del
Departamento donde se encuentra
FE, CCFE,
receptor | ubicada la dirección del receptor (Según Requerido para
Dirección | NRE, NCE,
direccio | catálogo: CAT-012 'Departamento'). | su transmis;ón | Longitud:
47 | Departarnento | Alfanumérico | NDE, CRE,
n.depart | 2
(FE-C) (Receptor) | DCI.E,
amento | Cuando el receptor sea extranjero podrá FE Opcional
FSEE y CDE
hacer uso det código OOOtro (Para
extranjeros),
Deberá indicar el Municipio en el cual se
encuentra ubtcada la dirección del
FE. CCFE,
receptor | receptor (según catálogo: CAT-013 Requerido para
Dirección | NRE, NCE,
direccio | 'Municipio'). | su transmisión | Longitud:
48 | Municipio | Alfanumérico | NDE, CRE.
n.rnunici | 2
(Receptor) | CLE, OCLE,
pio | Cuando el receptor sea extranjero podrá FE Opcional
FSEE y CDE
hacer uso del código OOSOtro (Para
extranjeros).
Podrá ingresar et Distrito según la
ubicación del receptor conforme a
FE. CCFE,
codificación del catálogo CAT-008 Requerido para
receptor | Dirección | NERE. NCE,
Distrito. | su transmisión | Longitud:
49 direccio | Distrito | Alfanumérico | NDE, CRET
2
n.distrito (FE-C) (Receptor) | OCLE, CLE,
Código de Distrito debe tener FE=Opcional
FSEE y CDE
correspondencia con Departamento y
Munici io
Longitud FE. CCFE.
receptor | Requerido para | 200 NRE. NCE,
Dirección Deberá detallar el compternento de la
direccio | su transmisión | Mínimo: NDE, CRE,
50 | complemento dirección proporcionada por el receptor | Alfanumérico
n.compl | 1 | DCLE, CLE,
(FE=C) (Receptor) incluyendo el nombre del Distrito.
FE = Opcional | Máximo: FEXE, FSEE y
200 | CDE
Deberá detallar el código det país de
destino de la exportación o de la
nacionatidad del donante. (según
receptor | Código de país | Requerido para | Longitud:
51 | c | catálogo CAT-020 'País'). | Atfanumérlco | FEXE y CDE
.codPais | (receptor) | su transmisión | 2

País destino de exportación para FEXE.
Nacionalidad del Donante ara CDE.

55

<!-- PAGE 56 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 56. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| 52 | receptor.nombrePais | A | País destino de la exportación (receptor) | Deberá ingresar nombre del país destino de la exportación. | Requerido para su transmisión | Alfanumérico | Longitud: 50<br>Mínimo: 3<br>Máximo: 50 | FEXE |
| 53 | receptor.codDomiciliado | C | Domicilio Fiscal | Deberá ingresar codificación de acuerdo al catálogo CAT-032 "Domicilio Fiscal". | Requerido para su transmisión | Alfanumérico | Longitud: 1 | CDE y CLE |
| 54 | receptor.bienTitulo | A | Bienes Remitidos a Título de | Deberá ingresar el código en que son entregados los bienes de acuerdo al catálogo CAT-025 "Título a que se remiten los bienes". | Requerido para su transmisión | Alfanumérico | Longitud: 2 | NRE |
| 55 | receptor.tipoPersona | C | Tipo de Receptor | Deberá clasificar el tipo de receptor, entre persona jurídica o persona natural (según catálogo CAT-029 "Tipo de persona"). | Requerido para su transmisión | Numérico | Longitud: 1 | FEXE |
| 56 | receptor.telefono | C | Teléfono (Receptor) | Podrá incorporar el número telefónico del receptor. | Opcional | Alfanumérico | Longitud: 30<br>Mínimo: 8<br>Máximo: 30 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| 57 | receptor.correo | B | Correo electrónico (Receptor) | Deberá incorporar el correo electrónico con dominio vigente del contribuyente receptor. | Opcional | Alfanumérico | Longitud: 100<br>Mínimo: 6<br>Máximo: 100 | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |

Sección 5: DOCUMENTOS ASOCIADOS

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | B/D | Documentos asociados | En estos campos se describen los documentos asociados.<br><br>Se podrán describir desde 1 hasta 10 documentos asociados, excepto para la FEXE, donde se podrán describir desde 1 hasta 20 documentos.<br><br>Cuando no se requieran, deberá enviar esta sección con null.<br><br>Cuando aplique, si el campo "Documento asociado" está completo con los códigos 1 o 2, esta sección deberá completarse desde el campo "Documento asociado" hasta el campo "Descripción de documento asociado". | Requerido para su Transmisión =CDE<br><br>(Requerido por tipo de operación) | Arreglo de objeto / Null | Longitud: 10 (FEXE=20) | |

56

<!-- PAGE 57 / 137 (OCR) -->

Cuando aplique, si eI campo
Tocumento asociado* detalle et
código 3 'Médico', deberá completarse
desde el campo 'Nombre de médico
que presta eI Servicio' hasta el campo
*Código del tipo de servicio realizado-

En ta FEXE, cuando et campo
'Documento asociado- detalle et
código 4 • Transporte• deberá
completar desde el campo 'Modo de
transporte' hasta el campo 'Nombre y
apellido del conductor'.

En el CDE, será obligatorio ingresar los
datos de la resolución de conformidad
al art. 6 LISR del donatario, deberá
completar desde | campo
'Documento asociado' hasta el campo
'Descri ción de documento asociado'.
Podrá describir si el documento asociado
CDE=
corresponde al emisor, al receptor. al
otrosDo | Requerido para
médico o al transporte. según catálogo
cument | su transmisión
Documento CAT-021 Documentos asociados- | Alfanumérico Longitud: FE, CCFE,
58 os.codD c
asociado | / Null | 1 | FEXE y CDE
ocAsoci | Requerido por
Cuando no existan documentos
ado | tipo de
asociados deberá enviar este campo con
operación
null
Debe describir eI nombre del tipo de
documento asociado al que hace
referencia {por ejernplo: Resoluciones,
Licencias, Permisos, Contratos, Carta de
Venta, Otros).

Aplica cuando eI campo "Documento
CDE=
asociado* esté descrito con et código 1 0 | Longitud:
otrosDo | Requeñdo para | 100
2.
cument CDE | Identificación | su transrnisión
Alfanumérico Mínimo: FE, CCFE,
59 os.desc | del
Para et CDE, será obtigatorio como | / Null | 3 | FEXE y CDE
Docume | asociado | Requetido por
mínimo ingresar los datos de la resolución | Máximo:
nto | tipo de
de conformidad al art. 6 LISR del | 100
operación
donatario.

Cuando no existan documentos
asociados o cuando el campo
«Documento asociado* esté lleno con et
código 3 -médico* y 4 *transporte-. este
cam o deberá enviarse con valor null-
Deberá describir datos importantes del
tipo de documento asociado (ejempto: el
número de resolución. fechas, número de CDE=
Longitud:
otrosDo | contrato. otros). | Requerido para
300
cument CDE- -A Descripción de | su transmisión
Alfanumérico Mínimo: FE, CCFE,
60 os detall | documento Aplica cuando el campo "Documento
/ Null | 3 | FEXE y CDE
eDocunn | asociado asociado* esté lleno con los cód4gos 1 0 Requerido por
Máximo.
ento | 2, | tipo de
300
Cuando no existan documentos operación
asociados o cuando el campo
*Documento asociado- esté lleno con un

57

<!-- PAGE 58 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 58. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 57)* código diferente a 1 o 2 deberá enviarse con null. | | | | |
| 61 | otrosDocumentos.medico.nombre | C | Nombre de médico que presta el servicio | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3 "médico".<br><br>Cuando aplique, deberá detallar el nombre del médico que prestó el servicio.<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" esté lleno con un código diferente a 3. | Requerido por tipo de operación | Alfanumérico / Null | Longitud: 100<br>Mínimo: 1<br>Máximo: 100 | FE y CCFE |
| 62 | otrosDocumentos.medico.nit | C | NIT del médico que presta el servicio | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3 "médico".<br><br>Cuando aplique, deberá detallar el NIT del médico que prestó el servicio. El NIT debe ingresarse sin guiones.<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" esté lleno con un código diferente a 3. | Requerido por tipo de operación | Alfanumérico / Null | Longitud: 14<br>Mínimo: 9<br>Máximo: 14 | FE y CCFE |
| 63 | otrosDocumentos.medico.docIdentificacion | C | Documento de identificación de médico no domiciliado | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3 "médico".<br><br>Cuando aplique, deberá detallar el documento con el que se ha identificado al médico no domiciliado.<br><br>Deberá enviarse con null cuando no existan documentos asociados, cuando el campo "Documento asociado" este lleno con un código diferente a 3 o cuando el médico que presta el servicio se identifica con NIT. | Requerido por tipo de operación | Alfanumérico / Null | Longitud: 25<br>Mínimo: 1<br>Máximo: 25 | FE y CCFE |
| 64 | otrosDocumentos.medico.tipoServicio | C | Código del Servicio Realizado | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3 "médico".<br><br>Cuando aplique, deberá detallar el Código según el catálogo CAT-010 "Código tipo de Servicio (Médico)".<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" este lleno con un código diferente a 3. | Requerido por tipo de operación | Alfanumérico / Null | Longitud: 1 | FE y CCFE |

58

<!-- PAGE 59 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 59. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| 65 | otrosDocumentos.modoTransp | B | Modo de transporte | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 4 "Transporte".<br><br>Deberá ingresar el tipo de transporte utilizado en la exportación según catálogo CAT-030 "Transporte".<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" esté lleno con un código diferente de 4. | Requerido por tipo de operación | Numérico / null | Longitud: 11 *(sic, ver nota)* | FEXE |
| 66 | otrosDocumentos.placaTrans | B | Número de identificación del transporte | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 4 "Transporte".<br><br>Deberá ingresar el número de identificación del medio de transporte utilizado en la exportación.<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" esté lleno con un código diferente de 4. | Requerido por tipo de operación | Alfanumérico / null | Longitud: 70<br>Mínima: 5<br>Máxima: 70 | FEXE |
| 67 | otrosDocumentos.numConductor | C | Número de documento de identificación del conductor | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 4 "Transporte".<br><br>Se deberá ingresar el número del documento de identificación del conductor del transporte.<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" esté descrito con un código diferente a 4. | Requerido por tipo de operación | Alfanumérico / null | Longitud: 100<br>Mínima: 5<br>Máxima: 100 | FEXE |
| 68 | otrosDocumentos.nombreConductor | C | Nombre y apellidos del conductor | Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 4 "Transporte".<br><br>Se deberá escribir el nombre y apellidos del conductor del medio de transporte.<br><br>Deberá enviarse con null cuando no existan documentos asociados o cuando el campo "Documento asociado" esté descrito con un código diferente a 4. | Requerido por tipo de operación | Alfanumérico / null | Longitud: 100<br>Mínima: 5<br>Máxima: 100 | FEXE |

<!-- Fila 65, "Longitud": el escaneo muestra "11" (dos trazos verticales). Por el tipo de dato (código de catálogo CAT-030) podría tratarse de "1"; se transcribe lo visible y se documenta como discrepancia a revisar en ocr-recovery-report.json. -->

Sección 6: VENTAS POR CUENTA DE TERCEROS

> Nota de transcripción (FASE 0.1): en la fila 65 `otrosDocumentos.modoTransp` la columna Longitud se lee impresa como "11". El schema oficial `originales/svfe-json-schemas/v3/fe-fex-v3.json` define `modoTransp` como integer/null con mínimo 1 y máximo 7 (catálogo CAT-030). Se conserva el valor impreso; discrepancia documentada en `auditoria/ocr-recovery-report.json`, no corregida.

59

<!-- PAGE 60 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 60. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | B/D | Ventas por cuenta de terceros | Esta sección deberá completarse cuando la venta es por cuenta de terceros.<br><br>Las ventas por cuenta de terceros deben ingresarse en documentos/ eventos separados de las operaciones propias.<br><br>Importante: Deberá completarse esta sección para poder ingresar en el CLE la información de los DTE emitidos por cuenta de terceros. | Requerido por tipo de operación | Objeto / null | Longitud: 1 | |
| 69 | ventaTercero.nit | B | NIT por cuenta de Terceros | Deberá contener el NIT del tercero, cuando se realice una operación por cuenta de terceros.<br><br>NIT deberá ingresarse sin guiones.<br><br>Cuando las ventas no se realicen por cuenta de terceros deberá enviar el campo con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 20<br>Mínima: 1<br>Máxima: 20 | FE, CCFE, NRE, NCE, NDE y FEXE |
| 70 | ventaTercero.nombre | B | Nombre del Tercero | Deberá de indicarse el nombre, denominación o razón social del tercero, cuando se realice una operación por cuenta de terceros.<br><br>Cuando las operaciones no se realicen por cuenta de terceros deberá enviar campo con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 250<br>Mínima: 1<br>Máxima: 250 | FE, CCFE, NRE, NCE, NDE y FEXE |
| 71 | ventaTercero.codDomiciliado | C | Domicilio Fiscal | Cuando se detallen ventas a cuenta de terceros deberá completar este campo con uno de los códigos contenidos en el catálogo CAT-032 "Domicilio Fiscal". | Requerido por tipo de operación | Numérico | Longitud: 1 | FE, CCFE, NRE, NCE, NDE y FEXE |

Sección 7: COMPRA POR CUENTA DE TERCEROS

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | B | Compra por cuenta de terceros | Esta Sección deberá completarse cuando la compra se efectúe por cuenta de terceros. Cuando no aplique, deberá transmitir la sección completa con null. | Requerido por tipo de operación | Objeto/ Null | 1 | |
| 72 | compraTercero.numDocumento | B | Número de documento de identificación del Tercero | Deberá contener el número del documento de identificación del tercero, cuando se realice una compra por cuenta de terceros.<br><br>El número deberá ingresarse sin guiones ni otros caracteres especiales. | Requerido por tipo de operación | Alfanumérico | Longitud: 20<br>Mínimo: 1<br>Máximo: 20 | FEXE |

60

<!-- PAGE 61 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 61. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| 73 | compraTercero.nombre | B | Nombre del Tercero | Deberá de indicarse el nombre, denominación o razón social del tercero, cuando se realice una compra por cuenta de terceros. | Requerido por tipo de operación | Alfanumérico | Longitud: 250<br>Mínimo: 1<br>Máximo: 250 | FEXE |

Sección 8: CUERPO

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | A | Cuerpo | Esta sección contiene la información detallada de la operación realizada.<br><br>Se aplicarán las reglas de redondeo y holgura contenidas en las reglas 7.2 literal a) y 7.3 de esta Normativa. | Requerido para su transmisión | Arreglo de objeto | 2000 (CRE y CL= 500) | |
| 74 | cuerpoDocumento.numItem | A | N° de ítem | En este campo se hará referencia a los ítems por cada operación, por lo que deberá contener una numeración consecutiva iniciando desde 1 hasta el máximo permitido. | Requerido para su transmisión | Numérico | Longitud: 4<br>Mínima: 1<br>Máxima: 4<br><br>(CRE y CLE= Mínimo: 1 Máximo: 3) | FE, CCFE, NRE, NCE, NDE, CRE, CLE, FEXE, FSEE y CDE |
| 75 | cuerpoDocumento.tipoItem | C | Tipo de ítem | Deberá indicar el tipo de ítem de la operación que se está realizando, según catálogo CAT- 011 "Tipo de ítem".<br><br>Se deberá ingresar en este campo el código 4 cuando se detallen impuestos cuyo valor esté sujeto al cálculo del IVA; es decir, que se detalle en el ítem impuestos que correspondan a los códigos A8, 57, 90, A6, contenidos en catálogo CAT-015 "Tributos" apartado 2.<br><br>Cuando en NRE se relacione FEXE solo permitirá ingresar los códigos 1 o 2<br><br>En FEXE no se permitirá el uso del código 3<br><br>En FSEE no se permitirá el uso del código 4. | Requerido para su transmisión | Numérico | Longitud: 1 | FE, CCFE, NRE, NCE, NDE, FEXE y FSEE |
| 76 | cuerpoDocumento.tipoDonacion | C | Tipo de donación | Deberá indicar el tipo de donación que se está realizando según catálogo CAT-026 "Tipo de donación". | Requerido para su transmisión | Numérico | Longitud: 1 | CDE |

61

<!-- PAGE 62 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 62. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| 77 | cuerpoDocumento.tipoDepreciacion | A | Depreciación | Cuando el campo tipo de donación esté completo con el código 2 (Bien) según catálogo CAT-026 "Tipo de donación", deberá ingresar el valor de la depreciación del bien donado.<br><br>Cuando en los bienes donados no tenga efecto la depreciación, deberá completar el campo con $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,8 | CDE |
| 78 | cuerpoDocumento.tipoDte | A | Tipo de Documento Relacionado | Se deberá indicar el código del documento relacionado según catálogo CAT-002 "Tipo de documento/evento".<br><br>Este campo podrá repetirse hasta un máximo de 500 veces (indicando el tipo de documento que se está detallando en cada ítem).<br><br>Se permitirá relacionar documentos emitidos de forma física y electrónica de manera conjunta o separada.<br><br>En el CRE no se podrán ingresar diferentes tipos de documentos, es decir, se puede relacionar un solo tipo de documento.<br><br>En el CLE se permitirá relacionar documentos de diferentes tipos. Por ejemplo: en un mismo CLE podrán relacionarse: CCF, F, FEX, NC, ND y Evento de retorno. | Requerido para su transmisión<br><br>CRE= Requerido por tipo de operación | Alfanumérico | Longitud: 2 | CRE y CLE |
| 79 | cuerpoDocumento.tipoGeneracion | C | Tipo de generación del documento relacionado | Se seleccionará el Tipo de generación del documento según catálogo CAT-007 "Tipo de generación del documento".<br><br>Este campo podrá repetirse hasta un máximo de 500 veces. | Requerido para su transmisión<br><br>CRE= Requerido por tipo de operación | Numérico | Longitud: 1 | CRE y CLE |
| 80 | cuerpoDocumento.numeroDocumento | CRE y CLE=A<br><br>C | Número de documento relacionado | Cuando aplique deberá ingresar el Código de Generación o número correlativo del documento que se está referenciando.<br><br>En el caso de FE, CCF, NR, NC, ND y FEX sólo se podrá ingresar los números de documentos relacionados que se encuentren descritos en la sección de "Documentos relacionados". Asimismo, este campo podrá repetirse un máximo de 2000 veces, debiendo ingresarse el número del documento relacionado en cada uno de los ítems, pudiendo relacionarse desde 1 hasta 50 documentos.<br><br>Para el CLE se permitirá el ingreso del código de generación o número *(continúa en p. 63)* | CLE, NCE y NDE Requerido para su transmisión<br><br>FE, CCFE, NRE CRE y FEXE= Requerido por tipo de operación | Alfanumérico | Longitud: 36<br>Mínimo: 1<br>Máximo: 36 | FE, CCFE, NRE, NCE, NDE, CRE, CLE y FEXE |

62

<!-- PAGE 63 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 63. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 62)* correlativo del documento una sola vez con un mismo estado (Válido o Inválido).<br><br>Para CRE y CLE este campo podrá repetirse un máximo de 500 veces, debiendo ingresar un documento relacionado por cada ítem.<br><br>Para CRE se permitirá el ingreso del Código de Generación o número correlativo de F o CCF. | | | | |
| 81 | cuerpoDocumento.fechaEmision | A | Fecha de Generación del Documento relacionado | Deberá ingresar la fecha de generación del documento relacionado. La estructura definida por la Administración Tributaria es: YYYY-MM-DD. | CLE= Requerido para su transmisión<br><br>CRE= Requerido por tipo de operación | Alfanumérico | Longitud: 10 | CRE y CLE |
| 82 | cuerpoDocumento.cantidad | A | Cantidad | Deberá indicar la cantidad del producto o servicio que detalla por ítem.<br><br>Este campo se deberá completar con valor 1 en los siguientes casos:<br>a) Cuando se haga uso del campo "Cargos / Abonos que no afectan la base imponible".<br>b) Cuando campo "Tipo de ítem" según catálogo CAT-011 "Tipo de ítem" esté lleno con el código 4.<br>c) Cuando la NCE o NDE ajuste un CRE.<br>d) Cuando en el CDE el tipo de donación sea en efectivo. | Requerido para su transmisión | Numérico | Longitud: 11,8 | FE, CCFE, NRE, NCE, NDE, FEXE, FSEE y CDE |
| 83 | cuerpoDocumento.codigo | B | Código | Este campo contiene la codificación con la que el Emisor identifica sus productos o servicios.<br><br>Los contribuyentes obligados a presentar el Informe F-983 "Informe de Inventario Físico de Bienes del Activo Realizable o Corriente" deberán ingresar el mismo código de inventario utilizado en dicho informe.<br><br>Los contribuyentes no obligados a presentar dicho Informe, podrán ingresar null. | Requerido por tipo de operación | Alfanumérico | Longitud: 25<br>Mínimo: 1<br>Máximo: 25 | FE, CCFE, NRE, NCE, NDE, FEXE, FSEE y CDE |
| 84 | cuerpoDocumento.codTributo | C | Tributo sujeto a cálculo de IVA | Apartado especial para otros impuestos detallados en el cuerpo del documento que son sujetos al IVA.<br><br>Campo especial para el uso de la sección 2 del CAT-015 "Tributos" (códigos A8, 57, 90 y A6).<br><br>Será requerido cuando en el campo "Tipo de ítem" se ingrese el código 4 (si el campo "Tipo de ítem" tiene un código diferente, deberá enviar con null). *(continúa en p. 64)* | Requerido por tipo de operación | Alfanumérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE y FEXE |

63

<!-- PAGE 64 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 64. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 63, campo 84)* Cuando se haga uso de este campo, deberá ingresar 1 en el campo "cantidad" y en el campo "precio unitario" el valor calculado del tributo.<br><br>Cuando se haga uso de este campo para CCFE, NRE, NCE, NDE y se detalle ventas gravadas se permitirá únicamente el código 20-IVA en el campo "Código del Tributo". No se permitirá adicionar otros códigos.<br><br>Cuando se haga uso de este campo para FE o FEXE y se detallen ventas gravadas, el campo "Código del tributo" se deberá enviar con null.<br><br>Los emisores que requieran hacer uso de Impuesto Especial al Combustible en FEXE deberán solicitarlo y justificarlo para su autorización. | | | | |
| 85 | cuerpoDocumento.uniMedida | A | Unidad de Medida | Deberá detallar el código de la unidad de medida que utiliza para la descripción del producto por ítem (según catálogo CAT-014 "Unidad de Medida").<br><br>Se deberá ingresar el código 99 (otra) de dicho catálogo cuando:<br>a) El contribuyente preste un servicio.<br>b) No aplique unidad de medida o la unidad de medida no esté contemplada dentro del catálogo proporcionado.<br>c) Se haga uso del campo "Cargos / Abonos que no afectan la base imponible".<br>d) El campo "Tipo de ítem" esté lleno con el código 4.<br>e) Cuando la donación sea en efectivo.<br>f) Cuando se detalle la forma de presentación del producto. | Requerido para su transmisión | Numérico | Longitud: 2 | FE, CCFE, NRE, NCE, NDE, FEXE, CDE y FSEE |
| 86 | cuerpoDocumento.descripcion | A<br><br>CRE=C | Descripción | Deberá contener la descripción por ítem que detalle el producto y/o servicio de la operación. | Requerido para su transmisión<br><br>CRE= Opcional | Alfanumérico | Longitud: 1500<br>Mínimo: 1<br>Máximo: 1500 | FE, CCFE, NCE, NDE, NRE, CRE, FEXE, FSEE y CDE |
| 87 | cuerpoDocumento.precioUni | A | Precio Unitario | Deberá indicar por ítem el precio unitario de cada producto o servicio de la operación.<br><br>Cuando se haga uso del campo "Cargos / Abonos que no afectan la base imponible", deberá ingresar el valor $0.00<br><br>Cuando el campo "Tipo de ítem" se complete con el código 4 deberá reflejar el valor del tributo sujeto a IVA. | Requerido para su transmisión | Numérico | Longitud: 11,8 | FE, CCFE, NRE, NCE, NDE, FEXE y FSEE |

64

<!-- PAGE 65 / 137 (OCR) -->

Deberá indicar el valor unitario de tos
bienes o el costo de los servicios
cuerpo
donados.
Docum | Requerido para | Longitud:
88 | Valor Unitario | Numérico | CDE
ento.vat | su transmisión | 11.8
Cuando la donación sea en efectivo,
orUni
deberá ingresar el monto total de la
donación.
En este campo se detallarán por tern los
descuentos, bonificaciones o rebajas
realizadas al precio de los productos o
servicios.
cuerpo | FE. CCFE.
Docum | NCE.
Descuento por Para NCE y NDE cuando se detalle el Requerido para | Longitud:
89 ento.mo | Numérico
(tem | descuento el CCF a ajustar debe su transmisión | 11.8 NDE, FEXE y
para
ntoDesc | FSEE
incluir tanto el descuento por ítem como
et descuento globat.

Cuando no aplique el descuento deberá
ingresar el valor $O.OO
Deberá detallar el valor de las ventas no
sujetas de la operación, las cuales están
dadas por el resultado de: [('precio
unitario' * 'cantidad') Descuento
- | por
íternSJ

Si no existen ventas no sujetas deberá
ingresar $O.OO

Para eI CLE. cuando se reEacione FE VI,
CCFE V3, NRE Vs. NCE V3 y NDE V3 será
cuerpo | resultado de | at Total de | FE. CCFE.
el | restar | Requerido por
Docum | Ventas no | Longitud:
90 | operaciones Ventas no sujetas- | tipo de | Numérico | NRE, NCE.
ento.ven | sujetas | 11,8
Descuento global a Ventas no sujetas' operación | NDE y CLE
taNoSuj | documento | está
contenidos en el | que se
liquidando.

Para eI CLE cuando se detale NCE V4.
NDE V4 y Evento de retorno VI debe
ingresar eI valor del campo Total de
operaciones Ventas no sujetas' contenido
en el documento que se está liquidando,

Se aplicarán las reglas de redondeos y
hot ura.
Deberá detallar eI valor de las ventas
exentas de la operación, las cuales están
dadas por el resuktado de: [Cprecio
unitario' * 'cantidad') Descuento
- | por
ítem"l

cuerpo | Si no existen ventas exentas deberá
Requerido por | FE, CCFE,
Docum | ingresar $O.OO | Longitud:
91 | Ventas exentas | tipo de | Nurnérico | NRE, NCE,
ento,ven | 11,8
operación | NDE y CLE
taExenta | Para el CLE, cuando se retacione FE VI,
CCFE V3, NRE NCE V3 y NDE VS será
et resultado de restar al 'Total de
operaciones Ventas Exentas
'Descuento giobal a Ventas Exentas'
contenidos en el documento que se está
li ufdando.

65

<!-- PAGE 66 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 66. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 65)* Para el CLE cuando se detalle NCE V4, NDE V4 o Evento de retorno V1 debe ingresar el valor del campo "Total de operaciones Ventas Exentas " contenido en el documento que se está liquidando.<br><br>Se aplicarán las reglas de redondeos y holgura. | | | | |
| 92 | cuerpoDocumento.ventaGravada | A | Ventas gravadas | Deberá detallar el valor de las ventas gravadas de la operación, las cuales están dadas por el resultado de: [("precio unitario" * "cantidad") - "Descuento por ítem"]<br><br>Si no existen ventas gravadas deberá ingresar $0.00<br><br>Para el CLE, cuando se relacione FE V1, CCFE V3, NRE V3, NCE V3 y NDE V3 será el resultado de restar al "Total de operaciones Ventas Gravadas" - el "Descuento global a Ventas Gravadas" contenidos en el documento que se está liquidando.<br><br>Para el CLE cuando se detalle NCE V4, NDE V4 o Evento de retorno V1 debe ingresar el valor del campo "Total de operaciones Ventas Gravadas" contenido en el documento que se está liquidando.<br><br>Se aplicarán las reglas de redondeos y holgura. | FEXE= Requerido para su transmisión<br><br>Requerido por tipo de operación | Numérico | Longitud: 11,8 | FE, CCFE, NRE, NCE, NDE, CLE y FEXE |
| 93 | cuerpoDocumento.exportaciones | A | Exportaciones | Deberá detallar únicamente los valores de FEX.<br><br>Deberá detallar los Eventos de retorno aplicados a FEXE.<br><br>Para FEXE V1 y V2 deberá ingresar el valor del campo "Monto total de la operación".<br><br>Para FEXE V3 será el resultado de: "Total de operaciones Ventas Gravadas" - "Descuento global a Ventas Gravadas" + "Seguro" + "Flete".<br><br>Para Evento de retorno aplicado a FEXE deberá ingresar el valor contenido en el campo "Suma de operaciones".<br><br>Si no existen exportaciones deberá colocar $0.00<br><br>Cuando se informe FEX con estado invalidado/anulado, deberá ingresar los valores monetarios con signo negativo. | Requerido por tipo de operación | Numérico | Longitud: 11,8 | CLE |

66

<!-- PAGE 67 / 137 (OCR) -->

Para el CLE cuando se detalle Evento de
retorno VI debe ingresar el valor del
campo 'Total de operaciones Ventas
Gravadas' contenido en el evento que se
está liquidando, con valor negativo.

Se aplicarán las reglas de redondeos y
hol ura,
Deberá detallar et valor donado por cada
ítem, el cual estará dado por el resultado
cuerpo | unitario
de: [CVator
Docum | Requerido para | Longitud:
94 | A | Valor donado 'Depreciación') | Numérico | CDE
ento.vat | su transmisón | 11.8
or
Se aplicarán las reglas de redondeos y
hot ura.

cuerpo | Deberá indicar en este campo el monto
Docum | de ta compra, la cual estará dada por el Requerido para | Longitud:
95 | Compras | Numérico | FSEE
entoco | resultado de: l('precio unitario* su transrnisfón | 11,8
mpra | 'cantidad') - 'Descuento por ítems).

Podrá ingresar eI código de los tributos
que apliquen al producto o servicio
detallado en el ítem según catálogo CAT-
015 *Tributos' secciones 1 y 3,

Código del tributo deberá ingresarse
entre corchetes y separarse por comas.

Cuando en el documento existan ventas
gravadas debe ingresarse el código del
tributo 20, se exceptúa de esta condición
la FE y FEXE.

Si en FE las ventas gravadas solo aplicaran
a IVA deberá ingresar este campo con
null.

Para FEXE deberá ingresar en este campo
el código C3, a excepción que se detallen | FE, CCFE.
cuerpo | Requerido
por | NRE. NCE,
Docum | Código del en et ítem tributos sujetos a cálculo de | Longitud.
96 | c | tipo de | Alfanumérico
ento.trib | tributo | iVA, en este caso debe ingresar null, | 2 | NDE, CLE y
operación
utos
Los emisores que requieran hacer uso de
los tributos FOViAL y COTRANS {DI y C8)
en FEXE deberán solicitarlo y justificarlo
para su autorización.

Para CCFE, NERE, NCE y NDE cuando se
haga uso de campo 'Tributo sujeto a
cálculo de IVA' con ventas gravadas debe
ingresar en el código 20.

Para el caso de CLE soto aplicarán los
tributos contenidos en ta sección 1 ciel
CAT-015 • Tributos-
catálogo | que se hayan
aplicado en el DTE que se esté
informando. Cuando se detalle FE o
Evento de Retorno aplicado a FE con
ventas gravadas, deberá detallar et código
20. Cuando se detalle FEX o Evento de

67

<!-- PAGE 68 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 68. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 67)* retorno aplicado a FEX, deberá detallar el código C3.<br><br>Este campo podrá ser null en los siguientes casos:<br>1- Cuando en el ítem se detallen Ventas no sujetas.<br>2- Cuando en el ítem se detallen Ventas exentas.<br><br>Deberá completarse con null cuando:<br>1-Si se hace uso del campo "Cargos / Abonos que no afectan la base imponible".<br>2. Cuando en FE o FEXE el tipo de Ítem sea 4.<br>3. Cuando la NCE o NDE ajuste un CRE. | | | | |
| 97 | cuerpoDocumento.psv | C | Precio sugerido de venta | Deberá contener el precio sugerido de venta (PSV) según aplique, de acuerdo a lo informado a la Administración Tributaria en los formularios respectivos. El PSV deberá detallarse por ítem.<br><br>Este campo es sólo de uso informativo. Si la naturaleza del negocio no lo requiere deberá enviar con valor $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,8 | FE y CCFE |
| 98 | cuerpoDocumento.noGravado | B | Cargos/ abonos que no afectan la base imponible | Podrán detallarse cargos o abonos al receptor que no afecten la base imponible.<br><br>Se incorporará el monto con signo negativo o positivo según sea el caso.<br><br>Cuando no existan Cargos/Abonos que no afecten la base imponible se deberá llenar con valor $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,8 | FE, CCFE, NCE, NDE y FEXE |
| 99 | cuerpoDocumento.ivaPerci | B | IVA percibido | Cuando aplique deberá ingresar el valor de IVA percibido a ajustar en el ítem del CCF relacionado.<br><br>De no existir IVA percibido deberá ingresar $0.00. | Requerido por tipo de operación | Numérico | 11,8 | NCE y NDE |
| 100 | cuerpoDocumento.totalIva | B | IVA 13 % | Cuando aplique deberá detallar el monto a ajustar de IVA 13 % del CR generado por operaciones con personas naturales no inscritas en IVA.<br><br>De no existir IVA 13% en CR deberá ingresar $0.00. | Requerido por tipo de operación | Numérico | 11,8 | NCE y NDE |
| 101 | cuerpoDocumento.ivaRete | B | IVA retenido | Cuando aplique deberá ingresar el valor de IVA retenido a ajustar en el ítem del CCF relacionado.<br><br>De no existir IVA retenido deberá ingresar $0.00. | Requerido por tipo de operación | Numérico | 11,8 | NCE y NDE |
| 102 | cuerpoDocumento.ivaItem | C | IVA por ítem | Este valor no se considera para efecto de la sumatoria del campo "valor de tributo" que corresponda a IVA en la sección resumen del documento. | Requerido por tipo de operación | Numérico | Longitud: 11,8 | FE y CLE |

68

<!-- PAGE 69 / 137 (OCR) -->

Debe ingresar el monto computado del
IVA por cada ítem.

Para la FE el valor de este campo será el
resultado de: [CVentas gravadas por ítem'
11.13) * 130/01.

Para et CLE el valor de este carnpo será el
resultado de: 'Ventas Gravadas' * 13%.

En et caso del CLE, cuando el documento
informado se encuentre con estado
invalidado/anulado, se ingresará tVA 13Z
con valor negativo, a excepción de la NC
que se ingresará con valor positivo.

Se aplicarán las reglas de redondeos y
hol ura.
cuerpo
Docum | Deberá detallar eI vator neto que fue
Monto sujeto a | Requerido para | Longitud:
103 entono | sujeto de retención cada documento | Numérico | CRE
por | 11,2
retención | su transmisión
ntoSujet | detallado en cada ítem.
oGrav
cuerpo
Docum | Debe ingresar eI código que corresponda
ento.co | Código al tipo de retención detallado en el DTE Requerido para | Longitud:
104 | c | Alfanumérico | CRE
dÉgoRet | retención Ml-i relacionado de acuerdo al catálogo CAT- su transmisión | 2
encion | 006 "Retención WA MH'.

Deberá detallar el monto de retención IVA
cuerpo | efectuada en el documento relacionado.
Docum | Es eI resultado del •Monto Sujeto a
Requerido para | Longitud:
105 ento.iva A | IVA Retenido retención' multiplicado por el porcentaje | Nurnérico | CRE
su transmisión | 11,2
legal.
o | Se aplicarán las reglas de redondeos y
holgura
cuerpo
Docum
ento.per | Fecha Inicio del Deberá indicar la fecha inicial del período
Requerido para | Longitud:
106 iodoliqu | período de a liquidar, cumptiendo con la estructura: | Alfanumérico | DCLE
su transmisión | 10
idacionF | liquidación YYYY-MM-DD.
echalnic
io
cuerpo
Docum
Fecha fin det Deberá indicar la fecha final del período a
ento.per | Requerido para | Longitud:
107 | periodo de liquidar, cumpliendo con la estructura' | Alfanumérico | DCLE
iodoLiqu | su Üansmisión | 10
liquidación YYYY-MM-DD,
idacionF
echaFin
Longitud:
cuerpo | Podrá }ndicar el código de las | 30
Docum | Mínimo:
Código de liquidaciones según controtes internos.
108 ento.co c | Opcional Alfanumérico | DCLE
liquidación | 1
dLiquida | De hacer del | null. | Máximo:
no uso campo ingresar
cion | 30
Podrá indicar la cantidad de documentos | Longitud:
cuerpo | Cantidad de | están liquidando. | 9
que se | DCLE
109 Docum c | Opcionat | Numérico
documentos | Mínimo: I
ento.can | Máximo: 9
De no hacer uso det cam o in resar null.

69

<!-- PAGE 70 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 70. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | *(continuación de p. 69; fragmento final del nombre del campo JSON:)* …tidadDoc | | | | | | | |
| 110 | cuerpoDocumento.valorOperaciones | A | Valor de las operaciones a liquidar | Deberá indicar el valor monetario total (incluyendo IVA, propina u otro) de las transacciones a liquidar. | Requerido para su transmisión | Numérico | Longitud: 11,2 | DCLE |
| 111 | cuerpoDocumento.montoSinPercepcion | B | Valores no sujetos a percepción | Podrá colocar el monto de las operaciones a liquidar no sujetas a percepción.<br><br>De no hacer uso del campo ingresar $0.000 *(sic: tres decimales en el original)* | Opcional | Numérico | Longitud: 11,2 | DCLE |
| 112 | cuerpoDocumento.descripSinPercepcion | B | Descripción del valor no sujeto a percepción | Podrá indicar una breve descripción de las operaciones que identifiquen el origen de los montos no sujetos a percepción.<br><br>De no hacer uso del campo ingresar null. | Opcional | Alfanumérico / Null | Longitud: 100<br>Mínimo: 1<br>Máximo: 100 | DCLE |
| 113 | cuerpoDocumento.observaciones | B | Observaciones por ítem | Podrá hacer una observación por cada ítem. De no hacer uso del campo ingresar null. | Opcional | Alfanumérico / Null | Longitud: 1000<br>Mínimo: 1<br>Máximo: 1000 | CLE y DCLE |
| 114 | cuerpoDocumento.subTotal | A | Sub total | Deberá contener el resultado de: "Valor de las operaciones a liquidar" - "Valores no sujetos a percepción".<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | DCLE |
| 115 | cuerpoDocumento.montoSujetoPercepcion | A | Monto sujeto a percepción sin IVA | Deberá indicar el valor neto de las operaciones sobre el cual se efectúa la percepción IVA. | Requerido para su transmisión | Numérico | Longitud: 11,2 | DCLE |
| 116 | cuerpoDocumento.iva | A | IVA de las operaciones a liquidar | Deberá indicar el IVA de las transacciones, que se calcula sobre el valor neto de las operaciones reportadas por el afiliado.<br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | DCLE |
| 117 | cuerpoDocumento.ivaPercibido | A | IVA percibido (2%) | Deberá indicar el IVA percibido sobre el valor neto de las operaciones reportadas por el afiliado.<br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | DCLE |
| 118 | cuerpoDocumento.comision | A | Comisión | Deberá indicar el monto de la comisión por el servicio.<br>De no hacer uso del campo ingresar $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,2 | DCLE |
| 119 | cuerpoDocumento.porcentComision | A | Porcentaje de comisión | Podrá indicar el porcentaje de la comisión.<br>De no hacer uso del campo ingresar $0.00 | Opcional | Alfanumérico | Longitud: 3,2 | DCLE |

70

<!-- PAGE 71 / 137 (OCR) -->

cuerpo | Deberá indicar el monto det IVA de la
Docum | comisión por et servicio.
120 | IVA de la De no hacer del | Requerido por
ento.iva | uso campo debe ingresar
comisión $o.oo | tipo de | Nurnérico Longitud:
Comisio | DCLE
Se | operación | 11.2
apticarán (as reglas de redondeos
y
holgura.
cuerpo
Docum | Deberá indicar el valor liquido a
pagar al
121 | Valor líquido a afiliado.
ento.liqu | Requerido para
pagar al afiliado Se aplicarán las | Numérico Longitud:
idoApag | reglas de redondeos y su transmisión | DCLE
11,2
ar | holgura.

cuerpo | Longitud:
Docum | 200
122 | c | Podrá indicar en letras el valor
Valor en tetras | total a
ento.tot | Opcional | Mínimo:
pagar. | Alfanumérico | DCLE
alLetras | 1
Máximo:
200

Sección 9: RESUMEN

Esta sección contiene un | de
resumen la
información del | del
cuerpo
documento.
Requerido
Resumen | Longitud:
para su | Objeto
Se aplicarán las reglas de redondeo | 1
y transmisión
holgura contenidas en las reglas 7.2
literal b) 7.3 de esta Normativa.
Deberá contener la sumat0fia de
todos
los valores contenidos ítem
por en el
campo de 'Ventas no sujetas',
resumen | Total de
123 .totaINo A operaciones | Requerido | FE, CCFE,
no Cuando no existan ventas no sujetas, | para | longitud
este | Numérico
suj | sujetas | deberá | su transmisión | NRE, NCE,
campo | enviarse con $0.00 | 11,2
NDE y
Se aplicarán las reglas de redondeos
y
hol ura.
Deberá contener la sumatoria de todos
los valores contenidos ítem
por en el
campo de 'Ventas exentas'.
resumen | Total de
124 .totalExe | FE, CCFE,
operaciones Cuando no existan ventas | Requerido para | Longitud.
exentas. este | Numérico
nta | exentas | NRE, NCE,
campo deberá enviarse $O.OO | su transmisión | 11,2
con
NDE y CLE
Se aplicarán las reglas de redondeos
y
hol ura.
Deberá contener la sumatoria de todos
los valores contenidos ítem
por en eI
resurnen | Totat de
campo de 'Ventas gravadas' | FE. CCFE,
125 .totalGra
operaciones | Requerido para | Longitud. NRE,
vada | Numérico | NCE,
gravadas Cuando no existan | su transmisión | 11,2
ventas gravadas, este | NDE, CLE y
campo deberá enviarse con $0.00 | FEXE

71

<!-- PAGE 72 / 137 (OCR) -->

nnn—nuon Se

aplicarán las reglas de redondeos
y
holgura.

Deberá contener ta
sumatoria de
operaciones de exportación realizadas
(detallar únicamente valores
contenidos
resurnen | Total de
126 exporta
operaciones de Cuando no existan | Requerido para
cion | ventas por | Longitud:
exportación | su | Numérico | CLE
operaciones de exportación, se deberá transmisión | 11,2
enviar campo con 50.00

Se aplicarán las reglas de
redondeos y
holgura.
Deberá contenet la sumatoria de
todas tas
resumen | operaciones detalladas por ítem el
en
127 totalCo | Total de campo 'Compras'
operaciones | Requerido para | Longitud.
rnpra | Numérico | FSEE
su transmisión
Se aplicarán tas | 11,2
reglas de redondeos y
hol ura.
Deberá contener (a sumatoña
de todos
resumen | los valores detallados
por ítem en el
128 _valorTot | Total de la | "Valor
campo donado'.
donación | Requerido para | Longitud:
su transmisión Numérico | CDE
Se aplicarán las | 11,2
reglas de redondeos
y
holgura.
Deberá contener la sumatoria de
todas las
operaciones realizadas. Será el resultado
del "Total de operaciones
no sujetas"
"Total de operaciones exentas"
+ "Total de
operaciones gravadas".
resumen
129 -subTota | Suma de Para CIE será
el resultado del "Total de
Requerido para | FE, CCFE,
(Ventas | operaciones operaciones no | Numérico Longitud:
sujetas" + "Total de su transmisión | NCE, NDE,
operaciones exentas" | 112
+ "Totai de | NRE CLE
y
operaciones gravadas" + "Total de
operaciones de exportación".

Se aplicarán las reglas de
redondeos y
hol ura.
Se deberá indicar el monto del
descuento,
bonificación, rebajas y otros, realizadas al
campo 'Total de operaciones no
sujetas".

Cuando no aplique, se enviará S
con 0.00
resumen | Descuento
130 .descuN B
global a ventas Este campo es aplicado de | Requerido para
OSuj | manera global | Longitud: FE, CCFE
no sujetas | Numérico | y
sobre eI monto del total de | su transmisión
operaciones | 11.2 | NRE
no sujetas y se refleja el
en resumen del
documento. Es diferente at
campo
T)escuento por ítem" el cual es
aplicado
por cada ítem y se refleja en el
cuerpo del
documento.

72

<!-- PAGE 73 / 137 (OCR) -->

Se deberá indicar el monto del descuento,
bonificación, rebajas y otros. realizadas al
campo Total de operaciones exentas*

Cuando no aplique, se enviará con $ 0.00
resumen | Descuento | CCFE
Requerido para | Longitud: FE, | y
131 .descuE B global a ventas Este campo es aplicado de manera global | Numérico
su transmisión | 11,2 | NRE
xenta | exentas sobre el rnonto del total de operaciones
no sujetas y se refleja en eI resumen del
documento. Es diferente al campo
-Descuento por {tern• et cual es aplicado
por cada ítem y se refleja en el cuerpo det
documento.
Se deberá indicar el monto del descuento.
bonificación, rebajas y otros, que et
emisor realice al campo "Total de
operaciones gravadas*

Cuando no aplique, se enviará con $O,OO
resumen | Descuento | FE, CCFE,
Requerido para | Longitud:
132 .descuG B global a ventas | Numérico
Este | es aplicado de manera global su transmisión | 112 NRE y FEXE
carnpo
ravada | gravadas
sobre et monto del total de operaciones
no sujetas y se refleja en et resumen del
documento. Es diferente al campo
• Descuento ítem' el cual
por | es apticado
por cada ítem y se refleja en eI cuerpo del
documento.
Se deberá indicar el monto det descuento,
bonificación, rebajas y otros. que el
emisor realice al campo 'Total de
operaciones'

Cuando no aplique, se enviará con 60.00
Descuento
resumen | Requerido para | Longitud
133 | B globat al total de | Numérico | FSEE
.descu | Este campo es aplicado de manera gtobal su transmisión | 11,2
operaciones | del total de
sobre el monto | operaciones
no sujetas y se refleja en eI resumen del
documento. Es diferente al campo
Descuento por ítem* el cual es aplicado
por cada ítem y se refleja en et cuerpo del
documento.
Cuando no aplique se deberá enviar
campo con 0.00

resumen | del
Podrá indicarse el porcentaje global
porcent | Porcentaje de | Longitud: FE. CCFE,
134 | c | descuento, bonificación, rebajas y otros. Opcional | Numérico
ajeDesc | descuento | NRE y FEXE
realizadas sobre el campo *Suma de
uento
operaciones'. Para FEXE se aplicará sobre
eI | • Total de operaciones
campo
gravadas'.
Este campo sólo será de uso informativo,
a efecto de mostrar la sumatoria de tos
descuentos aplicados por cada Ítem más
resumen | los descuentos globales al total de Requerido por
Totat de | Longitud: NRE, NCE,
135 .totaIDes c | operaciones por tipo de ventas. | tipo de | Numérico
descuentos | 11,2 NDE, FEXE y
cu | operación | FSEE
Cuando no se apliquen descuentos debe
enviar este campo con $0.00

73

<!-- PAGE 74 / 137 (OCR) -->

Se aplicarán las reglas de redondeos y
holgura.

Se deberá indicar de forma consolidada eI
código de los tributos que se aplicaron en
el campo "Código del tributo" del cuerpo
del documento.

Cada código del tributo sólo se podrá
Requerido para
aplicar una vez. aunque su código se | FE, CCFE,
resurnen | su transmisión
Resumen código hubiera aplicado varias veces en el cuerpo | Longitud:
136 -tributos, c | Alfanumérico
del tributo del documento | 2 | NDE, CLE y
codigo | Requerido por
tipo de
Deberá ser null cuando todos los campos
operación
'Código del tributo* por ítem sean null.

Deberá rnostrar los códigos de la sección
3 del catálogo CAT-015 • Túbutos•
para
uso informativo.
Se deberá incorporar el nombre det
tributo que corresponda a los códigos
ingresados en el campo "Resumen código
del tributo"
FEXE= | Longitud:
resumen | Requerido para | 300 FE, CCFE,
FE XE=A | EI "Nombre del tributo' sólo se podrá
-tributos. | Nombre del | su transmisión | Mínimo: NRE, NCE.
137 | aplicar una vez, aunque su código se | Alfanumérico
descripc | tributo | 1 | NDE, CLE y
hubiera aplicado varias veces en eI cuerpo
ion | Requerido por | Máximo: FEXE
del documento.
tipo de | 300
operación
Deberá mostrar el nombre de tributo de la
sección 3 del catálogo CAT-015 *Tributos'
ara uso informativo.
Debe contener cálculo consolidado de
tos tributos que se aplicaron en eI carnpo
'Código del tributo" del cuerpo del
FEXE=
documento.
Requerido para
FE, CCFE,
resumen FEXE=A | su transmisión
Deberá mostrar el cálculo consolidado de | Longitud NRE, NCE,
138 -tributos | Valor del tflbuto | Numérico
los tributos de la sección 3 del catálogo | 11,2 NDE, CLE y
valor | Requerido por
CAT-015 Tributos' para uso informativo | FEXE
tipo de
(no se sumarán a los totales).
operación
Se aplicarán las reglas de redondeos y
hol ura.
Deberá ingresar el valor resultante de:
"Sumatoria de operaciones' Descuento
global a ventas no sujetas" 'Descuento
global a ventas exentas* 'Descuento
gtobal a ventas gravadas*
resurnen
Requerido para | Longitud FE. CCFE,
139 subTota | Sub total Para FSEE deberá contener eI resultado | Numérico
su transrnisión | 11,2 NRE y FSEE
del campo Total de operaciones"
"Descuento global | total de
operaciones".

Se aplicarán las reglas de redondeos y
hot ura,
Total monto Deberá contener la sumatoria de los
valores | Requerido para | Longitud
sujeto a | detallados por ítem en el campo | Numérico | CRE
-totalSuj | su transmisión | 11.2
retención "Monto su•eto a retención".

74

<!-- PAGE 75 / 137 (OCR) -->

etoRete
nc(on | Se aplicarán las reglas de redondeos y
holgura.
Cuando la operación esté sujeta a
percepción, deberá contener el monto
computado del impuesto percibido.
Requerido por
resumen | Longitud: | CLE
141 | B | IVA Percibido De no existir IVA percibido deberá tipo de | Numérico | CCFE y
.ivaPerci | 11,2
completar eI campo con $0.00 | operación

Se aplicarán las reglas de redondeos y
holgura.
Cuando la operación esté sujeta a
retención IVA. deberá contener el monto
computado del impuesto retenido.
Requerido por
resumen | Longitud
142 | B | IVA Retenido De no existir IVA retenido deberá tipo de | Numérico | FE y CCFE
.ivaRete | 11,2
completar et campo con $O-O() | operación

Se aplicarán las reglas de redondeos y
hol ura,
Será el resultado de la suma de todos los
valores por Ítem contenidos en los campos
Requerido por
resumen. | Total IVA 'IVA Percibido'.
143 | tipo de | Numérico | 11,2 NCE y NDE
ivaPerci | Percibido
• | operación
De no existir EVA Percibido• deberá ingresar
so.oo.
Cuando el tipo de documento a ajustar sea
07-CRE deberá ingtesar el mismo código del
resumen.
catálogo CAT-006 -Retención IVA MH" Requerido por
codigoR | Código retención | Longitud
144 | c | contenido en dicho CRE. | tipo de | Alfanumérico | NCE y NDE
etencion | 2
operación
Cuando et tipo de docurnento a ajustar sea
03-CCFE deberá ingresar null.
Será el resultado de {a suma de todos Eos
valores por ítem contenidos en los carnpos
Requerido por
resumen. | -IVA Retenido'.
145 | 8 Total IVA Retenido | tipo de | Numérico | 112 NCE y NDE
ivaRete
• | operación
De no existir IVA Retenido' deberá ingresar
$0.oo.
Setá el resultado de la surna de todos los
valores por ítem contenidos en los cannpos Requerido por
resumen, | Numérico | 11,2 | NDE
146 | Total IVA | *IVA 130/0* | tipo de | NCEy
totaitva
operación
De no existir 'IVA 139C deberá ingresar SO.OO.
Para FSEE cuando la operación esté sujeta
a retención renta, deberá contener el
monto computado del Impuesto.
resumen | Requerido por
Longitud:
147 .reteRen B Retención renta De no existir renta retenida para FSEE tipo de | Numérico | FSEE
11,2
ta | deberá completar et campo con 60,00 | operación

Se aplicarán las reglas de redondeos y
hot ura.

Cuando aplique, deberá indicar el valor
del seguro de la exportación. | Requerido por
resumen | Longitud:
148 | c | Seguro | tipo de | Numérico | FEXE
-seguro | 11.2
Si el campo 'TIPO de ítem' contiene el operación
código 2 deberá ingresar 50.00

75

<!-- PAGE 76 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 76. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| 149 | resumen.flete | C | Flete | Cuando aplique, deberá indicar el valor del flete de la exportación.<br><br>Si el campo "Tipo de ítem" contiene el código 2 deberá ingresar $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,2 | FEXE |
| 150 | resumen.montoTotalOperacion | A | Monto total de la operación | Para FE, CCFE y NRE, se deberá colocar la suma del campo "Sub-Total" + los valores contenidos en el campo "Valor de tributo".<br><br>Para NCE, NDE y CLE deberá indicar la suma de los campos: "Suma de operaciones" + los valores contenidos en el campo "Valor de tributo".<br><br>Para FEXE deberá colocar el resultado de los campos: "Total de operaciones gravadas" - "Descuento global a ventas gravadas" + "Seguro" + "Flete" + los valores contenidos en el campo "Valor de tributo".<br><br>Se excluyen de este campo los valores calculados para los tributos de uso informativo de la sección 3 del catálogo CAT-015 "Tributos". | Requerido para su transmisión | Numérico | Longitud: 11,2 | FE, CCFE, NRE, NCE, NDE, CLE y FEXE |
| 151 | resumen.totalNoGravado | B | Total cargos / abonos que no afectan la base imponible | Deberá contener la suma de los campos "Cargos/abonos que no afectan la base imponible". Permitirá valores negativos y positivos (cuando sea cargo se suma y cuando sea abono se resta).<br><br>Cuando no existan "Cargos / abonos que no afectan la base imponible" deberá completar con valor $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,2 | FE, CCFE, NCE, NDE y FEXE |
| 152 | resumen.totalNoOnerosas | C | Transferencias de bienes no onerosas | Este campo es de uso informativo, para efecto de las Transferencias de bienes no onerosas.<br><br>Los montos ingresados en este campo no se comprenderán para efectos del reintegro a que se refiere el art. 77 de la Ley de Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios.<br><br>Ejemplos: Reexportaciones de bienes en el mismo estado por devolución. Envío al exterior de muestras sin valor comercial. | Requerido para su transmisión | Numérico | Longitud: 11,2 | FEXE |
| 153 | resumen.totalPagar | A | Total a Pagar | Deberá contener el valor total a pagar.<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | FE, CCFE, NCE, NDE, FEXE y FSEE |
| 154 | resumen.total | A | Total | Deberá contener el valor total a liquidar que será el resultado de: "Monto total de la operación" + "IVA percibido liquidado". | Requerido para su transmisión | Numérico | Longitud: 11,2 | CLE |
| 155 | resumen.totalIva*(…continúa en p. 77: "Retenido" → resumen.totalIvaRetenido)* | A | Total IVA retenido | Deberá contener la suma de los valores detallados en el campo "IVA retenido" del cuerpo del documento. | Requerido para su transmisión | Numérico | Longitud: 11,2 | CRE |

76

<!-- PAGE 77 / 137 (OCR) -->

Retenid
o
Longitud:
FE, CCFE,
200
resumen | NRE, NCE,
Podrá contener eI valor total a pagar por | Mínimo:
156 .totalLetr c Valor en letras | Opcional Alfanumérico | NDE, CRE,
el receptor en letras agregando USD | 1
as | CLE, FEXE.
Máximo:
FSEE y CDE
200
Este campo será de uso Énformativo, no
afectará los valores contenidos en eI
documento.

Para FE deberá contener la sumatoria de
los campos 'IVA por ítem' menos el IVA
que corresponda al 'Descuento global a
ventas gravadas'

CRE- A | Para et caso de CRE, será ei valor Requerido por
resumen | Longitud,
157 | IVA | calculado del iVA en relación al monto tipo de | Nurnérico | FE y CRE
.totallva | 11.2
FE=C | sujeto a retención, este valor no tendrá operación
efecto en el campo Total IVA retenido'
según art. 162 inciso 70 del Código
Tributario.

Cuando no se haga uso de este campo
debe ingresar $O.OO

Se aplicarán las reglas de redondeos y
holgura.
Podrá indicar el satdo a favor (otros
abonos o pagos al receptor). Dicho vator
resumen | es de uso informativo y se registrará en
Longitud'
158 .saldoFa c | Saldo a favor negativo. | Opcional | Numérico
11.2 | FEXE
vor
Cuando no aplique se deberá ingresar
sono
Se deberá indicar la condición de la
operación según catátogo CAT-016
*Condición de la operación'
resumen | FE, CCFE,
condici | Condición de la Cuando deban indicarse operaciones Requerido para | Longitud. NCE, NDE,
159 | Numérico
onOper | operación mixtas (parte crédito y parte contado) se su transmisión | 1 | CLE, FEXE y
acion | deberá ingresar el código 3 | FSEE

Cuando el receptor posea saldo a favor
deberá seleccionar: 1.
Deberá seleccionar modalidad de pago
(según catálogo CAT-017 Torma de
pago').

Para FE. CCFE, FEXE y FSEE se deberá
resumen | Requerido por | FE, CCFE,
Código de forma completar siempre que se haya ingresado | Longitud:
160 | c | tipo de Alfanumérico | FSEE y
.pagos.c | eI | Condición de la | 2
de pago en campo | operación
odigo | operación | CDE
los códigos 1 0 3.

Para el CDE, se deberá utilizar si el campo
• donaciórf está lleno código 1.
Tipo | con

77

<!-- PAGE 78 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 78. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de contenido del campo | Condición del campo | Tipo de dato | Longitud /Precisión | Documento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 77)* Podrá seleccionar "n" formas de pago. Cuando se detalle más de una forma de pago deberán ingresarse entre corchetes y separadas por comas.<br><br>Cuando el receptor posea "Saldo a favor" deberá seleccionar código de forma de pago 99.<br><br>Para el CDE será null cuando el campo "Tipo donación" esté lleno con código 2 o 3. | | | | |
| 161 | resumen.pagos.montoPago | C | Monto por forma de pago | Deberá indicar el valor monetario que se ha aplicado con cada forma de pago descrita en el campo "Código de forma de pago".<br><br>Para FE, CCFE, FEXE y FSEE este campo deberá completarse cuando en el campo "Condición de la operación " se haya ingresado el código 1 o 3.<br><br>Para el CDE, se deberá utilizar si el campo "Tipo donación" está lleno con código 1.<br><br>Cuando el campo "Condición de la operación " esté lleno con el código 2, el campo "Monto por forma de pago" deberá completarse con $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,2 | FE, CCFE, FEXE, FSEE y CDE |
| 162 | resumen.pagos.referencia | C | Referencia de modalidad de pago | Contendrá el número de referencia de cada modalidad de pago.<br><br>Este campo podrá ser null cuando:<br>1. El campo "Tipo donación" esté completo con el código 2 o 3.<br>2. Si la forma de pago es "Billetes y monedas".<br>3. Cuando el campo "Condición de la operación" se encuentre con el código 2. | FEXE y CDE= Requerido por tipo de operación<br><br>Opcional | Alfanumérico | Longitud Máxima: 50 | FE, CCFE, FEXE, FSEE y CDE |
| 163 | resumen.pagos.plazo | C | Plazo | Si en el campo "Condición de la operación" se selecciona el código 02, deberá detallar el tipo de plazo de acuerdo al catálogo CAT-018 "Plazo".<br><br>De no hacer uso del campo ingresar null. | Requerido por tipo de operación | Alfanumérico / Null | Longitud: 2 | FE, CCFE, FEXE y FSEE |
| 164 | resumen.pagos.periodo | C | Período de plazo | Será requerido si el campo "Condición de la operación" es código 2. En este campo se deberá ingresar el número de días, meses o años en que se otorga el plazo.<br><br>De no hacer uso del campo debe ingresar null. | Requerido por tipo de operación | Numérico / Null | Longitud: 3<br>Mínimo: 1<br>Máximo: 3 | FE, CCFE, FEXE y FSEE |
| 165 | resumen.numPagoElectronico | C | Número de pago electrónico | Campo destinado para indicar el número de pago electrónico (NPE). | Opcional | Alfanumérico | Longitud Máxima: 100 | FE, CCFE, NDE y FEXE |

78

<!-- PAGE 79 / 137 (OCR) -->

Deberá indicar et código de los términos
y condiciones pactadas en la exportación
para la entrega de las mercancías {según
catálogo CAT- 031 *INCOTERMS').
resumen | Requerido por
Longitud:
166 .codlnc c | INCOTERMS | tipo de Alfanumérico | FEXE
Será requerido cuando en el campo "Tipo | 2
oterrns | operación
de exportación' se ingrese el código 1.

Será null cuando en eI campo 'Tipo de
ex ftacións se in rese ei código 2.
Deberá colocar ta descripción según
catálogo CAT-031 'INCOTERMS'.
resumen | Requerido por | Longitud
Descripción Será requerido cuando en el campo Tipo
167 .desclnc c | tipo de Alfanumérico Máxima: | FEXE
INCOTERMS de exportación" se ingrese el código l,
oterms | operación | 150

Será null cuando en el campo *Tipo de
exportación se ingrese et código 2.
FE, CCFE y
Podrá detallar las observaciones que
resurnen | Longitud NRE. NCE.
desee agregar. | Alfanumérico
168 Observa c Observaciones | Opcional | Máxima: NDE, CRE,
/ Null
ciones | 3000 CIE, FEXE y
De no hacer uso del campo ingresar null.
FSEE

Sección 10: EXTENSIÓN

O | o
o | o
o.
o | o
a.)
o | o
O o | O
o
o

Detalla los datos generales del | Longitud:
A/C | Extensión | Requerido | Objeto
res onsable de generar el DCLE. | 1
extensio | Nombre del | Longitud
Deberá ingresar eI nombre de la persona Requerido para
169 n.nomb A responsable de | Atfanumérico Máxima: OCLE
que genera el documento electrónico. su transmisión
Entrega | enerar et DTE | 100
Documento de
extensio | Deberá ingresar et documento de | Longitud
identificación de | Requerido para | OCLE
170 n.docuE | identificación de quien genera el | Alfanumérico Máxima:
quien genera el | su transmisión
ntrega | documento electrónico, | 25
DTE
Podrá indicar el código del responsable
extensio | Código de
de efectuar la liquidación a los afiliados. | Longitud
n,codE | ernpleado | Alfanumérico Máxima: DCLE
171 | c | Opcional
mplead | responsable de
De no hacer uso del campo debe ingresar | 15
o | (a liquidación
null-

Sección 11: APÉNDICE

79

<!-- PAGE 80 / 137 (OCR) -->

Esta sección es opcional y se encuentra
a disposición para incluir cualquier
información adicional.
Sección | Arreglo de Longitud:
c | Opcional
apéndice | objeto Null | 10
Podrá ingresarse desde 1 hasta un
máximo de 10 veces, completando
todos los cam os.
FE. CCFE,
Podrá ingresar eI nombre del campo que
apendic | NRE, NCE,
se está adicionando en el apéndice. | Longitud
Nombre del | NDE, CRE,
172 | c | Opcional Alfanumérico Máxima:
campo | OCLE, CIE,
carnpo | De no hacer uso del campo debe ingresar | 25
FEXE, FSEE Y
null
CDE
FE, CCFE,
Podrá ingresar la información que desee
NRE, NCE,
apendic | agregar | Longitud
173 | NDE, CRE,
e.etiquet c | Descripción | Opcional Alfanumérico Máxima.
DCLE, CLE,
a | De no hacer uso del campo debe ingresar | 50
FEXE. FSEE y
null
CDE
FE, CCFE,
Podrá ingresar un valor alfanuméfico o
NRE. NCE,
valor monetario. | Longitud
apendic | NDE. CRE.
174 | c | Vator/dato | Opcional Alfanumérico Máxima:
e valor | DCLE, CIE,
De no hacer uso del campo debe ingresar | 150
FEXE, FSEE y
null
CDE

Sección 12: SELLO DE RECEPCIÓN

No es una sección ni un campo de los
documentos tributarios transmitidos a
la Administración Tributaria. | FE, CCFE.
NERE, NCE,
selloRe | Sello de No obstante, deberá incorporar el Sello | Longitud: NDE, CRE,
175 | Alfanumérico
cibido | Recepción de Recepción enviado por la | 40 DCLE, CIE,
Administración Tributaria en el Archivo | FEXE, FSEE
DTE que entregue al receptor | Y CDE
(exceptuando las operaciones
eneradas en Contingencia).

80

<!-- PAGE 81 / 137 (OCR) -->

ANEXO III
ESTRUCTURA DE DATOS EVENTOS

Sección 1: IDENTIFICACIÓN DEL EVENTO

Identificación Sección donde se detallan las generales Requerido para | Longit
Objeto
del evento del evento se está transmitiendo. su transmisión | ud 1
que
Se deberá ingresar el número de la
versión vigente. | Longitud
Invalidación,
2
identific | Contingencia,
En evento de Operaciones especiales y Requerido para | Mínimo:
1 acion.ve | Versión | Numérico | Operaciones
Retorno deberá ingresar 1. | su transmisión | 1
rsion | especiates y
Máximo:
Retorno
Evento de Contingencia y de Invalidación | 2
deberá in resar 3.
Invalidación,
Se deberá ingresar el ambiente de trabajo
identific | Contingenda,
Ambiente de por el cual se está transmitiendo eI Requerido para | Longitud:
2 acion.a c | Alfanumérico | Operaciones
Destino evento, pudiendo seleccionar 00 - Modo su transmisión | 2
mbiente | Especiales y
pruebas 0 01 - Modo producción.
Retorno
Debe mostrar eI código asignado al
modelo de facturación que utilizará según
catálogo CAT-003 *Modelo de
Facturación'
identific
Operaciones
acion.tip (Colocar Modelo de | Requerido para | Longitud:
3 | Se ingresará eI código 1 para modelo de | Numérico | Especiales y
oModel descripc Facturación | su transmisión | 1
facturación previo en tos eventos | Retorno
o | ión)
Operaciones especiates y Retorno.

En contingencia deberá ingresar el
códi 02 ara el evento de retorno.
Debe contener el código de acuerdo at
identific | • | Operaciones
catálogo, CAT-004 Tipo de transmisión'
acion.tip (Colocar Tipo de | Requerido para | Longitud'
4 | Numérico | Especiales y
00pera descripc transmisión | su transmisión | 1
Se permitirá tipo de transmisión normal | Retorno
cion ión)
solo con modelo de facturación revio.
Deberá completarse este campo
Requerido por
únicamente si el 'Tipo de transmisión' es
tipo de
identific | código 2, de 10 contrario cuando se utilice
operación
acion.tip | Tipo de el código 1 deberá enviar este campo null, | Numérico / Longitud'
5 | c | {únicamente si | Retorno
0Contin | contingencia | Null | 1
tipo de
gencia | Deberá contener código de acuerdo a
• | transmisión es
catálogo: CAT-005 Tipo de
contingencia)
contin encia•
Campo de texto para que el
contribuyente pueda ampliar eI motivo de
la contingencia. | Requerido por
tipo de | longitud:
identific | Requeàdo en el campo Tipo de operac}ón | 500
acion,m | Motivo de contingencia' se ingresa el código 5. (cuando tipo de Alfanumérico / Mínimo.
6 | c | Retorno
otivoCo | Contingencia | contingencia | Nuti | 1
nun | Si el documento electrónico no se está este cornpleto | Máximo.
generando en contingencia o en el con el código | 500
campo Tipo de contingencia', se ingresa | 5)
un código diferente a 5, deberá enviar
este cam o con valor null.
Deberá contener eI código de generación
Invalidación,
identific | que cumpla con et estándar det UUID v4,
Contingencia,
acion.co | Código de eI cual debe ser único, con longitud de 32 Requerido para | Longitud:
7 | Alfanumérico | Operaciones
digoGen | generación dígitos separados por 4 guiones, su transmisión | 36
especiales y
eracion | haciendo un total de 36 posiciones
Retorno
dividido en5 ru os.

81

<!-- PAGE 82 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 82. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| 8 | identificacion.tipoEvento | A (Colocar descripción) | Tipo de evento | Debe ingresar el código según el evento que corresponda. Según catálogo CAT-002 "Tipo de Documento/Evento". | Requerido para su transmisión | Alfanumérico | Longitud: 2 | Operaciones especiales y Retorno |
| 9 | identificacion.fecEmi | A | Fecha del evento | Es la fecha del evento, cuya estructura definida por la Administración Tributaria es: YYYY-MM-DD. | Requerido para su transmisión | Alfanumérico | Longitud: 10 | Invalidación, Operaciones especiales y Retorno |
| 10 | identificacion.fTransmision | A | Fecha del evento de contingencia | Es la fecha del evento, cuya estructura definida por la Administración Tributaria es: YYYY-MM-DD. | Requerido para su transmisión | Alfanumérico | Longitud: 10 | Contingencia |
| 11 | identificacion.horEmi | A | Hora del evento | Es la hora del evento, cuya estructura definida por la Administración Tributaria es: HH:MM:SS (Formato de 24 horas). | Requerido para su transmisión | Alfanumérico | Longitud: 8 | Invalidación, Operaciones especiales y Retorno |
| 12 | identificacion.hTransmision | A | Hora del evento de contingencia | Es la hora del evento, cuya estructura definida por la Administración Tributaria es: HH:MM:SS (Formato de 24 horas). | Requerido para su transmisión | Alfanumérico | Longitud: 8 | Contingencia |
| 13 | identificacion.fusion | C | Fusiones y otros | Podrá hacer uso de este campo el contribuyente que legalmente continúe con las obligaciones y derechos de otro que haya emitido un documento previo con un NIT diferente, de conformidad a lo establecido en el art. 69 inc. 1 de la Ley de Impuesto a la Transferencia de Bienes Muebles y a la Prestación de Servicios.<br><br>Cuando aplique debe ingresar en este campo el NIT del fusionado contenido en el documento de origen; en caso contrario deberá ingresar null. | Requerido por tipo de operación | Alfanumérico | Longitud: 14<br>Mínimo: 9<br>Máximo: 14 | Invalidación y Retorno |
| 14 | identificacion.tipoMoneda | C | Tipo de Moneda | Debe ser USD | Requerido para su transmisión | Alfanumérico | Longitud: 3 | Retorno y Operaciones especiales |

Sección 2: DOCUMENTOS RELACIONADOS

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | B/D | Documentos relacionados | Esta sección es requerida para el Evento de retorno. En esta debe hacer referencia a los documentos a los que será aplicado el Evento. Haciendo uso de esta Sección podrá relacionar un máximo de 50 documentos, en un máximo de 2000 ítems o líneas. | Requerido para su transmisión | Arreglo de objeto Null | Longitud: 50 | |

82

<!-- PAGE 83 / 137 (OCR) -->

docume
ntoRela | Se deberá indicar eI código del
Requerido para | Longitud:
15 cionado. | Tipo de DTE documento a relacionar según catálogo: | Alfanumérico | Retorno
su transmisión | 2
tipo Doc | CAT-002 Tipo de Documento/Evento•
umento
docume
ntoRela
Código de Se deberá ingresar el Código de
cionado. | Requerido para | Longitud.
16 | generación del Generación del documento al que | Alfanumérico | Retorno
codigoG | su transmisión | 36
DTE | aplicará el evento.
eneracio

docume
ntoRela | Deberá ingresar ta fecha de generación
Fecha de | Requerido para | Longitud:
17 cionado. | contenida en el DTE al que se aplicará eI | Alfanumérico | Retorno
Generación | su transmisión | 10
fechaE | evento,
mision

Sección 3: IDENTCFICACIÓN DEL EMISOR

Esta sección describe los datos del
emisor del Evento, los cuales deben ser
los mismos detallados en eI DTE at que
se aplique el evento.
Requerido para | Longitud.
Emisor | Objeto
Para los casos de establecimiento y su transmisión | 1
punto de venta debe detallarse la
información desde donde se transmite
eI evento, no necesariamente la
contenida en el DTE.
Deberá contener eI NIT del emisor sin
guiones, | Invalidación,
Contingencia,
emisor.n | Requerido para | Longitud
18 | NIT (Emisor} Para los Eventos de Invalidación y | Alfanumérico | Operaciones
su transmisión | 9 0 14
Retorno, deberá ingresar el NIT del emisor | especiales y
contenido en el DTE al que se aplica et | Retorno
Evento,
contener | nombre,
denominación o razón social del | Longitud
Invalidación,
contribuyente emisor. | 250
Contingencia,
emisor.n | Requerido para | Mínimo:
19 | A Nombre (Emisor) | Alfanumérico | Operaciones
ombre | Para los Eventos de {nvaudación y su transrnisfón | 1
especiales y
Retorno, deberá ingresar el Nombre del | Máximo.
Retorno
emisor contenido en eI DTE al que se | 250
a üca el Evento.
Longitud
emisor.n | 100
Nombre del Deberá ingresar eI nombre del
ornbreR | Requerido para | Mínima:
20 | c responsable del responsable del establecimiento que | Alfanurnérico | Contingencia
su transmisión | 5
esponsa | informa el evento.
establecimiento
ble | Máxima.
100

83

<!-- PAGE 84 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 84. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| 21 | emisor.tipoDocResponsable | C | Tipo de documento de identificación | Deberá colocar el tipo de documento de identificación del responsable del establecimiento que informa el evento, según catálogo CAT-022 "Tipo de documento de identificación". | Requerido para su transmisión | Alfanumérico | Longitud: 2 | Contingencia |
| 22 | emisor.numeroDocResponsable | C | Número de documento de identificación | Deberá colocar el número de documento de identificación del responsable del establecimiento que informa el evento. | Requerido para su transmisión | Alfanumérico | Longitud: 25<br>Mínima: 5<br>Máxima: 25 | Contingencia |
| 23 | emisor.tipoEstablecimiento | A | Tipo de establecimiento (Emisor) | Deberá ingresar el código del tipo de establecimiento donde ocurrió la contingencia, según catálogo CAT-009 "Tipo de establecimiento". | Requerido para su transmisión | Alfanumérico | Longitud: 2 | Contingencia |
| 24 | emisor.codEstableMH | C | Código del establecimiento Asignado por el MH | Debe ingresar el código de Casa matriz, Sucursal, Bodega, Patio, que la Administración Tributaria le asigne. | Requerido para su transmisión | Alfanumérico | Longitud: 4 | Invalidación, Contingencia y Retorno |
| 25 | emisor.codEstable | C | Código del establecimiento asignado por el contribuyente | Podrá ingresar el código de la Casa matriz, Sucursal, Bodega, Patio, que el contribuyente posea internamente.<br><br>Cuando no posea código interno deberá enviarlo con null. | Opcional | Alfanumérico / Null | Longitud: 10<br>Mínimo: 1<br>Máximo: 10 | Invalidación y Retorno |
| 26 | emisor.codPuntoVentaMH | C | Código del Punto de Venta (Emisor) Asignado por el MH | Deberá incorporar el código asignado por la Administración Tributaria para el punto de venta donde se ha realizado la operación. | Requerido para su transmisión | Alfanumérico | Longitud: 4 | Invalidación, Contingencia y Retorno |
| 27 | emisor.codPuntoVenta | C | Código del Punto de Venta (Emisor) Asignado por el contribuyente | Podrá incorporar el código del punto de venta que el emisor lleva internamente.<br><br>Cuando el emisor no posea código de punto de venta este campo se completará con null. | Opcional | Alfanumérico / Null | Longitud: 15<br>Mínimo: 1<br>Máximo: 15 | Invalidación, Retorno |
| 28 | emisor.recintoFiscal | B | Recinto fiscal | Cuando el evento se aplica a FEXE y en el campo "Tipo de exportación" se ingrese el código 1, deberá indicar el Recinto fiscal según catálogo CAT-027 "Recinto fiscal".<br><br>Cuando el evento se aplica a FEXE y en el campo "Tipo de exportación" se ingrese el código 2, deberá ingresar null. | Requerido por tipo de operación | Alfanumérico / Null | Longitud: 2 | Retorno |
| 29 | emisor.tipoRegimen | B | Tipo de Régimen | Cuando en el campo "Tipo de exportación" se ingrese el código 1 deberá indicar el código del Tipo de régimen conforme al catálogo CAT-033 "Tipo de Régimen".<br><br>Cuando en el campo "Tipo de exportación" se ingrese el código 2, deberá ingresar null. | Requerido por tipo de operación | Alfanumérico/ Null | Longitud: 4 | Retorno |
| 30 | emisor.regimen | B | Régimen de exportación | Cuando en el campo "Tipo de exportación" se ingrese el código 1 deberá indicar el código del Régimen de exportación conforme al catálogo CAT-028 "Régimen". *(continúa en p. 85)* | Requerido por tipo de operación | Alfanumérico/ Null | Longitud: 13 | Retorno |

84

<!-- PAGE 85 / 137 (OCR) -->

Este campo será null cuando en el campo
'Tipo de exportación' se ingrese el código
2.
Cuando et evento se aplica a FEXE debe
detallar el Tipo de exportación que se está
retornando según catálogo CAT-OII 'Tipo
emisor.ti | de ítem'.
TIPO de | Requerido para | Longitud:
31 polternE c | Numérico | Retorno
exportación | su transmisión | 1
xpor | Únicamente aplican los códigos 1 0 2.

Debe ingresar null cuando el documento
aa licar el evento sea FE o FSEE.
Longitud:
30
emisor.t | Teléfono Deberá incorporar eI número de teléfono Requerido para | Mínimo: Invalidación y
32 | Alfanumérico
elefono | {Emisor) del emisor. | su transmisión | 8 | Contingencia
Máximo:
30
Longitud:
100
Correo
emisor.c | Deberá incorporar el correo electrónico Requerido para | Mínimo: Invalidación y
33 | electrónico | Alfanurnérico
orreo | del emisor, con dominio vigente. | su transmisión | 6 | Contingencia
(Emisor)
Máximo.
100

Sección 4: INFORMACIÓN DEL DOCUMENTO/ EVENTO EN CONTINGENCIA

Información
Arreglo de
del | Esta sección contiene la información Requerido
objeto
A | documento/ detallada del documento/ evento en para su | 1000
evento en contingencia. | transmisión
contingencia
En este campo se hará referencia a las
filas de los documentos generados en
contingencia, por to que deberá contener
una numeración secuenciat iniciando en
I hasta un máximo de 1000 ítems,
detalleD
Requerido para | Longitud
34 TE.noEte | NO de ítem En cada ítem se deberá detallar un | Nurnérico | Contingencia
su transmisión | 4
m | documento generado en contingencia,
pudiendo informar un máximo de 1000

En caso se requiera informar más de 1000
documentos, se deberá generar un nuevo
evento de contingencia.
Se deberá colocar et código del tipo de
documento electrónico generado en
detalleD | Tipo de
contingencia de acuerdo a codificación Requerido para | Longitud:
35 TEtipoD A documento en | Alfanumérico | Contingencia
según catálogo CAT-002 Tipo de su transmisión | 2
contingencia
documento/Evento•.

85

<!-- PAGE 86 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 86. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 85)* Se podrán emitir en contingencia los siguientes documentos/Evento: 01-FE, 03-CCFE, 04-NRE, 05-NCE, 06-NDE, 07-CRE, 11-FEXE y 14-FSEE y 18-Evento de retorno. | | | | |
| 36 | detalleDTE.codigoGeneracion | A | Código de generación del documento | Deberá incorporar el Código de Generación de cada uno de los documentos emitidos en contingencia.<br><br>Debe cumplir con el estándar del UUID v4, longitud de 32 dígitos separados por 4 guiones, haciendo un total de 36 posiciones dividido en 5 grupos.<br><br>Deberá incluir solamente letras mayúsculas. | Requerido para su transmisión | Alfanumérico | Longitud: 36 | Contingencia |

Sección 5: MOTIVO DE LA CONTINGENCIA

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | A | Motivo de la contingencia | En esta sección se deberá ingresar los datos que identifiquen el motivo y el período en qué ocurrió la causa de fuerza mayor que imposibilitó la transmisión en línea de los documentos/ evento a la AT. | Requerido para su transmisión | Objeto | Longitud: 1 | |
| 37 | motivo.fInicio | A | Fecha inicio de Contingencia | Deberá detallar la fecha en que inició la contingencia.<br><br>La estructura definida es: año, mes y día, en el siguiente formato: YYYY-MM-DD. | Requerido para su transmisión | Alfanumérico | Longitud: 10 | Contingencia |
| 38 | motivo.fFin | A | Fecha fin de Contingencia | Deberá detallar la fecha en que finalizó la contingencia.<br><br>La estructura definida es: año, mes y día, en el siguiente formato: YYYY-MM-DD. | Requerido para su transmisión | Alfanumérico | Longitud: 10 | Contingencia |
| 39 | motivo.hInicio | A | Hora inicio de contingencia | Deberá detallar la hora en que inició la contingencia.<br><br>La estructura es la siguiente: hora, minutos y segundos (HH:MM:SS). En formato 24hr. | Requerido para su transmisión | Alfanumérico | Longitud: 8 | Contingencia |
| 40 | motivo.hFin | A | Hora fin de contingencia | Deberá detallar la hora en que finalizó la contingencia.<br>La estructura es la siguiente: hora, minutos y segundos (HH:MM:SS). En formato 24hr. | Requerido para su transmisión | Alfanumérico | Longitud: 8 | Contingencia |
| 41 | motivo.tipoContingencia | C | Tipo de contingencia | Deberá ingresar el código del motivo de la contingencia, según catálogo CAT-005 "Tipo de Contingencia". | Requerido para su transmisión | Numérico | Longitud: 1 | Contingencia |

86

<!-- PAGE 87 / 137 (OCR) -->

En esta sección se deberá ingresar los
datos que identifiquen el motivo y eI
Requerido
Motivo de ta período en qué ocurrió la causa de | Longitud:
para su | Objeto
contingencia fuerza mayor que imposibilitó la | 1
transmisión
transmisión en línea de los
documentos/ evento a ta ATS
En este carnpo explicará la causa de la
contingencia.
Longitud:
rnotivo. | Cuando se ingrese el código 5 en el | 500
* | Requerido por
motivoC | Motivo de campo Tipo de contingencia' deberá | Mínimo:
42 | tipo de | Atfanumértco | Cont¿ngencia
ontinge | Contingencia especificarse la causa de la misma. | 1
operación
ncia | Máximo,
Podrá ingresar campo null si el código det | 500
campo *Tipo de contingencia' es
diferente a 5.

Sección 6: DETALLE DE APLICACtÓN DEL EVENTO

Hace referencia a los datos de los
documentos/ eventos a los que se te
Detalle de | Requerido
aplica eI evento. La información de esta | Longitud:
aplicación del | para su | Objeto | 1
sección debe tener correspondencia
evento | transmisión
con tos datos que identifican al DTE/
Evento y las generales del receptor.
Deberá indicar et código del documento
docume
a aplicar eI evento, según catálogo: CAT- Requerido para | Longitud.
43 nto.tipo | Tipo de DTE | Alfanumérico | Invalidac\ón
002 'Tipo de Documento/ Evento' | su transmisión | 2
Die
Se deberá incorporar el Código de
Generación del docurnento/evento al
que aplique. Deberá ingresar un Código
de Generación por evento.

EI documento/evento al que aplique debe
docume
Código de tener Sello de Recepción,
nto.codi | Requerido | Longitud •
para Alfanumérico | Invalidación
44 | generación
goGene | su transmisión | 36
aplicado Deberá cumplir con el estándar det UUID
racion
v4, longitud de 32 dígltos separados por 4
guiones, haciendo un total de 36
posiciones dividido en 5 grupos.

Deberá incluir solamente letras
mayúsculas.
docume | Deberá ingresar el Sello de Recepción
Sello de | Requerido para | Longitud'
45 nto.sello | contenido en el docurnento/evento que | Alfanumérico | Invalidación
Recepción | su transmisión | 40
Recibido | se está invalidando,
docume
Deberá ingresar eI Número de Control
nto.num | Núrnero de | Requerido para | Longitud
46 | contenido en el documento/evento a | Alfanumérico | Invalidación
eroCont | control | su transmisión | 31
invalidar.
rol

87

<!-- PAGE 88 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 88. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| 47 | documento.fecEmi | A | Fecha de generación | Deberá ingresar la fecha de generación contenida en el documento/evento al que se aplique. | Requerido para su transmisión | Alfanumérico | Longitud: 10 | Invalidación |
| 48 | documento.codigoGeneracionR | B | Código de generación que reemplaza al invalidado | Deberá ingresar el Código de Generación del documento que reemplaza la operación cuando el campo "Tipo de invalidación" contenga el código 1 o 3. Por lo que previo al envío del evento de invalidación, el contribuyente deberá emitir un nuevo DTE que sustituya al documento a invalidar.<br><br>Cuando el evento se aplique a NCE, CLE, Evento de retorno y Evento de operaciones especiales, deberá ingresar null.<br><br>Cuando la causa de la invalidación sea por rescisión de la operación realizada, este campo se llenará con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 36 | Invalidación |
| 49 | documento.tipoDocumento | A | Tipo de documento de identificación (Receptor) | Deberá seleccionar codificación de acuerdo a catálogo CAT-022 "Tipo de documento de identificación".<br><br>Se ingresará el código 13-DUI para el caso de las personas naturales no inscritas en IVA. | Requerido por tipo de operación | Alfanumérico | Longitud: 2 | Invalidación y Retorno |
| 50 | documento.numDocumento | A | Número de documento de Identificación (Receptor) | Deberá ingresar el mismo número de documento de identificación (Receptor) contenido en el documento/evento.<br><br>Deberá ingresar null, si en el campo "Tipo de Documento de Identificación del receptor" en la FE o evento de retorno también es null. | Requerido por tipo de operación | Alfanumérico | Longitud: 20<br>Mínimo: 3<br>Máximo: 20 | Invalidación y Retorno |
| 51 | documento.nombre | A | Nombre (Receptor) | Deberá contener el nombre, denominación o razón social del receptor. | Requerido por tipo de operación | Alfanumérico | Longitud: 250<br>Mínimo: 1<br>Máximo: 250 | Invalidación y Retorno |
| 52 | documento.codPais | C | Código de país (Receptor) | Cuando el documento al que se aplique el evento sea FEXE deberá ingresar el código del país destino de la exportación según catálogo CAT-020 "País".<br><br>Será null si el documento al que se aplique el evento es diferente de FEXE. | Requerido para su transmisión | Alfanumérico | Longitud: 2 | Retorno |
| 53 | documento.nombrePais | A | País destino de la exportación (Receptor) | Cuando el documento al que se aplique el evento sea FEXE deberá ingresar el nombre del país de destino de la exportación.<br><br>Deberá ingresar null cuando el documento al que aplique el evento sea FE o FSEE. | Requerido para su transmisión | Alfanumérico | Longitud: 50<br>Mínimo: 3<br>Máximo: 50 | Retorno |

88

<!-- PAGE 89 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 89. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| 54 | documento.telefono | Invalidación= B<br><br>C | Teléfono (Receptor) | Podrá incorporar el número de teléfono del receptor. | Opcional | Alfanumérico | Longitud: 30<br>Mínimo: 8<br>Máximo: 30 | Invalidación y Retorno |
| 55 | documento.correo | B | Correo electrónico (Receptor) | Podrá incorporar el correo electrónico del receptor, con dominio vigente. | Opcional | Alfanumérico | Longitud: 100<br>Mínimo: 6<br>Máxima: 100 | Invalidación y Retorno |

Sección 7: VENTAS POR CUENTA DE TERCEROS

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | B/D | Ventas por cuenta de terceros | Esta sección deberá completarse cuando la venta es por cuenta de terceros.<br><br>Las ventas por cuenta de terceros deben ingresarse en documentos/ eventos separados de las operaciones propias.<br><br>Deberá completar con null cuando:<br>a) La operación es propia.<br>b) El evento se aplica a FSEE. | Requerido por tipo de operación | Objeto / null | Longitud: 1 | |
| 56 | ventaTercero.nit | B | NIT por cuenta de tercero | Deberá contener el mismo NIT contenido en el campo "NIT por cuenta de tercero", del DTE al que se aplique el evento.<br><br>Cuando el campo "NIT por cuenta de tercero" del DTE al que se aplique el evento sea null, también debe completarse con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 20<br>Mínimo: 1<br>Máximo: 20 | Retorno |
| 57 | ventaTercero.nombre | B | Nombre del Tercero | Deberá contener el mismo Nombre contenido en el campo "Nombre del Tercero", del DTE al que se aplique el evento.<br><br>Cuando el campo "Nombre del tercero" del DTE al que se aplique el evento sea null, también debe completarse con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 250<br>Mínimo: 1<br>Máximo: 250 | Retorno |
| 58 | ventaTercero.codDomiciliado | C | Domicilio Fiscal | Cuando en el evento se detalle "Nombre del tercero" deberá ingresar un código según catálogo CAT-032 "Domicilio fiscal". | Requerido por tipo de operación | Numérico | Longitud: 1 | Retorno |

Sección 8: COMPRA POR CUENTA DE TERCEROS

89

<!-- PAGE 90 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 90. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | B | Compra por cuenta de terceros | Esta Sección deberá completarse cuando la compra se efectúe por cuenta de terceros. Cuando no aplique, deberá transmitir la sección completa con null. | Requerido por tipo de operación | Objeto / Null | Longitud: 1 | |
| 59 | compraTercero.numDocumento | B | Número de documento de identificación del Tercero | Deberá contener el número del documento de identificación del tercero, cuando se realice una compra por cuenta de terceros.<br><br>El número deberá ingresarse sin guiones. | Requerido por tipo de operación | Alfanumérico | Longitud: 20<br>Mínimo: 1<br>Máximo: 20 | Retorno |
| 60 | compraTercero.nombre | B | Nombre del Tercero | Deberá de indicarse el nombre, denominación o razón social del tercero, cuando se realice una compra por cuenta de terceros. | Requerido por tipo de operación | Alfanumérico | Longitud: 250<br>Mínimo: 1<br>Máximo: 250 | Retorno |

Sección 9: CUERPO

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | A | Cuerpo | Esta sección contiene la información detallada de la operación realizada.<br><br>Se aplicarán las reglas de redondeo y holgura contenidas en las reglas 7.2 literal a) y 7.3 de esta Normativa. | Requerido para su transmisión | Arreglo de objeto | 2000 | |
| 61 | cuerpoDocumento.numItem | A | N° de ítem | En este campo se hará referencia a los ítems por cada bien o servicio, por lo que deberá contener una numeración consecutiva iniciando en 1 hasta 2000 ítems. | Requerido para su transmisión | Numérico | Longitud: 4 | Operaciones especiales y Retorno |
| 62 | cuerpoDocumento.codigoGeneracionRef | B | Código de generación del EOE de Referencia | Cuando se detallen documentos que disminuyan valores, deberá ingresar el Código de Generación del Evento de Operaciones Especiales donde se informaron los documentos a disminuir.<br><br>De no existir documentos a disminuir deberá completar con null. | Requerido por tipo de operación | Alfanumérico | Longitud: 36 | Operaciones especiales |
| 63 | cuerpoDocumento.tipoDocumento | A | Tipo de Documento | Deberá ingresar el código del documento de origen según catálogo CAT-023 "Operaciones especiales". | Requerido para su transmisión | Alfanumérico | Longitud: 2 | Operaciones especiales |
| 64 | cuerpoDocumento.numDocumento | A | Documento origen | Deberá ingresar el número del documento de origen que se está informando en el evento. | Requerido por tipo de operación | Alfanumérico | Longitud: 36<br>Mínimo: 1<br>Máximo: 36 | Operaciones especiales |

90

<!-- PAGE 91 / 137 (OCR) -->

Podrá hacer uso de este campo cuando
se requiera informar uno a uno los
com robantes de control interno.
cuerpoD | la fecha del documento de
Fecha del Deberá indicar | Requerido por
ocumen | Longitud: Operaciones
65 | A | documento origen que está informando, en el tipo de | Alfanumérico
to.fecha | 10 | especiales
origen | siguiente formato: YYYY-MM-DD. | operación
Emision
cuerpoD | Deberá ingresar el tipo de (tem de la
ocumen | operación que se está realizando, según Requerido para | Longitud'
66 | c | Tipo de ítem | Alfanumérico | Retorno
to.tipolt | catálogo CAT- 011 Tipo de ítem' | su transmisión | 1
em
Deberá ingresar el Código de Generación
cuerpoD | at | el evento,
del documento que aplique
ocumen | Código de
Requerido para | Longitud.
67 tocodig A Generación del | Alfanumérico | Retorno
Deberá detallar todos los Códigos de su transmisión | 36
oGenera | DTE
Generación que se detallen en la sección
clon
*Documentos relacionados'.
Deberá ingresar la cantidad del producto
o servicio que detalla por ítem.

Para el Evento de operaciones especiales
Longitud:
deberá ingresar la cantidad de
11,8
documentos informados en cada ítern:
cuerpoD | deberá | valores enteros | Operaciones
ingresar | mayores
ocumen | Requerido para | (Operacio
68 | Cantidad a cero, | Numérico | especiales y
tocantid | su transrnisión | nes
Retorno
ad | especiales
Asimismo, deberá ingresar 1 cuando:
Longitud:
a) Se detalle ítem como 'Cargos/abonos
11)
que no afectan la base imponible' en
Evento de Retorno.
b) Campo *Tipo de (tern' esté completo
con eI código 4 en Evento de retorno.
Los contribuyentes obligados a presentar
el Informe F-983 'Informe de Inventario
Físico de Bienes del Activo Realizable o
Corriente' deberán ingresar el mismo
Longitud
código de inventario utilizado en dicho
cuerpoD | 25
informe. | Requerido por
ocumen | Mínimo:
69 | c | Código Los contribuyentes no obligados a tipo de | Alfanumérico | Retorno
to,codig | 1
presentar dicho Informe, podrán ingresar operación
o | Máximo.
nult,
25

Será null cuando se detalle ítem como
"Cargos/abonos que no afectan la base
im onibte•.
Deberá detallar el código de la unidad de
medida que utiliza para la descripción del
producto por ítem (Según catálogo: CAT-
cuerpoD | 014 'Unidad de Medida').
ocumen | Unidad de | Requerido para | Longitud.
70 | Numérico | Retorno
to.uniMe | Medida Deberá ingresar código 99 cuando: | su transmisión | 2
dida | a) Se haga uso de campo 'Cargos/Abonos
que no afectan la base imponible'
b} EI campo "Tipo de (tern- esté lleno con
el código 4.
Deberá contener la descripción por ítem | Longitud Retorno y
cuerpoD | Requerido para | 1500
71 | Descripcón que detalle el producto, servicio y/o | Alfanumérico | Operaciones
ocumen | su transmisión
documento informado. | Mínirno. es eciales

91

<!-- PAGE 92 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 92. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | *(continuación de p. 91)* …to.descripcion | | | | | | *(continuación)* 1<br>Máximo: 1500 | |
| 72 | cuerpoDocumento.precioUni | A | Precio Unitario | Deberá indicar por ítem el precio unitario de la operación por cada producto o servicio. | Requerido para su transmisión | Numérico | Longitud: 11,8 | Operaciones especiales y Retorno |
| 73 | cuerpoDocumento.DocDel | A | Doc. Del | Deberá indicar el número correlativo del documento donde inicia el rango a informar.<br><br>Este campo será null cuando se detalle campo "Documento origen". | Requerido para por tipo de operación *(sic)* | Alfanumérico | Longitud: 36<br>Mínimo: 1<br>Máximo: 36 | Operaciones especiales |
| 74 | cuerpoDocumento.DocAl | A | Doc. Al | Deberá indicar el número correlativo del documento donde finaliza el rango a informar.<br><br>Este campo será null cuando se detalle campo "Documento origen". | Requerido por tipo de operación | Alfanumérico | Longitud: 36<br>Mínimo: 1<br>Máximo: 36 | Operaciones especiales |
| 75 | cuerpoDocumento.montoDescu | A | Descuento por ítem | En este campo se detallarán por ítem los descuentos, bonificaciones o rebajas realizadas a los productos o servicios.<br><br>Deberá ingresar $0.00 cuando:<br><br>a) El documento relacionado contenga $0.00 en el campo "Descuento por ítem".<br><br>Para el Evento de Retorno cuando detalle valor en este campo deberá incluir tanto los descuento por ítem como descuentos globales. | Requerido para su transmisión | Numérico | Longitud: 11,8 | Retorno |
| 76 | cuerpoDocumento.codTributo | C | Tributo sujeto a cálculo de IVA | Campo especial para otros impuestos detallados en el cuerpo del documento que son sujetos al IVA contenidos en el DTE al que aplica el evento.<br>Cuando aplique se deberá ingresar uno de los códigos de la sección 2 del CAT-015 "Tributos" (códigos A8, 57, 90 y A6).<br><br>Campo será null cuando:<br>a) El campo "Tipo de documento relacionado" sea FSEE.<br>b) El "Tipo de documento relacionado" es FE o FEXE y el campo "Tipo de ítem" contenga código diferente a 4.<br>c) El campo "Tipo de ítem" tiene un código diferente a 4.<br><br>Será requerido cuando en el campo "Tipo de ítem" se ingrese el código 4. | Requerido por tipo de operación | Alfanumérico | Longitud: 2 | Retorno |
| 77 | cuerpoDocumento.ventaNoSuj | A | Ventas No Sujetas | Deberá detallar el valor de las ventas no sujetas de la operación, de la siguiente manera:<br><br>a) Para Evento de Retorno será el resultado de: [("Precio Unitario" * "Cantidad") - "Descuento por ítem"]. *(continúa en p. 93)* | Requerido para su transmisión | Numérico | Longitud: 11,8 | Operaciones especiales y Retorno |

> Nota de transcripción (FASE 0.1): la Normativa imprime `cuerpoDocumento.DocDel` y `cuerpoDocumento.DocAl` (con "D" mayúscula, verificado en la imagen a 300 dpi). El schema oficial `originales/svfe-json-schemas/v1/fe-eop-v1.json` usa `docDel` y `docAl`. Se conserva lo impreso; discrepancia documentada en `auditoria/ocr-recovery-report.json`, no corregida.

92

<!-- PAGE 93 / 137 (OCR) -->

b) Cuando el Evento de retorno se aplique
a FEXE o FSEE deberá ingresar $O.OO
c} Para Evento de retorno deberá
completar con $O.OO cuando se detalle
ítem como 'Cargos/abonos que no
afectan la base imponible'.
d) Para Evento de operaciones especiales
será el resultado de: ('Precio unitario' *
'Cantidad')

Si no existen ventas no sujetas deberá
ingresar $O.OO
Deberá detallar el valor de las ventas
exentas de la operación, de la siguiente
manera:

a) Para Evento de Retorno será el
resultado de: [('Precio Unitario'
'Cantidad') - *Descuento por Etern'l.
b) Cuando el Evento de retorno se aplique
cuerpoD | FEXE FSEE deberá | $O.OO. | Operaciones
a o | ingresar
ocumen | Requerido para | Longitud
78 | Ventas Exentas c) Para Evento de retorno deberá | Numérico | especiales y
to.venta | su | 11,8
completar con $O.OO cuando se detalle | Retorno
Exenta
ítem corno 'Cargos/abonos que no
afectan la base imponible"
d) Para Evento de operaciones especiales
será eI resultado de: {'Precio unitario' k
'Cantidad')

Si no existen ventas exentas deberá
ingresar $O.OO
Debe(á detallar el valor de las ventas
gravadas de la operación. de la siguiente
manera:

a) Para Evento de Retorno será el
resultado de: (('Precio Unitario'
cuerpoD | 'Descuento ítem]. | Operaciones
*Cantidad') - | por
ocumen | Requerido para | Longitud:
79 | A Ventas Gravadas | Numérico | especiales y
to.venta | su transmisión | 11,8
b) Si el Evento de retorno se aplica a FSEE | Retorno
Gravada
deberá ingresar $O.OO y detallar el valor en
campo "Compras a Sujetos Excluidos'
c) Para Evento de operaciones especiales:
('Precio unitario' k Cantidad')

Si no existen ventas gravadas deberá
ingresar $O.OO
Cuando ei documento a aplicar el evento
sea FSEE, deberá indicar en este campo el
monto de la compra. las cuales estarán
cuerpoD | de: [('Preclo
dadas por el resultado
ocumen | Cornpras a | Requerido para | Longitud
unitario' * 'Cantidad) T)escuento | Numérico | Retorno
80 | - | por
to.comp | sujetos excluidos | su transmisión | 11,8
itenfl.
ra
Cuando et evento se aptique a FE o FEXE
deberá com letar este carn o con $0.00

93

<!-- PAGE 94 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 94. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| 81 | cuerpoDocumento.tributos | C | Código del tributo | Podrá ingresar el código de los tributos que apliquen al producto o servicio detallado en el ítem según catálogo CAT-015 "Tributos" secciones 1 y 3. Los códigos de tributos deberán ingresarse entre corchetes y separarse por comas.<br><br>Cuando el documento a aplicar el evento sea FEXE podrá ingresar códigos de la sección 1 y 3 exceptuando el código 20.<br><br>Este campo podrá ser null cuando en el ítem se detallen "Ventas no sujetas" o "Ventas exentas".<br><br>Los emisores que emitan Evento de Retorno aplicados a FEXE y requieran hacer uso de los tributos FOVIAL y COTRANS (D1 y C8) en FEXE deberán solicitarlo y justificarlo para su habilitación.<br><br>Deberá ser null cuando:<br>1-Se haga uso del campo "Cargos/ abonos que no afectan la base imponible".<br>2- El Evento de retorno se aplique a una FSEE.<br>3- En la FE a la que se aplica el evento de retorno el campo "Código del tributo" también sea null. | Requerido por tipo de operación | Alfanumérico | Longitud: 2 | Operaciones especiales y Retorno |
| 82 | cuerpoDocumento.psv | C | Precio sugerido de venta | Cuando el documento a aplicar el evento sea FE, podrá utilizar este campo para detallar el precio sugerido de venta (psv), de acuerdo a lo informado a la Administración Tributaria en los formularios respectivos. El psv deberá detallarse por ítem.<br><br>Este campo es de uso informativo. En caso no aplique deberá ingresar $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,8 | Retorno |
| 83 | cuerpoDocumento.ivaItem | C | IVA por ítem | Deberá ingresar el valor calculado del IVA por ítem cuando el documento al que se aplique el evento sea FE.<br><br>Este campo será de uso informativo, no se considera para efecto de la sumatoria del campo "valor de tributo" que corresponda a IVA en la sección resumen del documento.<br><br>Aplica a ventas gravadas. Cuando se detallen ventas exentas o ventas no sujetas, deberá ingresar $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,8 | Retorno |

94

<!-- PAGE 95 / 137 (OCR) -->

Podrán ingresarse cargos o abonos al
receptor que no afectan la base
imponible siempre que estos se
encuentren detallados en el documento
al que se le aplica el evento.

Se ingresará el monto con vator positivo o
negativo según sea eI caso,

Cuando no existan Cargos/Abonos que
no afectan la base imponible deberá
cuerpoD | Cargos/Abonos
ingresarse $0.00 | Requerido por
ocumen | que no afectan | Longitud
84 | B | tipo de | Numérico | Retorno
to.noGr | la base | 11.8
Para hacer uso de este campo deberá operación
avado | imponible
detallar como rnínimo un ítem con valor
> $0.00 en las ventas gravadas, exentas o
no sujetas.

Deberá ingresar 50.00 cuando en et {tem
se detallen ventas no sujetas, exentas o
gravadas.

Para eI evento de retorno cuando et
documento al que aplica el evento sea
FSEE deberá ingresar $0.00
Cuando aplique deberá ingresar el valor
de 'IVA retenido• a ajustar en el ítem. | Requerido por
cuerpo.i | de | Numérico | 11,8 | Retorno
85 | IVA retenido | tipo
vaRete
De no existir 'IVA retenido' deberá operación
ingresar 30,00

Cuando aplique, deberá ingresar el valor
cuerpo.r | de 'Retención Renta' a ajustar en el ítem Requerido por
86 | 8 Retención Renta | tipo de | Nurnérico | 11,8 | Retorno
De no existir -Retención Renta' deberá operación
ingresar $O.OO
Cuando aplique, deberá ingresar et valor
cuerpoD | del 'Seguro' de la exportación. Campo
Requerido por
ocumen | exclusivamente retacionado a FEXE.
8 | Seguro | tipo de | Numérico | 11,8 | Retorno
to.segur
operación
O | De no existir 'Seguro' deberá ingresar
$0,oo
Cuando aplique, deberá ingresar el vator
cuerpoD | del 'Fletea de la exportación. Campo Requerido por
88 ocumen | Flete | exclusivamente relacionado a FEXE. | tipo de | Numérico | 11,8 | Retorno
to.flete | operación
De no existir 'Flete• deberá ingresar $O,OO

Sección 10: RESUMEN

95

<!-- PAGE 96 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 96. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | A | Resumen | Esta sección contiene un resumen de la información del cuerpo del evento.<br><br>Se aplicarán las reglas de redondeo y holgura contenidas en las reglas 7.2 literal b) y 7.3 de esta Normativa. | Requerido para su transmisión | Objeto | Longitud: 1 | |
| 89 | resumen.totalNoSuj | A | Total de operaciones no sujetas | Deberá contener la sumatoria de todos los valores contenidos por ítem en el campo de "Ventas no sujetas".<br><br>Cuando no existan ventas no sujetas, este campo deberá enviarse con $0.00<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | Operaciones especiales y Retorno |
| 90 | resumen.totalExenta | A | Total de Operaciones exentas | Deberá contener la sumatoria de todos los valores contenidos por ítem en el campo de "Ventas exentas".<br><br>Cuando no existan ventas exentas, este campo deberá enviarse con $0.00<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | Operaciones especiales y Retorno |
| 91 | resumen.totalGravada | A | Total de Operaciones Gravadas | Deberá contener la sumatoria de todos los valores contenidos por ítem en el campo de "Ventas gravadas".<br><br>Cuando no existan ventas gravadas, este campo deberá enviarse con $0.00<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | Operaciones especiales y Retorno |
| 92 | resumen.totalCompraExcluidos | A | Total compras a Sujetos Excluidos | Deberá contener la sumatoria de todos los valores contenidos por ítem en el campo de "Compras a sujetos excluidos".<br><br>Cuando no existan Compras a sujetos excluidos, este campo deberá enviarse con $0.00<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | Retorno |
| 93 | resumen.subTotalVentas | A | Suma de operaciones | Deberá contener la sumatoria de todas las operaciones realizadas.<br><br>Para Evento de retorno será la suma de "Total de operaciones No sujetas" + el "Total de operaciones Exentas" + el "Total de operaciones gravadas" + "Total compras a sujetos excluidos".<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido para su transmisión | Numérico | Longitud: 11,2 | Retorno |
| 94 | resumen.subTotal | A | Sub-Total | Para el evento de operaciones especiales deberá contener la sumatoria de los campos "Total de operaciones no sujetas", "Total de operaciones exentas" y "Total de operaciones gravadas". | Requerido para su transmisión | Numérico | Longitud: 11,2 | Operaciones especiales |

96

<!-- PAGE 97 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 97. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | | | | *(continuación de p. 96)* Se aplicarán las reglas de redondeos y holgura. | | | | |
| 95 | resumen.totalNoGravado | A | Total Cargos / Abonos que no afectan la base imponible | Deberá ingresar la sumatoria de los valores contenidos en el campo "Cargos/Abonos que no afectan la base imponible".<br><br>Cuando no existan "Cargos/Abonos que no afectan la base imponible" se deberá ingresar $0.00 | Requerido por tipo de operación | Numérico | Longitud: 11,2 | Retorno |
| 96 | resumen.totalSeguro | B | Total Seguro | Deberá ingresar la suma de los valores contenidos en el campo "Seguro". | Requerido por tipo de operación | Numérico | Longitud: 11,2 | Retorno |
| 97 | resumen.totalFlete | B | Total Flete | Deberá ingresar la suma de los valores contenidos en el campo "Flete". | Requerido por tipo de operación | Numérico | Longitud: 11,2 | Retorno |
| 98 | resumen.montoTotalOperacion | A | Monto Total de la Operación | Para el Evento de retorno será el resultado de: "Suma de operaciones" + los valores contenidos en los campos: "Valor del tributo" + "Total Seguro" + "Total Flete". | Requerido para su transmisión | Numérico | Longitud: 11,2 | Retorno |
| 99 | resumen.ivaRete | B | Total IVA Retenido | Cuando el documento al que se aplique el evento sea FE y la operación esté sujeta a retención IVA, debe contener el monto computado del Impuesto retenido.<br><br>Será la suma de todos los valores contenidos por ítem en los campos de "IVA Retenido".<br><br>De no existir retención IVA deberá ingresar $0.00 | Requerido por tipo de operación | Numérico | 11,2 | Retorno |
| 100 | resumen.reteRenta | B | Total Retención Renta | Cuando el documento al que se aplique el evento sea FSEE y la operación esté sujeta a retención de Renta, debe realizar la disminución de la renta causada.<br><br>Será la suma de todos los valores contenidos por ítem en los campos de "Retención Renta".<br><br>De no existir renta retenida deberá ingresar $0.00 | Requerido para su transmisión | Numérico | Longitud: 11,2 | Retorno |
| 101 | resumen.tributos.codigo | C | Resumen código del tributo | Deberá indicar de forma consolidada, el código de los tributos que se hayan aplicado en el campo "Código del Tributo", cada código del tributo solo se podrá aplicar una vez, aunque el código se hubiera aplicado varias veces en el cuerpo del documento.<br><br>Deberá ser null cuando todos los campos "Código del tributo" por ítem sean null.<br><br>Los códigos de la sección 3 se ingresarán sólo para uso informativo. | Requerido por tipo de operación | Alfanumérico | Longitud: 2 | Operaciones especiales y Retorno |
| 102 | resumen.tributos.descripcion *(nombre completado con p. 98)* | B | Nombre del Tributo | Se deberá incorporar el nombre del tributo que corresponda a los códigos *(continúa en p. 98)* | Requerido por tipo de operación | Alfanumérico | Longitud: 300<br>Mínimo: *(continúa en p. 98)* | Operaciones especiales y Retorno |

97

<!-- PAGE 98 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 98. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| N° | Campo JSON | Representación Gráfica | Nombre del campo | Descripción de Contenido del Campo | Condición del Campo | Tipo de dato | Longitud /Precisión | Evento |
|---|---|---|---|---|---|---|---|---|
| | *(continuación de p. 97)* …descripcion | | | ingresados en el campo "Resumen código del tributo".<br><br>El "Nombre del tributo" sólo se podrá aplicar una vez, aunque su código se hubiera aplicado varias veces en el cuerpo del documento.<br><br>Los códigos de la sección 3 se ingresarán sólo para uso informativo. | | | 1<br>Máximo: 300 | |
| 103 | resumen.tributos.valor | B | Valor del Tributo | Deberá contener el cálculo consolidado de los tributos detallados en el campo "Código del tributo" del cuerpo del documento.<br><br>Deberá mostrar el cálculo consolidado de los tributos de la sección 3 del catálogo CAT-015 "Tributos" para uso informativo (no se sumarán a los totales).<br><br>Se aplicarán las reglas de redondeos y holgura. | Requerido por tipo de operación | Numérico | Longitud: 11,2 | Operaciones especiales y Retorno |
| 104 | resumen.total | A | Total | Deberá contener el valor total de las operaciones.<br>Este campo será el resultado de sumar los campos "Sub-Total" + "Valor de tributo". | Requerido para su transmisión | Numérico | Longitud: 11,2 | Operaciones especiales |
| 105 | resumen.totalPagar | A | Total a Pagar | Deberá contener el valor total a pagar.<br>Este campo será el resultado de: "Monto total de la operación" (-) "Total IVA Retenido" (-) "Total Retención Renta" (+/-) "Total Cargos/Abonos que no afectan la base imponible".<br><br>Cuando el campo "Cargos/ Abonos que no afectan la base imponible" sea mayor al resultado del campo "Monto total de la operación" deberá ingresar $0.00 | Requerido para su transmisión | Numérico | Longitud: 11,2 | Retorno |
| 106 | resumen.totalLetras | C | Valor en Letras | Podrá contener el valor en letras agregando USD.<br><br>Para el evento de Operaciones especiales podrá describir en letras el valor del campo "Total".<br><br>Para el evento de Retorno podrá describir en letras el valor detallado en el campo "Total a pagar". | Opcional | Alfanumérico | Longitud: 200<br>Mínimo: 1<br>Máximo: 200 | Operaciones especiales y Retorno |
| 107 | resumen.totalNoOnerosas | C | Transferencias de bienes no onerosas | Este campo es de uso informativo, cuando el tipo de documento al que le aplica el evento sea FEXE podrá ingresar el valor que no constituye venta.<br><br>Deberá ingresar $0.00 cuando:<br>a) El evento se aplica a FEXE que no detalla este tipo de operación.<br>b) Se aplica a FE y FSEE. | Requerido para su transmisión | Numérico | Longitud: 11,2 | Retorno |
| 108 | resumen.totalIva | C | IVA 13% | Este campo será de uso informativo, no afectará los valores contenidos en el documento. | Requerido por tipo de operación | Numérico | Longitud: 11,2 | Retorno |

98

<!-- PAGE 99 / 137 (OCR) -->

Se hará uso de este campo cuando
evento se aplique a FE.

Cuando aplique. deberá contener la
sumatoria de los
campos 'IVA por ítem' menos el IVA que
corresponda al 'Descuento global a
ventas ravadas•.
Podrá indicar el saldo a favor (otros
abonos o pagos al receptor). Dicho valor
resumen | Longitud:
es de uso informativo y se registrará en
109 .saldoFa c | Saldo a Favor | Opcional | Numérico | Retorno
negativo. | 11,2
vor | deberá
Cuando no aplique se | ingresar
so.oo

Sección 11: MOTIVO DEL EVENTO

Debe detallarse el motivo por el cual se
Requerido
Motivo del genera eI evento, la información de la | Longit
para su | Objeto
evento | designada por el emisor y la | ud: 1
persona | transmisión
ersona ue 10 soticita.
Para el evento de invalidación = Tipo de
Invalidación.
motivo. | Longitud:
Tipo de | Requerido para | Invalidación
110 tipoAnul c | Nurnérico
Invalidación Deberá indicar eI motivo por el cual su transmisión | 1
acion
realizará el evento según catálogo CAT-
024 'Motivo del evento'.
Longitud:
En este | eI contribuyente deberá | 200
campo
motivo, | Mínimo:
describir el o los campos donde se Requerido para
111 motivoA | Motivo | Alfanumérico | Invalidación
encuentra el error que ocasiona el su transmisión | 1
nulaclon | Máximo.
evento.
200
Longitud'
motivo. | 100
Nombre de
nombre | Deberá ingresar el nornbre de la persona Requerido para | Mínimo:
112 | quien realiza el | Alfanumérico | Invalidación
Respons | responsable de realizar eI evento. | su transmisión | 1
able | Máximo.
100
Tipo de
motivo. | Deberá seleccionar la codificación de
documento de
tipDocR | acuerdo at catálogo CAT-022 'Tipo de Requerido para | Longitud:
113 | A identificación de | Alfanurnérico | Invalidación
documento de identificación' del su transrnisión | 2
esponsa | realiza el
quien | realizar el
ble | responsable de | evento.
evento
Longitud:
Número de
motivo. | 20
documento de Deberá ingresar el número de
numDo | Requerido para | Mínimo:
114 | A identificación de documento de identificación det | Alfanumérico | !nvalidación
cRespon | su transmisión | 1
quien realiza eI responsabte de realizar el evento.
sable | Máximo:
evento | 20

99

<!-- PAGE 100 / 137 (OCR) -->

Longitud
100
motivo. | Nombre de
Deberá ingresar el nombre de la persona Requerido para | Mínimo:
115 nombre | quien solicita el | Alfanumérico | Invalidación
que solicita et evento. | su transmisión | 1
Solicita | evento
Máximo:
100
Tipo de
motivo, | documento de Deberá seleccionar la codificación de
116 | identificación | Requerido para | Longitud:
tipDocS | de acuerdo al catálogo CAT-022 Tipo de | Alfanumérico | Invalidación
su transmisión | 2
oticita | quien solicita el documento de identificación'

Longitud:
Número de | 20
motivo. | Deberá ingresar eI número de
identificación de | Requerido para | Mínimo:
numDo | documento de identificación de quien | Alfanumérico | Invalidación
quien solicita el | su transmisión | 1
cSoIicita | solicita el evento,
evento | Máximo:
20

Sección 12: APÉNDICE

Esta sección es opcional y se
encuentra a disposición para incluir
cualquier información adicional.
Arreglo de Longitud:
c | Apéndice | Opcional
objeto Null | 10
Podrá ingresarse desde 1 hasta un
máximo de 10 veces, comptetando
todos los cam os.
Podrá ingresar el nombre del campo que
apendic | se está adicionando en el apéndice. | Longitud Retorno y
Nombre del
118 e.camp c | Opcional Alfanurnérico Máxima' Operaciones
campo
De no hacer uso del campo debe ingresar | 25 | especiales
nutl.
Podrá ingresar [a inforrnación que
corresponda describir respecto del
apendic | Longitud Retorno y
nombre del campo.
119 e.etiquet c | Descripción | Opcional Alfanumérico Máxima: Operaciones
a | 50 | especiales
De no hacer Uso del campo debe ingresar
null
Podrá ingresar un valor alfanumérico o
valor monetario. | Longitud Retorno y
apendic
120 | c | Valor/dato | Opcional Alfanumérico Máxima: Operaciones
e.valor
De no hacer uso del campo debe ingresar | 150 | especiales
nutl,

Sección 13: SELLO DE RECEPCIÓN

100

<!-- PAGE 101 / 137 (OCR) -->

No es una sección ni un campo de los
tos transmitidos a la
Administración Tributaria.
Invalidación,
No obstante, deberá incorporar el Sello | Contingencia,
selloRe | Sello de | Longitud:
121 | de Recepción enviado por la | Alfanumérico | Operaciones
cibido | Recepción | 40
Administración Tributaria en el Archivo | especiales y
DTE | entregue al receptor | Retorno
que
(exceptuando tas operaciones
generadas en Contingencia del Evento
de Retorno).

101

<!-- PAGE 102 / 137 (OCR) -->

ANEXO IV
VALIDACIONES PARA CAMPOS DTE

Sección 1: IDENTIFICACIÓN
Sección obligatoria incluida en todas las estructuras, donde se detallan tas generales del documento que se está
transmitiendo.

CAMPO | VALIDACIONES PARA CAMPOS | DTE

I Deberá ingresar el número de la versión JSON vigente por tipo de documento autorizada por la
Adnninistración Tributaria (AT), número entero sin cero ni punto a la derecha.
FE, CCFE. NRE, NCE.
1 | Versión | NDE, CREI DCLE, CIE.
Se ingresará 2 para: FE, CRE, CLE, OCLE, FSEE y CDE.
FEXE, FSEE y CDE
Se ingresará 3 para: FEXE
Se ingresará4 ara: CCFE, NRE, NCEy NDE
1, Campo requeridor se validará que campo se complete según codificación asignada en catálogo
CAT•OOI •Ambiente de Destino" | FE, CCFE, NRE, NCE,
Ambiente de
2 | NDE, CRE, DCLE, CLE.
destino
Deberá completar OO- cuando se encuentre en Modo prueba. | FEXE, FSEE CDE
y
Deberá corn letar OI- cuando se encuentre en Modo roducción,
FE, CCFE, NRE, NCE,
Tipo de 1. Campo requerido, se validará que ingrese el código asignado al tipo de documento que está
3 | NDE, CRE, DCLE, CIE,
documento generando según catálogo CAT-002 Tipo de Documento/Evento"
FEXE, FSEE CDE
1 Campo requerido. se validará que este Código de Generación sea único por documento con una
FE, CCFE, NRE. NCE.
longitud de 36 dígitos incluyendo guiones. Debe cumplir con la estructura definida por la AT, bajo
NDE, CRE, DCLE, CLE
eE estándar UUID v4,
Código de | FSEE y CDE
4 | Se validará ue la estructura tenga números y letras ma úsculas.
Generación
FE, CCFE. NERE, NCE,
2. Código de Generación debe ser único y universal | NDE, CRE, DCLE, CLE,
FEXE. FSEE y CDE

l, Campo requerido. Deberá cump\ir con la estructura definida por Ea Administración Tributaria con FE, CCFE. NERE* NCE,
una longitud de 31 caracteres (las siglas DTE + 2 dígitos del código del tipo de documento + 8 dlgitos NDE, CREI OCLE,
alfanuméricos 4 del establecimiento y 4 del punto de venta + un consecutivo de 15 digitos). | FEXE, FSEE y CDE

2 Los 8 dígitos alfanuméricos de la sección 3 del Núnlero de Control describen el código de
Núrnero de | FE, CCFE, NRE, NCEr
5 | establecimiento y punto de venta proporcionado por la AT y deberá ingresar la siguiente estructura:
Control | NDE. CRE, DCLE. CLE,
Para las posiciones de la 1 a la 4: | o "P" + 3 números.
FEXE, FSEE y CDE
Para las osiciones de la 5 a la 8: "P" + 3 números.
3. Se validará que el Número de Control no se repita durante el ejercicio comprendido del 01 enero FE, CCFE, NERE, NCE,
al 31 de diciembre, este número deberá reiniciarse a partir del primer DTE de cada ejercicio NDE, CRE, OCLE, CIE,
irnpositivo- | FEXE, FSEE y CDE
FE, CCFE, NRE, NCE,
L Campo requerido, se validará que se ingrese código según catálogo CAT„003 •Modelo de
NDE, CRE, DCLE, CLE,
Facturaclón*
FEXE, FSEE CDE
Modelo de | FE. CCFE, NRE, NCE,
6
Facturación 2 Se utilizará el *Modelo de Facturación Previa" {código 1), con Tipo de Transmisión Normal", | NDE, CRE, DCLE, CIE,
FEXE, FSEE CDE
FE. CCFE. NREt NCE,
3 En contingencia deberá ingresar eI código 2.
NDE, CRE, FEXE FSEE
FE, CCFE. NRE, NCE,
1. Campo requerido, validará | CAT-004 •
se | que se ingrese según catálogo | Tipo de Transmisión*, NDE, CRE, DCLE. CLE,
FEXE. FSEE CDE
Tipo de | FE. CCFE, NRE, NCE,
7
Transmisión 2. Debe utilizar el código 1 "Transmisión Normal', con -Modelo de Facturación Previo". | NDE, CREZ OCLE, CIE,
FEXE, FSEE COE
FE, CCFEr NRE, NCE,
3 En contingencia deberá ingresar el código 2
NDE, CRE, FEXE y FSEE
L Si en el | Tipo de transmisión' | 1 'Transmisión Normal', • de
carnpo | se ingresa código | TIPO FE, CCFE, NRE, NCE,
contingencia' será null, | NDE. CRE, FEXE y FSEE
Tipo de 2, Si en el campo *Tipo de transmisión" se selecciona el código 2 *Transrnisión por Contingencia", FE. CCFE, NRE, NCE,
8
Contingencia deberá ingresar el tipo de contingencia según catálogo CAT-005 Tipo de Contingencia' (Del 1 al 5), NDE. CRE, FEXE y FSEE
3. Únicamente será permitido Tipo de contingencia' de acuerdo a codificación establecida en FE, CCFE, NRE, NCE,
catálogo CAT-005 Tipo de Contingencia" | NDE CRE& FEXE y FSEE
1. Será requerido si campo 'Tipo de transmisión' está completo con el código 2 Transmisión por FE, CCFE, NCE, NDE,
Motivo de Contin encia cam o *TIPO de contingencia• contiene et códi 05. | NRE, CRE, FEXE y FSEE
9
Contingencia | FE, CCFE. NCE. NDE.
2 Carnpo null si en el campo *Tipo de transmisión* se ingresa el código 1 'Transmisión normal".
NRE& CRE, FEXE y FSEE

102

<!-- PAGE 103 / 137 (OCR) -->

CAMPO | VALIDACIONES PARA CAMPOS | DTE

transmita | • de contingencia'
3. Se podrá ingresar null, cuando se | en contingencia y campo Tipo
FE, CCFE, NCE. NDE.
contiene un código diferente a 5 (es decir que se ingrese tipo de contingencia con los códigos del
NERE. CRE, FEXE y FSEE

4. Si en campo Tipo de contingencia' selecc40na ei código 5 deberá contener información FE, CCFE/ NCE, NDE,
ampliando sobre el motivo de contingencia. | NRE. CRE, FEXE y FSEE
FE, CCFE. NRE, NCE,
1. Campo requerido con formato de fecha YYYY-MM-DD | NDE. DCLE, CLE.
FSEE y CDE
FE. CCFE. NRE. NCE.
2. Se podrá ingresar cualquier fecha que anteceda a la fecha de transmisión del documento en casos
NDE. CRE, CLE OCLE,
Fecha de especiales, | FEXE CDE
10
Generación
3. Se podrá ingresar fecha que anteceda a un período en referencia a la fecha de transmisión | FSEE
4. Se podrá ingresar fecha de generación hasta cinco días posteriores respecto a la fecha de
FE. CCFE, NRE, NCE.
transmisión en casos excepcionales. Esto no aplicará si la fecha de generación sobrepasa al siguiente
NDE, CRE, DCLE. CIE,
periodo tributario, Por ejemplo, en fecha de transmisión 27 de junio podrá enviar fecha de
FSEE y CDE
generación 28, 29 0 30 de 'unio; ero no odrá ingresar fecha de eneración 01 0 02 de 'utio.
FE, CCFE, NRE, NCE,
1. Campo requerido, se valida que cumpla con ta estructura de hora de generación. Formato
NDE, CRE. DCLE, CLE
Hora de | FSEE y CDE
11 | NCE,
Generación 2. Para el último día det tmes se tendrá una holgura de 30 minutos posteriores a la generación del FE, CCFE, NRE,
documento por posibles diferencias entre la hora de transmisión del contribuyente y la hora del NDE, CRE. OCLE, CLE,
sistema de la AT. | FSEE CDE
FE, CCFE& NERE, NCE,
12 Tipo de Moneda 1. Campo requerido se valida tipo de moneda USD | NDE, CRE. DCLE, CLE,
FSEE CDE
1. Se validará cam null cuando la o etación no sea consecuencia de una fusión u otro. | NCE, NDE, CRE y CLE
13 Fustones otros 2. Cuando a ti ue debe in resar et NIT del fusionado con longitud de 9 0 14 dígitos. | NCE, NDE. CRE CLE
y
3. Et NIT ue se detalle en este cam o debe estar en la lista de contribuyentes fusionados. | NCE, NDE, CRE CLE

Sección 2: DOCUMENTOS RELACIONADOS
Esta sección deberá llenarse si existiere documento a relacionar, de to contrario se completará con null. Cuando aplique,
podrá relacionarse un máximo de 50 documentos, completando todos los campos de la sección por cada documento
relacionado. Para NCE NDE esta sección es obligatoria.

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

I. Cuando no se requiera relacionar documentos previamente emitidos deberá ingresar esta sección
FE, CCFE, NRE y FEXE
con null.
2. Si la operación 10 requiere deberá contener código identificador del Tipo de Documento que se
FE, CCFE, NRE y FEXE
está relacionando
3. Cuando aplique podrá ingresar código 04-NR | FEXE

4. Cuando aplique podrá ingresar código 04-NR, 08-CL, 0 09-DCL | FE y CCFE
Tipo de
5. Es requerido con código 03- CCF 0 07- CR | NCE y NDE
14 documento
relacionado 6. Podrá contener código identificador del Tipo de Documento únicamente 01-FE, 03-CCFE 0 11-
NRE
FEXE
7. Se permitirá hasta máximo de 50 documentos cumpliendo con la condición que los documentos FE, CCFE. NRE. NCE,
relacionados deben ser det mismo ti o en un mismo DTE. | NDE FEXE
FE, CCFE. NRE. NCE,
8. Permitirá relacionar documentos ya sean estos generados de forma física y de forma electrónica.
NDE FEXE
9. Este | será obligatorio (es decir el campo no puede ser nutl). | NICE y NDE
campo
al | CAT„007 • de | FE, CCFE, NCE, NDE,
1. Podrá ingresar únicamente codificación de acuerdo catálogo | TIPO generación
del documento'. | NRE FEXE
Tipo de
del 2. Campo re uerido, solo si el | "Tipo de Documento Relacionado' está lleno. | FE, CCFE. NRE y FEXE
generación | campo
15
documento 3 Este cam o será obli atorto {es decir et cam o no puede ser nu(). | NCE NDE
relacionado | FE, CCFE, NRE. NCE.
4. Este campo podrá ingresarse desde 1 hasta un máxirno de 50 veces,
NDE FEXE
L Permitirá el ingreso de códigos de generación de documentos generados electrónicamente y FE, CCFE, NRE. NCE.
16 | NDE FEXE
correlativos de documentos generados en fisico. | y

103

<!-- PAGE 104 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 104. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| *(cont. p. 103)* | Número de documento relacionado | 2. Solo se podrán relacionar documentos del mismo tipo. | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 3. No se pueden relacionar documentos electrónicos con estado invalidado o rechazado. | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 4. Cuando no exista un documento a relacionar deberá enviar sección completa con null. | FE, CCFE, NRE y FEXE |
| | | 5. Este campo será obligatorio (es decir el campo no puede ser null). | NCE y NDE |
| | | 6. Podrá ingresar desde 1 hasta un máximo de 50 documentos. | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 7. Se podrá referenciar el mismo número de documentos en varios DTE diferente una sola vez sin exceder su valor (es decir el mismo número de documento relacionado podrá ingresarse en el DTE 1, DTE 2 y DTE "n") | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 8. El documento relacionado debe tener correspondencia con el emisor y el receptor. | FE, CCFE, NRE, NCE, NDE y FEXE |
| 17 | Fecha de generación del documento relacionado | 1. Deberá indicar la fecha de emisión del documento relacionado, en el siguiente formato: YYYY-MM-DD. | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 2. Debe cumplir con los plazos legales establecidos:<br><br>a) Si se genera FE, CCFE o FEXE relacionando una NR, deberá generarse en el mismo período tributario en que se generó la NR, o a más tardar dentro de 3 días siguientes a dicho período.<br><br>b) Si se genera FE o CCFE relacionando un DCL, la F o el CCF debe ser generado en el mismo período tributario en el que fue emitido el DCL.<br><br>c) Si se genera NCE o NDE relacionando un CCF o CR, la NC o ND deberá generarse a más tardar dentro de 3 meses en relación a la fecha de generación del CCF o CR, salvo las excepciones legales. | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 3. Cuando el Documento relacionado sea electrónico, validará que la fecha de generación corresponda al documento relacionado. | FE, CCFE, NRE, NCE, NDE y FEXE |
| | | 4. Podrá ingresar desde 1 hasta un máximo de 50 documentos. | FE, CCFE, NRE, NCE, ND y FEXE |

Sección 3: EMISOR

Esta sección contiene la información del emisor del DTE. Para el caso del CRE el emisor es el Agente de Retención; para el CLE, es el Comisionista; para el DCLE, es el Agente Perceptor; para la FEXE, es el Exportador; para el CDE, es el Donatario.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| 18 | NIT (Emisor) | 1. Campo requerido, NIT debe estar Registrado como contribuyente IVA activo según RUC. | FE, CCFE, NRE, NCE, NDE, CRE, CLE, DCLE, FEXE y FSEE |
| | | 2. El contribuyente debe estar autorizado como emisor de DTE. | FE, CCFE, NRE, NCE, NDE, CRE, CLE, DCLE, FEXE y FSEE |
| | | 3. Longitud de estructura de NIT será de 9 o 14 dígitos sin guiones ni otros caracteres especiales. | FE, CCFE, NRE, NCE, NDE, CRE, CLE, DCLE, FEXE y FSEE |
| | | 4. Cuando se haga uso de la sección documentos relacionados, el NIT que se detalle en este campo debe tener correspondencia con el NIT (Emisor) detallado en el Documento relacionado. | FE, CCFE, NCE, NDE, NRE y FEXE |
| | | 5. Cuando el documento a ajustar sea CR se validará NIT de agentes de retención no inscritos en IVA. | NCE y NDE |
| | | 6. Cuando se genere CRE relacionando F o CCF, el NIT que se detalle en este campo debe tener correspondencia con el NIT (Receptor) detallado en el Documento relacionado. | CRE |
| 19 | Tipo de documento de identificación (Emisor) | 1. Para efecto de CDE únicamente se ingresará el código 36-NIT. | CDE |
| 20 | Número de documento de identificación (Emisor) | 1. Deberá ingresar NIT activo, con longitud de 9 o 14 dígitos. | CDE |

104

<!-- PAGE 105 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

FE, CCFE, NRE, NCE,
1. Deberá tener correspondencia con respecto al NIT (debe ingresarse sin guion ni ceros a la
NDE, CRE DCLE, CLE,
izquierda para cumplir con la longitud).
FEXE, FSEE CDE
21 NRC (Emisor)
2. Se validará | nutl. | CRE, NRE, FSEE y CDE
campo
3. Validará campo null cuando se realice ajuste a CRE en el que también el campo NRC emisor sea
NCE y NDE
null.
FE, ccr-E, NRE, NCE,
22 Nombre (Emisor) I. Deberá detallar et Nombre, denominación o razón sociat del contribuyente emisor. | NDE CRE, OCLE, CIE,
FEXE, FSEE CDE
Código de
FE, CCFE. NRE, NCE.
actividad | CLE,
23 | I. Deberá ingresar uno de los códigos según catálogo CAT-019 "Código de actividad económica'. NDE CRE, DCLE.
económica
FEXE, FSEE y CDE
(Emisor)
Actividad | FE, CCFE. NERE, NCE,
I. Campo requerido, con nombre de la actividad económica detallada en campo 'Código de
24 económica | NDE, CRE, DCLE, CIE,
actividad económica {Emisor)'
(Emisor) | FEXE, FSEE CDE
Nombre | FE, CCFE. NCE, NDE,
25 comercial 1. Campo opcional. podrá ingresar el nombre cornercial det contribuyente. | NRE. CRE. CIE, DCLE,
(Emisor} | FEXE y CDE
Dirección | FE, CCFE. NRE, NCE,
1, Campo requerido, únicamente se valida codificación de Departamento según catáiogo CAT„012
26 Departamento | NDE, CRE, DCLE, CIE,
Departamento. | FEXE, FSEE CDE
(Emisor} | y
Dirección | FE, CCFE, NRE, NCE,
1, Campo requerido, únicarnente se valida codificación de Municipio según catálogo CAT„013
27 Municipio | NDE, CRE, DCCE, CLE,
Municipio. | FEXE, FSEE CDE
(Emisor)
1. Campo requerido, debe ingresar el distrito que corresponda a la ubicación del emisor, según
FE, CCFE. NRE. NCE,
Dirección codificación del catálogo CAT„008 'Distrito'
28 | NDE, CRE, DCLE, CLE,
Distrito (Emisor)
FSEE, FEXE y CDE
Código de distrito debe tener corres ndencla con De artamento y Munici b.
Dirección | FE, CCFE. NRE, NCE,
1. Campo requerido, que describa el complemento de la dirección donde está ubicado eI
29 complemento | NDE, CRE, DCLE, CLE,
establecimiento, incluyendo et nombre del Distrito.
(Emisor) | FEXE, FSEE y CDE
FE, CCFE, NRE, NCE,
Tetéfono
30 | I. Campo requerido, tendrá una longitud mínfrna de 8 y máxima de 30 caracteres, | NDE, CRE. DCLE, CLE,
(Emisor) | FEXE. FSEE CDE
Correo | FE. CCFE, NRE, NCE,
31 electrónico I, Campo requerido, estructura de correo electrónico con dominio de nivet superior válEdo. | NDE, CRE. OCLE, CLE.
(Emisor) | FSEE y CDE
Código det
FE, CCFE, NRE, CRE
establecimiento 1, Este campo es opcional, cuando desee ingresar eI código del Establecimiento que utilice el
32 | CIE, DCI.E, FSEE, FEXE
asignado por eI contribuyente internamente.
y CDE
contribu ente
Código det
Punto de Venta | FE, CCFE, NRE, CRE
I. Este campo es opcional, cuando requiera ingresar el código del Punto de Venta que utilice et
33 | (Emisor) | CIE, DCLE, FSEE. FEXE
contribuyente internamente.
asignado eI | Y CDE
por
contribu ente
I. Campo requerido, deberá seleccionar codificación de acuerdo a catálogo CAT-OII 'Tipo de
Tipo de
34 | (tema | FEXE
exportación
No aplican códigos 3 y 4.
1, Campo requerido, cuando en el campo *Tipo de exportación' se ingrese la opción 1, deberá
35 Recinto fiscal indicar el códi o det Ti o de ré innen conforme al catálogo CAT-027 'Recinto fiscal•. | FEXE
2 Se vatidará cam o null si en eI carn o 'Ti ode ex rtación• se ingresa lao ión 2.
1. Campo requerido, cuando en el campo *Tipo de exportación' se ingrese la opción 1, deberá
seleccionar codificación de acuerdo | CAT-033 • Ti de Ré ímen'. | FEXE
36 Tipo de Régimen | a catálogo | o
2 Se validará carn onull si en el cam o ode ex ortación- se ingresa la o clón 2.
I, Campo requerido, cuando en campo *Tipo de ítem* se ingresen los códigos 1 Bienes 0 3 Ambos,
Régimen de
37 | deberá seteccionar codificación de acuerdo a catátogo CAT-028 'Ré irnen'.
exportación | este | nul[ FEXE
2. Cuando en *Tipo de ítem' in rese el código 2 'Servicios' deberá completar cam o con

105

<!-- PAGE 106 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 106. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

Sección 4: RECEPTOR

Contiene la información del Receptor del DTE. Para el caso del CRE, el receptor es el Sujeto de Retención; para el CLE, es el Mandante; para el DCLE, es el Afiliado; para el FSEE, es el Sujeto Excluido; para el CDE, es el Donante.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| 38 | Tipo de documento de identificación (Receptor) | 1. Deberá seleccionar codificación de acuerdo al catálogo CAT-022 "Tipo de documento de identificación". | FE, NRE, CRE, FEXE, CDE, CLE y FSEE |
| | | 2. Debe ingresar código del tipo de documento que corresponda al detallado en el DTE que se está ajustando. | NCE y NDE |
| | | 3. Cuando el documento a ajustar sea CCFE solo permitirá el ingreso del código 36-NIT | NCE y NDE |
| | | 4. Cuando el documento a aplicar el ajuste sea CR físico, debe ingresar uno de los códigos contenido en el catálogo CAT-022 "Tipo de documento de identificación". | NCE y NDE |
| | | 5. Podrá ingresar null cuando el monto total de la operación sea menor al monto legalmente establecido. | FE |
| | | 6. Debe ingresar código del Tipo de documento de identificación del receptor cuando el monto total de la operación sea mayor al monto legalmente establecido. | FE |
| | | 7. Se ingresará el código 13-DUI para el caso de las personas naturales que no poseen NRC. | FE, NRE, CRE y FSEE |
| 39 | Número de documento de identificación (Receptor) | 1. Debe ingresar el Número del documento de identificación del receptor con una longitud máxima de 20 dígitos. | FE, NRE, CRE, FEXE, FSEE, CLE y CDE |
| | | 2. Podrá ingresar null cuando el monto total de la operación sea menor al monto legalmente establecido. | FE |
| | | 3. Debe ingresar el Número de documento de identificación del receptor cuando el monto total de la operación sea mayor al monto legalmente establecido. | FE |
| | | 4. Debe ingresar en este campo el NIT del tercero detallado en el DTE que se informe. | CLE |
| | | 5. No podrán informarse los documentos electrónicos en los que la sección "Venta por cuenta de terceros" sea null. | CLE |
| | | 6. Deberá contener el NIT/número de documento de identificación del receptor contenido en el CCFE o el CRE. | NCE y NDE |
| | | 7. Cuando seleccione NIT se validará que esté activo y que cumpla con la estructura, sin guiones ni otros caracteres especiales. | FE, NRE, CLE y CDE |
| | | 8. Cuando el documento a informar sea electrónico deberá ingresar lo siguiente:<br>El emisor que se ingrese en el CR debe ser el receptor del documento informado (FE o CCFE).<br>El receptor que se ingrese en el CR debe ser el emisor del documento informado (FE o CCFE). | CRE |
| | | 9. Cuando el DTE tenga un documento relacionado, deberá ingresar el número de documento de identificación del receptor detallado en el DTE relacionado. | FE, NRE, CRE y FEXE |
| | | 10. Cuando seleccione código 13 "DUI" se validarán 9 dígitos sin guiones ni otros caracteres especiales. | FE, NRE, CRE, FEXE, FSEE, CLE y CDE |
| 40 | NIT (Receptor) | 1. Campo requerido, NIT debe poseer NRC activo. | CCFE y DCLE |
| | | 2. Cuando el documento se genere con documento relacionado, debe ingresar el mismo NIT del receptor detallado en el documento relacionado. | CCFE |
| | | 3. Podrá ingresar una longitud de 9 o 14 números, sin guiones ni otros caracteres especiales. | CCFE y DCLE |
| 41 | NRC (Receptor) | 1. Cuando se detalle NRC debe tener correspondencia con el NIT descrito, sin guion ni ceros a la izquierda. | FE, CCFE, NRE, NCE, NDE, CRE, CLE, DCL y CDE |
| 42 | Nombre (Receptor) | 1. Debe ingresar el nombre, denominación o razón social del receptor. | CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |
| | | 2. Podrá ingresar null cuando el monto total de la operación sea menor al monto legalmente establecido. | FE |
| | | 3. Debe ingresar el Nombre del receptor cuando el monto total de la operación sea mayor al monto legalmente establecido. | FE |
| 43 | Código de Actividad Económica (Receptor) | 1. Se validará campo null. | FE y FSEE |
| | | 2. Debe ingresar el código de cualquiera de las Actividades Económicas contenidas según catálogo CAT-019 "Código de actividad económica", bajo la cual el contribuyente receptor está realizando la operación. | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FSEE y CDE |
| | | 3. Cuando el campo "Domicilio fiscal" este completo con el código 2 se validará campo null. | CD *(sic)* |
| 44 | Actividad Económica (Receptor) | 1. Se validará campo null. | FE y FSEE |
| | | 2. Cuando se detalle actividad económica debe cumplir con formato alfanumérico con máximo de 150 caracteres. | FE, CCFE, NRE, NCE, NDE, CRE, DCLE, CLE, FEXE, FSEE y CDE |

106

<!-- PAGE 107 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

Nombre | CCFE, NRE, NCE, NDE,
45 Comercial 1. Campo opcional. podrá ingresar eI nombre comercial del receptor. | CRE, DCLE y
{Rece tor) | FEXE
Tipo de
1. Campo requerido, únicamente aceptará codificación según catálogo CAT-009
46 establecimiento | DCLE
estabtecimiento'.
Rece
1. Se validará cam null-
Dirección
FE. CCFE. NRE, NCE,
47 Departarnento
2. Debe mgresar codificación de Departamento según catálogo CAT-012 'Departamento". | NDE, CRE. CI„E, DCLE,
(Receptor) | FSEE CDE
y
1. Se validará cam null
Dirección
FE, CCFE, NRE, NCE
48 Municipio
2. Debe ingresar codificación de Municipio según catálogo CAT-013 'Municipio'. | NDE. CRE, DCLE, CLE
(Receptor) | FSEE CDE
1. Cuando aplique debe ingresar el Distrito que corresponda a la ubicación del receptor. según
codificación det catálogo CAT-008 Distrito.
Dirección | FE, CCFE, NRE, NCE.
49 | Distrito Código de Dstrito debe tener correspondencia con Departamento y Municipio. | NDE. CRE, OCLE. CLE
(Receptor) | FSEE y CDE
Para el caso de la factura este campo no es obligatorio, pero si 10 llena debe ingresar la
codificación correspondiente.
I, Será null si el campo "Dirección Departamento Receptor' también es null.
Dirección
50 complernento | FE/ CCFE, NRE, NCE,
(Receptor) 2. Debe cumplir formato alfanumérico con un máximo de 200 caracteres. | NDE, CRE, DCLE, CLE,
FEXE. FSEE CDE
Código de pais
51 | 1, Carnpo requerido con codificación del país según catálogo CAT-020 *País' | FEXE y CDE
(rece tor)
País destino de
52 la exportación 1. Debe ingresar el nombre del país destino de la exponación | FEXE
(rece
1, Cam r uerido. con codificación de acuerdo a catátogo CAT-032 'Domicilio Fiscal- | CDE CLE
2. Debe ingresar el mismo código que detaló en FE V2. CCFE V4t NCE V4, NDE V4 0 FEXE V3 at que
CIE
53 Domicilio Fiscal se informe en el CLE V2.
3. Cuando en CLE se informen versiones diferentes a V4 de CCFE, NCE. NDE, V2 de FE o V3 de FEXE
CLE
deberá in resar uno de los códi os det catálo o CAT 032 'Domicilio Fiscal'.
Bienes Remitidos 1. Campo requerido únicamente con codificación establecida según catálogo CAT-025 Título a que
54 | NERE
a Titulo de se remiten los bienes'.
Tipo de
55 | 1. Campo requerido, únicamente aceptará codlficación según catálogo CAT-029 Tipo de receptor- FEXE
Receptor
FE, CCFE, NRE, NCE,
Teléfono
56 | I. Campo opcional, cuando 10 requiera podrá ingresar el número telefónico del receptor. | NDE. CRE. DCLE,
(Receptor) | FEXE, FSEE CDE
FE, CCFE, NRE, NCE,
Correo L Estructura de correo electrónico con dominio de nivel superior válido. | NDE, CRE, DCLE, CIE,
57 electrónico | FEXE. FSEE y CDE
(Receptor) | FE, CRE. FEXE, FSEE y
2. Campo podrá ser null
CDE

sección 5: DOCUMENTOS ASOCIADOS
En estos campos se describen los documentos asociados.
Se podrán describir desde 1 hasta 10 documentos asociados, excepto para la FEXE, donde se podrán describir desde 1 hasta
20 documentos.
Cuando no se requieran, deberá enviar esta sección con null.
Cuando aplique. si el campo *Documento asociado* está completo con tos códigos 1 0 2, esta sección deberá completarse
desde el campo *Documento asociado' hasta el campo 'Descripción de documento asociado'
Cuando aplique, si el campo 'Documento asociado' detalle el código 3 'Médico•, deberá completarse desde el campo
-Nombre de médico | el Servicio• hasta el | - Código del tipo de servicio realizado'
que presta | campo
En la FEXE, cuando eI campo 'Documento asociado' detalle el código 4 Transporte' deberá completar desde el campo
'Modo de transporte* hasta el campo 'Nombre y apellido del conductor'
En el CDE, será obligatorio ingresar los datos de ta resolución de conformidad al art. 6 LISR det donatario, deberá
comptetar desde el campo 'Documento asociado• hasta el campo 'Descripción de documento asociado'.

107

<!-- PAGE 108 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 108. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| 58 | Documento asociado | 1. Cuando aplique se deberá colocar código según catálogo CAT-021 "Documentos asociados" al que corresponde el documento asociado. | FE, CCFE y FEXE |
| | | 2. Campo es requerido con código 1. | CDE |
| | | 3. El código 4 sólo se utilizará para FEXE. | FEXE |
| | | 4. El código 3 sólo podrá utilizarse para FE y CCFE. | FE y CCFE |
| | | 5. Puede ingresar null, cuando no exista documento asociado. | FE, CCFE y FEXE |
| 59 | Identificación del documento asociado | 1. Aplica cuando el campo "Documento asociado" esté lleno con el código 1 o 2. | FE, CCFE, FEXE y CDE |
| | | 2. Campo es requerido con descripción del nombre del tipo de documento asociado. | CDE |
| | | 3. Se valida campo null cuando:<br>a) Campo "Documento asociado" también sea null.<br>b) Cuando el campo "Documento asociado" esté lleno con un código diferente a 1 o 2. | FE, CCFE y FEXE |
| | | 4. Puede ingresar desde 1 hasta 10 documentos asociados. | FE, CCFE y CDE |
| | | 5. Puede ingresar desde 1 hasta 20 documentos asociados. | FEXE |
| 60 | Descripción de documento asociado | 1. Debe ingresar la descripción del documento asociado cuando el campo "Documento asociado" esté lleno con los códigos 1 o 2. | FE, CCFE y FEXE |
| | | 2. Se valida campo null cuando:<br>a) Campo "Documento asociado" también sea null.<br>b) Cuando el campo "Documento asociado" esté lleno con un código diferente a 1 o 2. | FE, CCFE y FEXE |
| | | 3. Campo es requerido con descripción del documento asociado. | CDE |
| | | 4. Puede ingresar desde 1 hasta 10 documentos asociados. | FE, CCFE y CDE |
| | | 5. Puede ingresar desde 1 hasta 20 documentos asociados. | FEXE |
| 61 | Nombre de médico que presta el servicio | 1. Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3. | FE y CCFE |
| | | 2. Podrá ingresar null, cuando no existan documentos asociados o si el campo "Documento asociado" esté lleno con un código diferente a 3. | FE y CCFE |
| | | 3. Puede utilizarse desde 1 hasta 10 veces. | FE y CCFE |
| 62 | NIT del médico que presta el servicio | 1. Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3. | FE y CCFE |
| | | 2. Longitud de estructura de NIT, sin guiones ni otros caracteres especiales. | FE y CCFE |
| | | 3. NIT del médico que presta el servicio será null cuando el campo "Documento de identificación de médico no domiciliado" se encuentra null. | FE y CCFE |
| | | 4. Podrá ingresar null, cuando no existan documentos asociados o si el campo "Documento asociado" esté lleno con un código diferente a 3. | FE y CCFE |
| | | 5. Puede utilizarse desde 1 hasta 10 veces. | FE y CCFE |
| 63 | Documento de Identificación de médico no domiciliado | 1. Este campo deberá completarse si el campo "Documento asociado" se ha llenado con el código 3. | FE y CCFE |
| | | 2. Campo es requerido cuando el "Nombre del médico que presta el servicio" se encuentre lleno y "NIT del médico que presta el servicio" se encuentre null. | FE y CCFE |
| | | 3. Se valida campo null si campo "nombre de médico que presta el servicio" se encuentra null. | FE y CCFE |
| | | 4. Podrá ingresar null, cuando no existan documentos asociados o si el campo "Documento asociado" esté lleno con un código diferente a 3. | FE y CCFE |
| | | 5. Puede utilizarse desde 1 hasta 10 veces. | FE y CCFE |
| 64 | Código del Servicio Realizado | 1. Es requerido si el campo "Documento asociado" se ha llenado con el código 3. | FE y CCFE |
| | | 2. Cuando aplique debe ingresar codificación de acuerdo a catálogo CAT-010 "Código tipo de Servicio (Médico)". | FE y CCFE |
| | | 3. Podrá ingresar null, cuando no existan documentos asociados o si el campo "Documento asociado" esté lleno con un código diferente a 3. | FE y CCFE |
| | | 4. Puede utilizarse desde 1 hasta 10 veces. | FE y CCFE |
| 65 | Modo de transporte | 1. Es requerido si el campo "Documento asociado" se ha completado con el código 4. | FEXE |
| | | 2. Podrá ingresar null, cuando no existan documentos asociados o si el campo "Documento asociado" esté lleno con un código diferente a 4. | FEXE |
| | | 3. Deberá contener código según catálogo CAT-030 "Transporte". | FEXE |
| 66 | Número de identificación del transporte | 1. Es requerido si el campo "Documento asociado" se ha completado con el código 4. | FEXE |
| | | 2. Podrá ingresar null, cuando no existan documentos asociados o si el campo "Documento asociado" esté lleno con un código diferente a 4. | FEXE |

108

<!-- PAGE 109 / 137 (OCR) -->

CAT-030 • Trans orte•. | FEXE
3. Deberá contener código según catálogo
4. Puede utiljzarse desde 1 hasta 20 veces. | FEXE

I. Es requerido si el | "Documento asociado- se ha completado con et código 4. | FEXE
Número de | campo
documento de | 'Documento
2. Podrá ingresar null, cuando no existan documentos asociados o si el campo
identificación del | FEXE
asociado' esté lleno con un código diferente a 4.
conductor
3. Puede utilizarse desde 1 hasta 20 veces. | FEXE
L Es re uerido si et cam o "Documento asociado- se ha com letado con el código 4.
Nombre y
2. Podrá ingresar null, cuando no existan documentos asociados o si el campo 'Documento
68 apellidos del | FEXE
asociado' esté lleno con un códi o diferente a 4.
conductor
3. Puede utilizarse desde 1 hasta 20 veces.

Sección 6: VENTA POR CUENTA DE TERCEROS
Esta sección deberá completarse cuando la venta es cuenta de terceros. Las ventas por cuenta de terceros deben ingresarse
por
en documentos/ eventos separados de las operaciones propias. importante: Deberá completarse esta sección para poder ingresar
en el CLE la información de los DTE emitidos or cuenta de terceros.

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

FE, CCFE, NRE, NCE,
I. Debe ingresar eI NIT det mandante cuando se realicen operaciones por cuenta de terceros.
NDE y FEXE
FE, CCFE, NRE. NCE,
2. Emisor no puede ser tercero. | FEXE
NDE
3. Cuando | aplicación debe enviar este | con null. | FE, CCFE, NRE y FEXE
no tenga | campo
4. Cuando se detallen DTE en la sección de Documentos Relacionados. se validará correspondencia FE. CCFE, NRE. NCE.
de NIT de emisor, NIT de receptor NIT cuenta de tercero contenido en el DTE que se relacione. NDE y FEXE
y por
NiT por cuenta | debe contener el mismo número de NIT
69 | 5. Cuando el documento a ajustar sea CCF este campo
NCE y NDE
de Terceros
por cuenta de tercero contenido en el CCF.
FE. CCFE, NRE, NCE,
6. Longitud de estructura de NIT sin guiones ni otros caracteres especiales.
NDE, y FEXE
7, Debe ingresar null cuando:
a) *NIT cuenta de tercero' en CCF también sea null. | NCE y NDE
por
Si | • de documento' 07-CR.
b) cam o Tipo | es
8. Cuando et | 70 *Domicilio Fiscal* contenga código 1 -Domiciliado' deberá ingresar NIT de FE, CCFE. NRE, NCE,
campo
contribuyente inscrito en IVA. | NDE y FEXE
1.Deberá ingresar null cuando el campo NtT por cuenta de terceros también es null o si eI
FE, CCFE, NRE y FEXE
documento se genera con documento relacionado ue no detalle nombre de tercero,
Nombre del | cuenta de tercero encuentra lleno o si el FE. CCFE, NRE, NCE.
70 | 2. Campo requerido cuando el campo NIT por | se
Tercero | relacionado este detalla nornbre de tercero. | NDE FEXE
documento se genera con documento | y | y
3, Debe enviar con null cuando eI | 'Tipo de documento relacionado' es 07-CR. | NCE y NDE
campo
1. Cuando se detalle "Nombre del Tercero" debe ingresar uno de los códigos de acuerdo a | FE. CCFE, NRE. NCE,
catálogo CAT-032 'Domicilio Fiscal' | NDE y FEXE
2. Debe enviar sección con null cuando el documento a relacionar sea 08-CL 0 09-DCL | FE y CCFE
3 Debe enviar sección con null cuando el documento a relacionar sea 07-CR. | NCE y NDE
4. Se vatidarà sección connpteta con null- | FE. CCFE. NRE y FEXE
71 Domtcllio Fiscal 5. Se validará sección completa con null cuando en CCFE a ajustar la sección venta por cuenta de
NCE y NDE
terceros también sea null
6. Cuando se detalle DTE deberá ingresar ei código que se ingresó en eI documento relacionado, FE, CCFE, NRE,
FE V2; CCFE, NCE NDE V4; FEXE VS según corresponda. | NDE y FEXE
para | y | y
7. Si el docurnento relacionado es diferente a FE V2; CCFE, NCE y NDE V4; y FEXE V3, deberá | FE, CCFE, NRE, NCC-t
ingresar uno de tos códtgos del catálogo CAT-032 "Domicilio Fiscal', según corresponda. | NDE y FEXE

Sección 7: COMPRA POR CUENTA DE TERCEROS
Esta Sección deberá completarse cuando la compra se efectúe por cuenta de terceros. Cuando no aplique, deberá transmitir la
sección com teta con null.

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

Número de 1. Cuando eI 'Número de documento de identificadón del Tercero' esté lleno, el *Receptor' deberá
72 | FEXE
documento de encontrarse enlistado como o erador logístico r la Adrninistración Tributaria,

109

<!-- PAGE 110 / 137 (OCR) -->

No. CAMPO | VALIDACtONES PARA CAMPOS | DTE

identificación del
Tercero 2, Longitud de número sin guiones ni otros caracteres especiales.

Nombre del L Deberá ingresar "Nombre del Tercero" cuando el campo "Núrnero de documento de identificación
73
Tercero del Terceron se encuentre lleno.

Sección 8: CUERPO
Esta sección contiene la información detallada de (a operación realizada.
Se a licarán las reglas de redondeo holgura contenidas en las reglas 7.2 titeral a) 7.3 de esta Normativa.

CAMPO | VALIDACIONES PARA CAMPOS | DTE

FE, CCFE, NRE, NCE,
L Formato de números enteros consecutivos, mayores a cero sin punto y sin decimales, | NDE, CRE, CLE, FEXE,
FSEE y CDE
74 NO de ítem | FE. NERE, CCFE. NCE,
2. Podrá ingresar hasta un nnéximo de 2000 ítem. | NDE, FEXE, FSEE
y
CDE
3. Podrá ingresar hasta un máximo de 500 ítem, | CRE CLE
y
• | FE, CCFE, NCEr NDE
1 Carnpo requerido, deberá seleccionar codificación de acuerdo al catálogo CAT-OII Tipo de ftem•.
FSEE FEXE
2 Perrnitirá ingresar sólo los códigos 1 0 2 del CAT-OII 'Tipo de tern", con excepción de la regla 3
FEXE
si uiente.
3. Permitirá ingresar código 4 cuando el emisor haya presentado justificación y posea autorización
de la Administración Tributada.
4. No se hará uso del código 4 (otros tributos or ítem). | FSEE
5 únicamente se ingresará el código 4 cuando se detalle impuestos cuyo valor esté sujeto al cálculo
FE. CCFE, NDEr NCE y
75 Tipo de ítem del IVA. es decir cuando se detallen en el (tem impuestos que correspondan a los códigos A8, 57,
FEXE
90 0 A6- contenidos en el apartado 2 del catálogo CAT„015 "Tributos»
6, Cuando el campo "Tipo de documento relacionado" sea 01 0 03 podrá ingresar uno de los
ítem" | NRE
códigos del catálogo CAT-OII "Tipo de
7, Cuando el campo "Tipo de documento relacionado' sea 11 podrá ingresar 1 0 2 con excepción
NERE
de la regla 8 siguiente.

8. Cuando el campo Tipo de documento relacionado" sea 11 podrá ingresar Tipo de ítem' 4 si el
NRE
emisor haya presentado justificación y posea autorización de la Administración Tributaria.
76 TÉ o donación L Carn r uerido, con códi o se ún catáto o CAT- 026 "Ti ode donación•. | CDE
77 De reciación I. Valor monetario 30,00 | CDE
i. Cuandoa li ue contendrá ek códi o del TI ode documento, asean estos físicos o electrónicos. CRE
Tipo de 2, No se podrán ingresar diferentes tipos de documentos, es decir, únicamente se podrá relacionar
CRE
78 Documento un solo tipo de documento,
Relacionado 3. Cuando se relacionen DTE estos deberán tener Sel(o de Recepción | CRE
4 Podrá in resar hasta un máximo de 500 Ítem. | CRE
Tipo de 1. Campo requerido con codificación de acuerdo a catálogo CAT-007 *Tipo de generación del
CRE y CLE
generación del documento•
79
documento
2. Podrá ingresar hasta un máximo de 500 ítem | CRE CLE
relacionado | y
1. Permitirá el ingreso de Códigos de Generación de documentos generados electrónicamente y FE, CCFE. NRE. NCE
correlativos de documentos generados en físico. | NDE, CRE, CLE FEXE
2. Dentro de los 2000 item permitidos, deberá detallarse todos los Códigos de Generación de los FE, CCFE. NRE, NCE
documentos relacionados, contenidos en la sección de 'Documentos relacionados' | NDE FEXE
, | y
FE, CCFEt NRE, NDE
3. Solo se podrá relacionar documentos del mismo tipo
Número de | NCE CRE
80 documento 4. Cuando no exista un documento a relacionar deberá enviar este cam con null- | FE, CCFE, NRE FEXE
relacionado
5, Podrá ingresar desde I hasta 500 documentos detallando un documento por cada (tem. | CLE CRE
y
FE, CCFE, NRE, NDE.
6. Cuando se relacionen DTE estos deberán tener Sello de Recepción.
NCE, CRE CLE
7 EI Código de Generación que se detalle debe tener correspondencfla con el tipo de documento FE. CCFE, NDE.
detalkado en el DTE relacionado. | NCE, CRE CLE
y

110

<!-- PAGE 111 / 137 (OCR) -->

CAMPO | VALIDACIONES PARA CAMPOS | DTE

8. Cuando el documento relacionado se haya generado en fisico deberá ingresar el número de FE. CCFE& NRE, NCE,
correlativo. | NDE, CRE. CLE y FEXE
FE. CCFE, NRE, NCE,
9. Este campo se podrá ingresar desde 1 hasta 2000 veces.
NDE y FEXE
FE, CCFE, NRE, NCE.
10. No se pueden relacionar documentos electrónicos Invalidados o Rechazados.
NDE, CRE FEXE
11. Los DTE con estado recibidos satisfactoriamente solo podrán relacionarse a un CLE una sota
CLE
vez.
12. Los DTE se encuentren con estado invalidado solo podrán relacionarse a un CLE una sola
que | CLE
vez.
13. Se permitirá repetir 2 veces el número de documento relacionado en un CLE solo si el
documento informado ha sido transmitido satisfactoriamente (en positivo) e invalidado (en | CLE
negativo} dentro del mismo penodo que informe et CLE.
14. Los documentos que se informen en el CL deberán ser de un mismo emisor y receptor (no
CLE
pueden informarse DTE de emisores y receptores diferentes).
L Deberá ingresar la fecha de generación del documento relacionado, en el siguiente formato:
CRE y CLE
WYY-MM-DD.
2. EI CRE deberá | en el mismo período tributario en que se generó ei CCF o la F
generarse | CRE
relacionados.
3. Los documentos invalidados/anutados deberán informarse en et CLE en el mismo período en
Fecha de
et evento de invalidación, ingresando la fecha de generación contenida en el DTE CLE
del que se generó
Generación
81 | invalidado, a inforrnar.
Documento
4. Cuando se detalle documento activo físico, se validará que la fecha de emisión detallada
relacionado | CLE
corresponda al periodo informado.
5. EI CLE deberá | en el mismo período tributario en que se generó el CCF, E NC, ND, FEX
generarse | CIE
o Evento de retorno relacionados.
6. Este | odrá ingresar desde 1 hasta 500 veces. | CRE y CLE
cam se
FE. CCFE, NRE, NCE,
l. Cantidad en números mayores a cero, separadas por punto con un máximo de 8 decimales
NDE, FEXE. FSEE y
después del entero. | CDE

2 Se deberá completar con valor 1 cuando:
a) Cuando se haga uso del campo *Cargos [Abonos que no afectan la base imponible"
FE, CCFE, NRE y FEXE
82 Cantidad b} Cuando et | XTjpo de ítem- según catálogo CAT-OII 'Tipo de ítem' esté lleno con el código
campo
4.
3. Campo Cantidad se deberá completar con valor 1 cuando el Tipo de documento a ajustar es
NDEy NCE
Comprobante de retención.
4 Campo Cantidad se deberá cornpletar con valor 1 cuando en et tipo de donación sea en efectivo. CDE
FE, CCFE, NERE. NCE,
1. Los contribuyentes no obligados a presentar el tnforme F983, podrán ingresar null, | NDE, FEXE, FSEE y
CDE
83 | Código
2. Campo debe ser null cuando se detalle ítem como Cargos/abonos que no afectan la base FE. CCFE, NCE, NDE y
imponible- | FEXE

1. Cuando se haga uso de este | se ingresará por ítem uno de los códigos de tributos A8, 57. FE. CCFE, NRE, NCE y
campo
90 A6 de ta sección 2 det catálogo CAT-015 "Tributos'. | NDE
y

2. Deberá ingresar null cuando: | NCE,
FE, CCFE, NERE,
a) No se detallen tributos sujetos a cálculos de IVA,
NDE y FEXE
Tributo sujeto a Si | de ítem tiene | diferente 4.
b) campo Tipo | un código | a
cálculo de IVA
3. Cuando se haga uso de este campo y se detallen ventas gravadast et campo Código det tributo'
84
se deberá enviar con null,
4 Debe in null cuando el documento a a•ustar es CR | NDE NCE
resar
5. Podrá detallar et Impuesto especial at combustible (A8} si el emisor ha presentado justificación y
autorización de la Administración Tributaria. Esta condición aptica para las NRE que relacionen FEXE y NRE
posea
FEXE.
6. Cuando se utilice este campo deberá verificarse que en el campo "Tipo de Ítem" contenga el
FEXE
códi 04.
FE. CCFE. NERE. NCE,
Unidad de 1. Únicamente tomará como vátida la codificación para unidades de medida estabtecida según
85 | NDE, CDE y
Medida catátogo CAT-014 'Unidad de Medida'
FSEE

111

<!-- PAGE 112 / 137 (OCR) -->

CAMPO | VALIDACIONES PARA CAMPOS | DTE

2. Se deberá ingresar el código 99 (Otra) cuando el contribuyente preste un servicio, no aplique FE, CCFE, NRE, NCE,
unidad de medida o la unidad de medida no esté contemplada dentro del catálogo proporcionado NDE, CDE y
o cuando se detalle la forma de resentación del roducto, | FSEE
3. Se deberá ingresar eI código 99 (Otra) cuando se haga uso de campo 'Cargos/Abonos que no
FE, CCFE y FEXE
afectan Ea base imponible"
FE, CCFE, NRE, NCE y
4. Se deberá ingresar el código 99 {Otra) cuando campo TIPO de ítem' esté lleno con el código 4.
NDE
FE, CCFE, NCE, NDE.
1, Campo requerido, alfanumérico con longitud máxima de 1,500 caracteres. | NRE, CREZ FEXE, FSEE
86 Descripción
CDE
2 Se validará campo null. | CRE

1. | FE, CCFE, NRE, NCE,
Campo requerido, con valores monetarios 0
NDE. FEXE y FSEE

2. Los | DTE | CCFE, NRE, NCE, NDE,
precios en los deberán expresarse en valores sin IVA.
FEXE y FSEE
3, Para FE los preclos deberán expresarse a precios consumidor final es decir precios incluyendo
IVA.
87 Precio Unitario
4. Cuando se haga uso del campo "Cargos/Abonos que no afectan la base imponible". Deberá FE. CCFE, NCE, NDE
y
ingresar valor $OOO | FEXE
5. Cuando el campo Tipo de ítem" se complete con el código 4 deberá reflejar el valor det tributo
sujeto a IVA
FE. CCFE, NRE, NCE.
NDE y FEXE
Este caso solo aplica cuando se detallen en el ftem tributos sujetos a cálculo de EVA contenidos en
la sección 2 códigos A8, 57, 90 A6 del catálogo CAT-015 'Tributos'
L Campo requeridor con valores monetarios > 0, máximo II posic¿ones del valor entero separadas
88 Valor Unitario | CDE
or unto con un máximo de 8 decimales,
FE, CCFE, NRE, NCE.
1 Descuento se aplicará por (tern, en valores monetarios
NDE, FEXE FSEE
FE, CCFE, NRE. NCE,
2 Cuando no se aplique descuento debe colocar valor $0.00
Descuento | NDE, FEXE FSEE
por
89
ítem | FE, CCFE, NRE. NCE,
3. Descuento no podrá ser mayor al monto del ítem.
NDE. FEXE FSEE
FE, CCFE, NRE, NCE,
4 Cantidad en números separadas por punto.
NDE, FEXE y FSEE
1. Campo se aplicará por ítem, debe ser un valor monetario $0.00, cantidad en números, máximo FE. CCFE, NRE, NCE,
11 posiciones del valor entero separadas por punto, | NDE y CLE
FE, CCFE, NRE, NCE y
2. Será el resultado de ((Precio Cantidad) Descuento por ítem).
NDE
FE, CCFE, NRE, NCE,
3. Cuando no exista ventas no sujetas debe colocarse 50.00
NDE CLE
4. Para et CLE, cuando se relacione FE VI. CCFE V3, NCE V3 y NDE V3 será eI resultado de restar al
• Total de
operaciones Ventas no sujetas" - "Descuento global a Ventas no sujetas' contenidos en el CLE
documento ue se está (i uidando,
5. Los documentos F, CCF y ND recibidos satisfactoriamente se ingresarán en valores positivos y
CLE
Ventas | sumarán en el CLE
no
90
sujetas | 6, Cuando se detallen E CCF, ND anutados/invalidados se deberá ingresar con valor negativo y se
CLE
restará en el CLE,
7, Si el docurnento a informar es NC o Evento de retorno recibidos satisfactoriamente deberán
CLE
ingresarse en valores ne ativos se restará en eI CLE
8, Para el CLE cuando se detalle NCE V4, NDE V4 0 Evento de retorno VI debe ingresar el valor del
CLE
carnpo Total de operaciones Ventas no sujetas" contenido en el documento que se está liquidando.

9. Si el documento anulado/invalidado a informar es NC o Evento de retorno deberá ingresarse con
CLE
valor positivo.
10. Debetá ingresar $O.OO
a) Si en el docurnento relacionado el campo 'Total de operaciones no sujetas' es 50.00 | CIE y NRE
b) Cuando el documento a relacionar es FEX.

112

<!-- PAGE 113 / 137 (OCR) -->

CAMPO | VALIDACIONES PARA CAMPOS | DTE

11. Cuando se informen F. CCF y ND invalidados/anulados dentro de un mismo periodo deberá
ingresar en un ítem el documento en valor positivo y en un segundo ítem con valores negativos.
CLE
la NC y Evento de retorno deberá ingresar et primer ítem con valores negativos y el segundo
para
ítem con valores positivos.

12. Deberá ingresar 50.00 si 'Tipo de documento relacionado' está completo con 07-CR. | NDEy NCE

13. Cuando se detallen ventas no sujetas, la suma de los ítems para un mismo CCFE no puede ser
al resultado de: 'Total de operaciones no sujetas' 'Descuento global a ventas no sujetas' NDE y NCE
mayor
detalladas en el CCFE.
14. Se dará holgura de $ 0.01 por diferencias entre los cálculos en eI sistema del contribuyente y FE, CCFE. NRE, NCE,
Iaa licación de fórmula ara validación del cálculo de la A.T. | NDE CLE
1, Campo se aplicará por ítem, debe ser un valor monetario $0.00, cantidad en números, máximo FE, CCFE, NRE, NCE,
11 posiciones det valor entero separadas punto con un máximo de 8 decimales. | NDE y CLE
por
FE, CCFE, NERE, NCE y
2. Será eI resultado de [(Precio * Cantidad) - Descuento por ítem).
NDE
FE, CCFE, NERE, NCE,
3. Cuando no exista ventas exentas debe colocarse $O.OO
NDE y CLE

4. Para el CLE, cuando se relacione FE VI. CCFE V3, NRE V3, NCE V3 y NDE V3 será el resultado de
restar at *Totat de operaciones ventas exentas' - el «Descuento global a ventas exentas' contenidos CLE
en el documento que se está liquidando.

5. Los documentos F, CCF y ND recibidos satisfactoriamente se ingresarán en valores positivos y
CLE
sumarán en eI documento
6. Si el documento a informar es NC o Evento de retorno recibido satisfactoriamente deberá
CLE
ingresarse en valores negativos y se restará en el CIE.

7. Para et CLE cuando se detalle NCE V4, NDE V4 0 Evento de retorno VI debe ingresar el valor del
CLE
Totat de operaciones ventas exentas' contenido en el documento que se está liquidando.
campo
91 Ventas exentas 8. Cuando se informen F, CCF ND anutados/invalidados se deberá ingresar con vator negativo y
y | CLE
se restaré en el CLE.

9. Si et documento anulado/invalidado a informar es NC o Evento de retorno deberá ingresarse
CLE
con valor positivo,
10. Deberá ingresar $O.OO:
CLE y NRE
a) Si en et documento retacionado eI campo 'Totat de operaciones exentas' es $O.OO
b) Cuando el documento a relacionar es FEX.
i I. Cuando se informen F, CCF y ND invalidados/anulados dentro de un mismo período deberá
ingresar en un ítem el documento en valor positivo y en un segundo ítem con valores negativos,
CLE
para la NC y Evento de retorno deberá ingresar el primer ítem con valores negativos y el segundo
ítem con valores ositivos.
12. Deberá ingresar $0.00 si *Tipo de documento relacionado* está completo con 07-CR | NDE y NCE
13. Cuando se detallen ventas exentas, ta suma de los (tems para un mismo CCFE no puede ser
al resultado de: Total de operaciones exentas' - T)escuento global a ventas exentas' | NCE
mayor
detalladas en el CCFE
14. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y FE, CCFE. NRE, NCE.
la aplicación de fórnnuEa validación del cálculo de la A, T, | NDE y CIE
para
I. Campo se aplicará por ítem. debe ser un valor monetario $O.OO. cantidad en números, máximo FE. CCFE, NRC-, NCE.
11 posiciones del valor entero separadas punto con un máximo de 8 decimales. | NDE, CLE y FEXE
por
FE. CCFE, NRE, NCE,
2, Será el resultado de (CPrecio• -Cantidad') - "Descuento por ítem].
NDE FEXE
FE. CCFE. NRE, NCE y
S Cuando no exista ventas gravadas debe colocarse 50.00
NDE
92 Ventas gravadas
4. Será el resultado de restar al *Total de operaciones gravadas" - et 'Descuento global a Ventas
CLE
gravadas• detallado en et documento ue se está li u)dando.
5. Los documentos E CCF y ND recibidos satisfactoriamente se ingresarán en valores positivos y
CIE
sumarán en el documento.
6. Si eI documento a informar es NC o Evento de retorno recibidos satisfactoriamente deberá
CLE
ingresarse en valores ne ativos se restará en el CIE.

113

<!-- PAGE 114 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 114. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| *(cont. p. 113)* | *(cont.)* | 7. Cuando se detalle Evento de retorno debe ingresar el valor "Total de operaciones gravadas" contenido en el documento que se está liquidando. | CLE |
| | | 8. Cuando se informen F, CCF, ND anulados/invalidados se deberá ingresar con valor negativo y se restará en el CLE. | CLE |
| | | 9. Si el documento anulado/invalidado a informar es NC o Evento de retorno deberá ingresarse con valor positivo. | CLE |
| | | 10. Deberá ingresar $0.00 si "Total de operaciones gravadas" en el DTE relacionado también es $0.00 | CLE y NRE |
| | | 11. Cuando se detalle Evento de retorno aplicado a FE con "Ventas gravadas" utilizar este campo. No deberá ingresarse "Ventas gravadas" de Eventos de retorno aplicados a FEXE. | CLE |
| | | 12. Cuando se informen F, CCF y ND invalidados/anulados dentro de un mismo período deberá ingresar en un ítem el documento en valor positivo y en un segundo ítem con valores negativos, para la NC y Evento de retorno deberá ingresar el primer ítem con valores negativos y el segundo ítem con valores positivos. | CLE |
| | | 13. Deberá ingresar $0.00 si "Tipo de documento relacionado" está completo con 07-CR. | NDE y NCE |
| | | 14. Cuando se detalle NCE V4, NDE V4 y Evento de retorno V1 debe ingresar el valor "Total de operaciones gravadas" contenido en el documento que se está liquidando, sin IVA. | CLE |
| | | 15. Cuando se detallen ventas gravadas, la suma de los ítems para un mismo CCFE no puede ser mayor al resultado de: "Total de operaciones gravadas" – "Descuento global a ventas gravadas" detalladas en el CCFE. | NCE |
| | | 16. Cuando campo "Tipo de documento relacionado" en NCE esté completo con el código 07 la suma de los ajustes aplicados a un CRE no podrá exceder al valor contenido en el campo "Total monto sujeto a retención". | NCE |
| | | 17. Cuando se relacione FEXE en NRE deberá ingresar en este campo el valor de la exportación. | NRE |
| | | 18. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | FE, CCFE, NRE, NCE, NDE, CLE y FEXE |
| 93 | Exportaciones | 1. Cuando se detalle FEXE V1 y V2, deberá ingresar el valor detallado en el campo "Monto total de la operación". Cuando se detalle FEXE V3 en las que se ingresó "NIT por cuenta de Terceros", se ingresará el resultado de: "Total de operaciones gravadas" - "Descuento global a ventas gravadas" + "Seguro" + "Flete", contenidos en la FEXE V3 que se está liquidando, con excepción de la regla 2. | CLE |
| | | 2. Cuando se detalle FEXE V3 en las que NO se ingresó "NIT por cuenta de Terceros", pero sí ingresó "Nombre del Tercero" podrá ingresar valores >= $0.00.<br>El valor ingresado no deberá ser mayor al resultado de: "Total de operaciones gravadas" - "Descuento global a ventas gravadas" + "Seguro" + "Flete", contenidos en la FEXE V3 que se está liquidando. | CLE |
| | | 3. Cuando se detalle Evento de retorno aplicado a FEXE deberá ingresar el valor del campo "Suma de operaciones" contenido en el evento. | CLE |
| | | 4. Cuando se detalle Evento de retorno en los que NO se ingresó "NIT por cuenta de Terceros", pero sí ingresó "Nombre del Tercero" podrá ingresar valores >= $0.00.<br>El valor ingresado no deberá ser mayor al valor del campo "Suma de operaciones" contenido en dicho evento. | CLE |
| | | 5. Cuando no existan exportaciones deberá ingresar $0.00 | CLE |
| | | 6. Cuando se detallen FEXE con estado invalidado/anulado, deberá ingresar los valores monetarios en negativo. | CLE |
| | | 7. Cuando se detalle Evento de retorno aplicado a FEXE:<br>Si el Evento está invalidado este deberá ingresarse con valor positivo.<br>Si el Evento está validado este deberá ingresarse con valor negativo. | CLE |
| | | 8. Cuando se informe FEX o evento de retorno que primero estuvo activo y luego fue anulado o invalidado dentro de un mismo período, deberá ingresar en un ítem el documento con valor positivo o negativo según corresponda y en un segundo ítem el documento con signo contrario. | CLE |
| | | 9. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | CLE |
| 94 | Valor donado | 1. Campo se aplicará por ítem, debe ser un valor monetario > $0.00, cantidad en números, máximo 11 posiciones del valor entero separadas por punto con un máximo de 8 decimales. | CDE |
| | | 2. Será el resultado de [ ("Valor unitario" * "Cantidad") - ("Depreciación")]. | CDE |
| | | 3. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | CDE |
| 95 | Compras | 1. Campo se aplicará por ítem, debe ser un valor monetario >= $0.00, cantidad en números, máximo 11 posiciones del valor entero separadas por punto con un máximo de 8 decimales. | FSEE |
| | | 2. Será el resultado de [("precio unitario" * "cantidad") - "Descuento por ítem"]. | FSEE |
| | | 3. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | FSEE |
| 96 | Código del tributo | 1. Se valida códigos de acuerdo a catálogo CAT-015 "Tributos" contenidos en la sección 1 y 3. | CCFE, NRE, NCE y NDE |

114

<!-- PAGE 115 / 137 (OCR) -->

CAMPO | VALIDACIONES PARA CAMPOS | DTE

2. Para FE se valida códigos de acuerdo a catálogo CAT-015 'Tributos' contenidos en la sección I y
FE
3 exceptuando los códigos 20 y C3.
3. Para CLE se valida códigos 20, C3i 59, 71, DI, C8 y D5 de la sección 1 del catálogo CAT-015
CLE
Tributos',
CCFE, NRE, NCE, NDE.
4. Es requerido siempre que existan ventas gravadas > 50.00 | FEXE
CLE
FE, CCFE. NRE, NCE,
5. Este | podrá completarse con null cuando en el ítem se detallen Ventas no sujetas o exentas.
campo | NDE CLE
y
6. Debe completarse con null cuando campo" TIPO de ítem' esté cornpleto con el código 4 y el FE. CCFE, NRE, NCEy
valor det Ern uesto se detalle en ventas no su•etas o exentas. | NDE
7. Este | completará null. cuando se haga uso del | *Cargos/Abonos que no FE. CCFE, FEXE, NCE y
campo se | con | campo
afectan la base im onible'. | NCE
8. Este | se completará con null, cuando campo 'TIPO de ítem- esté completo con el código
carnpo
4.
9. Se completará con null cuando et campo Tipo de documento relacionado' se complete con
NCE y NDE
código 07.
10. En este | sólo se podrán ingresar los códigos de tributos de las secciones I y 3 del
campo | NCE NDE
y
catáto o CAT-015 Tributos" exceptuando el códi o C3.
11, Cuando se ingresen ventas gravadas y el documento a ajustar sea CCF es requerido se detalle
NCE y NDE
al rnenos el códi 0 20.
12. Debe ser null cuando:
a) Si hace uso de campo Cargos/Abonos que no afectan la base imponible-
b) Si en el CCFE a ajustar también es nutl.
NCE y NDE
c) Si 'Tipo de documento relacionado" contiene código 07.
d) Cuando campo Tipo de ítem' esté completo con el código 4 y se detalle los valores como
ventas no sujetas o exentas.
13. Este campo se completará con nulli

a) Cuando en el ítem se detalle 'Cargos/Abonos que no afectan la base imponible" | NRE
b) Cuando el documento que se relacione sea FEXE y el tipo de ítem sea 4.
c) Si se relaciona F o CCF se detalla ti de ítem 4 y se coloca como ventas no su•eta o exenta"
14. Se pueden ingresar varios códigos de tributos los cuales deberán ingresarse entre corchetes y FE, CCFE, NRE, NCE,
separados comas. | NDE, CLE y FEXE
por
15. Cuando | Tipo de ítem* contenga el código 4 con ventas gravadas debe ingresar el código
campo | CCFE, NCE NDE
y
20.
16. En este | sólo se podrán ingresar los códigos de tributos de ta sección L del catálogo CAT-
campo | CLE
015 "Tributos- ue se ha an a licado en el DTE informado,
17. Para el caso específico det CLE cuando et documento a liquidar sea F y esta posea ventas
CLE
ravadas deberá adicionarse et códi o del tributo 20 a ue los valores son re ueridos sin IVA.
18. Se deberán ingresar todos los tributos de la sección 1 que se encuentren detallados en el
CLE
documento informado.
19. Para CIE, cuando et documento a liquidar sea FE o Evento de retorno aplicado a esta y la misma
CLE
posea ventas gravadas, deberá adicionar el código 20,
20. Cuando la NRE se genere con documentos relacionados permitirá ingresar códigos de tributo
según el detalle siguiente.
NRE
a) Si es FE o CCFE permitirá ingresar códigos 20, 59, 71, DI, C8, 05 y 04
b) si es FEXE ermitirá ingresar el códi 0C3.
21, Cuando se detallen ventas gravadas que no correspondan a exportaciones y el tipo de ítem
NRE
sea diferente a 4 debe ingresar el código 20.
22. Cuando en et ítem se detallen ventas gravadas debe ingresar el código C3. | FEXE
23. Los emisores requieran hacer uso de los tributos FOVIAL y COTRANS (DI y C8) en FEXE
que | FEXE
deberán solicitarlo ustificarlo ara su autorización.
L Valor monetario $O,OO | FE y CCFE
Precio sugerido 2. Cuando aplique deberá detallarse por ítem a nivel informativo y no tendrá efectos en otros
97 | FE y CCFE
de venta cálculos.
3, Cuando no aplique deberá enviarse con $O.OO | FE y CCFE
abonos 1. Debe | valores monetarios positivos o negativos. | FE, CCFE, NCE, NDE y
Cargos/ | expresarse en
98 | FEXE
ue no afectan Estos valores deben in resarse dentro de los 2000 ítems det cuer o del documento.

115

<!-- PAGE 116 / 137 (OCR) -->

CAMPO | VALIDACIONES PARA CAMPOS | DTE

la base 2 Cuando no existan "Cargos/Abonos que no afectan la base imponible' deberá completarse et FE. CCFE, NCE, NDE y
irn onible cam o con valor $0.00 | FEXE
1. Cuando aplique será el resultado de Ventas Gravadas*l Z | NCE y NDE
99 EVA Percib\do
2 Debe ingresar $O.OO cuando ei documento a ajustar es CRE o el CCFE | IVA | NCE y NDE
no tenga percibido.
L Cuando aplique. deberá detallar valor mayor o igual a cero cuando ek campo "Tipo de documento NCE y NDE
relacionado" sea 07.
100 | IVA 13 % 2. La suma de los ajustes de "IVA 13 70' aplicados a un CRE no podrán exceder el valor del 'IVA 13 Z' NCE NDE
y
detallado en el CRE al ue sea lique el ajuste.
3. Cuando aplique. será el resultado de "Ventas Gravadas" * 13 % | NCE y NDE

1. Cuando aplique será el resultado de 'Ventas Gravadas' * I Z | NCE y NDE
2. La suma de los ajustes de '(VA Retenido' aplicados a un CCFE no podrán exceder eI valor del "IVA NCE y NDE
101 IVA Retenido Retenido- detallado en el CCFE ak ue se a li ue el ajuste.
3. La suma de los ajustes de 'IVA Retenido' aplicados a un CRE no podrán exceder el valor del 'Total NCE y NDE
IVA Retenido" detallado en et CRE al que se aplique el ajuste.
1 Campo requerido, este valor no se considera para efecto de la sumatoria del campo «valor de
tributo' que corresponda a {VA en la sección resumen del documento, ni tendrá efectos en otros FE y CIE
valores calculados.
2 Valor del carnpo será el resultado de: {CVentas gravadas por (tern" 11.13) * 13941.
3 Cuando se informe CCFE, NCE y NDE el valor de IVA por (tem estará dado por el cálculo de:
* | CLE
Ventas gravadas or item• 13%
4. Para el caso de la FE y Evento de retorno debe colocar el valor contenido en el campo "IVA 139C
CLE
de la sección resurnen.
102 IVA por ítern 5, Para el | los documentos
caso que | a liquidar sean CCFE, NCE y NDE se validará que et valor
calculado de EVA por ítem para el CLE, sea el mismo que el contenido en campo "Valor del tributo" CLE
asignados al códi 0 20 del catálogo CAT-015 Tributos'
6 Cuando la operación no sea afecta a IVA deberá detallar este cam o con valor 60,00 | FE CLE
7. Cuando et documento a liqu\dar informado se encuentre con estado invalidado/anulado, se
ingresará los valores de IVA en negativo. a excepción de NC/Evento de retorno que se ingresará con CLE
valores positivos.
8. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la
FE y CLE
a licación de fórmula ara validación del cálculo de la A.T.
1 Campo requerido. con eI valor sujeto a retención (sin IVA) del documento tributario que se está
CRE
detallando, ex resado en vatores ma ores a cero.
2 Cuando se relacionen documentos electrónicos deberá colocar los valores considerando 10
siguiente.
• | •
1} Para CCFE: Total de Operaciones Ventas Gravadas• Descuento | ventas | "
- | global a | gravadas
CRE
Monto sujeto a 2) Para FE: 'Total de Operaciones Ventas Gravadas' - 'Descuento global a ventas gravadas' a valor
103
retención neto, es decir, sin IVA [C Total de Operaciones Ventas Gravadas- - 'Descuento global a ventas
gravadas) /1,13}.
3. Deberá detallar el valor neto que fue sujeto de retención por cada documento detallado en cada
CRE
ítem. Hasta un máximo de 500 documentos.
4. Se dará holgura de ± S 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
CRE
la a licación de fórmula ara validación del cálculo de la A.T.
1. Campo requerido, por cada ítem se deberá Indicar el código de la retención de acuerdo a
CÓdigo | CRE
104 | catálogo CAT-006 *Retención IVA MH'
retención MH
2, Debe relacionar un códi o de retención r cada ítem. | CRE
1. Deberá detallar el monto de retención IVA efectuado en ei documento relacionado, el cual será
CRE
expresado en valores monetarios > $O.OO
105 IVA retenido 2. Es el resultado det *Monto Su'eto a retención- multi licado or eI rcenta•e legal. | CRE
3, Se dará holgura de $ 0,01 por diferencias entre los cálculos en el sistema del contribuyente y la
CRE
a licación de fórmula para validación del cálculo de la A T.
Fecha inicio del
1. Campo requerido, deberá indicar la fecha inicial del periodo a liquidar en el siguiente formato:
106 período de | DCLE
li uidación
Fecha fin del 1. Campo requerido. deberá indicar la fecha fin del período a liquidar en eI siguiente formato: YYYY-
DCLE
107 período de MM-DD.
liquidación 2. La fecha fin del per(odono uede anteceder a la fecha inicio de la li uidación, | DCLE

116

<!-- PAGE 117 / 137 (OCR) -->

VALIDACIONES PARA CAMPOS | DTE
CAMPO

1. Cuando se haga uso de este | se permitirá colocar el código de las liquidaciones según los
campo
Código de controles internos, | DCI-E
108
liquidación
Cuando no se haga uso de este campo se deberá ingresar null.

Cantidad de | DCLE
109 | 1. Cuando se haga uso de este campo debe colocar un número entero > O,
documentos
Valor de las
110 | 1, | expresado en valores monetarios > $O.OO | OCLE
operaciones a Campo requerido,
ti uidar
Valores no
111 | I. | opcional expresado en valores monetarios SO.OO | DCLE
sujetos a | Campo
erce ión
Descripción del | de tos
i. Podrá ingresar una breve descripción de las operaciones que identifiquen el origen | montos
112 valor sujeto | DCLE
no | a | deberá enviarse nutl.
no sujetos a percepción. Cuando no se haga uso de este campo | con
ercepctón
Observaciones | CLE OCLE
113 | 1. Cuando se utilice podrá ingresar un máximo de 1000 caracteres. | y
r ítem
L Cam uerido, expresado en valores monetarios > $O.OO | DCLE
r
Sub total 2. Será el resultado de restar et campo *Valor de las operaciones a liquidar' -"Valores no sujetos a
OCLE
erce iónn.
Monto sujeto a
115 percepción sin 1. Campo requerido, expresado en valores monetarios > $O.OO | DCLE
IVA
IVA de las
116 | 1. | requerido, expresado en valores monetarios > $O,OO | DCLE
operaciones a Campo
li uidar
I, Campo requerido, expresado en valores monetarios > $0,00 | DCLE
IVA percibido
117 | 2. Se dará holgura de $ 0.01 diferencias entre los cálculos en el sistema det contribuyente y la
por | DCLE
a ticación de fórmula ara validación del cálculo de la A.T.
118 Comisión L Con valor monetario $O.OO | DCLE

Porcentaje de 1. Podrá contener el porcentaje de ta comisiónt valor en números sin sfmbolo de porcentaje,
119 | OCLE
comisión Cuando no se haga uso de este cam o deberá in resar null.
1. Cam uerido, ex resado en valores monetarios $O.OO, | DCLE
IVA de la | or
120 | * | DCLE
comisión 2. Será et producto de: "Comisión* 13Z (IVA).
1- Cam o re uerido, expresado en valores monetarios > $000 | DCLE
2. Será el resultado de: 'Valor de las Operaciones a liquidar' — "Comisión' - 'IVA Percibido (27.)'
Valor líquido | DCLE
a
121 | 'IVA de la Comisión'.
pagar al afiliado
3. Se dará holgura de $ 0.01 diferencias entre los cálculos en el sistema det contribuyente y la
± | por | DCLE
a licación de fórmula ara validación del cálculo de la A.T.
Valor Letras 1, Puede indicar en letras el valor total a a ar, | DCCE
122 | en

Sección 9: RESUMEN
Esta sección contiene un resumen de la información det cuerpo del documento.
Se a licarán las reglas de redondeo hot ura contenidas en las reglas 72 literal b) 7.3 de esta Normativa

CAMPO | VALIDACIONES PARA CAMPOS | DTE
No.

l. Deberá contener la sumatoria de todos (os valores contenidos por ítem en et campo de •ventas FE. CCFE. NRE, NCE,
susetas". | NDE CIE
no
Total de | FE. CCFEt NRE, NCE,
123 operaciones no 2. Expresado en valores monetarios $O.OO | NDE CLE
y
sujetas | los cálculos el sistema det contribuyente la FE. CCFE, NRE. NCE,
3. Se dará holgura de $ 0.01 por diferencias entre | en | y
licación de fórmula ara validación det cálculo de la A. T, | NDE CLE
a
I. Deberá contener la sumatoria de todos los valores contenidos por ítem en el campo de 'Ventas FE, CCFE, NRE, NCE.
exentas'. | NDE y CLE
Total de
FE, CCFE, NRE, NCE.
124 operaciones 2. Expresado en valores monetarios $0.00
NDE CLE
exentas
3, Se dará holgura de ± $ 0,01 diferencias entre los cálculos en el sistema del contribuyente y la FE, CCFE, NRE, NCE.
por
licación de fórmula ara validación del cálculo de la A, T. | NDE CLE
a

117

<!-- PAGE 118 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

1 Deberá contener la sumatoria de todos los valores contenidos por ítem en el campo de "Ventas FE, CCFE, NRE. NCE,
gravadas- (suma de todas las o eraciones afectas realizadas ara FEXE) | NDE, CLE y FEXE
Total de
125 | 2, | FE, CCFE, NRE, NCE.
operaciones Expresado en valores monetarios
NDE. CLE FEXE
gravadas
3. Se dará holgura de ± $ 0 01 por diferencias entre los cálculos en el sistema del contribuyente la FE, CCFE, NERE, NCE.
y
a licación de fórmula ara validación del cálculo de la A. T, | NDE, CLE FEXE
1, Deberá contener (a sumatoria de operaciones de exportación realizadas (detallar únicamente
CLE
valores contenidos en el cam 'Ex ortaciones*).
Total de
2. Ex resado en valores monetarios sitivos o negativos, | CLE
126 operaciones de
3. Cuando no existan ventas or ex rtación deberá mostrar $0 00 | CLE
exportación
4, Se dará holgura de $ 0.01 por diferencias entre los cálculos en eI sistema det contribuyente
y
CLE
la a licación de fórmula ara validación del cátcu(o de la A.T.
L Deberá contener (a sumatoria de los campos Ventas- | FSEE
Total de 2. Ex tesado en valores monetarios > 50,00 | FSEE
127
operaciones 3. Se dará holgura de ± $ 0,01 por diferencias entre los cálculos en el sistema del contribuyente y
FSEE
la a licación de fórmula ara validación del cálculo de la A.T-
1. Deberá contener la sumatoria de los cam os 'Valor donado" | CDE
Total de la 2. Ex resado en valores rnonetarios > $0.00 | CDE
128
donación 3, Se dará holgura de $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente
y
CDE
ta aplicación de fórmula ara validación del cálculo de la A, T
FE, CCFE. NRE, NCE.
1, Campo requeridor expresado en valores monetarios > - - $o.co
NDE y CLE
2. Será el resultado de la sumatoria del total de operaciones "Total de operaciones no sujetas* + FE, CCFE. NRE, NCE
y
"Total de operaciones exentas" + "Total de o eraciones ravadas". | NDE
3. Será el resultado de la sumatoria del total de operaciones "Total de operaciones no sujetash +
Suma de
129 | "Total de operaciones exentas" + "Total de operaciones gravadas" + "Total de operaciones de
operaciones exportación".
CLE
Cuando los valores de los documentos que restan sean mayores que los documentos que suman,
se in resará $0 00
4. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente Ea FE, CCFE, NRE. NCE,
y
aplicación de fórmula para validación del cálculo de Ea A.T. | NDE CLE
y
Descuento 1. Cam re uerido con vatores monetarios 30,00 | FE. CCFE NRE
130 global a ventas
2 EI campo no podrá ser mayor a! campo Total de operaciones no sujetas'. | FE. CCFE NRE
no su etas | y
Descuento 1 Carn o re uerido con valores monetarios $O.OO | FE, CCFE NRE
131 global a ventas
2, EI campo no podrá ser rnayor al campo 'Total de operaciones exentas". | FE, CCFE NRE
exentas | y
Descuento 1 Cam o re uerido con valores monetarios 50.00 | FE, CCFE, NRE FEXE
132 global a ventas
2, EI campo no podrá ser mayor al campo "Totat de operaciones gravadas" | FE, CCFE. NRE FEXE
gravadas | y
Descuento 1. Cam o re uerido con valores monetarios 60,00 | FSEE
133 global at total de
2. EI | ai | • Total de
campo no podrá ser mayor campo | operaciones'. | FSEE
o eraciones
Porcentaje de 1 Cuando se haga uso, se expresará sin símbolo de porcentaje, | FE, CCFE, NRE FEXE
y
134
descuento
2. Cuando no tenga aplicación deberá ingresar 0.00 | FE, CCFE, | FEXE
y
FE. CCFE, NRE, NCE,
1 Este campo no tendrá efecto en los valores totales del documento.
NDE. FEXE FSEE
2. Las | FE. CCFE, NERE, NCE,
cantidades deberán expresarse en valores monetarios $O,OO
NDE, FEXE FSEE
Total de | •
135 | 3. Será el resultado de: -Descuentos por ítem' + Descuento global a ventas no sujetas* + 'Descuento
descuentos | FE, CCFE NRE
tobal a ventas exentas• + "Descuento lobat ventas ravacjas". | y
a
4. Debe contener la sumatoria de (os *Descuento por item• | NCD NDE
5. Será resultado de: T)escuento or ítem"+ Descuento lobal al total de o eraciones". | FSEE
6. Será el resultado de: "Descuento (tern " "Descuento
por + | lobal a ventas ravadas-. | FEXE
1, Deberá indicar de forrna consolidada eI código de los tributos que se aplicaron en el | FE, CCFE. NRE, NCE,
campo
"Códi o del tributo" det cuer del documento. | NDE. CLE FEXE
Resumen código | y
136 | FE, CCFE, NRE, NCE
del tributo 2. Deberá ser null cuando todos los campos 'Código del tributo' por (tem sean null-
NDE CLE
3. Deberá mostrar los códi de la sección 3 del | CAT-015 • Tributos•
os | catálogo | ara uso informativo. FE, CCFE FEXE
Nombre del 1. Campo requerido con el nombre del tributo que se detalla en el campo 'Resumen código del r-Er CCFE, NRE, NCE,
137
tributo tributo' | NDE, CLE FEXE

118

<!-- PAGE 119 / 137 (OCR) -->

No, CAMPO | VALIDACIONES PARA CAMPOS | DTE

2. Este | se repetirá tantas veces como códigos de tributos estén contenidos en el campo FE, CCFE, NERE, NCE,
campo
'Resumen código del tributo'. | NDE. CLE FEXE
FE, CCFE, NRE, NCE,
3. Deberá ingresar null cuando el campo 'Resumen códgo del tributo" también sea null.
NDE. CLE y FEXE
FE, CCFE, NRE, NCE,
I, Valor monetario 50.00 | CLE FEXE
NDE y
CCFE, NRE, NCE. NDE,
2. Campo será requerido siempre que existan ventas gravadas >$O.OO
CLE FEXE
3. Cuando aplique debe contener el cálculo consolidado de los tributos que se aplicaron en eI FE, CCFE. NRE, NCE,
'Códi Odel tributo' del cuer o del documento, se arado orti de tributo. | NDE, CLE FEXE
campo
FE. CCFE. NRE, NCE,
4. Cuando el campo 'Resumen código del tributo' sea null debe ingresar $O.OO
NDE y CLE
5. Deberá mostrar et cálculo consolldado de los tributos de la sección 3 del catálogo CAT-015 FE. CCFE, NCE, NDE y
'Tributos' ara uso informativo (no se sumarán a los totales). | FEXE
138 Valor de tributo
6. Condiciones para detallar tos DTE anutados/invalidados en et CIE:
a) Cuando se detallen F, CCF, ND y FEX anulados/invalidados se deberá ingresar con valor negativo
se restará en el CLE. | CLE
y
b) Si el documento a informar es NC o Evento de retorno anulados/invalidados se ingresarán en
valores sitivos sumarán en el CIE.
7. Cuando tos valores de los documentos que restan sean mayores que los documentos que
CLE
suman, se ingresará 50.00
8. Cuando eI | • Resumen códi del tributo* eI código C3 deberá ín resar $O.OO | NRE, CLE y FEXE
cam o | o | tenga
9. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y FE, CCFE, NRE, NCE,
la a Eicación de fórmula ara validación del cálculo de la A.T. | NDE, CLE y FEXE
I. Será et resultado de'. *Sumatoria de operaciones' *Descuento global a ventas no sujetas- -
FE, CCFE y NRE
"Descuento global a ventas exentas- - 'Descuento lobal a ventas gravadas"
2. Será el resultado de: "Totat de operaciones" 'Descuento global al totat de operaciones-. | FSEE
139 Sub total
3. Cam uerido, ex resado en valores monetarios $O.OO | FE, CCFE. NRE FSEE
o r
4 Se dará holgura de ± $ 0.01 por diferencias entre (os cátcutos en el sistema del contribuyente y
FE, CCFE. NRE y FSEE
la a licación de fórmula ara validación del cálculo de la A.T.
1. Campo requerido, deberá contener la sumatoria de todos los campos *Monto sujeto a retención";
Total monto | CRE
expresado en valores monetarios > $O.OO
140 sujeto a
2. Se dará holgura de $ 0.01 diferencias entre los cálculos en eI sistema del contribuyente y la
por | CRE
retención
a licación de fórmula ara validación del cálculo de la A.T.
1. Cuando a li ue a ventas gravadas deberá ingresar eI vator de IVA percibido IZ. | CCFE
2. Cuando no exista percepción debe ingresar $0.00 | CCFE y CLE
141 IVA Percibido 3. Deberá contener la sumatoria de la erce ióna licada en los documentos a li uidar. | CLE
4. Se dará holgura de $ 0.01 diferencias entre los cátculos en eI sistema del contribuyente y la
por | CCFE CLE
y
a licackón de fórmula ara validación del cálculo de la A T.
1. Cuandoa ue deberá ingresar el valor del IVA Retenido. | FE CCFE
2. Cam or ueridor ex resado en valores monetarios 50.00 | FE CCFE
142 IVA Retenido
3. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y
FE y CCFE
la aplicación de fórmula para validación del cálculo de la A. T,

L Deberá de contener el resultado de la suma de todos Eos valores por ítem contenidos en los campos
y NDE
•iVA Percibido'.
Total IVA
143
2. Carnpo requerido. Cuando no existan percepciones deberá mostrar $O.OO | NCE y NDE

1. Cuando et tipo de documento a ajustar sea 07-CRE deberá ingresar el mismo código del catálogo
Código | NCE y NDE
144 | CAT-006 "Retención IVA MH' contenido en dicho CRE.
retención MH
2, Cuando el ti o de documento a a•ustar sea 03CCFE deberá ingresar null. | NCE y NDE
NCE y NDE
I. Deberá de contener el resultado de Ea suma de todos los valores por ítem contenidos en tos campos
145 Total IVA •
IVA Retenkdo•.
existan retencEones deberá mostrar $O,OO | NCE y NDE
2. Campo requerido. Cuando no
1. Deberá contener el resultado de la suma de todos (os valores por ítem contenidos en tos carnpos
NCE y NDE
146 Total IVA 130/'0 *IVA
2. Cam ore uerido. Cuando no exista -IVA 13%' deberá mostrar $0.00 | NCE NDE
1. Cuando la operación esté sujeta a retención renta, deberá ingresar el valor expresado en valores
147 Retención renta | FSEE
monetarios $O.OO

119

<!-- PAGE 120 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 120. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| *(cont. p. 119)* | *(cont.)* | 2. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | FSEE |
| 148 | Seguro | 1. Cuando aplique, debe expresarse en valores monetarios >= $0.00 | FEXE |
| 149 | Flete | 1. Cuando aplique, debe expresarse en valores monetarios >= $0.00 | FEXE |
| 150 | Monto total de la operación | 1. Campo requerido, expresado en valores monetarios >= $0.00 | FE, CCFE, NCE, NDE, NRE, CLE y FEXE |
| | | 2. Deberá ingresar el resultado de: "Subtotal" + los valores contenidos en el campo "Valor de tributo". | FE, CCFE y NRE |
| | | 3. Cuando el documento a ajustar sea CCF deberá indicar la suma de los campos: "Suma de operaciones" + los valores contenidos en el campo "Valor de tributo". | NCE y NDE |
| | | 4. Deberá ingresar la suma de los campos: "Suma de operaciones" + los valores contenidos en el campo "Valor de tributo". | CLE |
| | | 5. Cuando el documento a relacionar sea CRE se deberá ingresar el valor del campo "IVA retenido" que se detalle en la NCE o NDE. | NCE y NDE |
| | | 6. Deberá ingresar la suma de los campos: "Total de operaciones gravadas" - "Descuento global a ventas gravadas" + "Seguro" + "Flete" + los valores contenidos en el campo "Valor de tributo".<br>Se excluyen de este campo los valores calculados para los tributos de uso informativo de la sección 3 del catálogo CAT-015 "Tributos". | FEXE |
| | | 7. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | FE, CCFE, NCE, NDE, NRE, CLE y FEXE |
| 151 | Total cargos / abonos que no afectan la base imponible | 1. Contendrá la suma de los campos "Cargos/abonos que no afectan la base imponible". Permitirá valores negativos y positivos (cuando sea cargo se suma y cuando sea abono se resta). | FE, CCFE, NCE, NDE y FEXE |
| | | 2. Cuando no existan "Cargos/abonos que no afectan la base imponible" se deberá completar con valor $0.00 | FE, CCFE, NCE, NDE y FEXE |
| | | 3. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | FE, CCFE, NCE, NDE y FEXE |
| 152 | Transferencias de bienes no onerosas | 1. Campo requerido, expresado en valores monetarios >= $0.00 | FEXE |
| | | 2. Valor no puede ser mayor al "Monto total de la operación". | FEXE |
| 153 | Total a Pagar | 1. Campo requerido expresado en valor monetario >= $0.00 | FE, CCFE, NCE, NDE FEXE y FSEE |
| | | 2. Será el resultado de: "Monto total de la operación" + IVA Percibido" –"IVA Retenido" +/- "Total cargos / abonos que no afectan la base imponible". | CCFE |
| | | 3. Será el resultado de: "Monto total de la operación" + "Total IVA Percibido" – "Total IVA Retenido" +/- "Total cargos / abonos que no afectan la base imponible". | NCE y NDE |
| | | 4. Será el resultado de: "Monto total de la operación" – "IVA Retenido" +/- "Total cargos / abonos que no afectan la base imponible". | FE |
| | | 5. Será el resultado de: "Monto total de la operación" +/- "Total cargos / abonos que no afectan la base imponible ". | FEXE |
| | | 6. Será el resultado de: "Sub total" – "Retención Renta". | FSEE |
| | | 7. Cuando existan abonos a favor del receptor y el resultado dé un valor negativo, deberá ingresar $0.00 | FE, CCFE y FEXE |
| | | 8. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | FE, CCFE, NCE, NDE FEXE y FSEE |
| 154 | Total | 1. Campo requerido, expresado en valores monetarios >= $0.00 | CLE |
| | | 2. Será el resultado de: "Monto total de la operación" + "IVA percibido liquidado". | CLE |
| | | 3. Cuando los valores ingresados por documentos anulados/invalidados fuera mayor al valor consolidado de los documentos recibidos satisfactoriamente, en este campo se ingresará $0.00 | CLE |
| | | 4. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | CLE |
| 155 | Total IVA retenido | 1. Será el resultado de la suma de los campos "IVA retenido", expresado en valores monetarios > $0.00 | CRE |
| 156 | Valor en letras | 1. Cuando se ingrese solo se validará formato alfanumérico | FE, CCFE, CRE, NRE, NCE, NDE, CLE, FEXE, FSEE y CDE |
| | | 2. Podrá ingresar campo null. | FE, CCFE, CRE, NRE, NCE, NDE, CLE, FEXE, FSEE y CDE |

120

<!-- PAGE 121 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

1. Ex resado en valores monetarios $O.OO | FE CRE
2. Campo requerido de uso informativo, deberá contener la sumatoria de todos los campos 'IVA por
ítem' - el IVA del cam o 'Descuento global a ventas gravadas'.
3. Cuando la operación no sea afecta a IVA 13% según art. 162 inciso 70 del Código Tributario,
CRE
157 | IVA | deberá in resar este campo con valor 30.00
4. Cuando campo 'Código retención MIH- tenga eI código C4 será el resultado de -Monto sujeto a CRE
retención• * 1370.
5. Se dará holgura de ± $ 0,01 por diferencias entre los cálculos en el sistema del contribuyente y la
FE y CRE
a licación de fórmula ara validación del cálculo de la A.T.
1. Permitirá et in reso de valores monetarios ne ativos ara refle•ar eI saldo a favor del receptor. FE, CCFE y FEXE
158 Saldo a Favor
2. Cuando no se haga uso se debe com letar con 50.00 | FE, CCFE y FEXE
FE, CCFE. NCE, NDE.
1. Debe ingresar codificación de acuerdo a catálogo CAT-016 "Condición de la operación'
FEXE y FSEE
Condiclón de la
159
operación | FE, CCFE, NCE, NDE,
2. Si el total a pagar en eI documento fuera 50.00 0 posea saldo a favor deberá ingresar et código L
CLE, FEXE y FSEE
FE, CCFE. FEXE, FSEE y
I- Podrá ingresar et código de la forma de pago de acuerdo al catálogo CAT-017 'Forma de pago"
CDE
2. Puede contener 'n' formas de pago, para las cuales deberá repetirse desde el campo "Condición
FE, CCFE. FSEE y
de la operación' hasta et campo *Referencia modalidad de pago* por cada forma de pago que se
CDE
indique.
3. Cuando en la operac4ón resulte saldo a favor deberá seleccionar el código 99 del catálogo CAT-
FE, CCFE y FEXE
Código de forma 017 Torma de pago-
160
de pago
la | " esté lleno el | 1 3
4. Será requerido cuando el campo 'Condición de operación | con código 0
FE, CCFE, FSEE y FEXE
según catálogo CAT-016 'Condición de ta operación-

5, Deberá ingresar | null cuando campo -Condición de la operación' esté lleno con código 2, FE, CCFE, FSEE y FEXE
campo

6. Deberá ingresar campo null cuando campo 'Tipo donación* esté lleno con código 2 0 3 según
CDE
catálo o CAT-016 Condición de la o eración•.
FEXE, FSEE y
1. Cuando aplique deberá expresarse en valores monetarios $O.OO
CDE
2. Deberá indicar eI valor aplicado con cada forma de pago descrita en el campo 'Código de fotfna FE. CCFE, FEXE, FSEE y
de ago- | CDE
Monto | 3. Cuando | "Tipo donación" esté lleno con código 2 0 3 deberá completar este campo con FE. CCFE, FEXE, FSEE y
por | campo
161 | CDE
forma de pago $o.oo
4. La suma de este campo deberá ser et resultado del campo Total a pagar'. Para et caso del CDE FE. CCFE, FEXE, FSEEy
debe dar como resultado eI cam 'Total de la donación'. | COE
5. Podrá in resar $0,00 cuando 'Referencia de modalidad de ago' sea null. | CDE
6. Debe in resar $O.OO cuando el cam o *Condición de la o eraciórf contenga el código 2. | FE, CCFE, FEXE FSEE
1. Se validará con cam onutl cuando cam 'Ti ode donación" esté com leto con códi 020 3. CDE
Z Podrá ingresar 'Referencia de nnodalidad de pago' de la donación cuando campo *Tipo donación'
CDE
este corn leto con código 1,
Referencia de
3. Se validará campo nullt cuando campo "Código de forma de pago" esté completo con el código
162 modalidad de | CDE
01
pago | de cuando el | 'Condición de la operaciórf
4. Podrá ingresar 'Referencia de modalidad pago' | campo
FE. CCFE, FEXE y FSEE
conten a los códigos 1 0 3,
5. Debe in resar null cuando el carn o "Condición de la o eración• contenga el código 2. | FE, CCFE, FEXE FSEE
I. Cuando a ti ue deberá in resar ei ti ode plazo de acuerdo al catáto o CAT-018 'Plazo' | FE, CCFE, FEXE FSEE
163 | Plazo | 2. Es re uerido cuando en et carn o *Condición de la o eración• se ha a in resado el códi 02. FE. CCFE, FEXE FSEE
3. Cuando eI cam o -Condición de lao eración- conten a los códigos 103 odrá in resar null. FE. CCFE, FEXE y FSEE
1. Cuandoa li ue deberá ingresar el número de días, meses o años en ue se otorga el lazo. FE, CCFE, FEXE FSEE
2. Es re uerido cuando en et cam o "Condición de la o eración• se ha a in resado el código 2. FE, CCFE, FEXE FSEE
164 Período de plazo
3. Cuando el | 'Condición de la operación' contenga los códigos 1 0 3 podrá ingresar null. | CCFE, FEXE y FSEE
campo
Número de pago
165 | 1. De no hacer uso del | debe ingresar null. | FE, CCFE, NDE y FEXE
campo
electrónico
1. Campo requerido cuando en el campo 'Tipo de exportación* se ingrese el código 1 y deberá
FEXE
166 INCOTERMS ingresar la codificación de acuerdo al catálo o CAT-031 "INCOTERMS'
2. Se validará campo null s; en et cam 'Ti ode ex ortación• se ingresa el códi 02. | FEXE

121

<!-- PAGE 122 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

1, Campo requerido cuando en el carnpo *Tipo de exportación' se ingrese et código 1 y deberá
Descripción | FEXE
167 | in resar ta descripción de acuerdo al catálo o CAT-031 -INCOTERMS'
INCOTERMS
2. Se vaftdará | null si eI | I' Ti de | in el
cam o en cam | exportación" se resa código 2. | r-EXE
FE, CCFE y NRE, NCE,
168 Observaciones 1. De no hacer uso del campo debe ingresar null | NDE, CRE, CLE, FEXE
y
FSEE

Sección 10: EXTENSIÓN
Detalta los datos enerates del res onsable de enerar el DCLE

No. CAMPO | VALIDAC(ONES PARA CAMPOS | DTE

Nombre del
169 responsable de 1. Este campo será requerido con el Nombre del responsable que realiza ta liquidación a los afiliados, DCLE
generar el DTE
Documento de
identificación de 1, Este campo será requerido con eI número de documento de identificación del responsable que
170 | DCLE
quien genera eI realiza la liquidación a los afiliados,
DTE
Código de
empleado
171 | 1 De no hacer uso del campo debe ingresar null- | DCLE
responsable de
la (i uÉdación

Sección 11: APÉNDICE
Esta | es opcional y se encuentra a disposición para incluir cualquier información adicional.
Podrá ingresarse desde 1 hasta un máximo de 10 veces, completando todos los campos.
De no hacer uso de la sección debe ingresar null.

No. CAMPO | VALIDACIONES PARA CAMPOS | DTE

FE, CCFE, NRE, NCE
Nombre del
172 | 1, De no hacer uso del campo debe ingresar null | NDE. CRE. OCLE, CLE
campo
FEXE, FSEE CDE
FE, CCFE, NRE, NCE.
173 Descripción 1 De no hacer uso del campo debe ingresar null | NDE. CRE. DCLE, CLE
FEXE. FSEE CDE
FE, CCFE, NRE, NCE,
174 Vator/dato 1 De no hacer uso del campo debe ingresar null. | NDE, CRE, DCLE. CIE,
FSEE y CDE

Sección 12: SELLO DE RECEPCIÓN

No. CAMPO | SELLO DE RECEPCIÓN | DTE

No es una sección ni un campo de tos documentos tributarios transmitidos a la Administración
Tributaria. | FE, CCFE, NRE, NCE.
Sello de | NDE, CRE, OCLE,
175
Recepción No obstante, deberá incorporar et Sello de Recepción enviado por ta Administración Tributaria CIE, FEXE, FSEE y
en el Archivo DTE que entregue al receptor (exceptuando las operaciones generadas en CDE
Contin encía).

122

<!-- PAGE 123 / 137 (OCR) -->

ANEXO V
VALIDACIONES PARA CAMPOS EVENTOS

Sección 1: IDENTIFICACION DEL EVENTO
Sección donde se detallan las generales del evento ue se está transmitiendo.

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

Retorno y
1. Campo requerido con versión vigente, debe ingresar 1. | Operaciones
1 | Versión | es eciales
Invalidación y
2. Campo requerido con versión vigente. debe ingresar 3.
Contingencia
Invalidación,
Contingencia,
Ambiente de
2 | 1. Carnpo requerido, con código según catálogo CAT-OOI 'Ambiente de destino' | Retorno y
destino
Operaciones
es eciates
I. Deberá in resar et código de acuerdo al catálo o CAT-003 *Modelo de facturación• | Retorno
Operaciones
2 Únicamente permitirá código 1.
Modelo de | es eciates
3
Facturación | Retorno y Operaciones
3. Deberá ingresar el código 1 con 'Tipo de transmisión' normal,
es eciales
4. En contingencia deberá in resar el código 2. | Retorno
I. Debe ingresar código de acuerdo al catál o CAT-004Ti de transmisión' | Retorno
Tipo de | Retorno y Operaciones
4 | 2. Debe utitizar el código 1 con *Modelo de facturación' previo.
transmisión | es eciales
S En contin encia deberá ingresar et código 2. | Retorno
1. Se validará carnpo null. si el cam o 'Ti de transmisón• tiene et código 1. | Retorno
Tipo de
5 | 2. Si el campo *Tipo de transmisión' tiene eI código 2 debe etegir el tipo de contingencia según
contingencia | Retorno
catálogo CAT-005 Ti o de contin encia•
I, Será requerido si el campo *Tipo de transmisión' está completo con el código 2 y el campo
Retorno
'Ti o de contingencia' contiene el códi 0 5,
Motivo de 2. Se validará campo null cuando:
6
Contingencia a) Si en et campo 'Tipo de transmisión' se ingresa el código 2 y en el campo 'Tipo de
Retorno
contingencia' se ingresa uno de los códigos del 1 al 4.
b) Si el | • T] ode transmisión' ingresa el códi 01.
en cam o | se
Invalidación,
1. Campo requerido, se valida que cumpla con ta estructura definida por la AT, bajo el estándar (JUD Contingencia.
Retorno

Se valida que la estructura posea números y letras mayúsculas, | Operaciones
es eciales
7 | Código de
invalidación,
generación | Contingencia,
Retorno
2. Código de Generación debe ser único y universal.

Operaciones
especiales
I. Se deberá ingresar el código 18. | Retorno
8 Tipo de evento | Operaciones
2. Se deberá ingresar el código 17.
es eciales
Retorno,
Operaciones
1. Campo requerido, formato de fecha YYYY-MM-DD.
especiales e
Invalidación
2. En caso de ser necesario, se validará que la fecha del evento sea hasta 5 días posteriores a la
fecha de transmisión del mismo, Esta condición no aplicará si la fecha sobrepasa al siguiente
período tributario.
Retorno
9 Fecha del evento
Nota: Para el último día de mes no aplica holgura de fecha con 5 dias posteriores el máximo plazo
sterior serán 30 min.
Operaciones
3. En caso de ser necesario, se validará cuatquler fecha que anteceda.
especiales
4. Cuando se invaliden DTE diferentes a FE, FEXE, FSEE o Eventos, deberá ingresar la misma fecha
Invalidación
detallada en el cam o Techa de Generación- o" Fecha del evento' det DTE o Evento a invalidar,
5. Cuando el evento se aplique a FE, FEXE o FSEE podrá ingresar fecha del evento con un máxirno | Invalidación y
de tres meses osteriores a la fecha de eneración detallada en eI DTE al uea li ue et evento. | Retorno

123

<!-- PAGE 124 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 124. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| *(cont. p. 123)* | *(cont.)* | 6. Cuando el evento se aplique a FE, FEXE o FSEE se validará que la fecha de transmisión del evento no exceda a 3 meses en relación a la fecha de transmisión del DTE a invalidar (fecha en que fue otorgado el Sello de Recepción). | Invalidación y Retorno |
| | | 7. Cuando el evento se aplique a FE o FEXE podrá ingresar fecha de transmisión del evento con un máximo de dos años posteriores a la fecha de transmisión del DTE al que aplique el evento, si el DTE posee en el campo "Código de Actividad Económica (emisor)" uno de estos códigos 21001, 21008, 46482, 46484, 46491 o 47721. | Invalidación y Retorno |
| | | 8. Cuando se invaliden DTE diferentes a FE, FEXE, FSEE o Eventos, se validará que la fecha de transmisión del evento no exceda a 10 días hábiles posteriores al periodo en que fue otorgado el Sello de Recepción al documento/ evento a invalidar. | Invalidación |
| 10 | Fecha del evento de contingencia | 1. Campo requerido con formato de fecha YYYY-MM-DD. | Contingencia |
| | | 2. No se aceptarán fechas que antecedan a la transmisión del evento. | Contingencia |
| | | 3. La fecha de transmisión del evento no deberá exceder a 24 horas en referencia a la hora que se dio por finalizado el cese de la situación de fuerza mayor que impidió la transmisión de los DTE. | Contingencia |
| 11 | Hora del evento | 1. Campo requerido, se valida que cumpla con la estructura de hora de generación. Formato HH:MM:SS (Formato 24 horas). | Invalidación, Retorno y Operaciones especiales |
| | | 2. Para el último día del mes se tendrá una holgura de 30 minutos posteriores a la hora del evento por posibles diferencias entre la hora de transmisión del contribuyente y la hora del sistema de la AT | Invalidación, Retorno y Operaciones especiales |
| 12 | Hora del evento de contingencia | 1. Campo requerido con estructura de hora HH:MM:SS (Formato 24 horas).<br>Debe ingresar la hora del evento de contingencia. | Contingencia |
| | | 2. Para el último día del mes se tendrá una holgura de 30 minutos posteriores a la hora del evento por posibles diferencias entre la hora de transmisión del contribuyente y la hora del sistema de la AT. | Contingencia |
| 13 | Fusiones y otros | 1. Se validará campo null | Invalidación y Retorno |
| | | 2. Cuando aplique debe ingresar NIT. | Invalidación y Retorno |
| 14 | Tipo de Moneda | 1. Campo requerido se valida tipo de moneda USD. | Retorno y Operaciones especiales |

Sección 2: DOCUMENTOS RELACIONADOS

Esta sección es requerida para el Evento de retorno. En esta debe hacer referencia a los documentos a los que será aplicado el Evento. Haciendo uso de esta Sección podrá relacionar un máximo de 50 documentos, en un máximo de 2000 ítems o líneas.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | DTE |
|---|---|---|---|
| 15 | Tipo de DTE | 1. Deberá ingresar el código del documento al que aplicará el evento, según catálogo: CAT-002 "Tipo de Documento/Evento".<br>Únicamente aplicarán para este evento los códigos 01, 11 y 14. | Retorno |
| | | 2. Podrá detallar un máximo de 50 documentos del mismo tipo (no puede relacionar DTE de diferente tipo). | Retorno |
| 16 | Código de Generación del DTE | 1. Debe ingresar el Código de Generación del DTE al que aplicará el evento. | Retorno |
| | | 2. Campo requerido con el Código de Generación del DTE al que aplicará el evento. | Retorno |
| | | 3. El documento relacionado debe tener Sello de Recepción. | Retorno |
| | | 4. El Código de Generación relacionado debe corresponderse con la información del emisor y receptor descritos en el evento. | Retorno |
| | | 5. Podrá detallar el Código de Generación una sola vez por evento. El evento aplicará una sola vez por documento relacionado. Sin embargo, se podrán generar los eventos que sean necesarios relacionar a un mismo documento. | Retorno |
| | | 6. Solo permitirá ingresar Códigos de Generación que correspondan a FE, FEXE o FSEE. | Retorno |
| | | 7. Podrá detallar un máximo de 50 documentos del mismo tipo (no puede relacionar DTE de diferente tipo). | Retorno |
| 17 | Fecha de Generación | 1. Debe ingresar la fecha de generación contenida en el DTE al que aplicará el evento. | Retorno |
| | | 2. Solo permitirá ingresar Fechas de Generación que correspondan a FE, FEXE o FSEE. | Retorno |

Sección 3: IDENTIFICACIÓN DEL EMISOR

Esta sección describe los datos del emisor del Evento, los cuales deben ser los mismos detallados en el DTE al que se aplique el evento.

Para los casos de establecimiento y punto de venta debe detallarse la información desde donde se transmite el evento, no necesariamente la contenida en el DTE.

124

<!-- PAGE 125 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

Invalidación,
Contingencia,
1. EI contribuyente debe estar autorizado como emisor de DTE. | Retorno y
Operaciones
es eciales
18 NIT (Emisor) | Invalidación.
Retorno y
2. Debe coincidir con el NIT del emisor contenido en el DTE al que aplicará el evento.
Operaciones
es ciales
Operaciones
3. Deberán emitir eI Evento de Operaciones especiales los contribuyentes designados por la A.T.
es eciales

Invalidación.
Contingencia,
19 Nombre (Emisor) 1. Deberá detallar eI Nombre, denominación o razón social det contribuyente emisor. | Retorno y
Operaciones
especiales

Nombre del
20 responsable del 1. Deberá detalEar el nombre del responsable del establecimiento que informa el evento, | Contingencia
establecimiento
Tipo de 1. Deberá ingresar el código que corresponda al tipo de documento de identificación del
el | de acuerdo | CAT-022 a de Contingencia
21 documento de responsable del establecimiento que informa evento, | a catálogo | TIPO
identificación. documento de identificación'.
Número de
I, Deberá ingresar el número de documento de identificación del responsable del establecimiento
22 documento de | Contingencia
que informa el evento.
identificación
Tipo de
23 establecimiento 1. Deberá ingresar codificación según catálogo CAT-009 'Tipo de Establecimiento' | Contingencia
(Emisor)
Código del I. Deberá ingresar el código de Casa matriz, Sucursal, Bodega, Patio, que la Administración Tributaria
Invalidación,
establecmiento le asigne.
24 | Contingencia y
asignado por el
Retorno
Valida estructura ara establecimientos MH (MOCO, SOOO, 8000, POOO).
Código del
establec¿miento 1. Este campo es opcional, cuando desee ingresar et código det establecimiento que utilice eI Invalidación y
25
asignado por et contribuyente internamente. | Retorno
contribu ente
Código det
Punto de Venta | Invalidación,
26 | (Emisor} 1. Deberá ingresar el código del punto de venta otorgado por MH. | Contingencia y
asignado por et | Retorno

Código det
Punto de Venta
1. Este campo es opcional, cuando requiera ingresar eI código del Punto de Venta que utilice el Invalidación y
(Emisor) | Retorno
contribuyente internamente,
asignado por eI
contribu ente
1. Campo requerido, Cuando el evento se aplica a FEXE y en el campo "Tipo de exportación" se
Retorno
in rese el código 1, deberá indicar el recinto fiscal se ún catálo o CAT-027 'Recinto fiscal"
2. Cuando eI | FEXE eI | • de exportación* | el código 2,
evento se aplica a y en campo Tipo | se ingrese
28 Recinto fiscal | Retorno
deberá ingresar null.
3, Cuando eI evento se aplica a FE o FSEE deberá ingresar null. | Retorno
I. Campo requerido. Cuando en el carnpo 'TIPO de exportación- se ingrese eI código 1 deberá indicar
Retorno
el códi o det Ti ode régimen conforme al catálo o CAT-033 Ti ode Ré Imen'
29 Tipo de Régimen
2. Cuando et | • de exportación" | el código 2, deberá ingresar null. | Retorno
en carnpo Tipo | se ingrese
I. Campo requerido. Cuando en el campo 'Tipo de exportación• se ingrese el código 1 deberá indicar
Retorno
eI códi o del Ré imen de ex ortación conforme al catálogo CAT-028 'Ré imen•
Régimen de 2. Cuando el evento se aptica a FEXE y en et campo Tipo de exportación- se ingrese el código 2,
30 | Retorno
exportación deberá in resar null.
3. Cuando el evento se aplica a FE o FSEE deberá ingresar null- | Retorno

125

<!-- PAGE 126 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 126. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 31 | Tipo de exportación | 1. Cuando el evento se aplica a FEXE debe ingresar uno de los códigos del catálogo CAT-011 "Tipo de ítem" (No aplican los códigos 3 o 4). | Retorno |
| | | 2. Cuando el evento se aplica a FE o FSEE deberá ingresar null. | Retorno |
| 32 | Teléfono (Emisor) | 1. Campo requerido, tendrá una longitud mínima de 8 y máxima de 30 caracteres | Invalidación y Contingencia |
| 33 | Correo electrónico (Emisor) | 1. Campo requerido, estructura de correo electrónico con dominio de nivel superior válido. | Invalidación y Contingencia |

Sección 4: INFORMACIÓN DEL DOCUMENTO/ EVENTO EN CONTINGENCIA

Esta sección contiene la información detallada del documento/ evento en contingencia.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 34 | N° de ítem | 1. Formato de números correlativos mayores a cero, tendrá un máximo de 1000 ítem. | Contingencia |
| | | 2. Número entero sin punto y sin decimales. | Contingencia |
| 35 | Tipo de documento en contingencia | 1. Debe contener el código del tipo de documento generado en contingencia de acuerdo al catálogo CAT-002 "Tipo de documento/Evento". | Contingencia |
| | | 2. Solo aplicarán en contingencia los siguientes documentos/Evento: 01-FE, 03-CCFE, 04-NRE, 05-NCE, 06-NDE, 07-CRE, 11-FEXE, 14-FSEE y 18-Evento de retorno. | Contingencia |
| 36 | Código de generación del documento | 1. Campo requerido, se valida que el código de generación sea único por documento, con una longitud de 36 dígitos incluyendo guiones. Debe cumplir con la estructura definida por la AT, UUID v4.<br>Se valida que la estructura tenga números y letras mayúsculas. | Contingencia |
| | | 2. No debe ingresar DTE/Evento que tengan Sello de Recepción o se encuentren invalidados. | Contingencia |
| | | 3. Podrá ingresar hasta un máximo de 1000 Códigos de Generación de documentos/Eventos generados en contingencia, detallando un Código de Generación por cada ítem.<br>Se podrá informar en este evento los diferentes tipos de documentos/Eventos generados en contingencia (no necesariamente deben ser del mismo tipo). | Contingencia |

Sección 5: MOTIVO DE LA CONTINGENCIA

En esta sección se deberá ingresar los datos que identifiquen el motivo y el período en qué ocurrió la causa de fuerza mayor que imposibilitó la transmisión en línea de los documentos/ evento a la AT.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 37 | Fecha inicio de contingencia | 1. Campo requerido, deberá ingresar fecha en que inicio la contingencia con formato YYYY-MM-DD. | Contingencia |
| 38 | Fecha fin de contingencia | 1. Campo requerido, deberá ingresar la fecha de finalización de contingencia con formato YYYY-MM-DD. | Contingencia |
| | | 2. Fecha fin debe ser mayor o igual que la fecha inicio de contingencia. | Contingencia |
| 39 | Hora inicio de Contingencia | 1. Campo requerido, debe ingresar hora en que dio inicio la contingencia en formato HH:MM:SS (Formato 24 horas). | Contingencia |
| 40 | Hora fin de contingencia | 1. Campo requerido, debe ingresar hora en que finalizó la contingencia en formato HH:MM:SS (Formato 24 horas). | Contingencia |
| | | 2. Hora fin debe ser mayor que la hora inicio de contingencia. | Contingencia |
| 41 | Tipo de Contingencia | 1. Campo requerido, con el código según catálogo CAT-005 "Tipo de Contingencia". | Contingencia |
| 42 | Motivo de Contingencia | 1. Será requerido cuando el campo "Tipo de Contingencia" esté lleno con el código 5. | Contingencia |
| | | 2. Podrá ingresar campo null si el código del campo "Tipo de contingencia" es diferente a 5. | Contingencia |

Sección 6: DETALLE DE APLICACIÓN DEL EVENTO

126

<!-- PAGE 127 / 137 (OCR) -->

Hace referencia a los datos de los documentos/ eventos a tos que se le aplica el eventos La información de esta sección
debe tener corres ondencia con los datos ue identifican at DTE/ Evento las generales del rece tor.

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

1. Deberá indicar el código del documento a aplicar et evento, según catálogo: CAT-002 'Tipo de
43 Tipo de DTE | Invalidación
Documento/Evento•.
1. Debe in resar el Código de Generación contenido en el documento/evento al uea ti ue. | Invalidación
2. EI documento/evento al aplique debe tener Sello de Recepción | Invalidación
que
3. Cuando ingrese Códigos de Generación de CCFE o CRE estos no deberán estar ajustados con
Código de
NCE o NDE (si es necesaria la invalidación deberá primero invalidar tas NCE o NDE para | Invalidación
44 generación
osteriormente invalidar et CCFE o CRE).
aplicado
4. Cuando ingrese Códigos de Generación de FE, FEXE o FSEE estos no deberán de tener aplicado
un Evento de retorno (si es necesaria la invalidación deberá primero invalidar el Evento para | Invalidación
osteriormente invalidar la FE, FEXE o FSEE).
Sello de | Invalidación
45 | I. Deberá ingresar el Sello de Recepción contenido en el documento/evento que se está invalidando.
Recepción
1. Deberá ingresar el Número de Control del documento/evento a invalidar. | Envalidación
Número de
46
control 2, Deberá enviarse null, cuando el | TEPO de DTE- esté lleno con el código 16, 17 018. | Invalidación
carnpo
1. Deberá ingresar la fecha contenida en el campo 'Fecha de generación' del docurnento o el campo
Invalidación
Techa det evento* que se invalida; con formato YYYY-MM„DD.
2. Cuando el documento a invalidar sea CCFE, CRE. NCE o NDE la invalidación debe transmitirse
dentro de un plazo máximo de 1 dia posterior al otorgamiento del Sello de Recepción del | Invalidación
documento a invalidar.
3. Cuando eI documento a invalidar sea CLE o DCLE la invalidación debe transmitirse dentro de un
Fecha de | Invalidación
47 | plazo máximo de 10 días hábiles del mes siguiente al período tributario en que el documento a
generación | ción.
invalidar obtuvo el Sello de Rece
4. Cuando el documento/ evento a invalidar sea NRE, CDE, Evento de retorno o Evento de
operaciones especiales, la invalidación debe transmitirse dentro de un plazo máxirno de 4 días | Invalidación
calendario siguientes at otor amiento del Sello de Rece ión del documento/evento a invalidar.
5. Cuando el documento a inva14dar sea FE, FEXE o FSEE, la invalidación debe transmitirse dentro de
Invalidación
3 meses contados a artir del otorgamiento del Sello de Rece ción del documento a invalidar.

1, Deberá ingresar el Código de Generación del nuevo DTE que reemplace al documento invalidado
cuando el | 'Tipo de Invalidación" contenga el código 1 0 3, con excepción de aplicación de | Invalidación
campo
ta regla 3,
Código de
generación que | haber obtenido | Sello de | Invalidación
48 | 2. EI DTE que reemplaza debe | previamente | Recepción
reemplaza at
invalidado 3. Se valida con null cuando el campo *Tipo de DTE a Invalidar' contenga los códigos 05, 08, 16.17
Invalidación
0 18
4 Deberá ingresar null cuando el campo 'Tipo de Invalidacón' contenga el código 2. | Invalidación
eI | del • de Documento de Identificación del receptor' Invalidación y
Tipo de L Deberá ingresar | código Tipo
documento de contenido en el documento/evento. | Retorno
49 | •
identificación 2. Deberá ingresar null si en el campo Tipo de Documento de Identificación det receptor' en la FE Invalidación y
(Receptor) o evento de retorno también es null. | Retorno
Número de 1. Deberá ingresar et número de *Documento de Identificación del receptore contenido en el Invalidación y
documento de documento/evento.
50 | Invalidación
Identificación 2. Deberá ingresar null. si en el carnpo "Tipo de Documento de Identificación det receptor* en la FE | y
(Rece tor) | evento de retorno también es null. | Retorno
o
1. Deberá ingresar Nombre. denominación o razón social del receptor. | Invalidación, Retorno
Nombre
51
(Receptor) 2. Podrá ingresar nutl si en la FE también es null- | Retorno
3. Podrá ingresar nutl si en la FE o Evento de retorno, también es null. | Invalidación
1. Deberá completar cuando el documento al que se aplique el evento sea FEXE. | Retorno
Código de país | CAT„020 'País' | Retorno
52 | 2. Deberá ingresar la codificación del país según catálogo
(receptor)
3. Deberá ingresar null cuando el documento al que aplique el evento sea FE o FSEE, | Retorno
Pais destino de 1. Cuando el documento al que se aplique el evento sea FEXE deberá Éngresar el nombre del país de
Retorno
53 la exportación destino de la ex ortación.
(receptor) 2. Deberá in resar null cuando el documento al que a lique el evento sea FE o FSEE. | Retorno
Teléfono | tnvalidación, Retorno
54 | 1. Podrá incorporar el número de tetéfono del receptor.
(Rece tor)

127

<!-- PAGE 128 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 128. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 55 | Correo electrónico (Receptor) | 1. Cuando se ingrese debe cumplir con estructura de correo electrónico con dominio de nivel superior valido. | Invalidación, Retorno |

Sección 7: VENTAS POR CUENTA DE TERCEROS

Esta sección deberá completarse cuando la venta es por cuenta de terceros.
Las ventas por cuenta de terceros deben ingresarse en documentos/ eventos separados de las operaciones propias.
Deberá completar con null cuando:
a) La operación es propia.
b) El evento se aplica a FSEE.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 56 | NIT por cuenta de tercero | 1. Deberá contener el mismo NIT contenido en el campo "NIT por cuenta de tercero", del DTE al que se aplique el evento. | Retorno |
| | | 2. Deberá ingresar null cuando:<br>a) El campo "NIT por cuenta de tercero" del DTE al que se aplique el evento sea null.<br>b) El documento al que se aplique el Evento de Retorno sea FSEE. | Retorno |
| | | 3. Debe contener el mismo número de "NIT por cuenta de tercero" contenido en el DTE al que se aplique el evento. | Retorno |
| 57 | Nombre del Tercero | 1. Deberá contener el mismo Nombre contenido en el campo "Nombre del Tercero", del DTE al que se aplique el evento. | Retorno |
| | | 2. Deberá ingresar null siempre que en el documento al que se aplique el evento también sea null. | Retorno |
| 58 | Domicilio Fiscal | 1. Deberá ingresar el mismo código que detalló en la FE o FEXE a la que se aplica el evento. | Retorno |
| | | 2. Se validará sección completa con null cuando:<br>a) En el documento a aplicar el evento no se detalle "Nombre del Tercero".<br>b) El documento a aplicar el Evento de Retorno es 14-FSEE. | Retorno |
| | | 3. Cuando la FE V1 o FEXE V1 o V2 a la que aplique el evento detallen ventas por cuenta de terceros deberá ingresar uno de los códigos del catálogo CAT-032 "Domicilio Fiscal". | Retorno |

Sección 8: COMPRA POR CUENTA DE TERCEROS

Esta Sección deberá completarse cuando la compra se efectúe por cuenta de terceros o mandantes. Cuando no aplique, deberá transmitir la sección completa con null.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 59 | Número de documento de identificación del Tercero | 1. Deberá ingresar el mismo "Número de documento de identificación del Tercero" contenido en la FEXE a la que se aplica el evento. | Retorno |
| | | 2. Deberá ingresar null cuando:<br>a) El "Número de documento de identificación del Tercero" contenido en la FEXE a la que se aplica el evento también es null.<br>b) El evento se aplique a FE o FSEE. | Retorno |
| 60 | Nombre del Tercero | 1. Campo requerido. Deberá ingresar "Nombre del Tercero" cuando el campo "Número de documento de identificación del Tercero" se encuentre lleno. | Retorno |

Sección 9: CUERPO

Esta sección contiene la información detallada de la operación realizada.
Se aplicarán las reglas de redondeo y holgura contenidas en las reglas 7.2 literal a) y 7.3 de esta Normativa.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 61 | N° de Ítem | 1. Formato de número entero consecutivo. | Retorno, Operaciones especiales |
| | | 2. Valor entero > 0 sin punto y sin decimales. | Retorno Operaciones especiales |
| | | 3. Podrá ingresar hasta 2000 ítems. | Retorno, Operaciones especiales |
| 62 | Código de generación del *(continúa en p. 129)* | 1. El Código de Generación que se detalle debe corresponder a un Evento de Operaciones Especiales activo. | Operaciones especiales |

128

<!-- PAGE 129 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

EOE de 2. Cuando el documento sea 02 0 97 permitirá ingresar Código de Generación si la Techa
Referencia documento origen- en relación a la "Fecha del Evento' no exceda de tres rneses. | Operaciones
Las anulaciones de las operaciones que hayan sido reportadas, se informarán con valores positivos | especiales
referenciando el 'Código de generación del EOE de Referencia'
3. Cuando se detalle en un ítem "Código de generación del EOE de Referencia- los demás ítem | Operaciones
deberán llevar dicho código de eneración, udiendo ser el mismo o uno diferente. | es ciales
L Deberá ingresar eI código del documento de origen, según catálogo CAT-23 -Operaciones Operaciones
Tipo de especiales• | especiales
63
Documento | Operaciones
2. Deberá ingresar un misrno código de típo de documento por evento,
especiales
Operaciones
1. Deberá ingresar el número del documento de origen que se está informando en el evento.
es eclales
Documento 2. Podrá hacer uso de este campo cuando eI campo "TIPO de Documento- tenga código 97 y los | Operaciones
64 | eciates
origen | campos *Doc. Del' 'Doc. sean null. | es
Operaciones
3. Debe ingresar null cuando el campo Tipo de documento' tenga el código 02.
es ciales
I. Deberá indicar la fecha det documento de origen que está informando, en el siguiente forrnato: | Operaciones
Fecha del YYYY-MM-DD. | especiales
65 documento 2. Debe ingresar Techa del documento origen' cuando:
Operaciones
origen a) EI *Código de generación det EOE de Referencia* se encuentre lleno.
especiales
b) EI cam o 'Documento ori eng está lleno,
1. Campo requerido, Deberá ingresar uno de los códigos contenidos en el catálogo CAT- 011 Tipo
Retorno
de ítem', exce to regla 2.
66 Tipo de (tem
2. Cuando se aplique a FEXE, no podrá ingresar el código 3. | Retorno

1. Deberá ingresar el Código de Generación del documento al que aplique el evento. | RetornO
Código de
2. Deberá referenciar en cada ítem eI Código de Generación det DTE al que aplique el evento. | Retorno
67 Generación del
3. Dentro de los 2000 Ítems permitidos deberá ingresar todos los Códigos de Generación de la
DTE | Retorno
sección 'Documentos relacionados',
Operaciones
1. Deberá ingresar valores enteros mayores a cero.
es eciates
Operaciones
2. Podrá ingresar valores enteros 1 cuando se haga uso de los campos 'Doc. Del' y 'Doc. Ale.
es eciales
68 Cantidad | Operaciones
3. Cuando se utilice el campo "Documento origen' deberá ingresar el valor 1.
especiales
4. Deberá ingresar 1 cuando se haga uso del campo 'Cargos/abonos que no afectan la base
Retorno
irn nible•.
5. Deberá ingresar 1 si el cam o ode ítems esté corn leto con et código 4. | Retorno
L Deberá in resar el mismo código de inventario utilizado en el informe F-983. | Retorno
2. Los contribu entes no obli adosa resentar et Informe F-983, odrán in resar nuEl, | Retorno
69 | Código
3. Campo debe ser null cuando se detale ítem como Cargos/abonos que no afectan la base
Retorno
irn onible•.
1. Debe ingresar uno de los códi os según catálo o CAT„014 -Unidad de Medida' | Retorno
Unidad de 2. Deberá ingresar código 99 cuando:
70 | Retorno
Medida a} Se hace uso de campo •Cargos/Abonos que no afectan la base irnponible•
b) Si | - de Ítem' este teto la ción 4.
cam o Tipo | com con o
Retorno y
I. Deberá contener la descripción por ítem que detalle el producto, servicio y/o documento
71 Descripción | Operaciones
informado.
es eciales
Operaciones
1. Valores monetarios $O.OO sin IVA.
es jales
2, Para el caso de FE los precios deberán expresarse en valores monetarios $0.00 incluyendo
Retorno
IVA
72 Precio Unitario
3. Cuando se haga uso del campo Cargos/abonos que no afectan la base imponible', deberá
Retorno
ingresar en el campo -Precio unitario' el vator $0.00
el | 4 el | • Precio unitario- deberá
4. Cuando en el campo *Tipo de ítem* se ingrese código en campo
Retorno
in resarse el valor calculado det tributo.
1. Será requerido cuando el campo 'Tipo de docurnento' contenga el código 02 según catálogo Operaciones
73 | Doc. Del | especiales
CAT- 023 'Operaciones especiales'

129

<!-- PAGE 130 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 130. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| *(cont. p. 129)* | *(cont.)* | 2. Deberá ingresar el número correlativo cuando el campo "Tipo de documento" contenga el código 97 y el campo "Documento origen" sea null. | Operaciones especiales |
| | | 3. Cuando aplique deberá ingresar el número correlativo del documento de inicio. No debe exceder de 36 dígitos. | Operaciones especiales |
| 74 | Doc. Al | 1. Campo requerido cuando el campo "Tipo de Documento" tenga los códigos 02 según catálogo CAT- 023 "Operaciones especiales". | Operaciones especiales |
| | | 2. Podrá ingresar el número correlativo cuando el campo "Tipo de Documento" contenga el código 97 y el campo "Documento origen" sea null. | Operaciones especiales |
| | | 3. Cuando aplique deberá ingresar el número correlativo del documento final. No debe exceder de 36 dígitos. | Operaciones especiales |
| 75 | Descuento por ítem | 1. El descuento se aplicará por ítem, con valores monetarios >= $0.00 | Retorno |
| | | 2. Deberá ingresar $0.00 cuando el documento relacionado contenga $0.00 en el campo "Descuento por ítem". | Retorno |
| | | 3. El descuento no podrá ser mayor al valor de la venta detallada en el ítem. | Retorno |
| | | 4. Deberá incluir tanto los descuentos por ítem como los descuentos globales. | Retorno |
| 76 | Tributo sujeto a cálculo de IVA | 1. Únicamente podrá ingresar los códigos de tributos detallados en el campo "Tributo sujeto a cálculo de IVA" en la FE o FEXE a la que se aplica el Evento de Retorno. | Retorno |
| | | 2. Campo será null cuando el campo "Tipo de documento relacionado" sea FSEE. | Retorno |
| 77 | Ventas No Sujetas | 1. Deberá detallar los valores por ítem ≥ $0.00. | Retorno Operaciones especiales |
| | | 2. Cuando aplique será el resultado de ("Precio unitario" * "Cantidad"). | Operaciones especiales |
| | | 3. Cuando no exista "Ventas no sujetas" deberá ingresar $0.00 | Retorno y Operaciones especiales |
| | | 4. El monto ingresado no podrá exceder el valor del campo "Ventas no sujetas", contenido en el DTE al que aplica el evento. | Retorno |
| | | 5. Cuando aplique será el resultado de [("Precio unitario" * "Cantidad") - "Descuento por ítem"]. | Retorno |
| | | 6. Debe completar este campo con $0.00 cuando:<br>a) Se detalle ítem como "Cargos/abonos que no afectan la base imponible".<br>b) El evento se aplique a FEXE. | Retorno |
| | | 7. Debe ingresar $0.00 cuando el evento se aplique a FSEE. | Retorno |
| | | 8. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Operaciones especiales y Retorno |
| 78 | Ventas Exentas | 1. Deberá detallar los valores por ítem >= $0.00. | Retorno y Operaciones especiales |
| | | 2. Cuando aplique será el resultado de ("Precio unitario" * "Cantidad"). | Operaciones especiales |
| | | 3. Cuando no exista "Ventas exentas" deberá ingresar $0.00 | Retorno y Operaciones especiales |
| | | 4. El monto ingresado no podrá exceder el valor del campo "Ventas exentas", contenido en el DTE al que aplica el evento. | Retorno |
| | | 5. Cuando aplique será el resultado de [("Precio unitario" * "Cantidad") - "Descuento por ítem"]. | Retorno |
| | | 6. Debe completar este campo con $0.00 cuando:<br>a) Se detalle ítem como "Cargos/abonos que no afectan la base imponible".<br>b) El evento se aplique a FEXE. | Retorno |
| | | 7. Debe ingresar $0.00 cuando el evento se aplique a FSEE. | Retorno |
| | | 8. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Operaciones especiales y Retorno |
| | | 9. Deberá ingresar $0.00 cuando en el campo "Tipo de Documento" se ingrese el código 99. | Operaciones especiales |
| 79 | Ventas gravadas | 1. Deberá detallar los valores por ítem >= $0.00. | Retorno y Operaciones especiales |
| | | 2. Cuando aplique será el resultado de ("Precio unitario" * "Cantidad"). | Operaciones especiales |

130

<!-- PAGE 131 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 131. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| *(cont. 79, p. 130)* | *(Ventas gravadas, cont.)* | 3. Cuando no existan "Ventas gravadas" deberá ingresar $0.00 | Retorno y Operaciones especiales |
| | | 4. El valor de las "Ventas gravadas" no podrá exceder al valor contenido en el DTE al que aplique el evento. | Retorno |
| | | 5. Cuando aplique será el resultado de [("Precio unitario" * "Cantidad") - "Descuento por ítem"]. | Retorno |
| | | 6. Campo se aplicará por ítem, debe ser un valor monetario sin IVA. | Operaciones especiales |
| | | 7. Debe completar este campo con $0.00 cuando se detalle ítem como "Cargos/ abonos que no afectan la base imponible". | Retorno |
| | | 8. Debe ingresar $0.00 cuando el evento se aplique a FSEE. | Retorno |
| | | 9. Solo procede cuando el documento al que aplica el Evento sea FE o FEXE. | Retorno |
| | | 10. Podrá detallar en este ítem los valores calculados de los "Tributos sujetos a cálculo de IVA". | Retorno |
| | | 11. El valor de las ventas gravadas detalladas en el evento no podrán exceder al valor de las operaciones gravadas contenidas en el documento al que se está aplicando el evento. | Retorno |
| | | 12. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Operaciones especiales y Retorno |
| 80 | Compras a sujetos excluidos | 1. Cuando aplique, se detallará por ítem valor monetario >= $0.00 | Retorno |
| | | 2. Será el resultado de (("Precio" * "Cantidad") – "Descuento por ítem"). | Retorno |
| | | 3. El valor de las "Compras a sujetos excluidos" que se detallen en este campo no podrá exceder al valor contenido en la FSEE a la que se está aplicando el evento. | Retorno |
| | | 4. Cuando el evento se aplique a FE o FEXE deberá completar este campo con $0.00 | Retorno |
| | | 5. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno |
| 81 | Código del Tributo | 1. Deberá ingresar los códigos de tributos contenidos en el DTE al que le aplica el evento. | Retorno |
| | | 2. Este campo podrá ser null cuando en el ítem se detallen "Ventas no sujetas" o "Ventas exentas". | Operaciones especiales |
| | | 3. Cuando en el campo "Tipo de documento" se haya ingresado el código 02 o 97 y se detallen "Ventas gravadas", deberá ingresar el código 20. | Operaciones especiales |
| | | 4. Cuando el evento se aplique a FE, podrá ingresar los códigos contenidos en la sección 1 y 3 del catálogo CAT-015 "Tributos", exceptuando los códigos 20 y C3. | Retorno |
| | | 5. Cuando el evento se aplique a FEXE deberá ingresar el código C3. | Retorno |
| | | 6. Cuando el evento se aplique a FEXE podrá ingresar los códigos contenidos en la sección 1 y 3 del catálogo CAT-015 "Tributos", exceptuando el código 20. | Retorno |
| | | 7. Este campo deberá ser null en los siguientes casos:<br>a) Se haga uso del campo "Cargos/abonos que no afectan la base imponible".<br>b) Si el documento al que se aplica el evento es FSEE.<br>c) Cuando en la FE a la que se aplica el evento el campo "Código del tributo" también sea null. | Retorno |
| | | 8. Los códigos de tributos deberán ingresarse entre corchetes y separarse por comas. | Retorno |
| 82 | Precio sugerido de venta | 1. Podrá detallar valor >= $0.00 si el documento al que se aplica el evento es FE. | Retorno |
| | | 2. Cuando aplique deberá detallarse por ítem y será de uso informativo. No tendrá efectos en otros cálculos. | Retorno |
| | | 3. Deberá ingresar $0.00 cuando:<br>a) El documento al que se aplica el evento sea FEXE o FSEE.<br>b) En la FE a la que se aplique el evento también es $0.00 | Retorno |
| 83 | IVA por ítem | 1. Campo se aplicará por ítem, deberá ser valor monetario >= $0.00 | Retorno |
| | | 2. Campo requerido de uso informativo, deberá contener el valor de IVA que corresponda a cada ítem cuando se detallen "Ventas gravadas".<br>No tendrá efecto en otros valores calculados en el documento. | Retorno |
| | | 3. Cuando el evento aplique a FE deberá ingresar el valor de IVA por ítem, que estará dado por el cálculo de: [(Ventas gravadas por ítem/1.13) *13%]. | Retorno |
| | | 4. Cuando se detallen ventas exentas o ventas no sujetas, deberá ingresar $0.00 | Retorno |
| | | 5. Deberá ingresar $0.00 si el documento a que le aplica el evento es FEXE o FSEE. | Retorno |
| | | 6. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno |
| 84 | Cargos/Abonos que no afectan la base imponible | 1. Cuando aplique deberá expresarse en valores monetarios positivos o negativos, dentro del cuerpo del evento. | Retorno |
| | | 2. Cuando el documento al que aplica el evento sea FSEE deberá ingresar $0.00 | Retorno |

131

<!-- PAGE 132 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 132. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 85 | IVA Retenido | 1. Será el resultado de: (Ventas Gravadas/1.13) *1 % | Retorno |
| | | 2. No podrá exceder el valor de "IVA Retenido" detallado en la FE a la que se aplique el evento. | Retorno |
| | | 3. Cuando no exista "IVA Retenido" deberá ingresar $0.00 | Retorno |
| | | 4. Deberá ingresar $0.00 si el documento a aplicar el evento es FEXE o FSEE. | Retorno |
| | | 5. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno |
| 86 | Retención Renta | 1. Permitirá ingresar valor mayor a $0.00 cuando el documento al que se aplique el evento sea FSEE. | Retorno |
| | | 2. Cuando aplique, debe ser el resultado de multiplicar el campo "Compras a Sujetos Excluidos"*10% | Retorno |
| | | 3. El valor de "Retención Renta" que se aplique en el Evento no podrá exceder al valor de "Retención Renta" detallado en la FSEE a la que se aplique el evento. | Retorno |
| | | 4. Deberá ingresar $0.00 cuando:<br>a) La FSEE a la que aplique el evento, el campo "Retención Renta" es $0.00<br>b) El documento al que se aplique el evento es FE o FEXE. | Retorno |
| | | 5. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno |
| 87 | Seguro | 1. Cuando el documento al que aplica el evento sea FEXE podrá detallar valores >= $0.00. | Retorno |
| | | 2. Cuando el evento se aplique a FE o FSEE deberá ingresar $0.00 | Retorno |
| 88 | Flete | 1. Cuando el documento al que aplica el evento sea FEXE podrá detallar valores >= $0.00. | Retorno |
| | | 2. Cuando el evento se aplique a FE o FSEE deberá ingresar $0.00 | Retorno |

Sección 10: RESUMEN

Esta sección contiene un resumen de la información del cuerpo del evento. Se aplicarán las reglas de redondeo y holgura contenidas en las reglas 7.2 literal b) y 7.3 de esta Normativa.

| No. | CAMPO | VALIDACIONES PARA CAMPOS | EVENTO |
|---|---|---|---|
| 89 | Total de operaciones no sujetas | 1. Deberá contener la sumatoria de todas las operaciones no sujetas detalladas por ítem en el cuerpo del evento. | Retorno y Operaciones especiales |
| | | 2. Expresado en valores monetarios >= $0.00 | Retorno y Operaciones especiales |
| | | 3. Cuando no existan "Ventas no sujetas" deberá ingresar $0.00 | Operaciones especiales |
| | | 4. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno y Operaciones especiales |
| 90 | Total de Operaciones exentas | 1. Deberá contener la sumatoria de todas las operaciones exentas detalladas por ítem en el cuerpo del evento. | Retorno y Operaciones especiales |
| | | 2. Expresado en valores monetarios >= $0.00 | Retorno y Operaciones especiales |
| | | 3. Cuando no existan "Ventas exentas" deberá ingresar $0.00 | Operaciones especiales |
| | | 4. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno y Operaciones especiales |
| 91 | Total de Operaciones Gravadas | 1. Deberá contener la sumatoria de todas las operaciones gravadas detalladas por ítem en el cuerpo del evento. | Retorno y Operaciones especiales |
| | | 2. Expresado en valores monetarios >= $0.00 | Retorno y Operaciones especiales |
| | | 3. Cuando no existan "Ventas gravadas" deberá ingresar $0.00 | Operaciones especiales |
| | | 4. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la aplicación de fórmula para validación del cálculo de la A.T. | Retorno y Operaciones especiales |
| 92 | Total compras a Sujetos Excluidos | 1. Deberá contener la sumatoria de todas las operaciones a sujetos excluidos detalladas por ítem en el cuerpo del evento. | Retorno |
| | | 2. Expresado en valores monetarios >= $0.00 | Retorno |
| | | 3. Cuando no existan "Compras a sujetos excluidos" deberá ingresar $0.00 | Retorno |

132

<!-- PAGE 133 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

4. Se dará holgura de $ 0.01 por diferencias entre los cálculos en et sistema del contribuyente y la
Retorno
a licación de fórmula para validación det cálculo de la A.T.
L Expresado en valores monetarios 50.00 | Retorno
2. Será et resultado de: *Total de operaciones no sujetas' + 'Total de operaciones exentas' + *Totat
Retorno
de operaciones gravadas" + *Total compras a sujetos excluidos'
3. Se dará holgura de: ± $ 0.01 por diferenc}as entre los cálculos en el sistema del contribuyente y
Retorno
ta a licación de fórmula para validación del cálculo de la A.T.
Suma de
93 | 4. Deberá contener la sumatoria de los campos *Total de operaciones no sujetas', 'Totat de | Operaciones
operaciones
o eraciones exentas• 'Total deo raciones ravadas*. | es eciates
Operaciones
5. Campo requerido expresado en valores monetarios $O.OO
especiaCs
6. Se dará holgura de S 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la | Operaciones
a licación de fórmula ara validación del cátculo de ta A.T. | es eciales
1. Campo requerido. expresado en valores monetarios positivos con un máximo de 2 decimales | Operaciones
des ués del entero. | es eciales
94 Sub total
2. Será la sumatoria de. (Total de Operaciones no sujetas (+) Total de Operaciones exentas (+) Total | Operaciones
de Operaciones Gravadas) | es eciales
I. Deberá ingresar la sumatoria de tos valores contenidos en el campo 'Cargos/Abonos que no
Retorno
Total Cargos/ afectan la base imponible"
Abonos que no | Retorno
95 | 2. Cuando no existan *Cargos/Abonos que no afectan la base imponible" se deberá ingresar $0.00
afectan ta base
3. Se dará holgura de ± $ 0,01 por diferencias entre los cálculos en el sistema del contribuyente y la
imponible | Retorno
a licación de fórmula para validación del cálculo de la A.T.
96 Total Seguro I. Deberá ingresar la suma de todos los valores contenidos or {tem en el campo *Seguro'. | Retorno
Total Flete 1. Deberá ingresar la suma de todos los vatores contenidos por ítem en el campo 'Flete'. | Retorno
1. Cam r uerido ex resado en valores monetarios > $O.OO | Retorno
2. Será el resultado de 'Suma de operaciones' + los valores contenidos en los campos 'Valor del
Monto Total de | Retorno
tributo" • Total Sec uro" 'Total Flete".
98 | + | +
la Operación
3. Se dará holgura de ± $ 0.01 por diferencias entre los cátculos en el sistema del contribuyente y la
Retorno
a ticación de fórmula ara vatidación del cálculo de la A.T.
contenidos ítem los | de "IVA Retenido'. | Retorno
I. Será la suma de todos los valores | por en carnpos
Total IVA
99 | 2. Se dará holgura de $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la | Retorno
a licación de fórmula ara va14dación del cálculo de ta A.T.
ítem los | de 'Retención Renta• | Retorno
1. Será la suma de todos los valores contenidos por en campos
Total Retención
100 | 2. Se dará holgura de $ 0.01 por diferencias entre los cálculos en el sisterna del contribuyente y la | Retorno
Renta
a licación de fórmula ara validación del cálculo de la A.T-

1. Deberá indicar de forma consolidada et código de los tributos que se aplicaron en el campo Retorno y Operaciones
*Código del tributo' por ítem contenidos en et cuerpo del documento, | especiales

Resumen código 2. Se podrá colocar varios códigos de tributos diferentes, separados por comas. | Retorno
101
del tributo | Retorno Operaciones
y
3, Deberá ingresar null cuando el campo "Código del tributo" también sea null-
especiales
4. Deberá ingresar los códigos de la sección 3 del catálogo CAT-015 Tributos- para uso informativo. | Retorno
L Campo requerido con et nombre del tributo que se está detallando en el campo 'Resumen Código Retorno y Operaciones
det Tributo". | es eciales
Nombre del 2, Este | se repetirá tantas veces como códigos de tributos estén contenidos en el campo Retorno y Operaciones
carnpo
102 | -
tributo | Resumen código del tributo'. | especiales
Retorno y Operaciones
3 Deberá ingresar null si el carnpo -Resumen código del tributo' también es null.
especiales
Retorno y Operaciones
l. Expresado en valores monetarios $O.OO
es eciales
Operaciones
2. Carnpo requerido si eI campo 'Resurnen código det tributo' tiene valores,
especiales
3, Deberá ingresar los valores consolidados que correspondan a los tributos detallados en el campo Retorno y Operaciones
103 Valor del tributo
'Resumen código del tributo' | especiales
4. Deberá mostrar el cátculo consolidado de los tributos de ta sección 3 del catálogo CAT-015 Retorno y Operaciones
'Tributos ara uso informativo (no se sumarán a los totales). | especiales
Retorno y Operaciones
5. Se ingresará $0.00 si el campo "Resurnen código del tributo" también es null
especiales

133

<!-- PAGE 134 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

6, Cuando el | TResumen | del tributo' | Operaciones
campo | código | tenga el código C3 deberá ingresar $0.00
es eciates
7. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y Retorno y Operaciones
la aplicación de fórrnula para validación del cálculo de ta A, T, | especiales

1 Será et resultado de | los | 'Sub-Total' *Valor | Operaciones
sumar campos | + de tributo',
es eciates
104 | Total
2, Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y (a | Operaciones
aplicación de fórmula ara validación del cálculo de la A T.
1, Canvo requerido, expresado en valores monetarios 50.00 | Retorno
2. Será el resultado de: 'Monto total de la operación* (-) • Totat IVA Retenido' (-) Total Retención
Retorno
Renta' (+/-) Total Cargos/Abonos que no afectan la base imponible*
105 Total a pagar
3. Cuando el campo 'Cargos/Abonos que no afectan Éa base imponibles sea mayor al resultado del
RetornO
campo FMonto total de la operación* deberá ingresar 50.00
4. Se dará holgura de ± $ 0.01 por diferenc\as entre los cálculos en el sistema del contribuyente la
y
Retorno
a licación de fórmula ara validación del cálculo de la A T.
Retorno y Operaciones
1. Cuando se ingrese solo se validará formato alfanumérico.
especiales
106 Valor en Letras
Retorno y Operaciones
2, Podrá ingresar null.
especiales
1, Campo de uso informativo, no tiene efecto en los valores del evento ni se mostrará en la
Retorno
Re resentación Gráfica.
Transferencias
2. Deberá ingresar valores $0.00 si el documento al que le aptica eI evento es FEXE. | Retorno
107 de bienes no
3. Deberá ingresar SO 00 cuando.
onerosas
a) EI evento se aplica a FEXE que no detalla este tipo de operación. | Retorno
b) Sea lica a FE FSEE
1 Este cann solo tendrá a licación cuando el documento al ue le a lica eI evento sea FE. | Retorno
2, Carnpo de uso informativo, deberá contener la sumatoria de todos los | • IVA ítem'
campos por
Retorno
IVA del campo 'Descuento global a ventas gravadas'.
3. Ex resado en valores monetarios $O.OO | Retorno
108 IVA | 4 Deberá ingresar SO 00 cuando.
a) EI campo 'IVA por ítem' en la FE a la que se aplica el evento también es 50,00 | Retorno
b) EI documento al ue le a lica el evento es FEXE o FSEE
5. Se dará holgura de ± $ 0.01 por diferencias entre los cálculos en el sistema del contribuyente y la
Retorno
aplicación de fórmula para validación del cálculo de la A. T,
1, Permitirá ingresar valores monetarios < $0.00 | Retorno
2, Deberá ingresar $0 00 cuando.
109 Saldo a Favor
a) En la FE o FEXE a la que se aplica el evento tarnbÍén es $0.00 | Retorno
b) EI documento al que le aplica el evento es FSEE.

Sección 11: MOTIVO DEL EVENTO
Debe detallarse eI motivo por et cual se genera eI evento, la información de la persona designada por el emisor la
y
ersona ue 10 solicita.

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

Tipo de invalida-
110 | 1. Deberá ingresar uno de los códigos del catálogo CAT-024 •Motivo del evento'. | Invat4dación
ción
111 | Motivo 1 Deberá ingresar la descripción del error que ocasiona el evento. | Invalidación
Nombre de
112 quien realiza el 1. Deberá ingresar el nombre del responsable de realizar el evento. | (nvatidación
evento
Tipo de
documento de
1 Deberá ingresar la codificación de acuerdo al catálogo CAT-022 'Tipo de documento de
113 identificación de | Invalidación
identificación"
quien realiza eI
evento
Número de
114 documento de 1. Deberá ingresar ei número de documento de identificación del responsable de realizar el evento. | invalidación
identificación de

134

<!-- PAGE 135 / 137 (OCR) -->

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

quien realiza el
evento
Nombre de
115 quien solicita el 1. Deberá ingresar el nombre de la persona que solicita et evento, | Invalidación
evento
Tipo de
documento de | de
1. Deberá seleccionar la codificación de acuerdo al catálogo CAT-022 'Tipo de documento
116 identificación de | Invalidación
identificación'
quien solicita el

Número de
identificación | Invalidación
117 | 1. Deberá ingresar et número de documento de identificación de quien solicita el evento.
de quien solicita
el evento

Sección 12: APÉNDICE
Esta sección es opcional y se encuentra a disposición para incluir cualquier información adicional-
Podrá ingresarse desde I hasta un máximo de 10 veces, completando todos los campos.
De no hacer uso de la sección debe ingresar null-

No. CAMPO | VALIDACIONES PARA CAMPOS | EVENTO

Retorno y
Nombre del
118 | 1. De no hacer uso del campo debe ingresar nutl. | Operaciones
campo | especiales
Retorno y
119 Descripción i. De no hacer uso del campo debe ingresar null, | Operaciones
es eciales
Retorno y
120 Valor/dato I. De no hacer uso det campo debe ingresar nult. | Operaciones
es eciales

Sección 13: SELLO DE RECEPCIÓN

No. CAMPO | SELLO DE RECEPCIÓN | EVENTO

No es una sección ni un campo de los eventos transmitidos a la Administración Tributaria. | Invalidación.
Contingencia,
Sello de
121 | No obstante. deberá incorporar el Sello de Recepción enviado por la Administración Tributaria Operaciones
Recepción | al | las | generadas en | especiales
en eI Archivo DTE que entregue receptor (exceptuando operaciones | y
Contin encia det Evento de Retorno). | Retorno

135

<!-- PAGE 136 / 137 (OCR) -->

<!-- FASE 0.1: página recuperada con Tesseract 5.4.0 (tessdata_best spa+eng, 300 dpi, PSM 6; PSM 3 como contraste) y transcripción verificada visualmente contra la imagen del PDF original, página 136. Sustituye la extracción Windows.Media.Ocr (copia íntegra en auditoria/ocr-recovery/normativa-2.0.pre-fase01.md; OCR bruto en auditoria/ocr-recovery/raw/). -->

ANEXO VI
MODIFICACIONES

| VERSIÓN | REGLA/ ANEXO | DESCRIPCIÓN |
|---|---|---|
| 1.0 | Versión Inicial | Se establecen disposiciones de estricto cumplimiento para los sujetos pasivos en materia de Documentos Tributarios Electrónicos, de conformidad al artículo 119-A del Código Tributario. |
| 1.1 | 15 | Se modifica la fecha de coexistencia. |
| 1.1 | ANEXOS III y V | Campo 21: Se modifica el máximo de ítems. |
| 1.2 | ANEXOS II y IV | Se adiciona "Sección 7", con campos 72 y 73 para FEXE. |
| 2.0 | 2 | Se establecen los diferentes sujetos pasivos de los Documentos Tributarios Electrónicos, sujetos obligados, voluntarios y las responsabilidades de los mismos. |
| 2.0 | 3 | Se incorporan definiciones de Campo, Establecimiento, Evento de Retorno, Evento de Operaciones Especiales, Fecha de Generación/ Fecha del Evento, Fecha de Transmisión, Punto de Venta, Gestor de Facturación Electrónica y Validación, y se actualiza la denominación del Sello de Recepción y otras definiciones. |
| 2.0 | 4 | Se incorporan los Efectos de los Documentos Tributarios Electrónicos y los Eventos de Retorno y Operaciones Especiales. |
| 2.0 | 6 | Se introduce la "Emisión con Transmisión Diferida Normal a la Administración Tributaria". |
| 2.0 | 7 | Se agregan reglas para el Contenido de los DTE y Eventos y la especificación del "Número de Control". |
| 2.0 | 8 | Se incorpora la responsabilidad de los sujetos pasivos respecto del certificado de firma y de su conservación y los efectos de la firma electrónica. |
| 2.0 | 9 | Se actualiza el Cuadro 4: Transmisión, para la Transmisión Diferida Normal.<br>Se establecen lineamientos para el uso de las plataformas de facturación y las condiciones de transmisión.<br>Se define el estado transitorio del Documento Electrónico. |
| 2.0 | 11 | Se actualizan los lineamientos para la Entrega de los DTE, Eventos y Representaciones Gráficas según la modalidad de emisión.<br>Se agregan condiciones de correspondencia de las Representaciones Gráficas con su DTE o Evento. |
| 2.0 | 12 | Se agregan reglas para el Orden y conservación de los DTE, Eventos y Representaciones Gráficas.<br>Se establecen lineamientos para la Protección de datos personales y certificación de los DTE y Eventos. |
| 2.0 | 13 | Se actualizan los plazos para la transmisión del Evento de Invalidación y se incorporan: el Evento de Retorno y el Evento de Operaciones Especiales; sus lineamientos, efectos, casos, condiciones y plazo para su transmisión.<br>Se establecen las reglas de transmisión de los Eventos.<br>Se establecen reglas para el Informe Técnico de Contingencia. |
| 2.0 | 18 | Se modifican los Lineamientos para Actualizaciones y Versiones de la Normativa de Cumplimiento de los DTE. |
| 2.0 | ANEXO I Regla 1 | Se introducen los principios de Transparencia tecnológica y Responsabilidad y los recursos del sistema. |
| 2.0 | ANEXO I Regla 3 | Se establecen lineamientos para el uso de claves.<br>Se incorpora la Consulta del Estado del Servicio de Recepción. |
| 2.0 | ANEXO I Regla 4 | Se establecen especificaciones para la Entrega de los DTE, Eventos y Representaciones Gráficas. Se establece el esquema uniforme del Archivo DTE. |
| 2.0 | ANEXO I Regla 5 | Se incorpora el Módulo de Entrega. |
| 2.0 | ANEXO I Regla 6 | Se establecen lineamientos de seguridad. |
| 2.0 | ANEXO I Regla 7 | Se actualiza el flujo de proceso de los DTE y Eventos. |
| 2.0 | ANEXOS II y IV | Se actualiza campo 1 "Versión" para todos los DTE.<br><br>Se adiciona campo 13 "Fusiones y otros", Sección 2 "DOCUMENTOS RELACIONADOS" y sección 7 "Compra por Cuenta de Terceros para FEXE, campo 28 "Dirección Distrito (Emisor)", campo 36, "Tipo de Régimen", campo 38 "Tipo de documento de identificación (Receptor)", 39 "Número de documento de Identificación, campo 49"Dirección Distrito (Receptor)", (Receptor)", campos 53 y 71 "Domicilio Fiscal", campos 75 "Tipo de ítem", 80 "Número de documento relacionado", campo 84 "Tributo sujeto a cálculo de IVA" y 96 "Código del Tributo" para FEXE; campo 83 "Código", campos 98 "Cargos/Abonos que no afectan la base imponible" 99 "IVA percibido", 100 "IVA 13%" y 101 "IVA retenido", 143 "Total IVA percibido", 144 "Código retención MH" , 145 "Total IVA retenido", 146 "Total IVA 13%", 151 "Total cargos / abonos que no afectan la base imponible" y 153 "Total a Pagar" en NCE y NDE; campos 136 "Resumen código del tributo", 137 "Nombre del tributo", 138 "Valor del tributo" y 152 "Total de exportaciones que no representan ventas" para FEXE; 157 "IVA 13%" para CRE, campo 168 "Observaciones".<br><br>Se eliminan campos "Tipo de establecimiento (Emisor)", "Código del establecimiento asignado por el MH (Emisor)", "Código del Punto de Venta (Emisor) asignado por el MH", "Código del establecimiento asignado por el MH (Receptor)" y "Código del Punto de Venta (Receptor) asignado por el MH" para DCLE, NIT (Receptor) para NCE, NDE y CLE, "IVA Retenido" para FSEE; "Monto global de Descuento, Bonificación, Rebajas y otros a ventas no sujetas", "Monto global de Descuento, Bonificación, Rebajas y otros a ventas exentas", "Monto global de Descuento, Bonificación, Rebajas y otros a ventas gravadas", "Porcentaje de descuento" y "Sub *(continúa en p. 137)* |

136

<!-- PAGE 137 / 137 (OCR) -->

REGLA/ | DESCRIPCIÓN
VERSIÓN
ANEXO
Total' 'IVA percibido' e 'IVA retenido' para NCE y NDE; 'Retención renta' para FE, CCFE. NCE y NDE: se elimina la Sección
Extensión para FE, CCFE, NERE, NCE, NDE, CRE, CL. FSEE y CDF-

Se amplía longitud de campo 83 'Descripción*
Se actualizan validaciones de | 1 'Versión' para todos {os Eventos: campos 9 'Fecha del evento', 45 TIPO de DTE', 51 Techa
campo
de Generación*, para Evento de Invalidación: carnpo 37 Tipo de documento en contingencia" para Evento de Contingencia;
campo 113 'Tipo de Invalidación'

Se adicionan | 3 'Modelo de Facturación', 4 'Tipo de transmisión', 5 "Tipo de contingencia', 6 'Motivo de Contingencia', 8
campos
eventoe, 16 Tusiones | 18 • de DTE'. 19 'Código de generación del DTE', 20 Techa de Generación'. 31
'Tipo de | y otros, Tipo
•
• Recinto fiscal', 32 Tipo de Régimen' 33 'Régimen de exportación•, 34 Tipo de exportadón•, 47 'Tipo de generación del
ANEXOS
2.0 | documento relacionado', 48 'Número de documento relacionado', 53 'Número del documento de complemento', 58 'Código
III y V | del Tercerol 64
de país (Receptor)', 59 "País destino de la exportación | 62 *NIT por cuenta de terceror, 63 'Nombre
'Domicilio Fiscal', 65 'Número de documento de identificación del Tercero', 66' Nombre del Tercero", 'todos los campos de la
Sección 9: CUERPO (del 67 al 96), todos los campos de la Sección 10: RESUMEN (det 97 al 122), todos los campos de ta Sección
12: APÉNDICE {del 131 at 133).

Se eliminan los campos Tipo de establecimiento (Emisor)'. *Nombre de casa matriz, sucursal /agencia, predio/patio, bodega
(Emisor)'. 'Monto Total de la O eración (del DTE A Invalidar)'. del Evento de Invalidación.

137