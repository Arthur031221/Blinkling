import test from "node:test";
import assert from "node:assert/strict";
import { createMini, LONG_CHARS, LONG_LINES } from "./model.mjs";

const UUID = "00000000-0000-4000-8000-000000000001";
const image = {
  id: "a1",
  name: "Selection.png",
  mediaType: "image/png",
  data: "AAAA",
};
const textFile = (text) => ({
  id: "t1",
  name: "Selection.txt",
  mediaType: "text/plain",
  data: Buffer.from(text).toString("base64"),
});
const entry = (id, kind, extra = {}) => ({ id, kind, ...extra });

function host(overrides = {}) {
  const log = {
    sent: [],
    opened: [],
    closed: [],
    paused: 0,
    resumed: 0,
    translated: 0,
    pdf: 0,
  };
  return {
    log,
    send: async (turn) => void log.sent.push(turn),
    openComposer: (seed) => void log.opened.push(seed),
    close: (reason) => void log.closed.push(reason),
    pauseAuto: () => void log.paused++,
    resumeAuto: () => void log.resumed++,
    translatePage: async () => void log.translated++,
    openPdfReader: async () => void log.pdf++,
    ...overrides,
  };
}
const make = (options = {}) => {
  const h = options.host ?? host();
  const mini = createMini({
    locale: options.locale ?? "zh-TW",
    entries: options.entries ?? [
      entry("i1", "image", { attachment: image, taken: { kind: "image" } }),
    ],
    host: h,
    autoExplain: options.autoExplain ?? (() => false),
    once: options.once,
    uuid: () => UUID,
  });
  return { mini, h };
};

test("an image shows an image chip and the three quick-ask chips with the default highlighted", () => {
  const { mini } = make();
  const v = mini.view();
  assert.deepEqual(
    v.entries.map((e) => e.type),
    ["image"],
  );
  assert.deepEqual(
    v.chips.map((c) => [c.label, c.highlighted]),
    [
      ["這是什麼", true],
      ["翻譯", false],
      ["重點", false],
    ],
  );
  assert.equal(v.placeholder, undefined);
});

test("text shows a text chip with its first words and length", () => {
  const text =
    "Blink looks at your screen and explains what it sees to you quietly.";
  const { mini } = make({
    entries: [
      entry("t1", "text", {
        attachment: textFile(text),
        taken: { kind: "text", text },
      }),
    ],
  });
  const e = mini.view().entries[0];
  assert.equal(e.type, "text");
  assert.match(e.preview, /^Blink looks at your screen/);
  assert.equal(e.length, text.length);
  assert.equal(
    mini.view().defaultId,
    "translate",
    "English text for a Chinese reader",
  );
});

test("Enter with nothing typed sends the highlighted default as a quick ask", async () => {
  const { mini, h } = make();
  assert.equal((await mini.submit({})).type, "sent");
  const [turn] = h.log.sent;
  assert.equal(turn.source, "quick-ask");
  assert.equal(turn.id, UUID);
  assert.deepEqual(turn.attachments, [image]);
  assert.match(turn.text, /解釋|說明/);
  assert.deepEqual(h.log.closed, ["sent"]);
});

test("clicking a chip sends that chip's question at once", async () => {
  const { mini, h } = make();
  await mini.chip("keypoints");
  assert.match(h.log.sent[0].text, /重點/);
  assert.equal(h.log.sent[0].source, "quick-ask");
});

test("typed text is sent as the user's own message", async () => {
  const { mini, h } = make();
  mini.setText("這張圖在說什麼？");
  assert.equal((await mini.submit({})).type, "sent");
  assert.equal(h.log.sent[0].text, "這張圖在說什麼？");
  assert.equal(h.log.sent[0].source, "composer");
});

test("Shift+Enter is a new line, not a send", async () => {
  const { mini, h } = make();
  mini.setText("a");
  assert.equal((await mini.submit({ shift: true })).type, "newline");
  assert.equal(mini.view().text, "a\n");
  assert.equal(h.log.sent.length, 0);
});

test("removing a chip drops its attachment from the turn", async () => {
  const { mini, h } = make({
    entries: [
      entry("i1", "image", { attachment: image }),
      entry("t1", "text", {
        attachment: textFile("hello there"),
        taken: { kind: "text", text: "hello there" },
      }),
    ],
  });
  mini.remove("i1");
  await mini.submit({});
  assert.deepEqual(
    h.log.sent[0].attachments.map((a) => a.mediaType),
    ["text/plain"],
  );
});

