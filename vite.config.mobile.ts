// Mobile (Capacitor / Android) build.
// Identical to the web build except it emits into dist-mobile/, which is the
// `webDir` referenced by capacitor.config.ts.
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    sourcemap: false,
  },
});
