"use client";

import { useRef } from "react";

type Props = {
  id: string;
  date: string;
  view?: string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteClassButton({ id, date, view, action }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  function handleClick() {
    const ok = window.confirm(
      "¿Eliminar esta clase?\n\nEsta acción quitará la clase de la agenda definitivamente. Solo disponible si no tiene reservas ni asistencia registrada."
    );
    if (ok) formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="date" value={date} />
      {view && <input type="hidden" name="view" value={view} />}
      <button
        type="button"
        onClick={handleClick}
        className="w-full text-xs px-2.5 py-1 rounded border text-red-800 border-red-300 hover:bg-red-50 transition-colors"
      >
        Eliminar
      </button>
    </form>
  );
}
