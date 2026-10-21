import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { enforceRuntimeOrganizationAccess } from "@/modules/platform/runtime/runtime-organization-access-gate";
import { PortalNavBar } from "@/components/ui/portal-nav-bar";
import { ZolviLogo } from "@/components/ui/zolvi-logo";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;

  // RUNTIME LICENSE ENFORCEMENT — RUNTIME_CLIENT con licencia bloqueada
  // se redirige limpiamente ANTES de resolver contexto runtime (que
  // fallaría cerrado). PLATFORM / Support Session no se ven afectados.
  await enforceRuntimeOrganizationAccess(user);

  const initials = user.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="min-h-screen bg-brand-canvas">
      <header className="bg-brand-navy text-white px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sticky top-0 z-10">
        {/* Branding global Zolvi (SHARED-PILOT-4B.2): franja de acento */}
        <div aria-hidden className="bg-brand-gradient absolute inset-x-0 bottom-0 h-0.5" />
        <div className="flex items-center gap-4 min-w-0">
          <ZolviLogo tone="onDark" />
          <PortalNavBar />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-brand-blue text-brand-navy flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <span className="text-xs text-white/70 max-w-[140px] truncate">{user.name}</span>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="text-xs text-white/70 hover:text-white transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/10 ml-1"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="w-full max-w-4xl lg:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
