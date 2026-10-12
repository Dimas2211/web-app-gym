"use client";

import { useActionState, useState } from "react";
import {
  updateClientPortalEmailAction,
  resetClientPortalPasswordAction,
  type ClientPortalCredentialActionState,
} from "@/modules/clients/actions";

// Gestión de credenciales del portal (User role=client) desde la ficha del
// cliente. Solo recibe id del Client y correo de acceso actual — nunca
// password_hash. No cambia el estado del portal (activar/desactivar).

interface Props {
  clientId: string;
  currentEmail: string;
}

const inputClass =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent";

const triggerClass =
  "text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors";

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
      >
        <h2 className="text-base font-semibold text-zinc-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function FormFeedback({ state }: { state: ClientPortalCredentialActionState }) {
  if (state?.error) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {state.error}
      </p>
    );
  }
  return null;
}

function ChangeEmailDialog({ clientId, currentEmail, onClose }: Props & { onClose: () => void }) {
  const [state, action, isPending] = useActionState<ClientPortalCredentialActionState, FormData>(
    updateClientPortalEmailAction,
    undefined
  );

  if (state?.success) {
    return (
      <Modal title="Cambiar correo de acceso" onClose={onClose}>
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {state.success}
        </p>
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Cambiar correo de acceso" onClose={onClose}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="client_id" value={clientId} />
        <FormFeedback state={state} />

        <div>
          <p className="text-xs text-zinc-400">Correo actual</p>
          <p className="text-sm text-zinc-800 font-medium mt-0.5 break-all">{currentEmail}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            Nuevo correo de acceso
          </label>
          <input
            type="email"
            name="portal_email"
            placeholder="correo@ejemplo.com"
            autoComplete="off"
            className={inputClass}
            required
          />
          {state?.errors?.portal_email && (
            <p className="text-xs text-red-500 mt-1">{state.errors.portal_email[0]}</p>
          )}
          <p className="text-xs text-zinc-400 mt-1">
            Solo cambia la credencial del portal. El correo de contacto del expediente no se modifica.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar correo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [state, action, isPending] = useActionState<ClientPortalCredentialActionState, FormData>(
    resetClientPortalPasswordAction,
    undefined
  );
  // Tras éxito el formulario se desmonta: las contraseñas no quedan en el DOM.
  if (state?.success) {
    return (
      <Modal title="Cambiar contraseña del portal" onClose={onClose}>
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {state.success}
        </p>
        <p className="text-xs text-zinc-400 mt-2">
          La nueva contraseña se utilizará en el próximo inicio de sesión.
        </p>
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Cambiar contraseña del portal" onClose={onClose}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="client_id" value={clientId} />
        <FormFeedback state={state} />

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            Nueva contraseña{" "}
            <span className="text-zinc-400 font-normal">(8 a 72 caracteres)</span>
          </label>
          <input
            type="password"
            name="new_password"
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputClass}
            required
          />
          {state?.errors?.new_password && (
            <p className="text-xs text-red-500 mt-1">{state.errors.new_password[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            Confirmar nueva contraseña
          </label>
          <input
            type="password"
            name="confirm_password"
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputClass}
            required
          />
          {state?.errors?.confirm_password && (
            <p className="text-xs text-red-500 mt-1">{state.errors.confirm_password[0]}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar contraseña"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ManageClientPortalAccess({ clientId, currentEmail }: Props) {
  const [open, setOpen] = useState<"email" | "password" | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen("email")} className={triggerClass}>
          Cambiar correo
        </button>
        <button type="button" onClick={() => setOpen("password")} className={triggerClass}>
          Cambiar contraseña
        </button>
      </div>

      {/* Montaje condicional: cada apertura arranca con estado y campos limpios. */}
      {open === "email" && (
        <ChangeEmailDialog clientId={clientId} currentEmail={currentEmail} onClose={close} />
      )}
      {open === "password" && <ResetPasswordDialog clientId={clientId} onClose={close} />}
    </>
  );
}
