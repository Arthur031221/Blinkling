import { expect, test, type Page } from "@playwright/test";

async function sharedPanel(page: Page, streaming = false) {
  await page.addInitScript(
    ({ streaming }) => {
      Object.assign(window, { __glimpseletSession: "test-session" });
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getDisplayMedia: async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 400;
            const context = canvas.getContext("2d")!;
            context.fillStyle = "#c86448";
            context.fillRect(0, 0, 640, 400);
            return canvas.captureStream(2);
          },
        },
      });
      if (streaming) {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          if (input !== "/api/ask") return nativeFetch(input, init);
          let controller: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>({
            start(value) {
              controller = value;
            },
          });
          const encoder = new TextEncoder();
          Object.assign(window, {
            __sendAnswer: (text: string, done = false) => {
              controller.enqueue(
                encoder.encode(
                  done
                    ? `event: done\ndata: ${JSON.stringify({ entry: { id: "stream-answer", at: Date.now(), question: "Explain this screen", answer: text, kind: "ask" } })}\n\n`
                    : `event: delta\ndata: ${JSON.stringify({ text })}\n\n`,
                ),
              );
              if (done) controller.close();
            },
          });
          return new Response(stream, {
            headers: { "Content-Type": "text/event-stream" },
          });
        };
      }
    },
    { streaming },
  );
  await page.route("**/api/history", (route) =>
    route.fulfill({ json: { entries: [], expiresAfterMs: 600000 } }),
  );
  await page.route("**/api/pause", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Share a screen", exact: true })
    .click();
  await expect(page.locator(".stage .frame")).toBeVisible();
}

test("compact composer fits a 520 pixel tall panel at every supported width", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.removeItem("glimpselet-settings"),
  );
  for (const width of [360, 420, 520]) {
    await page.setViewportSize({ width, height: 520 });
    await page.goto("/?demo=1");
    await expect(page.locator(".stage .frame")).toBeVisible();
    await page.getByRole("button", { name: "Make panel compact" }).click();
    const button = page.getByRole("button", { name: "Ask", exact: true });
    const bounds = await button.boundingBox();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(520);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("keyboard selects and masks a frame and live resumption preserves privacy controls", async ({
  page,
}) => {
  await sharedPanel(page);
  await page.keyboard.press("s");
  await expect(page.locator(".stage")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator(".selection")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".status-source")).toContainText("Selected area");
  await page.getByRole("button", { name: /redaction/ }).click();
  await expect(page.locator(".stage")).toBeFocused();
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.locator(".status-source")).toContainText("Masks: 1");
  await page.getByRole("button", { name: "Resume live view" }).click();
  await expect(page.locator(".status-source")).toContainText("Live");
  await expect(page.locator(".status-source")).toContainText("Masks: 1");
  await expect(page.locator(".selection")).toHaveCount(1);
  await expect(page.locator(".mask")).toHaveCount(1);
  await page.getByRole("button", { name: /redaction/ }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.locator(".hint")).toHaveCount(0);
  await expect(page.locator(".status-source")).toContainText("Masks: 1");
});

test("streamed answers follow new text until the reader scrolls up", async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 680 });
  await sharedPanel(page, true);
  await page.getByRole("textbox").fill("Explain this screen");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".answer-empty")).toHaveText(
    "The answer will appear here.",
  );
  await expect(page.locator(".thinking-dots")).toBeVisible();
  await expect(
    page.locator(".answer").getByRole("button", { name: "Pin", exact: true }),
  ).toBeDisabled();
  const initial = Array.from(
    { length: 16 },
    (_, index) =>
      `Paragraph ${index + 1}: this is a long explanation of the selected screen.\n\n`,
  ).join("");
  await page.evaluate(
    (text) =>
      (
        window as Window & {
          __sendAnswer: (text: string, done?: boolean) => void;
        }
      ).__sendAnswer(text),
    initial,
  );
  await expect(page.locator(".answer .markdown")).toContainText("Paragraph 16");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const end = document
          .querySelector(".answer-end")!
          .getBoundingClientRect();
        return end.bottom <= innerHeight + 1;
      }),
    )
    .toBe(true);
  await page.locator("main.app").evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect
    .poll(() => page.locator("main.app").evaluate((node) => node.scrollTop))
    .toBe(0);
  // Flush the scroll event before a subsequent server chunk arrives.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const extra =
    "A later paragraph arrives while the reader is reviewing the screen.\n\n";
  await page.evaluate(
    (text) =>
      (
        window as Window & {
          __sendAnswer: (text: string, done?: boolean) => void;
        }
      ).__sendAnswer(text),
    extra,
  );
  await expect(page.locator(".answer .markdown")).toContainText(
    "A later paragraph",
  );
  expect(
    await page.locator("main.app").evaluate((node) => node.scrollTop),
  ).toBe(0);
  await page.evaluate(
    (text) =>
      (
        window as Window & {
          __sendAnswer: (text: string, done?: boolean) => void;
        }
      ).__sendAnswer(text, true),
    initial + extra,
  );
  await expect(page.locator(".answer")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".thinking-dots")).toHaveCount(0);
  await expect(
    page.locator(".answer").getByRole("button", { name: "Pin", exact: true }),
  ).toBeEnabled();
});

