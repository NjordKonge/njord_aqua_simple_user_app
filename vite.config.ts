// Web (SPA) build config for the simplified end-user app.
//
// Deliberately simpler than the technical app: no TanStack Start SSR, no
// Cloudflare worker, no PWA service worker. The app is a plain client-side
// SPA, which is also exactly what Capacitor needs on Android.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes/*.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  // Capacitor serves from a real origin (https://localhost/), and a relative
  // base breaks chunk resolution on nested client-routed paths.
  base: "/",
});
