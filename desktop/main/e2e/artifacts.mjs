import { fileURLToPath } from "node:url";
export const report =
  process.env.GLIMPSELET_REPORT_DIR ??
  fileURLToPath(
    new URL("../../../test-results/desktop-shell", import.meta.url),
  );
