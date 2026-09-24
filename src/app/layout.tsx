import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Zolvi",
    template: "%s · Zolvi",
  },
  description: "Plataforma de gestión multiindustria",
  applicationName: "Zolvi",
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
