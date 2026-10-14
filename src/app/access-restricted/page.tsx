// ─────────────────────────────────────────────────────────────────
// /access-restricted — RUNTIME LICENSE ENFORCEMENT
//
// Experiencia controlada (fuera de dashboard/portal) para una identidad
// RUNTIME_CLIENT cuya organización está bloqueada por la política
// central de acceso. El motivo se recalcula EN VIVO aquí (nunca se toma
// de la URL) y el mensaje no expone detalles internos.
//
// - Sin sesión → /login.
// - Identidad no RUNTIME_CLIENT (PLATFORM / Support Session) → su home:
//   este bloqueo nunca aplica a soporte.
// - RUNTIME_CLIENT con acceso restaurado → su home (sin re-login).
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { ZolviMark, ZOLVI_BRAND } from "@/components/ui/zolvi-logo";
import { resolveRuntimeOrganizationAccess } from "@/modules/platform/runtime/runtime-organization-access-gate";
import { getAccessRestrictedMessage } from "@/modules/platform/runtime/organization-access-policy";

export const metadata = { title: "Acceso restringido" };
export const dynamic = "force-dynamic";

export default async function AccessRestrictedPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;
  const home = user.role === "client" ? "/portal" : "/dashboard";

  if (user.auth_scope !== "RUNTIME_CLIENT" || !user.organization_id) redirect(home);

  const decision = await resolveRuntimeOrganizationAccess(user.organization_id);
  if (decision?.allowed) redirect(home);

  const message = decision
    ? getAccessRestrictedMessage(decision.reason)
    : getAccessRestrictedMessage("LICENSE_STATUS_INVALID");

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-canvas p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <ZolviMark size={44} priority />
        </div>
        <h1 className="text-lg font-bold text-zinc-800">Acceso restringido</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">{message}</p>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-navy-light"
          >
            Salir
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-400">{ZOLVI_BRAND.footer}</p>
      </div>
    </div>
  );
}
