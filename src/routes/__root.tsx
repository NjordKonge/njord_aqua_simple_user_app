import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * App shell: a single scrollable screen area plus the bottom tab bar.
 * Each screen renders its own header (Home/Overview/Alerts/Settings headers
 * differ per spec), so only the tab bar lives here.
 *
 * The `key` on the scroll container is the current pathname, which remounts
 * the subtree on every navigation — that's what re-triggers each screen's
 * `.stagger` entrance animation, so switching tabs feels like arriving
 * somewhere rather than a hard content swap.
 */
function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="app-ambient" aria-hidden />
      <main
        key={pathname}
        className="relative z-10 flex-1 overflow-y-auto px-5 pb-8 pt-8"
      >
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}


