<!-- Fuente: originales/MANUAL FUNCIONAL DEL SISTEMA DE TRANSMISIÓN.pdf | Páginas: 80 | Derivado con pymupdf4llm 2.0 (des-guionización de fin de línea desactivada en tiempo de ejecución para preservar identificadores y JSON). El PDF original es la fuente oficial. -->


<!-- PAGE 1 / 80 -->















# MANUAL FUNCIONAL DEL SISTEMA DE TRANSMISIÓN 

























**Ministerio de Hacienda** 

**Versión 2.0** 





<!-- PAGE 2 / 80 -->











||02/2023|Versión inicial del documento|
|---|---|---|
||05/2023|Actualización de nombres de campo según normativa, se amplía<br>explicación para aplicación del Catálogo “Tributos”, adición de<br>anexo venta a cuenta de terceros|
||10/2025|Se actualiza romano VII Evento de Invalidación|
|2.0|05/2026|Se modifican reglas para el Evento de Invalidación; se agregan<br>nuevos eventos (retorno y operaciones especiales), cambios en<br>estructura de NCE y NDE, actualización de aplicación del catálogo<br>“Tributos”, actualización de la sección documentos relacionados,<br>actualización de la sección venta por cuenta de terceros, adición de<br>la sección compra por cuenta de terceros, adición de campo<br>“fusiones y otros”|





<!-- PAGE 3 / 80 -->



## Contenido 

|I.<br>DTE|Plataforma Sistema de Transmisión de Documentos Tributarios Electrónicos (Sistema de Transmisión<br>) ..................................................................................................................................................................... 3|
|---|---|
|II.|Modelo de Recepción Utilizado en los DTE/Eventos .................................................................................... 3|
|III.|Firma Electrónica .......................................................................................................................................... 6|
|IV.|Representación Gráfica ................................................................................................................................ 6|
|V.|Estructuras de los Documentos Tributarios Electrónicos. ............................................................................. 6|
|VI.|Generalidades de los Eventos ...................................................................................................................... 8|
|VII.|Evento de Invalidación ................................................................................................................................. 9|
|VIII.|Evento de Contingencia .............................................................................................................................17|
|IX.|Evento de Operaciones Especiales ............................................................................................................21|
|X.|Evento de Retorno .....................................................................................................................................26|
|XI.|Detalle de la Estructura Número de Control ...............................................................................................28|
|XII.|Tratamiento de campo "Cargos/Abonos que no afectan la base imponible” .......................................29|
|XIII.|Uso del Campo Fusiones y Otros ..............................................................................................................31|
|XIV.|Aplicación del Catálogo “Tributos” ............................................................................................................32|
|XV.|Uso de la Sección Documentos Relacionados. .........................................................................................37|
|XVI.|Uso de Sección Otros Documentos Asociados. .......................................................................................41|
|XVII.|Venta Cuenta de Terceros .......................................................................................................................43|
|XVIII|. Aplicación de los campos “Descuento por ítem” y “Monto Global de Descuento” en los DTE ..............44|
|XIX.|Ingreso de información en campos relativos al pago ...............................................................................48|
|XX.|Ingreso de información para los ítems del Comprobante de Donación .....................................51|
|XXI.|Redondeos y Holguras ............................................................................................................................52|
|XXII|I.   Ejemplo Archivo DTE .............................................................................................................................21|
|XXIV|.   Pruebas de Transmisión Satisfactorias Mínimas para el Sistema de Transmisión DTE ......................23|
|XXV|.   Glosario...................................................................................................................................................23|
|XXV|I.   Abreviaturas ...........................................................................................................................................24|





<!-- PAGE 4 / 80 -->



## Introducción 

Con la entrada en vigencia de la Normativa de Cumplimiento de los Documentos Tributarios Electrónicos V 2.0 se identificó la necesidad de actualizar la documentación técnica disponible para los contribuyentes. 

Este manual proporciona a los contribuyentes que utilicen la plataforma Sistema de Transmisión de DTE ampliaciones de aspectos relevantes tales como el modelo de Facturación Electrónica, la firma electrónica, uso del catálogo, “Tributos”, utilización de los eventos, reglas de redondeo y holguras. 

Asimismo se desarrollan ejemplos aplicados para el ingreso de información en secciones y campos de los DTE que por su naturaleza se ha considerado importante brindar un detalle puntual sobre su uso, estos campos y secciones son: “Número de Control”; “Cargos/Abonos que no afectan la base imponible”; “Descuento, por ítem y “Descuento global”,” ingreso de información en campos relativos al pago; detalle de los ítems para el Comprobante de Donación; campo Fusiones, campo Transferencia de Bienes no Onerosa, sección “Documentos Relacionados”, Venta por Cuenta de Terceros, sección “Otros Documentos Asociados”, plazos de Invalidación, Evento de Operaciones Especiales y Evento de Retorno. 

Representando una herramienta de apoyo al contribuyente que utiliza la plataforma Sistema de Transmisión, para la configuración y desarrollo del Gestor de Facturación Electrónica. 

Manual Funcional del Sistema de Transmisión V 2.0 

1 



<!-- PAGE 5 / 80 -->



## Objetivo General 

Proporcionar a los contribuyentes una herramienta que facilite la implementación a los usuarios de la plataforma Sistema de Transmisión de DTE en su organización, explicando las características generales y el planteamiento de ejemplos aplicados al ingreso de información en la generación de DTE y eventos. 

## Objetivos Específicos 

- Describir las características generales de la plataforma Sistema de Transmisión de DTE, el Modelo de la Facturación Electrónica y el firmado de los documentos electrónicos. 

- Presentar el funcionamiento de los Eventos de Invalidación, Contingencia, Operaciones Especiales y Retorno aplicados para cada tipo de DTE. 

- Ejemplificar el funcionamiento del redondeo y la holgura definida por la Administración Tributaria dentro de los DTE y eventos. 

- Desarrollar ejemplos aplicados para el tratamiento de los campos especiales como: " Cargos/Abonos que no afectan la base imponible”, “Descuento por ítem” y “Descuento Global”, secciones Documentos Relacionados, Otros Documentos Asociados, Formas de Pago y aplicación del catálogo de tributos por tipo de documento. 

Manual Funcional del Sistema de Transmisión V 2.0 

2 



<!-- PAGE 6 / 80 -->



## **I. Plataforma Sistema de Transmisión de Documentos Tributarios Electrónicos (Sistema de Transmisión DTE)** 

Esta Plataforma puede ser implementada por todos los contribuyentes, independiente a su categoría, nivel de operaciones y fecha de inicio de emisión de DTE según el Programa de Implementación de los DTE; esta opción implica que el Gestor de facturación interno de los contribuyentes debe cumplir con los requisitos determinados por la Administración Tributaria para la emisión de los documentos fiscales y además debe ser capaz de conectarse con el Sistema de la DGII para transmitir dichos documentos hacia la Administración Tributaria. 

## **II. Modelo de Recepción Utilizado en los DTE/Eventos** 

#### **Modelo previo** 

El modelo de recepción es previo a la entrega al receptor, en este modelo el emisor en su Gestor de Facturación interno, genera el documento en formato electrónico compatible (Json) incorporándole su firma electrónica; posteriormente deberá enviarlo a la Administración Tributaria, quien aplicará los procesos de verificación de cumplimiento de la estructura de datos, en caso que el documento electrónico cumpla con las validaciones, dicha Administración le otorgará el “Sello de Recepción”, que le brinda la calidad de Documento Tributario Electrónico (DTE). Si el documento electrónico no cumple con la estructura de datos establecida, será rechazado y se devolverá un mensaje al emisor detallando los campos que no pasaron las verificaciones para su corrección y nuevo envío. 

Una vez que el documento electrónico ha obtenido el “Sello de Recepción”, el Ministerio de Hacienda resguardará la información contendida en el DTE, y proporcionará un servicio donde cualquier usuario podrá consultar el estado de su DTE, por medio del Código de Generación. 

Manual Funcional del Sistema de Transmisión V 2.0 

3 



<!-- PAGE 7 / 80 -->



**Diagrama de Recepción Modelo Previo** 



### **Modelo Diferido** 

De conformidad al inciso tercero del artículo 119-C del Código Tributario, el modelo de recepción diferida se habilita exclusivamente bajo autorización previa o ante situaciones de fuerza mayor que impidan la transmisión normal de documentos y eventos. 

En el modelo de recepción diferido, el emisor generará en su Gestor de facturación el documento electrónico haciendo uso de la estructura y formato establecidos, ingresando en la sección identificación que el documento se emite en diferido e incorporándole su firma electrónica. 

Una vez que el documento en estado transitorio este firmado, el emisor entregará al receptor el documento; es decir la estructura en el formato establecido ya firmado junto a su correspondiente Representación Gráfica sin Sello de Recepción, por cualquier medio electrónico. En cualquier caso, el estado transitorio de los documentos/eventos será válido hasta el cumplimiento del plazo legal para su transmisión y obtención del Sello de Recepción otorgado por la Administración Tributaria y obtener la calidad de DTE. 

### **Contingencia** 

Cuando exista impedimento en la transmisión normal se podrá iniciar el uso del modelo diferido de DTE con tipo de transmisión en contingencia, cumpliendo con la política de reintentos detallada en la “Manual Tecnológico para la Integración del Sistema de Transmisión”. 

Manual Funcional del Sistema de Transmisión V 2.0 

4 



<!-- PAGE 8 / 80 -->



Posteriormente superada la causa de fuerza mayor que le impiden realizar la transmisión con normalidad (reestablecida la conexión), deberá transmitir el Evento de Contingencia donde informará la situación que le impidió realizar la transmisión y los documentos entregados sin Sello de Recepción; después de haber transmitido el evento de contingencia, el emisor debe transmitir a la Administración Tributaria todos documentos informados en dicho evento, para que estos puedan someterse al proceso de verificación del cumplimiento de la estructura de datos y cada documento pueda obtener el respectivo “Sello de Recepción”, que le dé la calidad de Documento Tributarios Electrónico (DTE). 

Una vez que el documento electrónico ha obtenido el Sello de Recepción, el Ministerio de Hacienda resguardará la información contendida en el DTE y proporciona el servicio de consulta donde cualquier usuario podrá visualizar el estado del DTE, ingresando el Código de Generación y la fecha de generación. 

#### **Diagrama de Recepción Modelo Diferido por Contingencia** 



Manual Funcional del Sistema de Transmisión V 2.0 

5 



<!-- PAGE 9 / 80 -->



## **III. Firma Electrónica** 

Se refiere, a todo proceso electrónico que indica la aceptación de un documento. En El Salvador las firmas electrónicas pueden aplicarse a los documentos del tipo fiscal contemplados en el Código Tributario y que son los siguientes: Comprobante de Crédito Fiscal Electrónico, Nota de Crédito Electrónica, Nota de Débito Electrónica, Nota de Remisión Electrónica, Comprobante de Retención Electrónico, Factura Electrónica, Comprobante de Liquidación Electrónico, Documento Contable de Liquidación Electrónico, Factura de Exportación Electrónica, Factura de Sujeto Excluido Electrónica, Comprobante de Donación Electrónico, Evento de Invalidación, Evento de Contingencia, Evento de Operaciones Especiales y Evento de retorno. 

## **IV. Representación Gráfica** 

Es la versión legible e interpretada del Documento Tributario Electrónico, en formato idóneo para ser visualizado por medios digitales. Los medios de entrega serán acordados entre las partes, posibilitándose el uso de correo electrónico, mensajería instantánea, un servicio web dispuesto por el proveedor para descarga de los DTE, bluetooth, entre otros medios digitales y en casos excepcionales la impresión del mismo. 

La Representación Gráfica debe tener correspondencia con la información transmitida al Ministerio de Hacienda. 

En anexo II de la Normativa de Cumplimiento de los DTE se encuentra la columna “Representación Gráfica” con las condiciones “A”, “B”, “C” y “D” que indican lo siguiente: 

- Los campos que tengan la clasifican “A” deben presentarse en la Representación Gráfica. 

- Los campos que tienen la clasificación “B” deberán presentarse en la Representación Gráfica de conformidad a lo normado en ley para operaciones específicas. 

- Los campos que tienen la clasificación “C” no son requeridos que se presenten en la Representación Gráfica; sin embargo, el contribuyente podría elegir detallar alguno de estos campos. 

- La sección/campo que tienen la clasificación “D” cuando se llenen deben mostrarse en la Representación Gráfica y cuando no se haga uso de esta, debe mostrar el nombre de la sección/campo colocando a la par del nombre un guion 

El diseño de la Representación Gráfica del DTE queda a opción del contribuyente pudiendo incorporar sus logos, marcas y slogans en los espacios y posición que estime; manteniendo la correspondencia con la información del archivo DTE y respetando las reglas establecidas en la columna “Representación Gráfica” de los anexos II y IV de la Normativa de Cumplimiento de los DTE. 

## **V. Estructuras de los Documentos Tributarios Electrónicos.** 

Las Estructuras de los Documentos Tributarios Electrónicos son descripciones del contenido y de las especificaciones que deben cumplirse según el documento tributario que se esté generando; de conformidad a lo establecido por la Administración Tributaria. El detalle de las estructuras se encuentra contenido en la Normativa de Cumplimiento de los Documentos Tributarios Electrónicos. 

Actualmente se han definido las estructuras para los siguientes Documentos Tributarios Electrónicos: 

Manual Funcional del Sistema de Transmisión V 2.0 

6 



<!-- PAGE 10 / 80 -->



- **1** Factura Electrónica **7** Comprobante de Liquidación Electrónico 

- **2** Comprobante de Crédito Fiscal Electrónico **3** Nota de Remisión Electrónico 

- **4** Nota de Crédito Electrónico 

- **5** Nota de Débito Electrónico 

   - **8** Documento Contable de Liquidación Electrónico 

   - **9** Factura de Exportación Electrónico 

   - **10** Factura de Sujeto Excluido Electrónica 

   - **11** Comprobante de Donación Electrónico 

- **6** Comprobante de Retención Electrónico 

Cada estructura está dividida en campos y secciones. 

Los campos de los documentos son la información (datos) que la Administración Tributaria requiere para generar, transmitir y recibir un DTE; es importante mencionar que cada tipo de documento contiene sus campos con información específica. Las secciones son agrupaciones de campos con información relacionada, en que se han dividido las estructuras de los documentos tributarios, estas secciones son: 

1. **Sección “Identificación”:** Sección obligatoria incluida en todas las estructuras, donde se detallan las generales del documento que se está generando. 

2. **Documentos Relacionados** : Esta sección se encuentra en FE, CCFE, NRE, NCE, ND y FEXE. Cuando aplique debe hacer referencia a documentos que se hayan emitido con anterioridad y que den origen a la generación de un documento posterior. Haciendo uso de esta sección podrá realizar la relación de un máximo de 50 documentos que, entre sí, podrían sumar hasta un máximo de 2000 ítems o líneas. 

3. **Sección “Emisor”:** Sección obligatoria incluida en todos los documentos tributarios, donde se describen los datos del emisor del documento (Exportador para la FEXE, Agente de retención para el CRE, Comisionista para el CLE, Agente perceptor para el DCLE y Donatario para el CDE). 

4. **Sección “Receptor”:** en esta sección se describen los datos generales del que está recibiendo el documento tributario. (Sujeto de retención para el CRE, Mandante para el CLE, Afiliado para el DCLE, Sujeto Excluido para el FSEE y Donante para el CDE). 

5. **Sección “Otros documentos asociados”:** Esta sección es opcional para algunos documentos tributarios, y permite anexar información relevante de la operación; esta información puede ser del emisor (contratos, resoluciones, etc.), del receptor (contratos, resoluciones, autorizaciones, etc.), del médico (identificación, nombre, procedimiento, etc.) y del medio de transporte (identificación, conductor, entre otros). 

6. **Sección “Ventas por cuenta de terceros”:** Utilizada para describir la información del tercero al que se le está realizando la venta, en FE, CCFE, NCE, NDE y FEXE. 

7. **Sección “compra por cuenta de terceros”:** Utilizada para describir en la FEXE la información del tercero al que se le está realizando la compra. 

8. **Sección “Cuerpo del documento”:** Sección obligatoria para todos los documentos tributarios, en esta sección se detalla la información propia de cada documento tributario. 

Manual Funcional del Sistema de Transmisión V 2.0 

7 



<!-- PAGE 11 / 80 -->



9. **Sección “Resumen”:** Contiene un resumen general de la información contenida en el cuerpo del documento, es obligatoria y se encuentra en todos los documentos tributarios, excepto en el DCLE. 

10. **Sección “Extensión”:** En esta sección se detallan los datos generales del responsable de generar el DCLE. 

11. **Sección “Apéndice”:** Esta sección es opcional y se encuentra a disposición para incluir cualquier otra información dentro de los documentos. 

12. **Sello de Recepción:** Al final de cada estructura se encuentra el “Sello de Recepción”, está no es una sección ni un campo de los documentos tributarios, únicamente es un recordatorio de que el Ministerio de Hacienda enviará un código encriptado llamado “Sello de Recepción” por cada documento tributario correctamente transmitido; mismo que deberá ser incluido en la Representación Gráfica de los DTE. 

## **VI. Generalidades de los Eventos** 

Los eventos establecidos por esta Administración son estructuras que deben ser transmitidas en el formato autorizado (Json); pero no se consideran un Documento Tributario Electrónico (DTE). 

Desde el punto vista de la emisión de Documentos Tributarios Electrónicos, un evento se refiere al mensaje de datos firmado electrónicamente que contiene información que se relaciona con un documento tributario electrónico emitido previamente, que afecta o modifica dicho documento electrónico. 

Para poder hacer uso de los eventos, el contribuyente deberá realizar previamente la configuración respectiva en su sistema de facturación interno de acuerdo a los requerimientos de las estructuras proporcionadas y las condiciones establecidas por la Administración Tributaria. Una vez se hayan realizado las adecuaciones necesarias al sistema, deberá realizar el proceso de pruebas mínimas para cada uno de los eventos con respuesta exitosa, es decir que se les otorgó el sello de recepción. 

Las pruebas de dichos eventos serán consideradas al momento de autorizar a los contribuyentes como emisores de documentos tributarios electrónicos (Ver Sección de este documento “Pruebas de Transmisión Satisfactorias Mínimas para el Sistema de Transmisión DTE”). 

Actualmente se han definido las estructuras para los siguientes Documentos Tributarios Electrónicos: 

1. Evento de Invalidación 

2. Evento de Contingencia 

3. Evento de Retorno 

4. Evento de Operaciones Especiales 

La Administración Tributaria ha definido una estructura específica para generar, transmitir y recibir los eventos. Cada Evento contiene las secciones con sus agrupaciones de campos para detallar información específica, estas secciones son: 

Manual Funcional del Sistema de Transmisión V 2.0 

8 



<!-- PAGE 12 / 80 -->



1. **Identificación:** Sección donde se detallan las generalidades del evento que se está transmitiendo. 

2. **Documentos Relacionados:** En esta sección se detallarán los documentos o eventos a relacionar, podrá detallar un máximo de 50 documentos/ eventos y un máximo de 2000 ítems o líneas. 

3. **Emisor:** Contiene información del emisor del evento. Para el caso del CRE el emisor es el Agente de Retención; para el CLE, es el Comisionista. El emisor para el DCLE, es el Agente Perceptor; para la FEXE, es el Exportador; para el CDE, es el Donatario. Para el evento, los datos del emisor deben ser los mismos detallados en el DTE al que se le aplique. 

4. **Información del documento/evento en contingencia:** Esta sección contiene la información del DTE/evento que se genera en contingencia. 

5. **Motivo de la Contingencia:** En esta sección se deberá ingresar los datos que identifiquen el motivo y el período en qué ocurrió la causa de fuerza mayor que imposibilitó la transmisión normal de los documentos/eventos a la Administración Tributaria. 

6. **Detalle de aplicación del evento:** Hace referencia a los datos de los documentos/eventos a los que se les aplica el evento. 

7. **Venta por cuenta de terceros:** Utilizada para describir la información del sujeto pasivo por cuenta de quien se está realizando la venta. 

8. **Compra por cuenta de terceros:** Utilizada para describir en la FEXE la información del tercero por cuenta de quien está realizando la compra. 

9. **Cuerpo:** Esta sección contiene la información detallada de la operación realizada. 

10. **Resumen:** Esta sección contiene un resumen de la información del cuerpo del evento. 

11. **Motivo del evento:** Deberá detallarse el motivo por el cual se genera el evento. 

12. **Sello de Recepción:** Al final de cada estructura se encuentra el “Sello de Recepción”, está no es una sección ni un campo del evento, únicamente es un recordatorio de que el Ministerio de Hacienda enviará un código encriptado llamado “Sello de Recepción” por cada evento transmitido; mismo que deberá ser incluido en su Representación Gráfica. 

## **VII. Evento de Invalidación** 

El evento de invalidación es un mensaje de datos firmado electrónicamente que se relaciona con un Documento Tributario Electrónico, que se genera en ocasión de la invalidación del mismo. 

Cuando ocurren errores que causen la necesidad de invalidar el documento, el contribuyente emisor deberá realizar un evento de invalidación dentro de los plazos establecidos por la Administración Tributaria por tipo de documento. 

Los DTE únicamente deberán invalidarse por razones justificadas, se consideran entre estas las siguientes: 

- Error en la identificación del cliente. 

- Error en el producto o servicio facturado. 

- Error en la fecha de la operación. 

- Error en el precio de los bienes o servicios (aplica únicamente para Factura y Factura de Exportación). 

- Por devolución de los bienes. 

- Cuando se rescinda totalmente la operación. 

Manual Funcional del Sistema de Transmisión V 2.0 

9 



<!-- PAGE 13 / 80 -->



Para realizar el proceso de invalidación, debe enviarse el evento haciendo uso del formato y la estructura establecida por la Administración Tributaria (El detalle de la estructura para la transmisión del evento de invalidación se encuentra en la Normativa de Cumplimiento de los DTE). 

Es importante aclarar que este evento no elimina ni borra del sistema el DTE, sólo se asigna el estado “INVALIDADO” al DTE que se le aplicó el evento de invalidación, dicho documento estará disponible con este estado en el momento que se realice la consulta pública de los DTE. Invalidar un documento, no lo desaparece de la base de datos interna de DGII. 

El evento de invalidación también es sometido a verificación del cumplimiento de la estructura de datos establecida por la Administración Tributaria. 

#### **Proceso para transmitir el evento de invalidación** 

El emisor debe generar el evento de invalidación ingresando el DTE que requiera ser invalidado (un evento por cada DTE/Evento que se requiera invalidar), en dicho evento debe indicarse el motivo de invalidación del DTE en el campo “Tipo de Invalidación”, donde se ingresará por medio de un código el tipo de error por el cual se requiere invalidar el DTE, según la codificación establecida en catálogo “CAT-024 Tipo de Invalidación”, una vez esté completa la información conforme a la estructura establecida, el emisor enviará el archivo de datos en formato determinado desde su gestor de facturación Electrónica por la plataforma al Sistema de transmisión DTE, por medio de modelo de recepción previo y tipo de transmisión normal, la Administración Tributaria recibe esta información y se realiza el proceso de verificación del cumplimiento de la estructura de datos, de no cumplir con dicha estructura, se rechazará el evento de la invalidación remitiendo un mensaje de datos que indica el error identificado en el evento para su corrección. 

El emisor deberá solventar el o los errores identificados, para transmitir nuevamente el evento de invalidación, y una vez corregidos todos los errores indicados, la Administración Tributaria otorgará el Sello de Recepción. En el momento que se otorgue dicho sello al evento de invalidación, se colocará estado de invalidado al DTE que se ha informado. 

El estado de los DTE invalidados podrá ser consultado a través del portal oficial del MH, por medio del código de generación. 

#### **Plazos para aplicar evento de invalidación** 

Las reglas de validación de plazo para aplicar el Evento de Invalidación están relacionadas con la fecha contenida en el campo “Fecha del Evento”, “Fecha de Generación” y la “Fecha de Transmisión” del DTE que se está invalidando. Para comprender eficientemente lo anterior es necesario tener claros estos conceptos: 

