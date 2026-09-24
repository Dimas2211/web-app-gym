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
import { ZolviLogo } from "@/components/ui/zolvi-logo";
import { RuntimeSessionBanner } from "@/modules/platform/components/runtime-session-banner";
import type { SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { MODULE_GROUPS } from "@/lib/navigation/dashboard-nav";
import { resolveEffectiveDashboardContext } from "@/modules/platform/runtime/resolve-effective-dashboard-context";

const ALL_NAV_MODULE_CODES = MODULE_GROUPS.flatMap((g) =>
  g.items.map((i) => i.moduleCode).filter((c): c is string => Boolean(c))
);

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    ALL_NAV_MODULE_CODES
  );

  try {
    // ── Contexto de location para usuarios globales ───────────────
    // Solo se ejecuta si el usuario tiene scopeType "global" (super_admin)
    // Y NO hay Support Session activa. Una identidad RUNTIME_CLIENT sí debe
    // poder elegir su location operativa: `dashCtx.client` y
    // `dashCtx.tenantId` apuntan a su propia base dedicada, por lo que tanto
    // la lista como la cookie se validan contra el tenant efectivo.
    const caps = getCapabilities(user.role as string);
    const isGlobalUser = caps.isGlobal;

    let locationSwitcherData: {
      locations: { id: string; name: string }[];
      activeLocationId: string | null;
    } | null = null;

    if (isGlobalUser && !dashCtx.isRuntime && dashCtx.tenantId) {
      const [locations, activeLocationId] = await Promise.all([
        getLocationOptions(dashCtx.tenantId, dashCtx.client),
        getEffectiveLocationId(
          user as SessionUser & { role: UserRole },
          dashCtx.client,
          dashCtx.tenantId
        ),
      ]);
      locationSwitcherData = { locations, activeLocationId };
    }

    return (
      <SidebarProvider>
        <div className="flex h-screen flex-col bg-brand-canvas">
          {/* Banner de sesión runtime "Operar como cliente" (PASO 6A) */}
          <RuntimeSessionBanner />

          {/* Top bar compartida */}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 bg-brand-navy px-4 text-white sm:px-6">
            {/* Branding global Zolvi (SHARED-PILOT-4B.2): franja de acento */}
            <div aria-hidden className="bg-brand-gradient absolute inset-x-0 bottom-0 h-0.5" />

            {/* Logo + sidebar toggle + nav */}
            <div className="flex min-w-0 items-center gap-2">
              <SidebarToggle />
              <ZolviLogo tone="onDark" className="mr-2" />
              <NavBar role={user.role} />
            </div>

            {/* Centro: LocationSwitcher para usuarios globales fuera de Support Session */}
            {locationSwitcherData && (
              <div className="flex flex-1 justify-center">
                <LocationSwitcher
                  locations={locationSwitcherData.locations}
                  activeLocationId={locationSwitcherData.activeLocationId}
                />
              </div>
            )}

            {/* Usuario + logout */}
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-brand-navy">
                  {initials}
                </div>
                <span className="max-w-[140px] truncate text-xs text-white/70">{user.name}</span>
              </div>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="ml-1 rounded-md px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Salir
                </button>
              </form>
            </div>
          </header>

          {/* Cuerpo: sidebar + contenido */}
          <div className="flex min-h-0 flex-1">
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
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
              <div className="mx-auto w-full max-w-[1800px]">{children}</div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  } finally {
    await dispose();
  }
}
