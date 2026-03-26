"use client";

import { useActionState } from "react";
import { bookClassAction, cancelBookingAction } from "@/modules/client-portal/actions";

type Props = {
  classId: string;
  bookingId?: string;
  isConfirmed: boolean;
  isFull: boolean;
};

export function BookClassButton({ classId, bookingId, isConfirmed, isFull }: Props) {
  const [bookState, bookAction, bookPending] = useActionState(bookClassAction, undefined);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelBookingAction, undefined);

  if (isConfirmed && bookingId) {
    return (
      <div className="text-right">
        {"success" in (cancelState ?? {}) ? (
          <span className="text-xs text-zinc-400">Cancelada</span>
        ) : (
          <form action={cancelAction}>
            <input type="hidden" name="booking_id" value={bookingId} />
            <button
              type="submit"
              disabled={cancelPending}
              className="text-xs text-red-600 hover:text-red-800 underline disabled:opacity-50"
            >
              {cancelPending ? "Cancelando..." : "Cancelar reserva"}
            </button>
          </form>
        )}
        {"error" in (cancelState ?? {}) && (
          <p className="text-xs text-red-600 mt-1 max-w-[140px]">
            {(cancelState as { error: string }).error}
          </p>
        )}
      </div>
    );
  }

  if (isFull) {
    return (
      <span className="text-xs bg-zinc-100 text-zinc-400 font-medium px-2.5 py-1 rounded-full">
        Sin cupo
      </span>
    );
  }

  return (
    <div className="text-right">
      {"success" in (bookState ?? {}) ? (
        <span className="text-xs text-emerald-600 font-medium">Reservada</span>
      ) : (
        <form action={bookAction}>
          <input type="hidden" name="class_id" value={classId} />
          <button
            type="submit"
            disabled={bookPending}
            className="text-xs bg-zinc-900 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {bookPending ? "Reservando..." : "Reservar"}
          </button>
        </form>
      )}
      {"error" in (bookState ?? {}) && (
        <p className="text-xs text-red-600 mt-1 max-w-[140px]">
          {(bookState as { error: string }).error}
        </p>
      )}
    </div>
  );
}
