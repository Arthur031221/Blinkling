import {
  test,
  expect,
  chromium,
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

let server: Server,
  context: BrowserContext,
  directory: string,
  origin: string,
  welcome: Page;
const samplePath = "/assets/glimpselet-welcome-sample.html";

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "glimpselet-welcome-recovery-"));
  server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    );
    if (url.pathname === "/install/status") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ connected: false, mode: "direct" }));
    } else if (url.pathname === "/install") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        installGuide("/tmp/glimpselet-extension", {
          chromeWebStoreUrl: "",
          edgeAddonsUrl: "",
        }),
      );
    } else if (url.pathname === "/install-guide.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(INSTALL_GUIDE_SCRIPT);
    } else if (url.pathname.startsWith("/assets/")) {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith(".js") ? "text/javascript" : "text/html",
      );
      void readFile(resolve(`public${url.pathname}`)).then(
        (data) => res.end(data),
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        "<title>Another page</title><p>The practice tab navigated away.</p>",
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  origin = `http://127.0.0.1:${address.port}`;
  const extension = resolve("dist-extension");
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({ consented: true, locale: "en" }),
  );
  // Record actual DOM action deliveries before the bundled listener starts.
  await context.addInitScript(() => {
    window.addEventListener("glimpselet:tutorial-action", (event) => {
      document.documentElement.dataset.deliveries = String(
        Number(document.documentElement.dataset.deliveries || 0) + 1,
      );
      document.documentElement.dataset.action = (
        event as CustomEvent
      ).detail.action;
    });
  });
  welcome = await context.newPage();
  await welcome.goto(`${origin}/install`);
});

test.afterEach(async () => {
  await context?.close();
  await new Promise<void>((resolveClose) =>
    server?.close(() => resolveClose()),
  );
  await rm(directory, { recursive: true, force: true });
});

async function openSample() {
  const popup = welcome.waitForEvent("popup");
  await welcome
    .getByRole("button", { name: "Open sample + request float", exact: true })
    .click();
  const sample = await popup;
  await expect(sample.locator("#tour-request")).toContainText("step 1");
  return sample;
}

for (const navigation of [
  "same-origin",
  "different-origin",
  "closed",
] as const) {
  test(`restores ${navigation} practice and delivers the next action exactly once`, async () => {
    const sample = await openSample();
    if (navigation === "closed") await sample.close();
    else
      await sample.goto(
        navigation === "same-origin"
          ? `${origin}/other`
          : `${origin.replace("127.0.0.1", "localhost")}/other`,
      );
    await welcome
      .getByRole("button", { name: "Open sample + request guide", exact: true })
      .click();
    await expect
      .poll(
        () =>
          context.pages().filter((page) => page.url() === origin + samplePath)
            .length,
      )
      .toBe(1);
    const restored = context
      .pages()
      .find((page) => page.url() === origin + samplePath)!;
    await expect(restored.locator("#tour-request")).toContainText("step 5");
    await expect(restored.locator("html")).toHaveAttribute(
      "data-action",
      "guide",
    );
    await expect(restored.locator("html")).toHaveAttribute(
      "data-deliveries",
      "1",
    );
    await expect(welcome.locator("#try-note")).toContainText(
      "Requested in the sample page",
    );
    await expect(welcome.locator(".step").nth(4)).not.toHaveClass(/done/);
  });
}

test("waits for the listener and a matching acknowledgement before announcing delivery", async () => {
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
  const popup = welcome.waitForEvent("popup");
  await welcome
    .getByRole("button", { name: "Open sample + request guide", exact: true })
    .click();
  const sample = await popup;
  try {
    await expect(welcome.locator("#try-note")).toContainText(
      "Opening the sample page",
    );
    await welcome.evaluate(() => {
      window.postMessage(
        {
          type: "glimpselet:tutorial:ready",
          version: 1,
          action: "guide",
          step: 5,
          requestId: "wrong-request",
        },
        location.origin,
      );
      window.postMessage(
        { type: "glimpselet:tutorial:done", version: 1, step: 5 },
        location.origin,
      );
    });
    await expect(welcome.locator("#try-note")).not.toContainText(
      "Requested in the sample page",
    );
    await expect(welcome.locator(".step").nth(4)).not.toHaveClass(/done/);
  } finally {
    release();
  }
  await expect(sample.locator("#tour-request")).toContainText("step 5");
  await expect(sample.locator("html")).toHaveAttribute("data-deliveries", "1");
  await expect(welcome.locator("#try-note")).toContainText(
    "Requested in the sample page",
  );
});

test("a blocked popup explains how to retry without claiming delivery", async () => {
  await welcome.evaluate(() => {
    window.open = () => null;
  });
  await welcome
    .getByRole("button", { name: "Open sample + request guide", exact: true })
    .click();
  await expect(welcome.locator("#try-note")).toContainText("Allow pop-ups");
  await expect(welcome.locator("#try-note")).not.toContainText(
    "Requested in the sample page",
  );
  await expect(welcome.locator(".step").nth(4)).not.toHaveClass(/done/);
});

test("an unavailable practice listener gives an actionable delivery failure", async () => {
  await context.route("**/assets/glimpselet-welcome-sample.js", (route) =>
    route.abort(),
  );
  await welcome
    .getByRole("button", { name: "Open sample + request guide", exact: true })
    .click();
  await expect(welcome.locator("#try-note")).toContainText(
    "Could not deliver",
    { timeout: 12000 },
  );
  await expect(welcome.locator("#try-note")).toContainText("try again");
  await expect(welcome.locator(".step").nth(4)).not.toHaveClass(/done/);
});
