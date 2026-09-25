// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex-json.types.ts
//
// Tipos del json_document para Factura de Exportación Electrónica
// (FEX 11) según el schema oficial v3 (schemas/mh/fex-11-v3.schema.json
// = fe-fex-v3.json, factura.gob.sv 2026-08-11).
//
// Representan EXACTAMENTE el JSON final v3 (additionalProperties:false en
// todos los bloques): no incluyen campos v1 eliminados
// (motivoContigencia, tipoEstablecimiento, codEstableMH, codPuntoVentaMH,
// resumen.descuento). Los documentos v1 históricos no se tipan aquí.
//
// Solo tipos de forma — ninguna lógica de negocio vive aquí.
// ─────────────────────────────────────────────────────────────────

export interface FexIdentificacion {
  version:          3;
  ambiente:         string;   // "00" TEST | "01" PRODUCTION
  tipoDte:          "11";
  numeroControl:    string;
  codigoGeneracion: string;
  tipoModelo:       number;
  tipoOperacion:    number;
  tipoContingencia: number | null;
  motivoContin:     string | null;
  fecEmi:           string;
  horEmi:           string;
  tipoMoneda:       "USD";
}

// Elemento de documentoRelacionado (v3). Zolvi no emite FEX con
// documentos relacionados todavía: el builder envía null.
export interface FexDocumentoRelacionado {
  tipoDocumento:  string;
  tipoGeneracion: number;
  numeroDocumento: string;
  fechaEmision:   string;
}

export interface FexDireccionEmisor {
  departamento: string;
  municipio:    string;
  distrito:     string;
  complemento:  string;
}

export interface FexEmisor {
  nit:             string;
  nrc:             string;
  nombre:          string;
  codActividad:    string;
  descActividad:   string;
  nombreComercial: string | null;
  direccion:       FexDireccionEmisor;
  telefono:        string | null;
  correo:          string;
  codEstable:      string | null;
  codPuntoVenta:   string | null;
  tipoItemExpor:   number;
  recintoFiscal:   string | null;
  tipoRegimen:     string | null;
  regimen:         string | null;
}

export interface FexReceptor {
  nombre:          string;
  tipoDocumento:   string;
  numDocumento:    string;
  nombreComercial: string | null;
  codPais:         string;   // CAT-020 vigente (ISO 3166-1 alpha-2)
  nombrePais:      string;
  complemento:     string;
  tipoPersona:     number;
  descActividad:   string;
  telefono:        string | null;
  correo:          string | null;
}

// Compra por cuenta de terceros (v3). Zolvi envía null (operación propia).
export interface FexCompraTercero {
  numDocumento: string;
  nombre:       string;
}

export interface FexCuerpoItem {
  numItem:         number;
  tipoItem:        number;          // CAT-011
  numeroDocumento: string | null;   // documento relacionado del ítem; null sin documentoRelacionado
  cantidad:        number;
  codigo:          string | null;   // ≤ 25
  codTributo:      string | null;   // solo ítems tipoItem=4 (tributos sección 2 CAT-015)
  uniMedida:       number;
  descripcion:     string;
  precioUni:       number;
  montoDescu:      number;
  ventaGravada:    number;
  tributos:        string[] | null;
  noGravado:       number;
}

export interface FexResumenTributo {
  codigo:      string;
  descripcion: string;
  valor:       number;
}

export interface FexPago {
  codigo:     string;
  montoPago:  number;
  referencia: string | null;
  plazo:      string | null;
  periodo:    number | null;
}

export interface FexResumen {
  totalGravada:        number;
  descuGravada:        number;
  porcentajeDescuento: number;
  totalDescu:          number;
  seguro:              number;
  flete:               number | null;
  tributos:            FexResumenTributo[] | null;
  montoTotalOperacion: number;
  totalNoGravado:      number;
  totalNoOnerosas:     number;
  totalPagar:          number;
  totalLetras:         string | null;
  saldoFavor:          number;
  condicionOperacion:  number;
  pagos:               FexPago[] | null;
  codIncoterms:        string | null;
  descIncoterms:       string | null;
  numPagoElectronico:  string | null;
  observaciones:       string | null;
}

// Raíz del documento FEX 11 v3. additionalProperties=false: sin
// "extension" (a diferencia de FE/CCFE).
export interface FexJsonDocument {
  identificacion:       FexIdentificacion;
  documentoRelacionado: FexDocumentoRelacionado[] | null;
  emisor:               FexEmisor;
  receptor:             FexReceptor;
  otrosDocumentos:      null;
  ventaTercero:         null;
  compraTercero:        FexCompraTercero | null;
  cuerpoDocumento:      FexCuerpoItem[];
  resumen:              FexResumen;
  apendice:             null;
}
