// commerce/dte — external-dte-delivery.types.ts
//
// Tipos para integración con base MariaDB externa de delivery DTE.
// El sistema externo genera PDF, envía al cliente y archiva el documento.

// ── Configuración ─────────────────────────────────────────────────

export interface ExternalDteMariaDbConfig {
  host:               string;
  port:               number;
  user:               string;
  password:           string;
  database:           string;
  table:              string;
  invalidationTable:  string;
  enabled:            boolean;
  timeoutMs:          number;
}

// ── Payload externo ───────────────────────────────────────────────
// Estructura requerida por el proveedor:
//   campos DTE en la raíz + codigoEmpresa + responseMH + token.
// No debe usarse wrapper documento/firma/hacienda/metadata.

export interface ExternalDteResponseMH {
  version:          number;
  ambiente:         string;
  versionApp:       number;
  estado:           string;
  codigoGeneracion: string;
  selloRecibido:    string | null;
  fhProcesamiento:  string | null;
  clasificaMsg:     string | null;
  codigoMsg:        string | null;
  descripcionMsg:   string | null;
  observaciones:    unknown[];
}

export interface ExternalDtePayload {
  [key: string]: unknown;
  codigoEmpresa:  string;
  responseMH:     ExternalDteResponseMH;
  token:          string;
}

// ── Resultados del adapter ────────────────────────────────────────

export type ExternalDteDeliveryResult =
  | {
      ok:           true;
      insertId:     number | bigint | null;
      affectedRows: number;
    }
  | {
      ok:           false;
      error:        string;
      errorCode?:   string;
    };

// ── Resultado del service (DTE) ───────────────────────────────────

export type DeliverDteToExternalDbResult =
  | {
      ok:           true;
      insertId:     number | bigint | null;
      affectedRows: number;
    }
  | {
      ok:    false;
      error: string;
    };

// ── Payload externo de invalidación ──────────────────────────────
// Formato requerido por el proveedor:
//   campos event_json en la raíz + codigoEmpresa + responseMH + token.

export interface ExternalInvalidationResponseMH {
  estado:          string;
  selloRecibido:   string | null;
  codigoMsg:       string | null;
  descripcionMsg:  string | null;
  observaciones:   unknown[];
  fhProcesamiento: string | null;
}

export interface ExternalInvalidationPayload {
  [key: string]: unknown;
  codigoEmpresa: string;
  responseMH:    ExternalInvalidationResponseMH;
  token:         string;
}

// ── Resultado del service (invalidación) ─────────────────────────

export type DeliverInvalidationToExternalDbResult =
  | {
      ok:                  true;
      insertId:            number | bigint | null;
      affectedRows:        number;
      invalidationEventId: string;
      dteDocumentId:       string;
    }
  | {
      ok:    false;
      error: string;
    };
