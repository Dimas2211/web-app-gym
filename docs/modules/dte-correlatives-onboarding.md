# Correlativos DTE — Alineación inicial y onboarding (F3-C24)

## 1. Qué es el numeroControl

Cada Documento Tributario Electrónico (DTE) transmitido a Hacienda lleva un
`numeroControl` con formato fijo de 31 caracteres:

```
DTE-{tipoDte(2)}-{codEstableMH(4)}{codPuntoVentaMH(4)}-{secuencia(15)}
```

Ejemplo real: `DTE-01-M001P001-000000000000001`.

`tipoDte` es el código CAT-002 (`01` Factura, `03` CCFE, `05` NC, `11` FEX,
etc.). `codEstableMH`/`codPuntoVentaMH` son los códigos de establecimiento y
punto de venta **asignados por Hacienda** al emisor (no los códigos internos
del sistema). La `secuencia` es un correlativo estrictamente creciente y
**nunca reutilizable** por combinación de tipo DTE + establecimiento + punto
de venta + ambiente (TEST/PRODUCTION).

## 2. Por qué puede duplicarse al migrar desde otro sistema

Nuestra plataforma llevaba la cuenta del correlativo solo en la tabla
`DteCorrelative` (`last_sequence`), local a esta base de datos. Si una
empresa ya facturaba con **otro sistema** antes de adoptar esta plataforma,
Hacienda ya tiene numeroControl usados que esta base nunca vio. Si esta
plataforma empieza a contar desde 1 (o desde donde quedó su propio
contador local), puede generar un numeroControl **ya usado ante Hacienda**,
y la transmisión es rechazada con:

```
[identificacion.numeroControl] YA EXISTE UN REGISTRO CON ESE VALOR
```

Esto también puede ocurrir si:

- se restauró o resembró la base local;
- se migró desde una base incompleta;
- se hicieron pruebas desde otro sistema contra el mismo ambiente de Hacienda;
- hay múltiples ambientes, sucursales o puntos de venta y alguno quedó
  desalineado.

## 3. Cómo se determina el siguiente correlativo (regla actual)

Desde F3-C24, el siguiente correlativo para **cualquier tipo DTE** se
calcula como:

```
max(
  DteCorrelative.last_sequence,              -- contador interno
  mayor secuencia usada en DteOutgoingDocument -- SIN filtrar por estado
    para la misma combinación tenant+location+issuer+ambiente+tipo+establecimiento+punto de venta,
  DteCorrelative.external_baseline_last_used_sequence, -- baseline externo (§4)
) + 1
```

Esta lógica vive en un único lugar, genérico por `dte_type_code`:
[`src/modules/commerce/dte/services/dte-correlative.service.ts`](../../src/modules/commerce/dte/services/dte-correlative.service.ts)
(`reserveDteControlNumber`). La usan **todos** los flujos que emiten DTE:

- `dte-outgoing.service.ts` (01 Factura, 03 CCFE)
- `create-credit-note-dte.service.ts` (05 Nota de Crédito)
- `export-sale.service.ts` (11 Factura de Exportación)
- el runner de Support Session (F2-B1)
- los scripts de seed/dev de prueba local

La partición (nunca se comparte el contador entre combinaciones distintas)
es: `tenant_id + location_id + issuer_config_id + environment +
dte_type_code` (+ los códigos MH `cod_estable_mh`/`cod_punto_venta_mh`,
copiados al `DteCorrelative` para trazabilidad).

## 4. Cómo registrar el último correlativo externo (baseline)

Un **super_admin** puede registrar, por sucursal + ambiente + tipo DTE, el
"baseline" externo: el último `numeroControl` que el cliente ya usó en su
sistema anterior. Hay dos entradas equivalentes (mismo servicio de dominio,
`alignDteCorrelativeBaseline`, por debajo):

- **`/dashboard/dte/correlatives`** — ruta operativa directa, resuelve
  `tenant_id`/`location_id` desde la **sesión activa**
  (`requireSuperAdmin()` + `getEffectiveLocationId`). No depende de que
  exista una fila en `PlatformOrganization` — es la vía recomendada para
  una instancia cliente/runtime normal (una base por cliente, sin control
  plane poblado localmente).
- **Platform Admin → Organizaciones → (organización) → "Alineación de
  correlativos DTE"** — mismo panel embebido, pero resuelve `tenant_id`
  vía `PlatformOrganization.tenant_id`. Solo funciona si esa organización
  existe en `platform_organizations` (típico en el control plane o en una
  base donde se haya registrado la organización explícitamente). Además
  registra auditoría en `PlatformDeploymentLog`, algo que la ruta directa
  no puede hacer (ese log requiere un `organization_id` real).

Para cada fila (sucursal × ambiente × tipo DTE) la pantalla muestra:

- correlativo interno actual (`DteCorrelative.last_sequence`);
- máximo `numeroControl` ya usado en `DteOutgoingDocument` (incluye
  documentos `ACCEPTED`, `REJECTED`, `SIGNED`, etc. — nunca se ignora un
  número ya usado aunque el documento haya sido rechazado);
- baseline externo actual, si ya se registró uno;
- el próximo número que se emitiría con la configuración actual.

Al hacer clic en "Alinear" se pide:

- **último número usado en el sistema anterior** (obligatorio, entero ≥ 0);
- **origen** (texto libre, ej. "Sistema anterior XYZ");
- **nota/justificación** (**obligatoria** — evidencia de dónde sale el
  número);
