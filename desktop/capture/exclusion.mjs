import { release as osRelease } from "node:os";

/** Windows 10 2004 is the first build that can leave a window out of a screen
 * read (WDA_EXCLUDEFROMCAPTURE); older ones would draw it black instead. */
const WINDOWS_FIRST_BUILD = 19041;

/** Whether this system can keep Blink's own windows out of a screen read, so
 * they never have to be hidden for one. macOS and Windows can. `BLINKLING_CAPTURE_EXCLUDE`
 * set to 0 turns it off, where a macOS release ignores the flag in its capture,
 * and set to 1 turns it on for a test on a system that cannot. */
export function canExclude({
  platform = process.platform,
  version = osRelease(),
  env = process.env,
} = {}) {
  if (env.BLINKLING_CAPTURE_EXCLUDE === "0") return false;
  if (env.BLINKLING_CAPTURE_EXCLUDE === "1") return true;
  if (platform === "darwin") return true;
  if (platform === "win32") {
    const build = Number(String(version).split(".")[2]);
    return Number.isFinite(build) && build >= WINDOWS_FIRST_BUILD;
  }
  return false;
}

const kept = new WeakSet();
/** True for a window the system keeps out of screen reads. */
export const excluded = (win) => kept.has(win);

/** Asks the system to leave `win` out of every capture. Returns whether it did. */
export function exclude(win, can = canExclude()) {
  if (!can || win.isDestroyed()) return false;
  win.setContentProtection(true);
  kept.add(win);
  return true;
}
