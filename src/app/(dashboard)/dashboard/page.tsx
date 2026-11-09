import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/utils/roles";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "@/lib/navigation/dashboard-nav";
import { resolveEffectiveDashboardContext } from "@/modules/platform/runtime/resolve-effective-dashboard-context";
import { canAccessPlatformAdmin } from "@/core/permissions/platform-access";
import { isAuthScope } from "@/core/auth/types";
import type { SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { ModuleIcon, moduleIconForHref, moduleDescriptionForHref } from "@/components/ui/module-icons";
import { DashboardWelcome } from "@/components/ui/dashboard-welcome";
import { getVisibleQuickActions } from "@/lib/navigation/dashboard-quick-actions";
import { buttonClasses } from "@/components/ui/button-styles";
import { getTodaySummary } from "./_lib/today-summary";

function credentialHref(role: UserRole): string {
  return role === "client" ? "/portal/credencial" : "/dashboard/credential";
}

const COMMERCIAL_ERROR_MESSAGES: Record<string, string> = {
  module_not_enabled: "Este módulo no está habilitado para tu organización.",
  capacity_limit_reached: "Alcanzaste el límite de tu plan.",
  vertical_not_enabled: "Esta sección no está disponible para tu organización.",
};

const ALL_NAV_MODULE_CODES = MODULE_GROUPS.flatMap((g) =>
  g.items.map((i) => i.moduleCode).filter((c): c is string => Boolean(c)),
);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ commercial_error?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  const params = await searchParams;
  const commercialErrorMessage = params?.commercial_error
    ? COMMERCIAL_ERROR_MESSAGES[params.commercial_error]
    : undefined;

  // PASO 6F — mismo contexto EFECTIVO que dashboard/layout.tsx (nunca
  // user.tenant_id directo cuando hay sesión runtime "Operar como
  // cliente"). Evita duplicar el filtrado entre sidebar y home dashboard.
  const { context: dashCtx, dispose } = await resolveEffectiveDashboardContext(
    user as SessionUser,
    ALL_NAV_MODULE_CODES,
  );

  const visibleGroups = filterModuleGroupsByAccess(
    MODULE_GROUPS,
    user.role,
    dashCtx.enabledModuleCodes,
    dashCtx.verticalCode,
    dashCtx.isLegacyUnmanaged,
    canAccessPlatformAdmin({
      role: user.role,
      auth_scope: isAuthScope(user.auth_scope) ? user.auth_scope : undefined,
    }),
  );
  await dispose();
  const quickActions = getVisibleQuickActions(visibleGroups);
  const todaySummary = await getTodaySummary(user as SessionUser, visibleGroups);

  return (
    <div className="space-y-6">
      {commercialErrorMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {commercialErrorMessage}
        </div>
      )}
      {/* Bienvenida + información de sesión plegable */}
      <DashboardWelcome
        firstName={user.name?.split(" ")[0] ?? ""}
        dateLabel={new Date().toLocaleDateString("es-SV", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        roleLabel={ROLE_LABELS[user.role]}
        roleClassName={ROLE_COLORS[user.role]}
        credentialHref={credentialHref(user.role)}
        email={user.email ?? ""}
        locationLabel={user.location_id ? "Asignada" : "— (global)"}
        userId={user.id}
      />

      {/* Acciones rápidas — solo las de módulos visibles para esta cuenta */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={buttonClasses(index === 0 ? "accent" : "outline")}
            >
              <ModuleIcon name={moduleIconForHref(action.requiresNavHref)} className="h-4 w-4" />
              {action.label}
            </Link>
          ))}
        </div>
      )}

      {/* Resumen de hoy — solo indicadores de módulos visibles para esta cuenta */}
      {todaySummary && todaySummary.stats.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-dark">Resumen de hoy</h2>
            <span className="text-sm text-dark/50">{todaySummary.scopeLabel}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {todaySummary.stats.map((stat, index) => (
              <Link
                key={stat.key}
                href={stat.href}
                className={`group rounded-2xl border border-dark/10 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  index % 2 === 0
                    ? "hover:border-primary/30 hover:bg-primary/5 hover:shadow-primary/10"
                    : "hover:border-secondary/40 hover:bg-secondary/5 hover:shadow-secondary/15"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      index % 2 === 0 ? "bg-primary/10 text-primary-dark" : "bg-secondary/10 text-secondary-dark"
                    }`}
                  >
                    <ModuleIcon name={moduleIconForHref(stat.href)} className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-semibold text-dark/55 uppercase tracking-wide">{stat.label}</p>
                </div>
                <p className="mt-3 font-display text-2xl font-bold text-dark">{stat.value}</p>
                <p className="mt-1 text-xs text-dark/55">{stat.hint}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Módulos por sección — tarjetas estilo getzolvi.com */}
      {visibleGroups.map((group, groupIndex) => (
        <section
          key={group.id}
          className={`rounded-3xl border p-5 sm:p-6 ${
            groupIndex % 2 === 0
              ? "border-secondary/20 bg-secondary/[0.07]"
              : "border-primary/15 bg-primary/[0.05]"
          }`}
        >
          <div className="mb-5 flex items-center gap-3">
            <span
              aria-hidden
              className={`h-6 w-1.5 rounded-full ${groupIndex % 2 === 0 ? "bg-secondary" : "bg-primary"}`}
            />
            <h2 className="font-display text-xl font-bold text-dark">{group.label}</h2>
            <span className="text-sm text-dark/50">
              {group.items.length} {group.items.length === 1 ? "módulo" : "módulos"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {group.items.map((m, index) => {
              const isPink = index % 2 === 0;
              const icon = (
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-300 ${
                    isPink
                      ? "bg-primary/10 text-primary-dark group-hover:bg-primary/20"
                      : "bg-secondary/10 text-secondary-dark group-hover:bg-secondary/20"
                  }`}
                >
                  <ModuleIcon name={moduleIconForHref(m.href)} className="h-5 w-5" />
                </span>
              );
              const description = moduleDescriptionForHref(m.href);

              return m.disabled ? (
                <div
                  key={m.href}
                  className="rounded-2xl border border-dashed border-dark/15 bg-white p-6 opacity-50 cursor-not-allowed"
                >
                  {icon}
                  <h3 className="mt-5 font-display text-lg font-bold text-dark">{m.label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-dark/65">Próximamente</p>
                </div>
              ) : (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`group rounded-2xl border border-dark/10 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    isPink
                      ? "hover:border-primary/30 hover:bg-primary/5 hover:shadow-primary/10"
                      : "hover:border-secondary/40 hover:bg-secondary/5 hover:shadow-secondary/15"
                  }`}
                >
                  {icon}
                  <h3 className="mt-5 font-display text-lg font-bold text-dark">{m.label}</h3>
                  {description && (
                    <p className="mt-2 text-sm leading-relaxed text-dark/65">{description}</p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
