import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { PortalNavBar } from "@/components/ui/portal-nav-bar";

export default async function PortalLayout({
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

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-zinc-900 text-white px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-black text-base tracking-widest uppercase shrink-0">GYM</span>
          <PortalNavBar />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-bold shrink-0">
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
