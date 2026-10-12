#!/usr/bin/env node
import { createGlimpselet } from "./server.js";

async function main() {
  const app = await createGlimpselet({
    fixturePath:
      process.env.GLIMPSELET_TEST_MODE === "1"
        ? process.env.GLIMPSELET_TEST_FIXTURE
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
    `Glimpselet startup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
