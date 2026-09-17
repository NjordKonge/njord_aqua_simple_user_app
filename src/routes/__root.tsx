import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { OtaDialog } from "@/components/ota/OtaDialog";
import { FirmwareVersionDialog } from "@/components/ota/FirmwareVersionDialog";
import { cn } from "@/lib/utils";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * App shell: a full-screen water scene, a single scrollable content layer
 * above it, and the floating bottom tab bar. Each screen renders its own
 * header (Home/Overview/Alerts/Settings headers differ per spec), so only
 * the background and tab bar live here — every screen's cards sit as
 * frosted glass over the same water scene, which is what makes the "data
 * floating in water" identity consistent app-wide rather than a
 * Home-only effect.
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
      <WaterBackground />
      <main
        key={pathname}
        className="relative z-10 flex-1 animate-fade overflow-y-auto px-5 pb-8 pt-8"
      >
        <Outlet />
      </main>
      <div className="relative z-20 px-3 pb-3">
        <BottomTabBar />
      </div>
      <OtaDialog />
      <FirmwareVersionDialog />
      {splashVisible ? <SplashScreen onDone={() => setSplashVisible(false)} /> : null}
    </div>
  );
}

/**
 * The "data floating in water" backdrop: a deep navy-to-water-blue gradient,
 * a few faint diagonal light rays, a soft cyan sheen, and a handful of slow
 * ambient bubbles — all CSS/SVG, no photo asset (kept dependency-free and
 * licence-free). Everything here is toned down noticeably from a "concept
 * render": low opacity throughout, slow motion, and a soft scrim over the
 * top so foreground text/numbers never fight the scenery for contrast.
 *
 * Fixed + behind `<main>` (z-0 vs its z-10) so it's one continuous scene
 * under every screen rather than something that scrolls with content.
 * `prefers-reduced-motion` already collapses all animation durations
 * globally (see styles.css), so the bubbles simply stop moving there
 * instead of needing their own check.
 */
function WaterBackground() {
  const bubbles = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        id: i,
        left: 4 + (i * 96) / 9 + Math.random() * 6,
        size: 2.5 + Math.random() * 3.5,
        delay: Math.random() * 10,
        duration: 11 + Math.random() * 9,
        drift: (Math.random() - 0.5) * 24,
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Base water gradient — brighter/bluer than a plain dark navy, per
          the sunlit-pool reference: glass cards get their contrast from
          being lighter than this backdrop, not from it being near-black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 85% at 18% -12%, #2f7ba6 0%, #17557d 46%, #0d3450 100%)",
        }}
      />
      {/* Caustic-style light rays — the reference's defining texture, so
          brighter than a subtle atmosphere hint. Two layers at different
          angles/scales read as rippling light rather than one flat stripe
          pattern. */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "repeating-linear-gradient(112deg, transparent 0 140px, rgb(255 255 255 / 0.6) 140px 150px, transparent 150px 300px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.10]"
        style={{
          background:
            "repeating-linear-gradient(68deg, transparent 0 180px, rgb(255 255 255 / 0.6) 180px 188px, transparent 188px 360px)",
          mixBlendMode: "screen",
        }}
      />
      {/* Soft electric-cyan sheen, off to one side. */}
      <div
        className="absolute -left-1/4 -top-1/4 h-[70%] w-[80%] opacity-[0.18]"
        style={{
          background: "radial-gradient(closest-side, #38d6ff, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* Ambient bubbles — slow and very low-contrast, reusing the same
          bubble-rise keyframe as the electrolysis status panel. */}
      <div className="absolute inset-0 opacity-[0.16]">
        {bubbles.map((b) => (
          <span
            key={b.id}
            className="animate-bubble absolute bottom-0 rounded-full bg-white"
            style={{
              left: `${b.left}%`,
              width: b.size,
              height: b.size,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.duration}s`,
              ["--bubble-drift" as string]: `${b.drift}px`,
              ["--bubble-travel" as string]: "900px",
            }}
          />
        ))}
      </div>
      {/* Scrim: settles the scene just enough that text/numbers in the
          glass cards stay legible, without flattening the brighter water
          scene back down to near-black. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgb(2 10 18 / 0.05), rgb(2 10 18 / 0.12) 60%, rgb(2 10 18 / 0.22))" }}
      />
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
      <WaterBackground />
      {/* The logo asset is already white — no filter needed now that the
          splash sits on the same dark water scene as the rest of the app
          (an earlier light-theme version inverted it to black here). */}
      <img src="/njord-logo-white.png" alt="Njord Aqua" className="relative z-10 w-32 animate-rise" />
      <p
        className="relative z-10 animate-fade text-center text-[0.8125rem] font-medium tracking-[0.2em] text-faint"
        style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
      >
        Easier, Cleaner, Safer, More
      </p>
    </div>
  );
}


