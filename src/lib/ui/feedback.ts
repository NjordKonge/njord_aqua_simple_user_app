/**
 * Phone-side "buzzer" substitute for chlorination mode changes.
 *
 * There is no BLE command that triggers the device's physical PCB buzzer
 * (see firmware buzzer.cpp/buzzer.h) — `BuzzerSignal()` is only ever called
 * from the physical button handler (main.cpp on_single_press/on_long_press)
 * and from the UART debug console (SerialUi.cpp), never from BLE command
 * handling. So without a firmware change, the app cannot make the device
 * itself beep when the mode is changed remotely.
 *
 * As a substitute, this plays a short tone on the phone's own speaker (Web
 * Audio, needs no native permission) plus a short vibration (needs the
 * VIBRATE permission, added to AndroidManifest.xml) whenever the user
 * changes the chlorination mode, so there's still audible/haptic
 * confirmation that the tap registered.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function beep(frequencyHz: number, durationMs: number, delayMs = 0, peakGain = 0.2) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const startAt = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequencyHz;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.02);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

const MODE_TONE_HZ: Record<"off" | "normal" | "high", number> = {
  off: 380,
  normal: 900,
  high: 1300,
};

/** Call when the user picks a new chlorination mode on Home. */
export function playModeChangeFeedback(mode: "off" | "normal" | "high") {
  beep(MODE_TONE_HZ[mode], 110);
  vibrate(mode === "off" ? 80 : [40, 40, 40]);
}

/**
 * Navigation / minor-control tick.
 *
 * Deliberately much quieter (0.035 peak gain vs 0.2) and shorter (26 ms) than
 * the mode-change tone: this fires on every tab tap, so at the mode tone's
 * volume it would go from "premium detail" to "why is this app beeping at
 * me" within about four taps. High and short enough to read as a mechanical
 * click rather than a musical note.
 */
export function playTapFeedback() {
  beep(2100, 26, 0, 0.035);
  vibrate(10);
}

/** Confirmation for a completed, user-initiated action (e.g. Start). */
export function playConfirmFeedback() {
  beep(760, 70, 0, 0.12);
  beep(1140, 90, 0.06, 0.12);
  vibrate([18, 34, 26]);
}

/** A destructive or halting action (e.g. Stop, Reset fault). */
export function playAbortFeedback() {
  beep(420, 130, 0, 0.14);
  vibrate(60);
}