Fecha del Evento: Corresponde a la fecha en que el evento ocurre (momento en que se causa el hecho generador). 

Fecha de generación: Es la fecha del DTE/evento que se corresponde con la fecha en que dio el hecho generador de la operación a invalidar. 

Fecha de Transmisión: Es la fecha en que se transmite el DTE o Evento a la Administración Tributaria. 

Para aplicar el evento de invalidación se validarán dos plazos: 

1. Compara la “Fecha de Generación” del DTE a invalidar con el campo “Fecha del Evento” (detallada en el evento de invalidación). 

Manual Funcional del Sistema de Transmisión V 2.0 

10 



<!-- PAGE 14 / 80 -->



2. Compara la “Fecha de Transmisión” del DTE con la fecha en que se transmita el evento de invalidación. 

**Plazos para transmitir el evento de invalidación en relación a la “Fecha de Transmisión” del DTE/Evento** 

|**Docum**|**ento Tributario Electrónico/Evento**|**Plazo para transmitir el evento de invalidación electrónico**|
|---|---|---|
|•|Comprobante de Crédito Fiscal<br>Electrónico|Podrá realizarse dentro de un plazo máximo 10 días hábiles|
|•<br>•<br>•|Nota de Crédito Electrónica<br>Nota de Débito Electrónica<br>Comprobante de Retención<br>Electrónico|del mes siguiente al período tributario en que el documento a<br>invalidar obtuvo el sello de Recepción Ejemplo 1: Si el<br>DTE/Evento obtuvo sello de recepción el 19 de marzo de<br>2026 a las 7:30:00|
|•<br>•|Comprobante de Liquidación Electrónico<br>Documento Contable de liquidación<br>Electrónico|a.m. el contribuyente emisor tendrá hasta las 23:59:59 del<br>décimo día hábil del mes siguiente (20 de abril 2026) para<br>poder enviar el evento de invalidación para dicho DTE.|
|•<br>•<br>•<br>•|Nota de Remisión Electrónica<br>Comprobante de Donación Electrónico<br>Evento de Retorno<br>Evento de operaciones especiales|Ejemplo 2: Si el DTE obtuvo sello de recepción el 25 de abril<br>del 2026 a las 00:30:00 a.m. el contribuyente emisor tendrá<br>hasta las 23:59:59 del décimo día hábil del mes siguiente (15<br>de mayo del 2026) para poder enviar el evento de invalidación<br>para dicho DTE.|
|•|Factura Electrónica|Podrá realizarse dentro del plazo de tres meses contados a<br>partir del otorgamiento del Sello de Recepción del documento.|
|•<br>•|Factura de Exportación Electrónica<br>Factura Sujeto Excluido Electrónico|Ejemplo: Si el DTE obtuvo el Sello de Recepción el 11-11-2025<br>a las 7:30:00 (de la mañana) el contribuyente emisor tendrá<br>hasta el 11-02-2026 a las 23:59:59 para poder enviar el<br>evento de<br>invalidaciónpara dicho DTE.|



**Plazos para generar el evento de invalidación en relación a la “Fecha de Generación” del DTE/Evento** 

|**Docum**|**ento Tributario Electrónico/Evento**|**Fecha a ingresar en el campo “fecha del evento” en la**<br>**estructura del Evento de Invalidación**|
|---|---|---|
|•|Comprobante de Crédito Fiscal||
||Electrónico||
|•<br>•<br>•|Nota de Crédito Electrónica<br>Nota de Débito Electrónica<br>Comprobante de Retención<br>Electrónico|Debe ingresar la misma fecha detallada en campo “Fecha de<br>Generación/Fecha del evento" del DTE/Evento a invalidar<br>Ejemplo: Si el DTE contiene fecha de generación 29-03-2026 y<br>fue transmitido el 04-04-2026|
|•<br>•|Comprobante de Liquidación Electrónico<br>Documento Contable de liquidación<br>Electrónico|En campo Fecha del evento debe ingresar 29-03-2026|
|•|Nota de Remisión Electrónica||
|•|Comprobante de Donación Electrónico||
|•|Evento de Retorno||
|•|Evento de operaciones especiales||



Manual Funcional del Sistema de Transmisión V 2.0 

11 



<!-- PAGE 15 / 80 -->



- Podrá ingresar "Fecha del Evento" con un máximo de 3 meses posteriores a la “Fecha de Generación” detallada en el DTE al 

- • Factura Electrónica que aplique el evento • Factura de Exportación Electrónica • Factura Sujeto Excluido Electrónico Ejemplo: Si el DTE contiene fecha de generación 09-01-2026 podrá ingresar fecha del evento desde el 09-01-2026 hasta el 09-04-2026. 

#### **Ejemplos de aplicación por tipos de DTE** 

1. Cuando el evento de invalidación se aplique a CCFE, NRE, NCE, NDE, CRE, CLE, DCLE, CDE, EOE o ER debe ingresar en campo "Fecha del Evento” la misma “Fecha de Generación” /fecha del evento” detallada en el DTE/evento a invalidar y podrá realizar la transmisión del Evento de Invalidación dentro de un plazo máximo de 10 días hábiles posteriores a la fecha de transmisión del documento a invalidar. 

|**Descripción**|**Fecha de**<br>**generación**<br>**DTE**|**Fecha de**<br>**transmisión**<br>**DTE**|**Fecha que podrá**<br>**detallar en campo**<br>**Fecha del Evento**<br>**en el evento de**<br>**invalidación**|**Fecha en que po**<br>**el Evento de i**<br>**Desde**|**drá transmitir**<br>**nvalidación**<br>**Hasta**|
|---|---|---|---|---|---|
|CCFE, NRE, NCE, NDE, CRE, CLE, DCLE o CDE<br>Se transmite el mismo día que se genera|09-03-2026|09-03-2026|09-03-2026|09-03-2026|20-04-2026|
|CCFE, NRE, NCE, NDE, CRE, CLE, DCLE o CDE<br>se transmite DTE con fecha de un día<br>posterior a la transmisión|10-03-2026|09-03-2026|10-03-2026|09-03-2026|20-04-2026|
|CCFE, NRE, NCE, NDE, CRE, CLE, DCLE o CDE<br>fecha de generación y fecha de<br>transmisión en diferentes periodos|01-03-2026|15-04-2026|01-03-2026|15-04-2026|15-05-2026|



2. Cuando el evento de invalidación se aplique a FE, FEXE o FSEE podrá ingresar "Fecha del Evento" con un máximo de 3 meses posteriores a la “Fecha de Generación” detallada en el DTE al que aplique el evento y podrá realizar la transmisión del evento de invalidación hasta un máximo de 3 meses posteriores a la Fecha de Transmisión del DTE. 

|**Descripción**|**Fecha de**<br>**generación**<br>|**Fecha de**<br>**transmisión**<br>|**Fecha que pod**<br>**campo "Fecha**<br>**el evento de**|**rá detallar en**<br>**del Evento" en**<br>**invalidación**|**Fecha en que p**<br>**el Evento de**|**odrá transmitir**<br>**invalidación**|
|---|---|---|---|---|---|---|
||**DTE**|**DTE**|**Desde**|**Hasta**|**Desde**|**Hasta**|
|FE, FEXE o FSEE se transmite el mismo día<br>que se genera|09-10-2025|09-10-2025|09-10-2025|09-01-2026|09-10-2025|09-01-2026|
|FE, FEXE se transmite DTE con fecha de un<br>día posterior a la transmisión|10-10-2025|09-10-2025|10-10-2025|10-01-2026|09-10-2025|09-01-2026|
|FE, FEXE o FSEE fecha de generación y<br>fecha de transmisión en diferentes<br>periodos|09-10-2025|25-11-2025|09-10-2025|09-01-2026|25-11-2025|25-02-2026|
|FE, FEXE o FSEE con fecha de generación<br>diferente a la fecha de transmisión dentro<br>del mismo periodo|09-10-2025|30-11-2025|09-10-2025|09-01-2026|30-11-2025|28- 02-2026|
|CCFE, NRE, NCE, NDE, CRE, CLE, DCLE o<br>CDE se transmite DTE con fecha de<br>generación diferente a la fecha de<br>transmisión dentro del mismo periodo|09-10-2025|31-10-2025|09-10-2025|09-10-2025|31-10-2025|14-11-2025|



Manual Funcional del Sistema de Transmisión V 2.0 

12 



<!-- PAGE 16 / 80 -->



No se otorgará Sello de Recepción al Evento de Invalidación transmitido fuera de los plazos establecidos, por lo que el DTE aún conservará su validez original. 

#### **Condiciones especiales** 

Uso del campo **“Tipo de Invalidación”:** en este campo debe ingresar por medio de un código según catálogo “CAT- 024 Motivo del evento”, el motivo por el cual se invalidará el documento, teniendo para elección las tres opciones siguientes: 

1. Error en la Información del Documento Tributario Electrónico a invalidar. 

2. Rescindir de la operación realizada. 

3. Otro (esta opción incluye el cambio de bienes /servicios). 

Si el campo “tipo de invalidación” está lleno con la opción 1 o 3, es requerido que antes de transmitir el “Evento de Invalidación” del DTE/Evento, previamente se genere, transmita y obtenga el Sello de Recepción el documento/evento que reemplazará al invalidado; ya que la estructura del Evento de Invalidación solicita el “Código de Generación del documento que reemplazará al documento invalidado” en la sección “Detalle de aplicación del evento”. Esta condición no tendrá efecto cuando el documento a invalidar sea Nota de Crédito, Comprobante de Liquidación, Evento de Retorno o Evento de operaciones especiales. 

Si el Tipo de la invalidación es rescindir la operación (opción 2) deberá ingresar únicamente el código de generación del DTE a invalidar; esto aplica también cuando el documento a invalidar sea Nota de Crédito Electrónico o Comprobante de Liquidación Electrónico, en campo “Código de generación del documento que reemplaza al documento invalidado” deberá ingresar la palabra null. 

#### **Ejemplo 1 Invalidación Error en la Información del Documento Tributario Electrónico a invalidar u otro:** 

Se emite factura electrónica con Código de Generación FF54E9DB-79C3-42CEB432EC522C97EFB9 con error en el nombre del receptor que obtuvo su Sello de Recepción, por lo que es necesario invalidar la factura errónea y emitir factura electrónica con nombre correcto. El emisor deberá primero emitir la nueva factura electrónica con el nombre correcto que tendrá un nuevo Código de Generación (AD54E9BB-79A3-42AE-B432-EC522C97EFB7), transmitirla y recibir su respectivo Sello de Recepción, posteriormente deberá generar el Evento de Invalidación describiendo el campo “tipo de invalidación” el código 1 o 3 y en la sección “Detalle de aplicación del evento” la información del DTE a invalidar, que incluye el “Código de generación del DTE a invalidar” (Factura incorrecta FF54E9DB-79C3-42CE-B432-EC522C97EFB9), y deberá ingresar el “Código de generación del documento que corrige la operación” (segunda factura emitida y recibida AD54E9BB-79A3-42AE-B432-EC522C97EFB7). 

#### **Ejemplo 2 Invalidación por Rescindir de la operación realizada:** 

Se emite factura electrónica por la venta de 2 sillas, por diferentes razones, el comprador decide regresar el producto solicitando la devolución del valor pagado, por tanto, no procede la emisión de un nuevo documento. Por lo tanto en el campo “Tipo de invalidación” deberá ingresar el código 2, para lo que el emisor deberá describir la información de la factura electrónica a invalidar en la sección “Detalle de aplicación del evento” y en el campo “Código de generación que reemplaza al invalidado” deberá ingresar la palabra null. 

Cuando se invaliden facturas en las que no se detalle al receptor los campos “Tipo de documento de identificación (Receptor)”, “Número de documento de Identificación (Receptor)” y “Nombre (Receptor)”, deberán completarse 

Manual Funcional del Sistema de Transmisión V 2.0 

13 



<!-- PAGE 17 / 80 -->



como “null” (solo cuando los campos de la factura también se encuentren completados como “null”, en caso que lo detalle deberá ingresar los mismos datos contenidos en la FE a invalidar). 

En el evento de invalidación son de carácter obligatorio los siguientes campos: 

1. “Nombre de quien realiza el evento 

2. “Tipo de documento de identificación de quien realiza el evento” 

3. “Número de documento de Identificación de quien realiza el evento” 

4. “Nombre de quien solicita el evento” 

5. “Tipo de documento de identificación de quien solicita el evento” 

6. “Número de identificación de quien solicita el evento” 

#### **Invalidación de los documentos relacionados con otro DTE.** 

Cuando se requiera invalidar un DTE relacionado con otro DTE, además de considerar los procesos establecidos en el evento de invalidación deberá tomar en cuenta los procesos que se detallan en la siguiente tabla: 

|**DTE a**<br>**invalidar**|**Proceso**|**Doc. Relacionado**|
|---|---|---|
||Si el tipo de invalidación es 1 o 3 deberá generar y transmitir la nueva factura con la que corregirá la<br>operación, para posteriormente invalidar la factura incorrecta, ingresando en el evento de invalidación tanto<br>el código de generación de la factura a invalidar (Factura incorrecta) como el código de generación de la<br>factura que la sustituye (factura correcta).<br>Si el tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación de la FE incorrecta, ingresando en campo “código de generación del documento que<br>reemplaza al invalidado” la palabra null.||
|FE|Notas:<br>1.<br>Si la factura tiene documento relacionado no es necesario invalidar previamente el mismo para<br>invalidar la FE.|NR/CLE/DCL|
||2.<br>Cuando la factura esté relacionada a un CRE, CLE o DCLE, puede invalidarse (sin necesidad de<br>invalidar el documento donde se relacionó)<br>3.<br>Cuando la FE esté relacionado a un Evento de Retorno con estado validado, no podrá aplicar<br>evento de invalidación (primero debe invalidar el Evento de retorno).||
|CCFE|Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el Sello de Recepción del nuevo CCFE<br>con el que corregirá la operación, para posteriormente realizar proceso de invalidación del CCFE incorrecto,<br>ingresando en la estructura del evento de invalidación tanto el código de generación del documento a<br>invalidar (CCFE incorrecto) como el código de generación del CCFE que sustituye la operación (CCFE correcto).<br>Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación del CCFE incorrecto, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.<br>No hay necesidad de invalidar los documentos que fueron relacionados al CCFE para invalidarlo (Nota de<br>Remisión, Documento Contable de Liquidación o Comprobante de liquidación).<br>Notas:<br>1.<br>Cuando el CCFE esté relacionado a una Nota de Crédito o Nota de Débito con estado validado no<br>podrá aplicar evento de invalidación(primero debe invalidar la Nota de Crédito o Nota de Débito).|NR /DCL /CL|



Manual Funcional del Sistema de Transmisión V 2.0 

14 



<!-- PAGE 18 / 80 -->



|**DTE a**<br>**invalidar**|**Proceso**|**Doc. Relacionado**|
|---|---|---|
||2.<br>Si el CCFE tiene documento relacionado no es necesario invalidar previamente el mismo para<br>invalidar el CCFE.<br>3.<br>Cuando el CCCFE esté relacionado a un CRE puede invalidarse (sin necesidad de invalidar el<br>documento donde se relacionó).||
|NRE|Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el sello de recepción de la nueva NRE<br>con la que corregirá la operación, posteriormente realizar proceso de invalidación de la NRE incorrecta,<br>ingresando en la estructura del evento de invalidación tanto el código de generación del documento a<br>invalidar como el código de generación de la NRE que contiene la información correcta.<br>Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación de la NRE incorrecta, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.<br>Notas:<br>1.<br>Si la NRE tiene documento relacionado no es necesario invalidar previamente el mismo para<br>invalidar la NRE.<br>2.<br>Cuando la NRE esté relacionada a FE, CCFE o FEXE, puede invalidarse (sin necesidad de invalidar el<br>documento donde se relacionó).|F/CCF/FEX|
|NCE|Si el tipo de invalidación es 1 o 3 deberá realizar el evento de invalidación referenciando únicamente el código<br>de generación de la NCE incorrecta e ingresando en campo “código de generación del documento que<br>reemplaza al invalidado” la palabra null. Una vez invalidada la NCE incorrecta deberá generar, transmitir y<br>obtener el sello de recepción de una nueva NCE con la que corregirá la operación.<br>Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación de la NCE incorrecta, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.<br>Notas:<br>1.<br>Si la NCE tiene documento relacionado no es necesario invalidar previamente el mismo para<br>invalidar la NCE.<br>2.<br>Cuando la NCE esté relacionada a un CLE, puede invalidarse (sin necesidad de invalidar el<br>documento donde se relacionó).|CCF/CR|
||Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el sello de recepción de una nueva<br>NDE con la que corregirá la operación, posteriormente realizar la invalidación de la NDE incorrecta,<br>ingresando en el evento de invalidación tanto el código de generación de la NDE a invalidar (incorrecta) como<br>el código de generación de la NDE que la sustituye (correcta)||
|NDE|Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación de la NDE incorrecta, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.<br>Notas:<br>1.<br>Si la NDE tiene documento relacionado no es necesario invalidar previamente el mismo para<br>invalidar la NDE.<br>2.<br>Cuando la NDE esté relacionada a un CLE, puede invalidarse (sin necesidad de invalidar el<br>documento donde se relacionó)|CCF/ CR|
|CRE|Si el tipo de invalidación es 1 o 3, deberá generar, transmitir y obtener el sello de recepción de un nuevo CRE<br>con el que corregirá la operación, posteriormente generar y transmitir el evento de invalidación del CRE<br>incorrecto, ingresando en la estructura de dicho evento, tanto el código de generación del documento a|N/A sección de<br>relacionados|



Manual Funcional del Sistema de Transmisión V 2.0 15 



<!-- PAGE 19 / 80 -->



|**DTE a**<br>**invalidar**|**Proceso**|**Doc. Relacionado**|
|---|---|---|
||invalidar (CRE incorrecto) como el código de generación del documento que sustituye al anterior (CRE<br>correcto).<br>Si el tipo de invalidación es la opción 2, deberá   generar y transmitir el evento de invalidación referenciando<br>únicamente el código de generación del CRE incorrecto, ingresando en campo “código de generación del<br>documento que reemplaza al invalidado” la palabra null.<br>Notas:<br>1.<br>Cuando el CRE esté relacionado a una Nota de Crédito o Nota de Débito con estado validado no<br>podrá aplicar evento de invalidación (primero debe invalidar en la Nota de Crédito o Nota de<br>Débito.<br>2.<br>Si el CRE tiene documento relacionado no es necesario invalidar previamente el mismo para<br>invalidar el CRE.||
||Si el tipo de invalidación es 1 o 3 deberá realizar el evento de invalidación referenciando únicamente el código<br>de generación del CLE incorrecto e ingresando en campo “código de generación del documento que<br>reemplaza al invalidado” la palabra null. Una vez invalidado el CLE incorrecto deberá generar, transmitir y<br>obtener el sello de recepción de un nuevo CLE con el que corregirá la operación.||
|CLE|Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación del CLE incorrecto, ingresando en campo “código de generación del documento que<br>reemplaza al invalidado” la palabra null.<br>Notas:<br>1.<br>Para invalidar CLE no es necesario invalidar los documentos informados (FE, CCFE, NCE, NDE,<br>FEXE).<br>2.<br>Después que se realice la invalidación del CLE, los documentos informados estarán disponibles<br>para que sean ingresados en un nuevo CLE.|N/A sección de<br>relacionados|
|DCLE|Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el sello de recepción para un nuevo<br>DCLE con el que corregirá la operación, posteriormente realizará la invalidación del DCLE incorrecto,<br>ingresando en la estructura de dicho evento, tanto el código de generación del documento a invalidar (DCLE<br>incorrecto) como el código de generación del documento que sustituye al anterior (DCLE correcto).<br>Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación del DCLE incorrecto, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.|N/A sección de<br>relacionados|
||Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el sello de recepción de la FEXE con la<br>que corregirá la operación y posteriormente invalidará la FEXE incorrecta, ingresando en el evento de<br>invalidación tanto el código de generación de la FEXE a invalidar (incorrecta) como el código de generación<br>de la FEXE que la sustituye (correcta).||
|FEXE|Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación de la FEXE incorrecta, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.<br>Nota:<br>1. Cuando la FEXE esté relacionado a un Evento de Retorno con estado validado no podrá aplicar evento de<br>invalidación (primero debe invalidar el Evento de retorno).|NRE|
|FSEE|Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el sello de recepción de la FSEE con la<br>que corregirá la operación y posteriormente invalidará la FSEE incorrecta, ingresando en el evento de<br>invalidación tanto el código de generación de la FSEE a invalidar (incorrecta) como el código de generación<br>de la FSEE que la sustituye (correcta).|N/A sección de<br>relacionados|



Manual Funcional del Sistema de Transmisión V 2.0 

16 



<!-- PAGE 20 / 80 -->



|**DTE a**<br>**invalidar**|**Proceso**|**Doc. Relacionado**|
|---|---|---|
||Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando únicamente<br>el código de generación de la FSEE incorrecta, ingresando en campo “código de generación del documento<br>que reemplaza al invalidado” la palabra null.<br>Nota:<br>1. No podrá invalidarse FSEE que tenga aplicado Evento de Retorno activo. (primero debe invalidar el evento<br>de retorno).||
|CDE|Si el tipo de invalidación es 1 o 3 deberá generar, transmitir y obtener el sello de recepción del CDE con el<br>que corregirá la operación y posteriormente invalidará el CDE incorrecto, ingresando en el evento de<br>invalidación tanto el código de generación de la CDE a invalidar (incorrecto) como el código de generación<br>del CDE que lo sustituye (correcto).<br>Si el Tipo de invalidación es 2 deberá generar y transmitir el evento de invalidación referenciando<br>únicamente el código de generación del CDE incorrecto, ingresando en campo “código de generación del<br>documento que reemplaza al invalidado” la palabra null.|N/A sección de<br>relacionados|
|EOE|Deberá generar y transmitir el evento de invalidación referenciando únicamente el código de generación del<br>Evento de Operaciones Especiales incorrecto en el campo “Código de generación del DTE a invalidar” y en<br>“código de generación del documento que reemplaza al invalidado” la palabra null.|N/A sección de<br>relacionados|
|ER|Deberá generar y transmitir el evento de invalidación referenciando únicamente el código de generación del<br>Evento de Retorno incorrecto en el campo “Código de generación del DTE a invalidar” y en “código de<br>generación del documento que reemplaza al invalidado” la palabra null.<br>1.<br>No es necesario invalidar previamente los documentos relacionados para invalidar este evento<br>2.<br>Cuando el ER esté relacionado a un CLE, puede invalidarse (sin necesidad de invalidar el documento<br>donde se relacionó).|FE, FEXE y FSEE|



## **VIII. Evento de Contingencia** 

La contingencia se puede definir como un caso fortuito o fuerza mayor que le impide al facturador electrónico, transmitir de forma inmediata los documentos electrónicos a la Administración Tributaria. 

Evento de Contingencia es un mensaje de datos firmado electrónicamente que se relaciona con uno o varios Documento Electrónico, que se generan en ocasión de casos que impiden realizar la transmisión de los DTE. 

Cuando por motivo de fuerza mayor, el emisor no pueda realizar la transmisión de los documentos electrónicos a la Administración Tributaria, este podrá generar los documentos electrónicos con sus propios procesos de contingencia. Los contribuyentes son los encargados de diseñar y ejecutar en sus sistemas las condiciones que les permitan generar los documentos electrónicos, es decir, deben prever todos los medios técnicos y administrativos adecuados, así como los mecanismos alternativos que les garanticen el funcionamiento de sus servidores y equipos en el proceso de la emisión y resguardo de los documentos electrónicos, para que una vez superada la situación que les impida realizar la transmisión, estos puedan transmitir el evento de contingencia incorporando el detalle de todos los documentos generados durante el periodo en el que ocurrió la situación de fuerza mayor que le impidió transmitir dichos documentos a la Administración Tributaria de manera normal. 

Manual Funcional del Sistema de Transmisión V 2.0 

17 



<!-- PAGE 21 / 80 -->



Se podrán emitir en contingencia los siguientes documentos electrónicos: 

1. Factura Electrónica 

2. Comprobante de Crédito Fiscal Electrónico 

3. Nota de Remisión Electrónica 

4. Nota de Crédito Electrónica 

5. Nota de Debito Electrónica 

6. Comprobante de Retención 

7. Factura de Exportación Electrónica 

8. Factura de Sujeto Excluido Electrónica 

9. Evento de Retorno 

Cuando se haga imposible la transmisión de estos documentos hacia la Administración Tributaria, el contribuyente podrá seguir operando con su sistema de respaldo para operar fuera de línea, la estructura que se utilizará para poder generar estos documentos en contingencia, será la misma estructura establecida por la DGII para realizar transmisión normal por tipo de documento, con algunas particularidades del llenado de ciertos campos los cuales se detallan a continuación: 

**Modelo de Facturación:** Debe ingresar la opción 2 “Modelo de Facturación Diferido" 

**Tipo de Transmisión:** Debe ingresar la opción 2 "Transmisión por Contingencia" 

**Tipo de Contingencia:** Debe ingresar un código que identifique el tipo de contingencia, de acuerdo a catálogo CAT- 005 Tipo de Contingencia. 

**Motivo de Contingencia:** Deberá explicar el motivo de contingencia cuando en campo "tipo de contingencia" se ingrese la opción 5 - Otro motivo (si se requiere podrá ampliar el motivo de contingencia cuando tipo de contingencia sea diferente a 5). 

#### **Proceso para transmitir documentos electrónicos en contingencia** 

Los contribuyentes emisores están obligados a transmitir a la Administración Tributaria los documentos generados en contingencia. 

Para poder transmitir estos documentos electrónicos generados en contingencia, la Administración Tributaria ha establecido el proceso de transmisión diferida que se describe a continuación: 

#### **Modelo de recepción para los DTE en generados contingencia.** 

#### **MOMENTO 1** 

- a) Ocurrencia de fuerza mayor que impida al contribuyente emisor la transmisión del DTE, en los siguientes casos: Falla en conexiones del sistema del emisor Falla en el suministro del servicio de Internet por el proveedor del emisor 

