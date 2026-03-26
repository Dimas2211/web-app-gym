import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema GYM",
  description: "Plataforma de gestión multi-sucursal para gimnasios",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
