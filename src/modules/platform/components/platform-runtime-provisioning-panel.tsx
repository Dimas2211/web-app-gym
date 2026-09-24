"use client";

// ─────────────────────────────────────────────────────────────────
// platform/components — platform-runtime-provisioning-panel.tsx
//
// SHARED-PILOT-4A / Gap D. Panel "Runtime" en el detalle de
// organización. Cubre el flujo manual completo sin SQL/CLI/UUIDs:
//   1. Sin runtime asignado  → elegir un Shared Runtime registrado.
//   2. Runtime resuelto, sin provisionar → formulario de provisioning
//      (tenant/location/admin) + confirmación explícita.
//   3. Ya provisionada (tenant_id) → resumen de solo lectura.
//
// SHARED-PILOT-4B: si un intento previo falló o quedó interrumpido, se
// muestra "Falló — Reintentar". El retry llama a la MISMA acción; la
// idempotency key vive solo server-side y se reutiliza allí.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";

import { assignSharedRuntimeTargetToOrganizationAction } from "../actions/assign-shared-runtime-target-to-organization.action";
import {
  provisionSharedRuntimeOrganizationAction,
  type ProvisionSharedRuntimeOrganizationResult,
} from "../actions/provision-shared-runtime-organization.action";
import type { PlatformSharedRuntimeTargetItem } from "../queries/list-shared-runtime-targets";
import type { RuntimeProvisioningOperationSummary } from "../queries/get-runtime-provisioning-operation";

const inputCls = "w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900";

interface Props {
  organizationId: string;
  organizationTenantId: string | null;
  sharedRuntimeTarget: { id: string; label: string } | null;
  hasActiveDedicatedProfile: boolean;
  activeSharedTargets: PlatformSharedRuntimeTargetItem[];
  provisioningOperation: RuntimeProvisioningOperationSummary | null;
}

