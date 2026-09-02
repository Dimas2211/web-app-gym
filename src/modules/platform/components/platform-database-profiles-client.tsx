"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-profiles-client.tsx
//
// Orquestador cliente para Database Profiles.
// Gestiona filtros, modales, feedback de acciones directas.
//
// Reglas de seguridad:
// - No renderiza password ni encrypted_password en ningún path.
// - El feedback de test connection usa solo el mensaje sanitizado
//   devuelto por la action (la action ya aplica sanitizeDatabaseError).
// - No se escribe ningún secret en la consola del browser.
// ─────────────────────────────────────────────────────────────────

import { useState, useMemo, useTransition, useEffect } from "react";
import { Database, Plus, AlertTriangle } from "lucide-react";

import { PlatformDatabaseProfilesTable }          from "./platform-database-profiles-table";
import { PlatformDatabaseProfileFormDialog }       from "./platform-database-profile-form-dialog";
import { PlatformDatabaseProfilePreflightModal }   from "./platform-database-profile-preflight-modal";
import { PlatformDatabaseProfileInspectorModal }   from "./platform-database-profile-inspector-modal";
import { PlatformTenantBindingModal }              from "./platform-tenant-binding-modal";
import { setDatabaseProfileActiveAction }          from "../actions/set-database-profile-active.action";
import { testDatabaseProfileConnectionAction }     from "../actions/test-database-profile-connection.action";
import { testDatabaseProfileDirectConnectionAction } from "../actions/test-database-profile-direct-connection.action";

import type { PlatformDatabaseProfileItem } from "../types/platform.types";

interface OrgOption {
  id:   string;
  code: string;
  name: string;
}

interface Feedback {
  type:    "success" | "error";
  message: string;
}

export interface PlatformDatabaseProfilesClientProps {
  profiles:             PlatformDatabaseProfileItem[];
  organizations:        OrgOption[];
  encryptionKeyMissing: boolean;
}

