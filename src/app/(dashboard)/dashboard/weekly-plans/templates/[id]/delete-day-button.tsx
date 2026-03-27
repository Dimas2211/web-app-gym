"use client";

import { DeleteAuthorizationDialog } from "@/components/forms/delete-authorization-dialog";
import { deleteTemplateDayAction } from "@/modules/weekly-plans/actions";
import type { UserRole } from "@prisma/client";

type Props = {
  dayId: string;
  templateId: string;
  userRole: UserRole;
};

export function DeleteDayButton({ dayId, templateId, userRole }: Props) {
  return (
    <DeleteAuthorizationDialog
      entityLabel="este día de la plantilla"
      userRole={userRole}
      hiddenFields={{ id: dayId, template_id: templateId }}
      action={deleteTemplateDayAction}
      triggerLabel="Eliminar"
    />
  );
}
