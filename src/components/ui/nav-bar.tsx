"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@prisma/client";

const NAV_LINKS = [
  {
    href: "/dashboard",
    label: "Inicio",
    roles: ["super_admin", "branch_admin", "reception", "trainer", "client"] as UserRole[],
  },
  {
    href: "/dashboard/branches",
    label: "Sucursales",
    roles: ["super_admin"] as UserRole[],
  },
  {
    href: "/dashboard/users",
    label: "Usuarios",
    roles: ["super_admin", "branch_admin"] as UserRole[],
  },
  {
    href: "/dashboard/clients",
    label: "Clientes",
    roles: ["super_admin", "branch_admin", "reception"] as UserRole[],
  },
  {
    href: "/dashboard/memberships/plans",
    label: "Planes",
    roles: ["super_admin", "branch_admin"] as UserRole[],
  },
  {
    href: "/dashboard/memberships/client-memberships",
    label: "Membresías",
    roles: ["super_admin", "branch_admin", "reception"] as UserRole[],
  },
  {
    href: "/dashboard/trainers",
    label: "Entrenadores",
    roles: ["super_admin", "branch_admin"] as UserRole[],
  },
  {
    href: "/dashboard/classes",
    label: "Clases",
    roles: ["super_admin", "branch_admin", "reception", "trainer"] as UserRole[],
  },
  {
    href: "/dashboard/weekly-plans/templates",
    label: "Plantillas",
    roles: ["super_admin", "branch_admin"] as UserRole[],
  },
  {
    href: "/dashboard/weekly-plans/client-plans",
    label: "Planes Sem.",
    roles: ["super_admin", "branch_admin", "reception", "trainer"] as UserRole[],
  },
];

type NavBarProps = {
  role: UserRole;
};

export function NavBar({ role }: NavBarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = NAV_LINKS.filter((l) => l.roles.includes(role));

  function linkClass(isActive: boolean) {
    return `text-sm px-3 py-1.5 rounded transition-colors ${
      isActive
        ? "bg-zinc-700 text-white font-medium"
        : "text-zinc-300 hover:text-white hover:bg-zinc-800"
    }`;
  }

  function isActive(href: string) {
    return href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-0.5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={linkClass(isActive(link.href))}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden p-2 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden fixed top-14 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800 shadow-lg">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`text-sm px-3 py-2.5 rounded transition-colors ${
                  isActive(link.href)
                    ? "bg-zinc-700 text-white font-medium"
                    : "text-zinc-300 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
