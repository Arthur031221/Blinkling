import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
test("sandboxed Blink opens frameless and exposes only narrow IPC", async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("img", { name: "Blink" })).toBeVisible();
    expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
    expect(
      await page.evaluate(() => Object.keys(window.glimpselet).sort()),
    ).toEqual([
      "action",
      "activity",
      "bubbleRegions",
      "close",
      "configuration",
      "hold",
      "interactive",
      "onCapture",
      "onEvent",
      "onShell",
      "onSurface",
      "openChat",
      "openLink",
      "pin",
      "select",
      "sendTurn",
      "shell",
      "stop",
      "typing",
    ]);
    // The test hook is installed once startup (bubbles, companion host) finishes.
    await expect
      .poll(() => app.evaluate(() => Boolean(globalThis.glimpseletTest)))
      .toBe(true);
    const state = await app.evaluate(() => {
      const w = globalThis.glimpseletTest.blink;
      return {
        top: w.isAlwaysOnTop(),
        focusable: w.isFocusable(),
        frame: w.getTitle(),
        web: w.webContents.getLastWebPreferences(),
      };
    });
    expect(state.top).toBe(true);
    expect(state.focusable).toBe(false);
    expect(state.web.sandbox).toBe(true);
    expect(state.web.contextIsolation).toBe(true);
    expect(state.web.nodeIntegration).toBe(false);
    await expect(
      page.evaluate(() => window.glimpselet.action("shell:exec")),
    ).rejects.toThrow(/Invalid desktop action/);
  } finally {
    await app.close();
  }
});
