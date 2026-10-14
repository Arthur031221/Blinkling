import { expect, test, type Page } from "@playwright/test";

async function panel(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { __blinklingSession: "answer-state-session" });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 200;
          canvas.getContext("2d")!.fillRect(0, 0, 320, 200);
          return canvas.captureStream(2);
        },
      },
    });
    Object.assign(window, { __answerStreams: [] as unknown[] });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input !== "/api/ask") return nativeFetch(input, init);
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const encoder = new TextEncoder();
      const handle = {
        delta(text: string) {
          controller.enqueue(
            encoder.encode(
              `event: delta\ndata: ${JSON.stringify({ text })}\n\n`,
            ),
          );
        },
        done(text: string, id: string) {
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({ entry: { id, at: Date.now(), question: "Explain this screen", answer: text, kind: "ask" } })}\n\n`,
            ),
          );
          controller.close();
        },
        end() {
          controller.close();
        },
        fail(message: string) {
          controller.error(new Error(message));
        },
      };
      (window as Window & { __answerStreams: unknown[] }).__answerStreams.push(
        handle,
      );
      return new Response(
        new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
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

async function ask(page: Page) {
  await page.getByRole("textbox").fill("Explain this screen");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer[aria-busy='true']")).toBeVisible();
}

async function send(
  page: Page,
  method: "delta" | "done" | "fail",
  ...args: string[]
) {
  await page.evaluate(
    ({ method, args }) => {
      const streams = (
        window as Window & {
          __answerStreams: Array<Record<string, (...values: string[]) => void>>;
        }
      ).__answerStreams;
      streams[0]![method](...args);
    },
    { method, args },
  );
}

test("A network failure after a partial delta labels and retains a copyable, unpinnable answer outside history", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await panel(page);
  await ask(page);
  await send(page, "delta", "Useful partial text");
  await expect(page.locator(".answer").last()).toContainText(
    "Streaming answer",
  );
  await send(page, "fail", "socket broke");
  const card = page.locator(".answer").last();
  await expect(card).toContainText("Incomplete answer");
  await expect(card).toContainText("Something went wrong. Please try again.");
  await expect(card).not.toContainText("socket broke");
  await expect(card.locator(".markdown")).toHaveText("Useful partial text");
  await expect(
    card.getByRole("button", { name: "Pin", exact: true }),
  ).toBeDisabled();
  await card.getByRole("button", { name: "Copy", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Useful partial text");
  await expect(page.locator(".timeline")).not.toContainText(
    "Useful partial text",
  );
});

test("EOF without a done event is incomplete even when it has partial text", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await send(page, "delta", "Partial before EOF");
  await page.evaluate(() => {
    const streams = (
      window as Window & { __answerStreams: Array<{ end(): void }> }
    ).__answerStreams;
    streams[0]!.end();
  });
  const card = page.locator(".answer").last();
  await expect(card).toContainText("Incomplete answer");
  await expect(card).toContainText(
    "The selected backend returned an incomplete answer. Try again.",
  );
  await expect(card).not.toContainText("incomplete_response");
  await expect(card.locator(".markdown")).toHaveText("Partial before EOF");
});

test("Cancel and Escape retain partial text with a cancelled label", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await send(page, "delta", "First partial");
  await page
    .getByRole("button", { name: "Cancel answer", exact: true })
    .click();
  await expect(page.locator(".answer").last()).toContainText(
    "Cancelled answer",
  );
  await expect(page.locator(".answer").last()).toContainText("First partial");
  await ask(page);
  await page.evaluate(() => {
    const streams = (
      window as Window & {
        __answerStreams: Array<{ delta(text: string): void }>;
      }
    ).__answerStreams;
    streams[1]!.delta("Second partial");
  });
  await page.evaluate(() => {
    const streams = (
      window as Window & {
        __answerStreams: Array<{ delta(text: string): void }>;
      }
    ).__answerStreams;
    try {
      streams[0]!.delta("Stale first answer");
    } catch {
      // The cancelled stream may already be closed.
    }
  });
  await expect(page.locator(".answer").last().locator(".markdown")).toHaveText(
    "Second partial",
  );
  await page.locator(".stage").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".answer").last()).toContainText(
    "Cancelled answer",
  );
  await expect(page.locator(".answer").last()).toContainText("Second partial");
});

test("Clear during a stream cannot recreate the cleared answer", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await send(page, "delta", "Must disappear");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(page.locator(".answer")).toHaveCount(0);
  await page.evaluate(() => {
    const streams = (
      window as Window & {
        __answerStreams: Array<{
          delta(text: string): void;
          done(text: string, id: string): void;
        }>;
      }
    ).__answerStreams;
    try {
      streams[0]!.delta("Stale after Clear");
      streams[0]!.done("Stale after Clear", "stale");
    } catch {
      // The cleared stream may already be closed.
    }
  });
  await expect(page.locator(".answer")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share a screen", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(50);
  await expect(page.locator(".answer")).toHaveCount(0);
});

test("only a validated completed stream permits Pin and keeps an existing pin", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await send(page, "delta", "Complete one");
  await send(page, "done", "Complete one", "first");
  const card = page.locator(".answer").last();
  await expect(card).toContainText("Complete answer");
  const pin = card.getByRole("button", { name: "Pin", exact: true });
  await expect(pin).toBeEnabled();
  await pin.click();
  await expect(page.locator(".answer.pinned")).toContainText("Complete one");
  await ask(page);
  await page.evaluate(() => {
    const streams = (
      window as Window & {
        __answerStreams: Array<{
          delta(text: string): void;
          done(text: string, id: string): void;
        }>;
      }
    ).__answerStreams;
    streams[1]!.delta("Complete two");
    streams[1]!.done("Complete two", "second");
  });
  await expect(page.locator(".answer.pinned").first()).toContainText(
    "Complete one",
  );
  await expect(
    page
      .locator(".answer")
      .last()
      .getByRole("button", { name: "Pin", exact: true }),
  ).toBeEnabled();
});

test("cancelling before any text does not promise a future answer", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await page
    .getByRole("button", { name: "Cancel answer", exact: true })
    .click();
  const card = page.locator(".answer").last();
  await expect(card).toContainText("Cancelled answer");
  await expect(card).toContainText(
    "The answer was stopped before it finished.",
  );
  await expect(card.locator(".answer-empty")).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Copy", exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole("button", { name: "Pin", exact: true }),
  ).toBeDisabled();
});

test("session expiry clears partial answers and sharing instead of restoring private text", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await send(page, "delta", "Private partial text");
  await expect(page.locator(".answer .markdown")).toContainText(
    "Private partial text",
  );
  await send(page, "fail", "session_expired");
  await expect(page.locator(".answer")).toHaveCount(0);
  await expect(page.locator(".notice")).toContainText(
    "Session unavailable. Reopen the panel from your coding session.",
  );
  await expect(page.locator(".stage .frame")).toHaveCount(0);
  await expect(page.locator(".timeline")).toHaveCount(0);
});

test("an error before the first delta displays an error without empty-answer instructions", async ({
  page,
}) => {
  await panel(page);
  await ask(page);
  await send(page, "fail", "provider_error");
  const card = page.locator(".answer").last();
  await expect(card).toContainText("Incomplete answer");
  await expect(card.locator(".answer-state-detail")).toHaveText(
    "The answer could not be completed. Check the selected backend and try again.",
  );
  await expect(card.locator(".answer-empty")).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Copy", exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole("button", { name: "Pin", exact: true }),
  ).toBeDisabled();
});
