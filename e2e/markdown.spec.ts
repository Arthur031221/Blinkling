import { expect, test, type Page } from "@playwright/test";

const tableAnswer = (link = false) =>
  `| ${["Feature", "Basic plan", "Team plan", "Enterprise plan", "Monthly cost", "Availability", "Support response", "Additional notes"].join(" | ")} |\n| ${Array(8).fill("---").join(" | ")} |\n| ${[
    "Storage",
    "10 GB",
    "500 GB",
    "Unlimited",
    "$19 per member",
    "Every region",
    "Within one business day",
    "Includes long term archive and export tools",
  ].join(" | ")} |\n| ${[
    "Collaboration",
    "One workspace",
    "Shared workspaces",
    "Custom workspaces",
    "$49 per member",
    "Worldwide service",
    "Within four support hours",
    "Includes review history and organization controls",
  ].join(
    " | ",
  )} |${link ? "\n\n[Plan details](https://example.com/plans)" : ""}`;

async function sharedStreamingPanel(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { __glimpseletSession: "markdown-test-session" });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 400;
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#c86448";
          context.fillRect(0, 0, canvas.width, canvas.height);
          return canvas.captureStream(2);
        },
      },
    });

    const nativeFetch = window.fetch.bind(window);
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let answerNumber = 0;
    window.fetch = async (input, init) => {
      if (input !== "/api/ask") return nativeFetch(input, init);
      answerNumber += 1;
      const answerId = `markdown-answer-${answerNumber}`;
      const stream = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });
      const encoder = new TextEncoder();
      Object.assign(window, {
        __sendMarkdownAnswer: (text: string) => {
          if (!controller) throw new Error("No active answer stream");
          controller.enqueue(
            encoder.encode(
              `event: delta\ndata: ${JSON.stringify({ text })}\n\n` +
                `event: done\ndata: ${JSON.stringify({ entry: { id: answerId, at: Date.now(), question: "Compare these plans", answer: text, kind: "ask" } })}\n\n`,
            ),
          );
          controller.close();
          controller = undefined;
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
  });
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

async function sendAnswer(page: Page, answer: string) {
  await page.getByRole("textbox").fill("Compare these plans");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer[aria-busy]")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.evaluate(
    (text) =>
      (
        window as Window & {
          __sendMarkdownAnswer: (text: string) => void;
        }
      ).__sendMarkdownAnswer(text),
    answer,
  );
  await expect(page.locator(".answer[aria-busy]")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.locator(".answer[aria-busy] .markdown table"),
  ).toBeVisible();
}

test("Markdown tables render in answers, pins, and history without page overflow", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await sharedStreamingPanel(page);
  await expect(page.locator(".copy-feedback[role=status]")).toHaveCount(1);
  await expect(page.locator(".copy-feedback")).toBeEmpty();
  await sendAnswer(page, tableAnswer());

  await page.locator(".answer").getByRole("button", { name: "Copy" }).click();
  await expect(page.locator(".copy-feedback")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    tableAnswer(),
  );
  await page.locator(".answer").getByRole("button", { name: "Pin" }).click();
  await expect(page.locator(".answer.pinned .markdown table")).toBeVisible();

  await sendAnswer(page, tableAnswer(true));
  const current = page.locator(".answer:not(.pinned) .markdown");
  const pinned = page.locator(".answer.pinned .markdown");
  await expect(current.locator("table thead th")).toHaveCount(8);
  await expect(pinned.locator("table tbody td")).toHaveCount(16);
  await expect(
    current.getByRole("link", { name: "Plan details" }),
  ).toHaveAttribute("target", "_blank");
  await expect(
    current.getByRole("link", { name: "Plan details" }),
  ).toHaveAttribute("rel", "noopener noreferrer");

  await page.locator(".timeline summary").click();
  const historyMarkdown = page.locator(".timeline article .markdown");
  await expect(historyMarkdown).toHaveCount(2);
  await expect(historyMarkdown.nth(0).locator("table thead th")).toHaveCount(8);
  await expect(historyMarkdown.nth(1).locator("table tbody td")).toHaveCount(
    16,
  );

  await page
    .context()
    .route("https://example.com/**", (route) =>
      route.fulfill({ body: "<title>Plan details</title>" }),
    );
  const popupPromise = page.waitForEvent("popup");
  await current.getByRole("link", { name: "Plan details" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle("Plan details");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await expect(page.locator(".status-source")).toContainText("Last sent frame");
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __glimpseletSession?: string })
          .__glimpseletSession,
    ),
  ).toBe("markdown-test-session");

  for (const theme of ["light", "dark"]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    for (const width of [360, 420, 520]) {
      await page.setViewportSize({ width, height: 720 });
      for (const content of [current, pinned, historyMarkdown.nth(0)]) {
        const scroller = content;
        await expect(scroller.locator("table")).toBeVisible();
        const dimensions = await scroller.evaluate((node) => ({
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
        await scroller.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await expect(scroller).toHaveAttribute("tabindex", "0");
        await scroller.focus();
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => scroller.evaluate((node) => node.scrollLeft))
          .toBeGreaterThan(0);
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
    }
  }
});

test("relative answer links cannot navigate away from the panel", async ({
  page,
}) => {
  await sharedStreamingPanel(page);
  await sendAnswer(page, `${tableAnswer()}\n\n[Panel settings](/settings)`);
  const link = page
    .locator(".answer .markdown a")
    .filter({ hasText: "Panel settings" });
  await expect(link).toHaveText("Panel settings");
  await expect(link).not.toHaveAttribute("href");
  const url = page.url();
  await link.click();
  expect(page.url()).toBe(url);
  await expect(
    page.getByRole("button", { name: "Ask", exact: true }),
  ).toBeEnabled();
});
