// ─────────────────────────────────────────────────────────────────
// /dashboard/settings/security — page.tsx
//
// Seguridad / Autorización operativa. Administra la Clave de
// Supervisor tenant-level (Runtime DB efectiva). Solo informa si existe
// una clave configurada — nunca la muestra ni permite recuperarla.
// Support Session (read-only) ve el estado pero no puede modificarla
// (bloqueo también en la server action).
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { requireGlobalAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import {
  getSupervisorPinStatus,
  SUPERVISOR_PIN_MAX_LENGTH,
  SUPERVISOR_PIN_MIN_LENGTH,
} from "@/core/security/operational-authorization/supervisor-pin";
import { SupervisorPinSettingsForm } from "@/core/security/operational-authorization/components/supervisor-pin-settings-form";

export const metadata = { title: "Seguridad" };

const PROTECTED_OPERATIONS = [
  "Editar productos del catálogo",
  "Editar clientes del maestro de clientes",
  "Editar compras en borrador",
  "Eliminar compras en borrador",
  "Anular compras confirmadas",
  "Editar ventas en borrador",
  "Eliminar ventas en borrador",
];

export default async function SecuritySettingsPage() {
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

  let status;
  let isGlobal: boolean;
  try {
    isGlobal = getCapabilities(context.effectiveUser.role as UserRole).isGlobal;
    status = isGlobal ? await getSupervisorPinStatus(context.client, context.tenantId) : null;
  } finally {
    await dispose();
  }
  if (!isGlobal || !status) redirect("/dashboard");

  const updatedLabel = status.updatedAt ? status.updatedAt.toLocaleString("es-SV") : "—";

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
      >
        <ArrowLeft size={13} />
        Configuración
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-zinc-400" />
          <h1 className="text-xl font-bold text-zinc-800">Seguridad / Autorización operativa</h1>
        </div>
        <p className="text-sm text-zinc-500 mt-0.5">
          La clave de supervisor autoriza operaciones sensibles de esta organización.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-800">Clave de supervisor</h2>
          {status.configured ? (
            <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">
              Configurada
            </span>
          ) : (
            <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
              No configurada
            </span>
          )}
        </div>

        <p className="text-xs text-zinc-500 leading-relaxed">
          {status.configured
            ? `Última actualización: ${updatedLabel}. La clave actual no puede consultarse; para cambiarla o restablecerla introduce una nueva.`
            : "Mientras no se configure, las operaciones protegidas permanecen bloqueadas."}
        </p>

        {context.readOnly && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Sesión de soporte en modo solo lectura: la clave no puede modificarse.
          </p>
        )}

        <SupervisorPinSettingsForm
          configured={status.configured}
          readOnly={context.readOnly}
          minLength={SUPERVISOR_PIN_MIN_LENGTH}
          maxLength={SUPERVISOR_PIN_MAX_LENGTH}
        />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-zinc-800 mb-2">Operaciones protegidas</h2>
        <ul className="text-xs text-zinc-600 space-y-1 list-disc pl-4">
          {PROTECTED_OPERATIONS.map((op) => (
            <li key={op}>{op}</li>
          ))}
        </ul>
        <p className="text-xs text-zinc-400 mt-3">
          Cada autorización queda ligada al usuario que introdujo la clave y al registro concreto, y expira tras
          10 minutos sin uso (máximo 60 minutos). Cinco intentos fallidos bloquean la clave durante 5 minutos.
        </p>
      </div>
    </div>
  );
}
