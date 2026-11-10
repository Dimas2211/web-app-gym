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
// ok: true solo si INSERT ejecutado sin error, affectedRows >= 1 y commit exitoso.
// No se requiere permiso SELECT — el usuario externo es INSERT-only.

//
// FISCAL-ONBOARDING — `outcome` distingue lo que el emisor SABE del destino:
//   CONFIRMED     — driver confirmó INSERT con affectedRows >= 1.
//   DUPLICATE     — el receptor rechazó por clave duplicada (solo posible
//                   si el receptor deduplica): el documento YA está allí.
//   NOT_INSERTED  — el INSERT nunca se ejecutó o el servidor lo rechazó
//                   explícitamente (config, conexión, error SQL). Reintentable.
//   UNCERTAIN     — la sentencia pudo haberse ejecutado (timeout / conexión
//                   perdida tras enviarla). NUNCA reintentar automáticamente.
export type ExternalDteDeliveryOutcome = "CONFIRMED" | "DUPLICATE" | "NOT_INSERTED" | "UNCERTAIN";

export type ExternalDteDeliveryResult =
  | {
      ok:             true;
      outcome?:       "CONFIRMED" | "DUPLICATE";
      insertId:       number | bigint | null;
      affectedRows:   number;
      targetTable:    string;
      targetDatabase: string;
    }
  | {
      ok:         false;
      outcome?:   "NOT_INSERTED" | "UNCERTAIN";
      error:      string;
      errorCode?: string;
    };

// Resultado de la prueba de conectividad SIN insertar (EXPLAIN INSERT).
export interface ExternalDteConnectivityResult {
  ok:          boolean;
  /** CONNECTED = login OK; INSERT_PLAN_OK = tabla/columnas/permiso INSERT verificados sin insertar. */
  level:       "FAILED" | "CONNECTED" | "INSERT_PLAN_OK";
  message:     string;
  errorCode?:  string;
}

// ── Resultado del service (DTE) ───────────────────────────────────
// ok: true confirma INSERT + affectedRows >= 1 + commit. No se usa SELECT.
// La UI muestra éxito si ok === true.

export type DeliverDteToExternalDbResult =
  | {
      ok:           true;
      insertId:     number | bigint | null;
      affectedRows: number;
      targetTable:  string;
      /** Fila del ledger (outbox) — null en el flujo legado sin organización. */
      jobId?:       string | null;
    }
  | {
      ok:          false;
      error:       string;
      targetTable: string | null;
      /**
       * Códigos FISCAL-ONBOARDING adicionales: ALREADY_DELIVERED,
       * DELIVERY_IN_PROGRESS, REQUIRES_RECONCILIATION, UNCERTAIN,
       * ORG_TENANT_MISMATCH, MAX_ATTEMPTS_REACHED.
       */
      errorCode?:  string;
      jobId?:      string | null;
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
