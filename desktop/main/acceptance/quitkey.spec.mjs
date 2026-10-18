import { test, expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, chord } from "./support.mjs";
import { background } from "./helpers.mjs";
import { record } from "./record.mjs";

const CTRL = 0xffe3,
  ALT = 0xffe9,
  SHIFT = 0xffe1,
  B = 0x62;

test("the quit key ends Blink within about a second from a hung renderer, and tells the linked terminal session", async () => {
  test.setTimeout(60000);
  const { app, data } = await launch();
  const rec = record("quit_hotkey", {
    suffix: "-324",
    fps: 6,
    also: ["quitkey"],
  });
  const exited = new Promise((done) =>
    app.process().once("exit", () => done(Date.now())),
  );
  try {
    await background(app);
    const { url, token } = await app.evaluate(
      () => globalThis.blinklingCompanion.address,
    );
    const response = await fetch(
      `${url}/link?session=terminal-quit&pid=1&cwd=/tmp/project&channel=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const reader = response.body.getReader();
    await reader.read();
    rec.frame("before");
    // Every window's page is stuck in a loop that never returns.
    for (const w of app.windows())
      void w
        .evaluate(() => {
          for (;;);
        })
        .catch(() => {});
    await new Promise((done) => setTimeout(done, 800));
    const started = Date.now();
    chord(CTRL, ALT, SHIFT, B);
    const decoder = new TextDecoder();
    let heard = "";
    while (!/Blink was closed/.test(heard)) {
      const { value, done } = await reader.read();
      if (done) break;
      heard += decoder.decode(value);
    }
    expect(heard).toMatch(/Blink was closed/);
    const ended = await exited;
    // The X server holds no window of the app once it has exited, so the
    // dim shape that can linger in a recording is only an unrepainted ghost.
    await new Promise((done) => setTimeout(done, 400));
    const tree = execFileSync("xwininfo", ["-root", "-tree"], {
      encoding: "utf8",
    });
    expect(tree).not.toMatch(/Blinkling|Blink\b|electron/i);
    rec.frame("gone");
    process.stdout.write(`quit key to exit: ${ended - started} ms\n`);
    expect(ended - started).toBeLessThan(1800);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
  void data;
});

test("a quit key the system refuses is shown as not set, never as null, and another key can be picked", async () => {
  test.setTimeout(90000);
  // Another client holds Control+Alt+Shift+B before Blink starts.
  const holder = spawn(
    "python3",
    [fileURLToPath(new URL("./grabkey.py", import.meta.url))],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise((done) => holder.stdout.once("data", done));
  const { app } = await launch();
  const rec = record("quitkey_unavailable", {
    suffix: "-324",
    fps: 6,
    also: ["quit_unavailable"],
  });
  try {
    await background(app);
    await app.evaluate(() => globalThis.blinklingTest.settings.open());
    await expect
      .poll(() => app.windows().find((p) => p.url().includes("/settings/")))
      .toBeTruthy();
    const settings = app
      .windows()
      .find((p) => p.url().includes("/settings/index.html"));
    await expect(settings.locator("#quit-label")).toHaveText("未設定");
    await expect(settings.locator("#quit-note")).toContainText("註冊失敗");
    for (const text of [
      await settings.locator("#quit-label").innerText(),
      await settings.locator("#quit-note").innerText(),
    ])
      expect(text).not.toMatch(/null|undefined/);
    rec.frame("not-set");
    // The holder lets go and the user picks another chord.
    holder.kill();
    await settings.locator("#quit-change").click();
    await settings.keyboard.press("Control+Alt+Shift+Q");
    await expect(settings.locator("#quit-label")).toHaveText(
      "Ctrl + Alt + Shift + Q",
    );
    await expect(settings.locator("#quit-help")).toContainText("Ctrl");
    rec.frame("picked");
  } finally {
    holder.kill();
    await rec.stop();
    await app.close().catch(() => {});
  }
});
