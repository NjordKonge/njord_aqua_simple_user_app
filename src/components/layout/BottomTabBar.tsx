import { Link } from "@tanstack/react-router";
import { Home, Droplet, AlertTriangle, Settings } from "lucide-react";

/**
 * Bottom tab bar — 4 tabs, simple icon + short label each.
 *
 * A flat surface (no blur/translucency, no floating shadow) sitting on a
 * hairline top border, per spec ("no large floating navigation bars or
 * prominent shadows"). The active tab gets a softly tinted blue pill behind
 * the icon plus stronger text weight/colour — that's the only affordance,
 * no glow. Ordinary navigation stays silent (no tap sound); the active-state
 * colour change is the only feedback needed.
 */
export function BottomTabBar() {
  return (
    <nav className="relative z-20 flex border-t border-border-soft bg-surface pb-1">
      <TabLink to="/" icon={Home} label="Home" exact />
      <TabLink to="/overview" icon={Droplet} label="Overview" />
      <TabLink to="/alerts" icon={AlertTriangle} label="Alerts" />
      <TabLink to="/settings" icon={Settings} label="Settings" />
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
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 h-8 w-14 rounded-full transition-opacity duration-150"
            style={{
              opacity: isActive ? 1 : 0,
              backgroundColor: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
            }}
          />
          <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} className="relative shrink-0" />
          <span className={isActive ? "text-[0.75rem] font-semibold" : "text-[0.75rem] font-medium"}>
            {label}
          </span>
        </>
      )}
    </Link>
  );
}

