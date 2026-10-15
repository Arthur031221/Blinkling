import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createMini, LONG_MESSAGE } from "./model.mjs";

const png = Buffer.from("png").toString("base64");
const pick = (id, extra = {}) => ({
  id,
  kind: "text",
  text: "Hello there, this is a sentence",
  image: { data: png, width: 200, height: 40 },
  ...extra,
});

function rig(options = {}) {
  const sent = [];
  const events = { grown: [], discarded: 0, focus: 0, paused: 0, closed: 0, translated: 0, reader: 0 };
  let auto = options.auto ?? false;
  let n = 0;
  const mini = createMini({
    locale: options.locale ?? "en",
    send: async (turn) => sent.push(turn),
    grow: (seed) => events.grown.push(seed),
    discard: () => events.discarded++,
    restoreFocus: () => events.focus++,
    close: () => events.closed++,
    autoExplain: {
      enabled: () => auto,
      pause: () => {
        auto = false;
        events.paused++;
      },
    },
    host: {
      translatePage: async () => events.translated++,
      openPdfReader: async () => events.reader++,
    },
    newId: () => `id-${++n}`,
  });
  return { mini, sent, events };
}

test("the three quick asks are chips and Enter's choice is the highlighted one", () => {
  const r = rig();
  r.mini.open([pick("a")]);
  const s = r.mini.state();
  assert.deepEqual(s.chips.map((c) => c.id), ["what", "translate", "points"]);
  assert.deepEqual(s.chips.filter((c) => c.highlighted).map((c) => c.id), ["what"]);
  assert.equal("placeholder" in s, false);
});

test("foreign text highlights Translate", () => {
  const r = rig();
  r.mini.open([pick("a", { text: "これは日本語の文章です。" })]);
  assert.equal(r.mini.state().chips.find((c) => c.highlighted).id, "translate");
});

test("Enter on an empty line sends the highlighted chip with the picks", async () => {
  const r = rig();
  r.mini.open([pick("a")]);
  await r.mini.key({ key: "Enter" });
  assert.equal(r.sent.length, 1);
  const turn = r.sent[0];
  assert.equal(turn.source, "quick-ask");
  assert.match(turn.text, /Explain this simply/);
  assert.deepEqual(turn.attachments.map((a) => a.mediaType), ["image/png", "text/plain"]);
  assert.equal(r.events.closed, 1);
});

test("a click on another chip sends that chip's question", async () => {
  const r = rig();
  r.mini.open([pick("a")]);
  await r.mini.chip("points");
  assert.match(r.sent[0].text, /key points/);
});

test("typed text is what Enter sends", async () => {
  const r = rig();
  r.mini.open([pick("a")]);
  r.mini.input("why is it blue?");
  await r.mini.key({ key: "Enter" });
  assert.equal(r.sent[0].text, "why is it blue?");
});

test("each pick has an image chip, and text gets a text chip beside it", () => {
  const r = rig();
  r.mini.open([pick("a"), pick("b", { kind: "image", text: undefined })]);
  const picks = r.mini.state().picks;
  assert.equal(picks.length, 2);
  assert.match(picks[0].textChip, /· 31 characters/);
  assert.equal(picks[1].textChip, null);
});

test("many picks stay inside the attachment limit by joining their text", async () => {
  const r = rig();
  r.mini.open(Array.from({ length: 6 }, (_, i) => pick(String(i))));
  await r.mini.key({ key: "Enter" });
  const kinds = r.sent[0].attachments.map((a) => a.mediaType);
  assert.equal(kinds.filter((k) => k === "image/png").length, 6);
  assert.equal(kinds.filter((k) => k === "text/plain").length, 1);
  assert.ok(r.sent[0].attachments.length <= 8);
});

test("Shift+Enter grows into the full composer with the same text and chips", async () => {
  const r = rig();
  r.mini.open([pick("a")]);
  r.mini.input("a longer thought");
  await r.mini.key({ key: "Enter", shiftKey: true });
  assert.equal(r.sent.length, 0);
  assert.equal(r.events.grown.length, 1);
  assert.equal(r.events.grown[0].draft, "a longer thought");
  assert.equal(r.events.grown[0].picks.length, 1);
  assert.equal(r.events.discarded, 0);
});

test("a long message grows on its own", () => {
  const r = rig();
  r.mini.open([pick("a")]);
  r.mini.input("x".repeat(LONG_MESSAGE + 1));
  assert.equal(r.events.grown.length, 1);
  assert.equal(r.events.grown[0].draft.length, LONG_MESSAGE + 1);
});

test("Escape discards the picks and hands focus back", async () => {
  const r = rig();
  r.mini.open([pick("a")]);
  await r.mini.key({ key: "Escape" });
  assert.equal(r.events.discarded, 1);
  assert.equal(r.events.focus, 1);
  assert.equal(r.events.closed, 1);
  assert.equal(r.sent.length, 0);
});

test("removing the last chip closes the mini composer", () => {
  const r = rig();
  r.mini.open([pick("a")]);
  r.mini.remove("a");
  assert.equal(r.events.discarded, 1);
});

test("sending hands focus back too", async () => {
  const r = rig();
  r.mini.open([pick("a")]);
  await r.mini.key({ key: "Enter" });
  assert.equal(r.events.focus, 1);
});

test("the pause line is there only while auto explain is on, and one click pauses it", () => {
  const off = rig();
  off.mini.open([pick("a")]);
  assert.equal(off.mini.state().pause, false);
  const on = rig({ auto: true });
  on.mini.open([pick("a")]);
  assert.equal(on.mini.state().pause, true);
  on.mini.pauseAuto();
  assert.equal(on.events.paused, 1);
  assert.equal(on.mini.state().pause, false);
});

test("opened from Blink with no picks, it can still pause auto explain", () => {
  const r = rig({ auto: true });
  r.mini.open([]);
  assert.equal(r.mini.state().pause, true);
  assert.deepEqual(r.mini.state().chips, []);
});

test("an offer runs its host action once and then goes away", async () => {
  const r = rig();
  r.mini.open([pick("a", { kind: "page" })], [{ id: "translate-page" }, { id: "pdf" }]);
  assert.deepEqual(r.mini.state().offers.map((o) => o.id), ["translate-page", "pdf"]);
  await r.mini.offer("translate-page");
  assert.equal(r.events.translated, 1);
  assert.deepEqual(r.mini.state().offers.map((o) => o.id), ["pdf"]);
  await r.mini.offer("pdf");
  assert.equal(r.events.reader, 1);
  assert.equal(r.mini.state().offers.length, 0);
});

test("dismissing an offer does not run it", () => {
  const r = rig();
  r.mini.open([pick("a")], [{ id: "pdf" }]);
  r.mini.dismissOffer("pdf");
  assert.equal(r.events.reader, 0);
  assert.equal(r.mini.state().offers.length, 0);
});

test("adding a pick while open updates the chips and keeps the draft", () => {
  const r = rig();
  r.mini.open([pick("a")]);
  r.mini.input("hello");
  r.mini.update([pick("a"), pick("b")]);
  assert.equal(r.mini.state().picks.length, 2);
  assert.equal(r.mini.state().draft, "hello");
});

test("nothing is sent from a closed mini composer", async () => {
  const r = rig();
  await r.mini.key({ key: "Enter" });
  assert.equal(r.sent.length, 0);
});
