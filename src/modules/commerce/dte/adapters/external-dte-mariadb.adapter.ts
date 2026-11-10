// commerce/dte — external-dte-mariadb.adapter.ts
//
// Adapter para insertar el JSON DTE aceptado en la base MariaDB externa.
// El sistema externo gestiona PDF, envío al cliente y archivado.
//
// Garantías de seguridad:
//   - Nunca imprime password, host con credenciales, signed_jws completo ni JSON completo.
//   - Usa parámetros preparados — sin riesgo de SQL injection.
//   - Identificadores SQL (database/table) validados con regex antes de interpolarse.
//   - Cierra la conexión siempre (finally).
//   - Retorna error sanitizado, nunca stack trace interno.
//   - No escribe en Prisma ni en nuestra DB. Solo en la base externa.
//
// Flujo garantizado:
//   1. Validar configuración (database y table requeridos — sin fallback silencioso).
//   2. Validar identificadores SQL.
//   3. Crear conexión.
//   4. INSERT en la tabla configurada (autocommit=1 por defecto en MariaDB).
//   5. Retornar ok: true si isInsertResult — éxito confirmado por driver.
//   6. NO se ejecuta SELECT posterior. El usuario externo es INSERT-only.
//   7. Cerrar conexión en finally.

import mysql from "mysql2/promise";
import type {
  ExternalDteMariaDbConfig,
  ExternalDteDeliveryResult,
  ExternalDteConnectivityResult,
} from "../types/external-dte-delivery.types";

type InsertPhase = "VALIDATE" | "CONNECT" | "EXECUTE";

/**
 * FISCAL-ONBOARDING — clasifica un error del INSERT según lo que el
 * emisor puede afirmar sobre el destino. Exportada para tests.
 *   - VALIDATE/CONNECT: la sentencia nunca salió -> NOT_INSERTED.
 *   - EXECUTE + ER_DUP_ENTRY (1062): el receptor deduplicó -> DUPLICATE.
 *   - EXECUTE + error SQL no fatal devuelto por el servidor (errno) ->
 *     el servidor rechazó la sentencia -> NOT_INSERTED.
 *   - EXECUTE + timeout / conexión perdida / error fatal / desconocido ->
 *     UNCERTAIN (pudo haberse persistido).
 */
export function classifyMariaDbInsertError(
  err: unknown,
  phase: InsertPhase,
): "DUPLICATE" | "NOT_INSERTED" | "UNCERTAIN" {
  if (phase !== "EXECUTE") return "NOT_INSERTED";
  const e = (typeof err === "object" && err !== null ? err : {}) as {
    code?: unknown; errno?: unknown; fatal?: unknown; sqlState?: unknown;
  };
  if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return "DUPLICATE";
  if (e.fatal !== true && typeof e.errno === "number" && typeof e.sqlState === "string") return "NOT_INSERTED";
  return "UNCERTAIN";
}

function sanitizeMariaDbError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/password[^,)"]*/gi, "password=[redacted]");
}

// Resultado interno del INSERT para tipado seguro con mysql2
interface InsertResult {
  insertId:     number | bigint;
  affectedRows: number;
}

function isInsertResult(v: unknown): v is InsertResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "affectedRows" in v &&
    typeof (v as Record<string, unknown>)["affectedRows"] === "number"
  );
}

// Los identificadores SQL (database/table) se interpolan en la query — no pueden ir como parámetros.
// Esta función lanza si el valor contiene caracteres fuera de [a-zA-Z0-9_].
function assertSafeIdentifier(value: string, label: string): void {
  if (!value) {
    throw new Error(`${label} no está configurado. Revise las variables de entorno EXTERNAL_DTE_MARIADB_*.`);
  }
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`${label} inválido: contiene caracteres no permitidos en identificador SQL.`);
  }
}

