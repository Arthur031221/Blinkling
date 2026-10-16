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
