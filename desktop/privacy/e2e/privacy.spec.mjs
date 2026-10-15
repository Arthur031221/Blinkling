/* Playwright reads the fixtures of a test from a destructured first argument,
 * so tests that need none still write `{}`. */
/* eslint-disable no-empty-pattern */
import {
  test,
  expect,
  chromium,
  _electron as electron,
} from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  reports,
  background,
  desktopShot,
} from "../../capture/e2e/support.mjs";

const main = fileURLToPath(
  new URL("../../capture/e2e/main.cjs", import.meta.url),
);
const login =
  "data:text/html," +
  encodeURIComponent(
    '<title>Sign in</title><body style="font:20px system-ui;margin:60px"><h2>Sign in</h2><input id=pw type=password autofocus placeholder="Password" style="font-size:20px;padding:8px"></body>',
  );

async function launch(extraEnv = {}) {
  await mkdir(reports, { recursive: true });
  const dir = await mkdtemp(join(tmpdir(), "blinkling-privacy-"));
  const app = await electron.launch({
    args: [main, "--no-sandbox", `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      BLINKLING_E2E: "1",
      BLINKLING_REMOTE: "0",
      ...extraEnv,
    },
  });
  const blink = await app.firstWindow();
  await expect
    .poll(() => app.evaluate(() => !!globalThis.blinklingTest?.privacy), {
      timeout: 15000,
    })
    .toBe(true);
  const listen = () => {
    window.privacyEvents = [];
    window.blinkling.onEvent((event) => window.privacyEvents.push(event));
  };
  await blink.addInitScript(listen);
  await blink.evaluate(listen);
  return {
    app,
    blink,
    dir,
    events: (type) =>
      blink.evaluate(
        (t) => window.privacyEvents.filter((e) => !t || e.type === t),
        type,
      ),
    close: async () => {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
const displayId = (app) =>
  app.evaluate(({ screen }) => String(screen.getPrimaryDisplay().id));
const focus = (app, value) =>
  app.evaluate((_e, v) => globalThis.blinklingTest.privacy.focus(v), value);
const window_ = (over) => ({
  secure: false,
  window: {
    id: "1",
    title: "Sign in",
    app: "chromium",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    private: false,
    passwordManager: false,
    ...over,
  },
});
const turn = {
  id: "22222222-2222-4222-8222-222222222222",
  text: "What is this?",
  source: "composer",
  attachments: [
    { id: "a", name: "a.png", mediaType: "image/png", data: "eA==" },
  ],
};

async function locked(t, name, locator, browserArgs = []) {
  const { app, blink, events, dir, close } = await launch();
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", ...browserArgs],
  });
  try {
    await background(app);
    const id = await displayId(app);
    const context = await browser.newContext({
      viewport: { width: 640, height: 360 },
    });
    const page = await context.newPage();
    await page.goto(login);
    await page.focus("#pw");
    expect(await page.evaluate(() => document.activeElement.type)).toBe(
      "password",
    );

    // Unlocked first: the very same call succeeds, so the null below is the guard.
    await focus(app, window_({}));
    expect(
      await app.evaluate(async (_e, id) => {
        const c = await globalThis.blinklingTest.features.capture.screen(
          id,
          undefined,
          { attach: false },
        );
        return !!c?.image?.data;
      }, id),
    ).toBe(true);
    await blink.evaluate(() => (window.privacyEvents.length = 0));

    await focus(app, locator);
    const shot = await app.evaluate(async (_e, id) => {
      const t = globalThis.blinklingTest;
      const c = await t.features.capture.screen(id);
      // The capture shortcut and the menu both go through handle("capture").
      await t.features.handle("capture");
      const r = t.features.overlay.capture ?? null;
      return { screen: c, overlay: r };
    }, id);
    expect(shot).toEqual({ screen: null, overlay: null });
    const sent = await app.evaluate(async (_e, turn) => {
      const t = globalThis.blinklingTest;
      try {
        await t.session.send(turn);
        return "sent";
      } catch (error) {
        return `${error.code}:${error.reason}`;
      }
    }, turn);
    expect(sent).toMatch(/^SEND_BLOCKED:/);
    expect(
      await app.evaluate(
        () => globalThis.blinklingTest.session.state.turns.length,
      ),
    ).toBe(0);
    expect(await events("capture")).toEqual([]);
    expect(await events("guard")).toEqual([{ type: "guard", lock: true }]);
    expect((await events("blink-say")).length).toBe(1);

    // Auto explain: ticks while locked read nothing and say they are locked.
    await app.evaluate(() => globalThis.blinklingTest.features.auto.enable());
    await new Promise((r) => setTimeout(r, 3200));
    await app.evaluate(() => globalThis.blinklingTest.features.auto.tick());
    expect(await events("capture-status")).toContainEqual(
      expect.objectContaining({ state: "locked" }),
    );
    expect(await events("watching")).toContainEqual({
      type: "watching",
      on: true,
    });
    await desktopShot(app, name);

    await focus(app, window_({ title: "Docs" }));
    await app.evaluate(() =>
      globalThis.blinklingTest.privacy.guard.allowed({ automatic: true }),
    );
    expect(await events("guard")).toEqual([
      { type: "guard", lock: true },
      { type: "guard", lock: false },
    ]);
    // Nothing from the locked window was kept under userData.
    const names = await readdir(dir, { recursive: true });
    expect(names.filter((n) => /\.(png|jpe?g)$/i.test(n))).toEqual([]);
  } finally {
    await browser.close();
    await close();
  }
}

test("a focused password field in Chromium blocks capture and sending and Blink gets the lock", async ({}, t) => {
  await locked(t, "privacy-password-field", {
    secure: true,
    window: window_({}).window,
  });
});
test("an incognito Chromium window blocks capture and sending and Blink gets the lock", async ({}, t) => {
  await locked(
    t,
    "privacy-incognito",
    window_({ title: "Docs - Google Chrome (Incognito)", private: true }),
    ["--incognito"],
  );
});
test("a password manager in front blocks capture and sending", async ({}, t) => {
  await locked(
    t,
    "privacy-password-manager",
    window_({ app: "1password", title: "1Password", passwordManager: true }),
  );
});

test("the usage limit is one bubble with the reset time, auto explain pauses, and nothing turns into an error", async () => {
  const resetsAt = Math.floor(Date.now() / 1000) + 3 * 60 * 60;
  const { app, events, close } = await launch({
    BLINKLING_TEST_LIMIT_RESET: String(resetsAt),
  });
  try {
    await background(app);
    await app.evaluate(() => globalThis.blinklingTest.features.auto.enable());
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.session.status.state),
      )
      .toBe("connected");
    await app.evaluate(() =>
      globalThis.blinklingTest.session.send({
        id: "33333333-3333-4333-8333-333333333333",
        text: "limit-me",
        source: "composer",
        attachments: [],
      }),
    );
    await expect.poll(async () => (await events("blink-say")).length).toBe(1);
    await new Promise((r) => setTimeout(r, 500));
    expect(await events("usage-limit")).toEqual([
      { type: "usage-limit", resetAt: resetsAt * 1000 },
    ]);
    expect((await events("blink-say")).length).toBe(1);
    expect(await events("capture-status")).toContainEqual({
      type: "capture-status",
      enabled: true,
      state: "paused",
      until: resetsAt * 1000,
    });
    const states = (await events("status")).map((e) => e.state);
    expect(states).not.toContain("blocked");
    expect(states).not.toContain("retrying");
    expect(
      (await events("capture-status")).some((e) => e.state === "error"),
    ).toBe(false);
    await desktopShot(app, "privacy-usage-limit");
  } finally {
    await close();
  }
});

test("a missing Claude is one bubble with an install hint and no error", async () => {
  const { app, blink, events, close } = await launch({
    BLINKLING_CLAUDE: "/nonexistent/claude",
  });
  try {
    await background(app);
    // The event fires before the window listens; a window that loads later is told.
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.session.status.detail),
      )
      .toBe("claude-missing");
    await blink.reload();
    await expect.poll(async () => (await events("blink-say")).length).toBe(1);
    await new Promise((r) => setTimeout(r, 1500));
    const says = await events("blink-say");
    expect(says.length).toBe(1);
    expect(says[0].text).toMatch(/Claude Code/);
    expect((await events("status")).map((e) => e.state)).not.toContain(
      "blocked",
    );
    await desktopShot(app, "privacy-claude-missing");
  } finally {
    await close();
  }
});
