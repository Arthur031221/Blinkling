import { test, expect } from "@playwright/test";
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
  const rec = record("quitkey", { suffix: "-323", fps: 6 });
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
    rec.frame("gone");
    process.stdout.write(`quit key to exit: ${ended - started} ms\n`);
    expect(ended - started).toBeLessThan(1800);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
  void data;
});
