// Source 2 on Linux: AT-SPI through a persistent python helper. The helper
// answers in screen pixels, which the shared source divides by display scale.
import { fileURLToPath } from "node:url";
import { createHelperSource } from "./ax-shared.mjs";
import { persistentRequest } from "./helper-process.mjs";

const SCRIPT = fileURLToPath(
  new URL("../native/ax-linux/atspi.py", import.meta.url),
);

export function createAxLinux({ request, displays } = {}) {
  const send =
    request ??
    persistentRequest({
      command: "python3",
      args: ["-I", SCRIPT],
      env: { NO_AT_BRIDGE: "0", GTK_A11Y: "atspi" },
    });
  return createHelperSource({ request: send, displays, native: true });
}
