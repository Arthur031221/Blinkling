import test from "node:test";
import assert from "node:assert/strict";
import { createQuick } from "./quick.mjs";

const entry = (id, taken = { kind: "image" }) => ({
  id,
  kind: taken.kind,
  taken,
  attachment: { id: `a-${id}`, name: `${id}.png`, mediaType: "image/png" },
});

function setup({ auto = false, pdf = true } = {}) {
  const log = { attached: [], shown: [], paused: 0, resumed: 0, pdf: 0 };
  const seen = new Set();
  const quick = createQuick({
    locale: "en",
    autoExplain: () => auto,
    once: { take: (key) => (seen.has(key) ? false : (seen.add(key), true)) },
    host: {
      attach: async (a) => void log.attached.push(a),
      show: (view) => void log.shown.push(view),
      pauseAuto: () => void log.paused++,
      resumeAuto: () => void log.resumed++,
      openPdfReader: pdf ? async () => void log.pdf++ : undefined,
    },
  });
  return { quick, log };
}

test("a capture goes into the card as ordinary attachments and tells it the default question", async () => {
  const { quick, log } = setup();
  await quick.open([entry("one"), entry("two")]);
  assert.deepEqual(
    log.attached.map((a) => a.id),
    ["a-one", "a-two"],
  );
  const view = log.shown.at(-1);
  assert.equal(view.type, "quick");
  assert.equal(view.active, true);
  assert.equal(view.defaultId, "what");
});

test("foreign text makes Translate the default and a long page makes Key points", async () => {
  const { quick, log } = setup();
  await quick.open([
    entry("t", {
      kind: "text",
      text: "Bonjour tout le monde, la page est ici",
    }),
  ]);
  assert.equal(log.shown.at(-1).defaultId, "translate");
  quick.end();
  await quick.open([entry("p", { kind: "page", text: "word ".repeat(200) })]);
  assert.equal(log.shown.at(-1).defaultId, "keypoints");
});

test("removing the last chip, or ending, closes the question and resumes Auto explain", async () => {
  const { quick, log } = setup({ auto: true });
  await quick.open([entry("one")]);
  assert.equal(log.paused, 1);
  assert.match(
    log.shown.at(-1).pause,
    /\S/,
    "the card says Auto explain waits",
  );
  quick.remove("a-one");
  assert.deepEqual(log.shown.at(-1), { type: "quick", active: false });
  assert.equal(log.resumed, 1);
  quick.end();
  assert.equal(log.resumed, 1, "ending twice resumes once");
});

test("a second capture joins the open question; only the first pauses Auto explain", async () => {
  const { quick, log } = setup({ auto: true });
  await quick.open([entry("one")]);
  await quick.open([entry("two")]);
  assert.equal(log.paused, 1);
  assert.equal(quick.entries().length, 2);
});

test("a note shows once an entry is open and ignores codes the card has no line for", async () => {
  const { quick, log } = setup();
  quick.note("visible-part");
  assert.equal(log.shown.length, 0, "nothing is open");
  await quick.open([entry("one")]);
  quick.note("nonsense");
  assert.equal(log.shown.at(-1).notice, "");
  quick.note("visible-part");
  assert.equal(log.shown.at(-1).notice, "visible-part");
});

test("a blank PDF window offers the reader once, and taking the offer opens it", async () => {
  const { quick, log } = setup();
  const pdf = { kind: "window", window: { pdf: true }, text: "" };
  await quick.open([entry("one", pdf)]);
  assert.equal(log.shown.at(-1).offer.id, "pdf-reader");
  await quick.offer("pdf-reader");
  assert.equal(log.pdf, 1);
  assert.equal(log.shown.at(-1).offer, null);
  quick.end();
  await quick.open([entry("two", pdf)]);
  assert.equal(log.shown.at(-1).offer, null, "never offered a second time");
});
