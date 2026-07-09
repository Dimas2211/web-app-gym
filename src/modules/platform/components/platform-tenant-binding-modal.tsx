"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-tenant-binding-modal.tsx
//
// Modal de detección y vinculación de tenant (C7).
// Nunca renderiza password, encrypted_password, DATABASE_URL ni
// adminKey en pantalla más allá del input controlado por el usuario.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useEffect } from "react";
import {
  X,
  Link2,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Info,
} from "lucide-react";

import { detectDatabaseProfileTenantAction } from "../actions/detect-database-profile-tenant.action";
import { bindOrganizationTenantAction }       from "../actions/bind-organization-tenant.action";
import type {
  TenantDetectionResult,
  DetectedTenant,
} from "../types/platform.types";

interface Props {
  profileId:    string;
  profileLabel: string;
  onClose:      () => void;
}

const CONFIRMATION_TEXT = "BIND TENANT";

export function PlatformTenantBindingModal({ profileId, profileLabel, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [detection,   setDetection]   = useState<TenantDetectionResult | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [adminKey,         setAdminKey]         = useState("");
  const [confirmText,      setConfirmText]      = useState("");
  const [bindError,        setBindError]        = useState<string | null>(null);
  const [bindSuccess,      setBindSuccess]      = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleDetect() {
    setDetection(null);
    setDetectError(null);
    setBindError(null);
    setBindSuccess(null);
    setSelectedTenantId("");
    startTransition(async () => {
      const res = await detectDatabaseProfileTenantAction(profileId);
      if (!res.success && res.status === "DETECTION_FAILED") {
        setDetectError(res.error ?? "No se pudo detectar tenants.");
        setDetection(res);
        return;
      }
      setDetection(res);
      if (res.recommendedTenantId) {
        setSelectedTenantId(res.recommendedTenantId);
      }
    });
  }

  function handleBind() {
    if (!detection) return;
    setBindError(null);
    setBindSuccess(null);
    startTransition(async () => {
      const res = await bindOrganizationTenantAction({
        organizationId:   detection.organizationId,
        tenantId:         selectedTenantId,
        confirmationText: confirmText,
        adminKey,
        sourceProfileId:  profileId,
      });
      if (!res.success) {
        setBindError(res.error ?? "No se pudo asignar el tenant.");
        return;
      }
      setBindSuccess(`Tenant vinculado correctamente: ${res.tenantId}`);
      setAdminKey("");
      setConfirmText("");
      // Refrescar detección para reflejar el nuevo estado
      handleDetect();
    });
  }

  const canBind =
    !!selectedTenantId &&
    confirmText.trim() === CONFIRMATION_TEXT &&
    adminKey.trim().length > 0 &&
    !isPending;

  const alreadyBoundToSelection =
    !!detection?.currentOrganizationTenantId &&
    detection.currentOrganizationTenantId === selectedTenantId;

  const isChangingExisting =
    !!detection?.currentOrganizationTenantId &&
    !!selectedTenantId &&
    detection.currentOrganizationTenantId !== selectedTenantId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl border border-zinc-200">

        {/* Cabecera */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Link2 size={16} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-zinc-800">
                Tenant binding — {profileLabel}
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Detecta tenants existentes en la base cliente y vincula uno con la organización.
              Solo lectura contra la base cliente — no escribe nada allí.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">

          {/* Botón detectar */}
          {!detection && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={handleDetect}
                disabled={isPending}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700
                           disabled:bg-emerald-400 text-white text-sm font-semibold
                           px-5 py-2.5 rounded-lg transition-colors"
              >
                {isPending
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Search size={15} />}
                {isPending ? "Detectando..." : "Detectar tenant"}
              </button>
            </div>
          )}

          {/* Error de detección */}
          {detectError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm text-red-700">{detectError}</p>
                <button
                  type="button"
                  onClick={handleDetect}
                  disabled={isPending}
                  className="text-xs text-red-600 underline hover:no-underline disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Resultado de detección */}
          {detection && detection.success && (
            <div className="space-y-4">

              {/* Organización y tenant actual */}
              <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3 text-xs text-zinc-600 space-y-1">
                <p>
                  <span className="font-semibold text-zinc-500">Organización:</span>{" "}
                  {detection.organizationName}
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-semibold text-zinc-500">tenant_id actual:</span>{" "}
                  {detection.currentOrganizationTenantId
                    ? <span className="font-mono text-zinc-700">{detection.currentOrganizationTenantId}</span>
                    : <span className="text-zinc-400 italic">sin asignar</span>}
                </p>
              </div>

              {/* Estado de detección */}
              {detection.status === "NO_TENANTS_FOUND" && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <Info size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Esta base no tiene tenant operativo todavía. El tenant_id se crea cuando
                    el provisioning crea un registro en <span className="font-mono">gyms</span>.
                  </p>
                </div>
              )}

              {detection.status === "ALREADY_BOUND" && (
                <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
                  <CheckCircle2 size={15} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">
                    El tenant detectado ya está vinculado a esta organización.
                  </p>
                </div>
              )}

              {detection.detectedTenants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-600">
                    Tenants detectados ({detection.detectedTenants.length})
                    {detection.status === "SINGLE_TENANT_DETECTED" && (
                      <span className="text-emerald-600 font-normal"> — recomendado</span>
                    )}
                    {detection.status === "MULTIPLE_TENANTS_DETECTED" && (
                      <span className="text-amber-600 font-normal"> — selección manual requerida</span>
                    )}
                  </p>
                  <div className="space-y-1.5">
                    {detection.detectedTenants.map((t: DetectedTenant) => (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedTenantId === t.id
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="tenant"
                          value={t.id}
                          checked={selectedTenantId === t.id}
                          onChange={() => setSelectedTenantId(t.id)}
                          className="accent-emerald-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-700 truncate">
                            {t.name}
                          </p>
                          <p className="text-[10px] text-zinc-400 font-mono truncate">
                            {t.id} {t.slug ? `· ${t.slug}` : ""} {t.status ? `· ${t.status}` : ""}
                          </p>
                        </div>
                        {detection.recommendedTenantId === t.id && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex-shrink-0">
                            Recomendado
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Warning fuerte si difiere del actual */}
              {isChangingExisting && !alreadyBoundToSelection && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <ShieldAlert size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">
                    <strong>Atención:</strong> la organización ya tiene un tenant_id distinto
                    (<span className="font-mono">{detection.currentOrganizationTenantId}</span>).
                    Cambiarlo puede desalinear módulos operativos que dependen de ese tenant.
                    Verifica antes de continuar.
                  </p>
                </div>
              )}

              {/* Formulario de asignación segura */}
              {selectedTenantId && !alreadyBoundToSelection && (
                <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-600">Asignación segura</p>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-500">Clave administrativa</label>
                    <input
                      type="password"
                      value={adminKey}
                      onChange={(e) => setAdminKey(e.target.value)}
                      disabled={isPending}
                      autoComplete="off"
                      className="w-full text-xs border border-zinc-200 rounded px-2.5 py-1.5
                                 focus:outline-none focus:ring-1 focus:ring-emerald-300
                                 disabled:opacity-50 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-500">
                      Escribe <span className="font-mono font-bold text-zinc-700">{CONFIRMATION_TEXT}</span> para confirmar
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={CONFIRMATION_TEXT}
                      disabled={isPending}
                      className="w-full text-xs font-mono border border-zinc-200 rounded px-2.5 py-1.5
                                 focus:outline-none focus:ring-1 focus:ring-emerald-300
                                 disabled:opacity-50 bg-white"
                    />
                  </div>

                  {bindError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
                      <AlertTriangle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-700 leading-snug">{bindError}</p>
                    </div>
                  )}

                  {bindSuccess && (
                    <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-2.5 py-2">
                      <CheckCircle2 size={12} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-green-700 leading-snug">{bindSuccess}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleBind}
                    disabled={!canBind}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg
                               bg-emerald-600 text-white hover:bg-emerald-700
                               transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Link2 size={11} />}
                    Asignar tenant
                  </button>
                </div>
              )}

              {/* Volver a detectar */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleDetect}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700
                             border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-50
                             transition-colors disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  {isPending ? "Detectando..." : "Volver a detectar"}
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
