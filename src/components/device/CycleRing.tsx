import { useEffect, useId, useRef, useState } from "react";
import type { CycleRingSummary } from "@/lib/device/cycleRing";

/**
 * "Operation cycle" overview — two concentric progress indicators, in the
 * spirit of the technical app's CycleRing (src/components/devices/CycleRing.tsx
 * in njord-aqua-main):
 *   outer = phase time elapsed / cycle duration — a stopwatch-style trace
 *   inner = delivered charge / target charge, in Coulombs — a wide bar
 * Center shows the live electrode current and phase ("Treating"/"Resting"/
 * "Idle"). LiveStatus only notifies every ~2s (see BLE_API_SPEC.md); this
 * resyncs to the device's authoritative `elapsedMs` on every update but
 * interpolates forward locally in between, so the time ring moves smoothly
 * instead of visibly jumping every couple of seconds.
 *
 * On firmware older than v2.8/v2.10 (`hasDeviceClock` false), the device
 * never reports a phase clock at all — `elapsedMs` would just sit at 0
 * forever, making the ring look frozen. Falls back to a host-side stopwatch
 * that starts counting the moment the cycle goes active, same as the
 * technical app's CycleRing fallback.
 *
 * Visual design: the outer ring reads as a stopwatch face — tick marks
 * standing in for a plain background track — with a *trace* (not a solid
 * bar) following the current position: translucent at the tail, solid at
 * the head, so it reads as "where the hand has swept" rather than a filled
 * gauge. The inner charge indicator is the opposite instinct — a wide,
 * confident bar — with the same head-brightening gradient so both
 * progress indicators share one visual language ("further along = brighter
 * at the tip") without looking identical.
 */
