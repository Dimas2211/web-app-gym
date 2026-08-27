// ─────────────────────────────────────────────────────────────────
// commerce/dte — fse-json.types.ts
//
// Tipos del JSON oficial MH para Factura de Sujeto Excluido Electrónica
// (FSE, tipoDte "14"). Espejo estructural de fex-json.types.ts, ajustado
// al schema fe-fse-v1.json (docs/dte-official/raw/svfe-json-schemas.zip).
// ─────────────────────────────────────────────────────────────────

export interface FseIdentificacion {
  version:          1;
  ambiente:         "00" | "01";
  tipoDte:          "14";
  numeroControl:    string;
  codigoGeneracion: string;
  tipoModelo:       1 | 2;
  tipoOperacion:    1 | 2;
  tipoContingencia: 1 | 2 | 3 | 4 | 5 | null;
  motivoContin:     string | null;
  fecEmi:           string;
  horEmi:           string;
  tipoMoneda:       "USD";
}

export interface FseDireccion {
  departamento: string;
  municipio:    string;
  complemento:  string;
}

export interface FseEmisor {
  nit:                 string;
  nrc:                 string | null;
  nombre:               string;
  codActividad:        string;
  descActividad:       string;
  direccion:            FseDireccion;
  telefono:            string;
  codEstableMH:        string | null;
  codEstable:          string | null;
  codPuntoVentaMH:     string | null;
  codPuntoVenta:       string | null;
  correo:              string;
}

export interface FseSujetoExcluido {
  tipoDocumento:  "36" | "13" | "02" | "03" | "37";
  numDocumento:   string;
  nombre:          string;
  codActividad:   string | null;
  descActividad:  string | null;
  direccion:       FseDireccion;
  telefono:       string | null;
  correo:         string | null;
}

export interface FseCuerpoItem {
  numItem:      number;
  tipoItem:     1 | 2 | 3;
  cantidad:     number;
  codigo:       string | null;
  uniMedida:    number;
  descripcion:  string;
  precioUni:    number;
  montoDescu:   number;
  compra:       number;
}

export interface FsePago {
  codigo:     string;
  montoPago:  number;
  referencia: string | null;
  plazo:      "01" | "02" | "03" | null;
  periodo:    number | null;
}

export interface FseResumen {
  totalCompra:        number;
  descu:              number;
  totalDescu:         number | null;
  subTotal:           number;
  ivaRete1:           number;
  reteRenta:          number;
  totalPagar:         number;
  totalLetras:        string;
  condicionOperacion: 1 | 2 | 3;
  pagos:              FsePago[] | null;
  observaciones:      string | null;
}

export interface FseJsonDocument {
  identificacion:  FseIdentificacion;
  emisor:          FseEmisor;
  sujetoExcluido:  FseSujetoExcluido;
  cuerpoDocumento: FseCuerpoItem[];
  resumen:         FseResumen;
  apendice:        null;
}
