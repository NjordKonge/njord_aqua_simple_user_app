// Client-only SPA entry (web + Capacitor/Android use the same entry).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { installWebBluetoothShim } from "./lib/native/webBluetoothShim";
import "./styles.css";

// On native the WebView has no Web Bluetooth API, so navigator.bluetooth is
// polyfilled with a Capacitor-BLE-backed shim BEFORE the router (and therefore
// the device store) loads. No-op on the web build.
installWebBluetoothShim();

const router = getRouter();

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
