import { discoverDesktop } from "../../plugin/desktop/client.mjs";
import { desktopEnabled } from "../../plugin/desktop/launcher.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { endpointPath, runtimeDirectory } from "../../plugin/desktop/paths.mjs";

export { discoverDesktop };
/** Cheap pre-filter for hot paths: with no endpoint file and no enabled marker
 * there is nothing to ping, so the caller can skip the asynchronous check. */
export function desktopTraces() {
  return (
    existsSync(endpointPath()) ||
    existsSync(join(runtimeDirectory(), "enabled.json"))
  );
}
/** Blink is running only if its endpoint answers a short status ping. The
 * descriptor and the "enabled" marker outlive a crashed or killed Blink, so
 * neither one proves anything; a refused connection also removes the stale file. */
export async function desktopRunning(timeoutMs = 800) {
  return discoverDesktop(endpointPath(), { timeoutMs, removeStale: true });
}
export async function desktopStatePresent() {
  return Boolean(await desktopRunning().catch(() => undefined));
}
/** A previously activated desktop never silently downgrades to local-only AI,
 * but it is given a few seconds to come back (restart, reconnect). A deliberate
 * quit clears the marker, so the extension then answers on its own again. */
export async function desktopConnection(graceMs = 3000) {
  const deadline = Date.now() + graceMs;
  let connected = await desktopRunning();
  if (connected || !(await desktopEnabled())) return connected;
  while (!connected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    connected = await desktopRunning();
  }
  if (!connected)
    throw new Error("Blink is reconnecting. Please try again shortly.");
  return connected;
}
