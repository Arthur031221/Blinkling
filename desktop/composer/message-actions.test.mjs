import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createComposer } from "./index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { mountComposer } from "./view.mjs";
import { actionsFor, refreshTimes, relativeTime } from "./message-actions.mjs";
import { createSpeaker, pickVoice, spokenText } from "./speech.mjs";
import { chatMessage } from "../session/normalize.mjs";

const MIN = 60_000,
  HOUR = 60 * MIN,
  DAY = 24 * HOUR;
const now = Date.parse("2026-10-18T12:00:00Z");

test("relative time reads as words in the reader's language", () => {
  assert.equal(relativeTime(now - 6 * HOUR, now, "en"), "6 hours ago");
  assert.equal(relativeTime(now - 5 * MIN, now, "en"), "5 minutes ago");
  assert.equal(relativeTime(now - 20 * 1000, now, "en"), "now");
  assert.equal(relativeTime(now - 1 * DAY, now, "en"), "yesterday");
  assert.equal(relativeTime(now - 3 * DAY, now, "en"), "3 days ago");
  assert.equal(relativeTime(now - 6 * HOUR, now, "zh-TW"), "6 小時前");
  assert.equal(relativeTime(now - 6 * HOUR, now, "de"), "vor 6 Stunden");
});

test("the transcript's time reaches the message", () => {
  const message = chatMessage({
    type: "user",
    uuid: "u1",
    timestamp: "2026-10-18T10:00:00.000Z",
    message: { role: "user", content: "hello" },
  });
  assert.equal(message.at, Date.parse("2026-10-18T10:00:00Z"));
  assert.equal(
    chatMessage({
      type: "user",
      uuid: "u2",
      message: { role: "user", content: "hello" },
    }).at,
    undefined,
  );
});

test("the store keeps when a message was said; a replay without a time has none", () => {
  const store = createMessageStream();
  store.accept({
    type: "message",
    id: "a",
    role: "user",
    at: 1000,
    content: [{ type: "text", text: "x" }],
    replay: true,
  });
  store.accept({
    type: "message",
    id: "b",
    role: "user",
    content: [{ type: "text", text: "y" }],
    replay: true,
  });
  store.accept({
    type: "message",
    id: "c",
    role: "user",
    content: [{ type: "text", text: "z" }],
  });
  const [a, b, c] = store.state().messages;
  assert.equal(a.at, 1000);
  assert.equal(b.at, undefined);
  assert.ok(Math.abs(c.at - Date.now()) < 5000);
});

test("which actions each kind of message gets", () => {
  const base = { id: "m", content: [], text: "", complete: true };
  const answer = { ...base, role: "assistant", text: "yes" };
  assert.deepEqual(actionsFor(answer), ["copy", "retry", "read"]);
  assert.deepEqual(actionsFor({ ...answer, complete: false }), []);
  assert.deepEqual(actionsFor({ ...answer, plain: true }), []);
  assert.deepEqual(actionsFor({ ...answer, failure: { actions: [] } }), []);
  const mine = { ...base, role: "user", text: "why" };
  assert.deepEqual(actionsFor(mine), ["copy", "edit"]);
  assert.deepEqual(
    actionsFor({
      ...mine,
      text: "",
      content: [{ type: "image", data: "AAAA", mediaType: "image/png" }],
    }),
    ["edit"],
  );
});

