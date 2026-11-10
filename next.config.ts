import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo lo usa `npm run showcase:capture` (servidor paralelo para capturas
  // de la landing) para no compartir `.next/` con el `next dev` habitual.
  // Sin la variable, el comportamiento es el de siempre.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    serverActions: {
      // ONBOARDING-5K: el Data Onboarding Center sube el .xlsx por Server
      // Action. El default de Next.js es 1 MB; se eleva a 4 MB (=
      // DATA_ONBOARDING_MAX_FILE_BYTES) dejando margen bajo el límite de
      // cuerpo de Vercel Functions (4.5 MB) para el resto del multipart.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
