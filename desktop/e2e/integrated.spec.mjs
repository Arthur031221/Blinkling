import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { launch, nativeClick } from "./support.mjs";
import { native, desktopShot, report, rigPoint } from "../main/e2e/support.mjs";

test("native menu screenshot reaches the composer and the shared answer session", async () => {
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
    const point = await rigPoint(page);
    native(Math.round(point.x), Math.round(point.y));
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(650);
    await expect(page.locator(".action-bubble")).toHaveCount(5);
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
    const region = page.locator('[data-action="capture"]');
    await region.hover();
    await page.waitForTimeout(250);
    const r = await region.boundingBox();
    nativeClick(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    // The bubble takes the largest area in one click: with no browser in front
    // that is the whole screen, so there is no selection step.
    // A capture flies into Blink and opens the card with the shot attached;
    // the question is typed there and the answer lands in the same card.
    let card;
    await expect
      .poll(() => {
        card = app.windows().find((p) => p.url().includes("surface=card"));
        return !!card;
      })
      .toBe(true);
    card.on("pageerror", (error) => errors.push(error.message));
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await expect(card.locator(".gl-attachment-chip img")).toHaveCount(1);
    const question = "What color? One word.";
    await expect
      .poll(
        () => app.evaluate(() => globalThis.blinklingTest.session.status.state),
        { timeout: 60000 },
      )
      .toBe("connected");
    // The stored copy of a message holds no pixels (PV-2); a live subscriber
    // sees what was sent, so record the picture as it goes out.
    await app.evaluate(() => {
      globalThis.sentImages = [];
      globalThis.blinklingTest.session.subscribe((event) => {
        if (event.type === "message" && event.role === "user")
          for (const block of event.content)
            if (block.type === "image")
              globalThis.sentImages.push(block.source.data);
      });
    });
    await card.locator(".gl-input").fill(question);
    await card.locator(".gl-input").press("Enter");
    const deck = () =>
      app.windows().find((p) => p.url().includes("composer/index.html"));
    const expected = process.env.BLINKLING_LIVE === "1" ? /red/i : /OK\./;
    await expect
      .poll(
        async () =>
          (await deck()?.locator(".gl-assistant").allTextContents())?.join(
            " ",
          ) ?? "",
        { timeout: 60000 },
      )
      .toMatch(expected);
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
    expect(user.content.some((c) => c.type === "image")).toBe(false);
    const sent = await app.evaluate(() => globalThis.sentImages);
    expect(sent).toHaveLength(1);
    const bytes = Buffer.from(sent[0], "base64");
    const png = PNG.sync.read(bytes);
    const shape = await app.evaluate(({ screen }) => {
      const d = screen.getPrimaryDisplay();
      return {
        width: Math.round(d.bounds.width * d.scaleFactor),
        height: Math.round(d.bounds.height * d.scaleFactor),
        scale: d.scaleFactor,
      };
    });
    expect([png.width, png.height]).toEqual([shape.width, shape.height]);
    const at = (x, y) => {
      const i =
        (Math.round(y * shape.scale) * png.width +
          Math.round(x * shape.scale)) *
        4;
      return [...png.data.subarray(i, i + 4)];
    };
    expect(at(450, 240)).toEqual([255, 0, 0, 255]);
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
      await expect
        .poll(
          async () =>
            (await deck()?.locator(".gl-assistant").allTextContents())?.join(
              " ",
            ) ?? "",
          { timeout: 60000 },
        )
        .toContain(remote.answer);
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
