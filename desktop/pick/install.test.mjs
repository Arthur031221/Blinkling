import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPick } from "./install.mjs";
import { blinkRect } from "./blink-rect.mjs";
import { createLocatorStub, display, element } from "./test/locator-stub.mjs";

const pdfWindow = { id: "w2", title: "Report.pdf - Browser", app: "browser", bounds: display.bounds };
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 20; i++) await tick(1);
};

function rig(options = {}) {
  const log = [];
  const sent = [];
  const events = [];
  const plays = [];
  let miniArgs = null;
  let t = 1_000_000;
  const layers = {
    shown: false,
    show() {
      layers.shown = true;
      log.push("layers-show");
    },
    hide() {
      layers.shown = false;
      log.push("layers-hide");
    },
    state: (s) => log.push(`state:${s.active ? "active" : "idle"}${s.hint ? ":hint" : ""}`),
    blank: async () => {},
    play: async (message) => {
      plays.push(message);
      log.push(`play:${message.taken.kind}`);
      await options.playGate;
    },
    frames: async () => [],
    dispose() {},
  };
  const blink = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ x: 1100, y: 640, width: 120, height: 120 }),
    hide() {},
    showInactive() {},
    webContents: { send: (channel) => log.push(`blink:${channel}`) },
  };
  const miniWindow = {
    win: { isDestroyed: () => true },
    show: async () => log.push("mini-show"),
    hide: () => log.push("mini-hide"),
    dispose() {},
  };
  let paused = false;
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), "pick-install-"));
  const keyHandlers = new Set();
  const settingsHandlers = [];
  const pick = installPick({
    blink,
    locator: createLocatorStub({
      elements: [
        element("page", "page", display.bounds, { window: options.window }),
        element("para", "paragraph", { x: 100, y: 100, width: 400, height: 60 }, { text: options.text ?? "Hello there" }),
      ],
    }),
    guard: { allowed: () => true },
    settings: {
      get: (key) => (key === "pickKey" ? options.pickKey : undefined),
      on: (_event, handler) => (settingsHandlers.push(handler), () => {}),
    },
    composer: { open: (seed) => sent.push({ grow: seed }) },
    autoExplain: { enabled: () => true, pause: () => log.push("pause") },
    session: { send: async (turn) => sent.push({ turn }) },
    send: (event) => events.push(event),
    electron: {
      screen: {
        getCursorScreenPoint: () => ({ x: 120, y: 120 }),
        getDisplayNearestPoint: () => ({ ...display, workArea: display.bounds }),
        getDisplayMatching: () => ({ workArea: display.bounds }),
      },
    },
    screenImage: async () => {
      throw new Error("no screen in the test");
    },
    host: {
      translatePage: async () => log.push("translate-page"),
      openPdfReader: async () => log.push("pdf-reader"),
    },
    input: { restoreFocus: () => log.push("restore-focus"), rememberFocus: async () => {} },
    placement: options.placement,
    statePath: join(dir, "pick.json"),
    locale: "en",
    now: () => t,
    parts: {
      createLayers: () => layers,
      createMiniWindow: (args) => ((miniArgs = args), miniWindow),
      createKeySource: async () => ({
        available: true,
        subscribe: (handler) => (keyHandlers.add(handler), () => keyHandlers.delete(handler)),
      }),
    },
  });
  const key = (type, name, code = name) => [...keyHandlers].forEach((h) => h({ type, key: name, code }));
  return {
    pick,
    log,
    sent,
    events,
    layers,
    plays,
    miniArgs: () => miniArgs,
    dir,
    key,
    settingsHandlers,
    advance: (ms) => (t += ms),
  };
}

const taken = (extra = {}) => ({
  kind: "text",
  source: "pick",
  bounds: { x: 100, y: 100, width: 400, height: 60 },
  display,
  image: { data: "AAAA", width: 400, height: 60 },
  text: "Hello there",
  ...extra,
});

