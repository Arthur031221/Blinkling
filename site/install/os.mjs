// Which computer is this? Pure, so the page and its tests share one answer.

export const OS_IDS = ["mac-arm64", "mac-intel", "windows", "linux"];

/** The panel of steps an operating system shows; both Macs share one. */
export const groupOf = (os) => (os?.startsWith("mac") ? "mac" : os);

/** `?os=` accepts an exact id or plain "mac" (Apple Silicon unless told otherwise). */
export function parseOsParam(search = "", architecture = "") {
  const value = new URLSearchParams(search).get("os")?.toLowerCase();
  if (OS_IDS.includes(value)) return value;
  if (value === "mac" || value === "macos")
    return architecture === "x86" ? "mac-intel" : "mac-arm64";
  if (value === "win" || value === "win32") return "windows";
  return undefined;
}

/**
 * Best guess for the visitor's computer, or undefined on a phone or tablet,
 * where there is nothing to install yet. A browser cannot see a Mac's chip
 * through the user agent; `architecture` comes from userAgentData when the
 * browser offers it ("arm" or "x86"), otherwise Apple Silicon is assumed
 * because every Mac sold since 2023 has it.
 */
export function detectOs({
  userAgent = "",
  architecture = "",
  maxTouchPoints = 0,
} = {}) {
  if (/iPhone|iPad|iPod|Android|CrOS/.test(userAgent)) return undefined;
  if (/Windows/.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/.test(userAgent))
    // iPadOS Safari presents itself as a Mac but has a touch screen.
    return maxTouchPoints > 1
      ? undefined
      : architecture === "x86"
        ? "mac-intel"
        : "mac-arm64";
  if (/Linux|X11/.test(userAgent)) return "linux";
  return undefined;
}

export function chooseOs({ search = "", ...facts } = {}) {
  return parseOsParam(search, facts.architecture) ?? detectOs(facts);
}
