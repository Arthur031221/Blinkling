import { test, expect } from "@playwright/test";

test("panel status and capture controls fit narrow and wide windows", async ({
  page,
}) => {
  for (const width of [360, 420, 520]) {
    await page.setViewportSize({ width, height: 680 });
    await page.goto("/?demo=1");
    await expect(page.locator(".stage .frame")).toBeVisible();
    const bounds = await page.evaluate(() => {
      const header = document.querySelector("header")!.getBoundingClientRect();
      const status = document.querySelector(".status")!.getBoundingClientRect();
      const body = document.querySelector(".body")!.getBoundingClientRect();
      const tools = document.querySelector(".tools")!.getBoundingClientRect();
      return {
        headerBottom: header.bottom,
        statusTop: status.top,
        statusBottom: status.bottom,
        bodyTop: body.top,
        statusHeight: status.height,
        controlsFit: [...document.querySelectorAll(".tools button")].every(
          (button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= tools.left && rect.right <= tools.right + 1;
          },
        ),
      };
    });
    expect(bounds.statusTop).toBeGreaterThanOrEqual(bounds.headerBottom);
    expect(bounds.bodyTop).toBeGreaterThanOrEqual(bounds.statusBottom);
    expect(bounds.statusHeight).toBeGreaterThan(25);
    expect(bounds.controlsFit).toBe(true);
    await page.getByRole("button", { name: "Make panel compact" }).click();
    const preview = await page.evaluate(() => {
      const stage = document.querySelector(".stage")!.getBoundingClientRect();
      const image = document
        .querySelector(".stage .frame")!
        .getBoundingClientRect();
      return {
        top: image.top - stage.top,
        bottom: stage.bottom - image.bottom,
        left: image.left - stage.left,
        right: stage.right - image.right,
      };
    });
    for (const inset of Object.values(preview)) {
      expect(inset).toBeGreaterThanOrEqual(-1);
    }
    await page.getByRole("button", { name: "Expand panel" }).click();
  }
});

