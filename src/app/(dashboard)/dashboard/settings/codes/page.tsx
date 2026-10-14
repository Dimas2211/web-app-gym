import Link from "next/link";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requireGlobalAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getGymSettings } from "@/modules/settings/queries";
import { GymSettingsForm } from "@/components/forms/gym-settings-form";
import { updateGymSettingsAction } from "@/modules/settings/actions";
import { suggestNextStaffCode, suggestNextClientCode } from "@/lib/utils/operational-codes";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export default async function CodesSettingsPage() {
  // Configuración del TENANT (no Platform Admin) — mismo patrón que
  // Seguridad: requireGlobalAdmin() → requireOperationalContext() → rol
  // LIVE. La Server Action (updateGymSettingsAction) revalida lo mismo.
  const sessionUser = await requireGlobalAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser);
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return <div className="p-8 text-sm text-red-500">{err.userMessage}</div>;
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).isGlobal) {
      redirect("/dashboard");
    }

    // PASO 6E: Support Session (solo lectura) no edita la nomenclatura —
    // redirige ANTES de calcular sugerencias (comportamiento previo).
    if (context.readOnly) {
      redirect("/dashboard/settings");
    }

    const [settings, nextStaff, nextClient] = await Promise.all([
      getGymSettings(context.tenantId, context.client),
      suggestNextStaffCode(context.tenantId, context.client),
      suggestNextClientCode(context.tenantId, context.client),
    ]);

    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/settings" className="hover:text-zinc-800 transition-colors">
            Configuración
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Códigos operativos</span>
        </div>

        {/* Encabezado */}
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Códigos operativos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Define la nomenclatura de los códigos cortos visibles para personal y clientes.
            Los cambios afectan solo a nuevos registros; los códigos ya asignados no se alteran.
          </p>
        </div>

        {/* Previsualización del siguiente código */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-medium mb-1">
              Siguiente código de personal
            </p>
            <p className="text-2xl font-black text-zinc-700 font-mono">{nextStaff}</p>
            <p className="text-xs text-zinc-400 mt-1">Se asignará al próximo usuario creado</p>
          </div>
          <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-medium mb-1">
              Siguiente código de cliente
            </p>
            <p className="text-2xl font-black text-zinc-700 font-mono">{nextClient}</p>
            <p className="text-xs text-zinc-400 mt-1">Se asignará al próximo cliente creado</p>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-5">Configuración de nomenclatura</h2>
          <GymSettingsForm action={updateGymSettingsAction} defaultValues={settings} />
        </div>

        {/* Nota informativa */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>Nota:</strong> Cambiar el prefijo o número inicial no modifica los códigos ya
            asignados. Si cambias el prefijo del personal de &quot;A&quot; a &quot;S&quot;, los usuarios
            existentes con códigos &quot;A...&quot; los conservan. Solo los nuevos registros usarán
            la nueva nomenclatura.
          </p>
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
