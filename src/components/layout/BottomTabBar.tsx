import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Droplet, AlertTriangle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", icon: Home, label: "Home", exact: true },
  { to: "/overview", icon: Droplet, label: "Overview", exact: false },
  { to: "/alerts", icon: AlertTriangle, label: "Alerts", exact: false },
  { to: "/settings", icon: Settings, label: "Settings", exact: false },
] as const;

/**
 * Bottom tab bar — 4 tabs, simple icon + short label each.
 *
 * A floating translucent glass panel (blur, thin border, broad soft shadow,
 * `glass-nav` in styles.css) with margin off the screen edges, per spec
 * ("the bottom navigation is itself a translucent floating glass panel").
 *
 * The active pill is a single absolutely-positioned element that SLIDES
 * between tabs rather than each tab toggling its own background — the
 * travel is what visually connects where you were to where you are, so
 * navigation feels continuous instead of like a hard swap. It carries a
 * stronger blue surface plus a thin cyan edge glow when active, per spec.
 * Ordinary navigation stays silent (no tap sound); the moving indicator
 * plus the colour change is the only feedback needed.
 */
export function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => (t.exact ? pathname === t.to : pathname.startsWith(t.to))),
  );

  return (
    <nav className="glass-nav relative z-20 flex rounded-[28px] px-2 py-1.5">
      {/* One indicator for the whole bar, translated to the active slot. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1.5 z-0 transition-transform duration-300 ease-[var(--ease-out-soft)]"
        style={{
          width: `${100 / TABS.length}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      >
        <span
          className="mx-1 block h-full rounded-2xl border"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-brand) 26%, transparent)",
            borderColor: "color-mix(in srgb, var(--color-brand) 55%, transparent)",
          }}
        />
      </span>

      {TABS.map((tab) => (
        <TabLink key={tab.to} to={tab.to} icon={tab.icon} label={tab.label} exact={tab.exact} />
      ))}
    </nav>
  );
}

function TabLink({
  to,
  icon: Icon,
  label,
  exact,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="group relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-faint"
      activeProps={{ className: "text-content" }}
      activeOptions={{ exact: Boolean(exact) }}
    >
      {({ isActive }) => (
        <>
          {/* The icon lifts a hair when selected — a small, brief cue that
              reinforces the sliding pill without competing with it. */}
          <Icon
            size={20}
            strokeWidth={isActive ? 2.2 : 1.8}
            className={cn(
              "relative shrink-0 transition-transform duration-200 ease-[var(--ease-out-soft)]",
              isActive && "-translate-y-px",
            )}
          />
          <span
            className={cn(
              "relative text-[0.6875rem] transition-colors duration-150",
              isActive ? "font-semibold" : "font-medium",
            )}
          >
            {label}
          </span>
        </>
      )}
    </Link>
  );
}