- b) Falla en el suministro del servicio de energía eléctrica por el proveedor del emisor que le impidan realizar la transmisión de los documentos electrónicos 

- c) No disponibilidad de sistema del MH para realizar la recepción 

Manual Funcional del Sistema de Transmisión V 2.0 

18 



<!-- PAGE 22 / 80 -->



El contribuyente podrá identificar que está en contingencia cuando al momento de enviar un DTE, el Sistema de transmisión DTE no responda, o si al momento de enviar un DTE, el servicio del emisor falla y no procesa la respuesta del servicio de recepción. Cuando tengan ocurrencia estos hechos se deberá aplicar uno a uno los pasos establecidos en la “Política de reintentos”. Una vez aplicada esta política de reintentos y no se logra la transmisión ni la recepción de los DTE, el contribuyente deberá operar en contingencia. 

Debido a que estos documentos no pueden ser transmitidos a la Administración Tributaria de manera normal, sino que posteriormente de haber superado la situación que impidió realizar la transmisión en línea, el emisor deberá en el momento de la generación del documento electrónico, ingresar en el campo “Modelo de facturación” la opción “2 “( modelo de facturación Diferido), en el campo “tipo de transmisión” la opción 2 (transmisión por contingencia) y además en el campo “tipo de contingencia” ingresar el motivo de la contingencia con base al catálogo establecido. 

El contribuyente emisor continuará generando y firmando el documento tributario en estado transitorio, entregando el archivo en el formato autorizado (Json) dando cumplimiento con los requisitos de la estructura establecida por la Administración Tributaria para cada tipo de documento tributario electrónico y con el llenado indicado para los campos específicos junto a su Representación Gráfica a los clientes. 

#### **MOMENTO 2** 

**Envío del evento de contingencia por el contribuyente emisor.** Una vez superada la causa de fuerza mayor que dio origen a los documentos electrónicos en contingencia, el contribuyente emisor deberá de generar, firmar y transmitir un **“Evento de Contingencia”.** Para transmitir el evento antes mencionado el emisor de documentos tributarios electrónicos tendrá un plazo máximo de 24 horas para transmitir el evento, contadas a partir del cese de la situación de fuerza mayor que provocó la contingencia. 

Mediante el evento de contingencia se deben informar los Códigos de Generación de todos los documentos electrónicos transitorios que fueron generados mientras ocurrió la situación de fuerza mayor, en la sección “Información del documento/ evento en contingencia” donde podrá describir desde 1 hasta un máximo de 1000 documentos electrónicos generados en contingencia. 

Una vez que el contribuyente emisor transmita el evento de contingencia, la Administración Tributaria lo recibirá y realizará el proceso de verificación del cumplimiento de la estructura de datos establecida y una vez habiendo superado los mismos, dará respuesta a través de un Sello de Recepción al citado evento. 

Cuando el evento de contingencia no cumpla con la estructura de datos establecida se rechazará, se regresará por medio del Sistema de transmisión DTE al emisor, indicando el error identificado para su corrección en un plazo máximo de 24 horas después de que el evento haya sido rechazado. El emisor deberá solventar, para transmitir nuevamente el evento de contingencia, y después de corregidos todos los errores debe volver a transmitirlos para obtener el Sello de Recepción. 

El envío del Evento de Contingencia es un requisito previo para poder transmitir el lote de los citados documentos electrónicos, para que puedan ser procesados por la Administración Tributaria. 

Manual Funcional del Sistema de Transmisión V 2.0 

19 



<!-- PAGE 23 / 80 -->



#### **MOMENTO 3** 

**Transmisión de documentos electrónicos en contingencia.** Una vez el **“Evento de Contingencia”** obtenga su Sello de Recepción, el emisor deberá transmitir un archivo Json firmado electrónicamente que compile el lote de los documentos electrónicos generados en contingencia que fueron informados previamente en el evento (Es decir que no podrán incluir en este lote, documentos que no hayan sido informados en el Evento Contingencia o que se realizaron en transmisión). 

Se tendrá un plazo máximo de 72 horas contadas a partir del otorgamiento del Sello de Recepción del Evento de Contingencia para poder enviar el lote de todos los documentos electrónicos en transitorio que fueron informados en dicho evento, para que una vez transmitidos y superados estos requisitos, obtendrán el Sello de Recepción correspondiente a cada uno de los documentos previamente informados en el evento de contingencia. 

#### **Notas importantes:** 

- Al momento de enviar los documentos para la obtención del Sello de Recepción no debe cambiar los campos Modelo de facturación”, “tipo de transmisión”, “tipo de contingencia” y “motivo de la contingencia” con las que fueron generados fuera de línea, estos deben mantener sus datos de origen; a través de estos campos sistema aplicará validación comparando el DTE y el evento de Contingencia donde se ha informado. 

- Si el contribuyente no realiza la transmisión del evento de contingencia o no realiza la transmisión de los DTE reportados en el evento dentro del plazo establecido, deberá informar y justificar por escrito a la DGII, las razones del incumplimiento y solicitar autorización de prórroga del plazo establecido, a efecto que se permita la correspondiente transmisión del evento y de los citados documentos. 

- Los campos “Nombre del responsable del establecimiento”, “Tipo de documento de identificación”, “Número de documento de identificación del responsable” son de carácter obligatorio. 

- Queda facultada la Administración Tributaria para revocar la autorización otorgada para emitir DTE cuando verifique que el contribuyente no resguarda la seguridad, cumplimiento y exactitud de los impuestos causados, de acuerdo a las disposiciones legales pertinentes y a lo establecido en la respectiva autorización. 

#### **Estructura para transmisión de evento de contingencia** 

El detalle de la estructura para la transmisión del evento de contingencia se encuentra en la Normativa de Cumplimiento de los DTE. 

Manual Funcional del Sistema de Transmisión V 2.0 

20 



<!-- PAGE 24 / 80 -->



## **IX. Evento de Operaciones Especiales** 

Este evento está diseñado para que los contribuyentes informen sus operaciones que se han documentado con: 

- a) Facturas Simplificadas (Conforme al artículo 107 inc. Cuarto del CT) 

- b) Comprobantes de Control Interno (autorizados de conformidad al art. 113 CT) 

En el Evento de Operaciones Especiales los contribuyentes informarán los documentos emitidos con los que respaldan sus operaciones; los documentos que se detallen en dicho evento deben tener correspondencia con el periodo tributario que se informa. 

#### **Condiciones para aplicar evento:** 

1. El evento debe transmitirse con Modelo de Facturación Previo y Tipo de transmisión normal. 

2. Debe generar y enviar el evento haciendo uso de la estructura y formatos establecidos por la Administración Tributaria. 

3. Cuando los documentos de origen correspondan a venta por cuenta de terceros, deberán ser informado por el mandante no por el emisor. 

4. Los documentos que se agreguen al evento solo podrán informarse una vez y no debe detallarse en eventos posteriores; excepto si fue anulada la operación y por ende su documento de respaldo; en cuyo caso deberá informarlo en un nuevo evento. 

5. Los documentos anulados deben informarse una vez en un evento, separado de los documentos activos; debiendo llenar además de la información correspondiente con el tipo de documento que este informado el campo “Código de generación del EOE de Referencia” con el código de generación donde se informó previamente el documento anulado con estado activo. 

6. Cuando los documentos a informar en el evento sean Factura Simplificada podrá reportar un máximo de 2000 ítem, informando por rango los correlativos emitidos haciendo uso de los campos Doc. Del y Doc. Al. 

7. Cuando el documento a informar sea Factura Simplificada debe corresponder al periodo informado según la “Fecha del Evento”. 

8. Cuando los documentos a informar en el evento sean Comprobantes de Control Interno podrá reportar un máximo de 2000 ítem, pudiendo informar por rango los correlativos emitidos haciendo uso de los campos Doc. Del y Doc. Al, o si lo requiere podrá detallarlos uno a uno haciendo uso del campo” Documento origen”. Para este caso no podrá detallar por rangos y uno a uno en el mismo evento. 

9. Los valores a detallar en el campo “Precio” deben ingresarse sin IVA (incluyendo las operaciones documentadas con factura simplificada) 

10. Cuando en el evento los documentos se detallen uno a uno en el campo cantidad debe ingresar 1. 

11. Cuando en los documentos se detallen por rangos es decir cuando se haga uso de los campos Doc. Del y Doc. deberá ingresar null en los campos Documento origen” y “Fecha del documento origen”. 

#### **A) Detalle del Evento de Operaciones Especiales con Comprobantes de Control Interno** 

Los comprobantes de control interno podrán detallarse uno a uno o por rangos, dependiendo de la naturaleza de las operaciones, siempre respetando la condición de no detallar documento de origen uno a uno y llenar los campos “Doc. Del” y “Doc. Al” en el mismo evento. 

Manual Funcional del Sistema de Transmisión V 2.0 

21 



<!-- PAGE 25 / 80 -->



**Ejemplo 1. Detalle del Evento de Operaciones Especiales con Comprobantes de Control Interno uno a uno** 

#### Sección cuerpo 



<!-- Start of picture text -->
Descripció<br>n del<br>DCIXXX<br>1  null  97  27/2/2026  1  document null  $200.42  0  0  $200.42  20<br>XBC<br>o que  null<br>respalda<br>la operación<br>Descripció<br>n del<br>DCIX55<br>2  null  97  28/2/2026  1  document null  $200.00  0  0  $200.00  20<br>5C<br>o que  null<br>respalda<br>la operación<br>Resumen<br>Total de Operaciones no sujetas  $ 0.0<br>Total de Operaciones exentas  $ 0.0<br>Total de Operaciones Gravadas  $ 400.42<br>Sub-Total  $ 400.42<br>Resumen Código del Tributo  20<br>Nombre del Tributo  Impuesto al Valor Agregado 13%<br>Valor del Tributo  $ 52.05<br>Total  $ 452.47<br>Cuatrocientos cincuenta y dos<br>Valor en Letras<br>con 47/100 dólares<br>N° de ítem  Código de  generación  del EOE de  Referencia  Tipo de  Documento  Documento  origen  Fecha del  documento  origen  Cantidad  Descripción  Doc. Del  Doc. Al  Precio  Unitario  Ventas No  jSuetas  Ventas  Exentas  Ventas  Gravadas  Código del  tributo<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión V 2.0 

22 



<!-- PAGE 26 / 80 -->



#### **Ejemplo 2. Detalle del Evento de Operaciones Especiales con Comprobantes de Control Interno -por rangos** 

Sección Cuerpo 

|**N° de ítem**<br>**Código de**<br>**generación**<br>**del EOE de**<br>**Referencia**|**Tipo de**<br>**Documento**|**Documento**<br>**origen**|**Fecha del**<br>|**documento**<br>**origen**|**Cantidad**|**Descripción**|**Doc. Del**|**Doc. Al**|**Precio**<br>**Unitario**|**Ventas No**<br>**Sujetas**|**Ventas**<br>**Exentas**|**Ventas**<br>**Gravadas**|**Código del**<br>**tributo**|
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|1<br>null|97|null|27/2|/2026|15|Descripción<br>del<br>documento<br>que<br>respalda la<br>operación|1|15|25.50|0|0|$382.50|20|
|||||||Descripción<br>del<br>||||||||
|2<br>null|97|null|28/2|/2026|1|documento<br>que<br>respalda la<br>operación|16|16|$30.20|0|0|$30.20|20|
|||||||Descripción<br>del<br>||||||||
|2<br>null|97|null|28/2|/2026|11|documento<br>que<br>respalda la|17|27|$20.00|0|0|$220.00|20|
|||||||operación||||||||
||||**Resu**|**men**||||||||||
|Total de Operaci|ones n|o sujeta|s|||$ 0.0||||||||
|Total de Operaci|ones ex|entas||||$ 0.0||||||||
|Total de Operaci|ones Gr|avadas||||$632.70||||||||
|Sub-Total||||||$ 632.70||||||||
|Resumen Código|del Tri|buto||||20||||||||
|Nombre del Trib|uto|||Impu|esto a|l Valor Agrega|do 13%|||||||
|Valor del Tributo||||||$ 82.25||||||||
|Total||||||$ 714.95||||||||
|Valor en Letras||||Sete|ciento|s catorce con<br>dólares|95/100|||||||



#### **B) Detalle del Evento de Operaciones Especiales con Facturas simplificadas.** 

Las Facturas Simplificadas solo podrán detallarse haciendo uso de los campos “Doc. Del” y “Doc. Al” 

Manual Funcional del Sistema de Transmisión V 2.0 

23 



<!-- PAGE 27 / 80 -->



#### **Ejemplo 1: Detalle Evento de Operaciones Especiales con facturas simplificadas activas** 

Si se emiten 100 facturas simplificadas en el siguiente detalle: 

Desde 1 a la 25 tuvieran $10.00 de Ventas Gravadas; de la 26 y 27 tienen un valor de $8.65 Ventas Gravadas, desde la 28 hasta la 98 tienen valor de $2.00 Ventas Gravadas, el correlativo 99 tiene valor de $7.50 en ventas gravadas y el correlativo 100 tienen valor de $10.00 de Ventas exentas (todos los valores no incluyen IVA) 

|**N° de ítem**<br>**Código de**<br>**generación**<br>**del EOE de**<br>**Referencia**|**Tipo de**<br>**Documento**|**Documento**<br>**origen**|**Fecha del**<br>**documento**<br>**origen**|**Cantidad**|**Descripción**|**Doc. Del**|**Doc. Al**|**Precio**<br>**Unitario**|**Ventas No**<br>**Sujetas**|**Ventas**<br>**Exentas**|**Ventas**<br>**Gravadas**|**Código del**<br>**tributo**|
|---|---|---|---|---|---|---|---|---|---|---|---|---|
|1<br>null|22|null|27/2/2026|25|Descripción<br>del<br>documento<br>que<br>respalda la<br>operación|1|25|$10.00|0|0|$250|20|
|2<br>null|22|null|27/2/2026|2|Descripción<br>del<br>documento<br>que<br>respalda la<br>operación|26|27|$8.65|0|0|17.30|20|
|3<br>null|22|null|27/2/2026|71|Descripción<br>del<br>documento<br>que<br>respalda la<br>operación|28|98|$2.00|0|0|$142.00|20|
|4<br>null|22|null|28/2/2026|1|Descripción<br>del<br>documento<br>que<br>respalda la<br>operación|99|99|7.5|||7.50|20|
|5<br>null|22|null|28/2/2026|1|Descripción<br>del<br>documento<br>que<br>respalda la<br>operación|100|100|||$10|0.0|null|



Manual Funcional del Sistema de Transmisión V 2.0 

24 



<!-- PAGE 28 / 80 -->



|**Resumen**|
|---|
|Total de Operaciones no sujetas<br>$ 0.0|
|Total de Operaciones exentas<br>$ 10|
|Total de Operaciones Gravadas<br>$416.8|
|Sub-Total<br>$426.8|
|Resumen Código del Tributo<br>20|
|Nombre del Tributo<br>Impuesto al Valor Agregado 13%|
|Valor del Tributo<br>$ 54.18|
|Total<br>$ 480.98|
|Valor en Letras<br>Cuatrocientos ochenta con 98/100<br>dólares|



#### **Ejemplo 2: Detalle Evento de Operaciones Especiales con facturas simplificadas anuladas** 

Si dentro de las facturas simplificadas informadas en el evento del ejemplo anterior a posterior existe la necesidad de anular las número 1, 2, 3, 27, 50, 51, 52 y 99 deberá presentar la información de la siguiente manera: 



<!-- Start of picture text -->
Descripción<br>28505550-C590-  del<br>1  2EAD-AEB6- 22  null  27/02/2026  3  documento  1  3  $10.00  0  0  $30.00  20<br>DECF472869AD  que respalda<br>la operación<br>Descripción<br>28505550-C590-  del<br>2  2EAD-AEB6- 22  null  27/02/2026  1  documento  27  27  $8.65  0  0  $17.30  20<br>DECF472869AD  que respalda<br>la operación<br>Descripción<br>28505550-C590-  del<br>3  2EAD-AEB6- 22  null  28/02/2026  3  documento  50  52  $2.00  0  0  $6.00  20<br>DECF472869AD  que respalda<br>la operación<br>Descripción<br>28505550-C590-  del<br>4  2EAD-AEB6- 22  null  28/02/2026  1  documento  99  99  7.5  0  0  $7.50  20<br>DECF472869AD  que respalda<br>la operación<br>N° de ítem  Código de  EOE de  Referencia  Tipo de  Documento  Documento  origen  Fecha del  documento  origen  Cantidad  Descripción  Doc. Del  Doc. Al  Precio  Unitario  Ventas No  jSuetas  Ventas  Exentas  Ventas  Gravadas  Código del  tributo<br>generación del<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión V 2.0 

25 



<!-- PAGE 29 / 80 -->



|**Resumen**|
|---|
|Total de Operaciones no sujetas<br>$ 0.0|
|Total de Operaciones exentas<br>$ 0.0|
|Total de Operaciones Gravadas<br>$60.80|
|Sub-Total<br>$60.80|
|Resumen Código del Tributo<br>20|
|Nombre del Tributo<br>Impuesto al Valor Agregado 13%|
|Valor del Tributo<br>$ 7.90|
|Total<br>$ 68.70|
|Valor en Letras<br>Sesenta y ocho con 70/100 dólares|



## **X. Evento de Retorno** 

El evento de retorno es un mensaje de datos firmado electrónicamente que se relaciona con un Documento Tributario Electrónico, que se genera a causa de retornos de bienes comprendidos en operaciones amparadas en DTE. 

#### **Podrá hacer uso de este evento cuando:** 

1. Ocurren reembolsos. 

2. Cuando se recuperan depósitos de envases o empaques. 

3. Para el caso de FEXE, la disminución en la exportación y del Remanente de Crédito Fiscal cuando proceda Respecto a FSEE, la disminución de la compra, en la cuantía contenida en el Evento. 

4. Cuando tengan ocurrencia alguna de las causas antes detalladas el contribuyente emisor podrá realizar un evento de retorno dentro del plazo máximo de 3 meses posteriores desde la fecha de obtención del sello de recepción del DTE al que se aplica el evento 

#### **Tipos de documentos a los que puede aplicar un evento de retorno.** 

1. Factura Electrónica 

2. Factura de Exportación Electrónica 

3. Factura de Sujeto Excluido Electrónica 

#### **Condiciones para aplicar evento de retorno:** 

1. Debe generarse haciendo uso de la estructura establecida por la Administración Tributaria. 

2. Podrá aplicar este evento a un máximo de 50 DTE del mismo tipo referenciando una vez cada documento en la sección de documentos relacionados. 

3. Cuando el evento se aplique a más de un DTE todos los DTE que se relacionen deben corresponder al mismo Emisor, Receptor y Tercero. 

4. Podrá aplicar “n” eventos de retorno a un DTE siempre y cuando la suma de todos los eventos de retorno aplicados no exceda del valor de la FE, FSEE o FEXE al que se aplique. 

5. Solo podrá aplicar el evento dentro de un plazo máximo de 3 meses posteriores en relación a la fecha de obtención del sello recibido del DTE al que se aplica el evento. 

Manual Funcional del Sistema de Transmisión V 2.0 

26 



<!-- PAGE 30 / 80 -->



6. Solo puede aplicarse a FE, FSEE o FEXE que haya obtenido sello de recepción, no podrá aplicar evento a Documento Electrónicos Transitorios. 

7. En situaciones de fuerza mayor este evento podrá transmitirse con modelo de recepción diferido y tipo de transmisión por contingencia 

#### **Proceso para transmitir el evento.** 

El emisor debe generar el evento de retorno con la estructura determinada por la Administración Tributaria, en formato Json y transmitirlo desde su gestor de Facturación Electrónica a la administración tributaria, quien recibe y revisa la información; si el evento cumple las reglas de validación recibe el Sello de recepción, caso contrario se rechazará el evento remitiendo un mensaje indicando el error identificado en el evento para su corrección. 

Este Evento podrá ser transmitido con modelo de facturación previo y diferido. 

#### **<u>Uso de los campos de fecha en el evento</u>** 

Para comprender mejor el uso de este campo es necesario diferenciar entre los conceptos de Fecha del evento, Fecha de Generación y Fecha de transmisión 

**Fecha del evento:** Se ingresará en la sección identificación del Evento de Retorno y es la fecha en que se aplica el evento al DTE. 

**Fecha de Generación:** Se ingresa en la sección Documentos Relacionados en la estructura del Evento de Retorno, en este campo debe detallar la misma fecha contenida en el campo “Fecha de Generación” del DTE al que se aplica el evento. 

**Fecha de transmisión:** Es la fecha en que se transmite el DTE o Evento a la Administración Tributaria, es decir, cuando se otorga el sello recepción. 

Dentro de la normalidad de las operaciones la Fecha de Generación de un DTE debe tener correspondencia con la Fecha de Transmisión, sin embargo, existen circunstancias en las que estas fechas no coinciden. 

Para poder aplicar Evento de Retorno a una FE, FEXE o FSEE se tendrá un plazo máximo de 3 meses contados a partir de la partir de fecha de generación detallada en la FE, FEXE o FSEE a la que aplique el evento, con excepción de las FE y FEXE que su emisor detalle las siguientes actividades económicas 21001, 21008, 46482, 46484, 46491 o 47721, en estos casos podrá ingresar fechas con un máximo de 2 años en referencia a la fecha de generación detallada en la FE o FEXE. 

1. Cuando el evento se aplique a FE, FEXE o FSEE posfechados el campo Fecha del evento permitirá ingresar fecha del evento hasta un máximo de 5 días posteriores en referencia a la fecha en que se está transmitiendo el evento siempre y cuando no sobrepase la fecha de generación detalladas en el DTE al que se aplique el evento y no sobrepasa al siguiente periodo tributario. 

2. No debe ingresar fecha que anteceda a la fecha de generación contenida en la FE, FEXE o FSEE. 

