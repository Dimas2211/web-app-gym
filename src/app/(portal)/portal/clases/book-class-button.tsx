"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bookClassAction, cancelBookingAction } from "@/modules/client-portal/actions";

type Props = {
  classId: string;
  /**
   * GYM-BOOKINGS 2B: claves de orden generadas por el servidor, una por
   * intento lógico. Un reenvío del mismo formulario (reintento) reutiliza la
   * misma clave; router.refresh() entrega claves nuevas para la siguiente
   * operación.
   */
  bookKey: string;
  cancelKey: string;
  bookingId?: string | null;
  /** GYM-BOOKINGS 3B: el servidor ya evaluó si ofrecer cada acción (evaluatePortalSession). */
  canBook: boolean;
  canCancel: boolean;
  isReactivation?: boolean;
  cancelWarning?: string | null;
};

export function BookClassButton({
  classId,
  bookKey,
  cancelKey,
  bookingId,
  canBook,
  canCancel,
  isReactivation = false,
  cancelWarning = null,
}: Props) {
  const router = useRouter();
  const [bookState, bookAction, bookPending] = useActionState(bookClassAction, undefined);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelBookingAction, undefined);
  const [confirming, setConfirming] = useState(false);

  // Éxito o rechazo: recargar el calendario para mostrar el estado real
  // (p. ej. otro alumno tomó el último cupo → "Completo").
  useEffect(() => {
    if (bookState) router.refresh();
  }, [bookState, router]);

  useEffect(() => {
    if (cancelState) {
      setConfirming(false);
      router.refresh();
    }
  }, [cancelState, router]);

  const error =
    (bookState && "error" in bookState && bookState.error) || (cancelState && "error" in cancelState && cancelState.error) || null;

  return (
    <div className="text-right">
      {canCancel && bookingId ? (
        confirming ? (
          <form action={cancelAction} className="space-y-1.5">
            <input type="hidden" name="idempotency_key" value={cancelKey} />
            <input type="hidden" name="booking_id" value={bookingId} />
            <p className="text-xs text-zinc-600">¿Cancelar esta reserva?</p>
            {cancelWarning && <p className="text-xs text-amber-700 max-w-[200px] ml-auto">{cancelWarning}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={cancelPending}
                className="text-xs text-zinc-500 hover:text-zinc-800 px-2 py-1 disabled:opacity-50"
              >
                No
              </button>
              <button
                type="submit"
                disabled={cancelPending}
                className="text-xs bg-red-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {cancelPending ? "Cancelando..." : "Sí, cancelar"}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Cancelar reserva
          </button>
        )
      ) : canBook ? (
        <form action={bookAction}>
          <input type="hidden" name="idempotency_key" value={bookKey} />
          <input type="hidden" name="class_id" value={classId} />
          <button
            type="submit"
            disabled={bookPending}
            className="text-xs bg-zinc-900 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {bookPending ? "Reservando..." : isReactivation ? "Reservar de nuevo" : "Reservar"}
          </button>
        </form>
      ) : null}
      {bookState && "success" in bookState && <p className="text-xs text-emerald-600 font-medium mt-1">Reserva confirmada</p>}
      {cancelState && "success" in cancelState && <p className="text-xs text-zinc-500 mt-1">Reserva cancelada</p>}
      {error && <p className="text-xs text-red-600 mt-1 max-w-[200px] ml-auto">{error}</p>}
    </div>
  );
}