async function mockPanel(
  page: import("@playwright/test").Page,
  portrait = false,
) {
  await page.addInitScript(() => {
    (window as Window & { __glimpseletSession?: string }).__glimpseletSession =
      "test-session";
  });
  await page.route("**/api/history", (route) =>
    route.fulfill({ json: { entries: [], expiresAfterMs: 600000 } }),
  );
  await page.route("**/api/clear", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/pause", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/ask", async (route) => {
    const body = route.request().postDataJSON();
    if (body.mode === "passive") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const answer =
      body.mode === "summary"
        ? "Summary of recent notes."
        : body.mode === "passive"
          ? "The panel changed."
          : `Mock answer: ${body.question}`;
    const entry = {
      id: String(Date.now()),
      at: Date.now(),
      question: body.question,
      answer,
      kind: body.mode,
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: delta\ndata: {"text":${JSON.stringify(answer)}}\n\nevent: done\ndata: {"entry":${JSON.stringify(entry)}}\n\n`,
    });
  });
  await page.addInitScript(
    ({ portrait }) => {
      let canvas: HTMLCanvasElement;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getDisplayMedia: async () => {
            canvas = document.createElement("canvas");
            canvas.width = portrait ? 200 : 320;
            canvas.height = portrait ? 320 : 200;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#d84a31";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#245bc5";
            ctx.fillRect(90, 60, 100, 80);
            (window as Window & { __changeFrame?: () => void }).__changeFrame =
              () => {
                ctx.fillStyle = "#18a96c";
                ctx.fillRect(210, 20, 70, 70);
              };
            const stream = canvas.captureStream(2);
            (
              window as Window & { __shareTrack?: MediaStreamTrack }
            ).__shareTrack = stream.getVideoTracks()[0];
            return stream;
          },
        },
      });
    },
    { portrait },
  );
}

test("settings dialog keeps keyboard focus contained while tabbing", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/?demo=1");
  const settingsButton = page.getByRole("button", { name: "Settings" });
  await settingsButton.click();
  const dialog = page.locator("dialog.settings");
  await expect(dialog).toBeVisible();

  const language = dialog.getByLabel("Language");
  await language.focus();
  for (let tab = 0; tab < 6; tab++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
});

test("Escape closes settings and returns focus to its opener", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/?demo=1");
  const settingsButton = page.getByRole("button", { name: "Settings" });
  await settingsButton.click();
  const dialog = page.locator("dialog.settings");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settingsButton).toBeFocused();
});

test("changing the settings language updates the document language", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Language").selectOption("ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await page.keyboard.press("Escape");
});

test("Escape cancels an ask from the focused composer and ignores its late response", async ({
  page,
}) => {
  await mockPanel(page);
  let releaseResponse!: () => void;
  let requestStarted!: () => void;
  let requestFinished!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    requestFinished = resolve;
  });
  await page.route("**/api/ask", async (route) => {
    requestStarted();
    await responseGate;
    const body = route.request().postDataJSON();
    const answer = "Late answer that must be ignored.";
    const entry = {
      id: "late-answer",
      at: Date.now(),
      question: body.question,
      answer,
      kind: body.mode,
    };
    try {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `event: delta\ndata: {"text":${JSON.stringify(answer)}}\n\nevent: done\ndata: {"entry":${JSON.stringify(entry)}}\n\n`,
      });
    } catch {
      // Aborting the browser request can close the routed response first.
    } finally {
      requestFinished();
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect(page.getByText(/Sharing/)).toBeVisible();
  await expect(page.getByRole("textbox")).toBeVisible();
  const composer = page.getByRole("textbox");
  await composer.fill("Keep this question after cancelling");
  await composer.press("Control+Enter");
  await started;
  await expect(composer).toBeFocused();
  try {
    await composer.press("Escape");
    await expect(
      page.getByRole("button", { name: "Cancel answer" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Answer cancelled. Your question is still here."),
    ).toBeVisible();
    await expect(composer).toHaveValue("Keep this question after cancelling");
  } finally {
    releaseResponse();
    await finished;
  }
  await expect(page.getByText("Late answer that must be ignored.")).toHaveCount(
    0,
  );
  await expect(composer).toHaveValue("Keep this question after cancelling");
});

test("Escape prevents transmission while a screen capture is decoding", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect(page.locator(".stage .frame")).toBeVisible();
  await page.evaluate(() => {
    const state = { started: 0, completed: 0, calls: 0, release: () => {} };
    const gate = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      state.started++;
      await gate;
      state.completed++;
    };
    const fetch = window.fetch;
    window.fetch = (...args) => {
      if (String(args[0]).includes("/api/ask")) state.calls++;
      return fetch(...args);
    };
    Object.assign(window, { captureDecodeTest: state });
  });
  const state = () =>
    page.evaluate(() => {
      const { started, completed, calls } = (
        window as Window & {
          captureDecodeTest: {
            started: number;
            completed: number;
            calls: number;
          };
        }
      ).captureDecodeTest;
      return { started, completed, calls };
    });
  const composer = page.getByRole("textbox");
  await composer.fill("Cancel this before sharing the capture");
  await composer.press("Control+Enter");
  await expect.poll(async () => (await state()).started).toBe(1);
  await composer.press("Escape");
  await page.evaluate(() => {
    (
      window as Window & { captureDecodeTest: { release(): void } }
    ).captureDecodeTest.release();
  });
  await expect.poll(async () => (await state()).completed).toBe(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect((await state()).calls).toBe(0);
  await expect(composer).toHaveValue("Cancel this before sharing the capture");
  await composer.press("Control+Enter");
  await expect.poll(async () => (await state()).calls).toBe(1);
  await expect(page.getByText("Answer ready.")).toBeVisible();
});

test("unpinning an older answer keeps the current answer visible", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect(page.getByText(/Sharing/)).toBeVisible();
  const composer = page.getByRole("textbox");
  await composer.fill("What changed first?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "Mock answer: What changed first?",
  );
  await page.getByRole("button", { name: "Pin", exact: true }).click();

  await composer.fill("What changed next?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "Mock answer: What changed next?",
  );
  const olderPinnedAnswer = page.locator("article.answer.pinned");
  await expect(olderPinnedAnswer).toContainText("What changed first?");
  await olderPinnedAnswer.getByRole("button", { name: "Unpin" }).click();
  await expect(olderPinnedAnswer).toHaveCount(0);
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "Mock answer: What changed next?",
  );
});

test("clearing demo history keeps the fixture available for another question", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/?demo=1");
  const fixture = page.getByRole("img", {
    name: "Labeled static demo fixture",
  });
  await expect(fixture).toBeVisible();
  await page.getByRole("textbox").fill("Which control saves the settings?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "This prerecorded answer makes no provider call",
  );

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(
    page.getByText("History, pins, and in-memory key cleared."),
  ).toBeVisible();
  await expect(fixture).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("textbox").fill("What color is the button?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "The fixture shows a Save control at the lower right.",
  );
});

test("crop and redaction overlays stay aligned to the image after viewport resize", async ({
  page,
}) => {
  await mockPanel(page);
  await page.setViewportSize({ width: 520, height: 820 });
  await page.goto("/?demo=1");
  const frame = page.locator(".stage .frame");
  await expect(frame).toBeVisible();
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error("demo image is missing");

  await page.getByRole("button", { name: "Select area" }).click();
  await page.mouse.move(
    frameBox.x + frameBox.width * 0.14,
    frameBox.y + frameBox.height * 0.18,
  );
  await page.mouse.down();
  await page.mouse.move(
    frameBox.x + frameBox.width * 0.58,
    frameBox.y + frameBox.height * 0.64,
  );
  await page.mouse.up();
  await expect(page.locator(".selection")).toBeVisible();

  await page.getByRole("button", { name: "Add opaque redaction" }).click();
  await page.mouse.move(
    frameBox.x + frameBox.width * 0.66,
    frameBox.y + frameBox.height * 0.22,
  );
  await page.mouse.down();
  await page.mouse.move(
    frameBox.x + frameBox.width * 0.88,
    frameBox.y + frameBox.height * 0.48,
  );
  await page.mouse.up();
  await expect(page.locator(".mask")).toBeVisible();

  const relativeOverlayBounds = async () =>
    page.evaluate(() => {
      const image = document
        .querySelector(".stage .frame")!
        .getBoundingClientRect();
      const relative = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return [
          (box.left - image.left) / image.width,
          (box.top - image.top) / image.height,
          box.width / image.width,
          box.height / image.height,
        ];
      };
      return { crop: relative(".selection"), mask: relative(".mask") };
    });
  const beforeResize = await relativeOverlayBounds();
  await page.setViewportSize({ width: 360, height: 820 });
  await expect
    .poll(async () => {
      const afterResize = await relativeOverlayBounds();
      return [...beforeResize.crop, ...beforeResize.mask].every(
        (value, index) =>
          Math.abs(value - [...afterResize.crop, ...afterResize.mask][index]!) <
          0.03,
      );
    })
    .toBe(true);
});

test("fixture uses prerecorded answer, rectangle drag, preferences and narrow dark styles", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("glimpselet-settings", "not-json"),
  );
  await page.setViewportSize({ width: 360, height: 820 });
  await page.goto("/?demo=1");
  await expect(
    page.getByText("Demo fixture", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Labeled static demo fixture" }),
  ).toBeVisible();
  await page.getByRole("textbox").fill("Which control saves the settings?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "This prerecorded answer makes no provider call",
  );
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await page.getByRole("textbox").fill("What color is the button?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown").last()).toContainText(
    "The fixture shows a Save control at the lower right.",
  );
  await expect(page.getByText("Pinned answer")).toBeVisible();
  await page.getByRole("button", { name: "Select area" }).click();
  const box = await page.locator(".stage .frame").boundingBox();
  if (!box) throw new Error("stage is missing");
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.46, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".selection")).toBeVisible();
  await page.getByRole("button", { name: "Add opaque redaction" }).click();
  await page.mouse.move(box.x + box.width * 0.61, box.y + box.height * 0.16);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.83, box.y + box.height * 0.35, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".mask")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Theme").selectOption("dark");
  await page.getByLabel("Language").selectOption("zh-TW");
  await expect(page.locator("main.app")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "凍結畫面" })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(
    await page
      .locator("main.app")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--paper").trim(),
      ),
  ).toBe("#0a0a0b");
});

test("portrait crop coordinates and opaque masks reach the backend as the exact PNG", async ({
  page,
}) => {
  await mockPanel(page, true);
  const sockets: Array<{
    route: import("@playwright/test").WebSocketRoute;
    messages: Array<{
      type: string;
      active?: boolean;
      id?: string;
      error?: string;
      image?: string;
    }>;
  }> = [];
  await page.routeWebSocket("ws://127.0.0.1:5173/api/stream", (route) => {
    const connection = {
      route,
      messages: [] as Array<{
        type: string;
        active?: boolean;
        id?: string;
        error?: string;
        image?: string;
      }>,
    };
    sockets.push(connection);
    route.onMessage((message) =>
      connection.messages.push(JSON.parse(String(message))),
    );
  });
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect(page.getByText(/Sharing/)).toBeVisible();
  await page.getByRole("button", { name: "Freeze frame" }).click();
  const stage = page.locator(".stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("stage is missing");
  await page.getByRole("button", { name: "Select area" }).click();
  await page.mouse.move(box.x + 32, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 210, box.y + 150);
  await page.mouse.up();
  await page.getByRole("button", { name: "Redact" }).click();
  await page.mouse.move(box.x + 65, box.y + 55);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 110);
  await page.mouse.up();
  let posted:
    | { image: string; question: string; mode: string; backend: string }
    | undefined;
  await page.route("**/api/ask", async (route) => {
    posted = route.request().postDataJSON();
    const image = posted!.image;
    const pixels = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      const rgba = x.getImageData(0, 0, c.width, c.height).data;
      let blackPixels = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i] === 0 && rgba[i + 1] === 0 && rgba[i + 2] === 0)
          blackPixels++;
      }
      return {
        w: c.width,
        h: c.height,
        blackPixels,
      };
    }, image);
    expect(pixels.w).toBeLessThan(200);
    expect(pixels.h).toBeLessThan(320);
    expect(pixels.blackPixels).toBeGreaterThan(0);
    const answer = "Masked answer";
    const entry = {
      id: "e1",
      at: Date.now(),
      question: posted!.question,
      answer,
      kind: "ask",
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: delta\ndata: {"text":"${answer}"}\n\nevent: done\ndata: {"entry":${JSON.stringify(entry)}}\n\n`,
    });
  });
  await page.getByRole("textbox").fill("Read the masked interface");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown")).toContainText(
    "Masked answer",
  );
  expect(posted).toMatchObject({
    question: "Read the masked interface",
    mode: "ask",
    backend: "cli",
  });
  expect(posted?.image).toMatch(/^data:image\/png;base64,/);
  await expect
    .poll(() =>
      sockets.at(-1)?.messages.some((m) => m.type === "share" && m.active),
    )
    .toBe(true);
  const currentSocket = sockets.at(-1)!;
  currentSocket.route.send(
    JSON.stringify({ type: "capture-request", id: "frozen-parity" }),
  );
  await expect
    .poll(() => currentSocket.messages.some((m) => m.type === "capture"))
    .toBe(true);
  expect(
    currentSocket.messages.find((m) => m.type === "capture"),
  ).toMatchObject({
    type: "capture",
    id: "frozen-parity",
    image: posted!.image,
  });
});

