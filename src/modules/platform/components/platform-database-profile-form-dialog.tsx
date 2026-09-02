"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-profile-form-dialog.tsx
//
// Dialog unificado para crear y editar PlatformDatabaseProfile.
//
// Reglas de seguridad:
// - El campo password NUNCA tiene defaultValue ni muestra valor actual.
// - En edición, password es opcional: vacío = conservar el existente.
// - Nunca se renderiza encrypted_password.
// - No hay placeholder con valores reales de credenciales.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { createDatabaseProfileAction } from "../actions/create-database-profile.action";
import { updateDatabaseProfileAction } from "../actions/update-database-profile.action";
import type { PlatformDatabaseProfileItem } from "../types/platform.types";

interface OrgOption {
  id:   string;
  code: string;
  name: string;
}

interface Props {
  profile:       PlatformDatabaseProfileItem | null;
  organizations: OrgOption[];
  onClose:       () => void;
}

const ENVIRONMENTS = ["LOCAL", "SANDBOX", "TEST", "STAGING", "PRODUCTION"] as const;
const PROVIDERS    = ["POSTGRESQL", "SUPABASE", "NEON", "RENDER", "LOCAL_POSTGRES", "OTHER"] as const;
const SSL_MODES    = ["DISABLE", "PREFER", "REQUIRE"] as const;