test("holding Ctrl for the threshold raises the layer and a short hold does nothing", async () => {
  const r = rig();
  await r.pick.ready;
  r.key("keydown", "control", 29);
  await tick(60);
  r.key("keyup", "control", 29);
  assert.ok(!r.log.includes("layers-show"));
  r.key("keydown", "control", 29);
  await tick(300);
  assert.ok(r.log.includes("layers-show"));
  assert.ok(r.log.includes("state:active:hint"), "the first hold teaches once");
  r.key("keyup", "control", 29);
  await flush();
  r.pick.dispose();
});

test("the hint shows on the first hold only, across restarts", async () => {
  const first = rig();
  await first.pick.ready;
  first.key("keydown", "control", 29);
  await tick(300);
  first.key("keyup", "control", 29);
  assert.equal(JSON.parse(readFileSync(join(first.dir, "pick.json"), "utf8")).hinted, true);
  first.pick.dispose();

  const second = rig({ dir: first.dir });
  await second.pick.ready;
  second.key("keydown", "control", 29);
  await tick(300);
  assert.ok(second.log.includes("state:active"));
  assert.ok(!second.log.includes("state:active:hint"));
  second.key("keyup", "control", 29);
  second.pick.dispose();
});

test("a pick flies into Blink before the mini composer opens with its chip", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken(), { id: "a" });
  const order = r.log.filter((l) => /^(play|blink|mini-show)/.test(l));
  assert.deepEqual(order, ["play:text", "blink:blinkling:catch", "mini-show"]);
});

test("the flight lands in Blink's art and the mini sits by it, not by the display-wide window", async () => {
  const position = { edge: "right", peek: { x: 1280, y: 640 }, reveal: { x: 1190, y: 640 } };
  const r = rig({ placement: () => ({ display, position }) });
  await r.pick.ready;
  await r.pick.deliver(taken(), { id: "a" });
  const art = blinkRect({ display, position });
  assert.deepEqual(r.plays[0].blink, { x: art.x + art.width / 2, y: art.y + art.height / 2 });
  assert.deepEqual(r.miniArgs().blinkBounds(), art);
});

test("a pick after sixty quiet seconds starts a new chat and drops the old picks", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken(), { id: "a" });
  r.advance(30_000);
  await r.pick.deliver(taken({ text: "Second" }), { id: "b" });
  assert.equal(r.events.filter((e) => e.type === "reset").length, 0);
  r.advance(65_000);
  await r.pick.deliver(taken({ text: "Third" }), { id: "c" });
  assert.equal(r.events.filter((e) => e.type === "reset").length, 1);
});

test("the mini composer opens with the highlighted default chip", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken({ text: "これは日本語です。" }), { id: "a" });
  const state = r.pick.mini.state();
  assert.equal(state.open, true);
  assert.deepEqual(state.chips.filter((c) => c.highlighted).map((c) => c.id), ["translate"]);
});

test("a page pick in a foreign language offers to translate the whole page, once", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken({ kind: "page", text: "これは日本語のページです。翻訳が必要です。" }), { id: "a" });
  assert.deepEqual(r.pick.mini.state().offers.map((o) => o.id), ["translate-page"]);
  await r.pick.mini.offer("translate-page");
  assert.ok(r.log.includes("translate-page"));
  assert.deepEqual(r.pick.mini.state().offers, []);
});

test("a text pick never offers a whole-page translation", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken({ text: "これは日本語です。" }), { id: "a" });
  assert.deepEqual(r.pick.mini.state().offers, []);
});