test("expired session asks for a new launch instead of reusing the one-time token", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as Window & { __glimpseletSession?: string }).__glimpseletSession =
      "";
  });
  let exchanges = 0;
  await page.route("**/api/session", async (route) => {
    exchanges++;
    await route.fulfill({ json: { session: `session-${exchanges}` } });
  });
  await page.route("**/api/history", async (route) => {
    await route.fulfill({ status: 401, json: { code: "session_expired" } });
  });
  await page.goto("/#launch-token");
  await expect(
    page.getByText(
      "Session unavailable. Reopen the panel from your coding session.",
    ),
  ).toBeVisible();
  expect(exchanges).toBe(1);
  await expect(
    page.getByRole("button", { name: "Reopen the panel" }),
  ).toHaveCount(0);
});

test("session expiry stops sharing even without another API request", async ({
  page,
}) => {
  await mockPanel(page);
  await page.addInitScript(() => {
    (window as Window & { __glimpseletSession?: string }).__glimpseletSession =
      "";
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: { session: "test-session", expiresAt: Date.now() + 4000 },
    }),
  );
  await page.goto("/#launch-token");
  await page
    .getByRole("button", { name: "Share a screen", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Shared screen preview" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Session unavailable. Reopen the panel from your coding session.",
    ),
  ).toBeVisible({ timeout: 10000 });
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __shareTrack?: MediaStreamTrack }).__shareTrack
          ?.readyState,
    ),
  ).toBe("ended");
  await expect(
    page.getByRole("img", { name: "Shared screen preview" }),
  ).toHaveCount(0);
});

