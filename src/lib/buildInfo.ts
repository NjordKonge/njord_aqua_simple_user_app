/**
 * Human-memorable build marker shown on the Home screen.
 *
 * Android can end up still running an old APK if a build/install step
 * silently fails partway through (stale cache, wrong device, etc.) — a
 * plain version number is easy to misread or not notice changed. Bump the
 * number by exactly 1 on every build that goes to the phone (fruit name
 * stays fixed), so a glance at Home makes it obvious whether the latest
 * change actually installed.
 */
export const BUILD_TAG = "Kiwi-16";