test("with every chip removed it is a plain text box with no quick asks", async () => {
  const { mini, h } = make();
  mini.remove("i1");
  assert.deepEqual(mini.view().chips, []);
  assert.equal((await mini.submit({})).type, "empty");
  assert.equal(h.log.sent.length, 0);
  mini.setText("hi");
  assert.equal((await mini.submit({})).type, "sent");
  assert.deepEqual(h.log.sent[0].attachments, []);
});

test("a long message grows into the full composer and carries everything along", () => {
  const { mini, h } = make();
  mini.setText("x".repeat(LONG_CHARS + 1));
  assert.equal(h.log.opened.length, 1);
  assert.equal(h.log.opened[0].text.length, LONG_CHARS + 1);
  assert.deepEqual(h.log.opened[0].attachments, [image]);
  assert.deepEqual(h.log.closed, ["grew"]);
  assert.equal(h.log.sent.length, 0);
});

test("so does a message of many lines", () => {
  const { mini, h } = make();
  mini.setText(Array(LONG_LINES).fill("a").join("\n"));
  assert.equal(h.log.opened.length, 1);
});

test("Escape discards the pick and closes", () => {
  const { mini, h } = make();
  mini.escape();
  assert.deepEqual(h.log.closed, ["escape"]);
  assert.equal(h.log.sent.length, 0);
});

test("closing twice only closes once", () => {
  const { mini, h } = make();
  mini.escape();
  mini.escape();
  assert.equal(h.log.closed.length, 1);
});

test("while auto explain is on the line says it is paused, and it resumes on close", () => {
  const { mini, h } = make({ autoExplain: () => true });
  assert.equal(mini.view().pause, true);
  assert.equal(h.log.paused, 1);
  mini.escape();
  assert.equal(h.log.resumed, 1);
});

test("with auto explain off there is no pause line and nothing to resume", () => {
  const { mini, h } = make();
  assert.equal(mini.view().pause, false);
  mini.escape();
  assert.deepEqual([h.log.paused, h.log.resumed], [0, 0]);
});

test("a page pick in a browser offers to translate the whole page without sending a turn", async () => {
  const taken = {
    kind: "page",
    browser: true,
    text: "Hello world, this is a page.",
  };
  const { mini, h } = make({
    entries: [entry("p1", "page", { attachment: textFile(taken.text), taken })],
  });
  const offers = mini.view().offers;
  assert.deepEqual(
    offers.map((o) => o.id),
    ["translate-page"],
  );
  await mini.offer("translate-page");
  assert.equal(h.log.translated, 1);
  assert.equal(h.log.sent.length, 0);
  assert.deepEqual(h.log.closed, ["offer"]);
});

test("no translate offer without a host that can translate pages, or off a browser", () => {
  const taken = { kind: "page", browser: true, text: "Hello" };
  const { mini } = make({
    host: host({ translatePage: undefined }),
    entries: [entry("p1", "page", { attachment: textFile("Hello"), taken })],
  });
  assert.deepEqual(mini.view().offers, []);
  const other = make({
    entries: [
      entry("p1", "page", {
        attachment: textFile("Hello"),
        taken: { kind: "page", text: "Hello" },
      }),
    ],
  });
  assert.deepEqual(other.mini.view().offers, []);
});

test("a page with no text has nothing to translate, so only the PDF reader is offered", () => {
  const taken = {
    kind: "page",
    browser: true,
    text: "  ",
    window: { pdf: true },
  };
  const once = { take: () => true, seen: () => false };
  const { mini } = make({
    once,
    entries: [entry("p1", "page", { attachment: image, taken })],
  });
  assert.deepEqual(
    mini.view().offers.map((o) => o.id),
    ["pdf-reader"],
  );
});

test("a PDF viewer pick with no text offers the PDF reader once", async () => {
  const taken = { kind: "window", window: { pdf: true } };
  const seen = new Set();
  const once = {
    take: (k) => (seen.has(k) ? false : (seen.add(k), true)),
    seen: (k) => seen.has(k),
  };
  const first = make({
    once,
    entries: [entry("w1", "window", { attachment: image, taken })],
  });
  assert.deepEqual(
    first.mini.view().offers.map((o) => o.id),
    ["pdf-reader"],
  );
  await first.mini.offer("pdf-reader");
  assert.equal(first.h.log.pdf, 1);
  const second = make({
    once,
    entries: [entry("w1", "window", { attachment: image, taken })],
  });
  assert.deepEqual(second.mini.view().offers, [], "only the first time");
});

test("a PDF pick that has text does not offer the reader", () => {
  const taken = { kind: "text", text: "real text", window: { pdf: true } };
  const { mini } = make({
    entries: [entry("t", "text", { attachment: textFile("real text"), taken })],
  });
  assert.deepEqual(mini.view().offers, []);
});
