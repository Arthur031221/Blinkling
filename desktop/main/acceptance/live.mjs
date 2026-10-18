import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sleep } from "./helpers.mjs";

/** What the live specs share: real Claude Code terminals in tmux, linked to the
 * real Blink. They need a signed in claude, the installed plugin in the project
 * folders and network, so they run only when BLINKLING_LIVE=1. */
export const LIVE = process.env.BLINKLING_LIVE === "1";
export const FOLDER = "/tmp/blink-live/alpha";
export const SAVE =
  process.env.BLINKLING_LIVE_DIR ??
  "/home/levi/oss-engine/reports/glimpse-v3/r3";

// The plugin replaces a running Blink whose version is not the one its pinned
// manifest names, and the manifest keeps the last release until the release
// pins the next. The tree under test is the next one, so for this run the pin
// in the manifest and in the bundle the MCP server runs names it, and both
// files are put back afterwards.
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const PINS = [
  [here("../../../plugin/desktop/manifest.json"), /("version":\s*")[^"]+/],
  [
    here("../../../bin/blinkling.cjs"),
    /(var manifest_default = \{\s*schemaVersion: \d+,\s*version: ")[^"]+/,
  ],
];
const TREE_VERSION = JSON.parse(
  await readFile(here("../../package.json"), "utf8"),
).version;

export const tmux = (...args) =>
  execFileSync("tmux", args, { encoding: "utf8" }).toString();
export const pane = (name) => tmux("capture-pane", "-p", "-J", "-t", name);
export const type = (name, text) => {
  tmux("send-keys", "-t", name, "-l", text);
  tmux("send-keys", "-t", name, "Enter");
};
/** Presses through the start up questions of a claude terminal until its
 * input line is there. */
export const ready = async (name) => {
  for (let i = 0; i < 60; i++) {
    const text = pane(name);
    if (/local development|Loading development channels/i.test(text))
      tmux("send-keys", "-t", name, "Enter");
    else if (/trust this folder|Yes, I trust/i.test(text))
      tmux("send-keys", "-t", name, "Enter");
    else if (/^❯/m.test(text) && /Claude Code v/.test(text)) return text;
    await sleep(1000);
  }
  throw new Error(`${name} never showed its input line:\n${pane(name)}`);
};
/** Waits for text to show in the pane, allowing the permission questions of a
 * tool call to be answered with Enter. */
export const waitFor = async (name, pattern, seconds = 90) => {
  for (let i = 0; i < seconds; i++) {
    const text = pane(name);
    if (pattern.test(text)) return text;
    if (/Do you want to|Yes, and don't ask again|1\. Yes/i.test(text))
      tmux("send-keys", "-t", name, "Enter");
    await sleep(1000);
  }
  throw new Error(`${name} never showed ${pattern}:\n${pane(name)}`);
};
export const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
export const lines = (card) =>
  card
    .locator(".gl-chat-message")
    .evaluateAll((els) => els.map((el) => el.textContent.trim()));

/** A runtime folder for the run, and the pins aligned with the tree until
 * `restore` puts them back. */
export async function pinToTree() {
  const runtime = await mkdtemp(join(tmpdir(), "blink-live-rt-"));
  const pins = [];
  for (const [file, pattern] of PINS) {
    const text = await readFile(file, "utf8");
    pins.push([file, text]);
    await writeFile(file, text.replace(pattern, `$1${TREE_VERSION}`));
  }
  return {
    runtime,
    restore: async () => {
      for (const [file, text] of pins) await writeFile(file, text);
    },
  };
}
/** Starts a claude terminal in a folder, linked to the Blink of `runtime`. */
export const startTerminal = (
  name,
  folder,
  runtime,
  flags = "--dangerously-load-development-channels plugin:blinkling@blinkling",
) =>
  tmux(
    "new-session",
    "-d",
    "-s",
    name,
    "-x",
    "140",
    "-y",
    "45",
    "-c",
    folder,
    `env BLINKLING_RUNTIME_DIR=${runtime} claude --model haiku ${flags}`,
  );
export const endTerminals = (names) => {
  for (const name of names) {
    try {
      tmux("kill-session", "-t", name);
    } catch {
      /* the session was never started */
    }
  }
};