Manual Funcional del Sistema de Transmisión V 2.0 

27 



<!-- PAGE 31 / 80 -->



**Notas:** Cuando el evento se aplique a FEXE la información de los campos País, Régimen, Recinto, Tipo De Exportación en el Evento de Retorno deben coincidir con los detallados en la FEXE relacionada. Cuando se relacionen más de una DTE en el mismo evento deben tener correspondencia, es decir deben poseer el mismo País, Régimen, Recinto, Tipo de Exportación. 

#### **El proceso para aplicar el evento de retorno es el siguiente:** 

**1.** Primero debe generar el evento de retorno detallando el valor del bien a retornar y la información del receptor contenida en el DTE al que aplica el evento. 

**2.** El emisor del evento debe entregar al cliente (Receptor detallado en la Factura, factura de exportación o factura de sujeto excluido) por cualquier medio establecido en la Normativa de Cumplimiento de los DTE, el Archivo DTE y la Representación Gráfica del evento de retorno. 

**3.** Si existiera cambio de producto el emisor debe generar un nuevo DTE (Factura, factura de exportación o factura de sujeto excluido, según corresponda) por la nueva operación que documente el cambio. 

## **XI. Detalle de la Estructura Número de Control** 

|**Número de Control**|
|---|
|**Detalle de la Estructura Número de Control:**|



El Número de Control estará dividido en 4 Secciones las cuales son: 

**Primera Sección:** Esta Sección inicia con las letras "DTE" que hace referencia a los Documentos Tributarios Electrónicos. (Las siglas DTE deben escribirse en mayúsculas). 

**Segunda Sección:** Código de Tipo de Documento, en esta Sección se detallará el código numérico del tipo de documento a emitir según catálogo "CAT-002 Tipo de Documento" para Factura será 01 (y así respectivamente según el código asignado al documento a emitir). 

**Tercera Sección:** Esta Sección contiene 8 dígitos Alfanuméricos los cuales representan el código de Casa Matriz, sucursal o Agencia, Bodega y/o Predio o Patio (4 dígitos Alfanumérico) seguido del código de punto venta (4 dígitos alfanumérico). 

Validándose la siguiente estructura: Para las posiciones de la 1 a la 4: "M","B","S" o "P" + 3 números. Ej.: M001, B022, S044 o P507 Para las posiciones de la 5 a la 8: "P" + 3 números. Ej.: P007 

**Cuarta Sección:** Esta Sección contienen 15 dígitos numéricos los cuales serán secuenciales hasta su agotamiento; una vez se agote, debe iniciar nuevamente en 1 

Manual Funcional del Sistema de Transmisión V 2.0 

28 



<!-- PAGE 32 / 80 -->



Por lo tanto, el Número de Control está compuesto por 31 caracteres contando los guiones. 

Para efecto de ejemplo se presenta el siguiente número de Control donde es de aclarar, que por periodo de transición la tercera sección actualmente estaría compuesta por 8 caracteres numéricos. Este número de control no debe de repetirse en un año calendario. 

**Ejemplos de numero de control según tipo de documentos a emitir.** DTE-01-M001P025-000000000000001 para Factura Electrónica DTE-03- M001P025-000000000000001 para Comprobante de Crédito Fiscal Electrónico DTE-05- M001P025-000000000000001 para Nota de Crédito Electrónica 

## **XII. Tratamiento de campo "Cargos/Abonos que no afectan la base imponible”** 

Este campo está contemplado en las estructuras de Factura Electrónica, Comprobante de Crédito Fiscal Electrónico Factura de Exportación Electrónica, Nota de Crédito Electrónica, Nota de Débito Electrónica y Evento de Retorno 

Este campo tiene un uso particular, como su nombre lo indica estos valores no están sujetos a impuestos y serán sumados o restados según corresponda, hasta el campo “Total a Pagar” 

Para poder ingresar valores mayores a $0.0 en este campo debe primero al menos detallar un ítem con valor mayor a $0.0 como venta gravada, exenta o no sujeta. 

Para Factura Electrónica, Comprobante de Crédito Fiscal Electrónico, Nota de Crédito Electrónica, Nota de Débito Electrónica, Factura de Exportación Electrónica y Evento de Retorno estos valores se ingresarán en el cuerpo del documento como un ítem más y podrán detallarse “n” ítem. Es importante aclarar que en este campo se podrá ingresar valores positivos y negativos, se ingresarán valores positivos cuando se desee realizar un cargo al cliente el cual será sumado al total a pagar y se ingresará en valores negativos cuando se desee realizar alguna devolución o saldo a favor del cliente el cual restará el Total a Pagar. 

Cuando se adicionen ítems con esta particularidad deberá tomar en cuenta las indicaciones de llenado en la estructura de estos documentos en la sección cuerpo según sea el tipo de documento que se está generando, tal como se describen a continuación: 

El valor consolidado o sumatoria de todos los ítems para los que se ingresen valores en campo “Cargos/Abonos que no afectan la base imponible” se debe reflejar en el campo “Total Cargos/Abonos que no afectan la base imponible” en el resumen del documento. 

Manual Funcional del Sistema de Transmisión V 2.0 

29 



<!-- PAGE 33 / 80 -->



#### **" Cargos/Abonos que no afectan la base imponible”** 

Indicaciones de llenado para Factura, Comprobante de Crédito Fiscal, Nota de Crédito, Nota de Débito, Factura de Exportación y Evento de Retorno 

|**Sección cuerpo**|**Dato/Valor Requerido**|
|---|---|
|N° de ítem|Ingresar número de ítem que corresponda en secuencia<br>con el anterior descrito|
|Tipo de ítem|Según catálogo: bien, servicio, ambos|
|Cantidad|1|
|Código|null o código|
|Tributo sujeto a cálculo de IVA.|null|
|Unidad de Medida|99|
|Descripción|Ingresar descripción del cargo o pago|
|Precio Unitario|$0.00|
|Descuento por ítem|$0.00|
|Ventas No Sujetas|$0.00|
|Ventas Exentas|$0.00|
|Ventas Gravadas|$0.00|
|Código del Tributo|null|
|IVA Percibido|$0.00|
|IVA 13%|$0.00|
|IVA Retenido|$0.00|
|Retención Renta|$0.00|
|Seguro|$0.00|
|Flete|$0.00|
|Precio sugerido de venta|$0.00|
|Cargos/Abonos que no afectan la base imponible|Valor positivo o negativo correspondiente ($)|



#### **NOTAS** 

En tabla se muestra la forma en que debe llenar los campos, debe tener en cuenta la estructura por tipo de DTE, por ejemplo: 

1. Para el caso de factura de exportación no se encuentran en la estructura ventas no sujetas, ventas exentas, IVA 13%, Retención Renta, IVA Retenido e IVA Percibido. 

2. El campo IVA Retenido solo se encuentran en la estructura de para NCE, NDE y ER. 

3. Los campos IVA 13% e IVA Percibido solo se encuentran en la estructura de NCE y NDE. 

4. Los campos seguros, Flete solo se encuentran en la estructura de FEXE y Evento de Retorno. 

Manual Funcional del Sistema de Transmisión V 2.0 

30 



<!-- PAGE 34 / 80 -->



El valor consolidado o sumatoria de todos los ítems para los que se ingresen valores en campo “Cargos/Abonos que no afectan la base imponible” se debe reflejar en el campo “Total Cargos/Abonos que no afectan la base imponible” en el resumen del documento. 

## **XIII. Uso del Campo Fusiones y Otros** 

Este campo es de uso exclusivo para los contribuyentes absorbentes de otras sociedades, quienes legalmente continúan con las obligaciones y derechos del contribuyente absorbido. En este contexto las empresas absorbentes podrán emitir documentos que ajusten o invaliden documentos del contribuyente fusionado para dar continuidad a las obligaciones. 

Para poder hacer uso de este campo deberá reportar previamente a la Administración Tributaria. 

En este campo el absorbente podrá detallar el Número de Identificación Tributaria del fusionado a quien correspondía la operación ya sea que se encuentre como emisor, como receptor o como tercero. 

Ejemplo: Si el contribuyente “A” ya no existe y este fue absorbido por el contribuyente “D” (es decir, que el contribuyente “D” continuará con las obligaciones y derechos de las operaciones efectuadas con anterioridad del contribuyente “A”), se podría presentar los siguientes casos: 

1. **El absorbido es el Emisor en el DTE:** El contribuyente absorbente debe ingresar su NIT en el campo “NIT (Emisor)” y colocar el NIT del contribuyente Absorbido en el campo Fusiones y otros, manteniendo el “NIT (Receptor)” y NIT (Tercero) detallados en el DTE al que se aplica el ajuste. 

|**DTE**|**NIT (Emisor)**|**NIT (Receptor)**|**NIT por cuenta de terceros**|**Fusiones y otros**|
|---|---|---|---|---|
|CCFE|A|B|C||
|NCE|D|B|C|A|



2. **El absorbido es el Receptor en el DTE:** El contribuyente absorbente debe ingresar su NIT en el campo “NIT (Receptor)” y colocar el NIT del contribuyente Absorbido en el campo Fusiones y otros, manteniendo el “NIT (Emisor)” y NIT (Tercero) detallados en el DTE al que se aplica el ajuste 

|**DTE**|**NIT (Emisor)**|**NIT (Receptor)**|**NIT por cuenta de terceros**|**Fusiones y otros**|
|---|---|---|---|---|
|CCFE|B|A|C||
|NCE|B|D|C|A|



3. **El absorbido es el Tercero en el DTE:** El contribuyente absorbente debe ingresar su NIT en el campo “NIT del Tercero” y colocar el NIT del contribuyente Absorbido en el campo Fusiones y otros, manteniendo el “NIT (Emisor)” y NIT (Tercero) detallados en el DTE al que se aplica el ajuste 

|**DTE**|**NIT (Emisor)**|**NIT (Receptor)**|**NIT por cuenta de terceros**|**Fusiones y otros**|
|---|---|---|---|---|
|CCFE|C|B|A||
|NCE|C|B|D|A|



Manual Funcional del Sistema de Transmisión V 2.0 

31 



<!-- PAGE 35 / 80 -->



## **XIV. Aplicación del Catálogo “Tributos”** 

El catálogo de tributos está dividido en tres secciones las cuales se describen a continuación: 

**Sección 1: Tributos aplicados por ítem reflejados en el resumen del DTE.** 

|**Código**|**Nombre del Tributo**|**DTE al que aplica**|
|---|---|---|
|**20**|Impuesto al Valor Agregado 13%|CCFE, NRE, NCE, NDE, CLE|
|**C3**|Impuesto al Valor Agregado (exportaciones) 0%|NRE, FEXE Y CLE|
|**59**|Turismo: por alojamiento (5%)|FE, CCFE, NRE, NCE, NDE, CLE|
|**71**|Turismo: salida del país por vía aérea $7.00|FE, CCFE, NRE, NCE, NDE, CLE|
|**D1**|FOVIAL ($0.20 Ctvs. por galón)|FE, CCFE, NRE, NCE, NDE, CLE, FEXE|
|**C8**|COTRANS ($0.10 Ctvs. por galón)|FE, CCFE, NRE, NCE, NDE, CLE, FEXE|



Para estos tributos tienen aplicación los documentos tributarios: Factura Electrónica, Comprobante de Crédito Fiscal Electrónico, Nota de Remisión Electrónica, Nota de Crédito Electrónica, Nota de Débito Electrónica, y Comprobante de Liquidación Electrónico, Factura de Exportación Electrónica, Evento de Operaciones Especiales y Evento de Retorno. 

Se ingresará el código de tributo que corresponda dentro de cada ítem, en el campo “código de tributo”, se podrá aplicar varios códigos de tributo diferentes contenidos en esta sección, separados por comas, estos tributos se verán reflejados en la sección resumen del documento en los campos Resumen código de tributo, Nombre del tributo y valor de tributo de la siguiente manera: 

- RESUMEN CÓDIGO DE TRIBUTO: Se ingresará de manera consolidada (una sola vez) cada tipo de tributo por medio del código que haya aplicado por ítem. 

- NOMBRE DEL TRIBUTO: Se ingresará de manera consolidada (una sola vez) la descripción correspondiente por cada tipo de tributo detallado mediante código en campo "Resumen Código de Tributo". 

- VALOR DE TRIBUTO: Debe contener la sumatoria consolidada de los montos de tributos calculados por ítems, de forma separada por tipo de tributo. 

#### **Ejemplo de consolidación de tributos:** 

