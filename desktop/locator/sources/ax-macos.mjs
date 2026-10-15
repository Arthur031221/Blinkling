// Source 2 on macOS: the Accessibility API through a JXA script. AX reports
// points, which are already DIP.
import { fileURLToPath } from "node:url";
import { createHelperSource } from "./ax-shared.mjs";
import { oneShotRequest } from "./helper-process.mjs";

const SCRIPT = fileURLToPath(
  new URL("../native/ax-macos/ax.js", import.meta.url),
);

export function createAxMacos({ request, displays } = {}) {
  const send =
    request ??
    oneShotRequest({
      command: "osascript",
      argsFor: (body) => ["-l", "JavaScript", SCRIPT, body],
    });
  return createHelperSource({ request: send, displays, native: false });
}
