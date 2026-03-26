"use client";

import { useRef } from "react";
import { deleteTemplateDayAction } from "@/modules/weekly-plans/actions";

type Props = {
  dayId: string;
  templateId: string;
};

/**
 * Botón de eliminación de un día de plantilla.
 * Se extrae en Client Component porque necesita el confirm() interactivo.
 * Usa requestSubmit() para disparar correctamente el Server Action del form.
 */
export function DeleteDayButton({ dayId, templateId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={deleteTemplateDayAction}>
      <input type="hidden" name="id" value={dayId} />
      <input type="hidden" name="template_id" value={templateId} />
      <button
        type="button"
        onClick={() => {
          if (confirm("¿Eliminar este día de la plantilla?")) {
            formRef.current?.requestSubmit();
          }
        }}
        className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50"
      >
        Eliminar
      </button>
    </form>
  );
}
