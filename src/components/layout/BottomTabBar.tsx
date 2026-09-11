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
 * A flat surface (no blur/translucency, no floating shadow) sitting on a
 * hairline top border, per spec ("no large floating navigation bars or
 * prominent shadows").
 *
 * The active pill is a single absolutely-positioned element that SLIDES
 * between tabs rather than each tab toggling its own background — the
 * travel is what visually connects where you were to where you are, so
 * navigation feels continuous instead of like a hard swap. Ordinary
 * navigation stays silent (no tap sound); the moving indicator plus the
 * colour change is the only feedback needed.
 */
export function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => (t.exact ? pathname === t.to : pathname.startsWith(t.to))),
  );

  return (
    <nav className="relative z-20 flex border-t border-border-soft bg-surface pb-1">
      {/* One indicator for the whole bar, translated to the active slot. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 h-8 transition-transform duration-300 ease-[var(--ease-out-soft)]"
        style={{
          width: `${100 / TABS.length}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      >
        <span
          className="mx-auto block h-full w-14 rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-brand) 12%, transparent)" }}
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
      className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-faint"
      activeProps={{ className: "text-brand" }}
      activeOptions={{ exact: Boolean(exact) }}
    >
      {({ isActive }) => (
        <>
          {/* The icon lifts a hair when selected — a small, brief cue that
              reinforces the sliding pill without competing with it. */}
          <Icon
            size={21}
            strokeWidth={isActive ? 2.2 : 1.8}
            className={cn(
              "relative shrink-0 transition-transform duration-200 ease-[var(--ease-out-soft)]",
              isActive && "-translate-y-px",
            )}
          />
          <span
            className={cn(
              "relative text-[0.75rem] transition-colors duration-150",
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