Se genera un CCFE con 10 ítem que suman 50 galones de combustible y ventas gravadas por $200.00 (en cada uno de los ítems se ingresan en campo “Código de Tributo” [“20”, “D1”, “C8”] (impuesto al Valor Agregado 13% (20), FOVIAL (D1) y COTRANS (C8). Se deberá presentar de manera consolidada en la sección resumen una sola vez el código, el nombre y el valor correspondiente a los tributos aplicados de la siguiente forma: 

Manual Funcional del Sistema de Transmisión V 2.0 

32 



<!-- PAGE 36 / 80 -->



|**Resumen Código**|**Nombre del Tributo**|**Valor de Tributo**|
|---|---|---|
|**de Tributo**|||
|20|Impuesto al Valor Agregado 13%|$26.00|
|D1|FOVIAL($0.20 ctvs.porgalón)|$10.00|
|C8|COTRANS($0.10 ctvs.porgalón)|$5.00|



**Notas:** Para el caso específico del tributo “C3-Impuesto al Valor Agregado (exportaciones) 0%” tendrá aplicación únicamente para Factura de Exportación Electrónica y cuando lo requiera también se aplicará en la Nota de Remisión Electrónica y Comprobante de Liquidación Electrónico. (en ambos casos deberá detallarse, aunque su valor sea $0.0). 

**Sección 2: Tributos aplicados por ítem reflejados en el cuerpo del documento** 

|**Código **|**Nombre del Tributo**|
|---|---|
|**A8**|Impuesto Especial al Combustible(0%,0.5%,1%)|
|**57**|Impuesto Industria de Cemento|
|**90**|Impuesto especial a laprimera matrícula|
|**A6**|Impuesto ad- Valorem,armas de fuego,municiones explosivasyartículos similares|



Para estos tributos tienen aplicación los documentos tributarios: Factura Electrónica, Comprobante de Crédito Fiscal Electrónico, Nota de Crédito Electrónica, Nota de Débito Electrónica, Nota de Remisión Electrónica, Factura de Exportación Electrónica y Evento de Retorno. 

Se deberá detallar como un ítem independiente dentro del cuerpo del documento, considerando que los valores aquí descritos corresponden a valores calculados en concepto de aplicación de los tributos descritos en la tabla anterior. Para este caso se deberá tomar en cuenta las indicaciones de llenado de los campos contenidos en la sección cuerpo de la estructura según tipo de documento tributario electrónico de la manera siguiente: 

|**CAMPOS**|**FE, FEXE y ER**|**CCFE**|**NCE, NDE y NRE**|
|---|---|---|---|
|**N° de ítem**|Ítem que corresponda en<br>secuencia con el anterior<br>descrito|Ítem que corresponda en<br>secuencia con el anterior<br>descrito|Ítem que corresponda en<br>secuencia con el anterior<br>descrito|
|**Tipo de ítem**|4 (Otros tributos por ítem)|4 (Otros tributos por ítem)|4 (Otros tributos por ítem)|
|**Cantidad**|1|1|1|
|**Código**|null o código interno que<br>maneje al contribuyente.|null o código interno que<br>maneje al contribuyente.|null o código interno que<br>maneje al contribuyente.|
|**Tributo sujeto a cálculo de IVA**|Uno de los códigos de<br>tributo contenidos en la<br>sección 2 del catálogo CAT-<br>015 "tributos"|Uno de los códigos de<br>tributo contenidos en la<br>sección 2 del catálogo CAT-<br>015 "tributos"|Uno de los códigos de<br>tributo contenidos en la<br>sección 2 del catálogo CAT-<br>015 "tributos"|
|**Unidad de Medida**|99|99|99|
|**Descripción**|Ingresar descripción|Ingresar descripción|Ingresar descripción|



Manual Funcional del Sistema de Transmisión V 2.0 

33 



<!-- PAGE 37 / 80 -->



|**CAMPOS**|**FE, FEXE y ER**||**CCFE**|**NCE, NDE y NRE**|
|---|---|---|---|---|
|**Precio Unitario**|Valor calculado del tributo<br>incluyendo IVA|Valor calc<br>sin IVA|ulado del tributo|Valor calculado del tributo<br>sin IVA|
|**Descuento por ítem**|$0.00|$0.00||$0.00|
|**Ventas No Sujetas**|$0.00|$0.00||$0.00|
|**Ventas Exentas**|$0.00|$0.00||$0.00|
|**Ventas Gravadas**|Valor<br>del<br>impuesto<br>calculado<br>(resultado<br>de<br>precio por cantidad)|Valor<br>calculado<br>precio por|del<br>impuesto<br>(resultado<br>de<br>cantidad)|Valor<br>del<br>impuesto<br>calculado<br>(resultado<br>de<br>precio por cantidad)|
|**Código del Tributo**|null|20- IVA||20-IVA|
|**Precio sugerido de venta**|$0.00|$0.00||N/A|
|**Cargos/Abonos que no afectan**<br>**la base imponible**|$0.00|$0.00||N/A|



#### **Ejemplo:** 

Se realiza venta de 100 bolsas de cemento a $8.00 c/u con CCFE. 

En este caso deberá detallarse dos ítems, uno con el detalle de la venta y otro con el detalle del impuesto; en el ítem 1 detallará los datos que identifiquen al bien en la sección cuerpo dejando el campo “Tributo sujeto a cálculo de IVA.” con null y el campo “código de tributo” con el código 20 que corresponde a IVA 13%. 

En el segundo ítem deberá ingresar el valor que corresponde a impuesto a industria de Cemento considerando las indicaciones de llenado en la sección cuerpo, tal como que se describen para el uso de tributos aplicados por ítem reflejados en el cuerpo del documento (en campo “Tipo de ítem” la opción 4-Otros tributos por ítem), en campo “Tributo sujeto a cálculo de IVA.” el código 57 que corresponde a tributo impuesto industria de cemento y en campo “código de tributo” deberá ingresar el código 20 que corresponde a IVA 13%). 

En la sección cuerpo del CCFE se deberá ingresar tal como se describe en la siguiente tabla: 



<!-- Start of picture text -->
Cuerpo del Documento<br>Tributo<br>Precio  Cargos/Abonos<br>N°  Tipo  Número de sujeto  Unidad  Descuento  Ventas  Código<br>Ventas  Ventas  sugerido  que no afectan<br>De  de  documento  Cantidad Código  a  de  Descripción  Precio  por  No  del<br>Unitario  Exentas  Gravadas  de  la base<br>ítem  Ítem  relacionado  cálculo  Medida  ítem  Sujetas  Tributo<br>venta  imponible<br>de IVA.<br>Super<br>1  1  null  100  null  null  59  cemento  $8.00  $  0.0  $ 0.0  $ 0.0  $ 800.00  20  $ 0.0  $ 0.0<br>fuerte<br>Impuesto<br>Industria<br>2  4  null  1  null  57  99  $32.00  $  0.0  $ 0.0  $ 0.0  $ 32.00  20  $ 0.0  $ 0.0<br>de<br>Cemento<br><!-- End of picture text -->

De esta manera el total de ventas gravadas para este CCFE sería de $832.00. 

Manual Funcional del Sistema de Transmisión V 2.0 

34 



<!-- PAGE 38 / 80 -->



#### **Consideraciones para los tributos contenidos con el mismo código en la sección 1 y 2** 

Los códigos de tributo D4 y D5 se encuentran en la sección 1 y 2 pero con distinta aplicación, a esta razón es importante aclarar lo siguiente: 

- El código de D4 se encuentra en la sección 1 y 2 del catálogo de tributos y es de uso interno del M.H. 

- Si código D5 se detallan en el campo “Código de tributo” este debe reflejar su valor consolidado en la sección resumen en los campos “Resumen Código de Tributo”, “Nombre del tributo” y “valor del tributo”. 

- Si código D5 se ingresan en el campo “Tributo sujeto a cálculo de IVA” este hace referencia a que se detallará en el ítem es un impuesto que está sujeto a IVA y debe ser reflejado en el campo ventas gravadas y seguir las indicaciones de llenado de campos establecidas en este anexo para los tributos de la sección 2. 

**Sección 3: Impuestos aplicados por ítem de uso informativo reflejados el resumen del documento.** 

|**Código **|**Nombre del Tributo**|
|---|---|
|C5|Impuesto ad- valorempor diferencial deprecios de bebidas alcohólicas(8%)|
|C6|Impuesto ad- valorempor diferencial deprecios al tabaco cigarrillos(39%)|
|C7|Impuesto ad- valorempor diferencial deprecios al tabaco cigarros(100%)|
|19|Fabricante de Bebidas Gaseosas,Isotónicas,Deportivas,Fortificantes,Energizante o Estimulante|
|28|Importador de Bebidas Gaseosas,Isotónicas,Deportivas,Fortificantes,Energizante o Estimulante|
|31|Detallistas o Expendedores de Bebidas Alcohólicas|
|32|Fabricante de Cerveza|
|33|Importador de Cerveza|
|34|Fabricante de Productos de Tabaco|
|35|Importador de Productos de Tabaco|
|36|Fabricante de Armas de Fuego,MunicionesyArtículos similares|
|37|Importador de Arma de Fuego MuniciónyArtículos similares|
|38|Fabricante de Explosivos|
|39|Importador de Explosivos|
|42|Fabricante de Productos Pirotécnicos|
|43|Importador de Productos Pirotécnicos|
|44|Productor de Tabaco|
|50|Distribuidor de Bebidas Gaseosas,Isotónicas,Deportivas,Fortificantes,Energizante o Estimulante|
|51|Bebidas Alcohólicas|
|52|Cerveza|
|53|Productos del Tabaco|
|54|Bebidas Carbonatadas o Gaseosas Simples o Endulzadas|
|55|Otros Específicos|



Manual Funcional del Sistema de Transmisión V 2.0 

35 



<!-- PAGE 39 / 80 -->



|**Código **|**Nombre del Tributo**|
|---|---|
|58|Alcohol|
|77|Importador de Jugos,Néctares,Bebidas con JugoyRefrescos|
|78|Distribuidor de Jugos,Néctares,Bebidas con JugoyRefrescos|
|79|Sobre Llamadas Telefónicas Provenientes del Ext.|
|85|Detallista de Jugos,Néctares,Bebidas con JugoyRefrescos|
|86|Fabricante de Preparaciones Concentradas o en Polvopara la Elaboración de Bebidas|
|91|Fabricante de Jugos,Néctares,Bebidas con JugoyRefrescos|
|92|Importador de Preparaciones Concentradas o en Polvopara la Elaboración de Bebidas|
|A1|EspecíficosyAd-valorem|
|A5|Bebidas Gaseosas,Isotónicas,Deportivas,Fortificantes,Energizantes o Estimulantes|
|A7|Alcohol Etílico|
|A9|Sacos Sintéticos|



Para estos tributos tienen aplicación los documentos tributarios: Factura Electrónica y Comprobante de Crédito Fiscal Electrónico, Nota de Crédito Electrónica, Nota de Débito Electrónica, Factura de Exportación Electrónica y Evento de Retorno. 

Se ingresará el código de tributo que corresponda dentro de cada ítem, en el campo “código de tributo”, la aplicación de estos tributos solo será para uso informativo, es decir no se detallarán en representación gráfica ni tendrán efecto en los valores del documento. 

Se reflejarán a nivel informativo en la sección resumen en los campos: 

- **RESUMEN CÓDIGO DE TRIBUTO:** donde se visualizará una sola vez cada tipo de tributo por medio 

- del código que haya aplicado por ítem. 

- **NOMBRE DEL TRIBUTO:** donde se visualizará una sola vez cada tipo de tributo por medio de la 

- descripción que corresponda al código detallado en campo RESUMEN CÓDIGO DE TRIBUTO. 

- **VALOR DE TRIBUTO:** Debe contener la sumatoria consolidada de los montos de tributos calculados 

- por ítems, de forma separada por tipo de tributo. 

#### **Ejemplo: Ejemplo de consolidación de tributos** 

Se genera un CCFE con 10 ítem que suman ventas gravadas por $200.00, en todos los ítem se ha aplicado los tributos impuesto al Valor Agregado 13% (20) e Impuesto ad- valorem por diferencial de precios de Bebidas Alcohólicas 8% (C5), en campo “código de tributo“ [“20”,”C5”]; en supuesto que exista una diferencia entre precios de $80.00, se deberá presentar de manera consolidada una sola vez el código, el nombre y el valor correspondiente a los tributos aplicados en la sección resumen. 

Manual Funcional del Sistema de Transmisión V 2.0 

36 



<!-- PAGE 40 / 80 -->



|**Resumen Código de Tributo**|**Nombre del Tributo**|**Valor de Tributo**|
|---|---|---|
|20|Impuesto al Valor Agregado 13%|$26.00|
|C5|Impuesto ad- Valorem por dif. (8%)|$6.40|



El “total a pagar” de esta operación sería $226.00 (no se considera los $6.40 debido a que solo es de uso informativo). 

## **XV. Uso de la Sección Documentos Relacionados.** 

Para los Documentos Tributarios Electrónicos en cuya estructura contenga sección de documentos relacionados se podrán hacer referencia a documentos que se emitieron con anterioridad que den origen a la generación de un documento posterior. Haciendo uso de esta sección podrá realizar la relación de un máximo de 50 documentos que, entre sí, podrían sumar hasta un máximo de 2000 ítems o líneas. Documentos electrónicos a los que aplica esta sección 

La sección de relacionados se encuentra contemplada para los siguientes documentos tributarios electrónicos: 

1. Factura Electrónica 

2. Comprobante de Crédito Fiscal Electrónico 

3. Nota de Remisión Electrónica 

4. Nota de Crédito Electrónica 

5. Nota de Débito Electrónica 

6. Factura de Exportación Electrónica 

7. Evento de Retorno 

El uso de esta sección será obligatorio para Nota de Crédito Electrónica, Nota de Débito Electrónica y Evento de Retorno. Para los casos de Factura Electrónica, Comprobante de Crédito Fiscal Electrónico, Nota de Remisión Electrónica y Factura de Exportación Electrónica será requerido por tipo de operación, es decir, que cuando la operación no lo requiera (cuando el documento a generar no sea a causa de otro documento tributario electrónico previo) deberá completar la sección con la palabra null. 

Estos hasta 50 documentos que pueden relacionarse en otro DTE deben ser del mismo tipo, es decir, si se relaciona Comprobantes de Crédito Fiscal a una Nota de Crédito Electrónica, no pueden en este misma Nota de Crédito Electrónica relacionar Comprobantes de Crédito Fiscal y Comprobantes de Retención. En relación a estos parámetros establecidos es necesario describir algunas condiciones con el fin de aclarar dudas sobre el uso de esta sección, qué información debe completar y cómo se relacionará en el cuerpo del documento. Campos de la sección Documentos Relacionados. 

La sección consta de 4 campos, en los que podrá describir datos generales de los documentos que se están relacionando, pudiendo encontrarse estos emitidos en forma física o electrónica. 

**1. Tipo de Documento Tributario Relacionado** : Deberá indicar el código del documento relacionado según el catálogo; dicho código deberá ingresarse respetando las condiciones descritas en la estructura de cada uno del documento antes mencionados. 

Manual Funcional del Sistema de Transmisión V 2.0 

37 



<!-- PAGE 41 / 80 -->



**2. Tipo de Generación del Documento Tributario Relacionado:** Deberá indicar si el documento que va a relacionar, fue generado de manera física ingresando el código 1 o de manera electrónica con el código 2. 

**3. Número de Documento Relacionado:** Se ingresará el código de generación si el documento relacionado ha sido emitido de forma electrónica y deberá ingresar el número de correlativo si el documento ha sido emitido de forma física. Podrá ingresar documentos en físico y electrónicos en un mismo documento siempre y cuando sean del mismo tipo. 

**4. Fecha de Generación del Documento Relacionado:** deberá indicar la fecha en que fue generado el documento que se esté relacionando. 

#### **Uso de sección relacionados** 

Para poder relacionar los DTE en FE, CCFE, NRE, FEXE, realizar los ajustes en NCE y NDE o aplicar Evento de Retorno a un DTE deberá describir en la sección documentos relacionados la información que identifica al documento que se está informando/ajustando y en el cuerpo del DTE que se está generando; Se detallará los ítems que correspondan a cada uno de los documentos que se van a relacionar/ajustar. 

Ejemplo: Se requiere ajustar con Nota de Crédito Electrónica los siguientes 3 CCF: CCF 1: S221001345 (físico) FECHA 13/06/2024 

||||Cuerpo del Document|o|||||
|---|---|---|---|---|---|---|---|---|
|N° de ítem|Cantidad|Unidad de<br>Medida|Descripción|Precio<br>Unitario|Descuento por<br>ítem|Ventas No<br>Sujetas|Ventas<br>Exentas|Ventas<br>Gravadas|
|1|10|Unidades|Camisas/Negro|$ 10.00|$ 0.00|$ 0.00|$ 0.00|$ 100.00|
|2|15|Unidades|Centros|$ 5.00|$ 0.00|$ 0.00|$ 0.00|$ 75.00|
|3|25|Unidades|Jeans|$ 20.00|$ 0.00|$ 0.00|$ 0.00|$ 500.00|
|4|5|Unidades|Cinturón|$ 20.00|$ 0.00|$ 0.00|$ 0.00|$ 100.00|



**CCFE 2: FF54E9DB-79C3-42CE-B432-EC552C97EFB9 FECHA 14/06/2024** 

|||||||**Cuerpo del Doc**|**umento**||||||||
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|N° De ítem<br>Tipo de Ítem|Número de<br>documento<br>relacionado|Cantidad|Código|Tributo<br>sujeto a|Unidad de<br>Medida|Descripción|Precio<br>Unitario|Descuento<br>por ítem|Ventas No<br>Sujetas|Ventas<br>Exentas|Ventas<br>Gravadas|Código del<br>Tributo|Precio<br>sugerido de|Cargos/Abo<br>nos que no<br>afectan la<br>base|
|1<br>1|null|10|null|null|59|Camisas/negro|$ 10.00|$ 0.00|$ 0.00|$ 0.00|$100.00|20|$ 0.00|$ 0.00|
|2<br>1|null|15|null|null|59|Centros|$ 5.00|$ 0.00|$ 0.00|$ 0.00|$75.00|20|$ 0.00|$ 0.00|
|3<br>1|null|25|null|null|59|Jeans|$20.00|$ 0.00|$ 0.00|$ 0.00|$500.00|20|$ 0.00|$ 0.00|
|4<br>1|null|5|null|null|59|Cinturón|$20.00|$ 0.00|$ 0.00|$ 0.00|$100.00|20|$ 0.00|$ 0.00|
|5<br>1|null|10|null|null|59|Cartera|$20.00|$ 0.00|$ 0.00|$ 0.00|$200.00|20|$ 0.00|$ 0.00|



Manual Funcional del Sistema de Transmisión V 2.0 

38 



<!-- PAGE 42 / 80 -->



**CCFE 3: FF54E9DB-79C3-42CE-B432-EC552C97EF33 FECHA 15/06/2024** 

||||||||||Cuerpo del Docu|mento|||||||||
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|°|N De ítem|Tipo de Ítem|Número de<br>|documento|relacionado<br>Cantidad|Código|Tributo sujeto a<br>cálculo de IVA.|Unidad de<br>Medida|Descripción|Precio<br>Unitario|Descuento<br>por ítem|Ventas No<br>Sujetas|Ventas<br>Exentas|Ventas<br>Gravadas|Código del<br>Tributo|Precio<br>sugerido de|Cargos/Abonos<br>que no afectan|<br>la base<br>imponible|
|1||1|null||5|null|null|59|Camisas/negro|$ 10.00|$ 0.00|$ 0.00|$ 0.00|$50.00|20|$ 0.00|$ 0.00||
|2||1|null||15|null|null|59|Centros|$ 5.00|$ 0.00|$ 0.00|$ 0.00|$75.00|20|$ 0.00|$ 0.00||
|3||1|null||25|null|null|59|Jeans|$10.00|$ 0.00|$ 0.00|$ 0.00|$250.00|20|$ 0.00|$ 0.00||
|4||1|null||5|null|null|59|Cinturón|$20.00|$ 0.00|$ 0.00|$ 0.00|$100.00|20|$ 0.00|$ 0.00||
|5||1|null||10|null|null|59|Cartera|$25.00|$ 0.00|$ 0.00|$ 0.00|$250.00|20|$ 0.00|$ 0.00||



Se realizará ajuste por devolución de productos para el **CCF1** por devolución de una camisa negra y dos jeans, para el **CCFE 2** se aplicará el 10% de descuento en todos los productos el cual por error no fue aplicado en el CCFE, y a **CCFE 3** se corrige precio de carteras de $25.00 a $22.00 

Con Nota de Crédito Electrónica, este ajuste se puede realizar en una sola NCE de la siguiente manera: 

Primero, en la sección Documentos Relacionados de la NCE debo detallar los datos para cada uno de los CCF a ajustar de la siguiente manera: 

#### **Sección documentos relacionados Nota de Crédito Electrónica** 

|Tipo de<br>Documento<br>Tributario<br>Relacionado|Tipo de Generación del<br>Documento Tributario<br>Relacionado|Número de Documento Relacionado|Fecha de Generación<br>del Documento<br>Relacionado|
|---|---|---|---|
|03|1|S221001345|13/06/2024|
|03|2|FF54E9DB-79C3-42CE-B432-<br>EC552C97EFB9|14/06/2024|
|03|2|FF54E9DB-79C3-42CE-B432-<br>EC552C97EF33|15/06/2024|



Posteriormente en la sección cuerpo de la Nota de Crédito se hará ajuste del ítem 1 y 3 del CCF 1 (S221001345), luego se detallará el ajuste a todos los ítems del CCFE 2 (FF54E9DB-79C3-42CE-B432-EC552C97EFB9) y el ajuste para el ítem 5 del CCFE 3 (FF54E9DB-79C3-42CE-B432-EC552C97EF33). 

En los ítems 1 y 2 del cuerpo de la Nota de Crédito se deberá detallar los ítems a ajustar del CCF1, en los ítems del 3 al 7 los ítems a ajustar del CCFE 2 y el ítem 8 el ajuste del CCFE 3 tal como se refleja en la siguiente tabla: 

Manual Funcional del Sistema de Transmisión V 2.0 

39 



<!-- PAGE 43 / 80 -->



#### **Sección Cuerpo Nota de Crédito Electrónica** 

|N° De ítem<br>Tipo de<br>Ítem|Número de<br>documento<br>relacionado|Cantidad|Código|Tributo sujeto a<br>cálculo de IVA.|Cuerp<br>Unidad de<br>Medida|o del documento<br>Descripción|Precio Unitario|Descuento por<br>ítem|Ventas No<br>Sujetas|Ventas Exentas|Ventas Gravadas|Código del<br>Tributo|
|---|---|---|---|---|---|---|---|---|---|---|---|---|
|1<br>1|S221001345|1|null|null|59|Ajuste por<br>devolución<br>camisa/negra|$ 10.00|$ 0.00|$ 0.00|$ 0.00|$ 10.00|20|
|2<br>1|S221001345|2|null|null|59|Ajuste por<br>devolución/<br>Jeans|$ 20.00|$ 0.00|$ 0.00|$ 0.00|$40.00|20|
|3<br>1|FF54E9DB-79C3-<br>42CE-B432-<br>EC552C97EFB9|5|null|null|59|Ajuste por<br>descuento no<br>aplicado<br>Camisas/negro|$ 1.00|$ 0.00|$ 0.00|$ 0.00|$ 5.00|20|
|4<br>1|FF54E9DB-79C3-<br>42CE-B432-<br>EC552C97EFB9|15|null|null|59|Ajuste por<br>descuento no<br>aplicado/<br>Centros|$ 0.50|$ 0.00|$ 0.00|$ 0.00|$ 7.50|20|
|5<br>1|FF54E9DB-79C3-<br>42CE-B432-<br>EC552C97EFB9|25|null|null|59|Ajuste por<br>descuento no<br>aplicado/ Jeans|$ 1.00|$ 0.00|$ 0.00|$ 0.00|$ 25.00|20|
|6<br>1|FF54E9DB-79C3-<br>42CE-B432-<br>EC552C97EFB9|5|null|null|59|Ajuste por<br>descuento no<br>aplicado/<br>Cinturón|$ 2.00|$ 0.00|$ 0.00|$ 0.00|$ 10.00|20|
|7<br>1|FF54E9DB-79C3-<br>42CE-B432-<br>EC552C97EFB9|10|null|null|59|Ajuste por<br>descuento no<br>aplicado/<br>cartera|$ 2.50|$ 0.00|$ 0.00|$ 0.00|$ 25.00|20|
|8<br>1|FF54E9DB-79C3-<br>42CE-B432-<br>EC552C97EF33|10|null|null|59|Ajuste en precio/<br>cartera|<br>$ 3.00|$ 0.00|$ 0.00|$ 0.00|$ 30.00|20|



De esta manera se está detallando los ítems a los cuales se aplica el ajuste por cada documento, es importante aclarar que los documentos que aplican a esta sección (documentos relacionados), como ya se había mencionado, en el cuerpo de los documentos podrá describir hasta un máximo de 2000 ítem, es decir si por ejemplo se relacionara un CCF a una NCE para realizar un ajuste y dicho CCF tuviera 2000 ítems y todos requieren ajustarse podrá relacionar en la sección relacionados solo este CCF en esta Nota de Crédito Electrónica. Si se diera el caso que tengo 50 CCF con 1000 ítems cada uno, pero solo es necesario realizar ajuste en 2 ítem por cada CCF, en la NCE perfectamente detallaría en la sección de relacionados los 50 CCF y en el cuerpo de la Nota de Crédito podría detallar los dos ítems de cada documento ingresando un total de 100 ítems. 

Manual Funcional del Sistema de Transmisión V 2.0 

40 



<!-- PAGE 44 / 80 -->



Notas importantes: 

**1.** Las Facturas, Comprobantes de Crédito Fiscal, Notas de Remisión, Comprobantes de Retención, Comprobantes de Liquidación, Facturas de Exportación y Facturas de Sujeto Excluido electrónicos que se relacionen con otro DTE/Evento deberán encontrarse activos y contar con Sello de Recepción. 

**2.** Cuando en Comprobantes de Crédito Fiscal Electrónicos o Factura Electrónica se relacionen con Documentos Contables de Liquidación sin Sello de Recepción, será obligatorio que el emisor transmita los DCL dentro de los plazos correspondientes. 

## **XVI. Uso de Sección Otros Documentos Asociados.** 

Esta sección aplica para Factura Electrónica, Comprobante de Crédito Fiscal Electrónico, Factura de Exportación Electrónica y Comprobante de Donación Electrónico; en esta se permite anexar información relevante de la operación que puede ser requerida de acuerdo a ciertas particularidades del negocio que no son de carácter tributario. 

Para el ingreso de información en esta sección se debe considerar el catálogo CAT-021 “Otros Documentos Asociados” cuya codificación deberá ingresar en campo “Documento asociado” indicado si la información a describir corresponde al emisor, al receptor, médico y transportista. 

En el caso particular de la Factura Electrónica y Comprobante de Crédito Fiscal Electrónico además de tener la opción de ingresar información general del emisor y/o receptor (tales como: contratos, resoluciones, autorizaciones entre otros) podrá también indicar siempre que la operación lo requiera, las generales del médico (identificación, nombre, procedimiento, etc.) cuando se trate de aquellas actividades económicas referentes a la prestación de servicios médicos. 

1. Si campo "documento asociado" está completo con las opciones 1 o 2 en esta línea deberá contener solamente los siguientes campos: 

|Documento|Identificación del|Descripción de documento|
|---|---|---|
|asociado|documento asociado|asociado|



2. Si campo "documento asociado" está completo con las opciones 3 esta línea deberá contener solamente los siguientes campos: 

|Nombre de médico que|NIT de médico que|Documento de identificación de médico|Código del Servicio|
|---|---|---|---|
|presta el Servicio|presta el Servicio|no domiciliados|realizado|



Debiendo considerar la codificación del catálogo CAT-010 Código tipo de Servicio (Médico). 

Manual Funcional del Sistema de Transmisión V 2.0 

41 



<!-- PAGE 45 / 80 -->



3. Si campo "documento asociado" está completo con las opciones 4 esta línea deberá contener los siguientes campos: 

|Modo de transporte|Número de<br>identificación del<br>transporte|Numero de documento<br>de identificación del<br>conductor|Nombre y apellidos<br>del conductor|
|---|---|---|---|



Debiendo considerar la codificación del catálogo CAT-030 - Transporte 

El detalle de la información del transportista aplica de manera opcional y únicamente tiene aplicación para Factura de Exportación Electrónica. 

En el caso del Comprobante de Donación Electrónico solo permitirá los códigos 1- Emisor y 2- Receptor, siendo requerido el ingreso de al menos un registro que corresponda al Donatario (Emisor), para detallar la resolución de calificación como sujeto excluido. 

#### **Ejemplo de aplicación para Factura Electrónica y Comprobante de Crédito Fiscal Electrónica.** 

Se emitirá una factura a razón de una cirugía que se cubrirá con una póliza de seguro y a raíz de esta cirugía se recetará un medicamento que requiere autorización por la DNM. Para su respaldo, el emisor podrá detallar la información en esta sección de la siguiente manera: 

|||Otros documentos asoc|iados para F y CCF||||
|---|---|---|---|---|---|---|
|Documento<br>o asociado|Identificación del<br>documento asociado|Descripción de<br>documento asociado|Nombre de médico<br>que presta el<br>servicio|NIT de médico que<br>presta el servicio|Documento de<br>identificación de<br>médico no<br>domiciliados|Código del<br>servicio<br>realizado|
|2|Seguro médico<br>/Aseguradora x|Documento de<br>prueba|||||
|1|Permiso DNM|UIEDM-P-01-PXX-X|||||
|3|||Médico de<br>Prueba|12222222222221|null|1|



En la línea 1 se detalla código 2 ya que el documento asociado que pertenece al receptor es una póliza de seguro médico hospitalario (seguro médico/ aseguradora x) y se referencia el número (Documento de prueba). 

En la segunda línea se referencia código 1 enunciando que el documento corresponde al emisor, el cual consiste en un permiso otorgado por la DNM (UIEDM-P-01-PXX-X) para la venta de un medicamento especifico con el cual tratará a su paciente. 

En la línea 3 se hace referencia a las generales del médico que atendió la cirugía. (Médico de Prueba con NIT: 12222222222221 tipo de servicio realizado Cirugía). 

Manual Funcional del Sistema de Transmisión V 2.0 

42 



<!-- PAGE 46 / 80 -->



Pudiendo ingresar un máximo de 10 líneas para relacionar información relacionada, que, si bien esta no es de carácter tributario, de acuerdo las particularidades del negocio podrán ser necesario el ingreso de la misma para respaldar la operación. 

Para el caso particular de la Factura de Exportación Electrónica, podrá indicar de igual manera además de la información del emisor y el receptor la información del transportista, mediante 4 campos específicos. 

#### **Ejemplo de aplicación para Factura de Exportación Electrónica:** 

Se está realizando exportación de pollitas rojas bebes, para lo cual el exportador ha obtenido un permiso zoosanitario. 

|**Documento**<br>**asociado**|**Otros documento**<br>**Identificación del**<br>**documento asociado**|**s asociados para F**<br>**Descripción de**<br>**documento**<br>**asociado**|**EXE.**<br>**Modo de**<br>**transporte**|**Número de**<br>**identificación del**<br>**transporte**|**Numero de**<br>**documento de**<br>**identificación del**<br>**conductor**|**Nombre y**<br>**apellidos del**<br>**conductor**|
|---|---|---|---|---|---|---|
|1|Permiso Zoosanitario|Documento de<br>prueba|||||
|4|||1|HNXXXXX|CRXXXX-X|Usuario de<br>Prueba|



De esta manera estamos detallando un permiso zoosanitario (Documento de prueba) que corresponde al emisor de la factura de exportación y la información del transportista (Usuario de Prueba, Número de identificación del transporte HNXXXXX, N° documento de identificación del conductor CRXXXX-X, Modo de transporte 1-Terrestre). 

En esta sección para Factura de Exportación Electrónica podrá ingresar un máximo de 20 líneas que de acuerdo con las particularidades de negocios. 

## **XVII. Venta Cuenta de Terceros** 

Las estructuras establecidas para FE, CCFE, NRE, NCE, NDE, FEXE y Evento de Retorno contienen la sección “Venta a cuenta de terceros” donde se encuentran los campos: “NIT por cuenta de terceros”, “Nombre, denominación o razón social del Tercero” y “Domicilio Fiscal” para detallar las ventas que el emisor realice por cuenta de sus mandantes. 

Cuando no se haga uso de esta sección; es decir, cuando la venta no sea una operación por cuenta de un tercero, deberá enviar esta sección con la palabra null. 

Cuando la venta que realice el emisor sea por cuenta de un tercero debe detallar el Número de Identificación Tributaria (NIT)el Nombre del Mandante e ingresar el código en correspondencia si el tercero es domiciliado o no domiciliado en los campos antes citados. 

Manual Funcional del Sistema de Transmisión V 2.0 

43 



<!-- PAGE 47 / 80 -->



**Para la emisión de los DTE a cuenta de terceros debe considerar lo siguiente** : 

1. La sección venta cuenta a terceros permitirá el detalle de un solo mandante, es decir un Número de Identificación Tributaria y un nombre de tercero. 

2. Las ventas a cuenta de tercero se deben emitir en un DTE de forma independiente de las ventas propias; es decir no pueden emitirse DTE mezclando ventas propias y con ventas a cuenta de terceros. 

3. En los casos que tuviera varios mandantes debe emitir los DTE uno a uno, no puede detallarse ventas de varios mandantes en un solo DTE. 

#### **Detalle de los DTE emitido a cuenta de terceros en el Comprobante de Liquidación Electrónico (CLE)** 

1. El CLE solo aceptará el ingreso de documentos de ventas emitidos con información en la sección “Venta a cuenta de terceros” (El tercero que se detalle en FE, CCFE, NRE, NCE, NDE, FEXE o Evento de Retorno será el receptor en el CLE). 

2. No podrá informar los DTE en un CLE si no se ha detallado información en la sección “Venta a cuenta de terceros” del documento de venta. 

3. Los documentos tributarios detallados en el CLE se deben realizar con la información del resumen, ingresando el valor resumen del DTE por cada ítem; es decir, no se debe trasladar en detalle cada uno de los ítems contenidos en el DTE. 

4. El documento tributario que se relacione en el CLE debe tener correspondencia al periodo en que se está emitiendo el CLE; los DTE/evento se registrarán de acuerdo con la fecha de Generación. 

5. El documento tributario solo puede referenciarse una vez y en un solo CLE, a excepción de los documentos invalidados que podrán referenciarse por primera vez activos y por segunda vez invalidados, pudiendo reflejarse dicha invalidación en el mismo CLE o en un CLE posterior a haber informado DTE activo. 

6. Cuando se detallen FE o FEXE invalidadas, deberán registrarse en el periodo donde ocurrió la invalidación, con la fecha de generación detallada en el DTE, por ejemplo, si la factura tiene fecha de generación 01-03- 2026 y se invalida el 01-06-2026 podrá registrarla en el CLE validada para el mes de marzo y deberá detallarla invalidada en un CLE de junio ingresando en campo “Fecha de generación del documento relacionado” 01-03-2026. 

7. Cuando se detallen CCFE, NCE, NCE o ER invalidadas, deben registrarse en CLE según con la fecha de generación detallada en el DTE. 

8. Para la elaboración del CLE se deben considerar las especificaciones del llenado de campos establecidos en la estructura y validaciones contenidas en la normativa de cumplimiento de los DTE. 

9. Debe detallar los tributos de la sección 1 aplicados en el DTE/Evento que está informando en el CLE 

## **XVIII. Aplicación de los campos “Descuento por ítem” y “Monto Global de Descuento” en los DTE** 

Se pueden definir los Descuento como una disminución en el precio de un bien o un servicio. Estos descuentos pueden darse en forma de porcentaje, cantidad fija de unidades monetarias o acumulativos, entre otras muchas opciones. 

Para facturación electrónica se consideran los campos de descuento en los tipos de documentos: Factura Electrónica, Comprobante de Crédito Fiscal Electrónico, Nota de Remisión Electrónica, Nota de Crédito Electrónica, Nota de Débito Electrónica, Factura Sujeto Excluido Electrónica, Factura de Exportación Electrónica y Evento de Retorno. Con el fin 

Manual Funcional del Sistema de Transmisión V 2.0 

44 



<!-- PAGE 48 / 80 -->



de garantizar la aplicación de toda la casuística que pudiera darse en las diferentes operaciones del día a día; Se consideran dos formas de ingresar estos descuentos en los DTE los cuales se describen a continuación: 

**1. Descuento por ítem:** considera las disminuciones de precios al producto, este deberá ingresarse dentro de la sección cuerpo del documento, de forma consolidada restándose al resultado de multiplicar el precio por la cantidad en el ítem o línea. 

En el supuesto que se vendan 10 cuadernos a un precio unitario de $1.00 y se aplica un descuento de $0.10 ctvs. a cada cuaderno, debo detallar en campo “cantidad” 10, en campo “precio unitario” $1.00 y en campo “Descuento por ítem o línea de operación” $1.00 (se aplicó un descuento de $0.10 ctvs. por cada cuaderno). 

Ejemplo de aplicación 1 

|N° de ítem|Cantidad|Precio<br>Unitario|Descuento<br>por ítem|Ventas No<br>Sujetas|Ventas<br>Exentas|Ventas<br>Gravadas|
|---|---|---|---|---|---|---|
|1|10|$1.00|$1.00|$0.00|$0.00|$9.00|
|2|10|$20.00|$0.00|$0.00|$0.00|$200.00|
|3|4|$20.00|$5.00|$0.00|$75.00|$0.00|



Notas: 

1. Cuando no se requiera aplicar descuento por ítem deberá enviar este campo con valor $0.00. 

2. Cuando en NCE, NDE o ER se relacionen documentos que detallen descuentos globales, dichos descuentos deberá detallarlos en el campo descuento por ítem. 

**2. Descuento global:** estos campos se encuentran en la sección resumen de las estructuras de FE, CCFE, NRE, FEXE y FSEE; estas disminuciones se aplican al valor total de la venta por cada tipo de venta, deberán ingresarse en la sección resumen dependiendo del tipo de venta al que se aplique, en los campos “Descuento global a ventas exentas”, “Descuento global a ventas no sujetas” y “Descuento global ventas gravadas” según corresponda (Para el caso de la FSEE tiene equivalencia a Descuento global al total de operaciones). 

En estos campos se aplicarán aquellas disminuciones globales a las ventas que se necesiten aplicar, por ejemplo, un monto fijo, descuentos acumulados, descuentos por pronto pago, descuentos por fidelidad, descuento general por el uso de una tarjeta específica, rebajas especiales por un monto de consumo o promociones especiales, subsidios por consumo, entre otros. Los cuales se aplican de manera general sobre el valor total de la venta (es decir no por producto por línea de operación). 

Cuando no se requiera aplicar descuentos de este tipo se deberá enviar este campo con valor $0.00. 

**3. Porcentaje de Descuento:** este campo se encuentra en la sección resumen de las estructuras de FE, CCFE, NRE, NCE, NDE y FEXE donde podrá si lo desea indicar el porcentaje global de descuento a aplicar sin utilizar el símbolo de porcentaje. Por ejemplo, si se aplica un 10% de descuento en este campo deberá ingresar el número 10. 

Manual Funcional del Sistema de Transmisión V 2.0 

45 



<!-- PAGE 49 / 80 -->



**4. Total de Descuento:** este campo se encuentra en la sección resumen de las estructuras de FE, CCFE, NRE, NCE, NDE, FSEE y FEXE; es importante aclarar que este campo solo será **<u>de uso informativo,</u>** a efecto de mostrar el total de disminuciones aplicadas. Sumará todas las disminuciones aplicadas por ítem contenidos en campo “Descuento por ítem” contenidas en el cuerpo del documento más los descuentos globales por tipo de venta contenidas en la sección resumen. 

#### **Ejemplo de aplicación 2** 

Se genera un DTE con los siguientes ítems con sus respectivos detalles: 

|**N° De ítem**|**Cantidad**|**Precio Unitario**|**Descuento por ítem**|**Ventas no**<br>**Sujetas**|**Ventas Exentas**|**Ventas Gravadas**|
|---|---|---|---|---|---|---|
|1|10|$25.00|$25.00|$0.00|$0.00|$225.00|
|2|5|$80.00|$15.00|$0.00|$0.00|$385.00|
|3|4|$10.00|$5.00|$0.00|$35.00|$0.00|



Un comercio tiene una promoción de temporada que por consumo mayor a $500.00 el cliente recibe un 10% de descuento global sobre el monto. Lo cual se aplicaría de la siguiente manera en la sección resumen: 

|**Resumen**||
|---|---|
|Total de Operaciones no sujetas|$0.00|
|Total de Operaciones exentas|$35.00|
|Total de Operaciones Gravadas|$610.00|
|Suma de operaciones sin impuestos|$645.00|
|Descuento global a ventas no sujetas|$0.00|
|Descuento global a ventas exentas|$3.50|
|Descuento global a ventas gravadas|$61.00|
|Porcentaje de Descuento|10|
|**Total de Descuento**|$109.50|



Como se puede visualizar el “Total de Descuento” es la suma de Descuento, por ítem ($25.00+$15.00+$5.00) + Descuento global por tipo de venta ($3.50+$61.00) =$109.50 

#### **Ejemplo de ajuste con NCE a CCFE con Descuento Global y Retención.** 

Se emite CCFE con código de generación AC54E9DB-79C5-42CE-B430-EC552C97EFBA de fecha 13-05-2026 con el siguiente detalle: 

Manual Funcional del Sistema de Transmisión V 2.0 

46 



<!-- PAGE 50 / 80 -->



|**N° de ítem**|**Cantidad**|**Código**|**Descripción**|**Precio**<br>**Unitario**|**Descuento**<br>**por ítem**|**Ventas No**<br>**Sujetas**|**Ventas**<br>**Exentas**|**Ventas**<br>**Gravadas**|**Código del**<br>**Tributo**|**Cargos/Abonos que no**<br>**afectan la base**<br>**imponible**|
|---|---|---|---|---|---|---|---|---|---|---|
|1|10|00D56|Camisas/gris|$11.00|$10.00|$0.00|$0.00|$100.00|20|$0.00|
|2|15|00C25|Centros|$5.00|$0.00|$0.00|$0.00|$75.00|20|$0.00|
|3|25|0056D|Jeans|$21.00|$25.00|$0.00|$0.00|$500.00|20|$0.00|
|4|5|0D586|Cinturón|$20.00|$0.00|$0.00|$0.00|$100.00|20|$0.00|
|5|1|null|Pagos no<br>afectos|$20.00|$0.00|$0.00|$0.00|$0.00|null|-$20.00|



#### Sección Resumen 

|Total de Operaciones no sujetas|$0.00|
|---|---|
|Total de Operaciones exentas|$0.00|
|Total de Operaciones Gravadas|$775.00|
|Suma de operaciones|$775.00|
|Descuentoglobal a ventas no sujetas|$0.00|
|Descuentoglobal a ventas exentas|$0.00|
|Descuentoglobal a ventasgravadas|$77.50|
|Porcentaje de Descuento|10.00|
|Total de Descuentos|$113.50|
|Resumen código de tributo|20|
|Valor de tributo|$90.68|
|Sub-Total|$697.50|
|Monto Total de la Operación|$788.18|
|IVA Percibido|$0.00|
|IVA Retenido|$6.98|
|Total Cargos/Abonosque no afectan la base imponible|-$20.00|
|**Total a Pagar**|**$761.20**|



Si el cliente devuelve 5 Jeans y además indica que los pagos no afectos a aplicar son de $15.00 deberá detallar la NCE de la manera siguiente: 

#### **Sección de Documentos relacionados** 

|**Tipo de**<br>**Documento**<br>**Relacionado**|**Tipo de Generación del**<br>**Documento relacionado**|**Número de documento**<br>**relacionado**|**Fecha de Generación del**<br>**Documento Relacionado**|
|---|---|---|---|
|03|2|AC54E9DB-79C5-42CE-<br>B430-EC552C97EFBA|13/05/2026|



Manual Funcional del Sistema de Transmisión V 2.0 

47 



<!-- PAGE 51 / 80 -->



#### **Sección Cuerpo** 



<!-- Start of picture text -->
1  5  0056D  AC54E9DB-79C5-42CE- $0.90 Camisas/gris  21  15  $0.00 $0.00  $90.00  20  $0.00<br>B430-EC552C97EFBA<br>AC54E9DB-79C5-42CE- Pagos no<br>2  1  null  0  5  $0.00 $0.00  $0.00  $0.00 null  -5<br>B430-EC552C97EFBA  afectos<br>Código<br>N° de ítem  Cantidad  Número de  Documento  Relacionado  IVA Retenido  Descripción  Precio Unitario  Descuento por ítem  Ventas No Sujetas  Ventas Exentas  Ventas Gravadas  Código del Tributo  Cargos/Abonos que  no afectan la base  imponible<br><!-- End of picture text -->

En el campo descuento por ítem debo detallar los descuentos aplicados por ítem más los descuentos globales En el ítem aplicamos un descuento de $1.00 por cada jean que $1* 5= $5.00 

Luego calculamos el descuento global (5*$21)-$5=$100, el descuento global aplicado en el CCFE es del 10% ($100*10%=$10), por tanto, debe ingresar en el campo descuento por ítem $15.00 

#### **Sección Resumen** 

|Total de Operaciones no sujetas|$0.00|
|---|---|
|Total de Operaciones exentas|$0.00|
|Total de Operaciones Gravadas|$90.00|
|Suma de operaciones|$90.00|
|Descuentoglobal a ventas no sujetas|$0.00|
|Descuentoglobal a ventas exentas|$0.00|
|Descuentoglobal a ventasgravadas|$0.00|
|Total de Descuentos|$15.00|
|Resumen código de tributo|20|
|Valor de tributo|$11.70|
|Monto Total de la Operación|$101.70|
|IVA Percibido|$0.00|
|IVA Retenido|$0.90|
|Total Cargos/Abonosque no afectan la base imponible|-$5.00|
|Total a Pagar|$95.80|



## **XIX. Ingreso de información en campos relativos al pago** 

Para el llenado de los DTE: Comprobante de Crédito Fiscal Electrónico, Factura Electrónica, Factura de Sujeto Excluido Electrónica y Factura de Exportación Electrónica, es necesario agregar la forma cómo se efectúa el pago de la operación 

La Condición de la operación consiste en los términos en que se acuerda realizar el pago de una operación entre el emisor y el receptor del DTE, mediante el campo denominado “Condición de la Operación”, utilizando el catálogo CAT-016, con las siguientes opciones: 

Manual Funcional del Sistema de Transmisión V 2.0 

48 



<!-- PAGE 52 / 80 -->



|Código|Valores|
|---|---|
|1|Contado|
|2|A crédito|
|3|Otro|



Las condiciones de la operación dictarán la manera de ingreso de las diferentes formas de pago. 

Para detallar las formas de pago se ha establecido en las estructuras de los DTE antes mencionados los siguientes campos: **Código de forma de pago:** Donde ingresará la codificación respectiva contenida en el catálogo CAT-017. 

1. **Monto por forma de pago:** Donde ingresará los valores monetarios que correspondan a cada una de las formas de pago que se detallen. 

2. **Referencia de modalidad de pago:** Cuando aplique podrá detallar el número de referencia de cada modalidad de pago detallada, a excepción de la modalidad de pago "billetes y monedas" (Ejemplo: Número de Cheque, transferencia bancaria, etc.). 

Si la forma de pago es "billetes y monedas " deberá enviar campo con null. 

3. **Plazo:** Cuando aplique deberá contener el tiempo del plazo otorgado expresado de acuerdo al código según Catálogo CAT-018 Plazo. Ejemplo si los pagos se han determinados mensuales se ingresará el código “2” Meses. 

4. **Periodo de Plazo:** Cuando aplique deberá de ingresar el número de días, meses o años en que se otorga el plazo. Ejemplo: si el plazo es 6 meses, en este campo se deberá ingresar únicamente el número 6. 

Como se hizo mención anteriormente, las formas de pago están relacionadas directamente con la condición de la operación, a continuación, se detalla el llenado de campos según corresponde: 

#### **1. Condición de la Operación 1-Contado** 

En este caso es necesario que se ingrese desde “1” hasta “n” formas de pago, debiendo detallar la información solicitada de la siguiente manera: 

a) Ejemplo de Venta de Contado con una forma de pago: Cliente paga en billetes y monedas por un valor de $50.00 

