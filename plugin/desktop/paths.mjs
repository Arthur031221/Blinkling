import { join } from "node:path";
import { homedir } from "node:os";
export const runtimeDirectory = () =>
  process.env.GLIMPSELET_RUNTIME_DIR ||
  join(homedir(), ".glimpselet", "runtime");
export const endpointPath = () => join(runtimeDirectory(), "desktop.json");
