import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { writeFile } from "node:fs/promises";
import { launch, background, native, reports } from "./support.mjs";
test("auto explain samples the native desktop, pauses for real input and submits excluded pixels to the shared session", async () => {
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await app.evaluate(() => {
      const listeners = new Set();
      globalThis.b3AutoTurns = [];
      globalThis.glimpseletTest.features.setSession({
        subscribe: (f) => {
          listeners.add(f);
          return () => listeners.delete(f);
        },
        send: async (t) => {
          globalThis.b3AutoTurns.push(t);
          for (const f of listeners) f({ type: "done", turnId: t.id });
        },
        stop: async () => {},
      });
    });
    await blink.evaluate(() => window.glimpselet.action("auto-explain"));
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    expect(await app.evaluate(() => globalThis.b3AutoTurns.length)).toBe(0);
    await new Promise((r) => setTimeout(r, 3100));
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    await app.evaluate(() =>
      globalThis.b3Background.webContents.executeJavaScript(
        "document.body.style.background='#e9d67d'",
      ),
    );
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    expect(await app.evaluate(() => globalThis.b3AutoTurns.length)).toBe(0);
    // An actual native keystroke resets the OS idle clock; no screen turn follows.
    native(30, 30, [97]);
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    expect(await app.evaluate(() => globalThis.b3AutoTurns.length)).toBe(0);
    await new Promise((r) => setTimeout(r, 3100));
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    expect(await app.evaluate(() => globalThis.b3AutoTurns.length)).toBe(1);
    const turn = await app.evaluate(() => globalThis.b3AutoTurns[0]);
    expect(turn.source).toBe("auto-explain");
    expect(turn.text).toContain("兩到三句");
    const bytes = Buffer.from(turn.attachments[0].data, "base64"),
      image = PNG.sync.read(bytes);
    expect(image.width).toBe(1280);
    expect(image.height).toBe(800);
    // Blink's body position has the underlying desktop color in the actual PNG.
    expect(
      Array.from(
        image.data.subarray(
          (660 * image.width + 1190) * 4,
          (660 * image.width + 1190) * 4 + 3,
        ),
      ),
    ).toEqual([233, 214, 125]);
    await writeFile(`${reports}/auto-explain.png`, bytes);
    await app.evaluate(() =>
      globalThis.b3Background.webContents.executeJavaScript(
        "document.body.style.background='#204080'",
      ),
    );
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    await app.evaluate(() => globalThis.glimpseletTest.features.auto.tick());
    expect(await app.evaluate(() => globalThis.b3AutoTurns.length)).toBe(1);
    await blink.evaluate(() => window.glimpselet.action("auto-explain"));
    expect(
      await app.evaluate(() => globalThis.glimpseletTest.features.auto.enabled),
    ).toBe(false);
  } finally {
    await close();
  }
});
