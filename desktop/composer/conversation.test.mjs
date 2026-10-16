import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountConversation } from "./conversation.mjs";

test("a tab pressed in the card reaches the shell through the conversation", () => {
  const dom = new JSDOM("<body><div id='host'></div></body>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const previous = globalThis.AbortController;
  globalThis.AbortController = window.AbortController;
  let listener;
  const asked = [];
  const conversation = mountConversation({
    session: {
      subscribe: (fn) => {
        listener = fn;
        return () => {};
      },
      send: async () => {},
      select: async () => {},
    },
    cardHost: window.document.querySelector("#host"),
    selection: { model: "haiku", effort: "low" },
    onChat: (key) => asked.push(key),
  });
  listener({
    type: "chat",
    key: "a",
    channel: true,
    chats: [
      { key: "a", label: "alpha", live: true },
      { key: "b", label: "beta", live: true },
    ],
  });
  window.document.querySelector('[data-chat="b"]').click();
  assert.deepEqual(asked, ["b"]);
  conversation.dispose();
  globalThis.AbortController = previous;
});

test("a new language rebuilds only the card's words: the chat, the draft and the closed state stay", () => {
  const dom = new JSDOM("<body><div id='host'></div></body>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const previous = globalThis.AbortController;
  globalThis.AbortController = window.AbortController;
  let listener;
  const doc = window.document;
  doc.documentElement.dataset.locale = "en";
  const conversation = mountConversation({
    session: {
      subscribe: (fn) => {
        listener = fn;
        return () => {};
      },
      send: async () => {},
      select: async () => {},
    },
    cardHost: doc.querySelector("#host"),
    selection: { model: "haiku", effort: "low" },
  });
  listener({
    type: "message",
    id: "m1",
    role: "assistant",
    content: [{ type: "text", text: "kept answer" }],
  });
  conversation.composer.draft("half a thought");
  const placeholder = () => doc.querySelector(".gl-input").placeholder;
  const english = placeholder();
  conversation.card.close(true);
  doc.documentElement.dataset.locale = "de";
  conversation.relocalize();
  assert.notEqual(placeholder(), english, "the box speaks German now");
  assert.equal(doc.querySelectorAll(".gl-chat-card").length, 1);
  assert.match(
    doc.querySelector(".gl-chat-history").textContent,
    /kept answer/,
  );
  assert.equal(doc.querySelector(".gl-input").value, "half a thought");
  assert.equal(conversation.card.isOpen(), false, "still closed");
  conversation.dispose();
  globalThis.AbortController = previous;
});