export function PlatformDatabaseProfilesClient({
  profiles,
  organizations,
  encryptionKeyMissing,
}: PlatformDatabaseProfilesClientProps) {
  const [selectedOrgId,     setSelectedOrgId]     = useState<string>("");
  const [showDialog,        setShowDialog]        = useState(false);
  const [editingProfile,    setEditingProfile]    = useState<PlatformDatabaseProfileItem | null>(null);
  const [testingId,         setTestingId]         = useState<string | null>(null);
  const [testingDirectId,   setTestingDirectId]   = useState<string | null>(null);
  const [togglingId,        setTogglingId]        = useState<string | null>(null);
  const [feedback,          setFeedback]          = useState<Feedback | null>(null);
  const [preflightProfile,  setPreflightProfile]  = useState<PlatformDatabaseProfileItem | null>(null);
  const [inspectorProfile,  setInspectorProfile]  = useState<PlatformDatabaseProfileItem | null>(null);
  const [tenantBindingProfile, setTenantBindingProfile] = useState<PlatformDatabaseProfileItem | null>(null);

  const [, startTransition] = useTransition();

  // Auto-limpiar feedback tras 6 segundos
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Filtrado en memoria — dataset pequeño
  const filteredProfiles = useMemo(() => {
    if (!selectedOrgId) return profiles;
    return profiles.filter((p) => p.organization_id === selectedOrgId);
  }, [profiles, selectedOrgId]);

  function handleOpenCreate() {
    setEditingProfile(null);
    setShowDialog(true);
  }

  function handleOpenEdit(p: PlatformDatabaseProfileItem) {
    setEditingProfile(p);
    setShowDialog(true);
  }

  function handleCloseDialog() {
    setShowDialog(false);
    setEditingProfile(null);
  }

  function handleToggleActive(p: PlatformDatabaseProfileItem) {
    setTogglingId(p.id);
    startTransition(async () => {
      const result = await setDatabaseProfileActiveAction(p.id, !p.is_active);
      setTogglingId(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({
          type: "success",
          message: `Perfil "${p.label}" ${!p.is_active ? "activado" : "desactivado"} correctamente.`,
        });
      }
    });
  }

  function handleTestConnection(p: PlatformDatabaseProfileItem) {
    setTestingId(p.id);
    startTransition(async () => {
      // El mensaje devuelto por la action ya está sanitizado (sanitizeDatabaseError)
      const result = await testDatabaseProfileConnectionAction(p.id);
      setTestingId(null);
      setFeedback({
        type:    result.success ? "success" : "error",
        message: result.message,
      });
    });
  }

  function handleTestDirectConnection(p: PlatformDatabaseProfileItem) {
    setTestingDirectId(p.id);
    startTransition(async () => {
      const result = await testDatabaseProfileDirectConnectionAction(p.id);
      setTestingDirectId(null);
      setFeedback({
        type:    result.success ? "success" : "error",
        message: result.message,
      });
    });
  }

  function handleOpenPreflight(p: PlatformDatabaseProfileItem) {
    setPreflightProfile(p);
  }

  function handleOpenInspector(p: PlatformDatabaseProfileItem) {
    setInspectorProfile(p);
  }

  function handleOpenTenantBinding(p: PlatformDatabaseProfileItem) {
    setTenantBindingProfile(p);
  }

  return (
    <div className="space-y-5">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Database size={18} className="text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-800">Perfiles de base de datos</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            {filteredProfiles.length}{selectedOrgId ? "" : ` de ${profiles.length}`} perfil{profiles.length !== 1 ? "es" : ""}
            {selectedOrgId ? ` en la organización seleccionada` : " en total"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          disabled={encryptionKeyMissing}
          className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg
                     text-sm font-semibold hover:bg-zinc-800 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title={encryptionKeyMissing ? "PLATFORM_ENCRYPTION_KEY no configurada" : undefined}
        >
          <Plus size={15} />
          Nuevo perfil
        </button>
      </div>

      {/* Advertencia clave de cifrado */}
      {encryptionKeyMissing && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>PLATFORM_ENCRYPTION_KEY</strong> no está configurada en este entorno.
            No se podrán crear perfiles ni probar conexiones hasta que se configure la variable de entorno.
          </div>
        </div>
      )}

      {/* Feedback de acciones directas */}
      {feedback && (
        <div className={`px-4 py-3 rounded-xl border text-sm ${
          feedback.type === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700 min-w-[200px]"
        >
          <option value="">Todas las organizaciones</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.name}
            </option>
          ))}
        </select>

        {selectedOrgId && (
          <button
            type="button"
            onClick={() => setSelectedOrgId("")}
            className="h-9 px-3 text-sm text-zinc-500 border border-zinc-200 rounded-lg
                       hover:bg-zinc-50 transition-colors whitespace-nowrap"
          >
            Limpiar filtro
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <PlatformDatabaseProfilesTable
          items={filteredProfiles}
          testingId={testingId}
          testingDirectId={testingDirectId}
          togglingId={togglingId}
          preflightingId={null}
          onEdit={handleOpenEdit}
          onToggleActive={handleToggleActive}
          onTest={handleTestConnection}
          onTestDirect={handleTestDirectConnection}
          onPreflight={handleOpenPreflight}
          onInspect={handleOpenInspector}
          onDetectTenant={handleOpenTenantBinding}
        />
        {profiles.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right">
            {filteredProfiles.length} perfil{filteredProfiles.length !== 1 ? "es" : ""}
            {selectedOrgId ? " (filtrado)" : ""}
          </div>
        )}
      </div>

      {/* Dialog crear/editar — key fuerza remount al cambiar de modo */}
      {showDialog && (
        <PlatformDatabaseProfileFormDialog
          key={editingProfile?.id ?? "new"}
          profile={editingProfile}
          organizations={organizations}
          onClose={handleCloseDialog}
        />
      )}

      {/* Modal de preflight por perfil (C3 + C5) */}
      {preflightProfile && (
        <PlatformDatabaseProfilePreflightModal
          key={preflightProfile.id}
          profileId={preflightProfile.id}
          profileLabel={preflightProfile.label}
          environment={preflightProfile.environment}
          onClose={() => setPreflightProfile(null)}
        />
      )}

      {/* Modal de inspector read-only (C4) */}
      {inspectorProfile && (
        <PlatformDatabaseProfileInspectorModal
          key={`inspector-${inspectorProfile.id}`}
          profileId={inspectorProfile.id}
          profileLabel={inspectorProfile.label}
          onClose={() => setInspectorProfile(null)}
        />
      )}

      {/* Modal de tenant binding (C7) */}
      {tenantBindingProfile && (
        <PlatformTenantBindingModal
          key={`tenant-binding-${tenantBindingProfile.id}`}
          profileId={tenantBindingProfile.id}
          profileLabel={tenantBindingProfile.label}
          onClose={() => setTenantBindingProfile(null)}
        />
      )}

    </div>
  );
}
