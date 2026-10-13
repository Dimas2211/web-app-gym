/**
 * Layout de vistas de impresión — sin navegación, sidebar ni chrome de
 * dashboard. Las rutas viven bajo /dashboard/* para heredar la protección
 * del middleware (sesión staff), pero fuera del grupo (dashboard) para no
 * heredar su layout.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-zinc-100 print:bg-white">{children}</div>;
}
