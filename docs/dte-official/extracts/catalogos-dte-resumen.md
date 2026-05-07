# Extracto operativo - Catalogos DTE del Sistema de Transmision

Fuente original: `Catálogo - Sistema de Transmisión (1).pdf`.
Version del catalogo: 1.2, octubre 2025.
Uso previsto: fuente ligera para diseno e implementacion del modulo `commerce/dte` sin obligar a Claude Code a leer el PDF completo.

## Advertencia de uso

Este extracto no sustituye el PDF oficial. Para implementacion final de validaciones fiscales, debe contrastarse contra el catalogo oficial y contra los JSON Schemas oficiales del Ministerio de Hacienda.

## Correccion critica de nomenclatura

No usar "CCF consumidor final".

Nomenclatura correcta:

- `FE` = Factura Electronica.
- `CCFE` = Comprobante de Credito Fiscal Electronico.
- `NCE` = Nota de Credito Electronica.
- `NDE` = Nota de Debito Electronica.
- `NRE` = Nota de Remision Electronica.
- `FSEE` = Factura Sujeto Excluido Electronico.
- `FEXE` = Factura de Exportacion Electronica.

Para el MVP de `commerce/sales + commerce/dte`:

- Codigo `01` = Factura. Usar para Factura Electronica / consumidor final.
- Codigo `03` = Comprobante de credito fiscal. Usar para CCFE.

## Catalogos relevantes para MVP

### CAT-001 - Ambiente de destino

| Codigo | Valor |
|---|---|
| `00` | Modo prueba |
| `01` | Modo produccion |

Uso en el sistema:

- `DteEnvironment.TEST` debe mapear a `00`.
- `DteEnvironment.PRODUCTION` debe mapear a `01`.

### CAT-002 - Tipo de Documento

| Codigo | Valor | Uso recomendado |
|---|---|---|
| `01` | Factura | MVP FE |
| `03` | Comprobante de credito fiscal | MVP CCFE |
| `04` | Nota de remision | Futuro |
| `05` | Nota de credito | Futuro |
| `06` | Nota de debito | Futuro |
| `07` | Comprobante de retencion | Futuro |
| `08` | Comprobante de liquidacion | Futuro |
| `09` | Documento contable de liquidacion | Futuro |
| `11` | Facturas de exportacion | Futuro |
| `14` | Factura de sujeto excluido | Futuro |
| `15` | Comprobante de donacion | Futuro |

Regla para prompts:

- El MVP NO debe implementar notas, exportacion, sujeto excluido, liquidacion ni donacion.
- Documentarlas como V2/futuro.

### CAT-003 - Modelo de Facturacion

| Codigo | Valor |
|---|---|
| `1` | Modelo Facturacion previo |
| `2` | Modelo Facturacion diferido |

Uso inicial recomendado:

- Documentar el campo en DTE, pero no tomar decisiones fiscales no confirmadas sin schema oficial.

### CAT-004 - Tipo de Transmision

| Codigo | Valor |
|---|---|
| `1` | Transmision normal |
| `2` | Transmision por contingencia |

Uso en MVP:

- MVP: transmision normal `1`.
- Contingencia queda fuera del MVP.

### CAT-005 - Tipo de Contingencia

| Codigo | Valor |
|---|---|
| `1` | No disponibilidad de sistema del MH |
| `2` | No disponibilidad de sistema del emisor |
| `3` | Falla en el suministro de servicio de Internet del emisor |
| `4` | Falla en el suministro de energia electrica del emisor que impida la transmision de los DTE |
| `5` | Otro, con motivo maximo de 500 caracteres |

Uso:

- Fuera del MVP.
- Debe usarse cuando se implemente evento de contingencia.

### CAT-007 - Tipo de Generacion del Documento

| Codigo | Valor |
|---|---|
| `1` | Fisico |
| `2` | Electronico |

Uso:

- Para DTE emitido desde la plataforma, normalmente se espera generacion electronica; validar contra schema oficial antes de cerrar hardcode.

### CAT-009 - Tipo de establecimiento

| Codigo | Valor |
|---|---|
| `01` | Sucursal |
| `02` | Casa Matriz |
| `04` | Bodega |
| `07` | Patio |

Uso en modelo:

- `DteIssuerConfig` debe guardar tipo de establecimiento por `tenant_id + location_id`.

### CAT-011 - Tipo de item

| Codigo | Valor |
|---|---|
| `1` | Bienes |
| `2` | Servicios |
| `3` | Ambos |
| `4` | Otros tributos por item |

Uso en sales:

- Producto stockable: normalmente `1` bienes.
- Servicio: normalmente `2` servicios.
- Validar mapeo final contra tipo de producto y schema DTE.

