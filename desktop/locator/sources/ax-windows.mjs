// Source 2 on Windows: UI Automation through a PowerShell script. UIA reports
// physical pixels, which the shared source divides by display scale.
import { fileURLToPath } from "node:url";
import { createHelperSource } from "./ax-shared.mjs";
import { oneShotRequest } from "./helper-process.mjs";

const SCRIPT = fileURLToPath(
  new URL("../native/ax-windows/uia.ps1", import.meta.url),
);

export function createAxWindows({ request, displays } = {}) {
  const send =
    request ??
    oneShotRequest({
      command: "powershell.exe",
      argsFor: () => [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        SCRIPT,
      ],
      input: (body) => body,
    });
  return createHelperSource({ request: send, displays, native: true });
}
