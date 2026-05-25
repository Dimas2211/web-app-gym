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
import type { ExternalDteMariaDbConfig, ExternalDteDeliveryResult } from "../types/external-dte-delivery.types";

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

    try {
      // Validar identificadores antes de abrir conexión — fallo rápido sin overhead de red.
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

      const sql =
        `INSERT INTO \`${config.database}\`.\`${resolvedTable}\` (\`json\`, \`estado\`, \`fechah_creacion\`) VALUES (?, ?, NOW())`;

      const [result] = await connection.execute(sql, [jsonString, "1"]);

      if (!isInsertResult(result)) {
        return { ok: false, error: "Respuesta inesperada del INSERT externo.", errorCode: "UNEXPECTED_RESULT" };
      }

      // Éxito confirmado por driver — no se ejecuta SELECT posterior.
      return {
        ok:             true,
        insertId:       result.insertId,
        affectedRows:   result.affectedRows,
        targetTable:    resolvedTable,
        targetDatabase: config.database,
      };

    } catch (err) {
      // Sanitizar error — nunca exponer credenciales ni stack interno.
      const raw = err instanceof Error ? err.message : String(err);
      const sanitized = raw.replace(/password[^,)"]*/gi, "password=[redacted]");

      return {
        ok:        false,
        error:     `Error al insertar en MariaDB externa: ${sanitized}`,
        errorCode: "INSERT_FAILED",
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
}
