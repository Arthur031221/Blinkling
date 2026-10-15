import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { launch, nativeClick } from "./support.mjs";
import { native, desktopShot, report } from "../main/e2e/support.mjs";
import { native as captureKey } from "../capture/e2e/support.mjs";

test("native menu capture reaches the composer and the shared answer session", async () => {
  test.setTimeout(120000);
  await mkdir(report, { recursive: true });
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByRole("img", { name: "Blink" })).toBeVisible();
    await app.evaluate(async ({ BrowserWindow, screen }) => {
      const bg = new BrowserWindow({
        ...screen.getPrimaryDisplay().bounds,
        frame: false,
        show: false,
        backgroundColor: "#204080",
      });
      await bg.loadURL(
        "data:text/html," +
          encodeURIComponent(
            '<body style="margin:0;background:#204080;color:white;font:24px system-ui"><h1 style="margin:40px">Blinkling desktop capture</h1><div style="position:absolute;left:400px;top:200px;width:100px;height:80px;background:#ff0000"></div></body>',
          ),
      );
      bg.show();
    });
    native(30, 30);
    await page.waitForFunction(() => window.desktop.inspect().anchor);
    await desktopShot(app, "integrated-blink-peek");
    const point = await page.locator('rect[fill="#3ddc97"]').boundingBox();
    native(
      Math.round(Math.min(1272, point.x + point.width * 0.2)),
      Math.round(point.y + point.height * 0.72),
    );
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    // Revealing slides Blink inward: follow it, then rest for the fan.
    await page.waitForTimeout(900);
    const body = await page.locator('rect[fill="#3ddc97"]').boundingBox();
    native(
      Math.round(body.x + body.width * 0.2),
      Math.round(body.y + body.height * 0.72),
    );
    await page.waitForTimeout(1000);
    await expect(page.locator(".action-bubble")).toHaveCount(4);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll(".action-bubble")].every((bubble) => {
          const r = bubble.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight
          );
        }),
      ),
    ).toBe(true);
    await desktopShot(app, "integrated-menu");
    const region = page.getByRole("button", { name: "Capture", exact: true });
    await region.hover();
    await page.waitForTimeout(250);
    const r = await region.boundingBox();
    nativeClick(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    let selector;
    await expect
      .poll(() => {
        selector = app
          .windows()
          .find((p) => /\/capture\/selection\.html$/.test(p.url()));
        return !!selector;
      })
      .toBe(true);
    await expect(selector.locator("body")).toHaveAttribute(
      "data-ready",
      "true",
    );
    await selector.mouse.move(400, 200);
    await selector.mouse.down();
    await selector.mouse.move(500, 280, { steps: 16 });
    await selector.mouse.up();
    await expect(selector.locator("#size")).toHaveText("100 × 80");
    captureKey(500, 280, [0xff0d]);
    let card;
    await expect
      .poll(() => {
        card = app.windows().find((p) => p.url().includes("surface=card"));
        return !!card;
      })
      .toBe(true);
    card.on("pageerror", (error) => errors.push(error.message));
    await expect(card.locator(".gl-attachment-chip img")).toHaveCount(1);
    const uri = await card
      .locator(".gl-attachment-chip img")
      .getAttribute("src");
    const bytes = Buffer.from(uri.split(",")[1], "base64");
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([100, 80]);
    expect([...png.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    const question = "What color? One word.";
    await expect
      .poll(
        () => app.evaluate(() => globalThis.blinklingTest.session.status.state),
        { timeout: 60000 },
      )
      .toBe("connected");
    await card.getByRole("textbox", { name: "輸入問題" }).fill(question);
    await card.getByRole("textbox", { name: "輸入問題" }).press("Enter");
    const expected = process.env.BLINKLING_LIVE === "1" ? /red/i : /OK\./;
    await expect(
      card.locator(".gl-chat-message.gl-assistant").last(),
    ).toContainText(expected, { timeout: 60000 });
    await expect
      .poll(
        () => app.evaluate(() => !!globalThis.blinklingTest.session.active),
        { timeout: 60000 },
      )
      .toBe(false);
    const session = await app.evaluate(() => {
      const s = globalThis.blinklingTest.session;
      return {
        identity: s.identity(),
        status: s.status,
        selection: s.state.selection,
        messages: s.state.messages,
      };
    });
    const user = session.messages.find(
      (m) =>
        m.role === "user" &&
        m.content.some((c) => c.type === "text" && c.text === question),
    );
    expect(user.content.find((c) => c.type === "image").source.data).toBe(
      bytes.toString("base64"),
    );
    expect(
      session.messages.some(
        (m) =>
          m.role === "assistant" &&
          m.content.some((c) => c.type === "text" && expected.test(c.text)),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    if (process.env.BLINKLING_REMOTE_OBSERVER) {
      const { observe, verifyAnswer } = await import(
        pathToFileURL(process.env.BLINKLING_REMOTE_OBSERVER).href
      );
      const remote = await observe(session.identity, {
        question,
        imageSha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(remote.serverTranscriptVerified).toBe(true);
      await expect(
        card.locator(".gl-chat-message.gl-user").last(),
      ).toContainText(remote.question, { timeout: 60000 });
      await expect(
        card.locator(".gl-chat-message.gl-assistant").last(),
      ).toContainText(remote.answer, { timeout: 60000 });
      await expect
        .poll(
          () => app.evaluate(() => !!globalThis.blinklingTest.session.active),
          { timeout: 60000 },
        )
        .toBe(false);
      if (verifyAnswer) {
        expect(await verifyAnswer(session.identity, remote)).toBe(true);
      }
    }
    await desktopShot(app, "integrated-answer");
    if (process.env.BLINKLING_LIVE_REPORT) {
      await mkdir(process.env.BLINKLING_LIVE_REPORT, { recursive: true });
      await writeFile(
        join(process.env.BLINKLING_LIVE_REPORT, "capture.png"),
        bytes,
      );
      await writeFile(
        join(process.env.BLINKLING_LIVE_REPORT, "result.json"),
        JSON.stringify(
          {
            packaged: !!process.env.BLINKLING_TEST_EXECUTABLE,
            question,
            identity: session.identity,
            selection: session.selection,
            imageSha256: createHash("sha256").update(bytes).digest("hex"),
            messages: await app.evaluate(
              () => globalThis.blinklingTest.session.state.messages,
            ),
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await app.close();
  }
});
