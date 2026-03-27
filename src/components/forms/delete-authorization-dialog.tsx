"use client";

import { useActionState, useState } from "react";
import { canDeleteDirectly } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import type { DeleteAuthActionState } from "@/lib/permissions/delete-authorization";

export type { DeleteAuthActionState };

type Props = {
  /** Nombre legible de la entidad a eliminar, p.ej. "este día de la plantilla" */
  entityLabel: string;
  /** Rol del usuario de sesión actual */
  userRole: UserRole;
  /** Campos ocultos que identifican el registro (id, template_id, etc.) */
  hiddenFields: Record<string, string>;
  /**
   * Server action que recibe el estado previo + FormData.
   * Debe retornar { error?: string } | undefined.
   * Puede usar redirect() internamente para navegar al éxito.
   */
  action: (
    prev: DeleteAuthActionState,
    formData: FormData
  ) => Promise<DeleteAuthActionState>;
  /** Etiqueta del botón disparador. Por defecto: "Eliminar" */
  triggerLabel?: string;
};

const CONFIRMATION_WORD = "ELIMINAR";

export function DeleteAuthorizationDialog({
  entityLabel,
  userRole,
  hiddenFields,
  action,
  triggerLabel = "Eliminar",
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [state, formAction, isPending] = useActionState(action, undefined);

  const isAdmin = canDeleteDirectly(userRole);

  function handleOpen() {
    setOpen(true);
    setConfirmText("");
  }

  function handleClose() {
    setOpen(false);
    setConfirmText("");
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50"
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-zinc-900 mb-1">
              Eliminar {entityLabel}
            </h2>

            {isAdmin ? (
              /* ── Caso 1: Admin con permiso directo ─────────────────────────
                 Requiere escribir la palabra de confirmación exacta.
                 No es un simple "Aceptar": el usuario debe escribir "ELIMINAR". */
              <>
                <p className="text-sm text-zinc-500 mb-4">
                  Esta acción es <strong className="text-zinc-700">irreversible</strong>.
                  Para confirmar, escribe{" "}
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-1 rounded">
                    {CONFIRMATION_WORD}
                  </span>{" "}
                  en el campo de abajo.
                </p>

                <form action={formAction}>
                  {Object.entries(hiddenFields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input
                    type="hidden"
                    name="confirmation_word"
                    value={confirmText}
                  />

                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) =>
                      setConfirmText(e.target.value.toUpperCase())
                    }
                    placeholder={CONFIRMATION_WORD}
                    autoComplete="off"
                    autoFocus
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />

                  {state?.error && (
                    <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {state.error}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={confirmText !== CONFIRMATION_WORD || isPending}
                      className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending ? "Eliminando…" : "Confirmar eliminación"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* ── Caso 2: Usuario sin permiso directo ───────────────────────
                 Requiere credenciales reales de un super_admin o branch_admin
                 activo del mismo gimnasio. No es una confirmación simple. */
              <>
                <p className="text-sm text-zinc-500 mb-1">
                  No tienes permiso para eliminar directamente.
                </p>
                <p className="text-sm text-zinc-500 mb-4">
                  Puedes solicitar{" "}
                  <strong className="text-zinc-700">
                    autorización administrativa excepcional
                  </strong>{" "}
                  ingresando las credenciales de un administrador activo del
                  gimnasio.
                </p>

                <form action={formAction} className="space-y-3">
                  {Object.entries(hiddenFields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Correo del administrador
                    </label>
                    <input
                      type="email"
                      name="admin_email"
                      required
                      autoComplete="off"
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Contraseña del administrador
                    </label>
                    <input
                      type="password"
                      name="admin_password"
                      required
                      autoComplete="new-password"
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>

                  {state?.error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {state.error}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending ? "Verificando…" : "Autorizar y eliminar"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
