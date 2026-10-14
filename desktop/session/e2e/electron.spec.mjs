import { test, expect, _electron } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { redPng } from "./image.mjs";
const root = fileURLToPath(new URL("./electron-harness.cjs", import.meta.url));
const fixture = fileURLToPath(
  new URL("./fake-claude.fixture.mjs", import.meta.url),
);
for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"]) {
    test(`session events cross the isolated Electron preload at ${scale * 100}% ${theme}`, async () => {
      const dir = await mkdtemp(join(tmpdir(), "glimpselet-electron-session-"));
      const app = await _electron.launch({
        args: [root, "--no-sandbox", `--force-device-scale-factor=${scale}`],
        env: { ...process.env, GLIMPSELET_E2E: "1", GLIMPSELET_REMOTE: "0" },
      });
      try {
        const page = await app.firstWindow();
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.getByRole("img", { name: "Blink" })).toBeVisible();
        await page.evaluate(() => {
          window.sessionEvents = [];
          window.glimpselet.onEvent((event) =>
            window.sessionEvents.push(event),
          );
        });
        await expect
          .poll(() => app.evaluate(() => typeof globalThis.startSessionTest))
          .toBe("function");
        await app.evaluate(
          (_electron, options) => globalThis.startSessionTest(options),
          { dir, fixture, nodeExecutable: process.execPath },
        );
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.sessionEvents.some((e) => e.type === "done"),
            ),
          )
          .toBe(true);
        const before = await page.evaluate(() => window.sessionEvents);
        expect(before.some((e) => e.type === "delta" && e.text === "OK.")).toBe(
          true,
        );
        const source = before.find(
          (e) => e.type === "message" && e.role === "user",
        ).content[0].source;
        expect(source.data).toBe(redPng);
        const decoded = PNG.sync.read(Buffer.from(source.data, "base64"));
        expect([decoded.width, decoded.height]).toEqual([64, 64]);
        expect([...decoded.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
        const firstIdentity = before.find((e) => e.type === "identity");
        await app.evaluate(() =>
          globalThis.sessionUnderTest.transport.child.kill("SIGTERM"),
        );
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                window.sessionEvents.filter((e) => e.type === "identity")
                  .length,
            ),
          )
          .toBe(2);
        const after = await page.evaluate(() => window.sessionEvents);
        expect(after.filter((e) => e.type === "identity").at(-1)).toEqual(
          firstIdentity,
        );
        expect(
          after.filter((e) => e.type === "message" && e.role === "assistant"),
        ).toHaveLength(1);
        expect(JSON.stringify(after)).not.toContain("mustNotReachRenderer");
        const png = await app.evaluate(async ({ desktopCapturer, screen }) => {
          const display = screen.getPrimaryDisplay();
          const source = (
            await desktopCapturer.getSources({
              types: ["screen"],
              thumbnailSize: {
                width: Math.round(display.bounds.width * display.scaleFactor),
                height: Math.round(display.bounds.height * display.scaleFactor),
              },
            })
          )[0];
          return source.thumbnail.toPNG().toString("base64");
        });
        if (process.env.GLIMPSELET_SESSION_REPORT_DIR)
          await writeFile(
            join(
              process.env.GLIMPSELET_SESSION_REPORT_DIR,
              `session-${scale * 100}-${theme}.png`,
            ),
            Buffer.from(png, "base64"),
          );
        await app.evaluate(() => globalThis.sessionUnderTest.dispose());
      } finally {
        await app
          .evaluate(() => globalThis.sessionUnderTest?.dispose())
          .catch(() => {});
        await app.close();
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