export function PlatformRuntimeProvisioningPanel({
  organizationId,
  organizationTenantId,
  sharedRuntimeTarget,
  hasActiveDedicatedProfile,
  activeSharedTargets,
  provisioningOperation,
}: Props) {
  const [isPending, startTransition] = useTransition();

  // ── Paso 1: asignar Shared Runtime ────────────────────────────
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  function handleAssign() {
    if (!selectedTargetId) return;
    setAssignError(null);
    startTransition(async () => {
      const result = await assignSharedRuntimeTargetToOrganizationAction({
        organizationId,
        sharedRuntimeTargetId: selectedTargetId,
      });
      if (!result.success) setAssignError(result.error ?? "Error al asignar el Shared Runtime.");
    });
  }

  // ── Paso 2: formulario de provisioning ────────────────────────
  const [mode, setMode] = useState<"COMMERCE_ONLY" | "GYM">("COMMERCE_ONLY");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [gymName, setGymName] = useState("");
  const [gymSlug, setGymSlug] = useState("");
  const [locationName, setLocationName] = useState("Casa Matriz");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<ProvisionSharedRuntimeOrganizationResult | null>(null);

  const runtimeReady = !!sharedRuntimeTarget || hasActiveDedicatedProfile;
  // Intento previo no completado (FAILED, o RUNNING/PENDING de un proceso que se cayó).
  const priorAttemptIncomplete =
    !!provisioningOperation && provisioningOperation.status !== "COMPLETED" && provisioningOperation.attemptCount > 0;
  const showRetry = !!provisionError || priorAttemptIncomplete;
  const canSubmit =
    confirmed &&
    tenantName.trim().length >= 2 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(tenantSlug) &&
    locationName.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(adminEmail) &&
    adminFirstName.trim().length >= 2 &&
    adminLastName.trim().length >= 2 &&
    adminPassword.length >= 8 &&
    (mode === "COMMERCE_ONLY" || (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(gymSlug) && gymName.trim().length >= 2));

  function handleProvision() {
    setProvisionError(null);
    startTransition(async () => {
      const result = await provisionSharedRuntimeOrganizationAction(
        mode === "GYM"
          ? {
              mode: "GYM",
              organizationId,
              tenantName,
              tenantSlug,
              gymName,
              gymSlug,
              locationName,
              admin: { email: adminEmail, password: adminPassword, first_name: adminFirstName, last_name: adminLastName },
            }
          : {
              mode: "COMMERCE_ONLY",
              organizationId,
              tenantName,
              tenantSlug,
              locationName,
              admin: { email: adminEmail, password: adminPassword, first_name: adminFirstName, last_name: adminLastName },
            },
      );
      if (result.success) {
        setProvisionResult(result);
      } else {
        setProvisionError(result.error ?? "Error inesperado durante el provisioning.");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Runtime</h2>

      {/* ── Ya provisionada: resumen de solo lectura ── */}
      {organizationTenantId ? (
        <div className="space-y-2 text-sm">
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">
            Provisioning: <span className="font-semibold">PROVISIONED</span>
          </div>
          <p><span className="text-zinc-400">Tenant ID:</span> <span className="font-mono">{organizationTenantId}</span></p>
          <p><span className="text-zinc-400">Runtime:</span> {sharedRuntimeTarget ? `SHARED (${sharedRuntimeTarget.label})` : "DEDICATED"}</p>
          <p><span className="text-zinc-400">Binding:</span> OK</p>
        </div>
      ) : provisionResult?.success ? (
        <div className="space-y-2 text-sm">
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">
            Provisioning: <span className="font-semibold">PROVISIONED</span>
          </div>
          <p><span className="text-zinc-400">Tenant ID:</span> <span className="font-mono">{provisionResult.tenantId}</span></p>
          <p><span className="text-zinc-400">Location creada:</span> <span className="font-mono">{provisionResult.locationId}</span></p>
          <p><span className="text-zinc-400">Admin creado:</span> <span className="font-mono">{provisionResult.adminUserId}</span></p>
          <p><span className="text-zinc-400">Gym extension:</span> {provisionResult.gymId ? provisionResult.gymId : "No aplica"}</p>
          <p><span className="text-zinc-400">Binding:</span> OK</p>
        </div>
      ) : !runtimeReady ? (
        /* ── Paso 1: elegir Shared Runtime ── */
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Esta organización no tiene un runtime asignado. Selecciona un Shared Runtime registrado
            (o asigna un perfil Dedicated desde Database Profiles).
          </p>
          {assignError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{assignError}</div>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Shared Runtime</label>
              <select value={selectedTargetId} onChange={(e) => setSelectedTargetId(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">— Seleccionar —</option>
                {activeSharedTargets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label} ({t.environment})</option>
                ))}
              </select>
            </div>
            <button type="button" disabled={!selectedTargetId || isPending} onClick={handleAssign}
              className="h-9 px-4 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              Asignar
            </button>
          </div>
        </div>
      ) : (
        /* ── Paso 2: formulario de provisioning ── */
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Runtime asignado: <span className="font-semibold">{sharedRuntimeTarget ? `Shared — ${sharedRuntimeTarget.label}` : "Dedicated"}</span>
          </p>

          {showRetry && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 space-y-1">
              <p className="font-semibold">Falló — Reintentar</p>
              <p>{provisionError ?? provisioningOperation?.lastError ?? "El intento anterior no terminó. Reintentar es seguro: no se duplicará el tenant."}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Modo</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "COMMERCE_ONLY"} onChange={() => setMode("COMMERCE_ONLY")} />
                Commerce-only
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "GYM"} onChange={() => setMode("GYM")} />
                Gym
              </label>
            </div>
            {mode === "COMMERCE_ONLY" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                Commerce-only no creará una entidad Gym.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Nombre del tenant</label>
              <input className={inputCls} value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Slug del tenant</label>
              <input className={inputCls} value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="cliente-demo" />
            </div>

            {mode === "GYM" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1">Nombre del gym</label>
                  <input className={inputCls} value={gymName} onChange={(e) => setGymName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1">Slug del gym</label>
                  <input className={inputCls} value={gymSlug} onChange={(e) => setGymSlug(e.target.value)} placeholder="gym-demo" />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Location inicial</label>
              <input className={inputCls} value={locationName} onChange={(e) => setLocationName(e.target.value)} />
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Email admin</label>
              <input className={inputCls} type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Password inicial</label>
              <input className={inputCls} type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Nombre</label>
              <input className={inputCls} value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Apellido</label>
              <input className={inputCls} value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            Confirmo los datos de Organization / Runtime / Tenant / Location / Admin / Domain / Modo anteriores.
          </label>

          <div className="flex justify-end">
            <button type="button" disabled={!canSubmit || isPending} onClick={handleProvision}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? "Provisionando…" : showRetry ? "Reintentar provisioning" : "Provisionar cliente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
