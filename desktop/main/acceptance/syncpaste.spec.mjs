import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch } from "./support.mjs";
import { background, reveal, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import {
  FOLDER,
  LIVE,
  SAVE,
  cardPage,
  endTerminals,
  lines,
  pane,
  pinToTree,
  ready,
  startTerminal,
  tmux,
  type,
  waitFor,
} from "./live.mjs";

const PICTURE = join(tmpdir(), "blink-live-picture.png");
writeFileSync(
  PICTURE,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

test.skip(!LIVE, "needs live claude terminals: set BLINKLING_LIVE=1");

test("a paste typed in a real terminal reaches Blink as the words pasted, and the notice of a finished background task is not shown as a message", async () => {
  test.setTimeout(480000);
  const { runtime, restore } = await pinToTree();
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  const rec = record("sync_paste", {
    suffix: "-324",
    fps: 2,
    also: ["mirror_clean"],
  });
  try {
    await background(app);
    await reveal(page);
    startTerminal("blinkP", FOLDER, runtime);
    await ready("blinkP");
    type("blinkP", "/blinkling:blinkling");
    await waitFor("blinkP", /Blink|desktop_open/i);
    await sleep(4000);
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
    await expect.poll(() => !!cardPage(app), { timeout: 15000 }).toBe(true);
    const card = cardPage(app);

    // A long paste, as the terminal's own paste does it (bracketed), then a
    // question after it.
    const pasted = "line 1: one\nline 2: two\n\nline 4: four";
    tmux("set-buffer", "-b", "blinkpaste", pasted);
    tmux("paste-buffer", "-p", "-b", "blinkpaste", "-t", "blinkP");
    await sleep(800);
    type("blinkP", " Reply with the single word PEAR and nothing else.");
    await waitFor("blinkP", /●\s*PEAR/);
    await expect
      .poll(async () => (await lines(card)).join("|"), { timeout: 30000 })
      .toContain("PEAR");
    const afterPaste = await lines(card);
    await writeFile(join(SAVE, "sync_paste-terminal.txt"), pane("blinkP"));
    rec.frame("after-paste");
    const mine = afterPaste.find((line) => line.includes("line 2: two"));
    expect(mine, afterPaste.join("\n")).toBeTruthy();
    expect(mine).toContain("line 4: four");
    expect(afterPaste.join("|")).not.toMatch(/pasted_content|\[Pasted text/);
    await sleep(1500);

    // A long paste of 25 lines keeps its line breaks, and a pasted picture
    // path (which the terminal shows as [Image #N]) is not markup in Blink.
    const twentyFive = Array.from({ length: 25 }, (_, i) => `row ${i + 1}`);
    tmux("set-buffer", "-b", "blinkpaste", twentyFive.join("\n"));
    tmux("paste-buffer", "-p", "-b", "blinkpaste", "-t", "blinkP");
    await sleep(800);
    tmux("set-buffer", "-b", "blinkpaste", PICTURE);
    tmux("paste-buffer", "-p", "-b", "blinkpaste", "-t", "blinkP");
    await sleep(1200);
    type("blinkP", " Reply with the single word FIG and nothing else.");
    await waitFor("blinkP", /●\s*FIG/, 120);
    await expect
      .poll(async () => (await lines(card)).join("|"), { timeout: 30000 })
      .toContain("FIG");
    await writeFile(
      join(SAVE, "mirror_clean-324-terminal.txt"),
      pane("blinkP"),
    );
    const mirrored = await lines(card);
    const users = await card
      .locator(".gl-user")
      .evaluateAll((els) => els.map((el) => el.innerText));
    const long = users.find((line) => line.includes("row 13"));
    expect(long, users.join("\n--\n")).toBeTruthy();
    expect(long).toContain("row 25");
    expect(
      long.split("\n").length,
      "the 25 lines keep their breaks",
    ).toBeGreaterThan(20);
    expect(mirrored.join("|")).not.toMatch(
      /\[Image #\d+\]|\[Pasted text|system-reminder|task-notification/,
    );
    await writeFile(
      join(SAVE, "mirror_clean-324-chat.txt"),
      mirrored.join("\n"),
    );
    rec.frame("after-25-lines-and-picture");
    await sleep(1500);

    // A background task that finishes while the session waits: Claude Code
    // tells itself with a notice, and the notice is not a message of the user.
    const before = afterPaste.length;
    type(
      "blinkP",
      "Run this with the Bash tool in the background: sleep 6; echo finished. Then reply with the single word PLUM and nothing else.",
    );
    await waitFor("blinkP", /●\s*PLUM/, 120);
    await sleep(12000);
    await writeFile(join(SAVE, "sync_paste-terminal-task.txt"), pane("blinkP"));
    const all = (await lines(card)).join("\n");
    rec.frame("after-task");
    expect(all).toContain("PLUM");
    expect(all).not.toMatch(/task-notification|task-id|output-file|\/tmp\//);
    expect((await lines(card)).length).toBeGreaterThan(before);
    await sleep(1500);
  } finally {
    endTerminals(["blinkP"]);
    await rec.stop();
    await app.close().catch(() => {});
    await restore();
  }
});
