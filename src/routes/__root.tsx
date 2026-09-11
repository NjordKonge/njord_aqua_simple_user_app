import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { cn } from "@/lib/utils";

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
 * somewhere rather than a hard content swap. A short fade on the same key
 * softens the swap itself, so the two screens feel connected rather than
 * cut between.
 */
function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [splashVisible, setSplashVisible] = useState(true);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <main
        key={pathname}
        className="relative z-10 flex-1 animate-fade overflow-y-auto px-5 pb-8 pt-8"
      >
        <Outlet />
      </main>
      <BottomTabBar />
      {splashVisible ? <SplashScreen onDone={() => setSplashVisible(false)} /> : null}
    </div>
  );
}

/**
 * Cold-start splash: covers the app for a beat with the wordmark and tagline
 * before fading out, so first launch feels like an arrival rather than a
 * blank flash. Mounted once by RootLayout (which itself never remounts on
 * navigation), so it never reappears after the first paint.
 */
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setLeaving(true), 1300);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const doneTimer = setTimeout(onDone, 500);
    return () => clearTimeout(doneTimer);
  }, [leaving, onDone]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg transition-opacity duration-500 ease-[var(--ease-out-soft)]",
        leaving ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      aria-hidden={leaving}
    >
      <img
        src="/njord-logo-white.png"
        alt="Njord Aqua"
        className="relative z-10 w-32 animate-rise"
        style={{ filter: "brightness(0)", opacity: 0.86 }}
      />
      <p
        className="relative z-10 animate-fade text-center text-[0.8125rem] font-medium tracking-[0.2em] text-faint"
        style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
      >
        Easier, Cleaner, Safer, More
      </p>
    </div>
  );
}


