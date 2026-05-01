"use client";

import { useSidebar } from "@/components/ui/sidebar-context";

export function SidebarToggle() {
  const { open, toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      aria-label={open ? "Colapsar menú lateral" : "Expandir menú lateral"}
      className="w-8 h-8 flex items-center justify-center rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
    >
      <svg
        width="16"
        height="16"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
