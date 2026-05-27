"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TrainerActionState } from "@/modules/trainers/actions";

type Props = {
  slotId: string;
  trainerId: string;
  action: (prev: TrainerActionState, formData: FormData) => Promise<TrainerActionState>;
};

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-600 hover:text-red-800 px-2.5 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
    >
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}

export function RemoveAvailabilitySlotButton({ slotId, trainerId, action }: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="slot_id" value={slotId} />
        <input type="hidden" name="trainer_id" value={trainerId} />
        <DeleteButton />
      </form>
      {state?.error && (
        <p className="text-xs text-red-600 max-w-xs text-right">{state.error}</p>
      )}
    </div>
  );
}
