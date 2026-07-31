// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex-json.types.ts
//
// Tipos del json_document para Factura de Exportación Electrónica
// (FEX 11), según docs/dte-official/extracts/fe-fex-v1.json.
//
// Solo tipos de forma — ninguna lógica de negocio vive aquí.
// ─────────────────────────────────────────────────────────────────

export interface FexIdentificacion {
  version:           1;
  ambiente:          string;   // "00" TEST | "01" PRODUCTION
  tipoDte:           "11";
  numeroControl:     string;
  codigoGeneracion:  string;
  tipoModelo:        number;
  tipoOperacion:     number;
  tipoContingencia:  number | null;
  motivoContigencia: string | null;
  fecEmi:            string;
  horEmi:            string;
  tipoMoneda:        "USD";
}

export interface FexDireccion {
  departamento: string;
  municipio:    string;
  complemento:  string;
}

export interface FexEmisor {
  nit:                 string | null;
  nrc:                 string | null;
  nombre:              string;
  codActividad:        string;
  descActividad:       string;
  nombreComercial:     string | null;
  tipoEstablecimiento: string;
  direccion:           FexDireccion;
  telefono:            string;
  correo:              string;
  codEstableMH:        string | null;
  codEstable:          string | null;
  codPuntoVentaMH:     string | null;
  codPuntoVenta:       string | null;
  tipoItemExpor:       number;
  recintoFiscal:       string | null;
  regimen:             string | null;
}

export interface FexReceptor {
  nombre:          string;
  tipoDocumento:   string;
  numDocumento:    string;
  nombreComercial: string | null;
  codPais:         string;
  nombrePais:      string;
  complemento:     string;
  tipoPersona:     number;
  descActividad:   string;
  telefono:        string | null;
  correo:          string | null;
}

export interface FexCuerpoItem {
  numItem:     number;
  cantidad:    number;
  codigo:      string | null;
  uniMedida:   number;
  descripcion: string;
  precioUni:   number;
  montoDescu:  number;
  ventaGravada: number;
  tributos:    string[] | null;
  noGravado:   number;
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
  descuento:           number;
  porcentajeDescuento: number;
  totalDescu:          number;
  seguro:              number | null;
  flete:               number | null;
  montoTotalOperacion: number;
  totalNoGravado:      number;
  totalPagar:          number;
  totalLetras:         string;
  condicionOperacion:  number;
  pagos:               FexPago[] | null;
  codIncoterms:        string | null;
  descIncoterms:       string | null;
  numPagoElectronico:  string | null;
  observaciones:       string | null;
}

// Raíz del documento FEX 11. additionalProperties=false en el schema oficial:
// NO incluye "documentoRelacionado" ni "extension" (a diferencia de FE/CCFE).
export interface FexJsonDocument {
  identificacion:      FexIdentificacion;
  emisor:              FexEmisor;
  receptor:            FexReceptor;
  otrosDocumentos:     null;
  ventaTercero:        null;
  cuerpoDocumento:     FexCuerpoItem[];
  resumen:             FexResumen;
  apendice:            null;
}
