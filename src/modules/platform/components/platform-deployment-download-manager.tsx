"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-download-manager.tsx
//
// Gestiona las descargas de Deployment Bundle y Configuration Package.
// Permite también exportar vía Server Action y visualizar el bundle.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition }  from "react";
import { Download, FileJson, Loader2, AlertCircle } from "lucide-react";
import { exportDeploymentBundleAction }      from "../actions/export-deployment-bundle.action";
import { exportConfigurationPackageAction }  from "../actions/export-configuration-package.action";
import { PlatformDeploymentBundleViewer }    from "./platform-deployment-bundle-viewer";
import type { DeploymentBundle }             from "../types/platform.types";

interface Props {
  organizationId:   string;
  organizationCode: string;
  canExport:        boolean;
}

export function PlatformDeploymentDownloadManager({ organizationId, organizationCode, canExport }: Props) {
  const [isPending, startTransition] = useTransition();
  const [errors,    setErrors]       = useState<string[]>([]);
  const [bundle,    setBundle]       = useState<DeploymentBundle | null>(null);
  const [activeTab, setActiveTab]    = useState<"bundle" | "config">("bundle");
  const [exportedVersion, setExportedVersion] = useState<string | null>(null);

  function handleExportBundle() {
    setErrors([]);
    setBundle(null);
    startTransition(async () => {
      const result = await exportDeploymentBundleAction(organizationId);
      if (result?.success) {
        setBundle(result.bundle);
        setExportedVersion(result.version);
      } else if (result && !result.success) {
        setErrors(result.validation.errors);
      }
    });
  }

  function handleDownloadBundle() {
    const a = document.createElement("a");
    a.href = `/api/platform/deployment-exports/${organizationId}/bundle`;
    a.download = `deployment-bundle-${organizationCode}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleDownloadConfig() {
    const a = document.createElement("a");
    a.href = `/api/platform/deployment-exports/${organizationId}/config-package`;
    a.download = `configuration-package-${organizationCode}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleExportConfig() {
    setErrors([]);
    startTransition(async () => {
      const result = await exportConfigurationPackageAction(organizationId);
      if (!result?.success && result) {
        setErrors(result.validation.errors);
      }
    });
  }

  return (
    <div className="space-y-4">

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab("bundle")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "bundle"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Deployment Bundle
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "config"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Configuration Package
        </button>
      </div>

      {/* Errores */}
      {errors.length > 0 && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {errors.map((e) => (
              <p key={e} className="text-sm text-red-700">{e}</p>
            ))}
          </div>
        </div>
      )}

      {/* Deployment Bundle */}
      {activeTab === "bundle" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            El Deployment Bundle consolida toda la configuración de la organización en un
            artefacto JSON exportable y versionado.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportBundle}
              disabled={!canExport || isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
              Generar y visualizar bundle
            </button>
            <button
              type="button"
              onClick={handleDownloadBundle}
              disabled={!canExport || isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={14} />
              Descargar JSON
            </button>
          </div>

          {!canExport && (
            <p className="text-xs text-zinc-400 italic">
              El provisioning debe estar en estado READY para exportar.
            </p>
          )}

          {bundle && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-700">Bundle generado</span>
                <span className="font-mono text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                  {exportedVersion}
                </span>
              </div>
              <PlatformDeploymentBundleViewer bundle={bundle} />
            </div>
          )}
        </div>
      )}

      {/* Configuration Package */}
      {activeTab === "config" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            El Configuration Package es una representación simplificada del bundle,
            pensado para integraciones futuras con herramientas de despliegue.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportConfig}
              disabled={!canExport || isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
              Registrar exportación
            </button>
            <button
              type="button"
              onClick={handleDownloadConfig}
              disabled={!canExport || isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={14} />
              Descargar JSON
            </button>
          </div>

          {!canExport && (
            <p className="text-xs text-zinc-400 italic">
              El provisioning debe estar en estado READY para exportar.
            </p>
          )}
        </div>
      )}

    </div>
  );
}