export function PlatformDatabaseProfileFormDialog({ profile, organizations, onClose }: Props) {
  const isEdit = profile !== null;

  // Si es edición, bind del action con el profileId como primer argumento
  const action = isEdit
    ? updateDatabaseProfileAction.bind(null, profile.id)
    : createDatabaseProfileAction;

  const [state, formAction, isPending] = useActionState(action, undefined);

  // Cerrar automáticamente en éxito (state sin errors y ya no está pending)
  const hasSubmittedRef = useRef(false);
  useEffect(() => {
    if (!hasSubmittedRef.current) return;
    if (isPending) return;
    if (!state?.errors && !state?.error) {
      onClose();
    } else {
      // Permitir re-submit si hubo error
      hasSubmittedRef.current = false;
    }
  // Solo isPending como dep — queremos detectar la transición a false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">
            {isEdit ? `Editar perfil — ${profile.label}` : "Nuevo perfil de base de datos"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form
          action={formAction}
          onSubmit={() => { hasSubmittedRef.current = true; }}
          className="p-5 space-y-4"
        >

          {/* Error global */}
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">

            <div className="col-span-2 pt-1">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                Conexión runtime / app
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Usada por la aplicación y el Runtime Database Router para todo el tráfico normal.
              </p>
            </div>

            {/* Organización — solo en creación */}
            {!isEdit ? (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-zinc-600 mb-1">
                  Organización <span className="text-red-500">*</span>
                </label>
                <select
                  name="organization_id"
                  defaultValue=""
                  className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
                >
                  <option value="" disabled>— Seleccionar organización —</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} — {o.name}
                    </option>
                  ))}
                </select>
                {state?.errors?.organization_id && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.organization_id[0]}</p>
                )}
              </div>
            ) : (
              /* En edición, org es readonly — no se puede cambiar */
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-zinc-600 mb-1">
                  Organización
                </label>
                <p className="h-9 flex items-center px-3 text-sm text-zinc-500 bg-zinc-50
                               border border-zinc-200 rounded-lg">
                  {profile.organization.code} — {profile.organization.name}
                </p>
              </div>
            )}

            {/* Nombre del perfil */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Nombre del perfil <span className="text-red-500">*</span>
              </label>
              <input
                name="label"
                type="text"
                defaultValue={profile?.label ?? ""}
                placeholder="produccion-principal"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.label && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.label[0]}</p>
              )}
            </div>

            {/* Ambiente */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Ambiente <span className="text-red-500">*</span>
              </label>
              <select
                name="environment"
                defaultValue={profile?.environment ?? "LOCAL"}
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                {ENVIRONMENTS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              {state?.errors?.environment && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.environment[0]}</p>
              )}
            </div>

            {/* Proveedor */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Proveedor</label>
              <select
                name="provider"
                defaultValue={profile?.provider ?? "POSTGRESQL"}
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* SSL Mode */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Modo SSL</label>
              <select
                name="ssl_mode"
                defaultValue={profile?.ssl_mode ?? "PREFER"}
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                {SSL_MODES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Host */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Host <span className="text-red-500">*</span>
              </label>
              <input
                name="db_host"
                type="text"
                defaultValue={profile?.db_host ?? ""}
                placeholder="localhost"
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.db_host && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.db_host[0]}</p>
              )}
            </div>

            {/* Puerto */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Puerto</label>
              <input
                name="db_port"
                type="number"
                defaultValue={profile?.db_port ?? 5432}
                min={1}
                max={65535}
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.db_port && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.db_port[0]}</p>
              )}
            </div>

            {/* Nombre de la base */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Base de datos <span className="text-red-500">*</span>
              </label>
              <input
                name="db_name"
                type="text"
                defaultValue={profile?.db_name ?? ""}
                placeholder="nombre_bd"
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.db_name && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.db_name[0]}</p>
              )}
            </div>

            {/* Usuario */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Usuario <span className="text-red-500">*</span>
              </label>
              <input
                name="db_user"
                type="text"
                defaultValue={profile?.db_user ?? ""}
                placeholder="postgres"
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.db_user && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.db_user[0]}</p>
              )}
            </div>

            {/* Password — NUNCA muestra el valor actual */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Password
                {!isEdit && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={
                  isEdit
                    ? "Dejar vacío para conservar la contraseña actual"
                    : "Contraseña de la base de datos"
                }
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {isEdit && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  Solo completa este campo si deseas reemplazar la contraseña almacenada.
                </p>
              )}
              {state?.errors?.password && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.password[0]}</p>
              )}
            </div>

            {/* ── Conexión directa opcional para migraciones ─────────────── */}
            <div className="col-span-2 pt-3 border-t border-zinc-100">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                Conexión directa para migraciones (opcional)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Usada SOLO por el runner RUN_MIGRATIONS (`prisma migrate status`/`migrate deploy`) — nunca
                por la app en tráfico normal. Necesaria cuando la conexión de arriba es un connection
                pooler en modo transacción (ej. Supabase puerto 6543), que no soporta migraciones. Deja
                estos campos vacíos si no aplica.
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Host directo</label>
              <input
                name="direct_db_host"
                type="text"
                defaultValue={profile?.direct_db_host ?? ""}
                placeholder="db.xxxx.supabase.co"
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.direct_db_host && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.direct_db_host[0]}</p>
              )}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Puerto directo</label>
              <input
                name="direct_db_port"
                type="number"
                defaultValue={profile?.direct_db_port ?? 5432}
                min={1}
                max={65535}
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Base de datos directa</label>
              <input
                name="direct_db_name"
                type="text"
                defaultValue={profile?.direct_db_name ?? ""}
                placeholder="postgres"
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Usuario directo</label>
              <input
                name="direct_db_user"
                type="text"
                defaultValue={profile?.direct_db_user ?? ""}
                placeholder="postgres"
                className="w-full h-9 px-3 text-sm font-mono border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Modo SSL directo</label>
              <select
                name="direct_ssl_mode"
                defaultValue={profile?.direct_ssl_mode ?? "PREFER"}
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                {SSL_MODES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Password directo</label>
              <input
                name="direct_password"
                type="password"
                autoComplete="new-password"
                placeholder={
                  profile?.direct_db_host
                    ? "Dejar vacío para conservar el password directo actual"
                    : "Password de la conexión directa"
                }
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg
                         hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg
                         hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {isPending
                ? (isEdit ? "Guardando…" : "Creando…")
                : (isEdit ? "Guardar cambios" : "Crear perfil")
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
