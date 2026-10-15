// Picks the accessibility source for a platform.
import { createAxLinux } from "./ax-linux.mjs";
import { createAxMacos } from "./ax-macos.mjs";
import { createAxWindows } from "./ax-windows.mjs";

export function createAxSource({ platform, ...options }) {
  if (platform === "linux") return createAxLinux(options);
  if (platform === "darwin") return createAxMacos(options);
  if (platform === "win32") return createAxWindows(options);
  return null;
}
