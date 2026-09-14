import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { NavBar } from "@/components/ui/nav-bar";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { canAccessPlatformAdmin } from "@/core/permissions/platform-access";
import { isAuthScope } from "@/core/auth/types";
import { getLocationOptions } from "@/core/modules/locations/queries";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { LocationSwitcher } from "@/core/components/ui/location-switcher";
import { SidebarProvider } from "@/components/ui/sidebar-context";
import { SidebarToggle } from "@/components/ui/sidebar-toggle";
import { DashboardSidebar } from "@/components/ui/dashboard-sidebar";
import { RuntimeSessionBanner } from "@/modules/platform/components/runtime-session-banner";
import type { SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { MODULE_GROUPS } from "@/lib/navigation/dashboard-nav";
import { resolveEffectiveDashboardContext } from "@/modules/platform/runtime/resolve-effective-dashboard-context";

const ALL_NAV_MODULE_CODES = MODULE_GROUPS.flatMap((g) =>
  g.items.map((i) => i.moduleCode).filter((c): c is string => Boolean(c)),
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;
  const initials = user.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  // PASO 6F — contexto de navegación EFECTIVO: si hay una sesión runtime
  // "Operar como cliente" activa, todo lo que sigue (módulos habilitados,
  // vertical, nombre de organización, locations) se resuelve contra el
  // tenant del perfil runtime — NUNCA contra user.tenant_id directo.
  const { context: dashCtx, dispose } = await resolveEffectiveDashboardContext(
    user as SessionUser,
    ALL_NAV_MODULE_CODES,
  );

  try {
    // ── Contexto de location para usuarios globales ───────────────
    // Solo se ejecuta si el usuario tiene scopeType "global" (super_admin)
    // Y NO hay sesión runtime activa. Aún no existe persistencia segura de
    // una "location runtime" separada de la cookie normal — mostrar el
    // selector durante runtime arriesgaría resolver/mostrar sucursales del
    // tenant REAL del super_admin mientras se opera otro cliente. Se
    // prefiere ocultar el switcher (seguridad antes que funcionalidad; ver
    // docs de esta fase) — el banner de runtime ya informa qué
    // organización está activa.
    const caps = getCapabilities(user.role as string);
    const isGlobalUser = caps.isGlobal;

    let locationSwitcherData: {
      locations: { id: string; name: string }[];
      activeLocationId: string | null;
    } | null = null;

    if (isGlobalUser && !dashCtx.isRuntime && user.tenant_id) {
      const [locations, activeLocationId] = await Promise.all([
        getLocationOptions(user.tenant_id),
        getEffectiveLocationId(user as SessionUser & { role: UserRole }),
      ]);
      locationSwitcherData = { locations, activeLocationId };
    }

    // PASO 6F — branding runtime-aware: "GYM" solo si la vertical efectiva
    // es GYM. En cualquier otro caso (Commerce-only, sin vertical, u otra
    // vertical) se muestra una marca neutral en vez de asumir gimnasio.
    const brandLabel = dashCtx.verticalCode === "GYM" ? "GYM" : "ZOLVI";

    return (
      <SidebarProvider>
        <div className="h-screen flex flex-col bg-zinc-50">
          {/* Banner de sesión runtime "Operar como cliente" (PASO 6A) */}
          <RuntimeSessionBanner />

          {/* Top bar compartida */}
          <header className="bg-zinc-900 text-white px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sticky top-0 z-30 shrink-0">
            {/* Logo + sidebar toggle + nav */}
            <div className="flex items-center gap-2 min-w-0">
              <SidebarToggle />
              <span className="font-black text-base tracking-widest uppercase shrink-0">{brandLabel}</span>
              <NavBar role={user.role} />
            </div>

            {/* Centro: LocationSwitcher para usuarios globales (solo modo normal) */}
            {locationSwitcherData && (
              <div className="flex-1 flex justify-center">
                <LocationSwitcher
                  locations={locationSwitcherData.locations}
                  activeLocationId={locationSwitcherData.activeLocationId}
                />
              </div>
            )}

            {/* Usuario + logout */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {initials}
                </div>
                <span className="text-xs text-zinc-400 max-w-[140px] truncate">{user.name}</span>
              </div>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="text-xs text-zinc-400 hover:text-white transition-colors px-2.5 py-1.5 rounded hover:bg-zinc-800 ml-1"
                >
                  Salir
                </button>
              </form>
            </div>
          </header>

          {/* Cuerpo: sidebar + contenido */}
          <div className="flex flex-1 min-h-0">
            <DashboardSidebar
              role={user.role}
              enabledModuleCodes={[...dashCtx.enabledModuleCodes]}
              effectiveVerticalCode={dashCtx.verticalCode}
              isLegacyUnmanaged={dashCtx.isLegacyUnmanaged}
              canAccessPlatformAdmin={canAccessPlatformAdmin({
                role: user.role,
                auth_scope: isAuthScope(user.auth_scope) ? user.auth_scope : undefined,
              })}
            />
            <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-8">
              <div className="w-full max-w-[1800px] mx-auto">{children}</div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  } finally {
    await dispose();
  }
}