test("keyboard shortcuts ignore text fields and modified keys", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  const question = page.getByRole("textbox");
  await question.focus();
  await question.press("s");
  await question.press("e");
  await question.press("t");
  await expect(page.locator(".selection")).toHaveCount(0);
  await expect(page.locator(".timeline article")).toHaveCount(0);
  await page.keyboard.press("Control+e");
  await page.keyboard.press("Alt+t");
  await expect(page.locator(".timeline article")).toHaveCount(0);
});

test("copy feedback, clear, passive pause, summary and markdown export stay local to the test backend", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/?demo=1");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("textbox").fill("Describe the fixture");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("button", { name: "Copy" }).first().click();
  await expect(page.getByText("Copied")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.getByText("Pinned answer")).toHaveCount(0);
  await expect(
    page.getByText("History, pins, and in-memory key cleared."),
  ).toBeVisible();
});

test("timeline summary posts summary mode and exports the recent notes as Markdown", async ({
  page,
}) => {
  await mockPanel(page);
  await page.route("**/api/history", (route) =>
    route.fulfill({
      json: {
        entries: [
          {
            id: "saved-note",
            at: Date.now(),
            question: "Describe a change",
            answer: "A green status appeared.",
            kind: "passive",
          },
        ],
        expiresAfterMs: 600000,
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect(page.getByText(/Sharing/)).toBeVisible();
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.locator(".stage .frame")).toHaveCount(0);
  await page.getByText(/Capture notes/).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  expect((await download).suggestedFilename()).toBe("glimpselet-notes.md");
  const summaryRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/ask") &&
      request.postDataJSON().mode === "summary",
  );
  await page
    .getByRole("button", { name: "Summarize last ten minutes" })
    .click();
  const payload = (await summaryRequest).postDataJSON();
  expect(payload.image).toBeUndefined();
  expect(payload.question).toContain("recent passive notes");
  await expect(page.locator(".answer .markdown")).toContainText(
    "Summary of recent notes.",
  );
});

test("passive pause cancels a changed-frame note and exposes summary/export controls", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect(page.getByText(/Sharing/)).toBeVisible();
  await page.getByRole("button", { name: "Passive mode" }).click();
  await page.waitForTimeout(2200);
  await page.evaluate(() =>
    (window as Window & { __changeFrame?: () => void }).__changeFrame?.(),
  );
  await page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/ask") &&
      request.postDataJSON().mode === "passive",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText(/Passive paused/)).toBeVisible();
  await page.waitForTimeout(3200);
  await page.getByText(/Capture notes/).click();
  await expect(page.locator(".timeline article")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Summarize last ten minutes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export notes" }),
  ).toBeVisible();
});

