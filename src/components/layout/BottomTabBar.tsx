import { Link } from "@tanstack/react-router";
import { Home, Droplet, AlertTriangle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom tab bar — 4 icon-only tabs, no labels (per spec).
 *
 * DECISION FLAGGED IN SPEC: the spec describes a "battery (used loosely —
 * could be relabeled to a tank icon)" 3rd tab without defining its content,
 * and separately notes "a 5-tab bar with an explicit alerts icon is also
 * reasonable" since Alerts being reachable only via the status row "feels
 * hidden". This build resolves the ambiguity by using the 3rd slot for
 * Alerts — please confirm with the PM/reference design if a Tank detail
 * screen was intended instead.
 */
export function BottomTabBar() {
  return (
    <nav className="flex border-t border-border bg-surface">
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
      className="flex flex-1 items-center justify-center py-4 text-muted"
      activeProps={{ className: "text-brand" }}
      activeOptions={{ exact: Boolean(exact) }}
    >
      <Icon size={24} className={cn("shrink-0")} />
    </Link>
  );
}
