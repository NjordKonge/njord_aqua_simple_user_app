import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * App shell: a single scrollable screen area plus the bottom tab bar.
 * Each screen renders its own header (Home/Overview/Alerts/Settings headers
 * differ per spec), so only the tab bar lives here.
 */
function RootLayout() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto px-5 pb-6 pt-8">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}

