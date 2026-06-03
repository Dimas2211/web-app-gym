"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-env-preview-panel.tsx
//
// Panel de variables de entorno copiables para deployment manual.
// Usa placeholders seguros — no expone credenciales reales.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ManualDeploymentOrgDetails } from "../types/platform.types";

interface Props {
  org: ManualDeploymentOrgDetails;
}

interface EnvVar {
  key:         string;
  placeholder: string;
  hint:        string;
}

function buildEnvVars(org: ManualDeploymentOrgDetails): EnvVar[] {
  const moduleCodes = org.active_modules.map((m) => m.code).join(",");

  return [
    {
      key:         "DATABASE_URL",
      placeholder: `postgresql://USER:PASSWORD@HOST:5432/${org.code.toLowerCase()}_db`,
      hint:        "Conexión principal de la app en runtime",
    },
    {
      key:         "DIRECT_URL",
      placeholder: `postgresql://USER:PASSWORD@HOST:5432/${org.code.toLowerCase()}_db`,
      hint:        "Conexión directa para Prisma CLI / migraciones",
    },
    {
      key:         "NEXTAUTH_SECRET",
      placeholder: "<GENERAR_CON: openssl rand -base64 32>",
      hint:        "Secret aleatorio de 32+ bytes para NextAuth",
    },
    {
      key:         "NEXTAUTH_URL",
      placeholder: org.domain ? `https://${org.domain}` : "https://<DOMINIO_DE_LA_INSTANCIA>",
      hint:        "URL pública de la instancia desplegada",
    },
    {
      key:         "INSTALLATION_CODE",
      placeholder: org.code,
      hint:        "Código único de la organización en la plataforma",
    },
    {
      key:         "ACTIVE_MODULES",
      placeholder: moduleCodes || "<CODIGOS_DE_MODULOS_ACTIVOS>",
      hint:        `Módulos activos: ${org.active_modules.length}`,
    },
    {
      key:         "CLIENT_NAME",
      placeholder: org.name,
      hint:        "Nombre comercial de la organización",
    },
    {
      key:         "CLIENT_VERTICAL",
      placeholder: org.vertical?.code ?? "<VERTICAL_CODE>",
      hint:        `Vertical: ${org.vertical?.name ?? "—"}`,
    },
    {
      key:         "CLIENT_PLAN",
      placeholder: org.plan?.code ?? "<PLAN_CODE>",
      hint:        `Plan: ${org.plan?.name ?? "—"}`,
    },
    {
      key:         "PLATFORM_VERSION",
      placeholder: "1.0.0",
      hint:        "Versión de la plataforma base desplegada",
    },
  ];
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copiar al portapapeles"
      className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
    >
      {copied
        ? <Check size={13} className="text-green-600" />
        : <Copy size={13} />
      }
    </button>
  );
}

export function PlatformEnvPreviewPanel({ org }: Props) {
  const [showAll, setShowAll] = useState(false);
  const vars = buildEnvVars(org);
  const visible = showAll ? vars : vars.slice(0, 6);

  const allEnvText = vars.map((v) => `${v.key}=${v.placeholder}`).join("\n");

  return (
    <div className="space-y-3">

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">Variables de Entorno</h3>
        <CopyButton value={allEnvText} />
      </div>

      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Los valores mostrados son <strong>placeholders seguros</strong>. Reemplaza cada uno con los valores reales de tu infraestructura antes de desplegar.
      </p>

      <div className="space-y-1">
        {visible.map((v) => (
          <div
            key={v.key}
            className="flex items-start gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-blue-700">{v.key}</span>
                <span className="text-[10px] text-zinc-400">{v.hint}</span>
              </div>
              <div className="font-mono text-xs text-zinc-600 mt-0.5 break-all">
                ={v.placeholder}
              </div>
            </div>
            <CopyButton value={`${v.key}=${v.placeholder}`} />
          </div>
        ))}
      </div>

      {vars.length > 6 && (
        <button
          onClick={() => setShowAll((p) => !p)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {showAll ? "Mostrar menos" : `Ver todas (${vars.length - 6} más)`}
        </button>
      )}
    </div>
  );
}