test("responsive panel remains readable at 360, 420 and 520 pixels in light and dark themes", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  for (const width of [360, 420, 520]) {
    await page.setViewportSize({ width, height: 820 });
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByLabel("Theme").selectOption(theme);
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator(".stage")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const bounds = await page.locator(".stage").boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: `/tmp/glimpselet-${width}-${theme}.png`,
        fullPage: true,
      });
    }
  }
});

test("opens the panel with the real browser Document Picture-in-Picture API when available", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  const supported = await page.evaluate(() =>
    Boolean(
      (window as Window & { documentPictureInPicture?: unknown })
        .documentPictureInPicture,
    ),
  );
  test.skip(
    !supported,
    "This browser does not implement Document Picture-in-Picture.",
  );
  await page.getByRole("button", { name: "Float panel" }).click();
  await expect(page.locator(".opener-card")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pip = (
          window as Window & { documentPictureInPicture?: { window?: Window } }
        ).documentPictureInPicture;
        return Boolean(pip?.window?.document.querySelector("main.app"));
      }),
    )
    .toBe(true);
  await page.evaluate(() =>
    (
      window as Window & { documentPictureInPicture?: { window?: Window } }
    ).documentPictureInPicture?.window?.close(),
  );
  await expect(page.locator(".opener-card")).toHaveCount(0);
});

test("WebSocket reconnection publishes the current sharing state", async ({
  page,
}) => {
  await mockPanel(page);
  const sockets: import("@playwright/test").WebSocketRoute[] = [];
  const states: boolean[] = [];
  await page.routeWebSocket("ws://127.0.0.1:5173/api/stream", (socket) => {
    sockets.push(socket);
    socket.onMessage((message) => {
      const data = JSON.parse(String(message)) as {
        type: string;
        active: boolean;
      };
      if (data.type === "share") states.push(data.active);
    });
  });
  await page.goto("/");
  await expect.poll(() => states[0]).toBe(false);
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect.poll(() => states.includes(true)).toBe(true);
  sockets[0]!.close({ code: 1011, reason: "exercise reconnect" });
  await expect.poll(() => sockets.length).toBeGreaterThan(1);
  await expect.poll(() => states.at(-1)).toBe(true);
});

