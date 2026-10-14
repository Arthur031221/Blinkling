#!/usr/bin/env node
import "./legacy-env.js";
import { migrateLegacyData } from "../../plugin/desktop/legacy.mjs";
import { createBlinkling } from "./server.js";

async function main() {
  await migrateLegacyData().catch(() => undefined);
  const app = await createBlinkling({
    fixturePath:
      process.env.BLINKLING_TEST_MODE === "1"
        ? process.env.BLINKLING_TEST_FIXTURE
        : undefined,
  });
  await app.connect();
  const shutdown = () => {
    void app.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("exit", () => app.history.clear());
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Blinkling startup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