Condición de la operación: 1, Código de forma de pago 01, Monto por forma de pago: $50.00, Referencia de modalidad de pago: null, Plazo: null, Periodo plazo: null 

Manual Funcional del Sistema de Transmisión V 2.0 

49 



<!-- PAGE 53 / 80 -->



b) Ejemplo de Venta de contado con varias formas de pago: Venta por un valor de $150.00, cliente decide cancelar de la siguiente manera: $100.00 en billetes y monedas y $50.00 con tarjeta de crédito número 0000000054782, el DTE se completará de la siguiente forma: 

Condición de la operación: 1, {Código de forma de pago 01, Monto por forma de pago: $100.00, Referencia de modalidad de pago: null, Plazo: null, Periodo plazo: null}, 

{Código de forma de pago 02, Monto por forma de pago: $50.00, Referencia de modalidad de pago: 0000000054782, Plazo: null, Periodo plazo: null} 

De esta manera podrá ingresar “n” formas de pago según necesite, detallando los 5 campos por cada una de las formas de pago que adicione en el DTE y separando cada arreglo de datos por comas. 

#### **2. Condición de la Operación 2-Crédito.** 

Cuando la condición de la operación sea Crédito se deberá detallar la forma de pago, el plazo y periodo. Para detallar el plazo se deberá considera la codificación establecida en el catálogo CAT-018 Plazo. 

|Código|Valor|
|---|---|
|01|Días|
|02|Meses|
|03|Años|



Ejemplo: Se realiza una venta por $500.00 con pago a 6 meses plazo, se deberá detallar de la siguiente manera: 

Condición de la operación: 2, Código de forma de pago 01, Monto por forma de pago: $500.00, Referencia de modalidad de pago: null, Plazo: 02, Periodo plazo: 6 

#### **3. Condición de la Operación 3- Otro** 

Deberá utilizar esta opción cuando requiera ingresar condiciones de pago mixtas, es decir una parte del valor a pagar de contado y otra al crédito. 

Manual Funcional del Sistema de Transmisión V 2.0 

50 



<!-- PAGE 54 / 80 -->



Por ejemplo una venta por un valor de $474.60 por la cual se emitirá una Factura Electrónica y el cliente decide pagar de la siguiente manera: $174.60 con tarjeta de débito referencia 123456 y el resto al crédito ($300.00) en un plazo de dos meses. 

Se deberá completar de la siguiente manera: 

Condición de la operación: 3, 

{(Código de forma de pago: 02, Monto por forma de pago: $174.60, Referencia de modalidad de pago: 123456 Plazo: null, Periodo plazo: null), 

(Código de forma de pago 02, Monto por forma de pago: $300.00), Referencia de modalidad de pago: null Plazo: 02, Periodo plazo: 2)} 

## **XX. Ingreso de información para los ítems del Comprobante de Donación** 

Existen tres tipos de donación que una entidad puede recibir, a cada tipo de donación se le ha asignado un código que deberá ingresar en el campo “Tipo de donación” contenido en la sección cuerpo, dicha codificación se encuentra en el catálogo 026 de la siguiente manera: 1- Efectivo, 2- Bien, 3- Servicio. 

**1. Cuando el tipo de donación es Efectivo se condicionará la información en los campos siguientes:** 

- a) Cantidad: “1” 

- b) Descripción: Se deberá indicar el concepto de la donación. 

- c) Unidad de Medida: Se debe consignar “99” (Otra) 

- d) Depreciación: se deberá colocar $0.00 

- e) Valor Unitario: se deberá ingresar el valor del efectivo donado 

- f) Valor Donado: Deberá consignarse el resultado del campo “Valor Unitario” multiplicado por el campo “Cantidad” menos la cantidad consignada en el campo “Depreciación”. 

**2. Cuando el tipo de donación consiste en un Bien se ingresará de la siguiente manera:** 

- a) Cantidad se debe consignar la cantidad de bienes del mismo tipo. 

- b) Descripción se deberá indicar el concepto de la donación. Ejemplo: “Ambulancia Marca Mercedes Benz, Modelo T1, Año 2022” 

- c) Unidad de Medida se debe consignar la que corresponda conforme al CAT-014 unidad de medida. 

Manual Funcional del Sistema de Transmisión V 2.0 

51 



<!-- PAGE 55 / 80 -->



- d) Depreciación se deberá colocar el valor depreciado del bien según aplique (En caso de Bienes usados). 

- e) Valor unitario se deberá ingresar el valor del bien donado. 

- f) Valor Donado deberá consignarse el resultado del campo “Valor Unitario” multiplicado por el campo “Cantidad” menos la cantidad consignada en el campo “Depreciación”. 

**3. Cuando el tipo de donación consiste en un Servicio.** 

- a) Cantidad: se debe consignar la cantidad de servicios del mismo tipo. 

- b) Descripción: Se deberá indicar el concepto de la donación. 

- c) Unidad de Medida: Se debe consignar “99” (Otra) 

- d) Depreciación: se deberá colocar $0.00 

- e) Valor Unitario: se deberá ingresar el valor del servicio donado 

- f) Valor Donado: Deberá consignarse el resultado del campo “Valor Unitario” multiplicado por el campo “Cantidad” 

Es importante mencionar que en un mismo Comprobante de Donación Electrónico se pueden ingresar más de una donación y diferentes tipos de donación, ya que son ingresadas cada una por ítem. 

## **XXI. Redondeos y Holguras** 

#### **Redondeo:** 

Consiste en una regla fija para “elevar” en cada operación la última posición decimal dentro del rango, cuando la primera posición decimal fuera de rango sea mayor a un número convencional, representado por un número decimal igual o mayor a 5. 

Para efectos de los valores que se reflejen en la sección cuerpo de los DTES se ha establecido una longitud de 11.8, en los casos que los sistemas de facturación internos utilizados por los contribuyentes estén configurados con una longitud de decimales mayor, y la novena posición decimal de esta longitud sea igual o mayor a 5, la octava posición decimal se deberá redondear 1 hacia arriba. Cuando la novena posición decimal sea menor a cinco, se mantendrá el número que contenga la octava posición. 

#### **<u>Regla de Redondeos</u>** 

**Se presenta un ejemplo de un mismo ítem utilizando en una fila 8 decimales y en otros 15 decimales:** 

##### **Ejemplos 1:** 

|**Campos**|Sistema del Contribuyente|Estructura DTE|
|---|---|---|
|**Cantidad**|**1.87654321987654**|**1.87654322**|
|**Precio**|**3.55555555400000**|**3.55555555**|
|**Descuento**|**1**|**1**|
|**Venta**|**5.67215366775307**|**5.67215367**|



Manual Funcional del Sistema de Transmisión V 2.0 

52 



<!-- PAGE 56 / 80 -->



Como se visualiza en el ejemplo la novena posición en el campo “Cantidad” en el Sistema del Contribuyente se redondea a 2 en la octava posición decimal en la estructura del DTE ya que el número que ocupa la novena posición decimal es mayor que 5. Misma situación se observa en el campo “Venta”. 

Además, en campo precio donde la octava posición decimal se mantiene en 5 ya que la novena posición decimal es menor a 5 

Si su sistema interno utiliza una cantidad mayor de decimales para efecto de la transmisión del archivo DTE deberá cumplir con las reglas de redondeo definidas por la Administración Tributaria, ya que en la recepción del documento en los servidores del Ministerio de Hacienda se corren procesos de validación aritméticos, los cuales pueden generar rechazo. 

#### **Redondeos en Sección Resumen** 

Se permitirá hasta dos posiciones decimales (fraccionaria) en los campos numéricos de la Sección Resumen de los DTE. Si el contribuyente utiliza más de dos decimales en su sistema de facturación, la segunda posición decimal de estos campos se deberá redondear 1 hacia arriba cuando la tercera posición decimal sea 5 o mayor. Para los casos en que la tercera posición decimal sea menor a 5, se mantendrá el valor de la posición 2. 

#### **Ejemplos:** 

|**Campo Total a Pagar**|**Campo Total a Pagar en**<br>**Sistemapara ser Transmitido**|
|---|---|
|5.664|5.66|
|5.665|5.67|
|5.666|5.67|



#### **<u>Regla de Holgura:</u>** 

#### **Holgura:** 

Es la diferencia permitida en los campos numéricos de los DTE en referencia a los cálculos internos para efecto de verificaciones del cumplimiento de los datos recibidos. 

Para efecto de los DTE en los valores ingresados en la sección resumen se permitirá una tolerancia de una centésima. 

**Ejemplo:** Se tiene la siguiente información en la sección cuerpo aplicando las reglas de redondeo antes mencionadas y las holguras. 

|**Ítem**|**Cantidad**|**Precio**|**Holgura en Secció**<br>**Venta Gravada**|**n Cuerpo **<br>**Venta Gravada**<br>**(con redondeo)**|**V. G. Holgura**<br>**(-0.01)**|**V.G. Holgura**<br>**(+0.01)**|
|---|---|---|---|---|---|---|
|1|1.1219999999|2|2.2439999998|2.24400000|2.23400000|2.25400000|
|2|1.1259999999|2|2.2519999998|2.25200000|2.24200000|2.26200000|
|3|1.1299999999|2|2.2599999998|2.26000000|2.25000000|2.27000000|



Manual Funcional del Sistema de Transmisión V 2.0 

53 



<!-- PAGE 57 / 80 -->



Partiendo de esta información contenida en la sección cuerpo los valores en el resumen deberán reflejarse de la siguiente manera: 

||Total de|Tota|l de operaciones||||
|---|---|---|---|---|---|---|
|Holguras|operaciones<br>ventas|ve<br>(|ntas gravadas<br>redondeo dos|Holgura<br>(0.0)|Holgura<br>(-0.01)|Holgura<br>(+0.01)|
||gravadas||decimales)||||
|Suma V.G. Holgura 0.0|6.75599996|6.76||6.76|6.75|6.77|
|Suma V.G. Holgura -0.01|6.72600000|6.73||6.73|6.72|6.74|
|Suma V.G. Holgura +0.01|6.78600000|6.79||6.79|6.78|6.80|



Se puede observar que, para efectos de ingresar los valores correspondientes al Total de operaciones ventas gravadas el valor con las reglas de redondeo a ingresar en el campo es $6.76, teniendo una tolerancia de $0.01 hacia arriba o hacia abajo, por tanto, es posible ingresar en este campo los siguientes valores: $6.75, $6.76 o $6.77. 

Si se retoman los valores aplicando holguras de -0.01 en el cuerpo del documento el valor a ingresar es $6.73 teniendo una tolerancia de $0.01 hacia arriba o hacia abajo, por tanto, es posible ingresar en este campo los siguientes valores: $6.72, $6.73 o $6.74. 

Si se retoman los valores aplicando holguras de +0.01 en el cuerpo del documento el valor a ingresar es $6.79 teniendo una tolerancia de $0.01 hacia arriba o hacia abajo, por tanto, es posible ingresar en este campo los siguientes valores: $6.78, $6.79 o $6.80. 