test("editing crop, masks and freeze keeps the authenticated capture socket connected", async ({
  page,
}) => {
  await mockPanel(page);
  let connections = 0;
  await page.routeWebSocket("**/api/stream", () => {
    connections++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await expect.poll(() => connections).toBe(1);
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await page.getByRole("button", { name: "Select area" }).click();
  const area = await page.locator(".stage .frame").boundingBox();
  expect(area).not.toBeNull();
  await page.mouse.move(area!.x + 10, area!.y + 10);
  await page.mouse.down();
  await page.mouse.move(
    area!.x + area!.width - 10,
    area!.y + area!.height - 10,
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Add opaque redaction" }).click();
  await page.mouse.move(area!.x + 30, area!.y + 30);
  await page.mouse.down();
  await page.mouse.move(area!.x + 80, area!.y + 80);
  await page.mouse.up();
  await page.waitForTimeout(650);
  expect(connections).toBe(1);
});

test("clear while manual ask waits for passive pause prevents sending the old frame", async ({
  page,
}) => {
  await mockPanel(page);
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/pause", async (route) => {
    await paused;
    await route.fulfill({ json: { ok: true } });
  });
  const asks: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ask")) asks.push(request.postDataJSON());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await page.getByRole("button", { name: "Passive mode" }).click();
  await page.getByRole("textbox").fill("Describe the old frame");
  const pendingPause = page.waitForRequest("**/api/pause");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await pendingPause;
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear history" }).click();
  release();
  await page.waitForTimeout(500);
  expect(asks).toHaveLength(0);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __shareTrack?: MediaStreamTrack }).__shareTrack
          ?.readyState,
    ),
  ).toBe("ended");
});

test("changing provider pauses passive mode and the next note uses the visible settings", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await page.getByRole("button", { name: "Passive mode" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Backend", { exact: true }).selectOption("api");
  await page.getByLabel("Model", { exact: true }).selectOption("haiku");
  await page
    .getByLabel("Anthropic API key", { exact: true })
    .fill("fixture-key");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText(/Passive paused/)).toBeVisible();
  await page.getByRole("button", { name: "Passive mode" }).click();
  await page.waitForTimeout(2200);
  const next = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/ask") &&
      request.postDataJSON().mode === "passive",
  );
  await page.evaluate(() =>
    (window as Window & { __changeFrame?: () => void }).__changeFrame?.(),
  );
  const payload = (await next).postDataJSON();
  expect(payload).toMatchObject({
    backend: "api",
    model: "haiku",
    key: "fixture-key",
  });
  await page.getByRole("button", { name: "Pause" }).click();
});

test("erasing the API key sends an explicit empty credential on the next ask", async ({
  page,
}) => {
  await mockPanel(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Backend", { exact: true }).selectOption("api");
  const key = page.getByLabel("Anthropic API key", { exact: true });
  await key.fill("fixture-key");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("textbox").fill("Describe this frame");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer .markdown")).toContainText("Mock answer");
  await page.getByRole("button", { name: "Settings" }).click();
  await key.fill("");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const next = page.waitForRequest((request) =>
    request.url().endsWith("/api/ask"),
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  expect((await next).postDataJSON()).toMatchObject({
    backend: "api",
    key: "",
  });
});

test("a changed passive frame is retried after the request limit or provider failure", async ({
  page,
}) => {
  await mockPanel(page);
  await page.addInitScript(() => {
    const originalNow = Date.now;
    let offset = 0;
    Date.now = () => originalNow() + offset;
    (window as Window & { __advanceMinute?: () => void }).__advanceMinute =
      () => {
        offset += 61000;
      };
  });
  const frames: string[] = [];
  await page.route("**/api/ask", async (route) => {
    const payload = route.request().postDataJSON();
    frames.push(payload.image);
    if (frames.length === 1)
      await route.fulfill({ status: 429, json: { code: "passive_limit" } });
    else {
      const entry = {
        id: "retried",
        at: Date.now(),
        question: payload.question,
        answer: "A green status appeared.",
        kind: "passive",
      };
      await route.fulfill({
        contentType: "text/event-stream",
        body: `event: delta\ndata: {"text":"The pending answer is preserved."}\n\nevent: done\ndata: ${JSON.stringify({ entry })}\n\n`,
      });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .getByLabel("Passive calls per minute", { exact: true })
    .selectOption("1");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Passive mode" }).click();
  await page.waitForTimeout(2200);
  await page.evaluate(() =>
    (window as Window & { __changeFrame?: () => void }).__changeFrame?.(),
  );
  await expect.poll(() => frames.length, { timeout: 6000 }).toBe(1);
  await page.evaluate(() =>
    (window as Window & { __advanceMinute?: () => void }).__advanceMinute?.(),
  );
  await expect.poll(() => frames.length, { timeout: 6000 }).toBe(2);
  expect(frames[1]).toBe(frames[0]);
  await page.getByRole("button", { name: "Pause" }).click();
});

test("a rejected document floating window offers a styled popup on a fresh click", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: {
        requestWindow: async () => {
          throw new Error("Not supported in this browser context");
        },
      },
    });
  });
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Float panel" }).click();
  await expect(
    page.getByRole("button", { name: "Open popup", exact: true }),
  ).toBeVisible();
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open popup", exact: true }).click();
  const popup = await opened;
  await expect(popup.locator("main.app")).toBeVisible();
  expect(
    await popup
      .locator("main.app")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(250, 247, 239)");
  await popup.close();
});

async function waitForShareFrame(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector("video")?.videoWidth ?? 0),
    )
    .toBeGreaterThan(0);
}