export function CycleRing({ summary }: { summary: CycleRingSummary }) {
  const { online, active, elapsedMs, totalMs, hasDeviceClock, deliveredC, targetC, elecMa, phaseLabel, deviceTime } = summary;

  const sampleRef = useRef({ at: Date.now(), elapsedMs });
  // Initialized eagerly (not just via the effect below) so mounting the
  // ring *while already active* — the normal case, since you typically
  // open Overview after a cycle has already started — immediately has a
  // start time instead of waiting for a false->true edge that will never
  // come this mount. Without this, `fallbackStartRef.current` stayed null
  // for the whole mount and the render fell back to `?? Date.now()` every
  // time, which computes ~0 elapsed forever — i.e. the counter looked
  // completely frozen, exactly the reported bug.
  const fallbackStartRef = useRef<number | null>(active ? Date.now() : null);
  const [, setTick] = useState(0);
  // Unique per mount, so two rings on screen at once (unlikely today, but
  // cheap to guard against) never collide on the same gradient id.
  const gradientUid = useId();

  // Resync to the device's latest sample whenever it changes.
  useEffect(() => {
    sampleRef.current = { at: Date.now(), elapsedMs };
  }, [elapsedMs]);

  // Fallback stopwatch: start counting the first time we see `active` with
  // no start time recorded yet (covers both mounting mid-cycle and a later
  // idle -> active transition); clear it once the cycle ends so the next
  // cycle starts counting from 0 again instead of an old timestamp.
  useEffect(() => {
    if (active) {
      if (fallbackStartRef.current === null) fallbackStartRef.current = Date.now();
    } else {
      fallbackStartRef.current = null;
    }
  }, [active]);

  // Local 250ms heartbeat to interpolate forward between notifications.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [active]);

  let interpolatedMs = 0;
  if (active) {
    if (hasDeviceClock) {
      interpolatedMs = Math.min(totalMs, sampleRef.current.elapsedMs + (Date.now() - sampleRef.current.at));
    } else {
      const start = fallbackStartRef.current ?? Date.now();
      interpolatedMs = Math.min(totalMs, Date.now() - start);
    }
  }

  const timePct = totalMs > 0 ? Math.min(100, (interpolatedMs / totalMs) * 100) : 0;
  const chargePct = targetC > 0 ? Math.min(100, (deliveredC / targetC) * 100) : 0;

  const size = 200;
  const c = size / 2;
  // Outer = the time trace: thin, so it reads as a line swept around the
  // face rather than a filled ring.
  const rOuter = 88;
  const strokeOuter = 7;
  // Inner = the charge bar: deliberately wide and confident, the opposite
  // instinct from the trace above it.
  const rInner = 60;
  const strokeInner = 18;

  const timeHead = pointOnCircle(c, c, rOuter, angleForPct(timePct));
  const timeTail = pointOnCircle(c, c, rOuter, angleForPct(0));
  const chargeHead = pointOnCircle(c, c, rInner, angleForPct(chargePct));
  const chargeTail = pointOnCircle(c, c, rInner, angleForPct(0));

  const timeGradId = `cyclering-time-${gradientUid}`;
  const chargeGradId = `cyclering-charge-${gradientUid}`;

  return (
    <div className="surface-lift flex flex-col items-center gap-3 rounded-card border border-border-soft bg-surface p-4">
      <div className="relative">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[220px]" role="img" aria-label="Operation cycle progress">
          <defs>
            {/* Vector runs from the 12-o'clock start point to the trace's
                current head, so the gradient always brightens toward
                "where the hand currently is" rather than a fixed compass
                direction — the same effect whether the cycle is 10% or
                90% through. */}
            <linearGradient
              id={timeGradId}
              gradientUnits="userSpaceOnUse"
              x1={timeTail.x}
              y1={timeTail.y}
              x2={timeHead.x}
              y2={timeHead.y}
            >
              <stop offset="0%" stopColor="var(--color-info)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--color-info)" stopOpacity={0.95} />
            </linearGradient>
            <linearGradient
              id={chargeGradId}
              gradientUnits="userSpaceOnUse"
              x1={chargeTail.x}
              y1={chargeTail.y}
              x2={chargeHead.x}
              y2={chargeHead.y}
            >
              {/* Base tone at the tail, a lighter tint at the head — a
                  hardcoded tint rather than color-mix(), since SVG stop
                  colours need to render consistently on the Android
                  WebView regardless of its exact Chromium version. */}
              <stop offset="0%" stopColor="var(--color-good)" />
              <stop offset="100%" stopColor="#6fd9a0" />
            </linearGradient>
          </defs>

          {/* Stopwatch face: tick marks stand in for a plain background
              track. 60 ticks (one per "second" position), a longer/bolder
              mark every 5th, same convention as an analogue stopwatch. */}
          <g>
            {STOPWATCH_TICKS.map((t, i) => {
              const angle = (i / STOPWATCH_TICKS.length) * 360 - 90;
              const major = i % 5 === 0;
              const outer = rOuter + strokeOuter / 2 + (major ? 8 : 4);
              const inner = rOuter + strokeOuter / 2 + 1;
              const p1 = pointOnCircle(c, c, inner, angle);
              const p2 = pointOnCircle(c, c, outer, angle);
              return (
                <line
                  key={i}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="var(--color-border)"
                  strokeWidth={major ? 2 : 1}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Time trace: translucent tail brightening to a solid head,
              via the gradient above — "where the hand has swept", not a
              filled gauge. */}
          <circle
            cx={c}
            cy={c}
            r={rOuter}
            fill="none"
            stroke={`url(#${timeGradId})`}
            strokeWidth={strokeOuter}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * rOuter}
            strokeDashoffset={2 * Math.PI * rOuter * (1 - timePct / 100)}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ transition: "stroke-dashoffset 0.4s ease-out" }}
          />
          {/* Bright head marker — the trace fades in from the tail, so
              without this the current position can be hard to pinpoint
              at a glance, especially early in a cycle. */}
          {active && timePct > 0 ? (
            <circle cx={timeHead.x} cy={timeHead.y} r={strokeOuter * 0.55} fill="var(--color-info)" />
          ) : null}

          {/* Charge bar: wide, solid, brightening toward its own head with
              the same gradient technique. */}
          <circle cx={c} cy={c} r={rInner} fill="none" stroke="var(--color-surface-muted)" strokeWidth={strokeInner} />
          <circle
            cx={c}
            cy={c}
            r={rInner}
            fill="none"
            stroke={`url(#${chargeGradId})`}
            strokeWidth={strokeInner}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * rInner}
            strokeDashoffset={2 * Math.PI * rInner * (1 - chargePct / 100)}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ transition: "stroke-dashoffset 0.4s ease-out" }}
          />

          <text
            x={c}
            y={c - 4}
            textAnchor="middle"
            fill="var(--color-content)"
            className="tnum"
            style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}
          >
            {online ? `${elecMa.toFixed(0)}` : "—"}
          </text>
          <text x={c} y={c + 16} textAnchor="middle" fill="var(--color-faint)" style={{ fontSize: 12, letterSpacing: 1.2 }}>
            mA
          </text>
          <text
            x={c}
            y={c + 36}
            textAnchor="middle"
            fill={online && active ? "var(--color-info)" : "var(--color-faint)"}
            style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 500, textTransform: "uppercase" }}
          >
            {online ? phaseLabel : "Not connected"}
          </text>
        </svg>
      </div>

      {deviceTime && (
        <p className="tnum text-xs text-faint">Device clock · {deviceTime}</p>
      )}

      <div className="grid w-full grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-0.5 rounded-inner bg-surface-muted p-3">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-info)" }} />
            Cycle time
          </span>
          <span className="tnum font-medium text-content">
            {formatDuration(interpolatedMs)} / {formatDuration(totalMs)}
          </span>
          <span className="tnum text-faint">{active ? `${timePct.toFixed(0)}%` : "—"}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-inner bg-surface-muted p-3">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-good)" }} />
            Chlorine charge
          </span>
          <span className="tnum font-medium text-content">
            {deliveredC.toFixed(0)} / {targetC.toFixed(0)} C
          </span>
          <span className="tnum text-faint">{targetC > 0 ? `${chargePct.toFixed(0)}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
}

// 60 positions, purely decorative face marks — independent of the actual
// progress value.
const STOPWATCH_TICKS = Array.from({ length: 60 });

/** 0% sits at 12 o'clock (-90°) and grows clockwise, matching the existing
 *  `rotate(-90)` convention used for the dasharray arcs below. */
function angleForPct(pct: number): number {
  return -90 + (pct / 100) * 360;
}

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