En ese sentido, sin perjuicio de las posiciones decimales utilizadas por los contribuyentes en sus operaciones internas, éstos deberán cumplir con las anteriores reglas de redondeos y holgura en la generación de los DTE, ajustándose a ocho posiciones decimales los campos por ítem y a dos posiciones decimales los campos de la Sección Resumen, dentro de la holgura antes establecida. 

Manual Funcional del Sistema de Transmisión V 2.0 1 



<!-- PAGE 58 / 80 -->



## **XXII. Representaciones Gráficas** 

1. Factura Electrónica V2: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.2<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>FACTURA<br>Código de Generación: Modelo de Facturación: IDENTIFICACIÓN<br>Número de Control: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:  Tipo de doc. de Identificación: N° de doc. de Identificación<br>NRC:  NRC:<br>EMISOR Actividad económica : Actividad económica<br> RECEPTOR<br>Dirección:  Dirección:<br>Teléfono: Teléfono:<br>Correo electrónico: Correo electrónico:<br>Nombre Comercial:<br>VENTA POR CUENTA DE TERCEROS<br>       NIT: Nombre del Tercero: VENTA POR CUENTA<br>DE TERCEROS<br>DOCUMENTOS RELACIONADOS<br>       Tipo de Documento: N° de documento:  Fecha de documento:  DOCUMENTOS<br>RELACIONADOS<br>OTROS DOCUMENTOS ASOCIADOS<br>OTROS<br>Identificación del documento: Descripción: DOCUMENTOS<br>ASOCIADOS<br>Ventas<br>CUERPO N° Cantidad Unidad  Código Descripción UnitarioPrecio  Descuento por ítem Otros Montos No Afectos No  ExentasVentas  GravadasVentas<br>Sujetas<br>Suma de Ventas:<br>Sumatoria de ventas:<br>Descuento global a ventas no sujetas:<br>Descuento global a ventas exentas:<br>Descuento global a ventas gravadas:<br> Valor del<br>Nombre del Tributo<br>Tributo<br>Sub-Total RESUMEN<br>IVA Retenido:<br>Monto Total de la Operación:<br>Total Otros Montos No Afectos:<br>Total a Pagar:<br>Valor en Letras: Condición de la Operación:<br>Observaciones:<br>Pagina 1 de 1<br>Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por<br>la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento<br>pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión V 2.0 2 



<!-- PAGE 59 / 80 -->



2. Comprobante de Crédito Fiscal Electrónico V4: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.4<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>COMPROBANTE DE CRÉDITO FISCAL<br>Código de Generación: Modelo de Facturación:<br>SELLO DE  Número de Control : Tipo de Transmisión: IDENTIFICACIÓN<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>EMISOR RECEPTOR<br>Nombre: Nombre:<br>NIT: NIT:<br>NRC: NRC:<br>Actividad económica: Actividad económica:<br>EMISOR Dirección: Dirección: RECEPTOR<br>Teléfono: Teléfono:<br>Correo electrónico:  Correo electrónico:<br>Nombre comercial: Nombre comercial:<br>VENTA POR CUENTA DE TERCEROS<br>      NIT: Nombre del Tercero: VENTA POR CUENTA<br>DE TERCEROS<br>DOCUMENTOS RELACIONADOS<br>       Tipo de Documento: N° de documento:  Fecha de documento:  DOCUMENTOS RELACIONADOS<br>OTROS DOCUMENTOS ASOCIADOS<br>      Identificación del documento: Descripción: OTROS DOCUMENTOS ASOCIADOS<br>N°  Cantidad Unidad  Código Descripción  UnitarioPrecio  Descuento por item Otros montos no afectos Ventas No Sujetas Ventas Exentas GravadasVentas<br>CUERPO<br>Suma de Ventas:<br>Suma Total de Operaciones:<br>Descuento global a ventas no sujetas:<br>Descuento global a ventas exentas:<br>Descuento global a ventas gravadas:<br>Nombre del Tributo: Valor del<br>Tributo<br>Sub-Total:<br>IVA Percibido: RESUMEN<br>IVA Retenido:<br>Monto Total de la Operación:<br>Total  Otros montos no afectos:<br>Total a  Pagar:<br>     Valor en Letras: Condición de la Operación:<br>     Observaciones:<br>Pagina 1 de 1<br><!-- End of picture text -->



<!-- Start of picture text -->
Manual Funcional del Sistema de Transmisión V 2.0                                                    3<br><!-- End of picture text -->



<!-- PAGE 60 / 80 -->

3. Nota de Remisión Electrónica V4: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.4<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>NOTA DE REMISIÓN<br>Código de Generación: Modelo de Facturación: IDENTIFICACIÓN<br>Número de Control: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:  Tipo de Documento de  Número de documento de<br>Identificación : Identificación<br>NRC:<br>NRC:<br>Actividad económica: Actividad económica:<br>EMISOR RECEPTOR<br>Dirección:  Dirección:<br>Teléfono: Correo electrónico:<br>Correo electrónico: Nombre Comercial:<br>Nombre Comercial:<br>Bienes Remitidos a Título<br>de:<br>VENTA POR CUENTA DE TERCEROS<br>VENTA POR CUENTA<br>         NIT: Nombre del Tercero:<br>DE TERCEROS<br>DOCUMENTOS RELACIONADOS<br>DOCUMENTOS<br>       Tipo de Documento:                      N° de documento:  Fecha del Documento:<br>RELACIONADOS<br>Precio   Descuento  Ventas No  Ventas  Ventas<br>CUERPO N°  Cantidad Unidad Código Descripción Unitario por ítem  Sujetas Exentas Gravadas<br>Suma de Ventas:<br>Suma Total de Operaciones:<br>Descuento global a ventas no sujetas:<br>Descuento global a ventas exentas:<br>Descuento global a ventas gravadas:<br>Sub-Total:<br>Valor del   RESUMEN<br>Nombre del Tributo:<br>Tributo<br>Monto Total de la Operación:<br>Valor en Letras:<br>Observaciones:<br>Pagina 1 de 1<br>Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la<br>persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento<br>pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.<br><!-- End of picture text -->

Manual funcional del Sistema de Transmisión 4 



<!-- PAGE 61 / 80 -->



4. Nota de Crédito Electrónica V4 (Ajustando un Comprobante de Crédito Fiscal): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.4<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>NOTA DE CRÉDITO<br>IDENTIFICACIÓN<br>Código de Generación: Módelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>SELLO DE  Sello de Recepción: Fecha y Hora de Generación:<br>RECEPCIÓN<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:      Tipo de doc. de identificació N° de doc. de identificación:<br>NRC: NRC:<br>RECEPTOR<br>EMISOR   Actividad económica : Actividad económica:<br>Dirección:  Dirección:<br>Teléfono: Teléfono:<br>Correo electrónico: Correo electrónico:<br>Nombre Comercial: Nombre Comercial:<br>VENTA POR CUENTA DE TERCEROS<br>VENTA POR<br>      NIT: Nombre del Tercero:<br>CUENTA DE<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>DOCUMENTOS<br>     Tipo de Documento: N° de Documento:  Fecha del Documento:<br>RELACIONADOS<br>Otros  Ventas<br>N° de Doc.  IVA   IVA  Precio  Descuerto  Ventas  Ventas<br>CUERPO N°  Relacionado Percibido  Retenido Cantidad Unidad Código Descripción  Unitario por ítem Montos no Afectos SujetasNo  Exentas Gravadas<br>SUMA DE VENTAS:<br>Suma Total de Operaciones:<br> Valor del<br>Nombre del Tributo:<br>Tributo<br>Monto Total de la Operación: RESUMEN<br>Total IVA Percibido:<br>Total IVA Retenido:<br>Total Otros Montos no Afectos:<br>Total a pagar:<br>         Valor en Letras: Condición de la Operación:<br>         Observaciones:<br>Pagina 1 de 1<br><!-- End of picture text -->

**Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 5 



<!-- PAGE 62 / 80 -->



4.1 Nota de Crédito Electrónica V4 (Ajustando un Comprobante de Retención): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.4<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>NOTA DE CRÉDITO<br>IDENTIFICACIÓN<br>Código de Generación: Módelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>SELLO DE  Sello de Recepción: Fecha y Hora de Generación:<br>RECEPCIÓN<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:  Tipo de doc. de  N° de doc. de<br>identificación: identificación:<br>NRC: NRC:<br>RECEPTOR<br>EMISOR   Actividad económica : Actividad económica:<br>Dirección:  Dirección:<br>Teléfono: Teléfono:<br>Correo electrónico: Correo electrónico:<br>Nombre Comercial: Nombre Comercial:<br>VENTA POR CUENTA DE TERCEROS<br>      NIT: Nombre del Tercero: VENTA POR<br>CUENTA DE<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>DOCUMENTOS<br>     Tipo de Documento: N° de Documento:  Fecha del Documento:<br>RELACIONADOS<br>N° de Doc.  IVA  IVA<br>CUERPO N° Relacionado 13% Retenido Cantidad Unidad Código Descripción UnitarioPrecio  Ventas No Sujetas ExentasVentas  GravadasVentas<br>Suma de Ventas:<br>Suma Total de Operaciones:<br>Monto Total de la Operación:  RESUMEN<br>Total IVA 13%:<br>Total IVA Retenido:<br>Total a Pagar:<br>         Valor en Letras: Condición de la Operación:<br>         Observaciones:<br>Pagina 1 de 1<br>Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento<br>seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se<br>selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento<br>respectivo a la par.<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 6 



<!-- PAGE 63 / 80 -->



5. Nota de Débito Electrónica V4 (Ajustando un Comprobante de Crédito Fiscal): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.4<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>NOTA DE DÉBITO<br>IDENTIFICACIÓN<br>Código de Generación: Módelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>SELLO DE  Sello de Recepción: Fecha y Hora de Generación:<br>RECEPCIÓN<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:      Tipo de doc. de identificació N° de doc. de identificación:<br>NRC: NRC:<br>RECEPTOR<br>EMISOR   Actividad económica : Actividad económica:<br>Dirección:  Dirección:<br>Teléfono: Teléfono:<br>Correo electrónico: Correo electrónico:<br>Nombre Comercial: Nombre Comercial:<br>VENTA POR CUENTA DE TERCEROS<br>VENTA POR<br>      NIT: Nombre del Tercero:<br>CUENTA DE<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>DOCUMENTOS<br>     Tipo de Documento: N° de Documento:  Fecha del Documento:<br>RELACIONADOS<br>Otros  Ventas<br>N° de Doc.  IVA   IVA  Precio  Descuerto  Ventas  Ventas<br>CUERPO N°  Relacionado Percibido  Retenido Cantidad Unidad Código Descripción  Unitario por ítem Montos no Afectos SujetasNo  Exentas Gravadas<br>SUMA DE VENTAS:<br>Suma Total de Operaciones:<br> Valor del<br>Nombre del Tributo:<br>Tributo<br>Monto Total de la Operación: RESUMEN<br>Total IVA Percibido:<br>Total IVA Retenido:<br>Total Otros Montos no Afectos:<br>Total a pagar:<br>         Valor en Letras: Condición de la Operación:<br>         Observaciones:<br>Pagina 1 de 1<br><!-- End of picture text -->

**Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 7 



<!-- PAGE 64 / 80 -->



5.1 Nota de Débito Electrónica V4 (Ajustando un Comprobante de Retención): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.4<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>NOTA DE DÉBITO<br>IDENTIFICACIÓN<br>Código de Generación: Módelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>SELLO DE  Sello de Recepción: Fecha y Hora de Generación:<br>RECEPCIÓN<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:  Tipo de doc. de  N° de doc. de<br>identificación: identificación:<br>NRC: NRC:<br>RECEPTOR<br>EMISOR   Actividad económica : Actividad económica:<br>Dirección:  Dirección:<br>Teléfono: Teléfono:<br>Correo electrónico: Correo electrónico:<br>Nombre Comercial: Nombre Comercial:<br>VENTA POR CUENTA DE TERCEROS<br>      NIT: Nombre del Tercero: VENTA POR<br>CUENTA DE<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>DOCUMENTOS<br>     Tipo de Documento: N° de Documento:  Fecha del Documento:<br>RELACIONADOS<br>N° de Doc.  IVA  IVA<br>CUERPO N° Relacionado 13% Retenido Cantidad Unidad Código Descripción UnitarioPrecio  Ventas No Sujetas ExentasVentas  GravadasVentas<br>Suma de Ventas:<br>Suma Total de Operaciones:<br>Monto Total de la Operación:  RESUMEN<br>Total IVA 13%:<br>Total IVA Retenido:<br>Total a Pagar:<br>         Valor en Letras: Condición de la Operación:<br>         Observaciones:<br>Pagina 1 de 1<br>Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento<br>seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se<br>selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento<br>respectivo a la par.<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 8 



<!-- PAGE 65 / 80 -->



6. Comprobante de Retención Electrónico V2: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.2<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>COMPROBANTE DE RETENCIÓN<br>Código de Generación: Módelo de Facturación:<br>IDENTIFICACIÓN<br>Número de Control: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>EMISOR<br>Nombre:  NIT:  Dirección:<br>AGENTE DE<br>NRC:  Actividad económica: Nombre Comercial: RETENCIÓN<br>Teléfono: Correo electrónico:<br>RECEPTOR<br>Nombre: Dirección: Nombre Comercial:<br>SUJETO DE<br>Tipo de Doc. de Identificación: N° Documento de Identificación: NRC: RETENCIÓN<br>Actividad económica:  Correo Electrónico:<br>Fecha del  Monto Sujeto<br>N°  Tipo de Doc. Relacionado N° del Doc. relacionado Descripción  IVA Retenido CUERPO<br>doc. a Retención<br>Total Monto sujeto a retención:<br>IVA generado 13%: RESUMEN<br>Total IVA Retenido:<br>Valor en Letras IVA retenido:<br>Observaciones:<br>Pagina 1 de 1<br>Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado<br>por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de<br>documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 9 



<!-- PAGE 66 / 80 -->



7. Comprobante de Liquidación V2: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.2<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>COMPROBANTE DE LIQUIDACIÓN<br>IDENTIFICACIÓN<br>Código de Generación: Módelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>COMISIONISTA (Emisor) MANDANTE (Receptor)<br>Nombre:  Nombre:<br>NIT:  Tipo de doc. de Identificación: N° de doc. de Identificación<br>NRC:  NRC:<br>Actividad económica : Actividad económica:  INFORMACIÓN<br>INFORMACIÓN<br>Dirección:  Dirección: MANDANTE<br>COMISIONISTA<br>Teléfono: Correo electrónico:<br>Correo electrónico:  Nombre Comercial:<br>Nombre Comercial:<br>Tipo de<br>Tipo de Doc.  N° de Doc.  Ventas No  Ventas  Ventas<br>N°  Generación  Fecha  Exportaciones CUERPO<br>Relacionado Relacionado  Sujetas Exentas Gravadas<br>Doc.<br>Suma de Ventas:<br>Suma Total Operaciones:<br> Valor del<br>Nombre del Tributo: RESUMEN<br>Tributo<br>Monto Total de la Operación:<br>IVA percibido:<br>Total:<br>      Valor en Letras: Condición de la Operación:<br>      Observaciones:<br>Pagina 1 de 1<br><!-- End of picture text -->

**Nota: En sección Receptor, El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el DTE así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 10 



<!-- PAGE 67 / 80 -->



8. Documento Contable de Liquidación Electrónico V2: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.2<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>DOCUMENTO CONTABLE DE LIQUIDACIÓN<br>IDENTIFICACIÓN<br>Código de Generación: Módelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>RECEPCIÓNSELLO DE  Sello de Recepción: Fecha y Hora de Generación:<br>AGENTE PERCEPTOR (Emisor)<br>Nombre:  Nombre Comercial: NIT :<br>NRC:  Actividad económica : Dirección:  EMISOR<br>(AGENTE<br>Teléfono: Correo electrónico:  PERCEPTOR)<br>AFILIADO (Receptor)<br>Nombre: Actividad económica:<br>NIT:  Dirección: RECEPTOR<br>NRC: Correo electrónico: (AFILIADO)<br>Tipo de establecimiento: Nombre Comercial:<br>Fecha inicio del periodo de<br>Liquidación: Fecha fin del periodo de liquidación:<br>Cantidad de documentos de<br>Valor de las operaciones a liquidar:<br>liquidación:<br>Descripción del monto no sujeto a  Comisión:<br>percepción:<br>Valores no sujetos a percepción: Porcentaje de comisión:<br>CUERPO<br>Subtotal: IVA de la comisión:<br>IVA de las operaciones a liquidar: Valor Liquido a pagar al Afiliado:<br>Montos sujetos  a percepción sin IVA: Valor en  Letras:<br>IVA Percibido (2%): Observaciones:<br>Nombre del Responsable de la liquidación: EXTENSIÓN<br>Doc. de identificación:<br>Pagina 1 de 1<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 11 



<!-- PAGE 68 / 80 -->



9. Factura de Exportación Electrónica V3: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.3<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>FACTURA DE EXPORTACIÓN<br>IDENTIFICACIÓN<br>Código de Generación: Modelo de Facturación:<br>Número de Control: Tipo de Transmisión:<br>RECEPCIÓNSELLO DE  Sello de Recepción: Fecha y Hora de Generación:<br>EXPORTADOR (Emisor) RECEPTOR<br>Nombre:  Nombre:<br>NIT:  Tipo de doc. de Identificación: N° de doc. de Identificación<br>NRC:  Actividad Económica:<br>Actividad Económica: País destino:<br>Dirección:  Dirección:<br>EMISOR RECEPTOR<br>Teléfono: Correo electrónico:<br>Correo electrónico: Nombre Comercial:<br>Nombre Comercial:<br>Recinto Fiscal:<br>Tipo de Régimen:<br>Régimen de Exportación:<br>VENTA POR CUENTA DE TERCEROS VENTA POR<br>CUENTA DE<br>       NIT: Nombre del Tercero:<br>TERCEROS<br>COMPRA POR CUENTA DE TERCEROS COMPRA POR<br>CUENTA DE<br>N° de Doc. de Identificación: Nombre del Tercero:<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>Tipo de Documento N° de Documento Fecha de Documento DOCUMENTOS<br>RELACIONADOS<br>DOCUMENTOS ASOCIADOS<br>Identificación del documento asociado Descripción del documento asociado Modo de transporte identificación del Número de conductor apellidos del conductorNombre y  Número de identificación del transporte DOCUMENTOS<br>ASOCIADOS<br>N°  Cantidad Unidad  Código Descripción  Precio Unitario Descuento por Ítem Otros Montos No Afectos GravadasVentas<br>CUERPO<br>Total de Operaciones Gravadas:<br>Descuento Global a Ventas Gravadas:<br>Seguro:<br>Flete:<br>Nombre del Tributo: Valor del<br>Tributo<br> Monto Total de la Operación: RESUMEN<br>Total Otros Montos No Afectos:<br>Total a Pagar:<br>Transferencias de bienes no onerosas:<br>Valor en Letras:<br>Condición de la Operación:<br>Descripción INCOTERMS:<br>Observaciones:<br>Página 1 de 1<br>Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la<br>persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte,<br>aparecerá la palabra pasaporte y el número de documento respectivo a la par.<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 12 



<!-- PAGE 69 / 80 -->



10. Factura Sujeto Excluido Electrónica V2: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.2<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>FACTURA SUJETO EXCLUIDO<br>Código de Generación: Módelo de Facturación: IDENTIFICACIÓN<br>Número de Control: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>NIT:  Tipo de doc. de Identificación: N° de doc. de Identificación:<br>NRC: Actividad Económica:<br>EMISOR Actividad económica : Dirección:  RECEPTOR(SUJETO<br>Dirección:  Correo electrónico: EXCLUIDO)<br>Teléfono:<br>Correo electrónico:<br>CUERPO N° Cantidad Unidad  Código Descripción  Precio Unitario Descuento por ítem Compras<br>Total de Operaciones:<br>Descuento global al total de operaciones:<br>Sub-Total<br>Retención Renta:<br>Total a Pagar: RESUMEN<br>Valor en Letras: Condición de la Operación:<br>Observaciones:<br>Pagina 1 de 1<br><!-- End of picture text -->

**Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 13 



<!-- PAGE 70 / 80 -->



11. Comprobante de Donación Electrónico V2: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.2<br>DOCUMENTO TRIBUTARIO ELECTRÓNICO<br>COMPROBANTE DE DONACIÓN<br>Código de Generación: Módelo de Facturación: IDENTIFICACIÓN<br>Número de Control: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción: Fecha y Hora de Generación:<br>EMISOR RECEPTOR<br>Nombre:  Nombre:<br>   Tipo de doc. de identificación: N° de doc. de Identificación: Tipo de doc. de identificación: N° de doc. de Identificación:<br>NRC: Actividad económica :<br>Actividad económica :     Dirección:<br>EMISOR Dirección: Teléfono:<br> RECEPTOR<br>Teléfono: Correo electrónico:<br>Correo electrónico:<br>OTROS DOCUMENTOS ASOCIADOS<br>OTROS<br>  Documento Asociado: Identificación documento: Descripción: DOCUMENTOS<br>ASOCIADOS<br>Unidad de  Valor  Valor<br>CUERPO N° Cantidad Descripción Depreciación<br>Medida Unitario Donado<br>Total de la Donación<br>RESUMEN<br>Valor en Letras:<br>Observaciones<br>Pagina 1 de 1<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 14 



<!-- PAGE 71 / 80 -->



12. Evento de Invalidación V3: La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.3<br>EVENTO DE INVALIDACIÓN<br>Identificación Código de Generación:<br>Fecha y Hora del evento:<br>Sello de Recepción:<br>Sello de Recepción<br>Identificación del Emisor Identificación del Receptor<br>Identificación del<br>Nombre: Nombre: Receptor<br>Identificación del Emisor NIT: Tipo de doc. de Identificación: N° de doc. de Identificación:<br>Teléfono: Correo electrónico:<br>Correo Electrónico:<br>Información relativa al Motivo de Invalidación<br>Tipo de Invalidación: Nombre de quien solicita el evento<br>Motivo: Tipo de doc. de Identificación: N° de doc. de Identificación:<br>Información relativa al Motivo de<br>Nombre de quien realiza el evento<br>Invalidación<br>Tipo de doc. de Identificación N° de doc. de Identificación:<br>Número de  Fecha de<br>Tipo DTE/Evento Código de Generación aplicado Sello de Recepción<br>Control Generación<br>Identificación del<br>Documento/Evento a Invalidar<br>Código de Generación que reemplaza al invalidado:<br>Página 1 de 1<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 15 



<!-- PAGE 72 / 80 -->



13. Evento de Retorno V1 (Ajustando una Factura): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
EVENTO DE RETORNO<br>IDENTIFICACIÓN<br>Código de Generación: Modelo de Facturación:<br>SELLO DE  Sello de Recepción: Tipo de Transmisión:<br>RECEPCIÓN Fecha y Hora del evento:<br>Emisor Receptor<br>Nombre: Nombre:<br>NIT:<br>IDENTIFICACIÓN Tipo de doc. de identificaciónN° de doc. de identificación<br>DEL EMISOR Recinto Fiscal: Teléfono: IDENTIFICACIÓN<br>DEL RECEPTOR<br>Tipo de Régimen  Correo:<br>Régimen de Exportación: País destino de la exportación:<br>VENTA POR CUENTA DE TERCEROS<br>VENTA POR<br>       NIT: Nombre del Tercero: CUENTA DE<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>Tipo de Documento N° de Documento DocumentoFecha de  RELACIONADOSDOCUMENTOS<br>CUERPO N°  Generación del DTECódigo de  RetenidoIVA  Cantidad Código Descripción Unidad  UnitarioPrecio  Descuento por ítem Otros Montos no Afectos Ventas No Sujetas ExentasVentas  GravadasVentas<br>1<br>2<br>Suma de Ventas  $0.00 $0.00 $0.00<br>Suma de operaciones: $0.00<br>Nombre del Tributo: $0.00<br>Total IVA Retenido:  $0.00 RESUMEN<br>Monto Total de la Operación: $0.00<br>Total Otros Montos no Afectos: $0.00<br>Total a pagar: $0.00<br>Valor en Letras:<br><!-- End of picture text -->



**Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 16 



<!-- PAGE 73 / 80 -->



13.1 Evento de Retorno V1 (Ajustando una Factura de Exportación): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
EVENTO DE RETORNO<br>IDENTIFICACIÓN<br>Código de Generación: Modelo de Facturación:<br>SELLO DE  Sello de Recepción: Tipo de Transmisión:<br>RECEPCIÓN Fecha y Hora del evento:<br>Emisor Receptor<br>Nombre: Nombre:<br>IDENTIFICACIÓN NIT: Tipo de doc. de identificación: N° de doc. de identificación<br>DEL EMISOR Recinto Fiscal: Teléfono: IDENTIFICACIÓN<br>DEL RECEPTOR<br>Tipo de Régimen  Correo:<br>Régimen de Exportación: País destino de la exportación:<br>VENTA POR CUENTA DE TERCEROS VENTA POR<br>CUENTA DE<br>       NIT: Nombre del Tercero: TERCEROS<br>COMPRA POR CUENTA DE TERCEROS<br>COMPRA POR<br>CUENTA DE  N° de Doc. de Identificación: Nombre del Tercero:<br>TERCEROS<br>DOCUMENTOS RELACIONADOS<br>DOCUMENTOS<br>Tipo de Documento N° de Documento Fecha de Documento RELACIONADOS<br>Precio<br>CUERPO N°  Generación del DTECódigo de  Seguro Flete Cantidad Código Descripción Unidad  Unitario o por ítemDescuent Otros Montos no Afectos GravadasVentas<br>1<br>2<br>Suma de Ventas : $0.00<br>Suma de operaciones: $0.00<br>Nombre del Tributo: $0.00<br>Total Seguro: $0.00<br>Total Flete: $0.00 RESUMEN<br>Total IVA Retenido:  $0.00<br>Total Retención Renta: $0.00<br>Total Otros Montos no Afectos: $0.00<br>Monto Total de la Operación: $0.00<br>Total a pagar: $0.00<br>Valor en Letras:<br><!-- End of picture text -->

**Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 17 



<!-- PAGE 74 / 80 -->



13.2 Evento de Retorno V1 (Ajustando una Factura de Sujeto Excluido): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
EVENTO DE RETORNO<br>SELLO DE  Código de Generación: Modelo de Facturación: IDENTIFICACIÓN<br>RECEPCIÓN Sello de Recepción: Tipo de Transmisión:<br>Fecha y Hora del evento:<br>Emisor Receptor<br>Nombre: Nombre:<br>NIT:<br>IDENTIFICACIÓN Tipo de doc. de identifica N° de doc. de identificación<br>DEL EMISOR Recinto Fiscal: Teléfono: IDENTIFICACIÓN<br>DEL RECEPTOR<br>Tipo de Régimen  Correo:<br>Régimen de Exportación: País destino de la exportación:<br>DOCUMENTOS RELACIONADOS<br>Tipo de Documento N° de Documento Fecha de Documento DOCUMENTOS<br>RELACIONADOS<br>CUERPO N°  Generación del DTECódigo de  Retención Renta Cantidad Código Descripción Unidad  UnitarioPrecio  Descuento por ítem Compras a ExcluidosSujetos<br>1<br>2<br>Suma de Ventas  $0.00<br>Suma de operaciones: $0.00<br>Total Retención Renta: $0.00 RESUMEN<br>Monto Total de la Operación: $0.00<br>Total a pagar: $0.00<br>Valor en Letras:<br><!-- End of picture text -->



**Nota: El campo "Tipo de doc. de Identificación" será dinamico, es decir de acuerdo al tipo de documento seleccionado por la persona que esta realizando el Evento así aparecerá en la Versión Legible. Ejemplo, si se selecciono el tipo de documento pasaporte, aparecerá la palabra pasaporte y el número de documento respectivo a la par.** 

Manual Funcional del Sistema de Transmisión 18 



<!-- PAGE 75 / 80 -->



14. Evento de Operaciones Especiales V1 (Para Usuarios de Factura Simplificada por rango): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.1<br>EVENTO DE OPERACIONES ESPECIALES<br>Código de Generación: Módelo de Facturación: IDENTIFICACIÓN<br>Fecha y Hora del evento: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción:<br>EMISOR<br>NIT (Emisor):<br>EMISOR<br>Nombre (Emisor);<br>Código de  Fecha<br>CUERPO N° Generación de  Tipo de  Documento  Cantidad Descripción Doc. Del Doc. Al Precio  Ventas No  Ventas  Ventas<br>EOE de  Documento Unitario Sujetas Exentas Gravadas<br>referencia Origen<br>Suma de Ventas<br>Nombre del Tributo:<br>Sub-Total<br>RESUMEN<br>Total:<br>Valor en Letras:<br>Pagina 1 de 1<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 19 



<!-- PAGE 76 / 80 -->



14.1 Evento de Operaciones Especiales V1 (Para Usuarios de Factura Simplificada uno a uno): La Representación Gráfica que se presenta a continuación es de carácter sugerido, usted puede configurar la que va a desarrollar de acuerdo a sus necesidades y su operatividad, respetando la categorización asignada a cada campo. 



<!-- Start of picture text -->
Ver.1<br>EVENTO DE OPERACIONES ESPECIALES<br>Código de Generación: Módelo de Facturación:<br>Fecha y Hora del evento: Tipo de Transmisión:<br>SELLO DE<br>RECEPCIÓN Sello de Recepción:<br>IDENTIFICACIÓN<br>EMISOR<br>Nombre (Emisor);<br>EMISOR<br>NIT (Emisor):<br>Código de  Fecha<br>CUERPO N° Generación de  Tipo de  Documento  Documento  Cantidad Descripción  Precio  Ventas No  Ventas  Ventas<br>EOE de  Documento Origen Unitario Sujetas Exentas Gravadas<br>Origen<br>referencia<br>Suma de ventas<br>Nombre del Tributo: RESUMEN<br>Sub- Total:<br>Total:<br>Valor en Letras:<br>Pagina 1 de 1<br><!-- End of picture text -->

Manual Funcional del Sistema de Transmisión 20 



<!-- PAGE 77 / 80 -->



## **XXIII. Ejemplo Archivo DTE** 

Se muestra ejemplo de archivo JSON DTE firmado y con Sello de Recepción; es importante detallar que las partes del Archivo DTE deben cumplir con lo establecido en la Normativa de Cumplimiento de los DTE, especialmente con los nombres de objeto/atributos base para la firma electrónica (“firmaElectronica”: “”) y Sello de Recepción (“selloRecibido”: “”). 

{"identificacion":{"version":3,"ambiente":"00","tipoDte":"03","numeroControl":"DTE-03- 00000000000000000000253","codigoGeneracion":"341CA743-70F1-4CFE-88BC- 7E4AE72E60CB","tipoModelo":1,"tipoOperacion":1,"tipoContingencia":null,"motivoContin":null,"fecEmi":"2 022-11- 

28","horEmi":"10:19:44","tipoMoneda":"USD"},"documentoRelacionado":null,"emisor":{"nit":"22222222222 221","nrc":"9000089","nombre":"USUARIO DE PRUEBA","codActividad":"46900","descActividad":"Venta al por mayor de otros 

productos","nombreComercial":null,"tipoEstablecimiento":"02","direccion":{"departamento":"06","municipio ":"14","complemento":"AV. ALVARADO DIAG. CENTROAMERICA, # 4,"},"telefono":"78963333","correo":"salvador@ggg.com","codEstableMH":null,"codEstable":null,"codPunt oVentaMH":null,"codPuntoVenta":null},"receptor":{"nit":"22222222222211","nrc":"9000009","nombre":"SA LVADOR CABAL","codActividad":"69","descActividad":"ACTIVIDADES JURÍDICAS Y CONTABLES","nombreComercial":null,"direccion":{"departamento":"06","municipio":"14","complemento":" Dirección de Prueba 1, N° 

1234"},"telefono":"22444444","correo":"salvadorcabal@prueba.com"},"otrosDocumentos":null,"ventaTerc ero":null,"cuerpoDocumento":[{"numItem":1,"tipoItem":1,"numeroDocumento":null,"codigo":null,"codTribut o":null,"descripcion":"Servicio de consultoria contable","cantidad":1,"uniMedida":59,"precioUni":2000,"montoDescu":0,"ventaNoSuj":0,"ventaExenta":0, "ventaGravada":2000,"tributos":["20"],"psv":0,"noGravado":0}],"resumen":{"totalNoSuj":0,"totalExenta":0,"t otalGravada":2000,"subTotalVentas":2000,"descuNoSuj":0,"descuExenta":0,"descuGravada":0,"porcentaj eDescuento":0,"totalDescu":0,"tributos":[{"codigo":"20","descripcion":"Impuesto al Valor Agregado 13%","valor":260}],"subTotal":2000,"ivaPerci1":0,"ivaRete1":0,"reteRenta":0,"montoTotalOperacion":2260, "totalNoGravado":0,"totalPagar":2260,"totalLetras":"DOS MIL DOSCIENTOS SESENTA DÓLARES ","saldoFavor":0,"condicionOperacion":1,"pagos":[{"codigo":"01","montoPago":2260,"plazo":null,"referenci a":"","periodo":null}],"numPagoElectronico":null},"extension":{"nombEntrega":null,"docuEntrega":null,"nom bRecibe":null,"docuRecibe":null,"observaciones":null,"placaVehiculo":null},"apendice":null,"firmaElectronic a":"eyJhbGciOiJSUzUxMiJ9.ewogICJpZGVudGlmaWNhY2lvbiIgOiB7CiAgICAidmVyc2lvbiIgOiAzLAogIC AgImFtYmllbnRlIiA6ICIwMCIsCiAgICAidGlwb0R0ZSIgOiAiMDMiLAogICAgIm51bWVyb0NvbnRyb2wiIDo gIkRURS0wMy0wMDAwMDAwMC0wMDAwMDAwMDAwMDAyNTMiLAogICAgImNvZGlnb0dlbmVyYWN pb24iIDogIjM0MUNBNzQzLTcwRjEtNENGRS04OEJDLTdFNEFFNzJFNjBDQiIsCiAgICAidGlwb01vZGVs byIgOiAxLAogICAgInRpcG9PcGVyYWNpb24iIDogMSwKICAgICJ0aXBvQ29udGluZ2VuY2lhIiA6IG51bG wsCiAgICAibW90aXZvQ29udGluIiA6IG51bGwsCiAgICAiZmVjRW1pIiA6ICIyMDIyLTExLTI4IiwKICAgICJo b3JFbWkiIDogIjEwOjE5OjQ0IiwKICAgICJ0aXBvTW9uZWRhIiA6ICJVU0QiCiAgfSwKICAiZG9jdW1lbnRv UmVsYWNpb25hZG8iIDogbnVsbCwKICAiZW1pc29yIiA6IHsKICAgICJuaXQiIDogIjIyMjIyMjIyMjIyMjIxIiwK ICAgICJucmMiIDogIjkwMDAwODkiLAogICAgIm5vbWJyZSIgOiAiU0FMVkFET1IgQ0FCQUxJVE8iLAogIC AgImNvZEFjdGl2aWRhZCIgOiAiNDY5MDAiLAogICAgImRlc2NBY3RpdmlkYWQiIDogIlZlbnRhIGFsIHBvc iBtYXlvciBkZSBvdHJvcyBwcm9kdWN0b3MiLAogICAgIm5vbWJyZUNvbWVyY2lhbCIgOiBudWxsLAogIC AgInRpcG9Fc3RhYmxlY2ltaWVudG8iIDogIjAyIiwKICAgICJkaXJlY2Npb24iIDogewogICAgICAiZGVwYXJ 0YW1lbnRvIiA6ICIwNiIsCiAgICAgICJtdW5pY2lwaW8iIDogIjE0IiwKICAgICAgImNvbXBsZW1lbnRvIiA6ICJ BVi4gQUxWQVJBRE8gRElBRy4gQ0VOVFJPQU1FUklDQSwgIyA0LCIKICAgIH0sCiAgICAidGVsZWZvb m8iIDogIjc4OTYzMzMzIiwKICAgICJjb3JyZW8iIDogInNhbHZhZG9yQGdnZy5jb20iLAogICAgImNvZEVzd GFibGVNSCIgOiBudWxsLAogICAgImNvZEVzdGFibGUiIDogbnVsbCwKICAgICJjb2RQdW50b1ZlbnRhT UgiIDogbnVsbCwKICAgICJjb2RQdW50b1ZlbnRhIiA6IG51bGwKICB9LAogICJyZWNlcHRvciIgOiB7CiAgI 

Manual Funcional del Sistema de Transmisión 21 



<!-- PAGE 78 / 80 -->

CAibml0IiA6ICIyMjIyMjIyMjIyMjIxMSIsCiAgICAibnJjIiA6ICI5MDAwMDA5IiwKICAgICJub21icmUiIDogIlNB TFZBRE9SIENBQkFMIiwKICAgICJjb2RBY3RpdmlkYWQiIDogIjY5IiwKICAgICJkZXNjQWN0aXZpZGFkIi A6ICJBQ1RJVklEQURFUyBKVVLDjURJQ0FTIFkgQ09OVEFCTEVTIiwKICAgICJub21icmVDb21lcmNpY WwiIDogbnVsbCwKICAgICJkaXJlY2Npb24iIDogewogICAgICAiZGVwYXJ0YW1lbnRvIiA6ICIwNiIsCiAgIC AgICJtdW5pY2lwaW8iIDogIjE0IiwKICAgICAgImNvbXBsZW1lbnRvIiA6ICJEaXJlY2Npw7NuIGRlIFBydWV iYSAxLCBOwrAgMTIzNCIKICAgIH0sCiAgICAidGVsZWZvbm8iIDogIjIyNDQ0NDQ0IiwKICAgICJjb3JyZW 8iIDogInNhbHZhZG9yY2FiYWxAcHJ1ZWJhLmNvbSIKICB9LAogICJvdHJvc0RvY3VtZW50b3MiIDogbnV sbCwKICAidmVudGFUZXJjZXJvIiA6IG51bGwsCiAgImN1ZXJwb0RvY3VtZW50byIgOiBbIHsKICAgICJud W1JdGVtIiA6IDEsCiAgICAidGlwb0l0ZW0iIDogMSwKICAgICJudW1lcm9Eb2N1bWVudG8iIDogbnVsbCw KICAgICJjb2RpZ28iIDogbnVsbCwKICAgICJjb2RUcmlidXRvIiA6IG51bGwsCiAgICAiZGVzY3JpcGNpb24i I 

DogIlNlcnZpY2lvIGRlIGNvbnN1bHRvcmlhIGNvbnRhYmxlIiwKICAgICJjYW50aWRhZCIgOiAxLAogICAgIn VuaU1lZGlkYSIgOiA1OSwKICAgICJwcmVjaW9VbmkiIDogMjAwMCwKICAgICJtb250b0Rlc2N1IiA6IDAs CiAgICAidmVudGFOb1N1aiIgOiAwLAogICAgInZlbnRhRXhlbnRhIiA6IDAsCiAgICAidmVudGFHcmF2YW RhIiA6IDIwMDAsCiAgICAidHJpYnV0b3MiIDogWyAiMjAiIF0sCiAgICAicHN2IiA6IDAsCiAgICAibm9HcmF2 YWRvIiA6IDAKICB9IF0sCiAgInJlc3VtZW4iIDogewogICAgInRvdGFsTm9TdWoiIDogMCwKICAgICJ0b3R hbEV4ZW50YSIgOiAwLAogICAgInRvdGFsR3JhdmFkYSIgOiAyMDAwLAogICAgInN1YlRvdGFsVmVudG FzIiA6IDIwMDAsCiAgICAiZGVzY3VOb1N1aiIgOiAwLAogICAgImRlc2N1RXhlbnRhIiA6IDAsCiAgICAiZGV zY3VHcmF2YWRhIiA6IDAsCiAgICAicG9yY2VudGFqZURlc2N1ZW50byIgOiAwLAogICAgInRvdGFsRGV zY3UiIDogMCwKICAgICJ0cmlidXRvcyIgOiBbIHsKICAgICAgImNvZGlnbyIgOiAiMjAiLAogICAgICAiZGVz Y 

3JpcGNpb24iIDogIkltcHVlc3RvIGFsIFZhbG9yIEFncmVnYWRvIDEzJSIsCiAgICAgICJ2YWxvciIgOiAyNjA KICAgIH0gXSwKICAgICJzdWJUb3RhbCIgOiAyMDAwLAogICAgIml2YVBlcmNpMSIgOiAwLAogICAgIml2 YVJldGUxIiA6IDAsCiAgICAicmV0ZVJlbnRhIiA6IDAsCiAgICAibW9udG9Ub3RhbE9wZXJhY2lvbiIgOiAyMj YwLAogICAgInRvdGFsTm9HcmF2YWRvIiA6IDAsCiAgICAidG90YWxQYWdhciIgOiAyMjYwLAogICAgIn R 

vdGFsTGV0cmFzIiA6ICJET1MgTUlMIERPU0NJRU5UT1MgU0VTRU5UQSBEw5NMQVJFUyAiLAogICA gInNhbGRvRmF2b3IiIDogMCwKICAgICJjb25kaWNpb25PcGVyYWNpb24iIDogMSwKICAgICJwYWdvcyI gOiBbIHsKICAgICAgImNvZGlnbyIgOiAiMDEiLAogICAgICAibW9udG9QYWdvIiA6IDIyNjAsCiAgICAgICJw bGF6byIgOiBudWxsLAogICAgICAicmVmZXJlbmNpYSIgOiAiIiwKICAgICAgInBlcmlvZG8iIDogbnVsbAogI CAgfSBdLAogICAgIm51bVBhZ29FbGVjdHJvbmljbyIgOiBudWxsCiAgfSwKICAiZXh0ZW5zaW9uIiA6IHsK I 

CAgICJub21iRW50cmVnYSIgOiBudWxsLAogICAgImRvY3VFbnRyZWdhIiA6IG51bGwsCiAgICAibm9tYlJ lY2liZSIgOiBudWxsLAogICAgImRvY3VSZWNpYmUiIDogbnVsbCwKICAgICJvYnNlcnZhY2lvbmVzIiA6IG 51bGwsCiAgICAicGxhY2FWZWhpY3VsbyIgOiBudWxsCiAgfSwKICAiYXBlbmRpY2UiIDogbnVsbAp9.Dtt b L4- 

a5kJi583xK2gpdAoOxKHoUH8cUo_J8i2fzKKfOUAhtn8R8FRjskMyi9WVL41QlsBJ0QB5j6kpnjP8K5gfS0e nWbmvthb- 

ZpQgTaIf3EuDPXRq1KO7k46AFtZzu5C21gZ8tXYzIh4atGg8inH2EV9BNtOnDNSNFlm1CB5YEh8ypLCA gTcuYnkcY9OvJAHkp_6R3QfMGYHQrf9Tp2HidQ1zRWcbnN-iD9Z9l9d3H2Gu- N3Gd3vdDQhvtnuKIDZAKnoXEXRSi6bS4e_ycko6iN_9pSSzY6A5b68oTCN_DdbS3NUotpWIrAKdVt7qk WIzi-7r3znG1V8iYw","selloRecibido":"20227A1DE27CA974440985C1791AE37F7821LT8M"} 

Manual Funcional del Sistema de Transmisión 22 



<!-- PAGE 79 / 80 -->

## **XXIV. Pruebas de Transmisión Satisfactorias Mínimas para el Sistema de Transmisión DTE** 

|**N°**|**Tipo de Documento Electrónico**|**Sistema de Transmisión**|
|---|---|---|
|1|Factura|90|
|2|Comprobante de Crédito Fiscal|75|
|3|Nota de Remisión|50|
|4|Nota de Crédito|50|
|5|Nota de Débito|25|
|6|Comprobante de Retención|50|
|7|Comprobante de Liquidación|75|
|8|Documento Contable de Liquidación|50|
|9|Factura de Exportación|90|
|10|Factura de Sujeto Excluido|25|
|11|Comprobante de Donación|25|



|**N°**|**Tipo de Evento**|**Sistema de Transmisión**|
|---|---|---|
|1|Evento de Invalidación|5|
|2|Evento de Contingencia|5|
|3|Evento de Retorno|5|
|5|Evento de Operaciones Especiales|5|



## **XXV. Glosario** 

- **JSON:** JavaScript Object Notation (JSON) es un formato basado en texto estándar para representar datos estructurados en la sintaxis de objetos de JavaScript. 

- **ESTRUCTURAS:** el esquema define sus tablas, sus campos en cada tabla y las relaciones entre cada campo y cada tabla. 

- **ENVÍO DE DOCUMENTOS UNO A UNO** : en esta opción de envío, el emisor trasmite a la Administración Tributaria cada uno de los documentos electrónicos de forma independiente para su validación. 

- **ENVÍO DE DOCUMENTOS POR LOTES:** en esta opción de envío, el emisor trasmite a la Administración Tributaria un grupo de documentos electrónicos de forma grupal, para la validación de cada uno de los documentos del lote. 

- **COMISIONISTA:** persona que trabaja a cambio de comisiones mercantiles, vendiendo a cuenta de otro y cobrando una comisión. 

- **CONSIGNATARIO:** persona natural o jurídica que recibe las mercancías en calidad de depósito y tiene la responsabilidad de conservarlas en el estado en que las recibió hasta que efectúe la venta, obteniendo una comisión sobre el precio pactado. 

Manual Funcional del Sistema de Transmisión 23 



<!-- PAGE 80 / 80 -->

- **SUBASTADORES:** los subastadores valoran artículos, y organizan y dirigen subastas. Algunos se especializan en un tipo de artículo, en el que pueden ser entendidos. Los subastadores valoran las piezas que vayan a venderse en una subasta y organizan todos los aspectos de la venta. 

- **EMISOR:** persona que emite el Documento Tributario Electrónico. 

- **RECEPTOR:** persona que recibe el Documento Tributario Electrónico. 

- **INCOTERM** : representa un término universal que define una transacción entre importador y exportador, de forma que ambas partes entiendan las tareas, costos, riesgos y responsabilidades, así como el manejo logístico y de transportación desde la salida del producto hasta la recepción por el país importador. 

- **FLETE:** precio pagado o por pagar por el traslado de mercancías en un medio de transporte, sea este marítimo, aéreo o terrestre. 

- **SEGURO (TRANSPORTE):** es un contrato que cubre las mercancías contra los diversos riesgos que puedan afectarlas durante su traslado de un lugar a otro durante determinado período (estancia), o situaciones (carga y descarga), relacionadas con el hecho de transporte. 

## **XXVI. Abreviaturas** 

- **CT:** Código Tributario 

- **NIT:** Número de Identificación Tributaria 

- **NRC:** Número de Registro de Contribuyente 

- **DTE:** Documento Tributario Electrónico 

- **DE:** Documento Electrónico 

- **CCFE:** Comprobante de Crédito Fiscal Electrónico 

- **NCE:** Nota de Crédito Electrónica 

- **NDE:** Nota de Débito Electrónica 

- **NRE:** Nota de Remisión Electrónica 

- **CRE:** Comprobante de Retención Electrónico 

- **CLE:** Comprobante de Liquidación Electrónico 

- **DCLE:** Documento Contable de Liquidación Electrónico 

- **FSEE:** Factura Sujeto Excluido Electrónico 

- **CDE:** Comprobante de Donación Electrónico 

- **FE:** Factura Electrónica 

- **FEXE:** Factura de Exportación Electrónica 

- **EOE:** Evento de Operaciones Especiales 

- **ER:** Evento de Retorno 

- **UUID v4** : UUID son las siglas de Universally Unique Identifier, que en inglés significa, literalmente, 

- ‘identificador único universal’ y v4 es la versión 

- **DGII** : Dirección General de Impuestos Internos 

- **AT:** Administración Tributaria 

Manual Funcional del Sistema de Transmisión 24 