async function holdNextDecode(page: import("@playwright/test").Page) {
  await waitForShareFrame(page);
  await page.evaluate(() => {
    const state = { started: false, completed: false, release: () => {} };
    const gate = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    const decode = HTMLImageElement.prototype.decode;
    let held = false;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      if (!held) {
        held = true;
        state.started = true;
        await gate;
        state.completed = true;
      }
    };
    Object.assign(window, { heldCapture: state });
  });
  return {
    wait: () =>
      expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { heldCapture: { started: boolean } })
                .heldCapture.started,
          ),
        )
        .toBe(true),
    release: () =>
      page.evaluate(() =>
        (
          window as Window & { heldCapture: { release(): void } }
        ).heldCapture.release(),
      ),
  };
}

test("a passive note during decoding does not discard a manual question", async ({
  page,
}) => {
  await mockPanel(page);
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 2000 && typeof callback === "function") {
        Object.assign(window, { passiveTick: () => callback(...args) });
        return interval(() => {}, 2_000_000_000);
      }
      return interval(callback, delay, ...args);
    };
  });
  const modes: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ask"))
      modes.push(request.postDataJSON().mode);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await page.getByRole("button", { name: /^Passive mode/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as Window & { passiveTick?: () => Promise<void> })
            .passiveTick,
      ),
    )
    .toBe("function");
  const tick = () =>
    page.evaluate(() =>
      (window as Window & { passiveTick(): Promise<void> }).passiveTick(),
    );
  await waitForShareFrame(page);
  await tick();
  const decode = await holdNextDecode(page);
  const composer = page.getByRole("textbox");
  await composer.fill("Keep my manual question ahead of passive notes");
  await composer.press("Control+Enter");
  await decode.wait();
  try {
    await page.evaluate(() => {
      (window as Window & { __changeFrame(): void }).__changeFrame();
      (
        window as Window & { __shareTrack: CanvasCaptureMediaStreamTrack }
      ).__shareTrack.requestFrame();
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const video = document.querySelector("video")!;
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 200;
          const context = canvas.getContext("2d")!;
          context.drawImage(video, 0, 0, 320, 200);
          return Array.from(context.getImageData(220, 30, 1, 1).data).slice(
            0,
            3,
          );
        }),
      )
      .toEqual([24, 169, 108]);
    await tick();
    expect(modes).toEqual(["passive"]);
  } finally {
    await decode.release();
  }
  await expect.poll(() => modes).toEqual(["passive", "ask"]);
  await expect(
    page
      .locator(".answer")
      .getByText("Mock answer: Keep my manual question ahead of passive notes"),
  ).toBeVisible();
});

test("Escape pauses passive mode and prevents a manual capture still decoding", async ({
  page,
}) => {
  await mockPanel(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ask"))
      requests.push(request.postDataJSON().mode);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Share a screen" }).click();
  await page.getByRole("button", { name: /^Passive mode/ }).click();
  const decode = await holdNextDecode(page);
  const composer = page.getByRole("textbox");
  await composer.fill("Keep this private while decoding");
  await composer.press("Control+Enter");
  await decode.wait();
  await composer.press("Escape");
  await decode.release();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { heldCapture: { completed: boolean } })
            .heldCapture.completed,
      ),
    )
    .toBe(true);
  await expect(page.locator(".status-details")).toContainText("Passive paused");
  expect(requests).toEqual([]);
  await expect(composer).toHaveValue("Keep this private while decoding");
  await composer.press("Control+Enter");
  await expect(
    page
      .locator(".answer")
      .getByText("Mock answer: Keep this private while decoding"),
  ).toBeVisible();
  expect(requests).toEqual(["ask"]);
});

