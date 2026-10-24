import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