- **referencia/evidencia** (opcional — folio, archivo, ticket).

El sistema muestra siempre la advertencia:

> "Esta acción afecta el siguiente numeroControl que se emitirá ante
> Hacienda. Verifique contra el sistema anterior antes de guardar."

### Validaciones aplicadas

- No se puede bajar el correlativo por debajo del máximo ya usado
  localmente (`max(last_sequence, máximo en DteOutgoingDocument)`).
- No se permiten valores negativos ni no enteros.
- La nota es obligatoria.
- La acción **nunca** modifica un `DteOutgoingDocument` existente —
  únicamente afecta la próxima reserva de correlativo (emisiones futuras).
- Solo `super_admin` puede ejecutar la alineación
  (`requireSuperAdmin()` en la action); no hay forma de hacerlo desde un
  rol operativo/cajero.
- Cada alineación queda registrada en `PlatformDeploymentLog`
  (`action: "ALIGN_DTE_CORRELATIVE"`) con quién, cuándo y qué valores.

## 5. Por tipo DTE

El mecanismo es genérico: no hay lista cerrada de tipos DTE permitidos para
alinear. La UI muestra una lista curada como atajo (`01`, `03`, `05`, `06`,
`11`, `14` — ver `DTE_TYPE_CODES_FOR_ALIGNMENT`), pero
`reserveDteControlNumber`/`alignDteCorrelativeBaseline` aceptan cualquier
`dte_type_code` string, incluyendo tipos DTE futuros.

## 6. Por sucursal/punto de venta

La combinación de partición incluye `location_id` e `issuer_config_id`
(que en el modelo actual determina de forma única `cod_estable_mh` +
`cod_punto_venta_mh`). Cada sucursal/ambiente tiene su propia fila de
`DteCorrelative` por tipo DTE — alinear una sucursal no afecta a otra.

## 7. Qué hacer si Hacienda rechaza por duplicado

Desde F3-C24, un documento `REJECTED` (por numeroControl duplicado o
cualquier otro motivo) **ya no bloquea** generar un DTE nuevo para la misma
venta/CCFE: los checks de "documento activo duplicado" en
`dte-outgoing.service.ts` (01/03), `create-credit-note-dte.service.ts` (05)
y `export-sale.service.ts` (11) excluyen explícitamente `REJECTED`.

Flujo recomendado ante un rechazo por duplicado:

1. El documento queda marcado `REJECTED` con el mensaje completo de
   Hacienda visible en el Panel Fiscal. **Nunca se edita ni se
   retransmite** ese documento.
2. Si el rechazo fue por numeroControl duplicado, **antes de generar uno
   nuevo**, revisar/alinear el baseline de esa combinación
   (sucursal/ambiente/tipo DTE) desde Platform Admin, usando el último
   numeroControl real conocido en Hacienda como referencia.
3. Generar un DTE nuevo para la misma venta (mismo flujo de creación ya
   existente — para FEX 11 hay además una acción dedicada
   `regenerateRejectedExportDte`). El nuevo documento recibe
   `codigoGeneracion` y `numeroControl` frescos; el documento rechazado
   queda como registro histórico.

## 8. Checklist de onboarding DTE para clientes nuevos

Antes de transmitir en producción, para cada cliente que **migra desde
otro sistema de facturación electrónica**, se debe pedir y registrar:

- [ ] Último `numeroControl` de FE 01, por establecimiento y punto de venta.
- [ ] Último `numeroControl` de CCFE 03, por establecimiento y punto de venta.
- [ ] Último `numeroControl` de NC 05, por establecimiento y punto de venta.
- [ ] Último `numeroControl` de FEX 11, por establecimiento y punto de venta
      (si aplica exportación).
- [ ] Cualquier otro tipo DTE que el cliente ya use (06, 14, etc.).
- [ ] Repetir por cada ambiente relevante (TEST solo se usa para pruebas
      internas; el baseline real que importa es el de PRODUCTION antes de
      salir en vivo).
- [ ] Registrar cada valor desde Platform Admin → Organización →
      "Alineación de correlativos DTE", con nota de evidencia.
- [ ] Confirmar en el preflight fiscal (`TENANT_DTE_CORRELATIVE_BASELINE`)
      que no queden correlativos sin baseline revisado para un tenant que
      viene de otro sistema.

## 9. Advertencia — no tocar documentos firmados

Ningún flujo de esta fase edita `json_document`, `signed_jws`,
`numeroControl` ni `codigoGeneracion` de un `DteOutgoingDocument` ya
existente. La alineación de baseline solo cambia qué número se reservará
para el **próximo** documento que se cree. Si se necesita corregir un
documento ya transmitido, la única vía es crear uno nuevo (nota de crédito,
invalidación, o un nuevo intento tras rechazo) — nunca editar el existente.

## 10. Ejemplo FEX 11

```
Tipo DTE:            11 — Factura de Exportación
Establecimiento:      M001
Punto de venta:       P001
Último usado externo: 000000000000009  (9)
Siguiente a emitir:   000000000000010  (10)
```

Con baseline = 9 alineado, el próximo `numeroControl` que la plataforma
reserva es `DTE-11-M001P001-000000000000010`, y nunca vuelve a emitir
`...-000000000000009` (ni ningún valor ≤ 9) para esa combinación.