export class ExternalDteMariaDbAdapter {
  /**
   * Inserta el payload en la tabla externa.
   *
   * @param tableName - Nombre de tabla a usar. Si se omite, usa config.table (FE/CCF/NC).
   *                    Para invalidaciones, pasar config.invalidationTable explícitamente.
   *
   * Garantías:
   *  - Nunca lanza excepción: siempre devuelve ExternalDteDeliveryResult.
   *  - Cierra la conexión en finally.
   *  - No imprime datos sensibles en logs.
   *  - Retorna ok: true si el driver confirma el INSERT con isInsertResult.
   *  - No ejecuta SELECT posterior — el usuario externo es INSERT-only.
   *  - No usa transacción explícita — el INSERT opera con autocommit del servidor.
   */
  async insert(
    config:     ExternalDteMariaDbConfig,
    payload:    unknown,
    tableName?: string,
  ): Promise<ExternalDteDeliveryResult> {
    if (!config.enabled) {
      return { ok: false, error: "EXTERNAL_DTE_MARIADB_ENABLED no está activo.", errorCode: "ADAPTER_DISABLED" };
    }

    if (!config.host || !config.user || !config.password) {
      return { ok: false, error: "Configuración MariaDB externa incompleta.", errorCode: "CONFIG_INCOMPLETE" };
    }

    // tableName explícito tiene prioridad; si no se pasa, usar la tabla DTE configurada en .env.
    // Si ninguna está configurada, fallar explícitamente — sin fallback silencioso.
    const resolvedTable = tableName ?? config.table;

    if (!resolvedTable) {
      return {
        ok:        false,
        error:     "Tabla de destino no configurada. Revise EXTERNAL_DTE_MARIADB_TABLE en .env.",
        errorCode: "TABLE_NOT_CONFIGURED",
      };
    }

    if (!config.database) {
      return {
        ok:        false,
        error:     "Base de datos de destino no configurada. Revise EXTERNAL_DTE_MARIADB_DATABASE en .env.",
        errorCode: "DATABASE_NOT_CONFIGURED",
      };
    }

    // JSON.stringify se aplica una sola vez aquí — payload debe ser objeto, nunca string.
    const jsonString = JSON.stringify(payload);

    let connection: mysql.Connection | null = null;
    // FISCAL-ONBOARDING — fase alcanzada. Un fallo ANTES de enviar la
    // sentencia es NOT_INSERTED (seguro de reintentar); un fallo DESPUÉS
    // puede haber persistido la fila -> UNCERTAIN.
    let phase: InsertPhase = "VALIDATE";

    try {
      // Validar identificadores antes de abrir conexión — fallo rápido sin overhead de red.
      assertSafeIdentifier(config.database, "database");
      assertSafeIdentifier(resolvedTable, "table");

      phase = "CONNECT";
      connection = await mysql.createConnection({
        host:               config.host,
        port:               config.port,
        user:               config.user,
        password:           config.password,
        database:           config.database,
        connectTimeout:     config.timeoutMs,
        multipleStatements: false,
      });

      const sql =
        `INSERT INTO \`${config.database}\`.\`${resolvedTable}\` (\`json\`, \`estado\`, \`fechah_creacion\`) VALUES (?, ?, NOW())`;

      phase = "EXECUTE";
      const [result] = await connection.execute({ sql, timeout: config.timeoutMs }, [jsonString, "1"]);

      if (!isInsertResult(result)) {
        return { ok: false, outcome: "UNCERTAIN", error: "Respuesta inesperada del INSERT externo.", errorCode: "UNEXPECTED_RESULT" };
      }

      // Guía §06: exigir affectedRows >= 1 explícitamente antes de declarar éxito.
      if (result.affectedRows < 1) {
        return {
          ok:        false,
          outcome:   "UNCERTAIN",
          error:     "El destino respondió sin filas afectadas (affectedRows=0); no se confirma la entrega.",
          errorCode: "NO_ROWS_AFFECTED",
        };
      }

      // Éxito confirmado por driver — no se ejecuta SELECT posterior.
      return {
        ok:             true,
        outcome:        "CONFIRMED",
        insertId:       result.insertId,
        affectedRows:   result.affectedRows,
        targetTable:    resolvedTable,
        targetDatabase: config.database,
      };

    } catch (err) {
      const outcome = classifyMariaDbInsertError(err, phase);

      if (outcome === "DUPLICATE") {
        // Solo posible si el receptor deduplica (clave única): el documento ya existe allí.
        return {
          ok:             true,
          outcome:        "DUPLICATE",
          insertId:       null,
          affectedRows:   0,
          targetTable:    resolvedTable,
          targetDatabase: config.database,
        };
      }

      return {
        ok:        false,
        outcome,
        error:     `Error al insertar en MariaDB externa: ${sanitizeMariaDbError(err)}`,
        errorCode: outcome === "UNCERTAIN" ? "INSERT_UNCERTAIN" : "INSERT_FAILED",
      };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch {
          // Ignorar error de cierre — ya retornamos resultado.
        }
      }
    }
  }

  /**
   * FISCAL-ONBOARDING — prueba de conectividad que NUNCA inserta.
   * 1. Login con la credencial INSERT-only (CONNECTED).
   * 2. EXPLAIN INSERT sobre la tabla destino: MariaDB/MySQL validan
   *    tabla, columnas y permiso INSERT sin ejecutar la escritura
   *    (INSERT_PLAN_OK). No usa SELECT sobre tablas del receptor.
   */
  async testConnectivity(config: ExternalDteMariaDbConfig, tableName?: string): Promise<ExternalDteConnectivityResult> {
    const resolvedTable = tableName ?? config.table;
    if (!config.host || !config.user || !config.password || !config.database || !resolvedTable) {
      return { ok: false, level: "FAILED", message: "Configuración MariaDB incompleta.", errorCode: "CONFIG_INCOMPLETE" };
    }

    let connection: mysql.Connection | null = null;
    try {
      assertSafeIdentifier(config.database, "database");
      assertSafeIdentifier(resolvedTable, "table");

      connection = await mysql.createConnection({
        host:               config.host,
        port:               config.port,
        user:               config.user,
        password:           config.password,
        database:           config.database,
        connectTimeout:     config.timeoutMs,
        multipleStatements: false,
      });
    } catch (err) {
      return { ok: false, level: "FAILED", message: `No se pudo conectar: ${sanitizeMariaDbError(err)}`, errorCode: "CONNECT_FAILED" };
    }

    try {
      const sql =
        `EXPLAIN INSERT INTO \`${config.database}\`.\`${resolvedTable}\` (\`json\`, \`estado\`, \`fechah_creacion\`) VALUES (?, ?, NOW())`;
      await connection.query({ sql, timeout: config.timeoutMs }, ["{}", "1"]);
      return {
        ok:      true,
        level:   "INSERT_PLAN_OK",
        message: `Conexión OK y plan de INSERT válido en ${config.database}.${resolvedTable} (sin insertar).`,
      };
    } catch (err) {
      return {
        ok:        true,
        level:     "CONNECTED",
        message:   `Conexión OK, pero no se pudo validar la tabla con EXPLAIN INSERT: ${sanitizeMariaDbError(err)}`,
        errorCode: "INSERT_PLAN_FAILED",
      };
    } finally {
      try { await connection.end(); } catch { /* ignore */ }
    }
  }
}
