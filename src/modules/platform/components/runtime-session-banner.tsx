// ─────────────────────────────────────────────────────────────────
// platform — runtime-session-banner.tsx
//
// PASO 6A — Banner global del dashboard cuando hay una sesión
// runtime "Operar como cliente" activa. Server Component: lee la
// sesión directamente (no expone nada sensible al cliente) y envía
// el botón "Salir" como <form action={exitClientRuntimeAction}>.
//
// Se monta en el layout del dashboard, arriba del contenido — visible
// en TODAS las páginas mientras la sesión runtime esté activa, no
// solo en las 4 páginas ya adaptadas (products/customers/suppliers/
// inventory). Esto es intencional: el super_admin debe ver siempre
// que está "operando como cliente", incluso si navega a una página
// que todavía no es runtime-aware.
// ─────────────────────────────────────────────────────────────────

import { LogOut, ShieldAlert } from "lucide-react";
import { getRuntimeSession } from "../runtime/runtime-session";
import { exitClientRuntimeAction } from "../actions/exit-client-runtime.action";

export async function RuntimeSessionBanner() {
  const session = await getRuntimeSession();
  if (!session) return null;

  return (
    <div className="flex items-center gap-3 bg-amber-500 text-amber-950 px-4 sm:px-6 py-2 text-xs sm:text-sm font-medium sticky top-0 z-40">
      <ShieldAlert size={15} className="shrink-0" />
      <span className="truncate">
        Operando como <strong>{session.organizationName}</strong>
        {" "}— perfil <strong>{session.profileLabel}</strong> — modo solo lectura
      </span>
      <form action={exitClientRuntimeAction} className="ml-auto shrink-0">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 bg-amber-950/10 hover:bg-amber-950/20
                     text-amber-950 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <LogOut size={12} />
          Salir del modo cliente
        </button>
      </form>
    </div>
  );
}