for (const selection of ["Select area", "Add opaque redaction"] as const) {
  for (const passive of [false, true]) {
    test(`composer Escape with ${selection} and passive ${passive ? "on" : "off"} prevents transmission during decoding`, async ({
      page,
    }) => {
      await mockPanel(page);
      const requests: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/api/ask"))
          requests.push(request.postDataJSON().mode);
      });
      await page.goto("/");
      await page.getByRole("button", { name: "Share a screen" }).click();
      await waitForShareFrame(page);
      if (passive)
        await page.getByRole("button", { name: /^Passive mode/ }).click();
      await page
        .getByRole("button", { name: new RegExp(`^${selection}`) })
        .click();
      const decode = await holdNextDecode(page);
      const composer = page.getByRole("textbox");
      await composer.fill("Cancel this private capture from the composer");
      await composer.press("Control+Enter");
      await decode.wait();
      try {
        await composer.press("Escape");
      } finally {
        await decode.release();
      }
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { heldCapture: { completed: boolean } })
                .heldCapture.completed,
          ),
        )
        .toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(requests).toEqual([]);
      await expect(page.locator("#selection-instructions")).toHaveCount(0);
      await expect(composer).toHaveValue(
        "Cancel this private capture from the composer",
      );
      if (passive)
        await expect(page.locator(".status-details")).toContainText(
          "Passive paused",
        );
      await composer.press("Control+Enter");
      await expect(
        page
          .locator(".answer")
          .getByText(
            "Mock answer: Cancel this private capture from the composer",
          ),
      ).toBeVisible();
      expect(requests).toEqual(["ask"]);
    });
  }
}

for (const cancel of ["Escape", "Stop sharing"] as const) {
  test(`MCP capture cancelled by ${cancel} replies without an image`, async ({
    page,
  }) => {
    await mockPanel(page);
    let socket!: import("@playwright/test").WebSocketRoute;
    const messages: Array<{
      type: string;
      id?: string;
      image?: string;
      error?: string;
    }> = [];
    await page.routeWebSocket("**/api/stream", (route) => {
      socket = route;
      route.onMessage((message) => messages.push(JSON.parse(String(message))));
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Share a screen" }).click();
    await expect.poll(() => Boolean(socket)).toBe(true);
    const decode = await holdNextDecode(page);
    socket.send(
      JSON.stringify({ type: "capture-request", id: "cancelled-capture" }),
    );
    await decode.wait();
    if (cancel === "Escape") await page.getByRole("textbox").press("Escape");
    else await page.getByRole("button", { name: cancel, exact: true }).click();
    await decode.release();
    await expect
      .poll(() =>
        messages.find((message) => message.id === "cancelled-capture"),
      )
      .toEqual({
        type: "capture",
        id: "cancelled-capture",
        error: "unavailable",
      });
  });
}

for (const selection of ["Select area", "Add opaque redaction"] as const) {
  test(`Escape leaves ${selection} without cancelling a pending answer`, async ({
    page,
  }) => {
    await mockPanel(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/ask", async (route) => {
      await gate;
      const question = route.request().postDataJSON().question;
      await route.fulfill({
        contentType: "text/event-stream",
        body: `event: delta\ndata: {"text":"The pending answer is preserved."}\n\nevent: done\ndata: ${JSON.stringify({ entry: { id: "keep-answer", at: Date.now(), kind: "ask", question, answer: "The pending answer is preserved." } })}\n\n`,
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Share a screen" }).click();
    await waitForShareFrame(page);
    const composer = page.getByRole("textbox");
    await composer.fill("Continue this answer");
    await composer.press("Control+Enter");
    await expect(
      page.getByRole("button", { name: "Cancel answer" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: new RegExp(`^${selection}`) })
      .click();
    await page.locator(".stage").press("Escape");
    try {
      await expect(page.locator("#selection-instructions")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Cancel answer" }),
      ).toBeVisible();
    } finally {
      release();
    }
    await expect(
      page.locator(".answer").getByText("The pending answer is preserved."),
    ).toBeVisible();
  });
}