function mount(hooks = {}) {
  const dom = new JSDOM("<body><div id='host'></div></body>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const previous = globalThis.AbortController;
  globalThis.AbortController = window.AbortController;
  const sent = [];
  let busy = null;
  const session = {
    send: async (turn) => sent.push(turn),
    select: async (s) => s,
    stop: async () => {},
    subscribe: (fn) => ((busy = fn), () => {}),
  };
  const composer = createComposer({
    session,
    selection: { model: "haiku", effort: "low" },
  });
  const store = createMessageStream();
  const host = window.document.querySelector("#host");
  const view = mountComposer(host, {
    composer,
    store,
    locale: "en",
    models: undefined,
    ...hooks,
  });
  return {
    window,
    host,
    store,
    composer,
    sent,
    session: (e) => busy(e),
    q: (s) => host.querySelector(s),
    all: (s) => [...host.querySelectorAll(s)],
    dispose() {
      view.dispose();
      composer.dispose();
      store.dispose();
      globalThis.AbortController = previous;
      window.close();
    },
  };
}
const say = (store, id, role, text, extra = {}) =>
  store.accept({
    type: "message",
    id,
    role,
    content: [{ type: "text", text }],
    ...extra,
  });

test("under an answer: copy goes through the given copy, ask again sends the question before it, time is shown", async () => {
  const copied = [];
  const t = mount({ copy: async (text) => copied.push(text) });
  say(t.store, "u1", "user", "What is this?");
  say(t.store, "a1", "assistant", "**A** page.", { at: Date.now() - 6 * HOUR });
  const row = t.q(".gl-assistant .gl-message-meta");
  assert.ok(row, "the answer has its row");
  assert.deepEqual(
    [...row.querySelectorAll("button")].map((b) => b.dataset.act),
    ["copy", "retry", "read"],
  );
  assert.equal(row.querySelector(".gl-meta-time").textContent, "6 hours ago");
  row.querySelector('[data-act="copy"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(copied, ["**A** page."]);
  assert.equal(row.querySelector('[data-act="copy"]').textContent, "Copied");
  row.querySelector('[data-act="retry"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].text, "What is this?");
  assert.deepEqual(t.sent[0].attachments, []);
  t.dispose();
});

test("ask again leaves what is being written alone", async () => {
  const t = mount({ copy: async () => {} });
  say(t.store, "u1", "user", "First?");
  say(t.store, "a1", "assistant", "One.");
  t.composer.draft("half a thought");
  t.q('[data-act="retry"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(t.composer.state().draft, "half a thought");
  t.dispose();
});

test("an answer still arriving has no row; a failure notice has none", () => {
  const t = mount();
  t.session({ type: "delta", id: "a1", text: "partial" });
  assert.equal(t.all(".gl-message-meta").length, 0);
  t.store.fail({ id: "f", text: "Trouble", actions: [] });
  assert.equal(t.all(".gl-message-meta").length, 0);
  t.dispose();
});

test("while Blink answers, ask again waits", async () => {
  const t = mount();
  say(t.store, "u1", "user", "Q");
  say(t.store, "a1", "assistant", "A");
  assert.equal(t.q('[data-act="retry"]').disabled, false);
  t.session({ type: "delta", id: "a2", text: "more" });
  assert.equal(t.q('[data-act="retry"]').disabled, true);
  t.session({ type: "done", turnId: undefined });
  t.dispose();
});

test("under my message: time, delivered tick, copy, and edit puts the words back in the box", async () => {
  const copied = [];
  const t = mount({ copy: async (x) => copied.push(x) });
  say(t.store, "u1", "user", "Explain the chart", { at: Date.now() - 5 * MIN });
  const row = t.q(".gl-user .gl-message-meta");
  assert.equal(row.querySelector(".gl-meta-time").textContent, "5 minutes ago");
  assert.ok(row.querySelector(".gl-meta-tick"));
  assert.equal(
    row.querySelector(".gl-meta-tick").title,
    "Delivered to Claude Code",
  );
  row.querySelector('[data-act="copy"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(copied, ["Explain the chart"]);
  t.composer.draft("");
  row.querySelector('[data-act="edit"]').click();
  assert.equal(t.composer.state().draft, "Explain the chart");
  assert.equal(t.q("textarea").value, "Explain the chart");
  assert.equal(t.store.state().messages.length, 1, "nothing was removed");
  t.dispose();
});

test("edit brings the pictures back too", () => {
  const t = mount();
  t.store.accept({
    type: "message",
    id: "u1",
    role: "user",
    content: [
      {
        type: "image",
        mediaType: "image/png",
        data: "iVBORw0KGgo=",
        name: "shot.png",
      },
      { type: "text", text: "What is this?" },
    ],
  });
  t.q('[data-act="edit"]').click();
  const state = t.composer.state();
  assert.equal(state.attachments.length, 1);
  assert.equal(state.attachments[0].name, "shot.png");
  assert.equal(state.draft, "What is this?");
  t.dispose();
});

test("the clock under a message is refreshed in place", () => {
  const t = mount();
  say(t.store, "u1", "user", "Q", { at: Date.now() });
  const label = t.q(".gl-meta-time");
  assert.equal(label.textContent, "now");
  refreshTimes(t.host, Date.now() + 5 * MIN, "en");
  assert.equal(label.textContent, "5 minutes ago");
  t.dispose();
});

test("reading aloud: waits for voices, picks the language, toggles off, says when there is no voice", async () => {
  const spoken = [];
  const win = {
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
    speechSynthesis: {
      cancelled: 0,
      getVoices: () => [
        { lang: "en-US", name: "E" },
        { lang: "zh_TW", name: "Z" },
      ],
      speak(u) {
        spoken.push(u);
      },
      cancel() {
        this.cancelled++;
      },
    },
    setTimeout,
    clearTimeout,
  };
  const speaker = createSpeaker(win, "zh-TW");
  let ended = 0;
  assert.equal(await speaker.toggle("m1", "你好", () => ended++), "started");
  assert.equal(spoken[0].voice.name, "Z");
  assert.equal(spoken[0].lang, "zh-TW");
  assert.equal(speaker.reading("m1"), true);
  assert.equal(await speaker.toggle("m1", "你好"), "stopped");
  assert.equal(ended, 1);
  assert.equal(speaker.reading("m1"), false);
  const silent = createSpeaker(
    {
      ...win,
      speechSynthesis: { ...win.speechSynthesis, getVoices: () => [] },
    },
    "en",
    { wait: 10 },
  );
  assert.equal(await silent.toggle("m", "hi"), "unavailable");
  assert.equal(await createSpeaker({}, "en").toggle("m", "hi"), "unavailable");
  assert.equal(pickVoice([{ lang: "en-GB" }], "en-US").lang, "en-GB");
  assert.equal(pickVoice([{ lang: "fr-FR" }], "en-US"), undefined);
});

test("what is read leaves out code and the row itself", () => {
  const dom = new JSDOM(
    `<article><div class="gl-markdown"><p>Hello  <b>there</b></p><div class="gl-code">code()</div><p>Bye <button class="gl-ref">1</button></p></div><div class="gl-message-meta">Copy</div></article>`,
  );
  assert.equal(
    spokenText(dom.window.document.querySelector("article")),
    "Hello there Bye",
  );
});
