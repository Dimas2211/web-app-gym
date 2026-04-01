import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getGymSettings } from "@/modules/settings/queries";
import { GymSettingsForm } from "@/components/forms/gym-settings-form";
import { updateGymSettingsAction } from "@/modules/settings/actions";
import { suggestNextStaffCode, suggestNextClientCode } from "@/lib/utils/operational-codes";

export default async function CodesSettingsPage() {
  const user = await requireSuperAdmin();

  const [settings, nextStaff, nextClient] = await Promise.all([
    getGymSettings(user.gym_id),
    suggestNextStaffCode(user.gym_id),
    suggestNextClientCode(user.gym_id),
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
}
