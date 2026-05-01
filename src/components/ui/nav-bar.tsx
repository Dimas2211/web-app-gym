"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@prisma/client";

type NavBarProps = {
  role: UserRole;
};

export function NavBar({ role: _role }: NavBarProps) {
  const pathname = usePathname();
  const isHome = pathname === "/dashboard";

  return (
    <nav className="flex items-center">
      <Link
        href="/dashboard"
        className={`text-sm px-3 py-1.5 rounded transition-colors ${
          isHome
            ? "bg-zinc-700 text-white font-medium"
            : "text-zinc-300 hover:text-white hover:bg-zinc-800"
        }`}
      >
        Inicio
      </Link>
    </nav>
  );
}
