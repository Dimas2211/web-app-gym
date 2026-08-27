import { defineConfig } from "vitest/config";
import path from "node:path";

// Resuelve el alias "@/*" -> "src/*" (mismo mapeo que tsconfig.json)
// para que los tests puedan importar módulos server (services/actions)
// que usan imports absolutos, sin necesidad de mockear cada ruta.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