### CAT-014 - Unidad de medida

Unidades relevantes para MVP:

| Codigo | Valor |
|---|---|
| `59` | Unidad |
| `99` | Otra |
| `58` | Docena |
| `57` | Ciento |
| `55` | Millar |
| `23` | Litro |
| `36` | Libra |
| `34` | Kilogramo |
| `39` | Gramo |

Regla de implementacion:

- No asumir que la unidad interna del ERP siempre coincide con la unidad fiscal MH.
- El producto deberia poder guardar o derivar `mh_unit_code`.
- Para MVP, se puede iniciar con `59` Unidad cuando no exista mapeo, pero debe quedar documentado como provisional si no hay dato fiscal especifico.

### CAT-015 - Tributos

Valores principales:

| Codigo | Valor |
|---|---|
| `20` | Impuesto al Valor Agregado 13% |
| `C3` | Impuesto al Valor Agregado exportaciones 0% |

Uso en MVP:

- FE/CCFE local: IVA 13% con codigo `20`, cuando aplique.
- Exportacion fuera de MVP.

### CAT-016 - Condicion de la operacion

| Codigo | Valor |
|---|---|
| `1` | Contado |
| `2` | A credito |
| `3` | Otro |

Uso en sales:

- Debe relacionarse con estado de pago interno.
- `PAID` normalmente puede mapear a contado, pero una venta puede tener pago parcial o credito; definir en el servicio DTE, no en UI directamente.

### CAT-017 - Forma de pago

| Codigo | Valor |
|---|---|
| `01` | Billetes y monedas |
| `02` | Tarjeta Debito |
| `03` | Tarjeta Credito |
| `04` | Cheque |
| `05` | Transferencia-Deposito Bancario |
| `08` | Dinero electronico |
| `09` | Monedero electronico |
| `11` | Bitcoin |
| `12` | Otras Criptomonedas |
| `13` | Cuentas por pagar del receptor |
| `14` | Giro bancario |
| `99` | Otros, indicando medio de pago |

Uso MVP:

- `SalePayment` debe guardar forma de pago interna y opcionalmente `mh_payment_form_code`.
- Cash completo queda fuera del MVP, pero DTE puede requerir forma de pago.

### CAT-018 - Plazo

| Codigo | Valor |
|---|---|
| `01` | Dias |
| `02` | Meses |
| `03` | Anios |

Uso:

- Solo si la venta es al credito.

### CAT-019 - Codigo de Actividad Economica

Uso:

- Requerido para emisor y posiblemente receptor segun tipo DTE.
- El catalogo completo es amplio; no conviene meterlo manualmente en prompts.
- Usar fuente normalizada o seed existente si ya hay catalogo en la plataforma.

### CAT-022 - Tipo de documento de identificacion del receptor

| Codigo | Valor |
|---|---|
| `36` | NIT |
| `13` | DUI |
| `37` | Otro |
| `03` | Pasaporte |
| `02` | Carnet de Residente |

Uso:

- Customer/Receptor debe guardar `id_type_code`.
- Para CCFE normalmente se requiere informacion fiscal del receptor; validar campos obligatorios contra schema oficial.

### CAT-023 - Tipo de Documento en Contingencia

| Codigo | Valor |
|---|---|
| `01` | Factura Electronico |
| `03` | Comprobante de Credito Fiscal Electronico |
| `04` | Nota de Remision Electronica |
| `05` | Nota de Credito Electronica |
| `06` | Nota de Debito Electronica |
| `11` | Factura de Exportacion Electronica |
| `14` | Factura de Sujeto Excluido Electronica |

Uso:

- Fuera del MVP.

### CAT-024 - Tipo de Invalidacion

| Codigo | Valor |
|---|---|
| `1` | Error en la informacion del DTE a invalidar |
| `2` | Rescindir de la operacion realizada |
| `3` | Otro |

Uso:

- Invalidacion fiscal fuera del MVP.
- No confundir cancelacion interna de Sale con invalidacion de DTE aceptado.

## Reglas para el diseno del modulo

1. El tipo DTE debe guardarse por codigo MH, no solo por enum interno.
2. FE `01` y CCFE `03` son el alcance recomendado para MVP.
3. Notas, contingencia, invalidacion, exportacion, sujeto excluido y lotes quedan fuera del MVP.
4. `DteIssuerConfig` debe contemplar `environment_code`, `tipo_establecimiento`, direccion estructurada y actividad economica.
5. `Customer/Receptor` debe guardar campos compatibles con CAT-022, actividad economica y direccion cuando aplique.
6. Los catalogos deben normalizarse en JSON/CSV o seeds, no copiarse manualmente en componentes React.
