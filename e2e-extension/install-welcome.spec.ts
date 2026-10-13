import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../bridge/src/extension-install";

let context: BrowserContext,
  server: Server,
  directory: string,
  origin: string,
  welcome: Page;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "glimpselet-welcome-recovery-"));
  server = createServer((req, res) => {
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    );
    if (path === "/install") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(installGuide("/tmp/glimpselet-extension"));
    } else if (path === "/install-guide.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.end(INSTALL_GUIDE_SCRIPT);
    } else if (path.startsWith("/assets/")) {
      res.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html; charset=utf-8",
      );
      void readFile(resolve(`public${path}`)).then(
        (body) => res.end(body),
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<title>Elsewhere</title><p>The practice tab navigated away.</p>",
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No server port");
  origin = `http://127.0.0.1:${address.port}`;
  const extension = resolve("dist-extension");
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
  await context.addInitScript(() => {
    const actions: unknown[] = [];
    Object.assign(window, { practiceActions: actions });
    window.addEventListener("glimpselet:tutorial-action", (event) =>
      actions.push((event as CustomEvent).detail),
    );
  });
  welcome = await context.newPage();
  await welcome.goto(`${origin}/install`);
});

test.afterEach(async () => {
  await context?.close();
  if (server?.listening)
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function openPractice() {
  const opened = context.waitForEvent("page");
  await welcome
    .getByRole("button", { name: "Open sample + request float", exact: true })
    .click();
  const sample = await opened;
  await expect(sample.locator("#tour-request")).toContainText("step 1");
  await expect(welcome.locator("#try-note")).toContainText(
    "Requested in the sample page",
  );
  return sample;
}

for (const navigation of ["cross-origin", "same-origin", "closed"]) {
  test(`restores a ${navigation} practice tab and delivers the requested action once`, async () => {
    const sample = await openPractice();
    if (navigation === "closed") await sample.close();
    else
      await sample.goto(
        `${navigation === "cross-origin" ? origin.replace("127.0.0.1", "localhost") : origin}/elsewhere`,
      );
    await welcome.bringToFront();
    await welcome
      .getByRole("button", { name: "Open sample + request guide", exact: true })
      .click();
    const sampleUrl = `${origin}/assets/glimpselet-welcome-sample.html`;
    // Cross-origin recovery may create a fresh tab; same-origin recovery can reuse it.
    // In both cases exactly one usable sample must receive the requested action.
    await expect
      .poll(
        () => context.pages().filter((page) => page.url() === sampleUrl).length,
      )
      .toBe(1);
    const restored = context.pages().find((page) => page.url() === sampleUrl)!;
    await expect(restored).toHaveURL(sampleUrl);
    await expect(restored.locator("#tour-request")).toContainText("step 5");
    await expect(welcome.locator("#try-note")).toContainText(
      "Requested in the sample page",
    );
    const actions = await restored.evaluate(
      () =>
        (
          window as Window & {
            practiceActions: { action: string; step: number }[];
          }
        ).practiceActions,
    );
    expect(actions).toEqual([
      expect.objectContaining({ action: "guide", step: 5 }),
    ]);
    await expect(welcome.locator(".progress")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
}

test("waits for the sample listener and a matching acknowledgement", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolveHeld) => {
    release = resolveHeld;
  });
  await context.route(
    "**/assets/glimpselet-welcome-sample.js",
    async (route) => {
      await held;
      await route.continue();
    },
  );
  try {
    const opened = context.waitForEvent("page");
    await welcome
      .getByRole("button", { name: "Open sample + request guide", exact: true })
      .click();
    const sample = await opened;
    await expect(welcome.locator("#try-note")).toContainText(
      "Waiting for the sample page",
    );
    await sample.evaluate(() =>
      window.opener!.postMessage(
        {
          type: "glimpselet:tutorial:ready",
          version: 1,
          action: "guide",
          step: 5,
          requestId: "stale",
        },
        location.origin,
      ),
    );
    await expect(welcome.locator("#try-note")).toContainText(
      "Waiting for the sample page",
    );
    release();
    await expect(sample.locator("#tour-request")).toContainText("step 5");
    await expect(welcome.locator("#try-note")).toContainText(
      "Requested in the sample page",
    );
    await expect(welcome.locator(".progress")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  } finally {
    release();
  }
});

test("offers a popup recovery without claiming delivery", async () => {
  await welcome.evaluate(() => {
    window.open = () => null;
  });
  await welcome
    .getByRole("button", { name: "Open sample + request guide", exact: true })
    .click();
  await expect(welcome.locator("#try-note")).toContainText("Allow pop-ups");
  await expect(welcome.locator("#try-note")).not.toContainText("Requested");
});

test("offers a retry if the practice listener cannot load", async () => {
  await context.route("**/assets/glimpselet-welcome-sample.js", (route) =>
    route.abort(),
  );
  await welcome.clock.install();
  await welcome
    .getByRole("button", { name: "Open sample + request guide", exact: true })
    .click();
  await welcome.clock.runFor(10_000);
  await expect(welcome.locator("#try-note")).toContainText(
    "Could not deliver the practice step",
  );
  await expect(welcome.locator("#try-note")).toContainText("Try again");
  await expect(welcome.locator(".progress")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
});

test("rejects foreign messages and repeated action delivery", async () => {
  await welcome.evaluate(() => {
    const open = window.open;
    window.open = (...args) => {
      const opened = open.apply(window, args);
      Object.assign(window, { practiceWindow: opened });
      return opened;
    };
  });
  await context.addInitScript(() => {
    let deliveryAttempts = 0;
    window.addEventListener("message", (event) => {
      if (event.data?.type === "glimpselet:tutorial-action")
        Object.assign(window, {
          deliveredRequest: event.data,
          deliveryAttempts: ++deliveryAttempts,
        });
    });
  });
  const sample = await openPractice();
  const request = await sample.evaluate(
    () => (window as Window & { deliveredRequest: unknown }).deliveredRequest,
  );
  await welcome.evaluate((request) => {
    const practice = (window as Window & { practiceWindow: Window })
      .practiceWindow;
    // A repeated real message from the same opener must not dispatch the action again.
    practice.postMessage(request, location.origin);
    // Matching completion data from a different source or origin is still untrusted.
    for (const [source, origin] of [
      [window, location.origin],
      [practice, "https://elsewhere.invalid"],
    ] as const) {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          origin,
          data: { type: "glimpselet:tutorial:done", version: 1, step: 1 },
        }),
      );
    }
  }, request);
  await sample.evaluate(() => {
    // A completion for an undelivered step must not advance the tour.
    window.opener!.postMessage(
      { type: "glimpselet:tutorial:done", version: 1, step: 5 },
      location.origin,
    );
  });
  await expect
    .poll(() =>
      sample.evaluate(
        () =>
          (window as Window & { deliveryAttempts: number }).deliveryAttempts,
      ),
    )
    .toBe(2);
  expect(
    await sample.evaluate(
      () => (window as Window & { practiceActions: unknown[] }).practiceActions,
    ),
  ).toHaveLength(1);
  await expect(welcome.locator(".progress")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await sample.evaluate(() => {
    for (const [source, origin] of [
      [window, location.origin],
      [window.opener, "https://elsewhere.invalid"],
    ] as const) {
      const data = {
        type: "glimpselet:tutorial:probe",
        version: 1,
        requestId: "foreign",
      };
      window.dispatchEvent(
        new MessageEvent("message", { source, origin, data }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          origin,
          data: {
            type: "glimpselet:tutorial-action",
            version: 1,
            requestId: "foreign",
            action: "guide",
            step: 5,
          },
        }),
      );
    }
  });
  await expect(sample.locator("#tour-request")).toContainText("step 1");
  expect(
    await sample.evaluate(
      () => (window as Window & { practiceActions: unknown[] }).practiceActions,
    ),
  ).toHaveLength(1);
});

test("offers a retry when the sample closes before becoming ready", async () => {
  await context.route("**/assets/glimpselet-welcome-sample.js", (route) =>
    route.abort(),
  );
  await welcome.clock.install();
  const opened = context.waitForEvent("page");
  await welcome
    .getByRole("button", { name: "Open sample + request guide", exact: true })
    .click();
  await (await opened).close();
  await welcome.clock.runFor(200);
  await expect(welcome.locator("#try-note")).toContainText(
    "Could not deliver the practice step",
  );
  await expect(welcome.locator(".progress")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
});

test("retry reloads a sample whose listener failed to load", async () => {
  let blockListener = true;
  await context.route("**/assets/glimpselet-welcome-sample.js", (route) =>
    blockListener ? route.abort() : route.continue(),
  );
  await welcome.clock.install();
  const opened = context.waitForEvent("page");
  const requestGuide = welcome.getByRole("button", {
    name: "Open sample + request guide",
    exact: true,
  });
  await requestGuide.click();
  const sample = await opened;
  await sample.waitForLoadState();
  await welcome.clock.runFor(10_000);
  await expect(welcome.locator("#try-note")).toContainText(
    "Could not deliver the practice step",
  );
  blockListener = false;
  await welcome.clock.resume();
  await requestGuide.click();
  await expect(sample.locator("#tour-request")).toContainText("step 5");
  await expect(welcome.locator("#try-note")).toContainText(
    "Requested in the sample page",
  );
  expect(
    await sample.evaluate(
      () => (window as Window & { practiceActions: unknown[] }).practiceActions,
    ),
  ).toEqual([expect.objectContaining({ action: "guide", step: 5 })]);
  await expect(welcome.locator(".progress")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
});