test("detailed 4K frames fit the bridge request limit and keep masks opaque after downscaling", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  const result = await page.evaluate(async () => {
    const { processScreenImage } = await import("/src/screen.ts");
    const source = document.createElement("canvas");
    source.width = 3840;
    source.height = 2160;
    const context = source.getContext("2d")!;
    const pixels = context.createImageData(source.width, source.height);
    let seed = 17;
    for (let index = 0; index < pixels.data.length; index += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        pixels.data[index + channel] = (seed >>> 24) | 1;
      }
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const raw = source.toDataURL("image/png");
    const masked = await processScreenImage(
      raw,
      [0.1, 0.1, 0.8, 0.8],
      [[0.2, 0.2, 0.3, 0.3]],
    );
    const image = new Image();
    image.src = masked;
    await image.decode();
    const output = document.createElement("canvas");
    output.width = image.naturalWidth;
    output.height = image.naturalHeight;
    const rendered = output.getContext("2d")!;
    rendered.drawImage(image, 0, 0);
    const x = Math.floor(output.width * 0.25);
    const y = Math.floor(output.height * 0.25);
    const secret = Array.from(rendered.getImageData(x, y, 1, 1).data);
    const visible = Array.from(rendered.getImageData(0, 0, 1, 1).data);
    const left = Math.floor((384 * output.width) / 3072);
    const top = Math.floor((216 * output.height) / 1728);
    const right = Math.ceil((1536 * output.width) / 3072);
    const bottom = Math.ceil((864 * output.height) / 1728);
    const edges = [
      [left, top],
      [right - 1, top],
      [left, bottom - 1],
      [right - 1, bottom - 1],
    ].map(([px, py]) => Array.from(rendered.getImageData(px!, py!, 1, 1).data));
    return {
      width: output.width,
      height: output.height,
      requestBytes: new TextEncoder().encode(
        JSON.stringify({ image: masked, question: "Describe the screen" }),
      ).length,
      rawBytes: raw.length,
      secret,
      visible,
      edges,
    };
  });
  expect(result.rawBytes).toBeGreaterThan(8 * 1024 * 1024);
  expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1536);
  expect(result.width * result.height).toBeLessThanOrEqual(1_800_000);
  expect(result.requestBytes).toBeLessThan(8 * 1024 * 1024);
  expect(result.secret).toEqual([0, 0, 0, 255]);
  for (const edge of result.edges) expect(edge).toEqual([0, 0, 0, 255]);
  expect(result.visible).not.toEqual([0, 0, 0, 255]);
});

test("Blink becomes still when reduced motion is enabled during a session", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await expect(page.locator("header .blink-rig g").first()).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const readAfterFrames = () =>
    page.locator("header .blink-rig").evaluate(async (node) => {
      for (let frame = 0; frame < 8; frame++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      return node.innerHTML;
    });
  const first = await readAfterFrames();
  expect(await readAfterFrames()).toBe(first);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await readAfterFrames()).not.toBe(first);
});

