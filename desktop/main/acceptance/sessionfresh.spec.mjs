import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
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
  type,
  waitFor,
} from "./live.mjs";

// Three real Claude Code terminal sessions in tmux, one after the other.
const names = ["blinkA", "blinkB", "blinkC"];

test.skip(!LIVE, "needs live claude terminals: set BLINKLING_LIVE=1");

test("a Claude Code session Blink has not met opens a brand new chat, and neither Blink nor the terminal inherits the earlier one", async () => {
  test.setTimeout(480000);
  const { runtime, restore } = await pinToTree();
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  const rec = record("session_fresh", { suffix: "-323", fps: 2 });
  try {
    await background(app);
    await reveal(page);
    const start = (name, folder) => startTerminal(name, folder, runtime);
    // Terminal A: the first session. It opens Blink and has a short talk.
    start("blinkA", FOLDER);
    await ready("blinkA");
    type("blinkA", "/blinkling:blinkling");
    await waitFor("blinkA", /Blink|desktop_open/i);
    await sleep(4000);
    type("blinkA", "Reply with the single word MANGO and nothing else.");
    await waitFor("blinkA", /●\s*MANGO/);
    await writeFile(join(SAVE, "session_fresh-terminal-A.txt"), pane("blinkA"));
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
    await expect.poll(() => !!cardPage(app), { timeout: 15000 }).toBe(true);
    const card = cardPage(app);
    await expect
      .poll(async () => (await lines(card)).join("|"), { timeout: 30000 })
      .toContain("MANGO");
    rec.frame("session-A-chat");
    await sleep(1500);

    // Terminal B: a session Blink has not met. It opens Blink too.
    start("blinkB", FOLDER);
    await ready("blinkB");
    // The moment the session has linked, before it opens Blink itself, the
    // card has already moved to it and shows an empty chat.
    const follows = cardPage(app);
    await expect
      .poll(
        () =>
          follows.locator('.gl-chat-tab[aria-selected="true"]').textContent(),
        { timeout: 15000 },
      )
      .toContain("alpha #2");
    expect((await lines(follows)).join("|")).not.toContain("MANGO");
    type("blinkB", "/blinkling:blinkling");
    await waitFor("blinkB", /Blink|desktop_open/i);
    await sleep(5000);
    // The card follows the new session and its chat starts empty.
    const mine = cardPage(app);
    await expect
      .poll(async () => (await lines(mine)).join("|"), { timeout: 20000 })
      .not.toContain("MANGO");
    // Only the new session's own words are in it, none of the first talk.
    expect((await lines(mine)).join("|")).not.toContain("MANGO");
    rec.frame("session-B-fresh");
    // The older chat is still in the switcher and still holds its talk.
    const tabs = mine.locator(".gl-chat-tab");
    await expect
      .poll(() => tabs.count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    rec.frame("switcher");
    // The terminal does not carry A's words either: B has not heard MANGO.
    expect(pane("blinkB")).not.toMatch(/MANGO/);
    type("blinkB", "Reply with the single word PAPAYA and nothing else.");
    await waitFor("blinkB", /●\s*PAPAYA/);
    await expect
      .poll(async () => (await lines(mine)).join("|"), { timeout: 30000 })
      .toContain("PAPAYA");
    expect((await lines(mine)).join("|")).not.toContain("MANGO");
    await writeFile(join(SAVE, "session_fresh-terminal-B.txt"), pane("blinkB"));
    rec.frame("session-B-chat");
    await sleep(1500);
    // Going back to the first chat shows its own talk, not B's.
    await tabs.first().click();
    await expect
      .poll(async () => (await lines(mine)).join("|"), { timeout: 10000 })
      .toContain("MANGO");
    expect((await lines(mine)).join("|")).not.toContain("PAPAYA");
    rec.frame("back-to-A");
    await sleep(1500);

    // The first terminal ends (the last one to end takes Blink with it, so B
    // stays), then a third session starts in the same folder. It is a brand
    // new chat as well: none of the two earlier talks come back.
    type("blinkA", "/exit");
    await expect
      .poll(() => mine.locator('.gl-chat-tab[data-live="false"]').count(), {
        timeout: 30000,
      })
      .toBe(1);
    start("blinkC", FOLDER);
    await ready("blinkC");
    const third = cardPage(app);
    await expect
      .poll(
        () => third.locator('.gl-chat-tab[aria-selected="true"]').textContent(),
        { timeout: 15000 },
      )
      .toContain("alpha #3");
    type("blinkC", "/blinkling:blinkling");
    await waitFor("blinkC", /Blink|desktop_open/i);
    await sleep(4000);
    const now = (await lines(third)).join("|");
    expect(now).not.toContain("MANGO");
    expect(now).not.toContain("PAPAYA");
    expect(pane("blinkC")).not.toMatch(/MANGO|PAPAYA/);
    rec.frame("session-C-fresh");
    type("blinkC", "Reply with the single word KIWI and nothing else.");
    await waitFor("blinkC", /●\s*KIWI/);
    await expect
      .poll(async () => (await lines(third)).join("|"), { timeout: 30000 })
      .toContain("KIWI");
    expect(await mine.locator(".gl-chat-tab").count()).toBe(3);
    await writeFile(join(SAVE, "session_fresh-terminal-C.txt"), pane("blinkC"));
    rec.frame("session-C-chat");
    await sleep(1500);
  } finally {
    endTerminals(names);
    await rec.stop();
    await app.close().catch(() => {});
    await restore();
  }
});
