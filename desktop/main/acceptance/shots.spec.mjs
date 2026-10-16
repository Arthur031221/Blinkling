import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { PNG } from "pngjs";
import { launch, move, click } from "./support.mjs";
import { background, reveal, bubble } from "./helpers.mjs";
import { record } from "./record.mjs";

const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );
const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
/** Remembers every pose the figure played, frame by frame. */
const watch = (page) =>
  page.evaluate(() => {
    window.__poses = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__poses.at(-1) !== key) window.__poses.push(key);
      requestAnimationFrame(step);
    };
    step();
  });
const played = (page) => page.evaluate(() => window.__poses);
const miniPage = (app) =>
  app.windows().find((p) => /\/mini\/index\.html$/.test(p.url()));
const mini = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      /\/mini\/index\.html$/.test(w.webContents.getURL()),
    );
    return Boolean(w?.isVisible() && w.isFocused());
  });

test("the full screen bubble takes the whole screen, plays eat, clears the menu and asks in the mini composer with the picture attached", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("fullscreen_shot");
  try {
    const origin = await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await watch(page);
    await reveal(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    rec.frame("menu");
    const box = await bubble(page, "capture").boundingBox();
    const at = {
      x: origin.x + box.x + box.width / 2,
      y: origin.y + box.y + box.height / 2,
    };
    move(at.x, at.y);
    await page.waitForTimeout(300);
    const clicked = Date.now();
    click(at.x, at.y);

    // The click is answered at once: the menu has gone before the picture is.
    await expect
      .poll(async () => (await read(app)).menu, { intervals: [10] })
      .toBe(false);
    const answered = Date.now() - clicked;
    expect(answered).toBeLessThan(400);
    rec.frame("clicked");

    // Blink eats the picture, then the mini composer opens with it attached
    // and the cursor in the text box.
    await expect
      .poll(async () => (await played(page)).includes("eat"), {
        timeout: 3000,
      })
      .toBe(true);
    rec.frame("eat");
    await expect
      .poll(() => miniPage(app)?.locator(".mini-entry-image").count(), {
        timeout: 8000,
      })
      .toBe(1);
    await expect.poll(() => mini(app)).toBe(true);
    expect(
      await miniPage(app).evaluate(
        () => document.activeElement === document.querySelector(".mini-input"),
      ),
    ).toBe(true);
    // Nothing of the menu is left over the composer.
    await page.waitForTimeout(500);
    expect((await read(app)).menu).toBe(false);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Math.max(
              ...[...document.querySelectorAll("[data-action]")].map((e) =>
                Math.max(
                  Number(getComputedStyle(e).opacity),
                  Number(
                    getComputedStyle(e.querySelector(".action-label")).opacity,
                  ),
                ),
              ),
            ),
          ),
        { timeout: 2000 },
      )
      .toBeLessThan(0.05);
    rec.frame("asks");

    // Click outside; the picture stays in the draft.
    click(40, 40);
    await page.waitForTimeout(1500);
    await expect(miniPage(app).locator(".mini-entry-image")).toHaveCount(1);
  } finally {
    await rec.stop();
    await app.close();
  }
});

