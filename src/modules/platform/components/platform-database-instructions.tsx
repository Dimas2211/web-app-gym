"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-instructions.tsx
//
// Instrucciones manuales de configuración de base de datos.
// Solo guía visual — no ejecuta comandos reales.
// ─────────────────────────────────────────────────────────────────

import { useState }    from "react";
import { Copy, Check } from "lucide-react";
import type { ManualDeploymentOrgDetails } from "../types/platform.types";

interface Props {
  org: ManualDeploymentOrgDetails;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      title="Copiar"
      className="ml-2 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
    </button>
  );
}

interface CodeBlockProps {
  code:    string;
  comment?: string;
}

function CodeBlock({ code, comment }: CodeBlockProps) {
  return (
    <div className="bg-zinc-900 rounded-lg px-4 py-3 text-sm">
      {comment && (
        <p className="text-zinc-500 text-xs mb-1 font-mono"># {comment}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <code className="text-green-400 font-mono text-xs break-all">{code}</code>
        <CopyButton value={code} />
      </div>
    </div>
  );
}

export function PlatformDatabaseInstructions({ org }: Props) {
  const dbName = `${org.code.toLowerCase()}_db`;
  const dbUser = `${org.code.toLowerCase()}_user`;

  return (
    <div className="space-y-4">

      <h3 className="text-sm font-semibold text-zinc-700">Instrucciones de Base de Datos</h3>

      <div className="space-y-3">

        {/* Paso 1 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
            Crear base de datos y usuario
          </p>
          <CodeBlock
            code={`CREATE DATABASE ${dbName};`}
            comment="En psql como superusuario"
          />
          <CodeBlock
            code={`CREATE USER ${dbUser} WITH ENCRYPTED PASSWORD '<PASSWORD_SEGURO>';`}
          />
          <CodeBlock
            code={`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};`}
          />
        </div>

        {/* Paso 2 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
            Verificar conexión
          </p>
          <CodeBlock
            code={`psql -U ${dbUser} -d ${dbName} -c "SELECT version();"`}
            comment="Confirmar que la conexión es exitosa"
          />
        </div>

        {/* Paso 3 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
            Ejecutar migraciones Prisma
          </p>
          <CodeBlock
            code="npx prisma migrate deploy"
            comment="Ejecutar desde la raíz del proyecto con DATABASE_URL configurado"
          />
        </div>

        {/* Paso 4 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
            Verificar tablas creadas
          </p>
          <CodeBlock
            code={`psql -U ${dbUser} -d ${dbName} -c "\\dt"`}
            comment="Listar todas las tablas creadas"
          />
        </div>

      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        <p className="text-xs text-blue-700">
          <strong>Importante:</strong> Configura <code className="font-mono">DATABASE_URL</code> y{" "}
          <code className="font-mono">DIRECT_URL</code> en tu entorno antes de ejecutar migraciones.
          Verifica que el usuario tiene permisos para crear tablas y extensiones.
        </p>
      </div>

    </div>
  );
}
