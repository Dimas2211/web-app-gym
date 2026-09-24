"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-shared-runtime-target-form-dialog.tsx
//
// SHARED-PILOT-4C-B0 / B0.1. Dialog de creación y edición de
// PlatformSharedRuntimeTarget. Usa createSharedRuntimeTargetAction o
// updateSharedRuntimeTargetAction (cifrado server-side).
//
// Reglas de seguridad:
// - El campo password NUNCA tiene defaultValue ni muestra valor actual.
// - En edición, password vacío = conservar el existente.
// - Nunca se renderiza encrypted_password (el DTO no lo contiene).
// - No asigna organizaciones — eso se hace desde el detalle de la org.
// - Si el target tiene organizaciones asignadas, cambiar la conexión
//   pide confirmación explícita.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { X } from "lucide-react";
import { createSharedRuntimeTargetAction } from "../actions/create-shared-runtime-target.action";
import { updateSharedRuntimeTargetAction } from "../actions/update-shared-runtime-target.action";
import type { PlatformSharedRuntimeTargetItem } from "../queries/list-shared-runtime-targets";

interface Props {
  target:  PlatformSharedRuntimeTargetItem | null;
  onClose: () => void;
}

const ENVIRONMENTS = ["LOCAL", "SANDBOX", "TEST", "STAGING", "PRODUCTION"] as const;
const PROVIDERS    = ["POSTGRESQL", "SUPABASE", "NEON", "RENDER", "LOCAL_POSTGRES", "OTHER"] as const;
const SSL_MODES    = ["DISABLE", "PREFER", "REQUIRE"] as const;

const INPUT_CLS  = "w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900";
const SELECT_CLS = `${INPUT_CLS} bg-white text-zinc-700`;
const LABEL_CLS  = "block text-xs font-semibold text-zinc-600 mb-1";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-600 mt-0.5">{messages[0]}</p>;
}

/** true si el formulario cambia algún dato de conexión respecto al target actual. */
function connectionChanged(target: PlatformSharedRuntimeTargetItem, fd: FormData): boolean {
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const port = str("db_port");
  return (
    str("password") !== "" ||
    str("db_host")  !== target.db_host ||
    (port === "" ? null : Number(port)) !== target.db_port ||
    str("db_name")  !== target.db_name ||
    str("db_user")  !== target.db_user ||
    str("ssl_mode") !== target.ssl_mode
  );
}

export function PlatformSharedRuntimeTargetFormDialog({ target, onClose }: Props) {
  const isEdit = target !== null;

  const action = isEdit
    ? updateSharedRuntimeTargetAction.bind(null, target.id)
    : createSharedRuntimeTargetAction;

  const [state, formAction, isPending] = useActionState(action, undefined);

  // Cerrar automáticamente en éxito (state sin errors y ya no está pending)
  const hasSubmittedRef = useRef(false);
  useEffect(() => {
    if (!hasSubmittedRef.current) return;
    if (isPending) return;
    if (!state?.errors && !state?.error) {
      onClose();
    } else {
      hasSubmittedRef.current = false;
    }
  // Solo isPending como dep — queremos detectar la transición a false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // Cambios de conexión en un target compartido afectan a todas sus organizaciones
    if (
      isEdit &&
      target.organizationCount > 0 &&
      connectionChanged(target, new FormData(e.currentTarget)) &&
      !window.confirm(
        `"${target.label}" tiene ${target.organizationCount} organización(es) asignada(s). ` +
        "Cambiar la conexión afectará el runtime de todas ellas. ¿Guardar cambios?",
      )
    ) {
      e.preventDefault();
      return;
    }
    hasSubmittedRef.current = true;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <div>
            <h2 className="text-base font-bold text-zinc-800">
              {isEdit ? `Editar Shared Runtime — ${target.label}` : "Nuevo Shared Runtime"}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Base física compartida por múltiples organizaciones. Las credenciales se cifran en el servidor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form
          action={formAction}
          onSubmit={handleSubmit}
          className="p-5 space-y-4"
        >
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                name="label"
                type="text"
                defaultValue={target?.label ?? ""}
                placeholder="Zolvi Shared 01"
                className={INPUT_CLS}
              />
              <FieldError messages={state?.errors?.label} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>
                Ambiente <span className="text-red-500">*</span>
              </label>
              <select name="environment" defaultValue={target?.environment ?? "PRODUCTION"} className={SELECT_CLS}>
                {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <FieldError messages={state?.errors?.environment} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>Proveedor</label>
              <select name="provider" defaultValue={target?.provider ?? "POSTGRESQL"} className={SELECT_CLS}>
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <FieldError messages={state?.errors?.provider} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>Modo SSL</label>
              <select name="ssl_mode" defaultValue={target?.ssl_mode ?? "REQUIRE"} className={SELECT_CLS}>
                {SSL_MODES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <FieldError messages={state?.errors?.ssl_mode} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>
                Host <span className="text-red-500">*</span>
              </label>
              <input
                name="db_host"
                type="text"
                defaultValue={target?.db_host ?? ""}
                placeholder="db.example.com"
                className={`${INPUT_CLS} font-mono`}
              />
              <FieldError messages={state?.errors?.db_host} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>Puerto</label>
              <input
                name="db_port"
                type="number"
                defaultValue={target ? (target.db_port ?? "") : 5432}
                min={1}
                max={65535}
                className={`${INPUT_CLS} font-mono`}
              />
              <FieldError messages={state?.errors?.db_port} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>
                Base de datos <span className="text-red-500">*</span>
              </label>
              <input
                name="db_name"
                type="text"
                defaultValue={target?.db_name ?? ""}
                placeholder="nombre_bd"
                className={`${INPUT_CLS} font-mono`}
              />
              <FieldError messages={state?.errors?.db_name} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLS}>
                Usuario <span className="text-red-500">*</span>
              </label>
              <input
                name="db_user"
                type="text"
                defaultValue={target?.db_user ?? ""}
                placeholder="postgres"
                className={`${INPUT_CLS} font-mono`}
              />
              <FieldError messages={state?.errors?.db_user} />
            </div>

            {/* Password — sin defaultValue, nunca prellenado */}
            <div className="col-span-2">
              <label className={LABEL_CLS}>
                Password {!isEdit && <span className="text-red-500">*</span>}
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
                className={INPUT_CLS}
              />
              {isEdit && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  Solo completa este campo si deseas reemplazar la contraseña almacenada.
                </p>
              )}
              <FieldError messages={state?.errors?.password} />
            </div>
          </div>

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
                : (isEdit ? "Guardar cambios" : "Crear Shared Runtime")
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