test("blocked browser storage still allows preferences and modal closing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage disabled", "SecurityError");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Theme").selectOption("dark");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("main.app")).toHaveClass(/dark/);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test("popup reopening restores resized geometry and focuses the composer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: undefined,
    });
    const open = window.open.bind(window);
    window.open = (url, target, features) => {
      Object.assign(window, { __floatingFeatures: features });
      return open(url, target, features);
    };
  });
  await page.goto("/?demo=1");
  await expect(page.locator(".stage .frame")).toBeVisible();
  const firstOpened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Float panel", exact: true }).click();
  const first = await firstOpened;
  await expect(first.locator("main.app")).toBeVisible();
  await expect(first.getByRole("textbox")).toBeFocused();
  await first.setViewportSize({ width: 500, height: 610 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem("glimpselet-floating-geometry-v1");
        return value && JSON.parse(value).dimensions.expanded.popup.width;
      }),
    )
    .toBe(500);
  await first.close();
  await expect(page.locator("main.app")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Float panel", exact: true }),
  ).toBeFocused();
  // Preferences survive a new document, rather than only the open panel.
  await page.reload();
  const nextOpened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Float panel", exact: true }).click();
  const next = await nextOpened;
  await expect(next.locator("main.app")).toBeVisible();
  const features = await page.evaluate(
    () =>
      (window as Window & { __floatingFeatures: string }).__floatingFeatures,
  );
  expect(features).toContain("width=500");
  expect(features).toContain("height=610");
  expect(features).toMatch(/left=\d+,top=\d+/);
  await expect(
    next.getByRole("button", { name: "Resize panel" }),
  ).toBeVisible();
  await next.close();
});

test("reloading the opener reuses a popup without stale content or styles", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/?demo=1");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Float panel", exact: true }).click();
  const popup = await opened;
  await expect(popup.locator("main.app")).toBeVisible();
  await popup.getByRole("textbox").fill("An old popup question");
  const styles = await popup
    .locator('head link[rel="stylesheet"], head style')
    .count();
  await page.reload();
  expect(popup.isClosed()).toBe(false);
  await page.getByRole("button", { name: "Float panel", exact: true }).click();
  await expect(popup.locator("main.app")).toHaveCount(1);
  await expect(popup.getByRole("textbox")).toHaveValue("");
  await expect(
    popup.locator('head link[rel="stylesheet"], head style'),
  ).toHaveCount(styles);
  await expect(popup.getByRole("textbox")).toBeFocused();
  await popup.close();
});

for (const [direction, from, to, adjust] of [
  ["forward", [0.25, 0.25], [0.75, 0.75], false],
  ["reverse", [0.75, 0.75], [0.25, 0.25], false],
  ["reverse horizontal", [0.75, 0.25], [0.25, 0.75], true],
  ["reverse vertical", [0.25, 0.75], [0.75, 0.25], false],
] as const) {
  test(`keyboard completion keeps ${direction} redaction opaque`, async ({
    page,
  }) => {
    let sentImage = "";
    await page.route("**/api/ask", async (route) => {
      const request = route.request().postDataJSON();
      sentImage = request.image;
      await route.fulfill({
        contentType: "text/event-stream",
        body: `event: done\ndata: ${JSON.stringify({ entry: { id: "redacted", at: Date.now(), kind: "ask", question: request.question, answer: "The redacted image was received." } })}\n\n`,
      });
    });
    await sharedPanel(page);
    await page.getByRole("button", { name: /redaction/ }).click();
    const bounds = await page.locator(".stage .frame").boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(
      bounds!.x + bounds!.width * from[0],
      bounds!.y + bounds!.height * from[1],
    );
    await page.mouse.down();
    try {
      await page.mouse.move(
        bounds!.x + bounds!.width * to[0],
        bounds!.y + bounds!.height * to[1],
        { steps: 4 },
      );
      if (adjust) await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Enter");
    } finally {
      await page.mouse.up();
    }
    await expect(page.locator(".status-source")).toContainText("Masks: 1");
    await page.getByRole("textbox").fill("Describe the visible controls");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect.poll(() => sentImage).not.toBe("");
    const pixels = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return {
        hidden: Array.from(
          context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
        ),
        visible: Array.from(context.getImageData(0, 0, 1, 1).data),
      };
    }, sentImage);
    expect(pixels.hidden).toEqual([0, 0, 0, 255]);
    expect(pixels.visible).toEqual([200, 100, 72, 255]);
  });
}
