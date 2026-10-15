/** Quitting must always finish. Disposal waits on the session, the host and the
 * locator; if any of them hangs, `exit` runs after `ms` so Blink still goes away.
 * Returns the function that cancels the watchdog. */
export function armQuitWatchdog(
  exit,
  ms = 3000,
  { setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  const timer = setTimer(exit, ms);
  timer?.unref?.();
  return () => clearTimer(timer);
}
