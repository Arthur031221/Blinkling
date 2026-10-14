import { join } from "node:path";
import { homedir } from "node:os";
export const runtimeDirectory = () =>
  process.env.BLINKLING_RUNTIME_DIR || join(homedir(), ".blinkling", "runtime");
export const endpointPath = () => join(runtimeDirectory(), "desktop.json");
