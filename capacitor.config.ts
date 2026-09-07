import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // NOTE: distinct appId from the technical app so both can be installed
  // side by side on the same device during development.
  appId: "com.njordaqua.simple",
  appName: "Njord Aqua",
  webDir: "dist-mobile",
};

export default config;