test("the PDF reader is offered once, on a textless pick of a PDF window", async () => {
  const r = rig();
  await r.pick.ready;
  const blank = taken({ kind: "page", text: undefined });
  delete blank.text;
  await r.pick.deliver(blank, { id: "a", window: pdfWindow });
  assert.deepEqual(r.pick.mini.state().offers.map((o) => o.id), ["pdf"]);
  await r.pick.mini.offer("pdf");
  assert.ok(r.log.includes("pdf-reader"));
  await r.pick.mini.key({ key: "Escape" });
  await r.pick.deliver(blank, { id: "b", window: pdfWindow });
  assert.deepEqual(r.pick.mini.state().offers, [], "the offer comes once, ever");
  assert.equal(JSON.parse(readFileSync(join(r.dir, "pick.json"), "utf8")).pdfOffered, true);
});

test("a PDF window with text gets no reader offer", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken({ kind: "page" }), { id: "a", window: pdfWindow });
  assert.deepEqual(r.pick.mini.state().offers, []);
});

test("Esc discards the picks and gives the keyboard back", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken(), { id: "a" });
  await r.pick.mini.key({ key: "Escape" });
  assert.equal(r.pick.mini.state().open, false);
  assert.ok(r.log.includes("restore-focus"));
  assert.ok(r.log.includes("mini-hide"));
  assert.equal(r.sent.length, 0);
});

test("Enter sends the picks with the default ask", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver(taken(), { id: "a" });
  await r.pick.mini.key({ key: "Enter" });
  const turn = r.sent.find((s) => s.turn)?.turn;
  assert.equal(turn.source, "quick-ask");
  assert.match(turn.text, /Explain this simply/);
  assert.deepEqual(turn.attachments.map((a) => a.name), ["Pick 1.png", "Picked text.txt"]);
});

test("a second pick while the first flies is kept and shown after it lands", async () => {
  let release;
  const playGate = new Promise((resolve) => (release = resolve));
  const r = rig({ playGate });
  await r.pick.ready;
  const one = r.pick.deliver(taken(), { id: "a" });
  const two = r.pick.deliver(taken({ text: "Second" }), { id: "b" });
  await flush();
  assert.equal(r.pick.mini.state().open, false);
  release();
  await Promise.all([one, two]);
  assert.equal(r.pick.mini.state().picks.length, 2);
});

test("the layers go away after the key is released, not before the effect finished", async () => {
  let release;
  const playGate = new Promise((resolve) => (release = resolve));
  const r = rig({ playGate });
  await r.pick.ready;
  r.key("keydown", "control", 29);
  await tick(300);
  const done = r.pick.deliver(taken(), { id: "a" });
  r.key("keyup", "control", 29);
  await tick(260);
  assert.ok(!r.log.includes("layers-hide"), "still playing");
  release();
  await done;
  await tick(260);
  assert.ok(r.log.includes("layers-hide"));
});

test("changing the pick key in settings takes effect at once", async () => {
  const options = { pickKey: "control" };
  const r = rig(options);
  await r.pick.ready;
  options.pickKey = "option";
  for (const handler of r.settingsHandlers) handler();
  r.key("keydown", "control", 29);
  await tick(300);
  assert.ok(!r.log.includes("layers-show"), "Ctrl is not the pick key now");
  r.key("keyup", "control", 29);
  r.key("keydown", "option", 56);
  await tick(300);
  assert.ok(r.log.includes("layers-show"));
  r.key("keyup", "option", 56);
});

test("a legacy capture record from the overlay or hotkey is delivered like a pick", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver({
    image: { id: "shot", name: "capture.png", mediaType: "image/png", data: "AAAA" },
    region: { x: 40, y: 50, width: 300, height: 200 },
    display,
    pixelWidth: 600,
    pixelHeight: 400,
  });
  assert.ok(r.log.includes("play:area"));
  assert.ok(r.log.includes("blink:blinkling:catch"));
  const [pick] = r.pick.mini.state().picks;
  assert.equal(pick.kind, "area");
});

test("a capture with no region is the whole screen", async () => {
  const r = rig();
  await r.pick.ready;
  await r.pick.deliver({ image: { data: "AAAA" } });
  assert.ok(r.log.includes("play:screen"));
});
