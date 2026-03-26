"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const PORTAL_LINKS = [
  { href: "/portal", label: "Inicio", exact: true },
  { href: "/portal/membresias", label: "Membresía", exact: false },
  { href: "/portal/clases", label: "Clases", exact: false },
  { href: "/portal/plan-semanal", label: "Mi Plan", exact: false },
  { href: "/portal/historial", label: "Historial", exact: false },
];

export function PortalNavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(link: { href: string; exact: boolean }) {
    return link.exact ? pathname === link.href : pathname.startsWith(link.href);
  }

  function linkClass(active: boolean) {
    return `text-sm px-3 py-1.5 rounded transition-colors ${
      active
        ? "bg-zinc-700 text-white font-medium"
        : "text-zinc-300 hover:text-white hover:bg-zinc-800"
    }`;
  }

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden sm:flex items-center gap-0.5">
        {PORTAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass(isActive(link))}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        className="sm:hidden p-2 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
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
        <div className="sm:hidden fixed top-14 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800 shadow-lg">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {PORTAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`text-sm px-3 py-2.5 rounded transition-colors ${
                  isActive(link)
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
