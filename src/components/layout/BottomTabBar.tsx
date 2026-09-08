import { Link } from "@tanstack/react-router";
import { Home, Droplet, AlertTriangle, Settings } from "lucide-react";
import { playTapFeedback } from "@/lib/ui/feedback";

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
 *
 * Visually the bar is a translucent, blurred slab rather than a solid one so
 * content scrolling underneath stays faintly visible — that's what stops a
 * fixed bottom bar reading as a dead letterbox. The active tab gets a lit
 * dot above the icon plus a soft brand glow behind it, which is the only
 * moving affordance needed to answer "where am I".
 */
export function BottomTabBar() {
  return (
    <nav
      className="relative z-20 flex border-t border-border-soft bg-surface/80 pb-1 backdrop-blur-xl"
      style={{ boxShadow: "0 -12px 32px -20px rgb(0 0 0 / 0.9)" }}
    >
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
      onClick={() => playTapFeedback()}
      className="press group relative flex flex-1 flex-col items-center justify-center gap-1.5 py-3.5 text-muted"
      activeProps={{ className: "text-brand" }}
      activeOptions={{ exact: Boolean(exact) }}
    >
      {({ isActive }) => (
        <>
          {/* Glow puddle behind the active icon. Sits behind via -z-10 so it
              never washes out the glyph itself. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1.5 h-9 w-14 rounded-full transition-opacity duration-300"
            style={{
              opacity: isActive ? 1 : 0,
              background:
                "radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 26%, transparent), transparent)",
            }}
          />
          <Icon
            size={23}
            strokeWidth={isActive ? 2.4 : 1.9}
            className="relative shrink-0 transition-all duration-300"
            style={{ transform: isActive ? "translateY(-1px)" : "none" }}
          />
          {/* Lit dot marks the current tab. Scales in rather than appearing,
              so tab switches have a visible hand-off between the two dots. */}
          <span
            aria-hidden
            className="h-1 w-1 rounded-full bg-brand transition-all duration-300"
            style={{
              opacity: isActive ? 1 : 0,
              transform: isActive ? "scale(1)" : "scale(0.2)",
              boxShadow: isActive ? "0 0 8px var(--color-brand)" : "none",
            }}
          />
        </>
      )}
    </Link>
  );
}

