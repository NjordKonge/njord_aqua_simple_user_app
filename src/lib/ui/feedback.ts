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

function beep(frequencyHz: number, durationMs: number, delayMs = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const startAt = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequencyHz;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.02);
}

const MODE_TONE_HZ: Record<"off" | "normal" | "high", number> = {
  off: 380,
  normal: 900,
  high: 1300,
};

/** Call when the user picks a new chlorination mode on Home. */
export function playModeChangeFeedback(mode: "off" | "normal" | "high") {
  beep(MODE_TONE_HZ[mode], 110);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(mode === "off" ? 80 : [40, 40, 40]);
  }
}
