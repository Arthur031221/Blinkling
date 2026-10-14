import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Every test file runs against its own empty HOME, so a Blink that happens to
// be installed or running on the developer's machine can never change a result.
const home = mkdtempSync(join(tmpdir(), "blinkling-test-home-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
delete process.env.BLINKLING_RUNTIME_DIR;
// Tests never create Remote Control sessions in a real account.
process.env.BLINKLING_REMOTE = "0";
afterAll(() => rmSync(home, { recursive: true, force: true }));
