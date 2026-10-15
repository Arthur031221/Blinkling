// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { HelperTrust } from "./helper-trust.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const folder = async () => {
  const path = await mkdtemp(join(tmpdir(), "blinkling-trust-"));
  temporary.push(path);
  return path;
};

it("keeps one long-lived secret in a user-only file that a restart reuses", async () => {
  const file = join(await folder(), "runtime", "helper.json");
  const first = new HelperTrust(file).secret();
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.parse(await readFile(file, "utf8")).secret).toBe(first);
  if (process.platform !== "win32")
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(new HelperTrust(file).secret()).toBe(first);
});

it("replaces a damaged file instead of trusting it", async () => {
  const directory = await folder();
  const file = join(directory, "helper.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, '{"secret":"short"}');
  const made = new HelperTrust(file).secret();
  expect(made).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.parse(await readFile(file, "utf8")).secret).toBe(made);
});

it("hands the secret over once per link code and not after it expires", () => {
  let now = 1_000;
  const trust = new HelperTrust(null, () => now);
  const code = trust.issueCode();
  expect(code).toMatch(/^[A-F0-9]{16}$/);
  expect(trust.codeKnown(code)).toBe(true);
  expect(trust.redeem("0000000000000000")).toBeUndefined();
  expect(trust.redeem(code)).toBe(trust.secret());
  expect(trust.redeem(code)).toBeUndefined();
  const late = trust.issueCode();
  now += 31 * 60_000;
  expect(trust.codeKnown(late)).toBe(false);
  expect(trust.redeem(late)).toBeUndefined();
});

it("proves the secret in both directions and rejects wrong or reflected proofs", () => {
  const trust = new HelperTrust(null);
  const other = new HelperTrust(null);
  const client = trust.proof("client", "a", "b");
  expect(trust.verify(client, trust.proof("client", "a", "b"))).toBe(true);
  expect(trust.verify(client, trust.proof("server", "a", "b"))).toBe(false);
  expect(trust.verify(client, trust.proof("client", "b", "a"))).toBe(false);
  expect(trust.verify(other.proof("client", "a", "b"), client)).toBe(false);
  expect(trust.verify(undefined, client)).toBe(false);
  expect(trust.verify("short", client)).toBe(false);
});