const tile = (red, green, blue) => {
  const png = new PNG({ width: 800, height: 500 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([red, green, blue, 255], i);
  return {
    image: {
      id: randomBytes(8).toString("hex"),
      name: "Page.png",
      mediaType: "image/png",
      data: PNG.sync.write(png).toString("base64"),
    },
    pixelWidth: 800,
    pixelHeight: 500,
  };
};
/** A browser extension that scrolls three tiles (or says it cannot), made
 * known to the real host the way the real one does it. */
async function companion(app, { tiles = 3, refuse = false } = {}) {
  const token = randomBytes(32).toString("hex");
  const calls = { fullPage: 0 };
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ companion: true }));
      return;
    }
    calls.fullPage++;
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    void (async () => {
      if (refuse) {
        res.end(JSON.stringify({ companionRequired: true }) + "\n");
        return;
      }
      const all = Array.from({ length: tiles }, (_, i) =>
        tile(40 + 70 * i, 120, 220 - 70 * i),
      );
      for (let i = 0; i < tiles; i++) {
        await new Promise((r) => setTimeout(r, 250));
        res.write(
          JSON.stringify({ progress: { completed: i + 1, total: tiles } }) +
            "\n",
        );
      }
      res.end(
        JSON.stringify({
          tiles: all,
          capturedAt: Date.now(),
          truncated: false,
          page: { url: "https://example.test/", title: "A long page" },
        }) + "\n",
      );
    })();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/desktop-companion`;
  const host = await app.evaluate(
    () => globalThis.blinklingTest.companionHost.address,
  );
  const answer = await fetch(`${host.url}/rpc`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${host.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "companion", url, token }),
  });
  expect(answer.ok).toBe(true);
  // The browser is the window in front, so the menu's bubble asks for a page.
  await app.evaluate(() => {
    globalThis.blinklingTest.features.capture.list = async () => [
      {
        id: "browser",
        bounds: { x: 80, y: 50, width: 900, height: 600 },
        title: "A long page - Google Chrome",
        app: "Google Chrome",
      },
    ];
  });
  return { calls, close: () => server.close() };
}
/** How long the main process was unable to run a timer, at worst. */
const stall = (app) =>
  app.evaluate(() => {
    const watch = (globalThis.__stall = { worst: 0, last: Date.now() });
    watch.timer = setInterval(() => {
      const now = Date.now();
      watch.worst = Math.max(watch.worst, now - watch.last - 20);
      watch.last = now;
    }, 20);
  });
const stalled = (app) =>
  app.evaluate(() => {
    clearInterval(globalThis.__stall.timer);
    return globalThis.__stall.worst;
  });

async function clickBubble(app, page, origin) {
  const box = await bubble(page, "capture").boundingBox();
  const at = {
    x: origin.x + box.x + box.width / 2,
    y: origin.y + box.y + box.height / 2,
  };
  move(at.x, at.y);
  await page.waitForTimeout(300);
  click(at.x, at.y);
}

test("with the browser extension the screenshot bubble takes the whole page, plays eat and asks with every tile attached, and the app never stalls while it scrolls", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("fullpage_shot");
  let fake;
  try {
    const frame = await background(app);
    fake = await companion(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await watch(page);
    await reveal(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    await stall(app);
    rec.frame("menu");
    const clicked = Date.now();
    await clickBubble(app, page, frame);
    await expect
      .poll(async () => (await read(app)).menu, { intervals: [10] })
      .toBe(false);
    expect(Date.now() - clicked).toBeLessThan(800);
    rec.frame("scrolling");
    await expect
      .poll(async () => (await played(page)).includes("eat"), {
        timeout: 8000,
      })
      .toBe(true);
    rec.frame("eat");
    await expect
      .poll(() => miniPage(app)?.locator(".mini-entry-image").count(), {
        timeout: 8000,
      })
      .toBe(3);
    await expect.poll(() => mini(app)).toBe(true);
    expect(fake.calls.fullPage).toBe(1);
    // Every tile keeps its picture in the box, not only the last one.
    await expect(miniPage(app).locator("img.mini-thumb")).toHaveCount(3, {
      timeout: 10000,
    });
    await expect(miniPage(app).locator(".mini-notice")).toBeHidden();
    expect(await stalled(app)).toBeLessThan(250);
    rec.frame("asks");
  } finally {
    fake?.close();
    await rec.stop();
    await app.close();
  }
});

test("when the extension cannot scroll the page the visible part is taken instead and one line says why", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("fullpage_note");
  try {
    const frame = await background(app);
    const fake = await companion(app, { refuse: true });
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await watch(page);
    await reveal(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    await clickBubble(app, page, frame);
    await expect
      .poll(async () => (await played(page)).includes("eat"), {
        timeout: 8000,
      })
      .toBe(true);
    await expect
      .poll(() => miniPage(app)?.locator(".mini-entry-image").count(), {
        timeout: 8000,
      })
      .toBe(1);
    const note = miniPage(app).locator(".mini-notice");
    await expect(note).toBeVisible();
    await expect(note).toContainText("整頁需要瀏覽器擴充功能");
    const oneLine = await note.evaluate(
      (el) =>
        el.getBoundingClientRect().height <=
        parseFloat(getComputedStyle(el).lineHeight) * 1.5,
    );
    expect(oneLine).toBe(true);
    await expect.poll(() => mini(app)).toBe(true);
    rec.frame("note");
    fake.close();
  } finally {
    await rec.stop();
    await app.close();
  }
});
