import { useEffect, useRef, useState } from "react";
import type { CycleRingSummary } from "@/lib/device/cycleRing";

/**
 * "Operation cycle" overview — two concentric progress rings, in the spirit
 * of the technical app's CycleRing (src/components/devices/CycleRing.tsx in
 * njord-aqua-main):
 *   outer = phase time elapsed / cycle duration
 *   inner = delivered charge / target charge, in Coulombs
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
  const rOuter = 86;
  const rInner = 64;
  const circOuter = 2 * Math.PI * rOuter;
  const circInner = 2 * Math.PI * rInner;

  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface p-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[220px]" role="img" aria-label="Operation cycle progress">
        <circle cx={c} cy={c} r={rOuter} fill="none" stroke="var(--color-border)" strokeWidth={12} />
        <circle
          cx={c}
          cy={c}
          r={rOuter}
          fill="none"
          stroke="var(--color-info)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circOuter}
          strokeDashoffset={circOuter * (1 - timePct / 100)}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dashoffset 0.4s ease-out" }}
        />

        <circle cx={c} cy={c} r={rInner} fill="none" stroke="var(--color-border)" strokeWidth={12} />
        <circle
          cx={c}
          cy={c}
          r={rInner}
          fill="none"
          stroke="var(--color-good)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circInner}
          strokeDashoffset={circInner * (1 - chargePct / 100)}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dashoffset 0.4s ease-out" }}
        />

        <text x={c} y={c - 4} textAnchor="middle" fill="var(--color-content)" style={{ fontSize: 26, fontWeight: 600 }}>
          {online ? `${elecMa.toFixed(0)}` : "—"}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" fill="var(--color-muted)" style={{ fontSize: 11, letterSpacing: 1 }}>
          mA
        </text>
        <text x={c} y={c + 34} textAnchor="middle" fill="var(--color-muted)" style={{ fontSize: 11, letterSpacing: 1 }}>
          {online ? phaseLabel : "Not connected"}
        </text>
      </svg>

      {deviceTime && <p className="text-xs text-muted">Device clock · {deviceTime}</p>}

      <div className="grid w-full grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-info)" }} />
            Cycle time
          </span>
          <span className="font-medium text-content">
            {formatDuration(interpolatedMs)} / {formatDuration(totalMs)}
          </span>
          <span className="text-muted">{active ? `${timePct.toFixed(0)}%` : "—"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-good)" }} />
            Chlorine charge
          </span>
          <span className="font-medium text-content">
            {deliveredC.toFixed(0)} / {targetC.toFixed(0)} C
          </span>
          <span className="text-muted">{targetC > 0 ? `${chargePct.toFixed(0)}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
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
