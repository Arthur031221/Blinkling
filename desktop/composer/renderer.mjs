import { mountConversation, sessionFromDesktopAPI } from "./conversation.mjs";
import { anchorOf, growOrigin } from "./origin.mjs";
import { captureNotice } from "../capture/full-page.mjs";
const api = window.blinkling;
const configuration = await api.configuration();
document.body.dataset.surface = configuration.surface ?? "card";
if (configuration.theme)
  document.documentElement.dataset.theme = configuration.theme;
let shellState;
/** The card grows out of Blink, wherever Blink currently is. */
function placeOrigin() {
  const card = document.querySelector(".gl-chat-card");
  if (!card || !shellState?.position) return;
  // Layout offsets, not getBoundingClientRect: the grow animation is a
  // transform, and measuring through it would shift the origin it is built on.
  let x = screenX,
    y = screenY;
  for (let n = card; n; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  document.documentElement.style.setProperty(
    "--gl-origin",
    growOrigin(
      { x, y, width: card.offsetWidth, height: card.offsetHeight },
      anchorOf(shellState),
    ),
  );
}
const unShell = api.onShell?.((event) => {
  if (event.type !== "state") return;
  document.documentElement.dataset.theme = event.state.theme;
  shellState = event.state;
  placeOrigin();
});
api.shell?.({ type: "state" }).then(
  (state) => {
    shellState ??= state;
    placeOrigin();
  },
  () => {},
);
export const conversation = mountConversation({
  session: sessionFromDesktopAPI(api),
  cardHost:
    configuration.surface === "bubbles"
      ? null
      : document.querySelector("#card"),
  bubbleHost: document.querySelector("#answers"),
  ...configuration,
  onOpenChat: (id) => api.openChat?.(id),
  onActivity: (activity) => api.activity?.(activity),
  onPin: (value) => api.pin?.(value),
  onClose: () => api.close?.(),
  onTyping: (value) => api.typing?.(value),
  onHold: (value) => api.hold?.(value),
  openLink: (url) => api.openLink?.(url),
});
const unCapture = api.onCapture?.((capture) => conversation.capture(capture));
const unSurface = api.onSurface?.((event) => {
  if (event.type === "hover") conversation.hover(event.value);
  if (event.type === "open") {
    conversation.card?.open(event.messageId);
    placeOrigin();
  }
  if (event.type === "view" && conversation.card) {
    notice.hidden = false;
    notice.textContent =
      event.view === "help"
        ? "滑過 Blink 打開動作。拖曳 Blink 到螢幕邊緣。Shift 或 Ctrl+Shift+S 選取區域。"
        : "釘選讓對話保持開啟。拖曳 Blink 會記住每個螢幕的位置。";
  }
  if (event.type === "close") conversation.card?.close();
});
window.addEventListener(
  "pagehide",
  () => {
    unCapture?.();
    unSurface?.();
    unShell?.();
    unEvent?.();
    cleanShapes?.();
    conversation.dispose();
  },
  { once: true },
);

// The card owns an in-flow notice above its form; the bubble surface has no
// toolbar, so its notice sits below the deck.
const notice = conversation.card?.notice ?? document.createElement("section");
if (!notice.isConnected) {
  notice.className = "gl-notice";
  notice.hidden = true;
  document.querySelector("#answers").append(notice);
}
const guide = document.createElement("section");
guide.className = "gl-guide";
guide.hidden = true;
document.querySelector("#answers").append(guide);
const button = (label, action, enabled = true) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.disabled = !enabled;
  b.addEventListener("click", () => api.action(action).catch(() => {}));
  return b;
};
const unEvent = api.onEvent((event) => {
  if (event.type === "companion-required") {
    notice.replaceChildren(
      "整頁截圖需要瀏覽器小幫手。",
      button("安裝說明", "companion-guide"),
      button("截取畫面", "screen"),
    );
    notice.hidden = false;
  }
  if (event.type === "guide") {
    guide.replaceChildren();
    guide.hidden = event.phase === "dismissed";
    notice.hidden = true;
    for (const text of event.bubbles ??
      (event.phase === "thinking" ? ["正在看這個畫面…"] : [])) {
      const bubble = document.createElement("p");
      bubble.className = "gl-answer-bubble";
      bubble.textContent = text;
      guide.append(bubble);
    }
    if (["overview", "step"].includes(event.phase))
      guide.append(
        button("上一步", "guide-back", event.canBack),
        button(event.last ? "完成" : "下一步", "guide-next", event.canNext),
        button("總覽", "guide-overview"),
        button("結束導覽", "guide-dismiss"),
      );
    if (event.phase === "finished")
      guide.append(
        button("上一步", "guide-back", event.canBack),
        button("總覽", "guide-overview"),
        button("結束導覽", "guide-dismiss"),
      );
    if (event.phase === "error")
      guide.append(
        button("再試一次", "guide-retry"),
        button("關閉", "guide-dismiss"),
      );
  }
  const change = captureNotice(event);
  if (change?.hidden) notice.hidden = true;
  else if (change) {
    notice.textContent = change.text;
    notice.hidden = false;
  }
});
let cleanShapes;
if (configuration.surface === "bubbles") {
  const shapes = () => {
    const regions = [
      ...document.querySelectorAll(
        ".gl-answer-bubble, .gl-notice, .gl-guide > button",
      ),
    ]
      .filter(
        (n) =>
          n.getClientRects().length &&
          (!n.closest(".gl-bubble-deck") ||
            n.closest(".gl-bubble-deck").dataset.visible === "true"),
      )
      .map((n) => n.getBoundingClientRect())
      .map((r) => ({
        x: Math.max(0, Math.ceil(r.x)),
        y: Math.max(0, Math.ceil(r.y)),
        width: Math.max(
          0,
          Math.min(innerWidth, Math.floor(r.right)) -
            Math.max(0, Math.ceil(r.x)),
        ),
        height: Math.max(
          0,
          Math.min(innerHeight, Math.floor(r.bottom)) -
            Math.max(0, Math.ceil(r.y)),
        ),
      }))
      .filter((r) => r.width && r.height);
    api.bubbleRegions?.(regions);
  };
  const observer = new MutationObserver(shapes);
  observer.observe(document.querySelector("#answers"), {
    subtree: true,
    childList: true,
    attributes: true,
  });
  addEventListener("resize", shapes);
  document.querySelector("#answers").addEventListener("scroll", shapes, true);
  cleanShapes = () => {
    observer.disconnect();
    removeEventListener("resize", shapes);
    document
      .querySelector("#answers")
      .removeEventListener("scroll", shapes, true);
  };
  shapes();
} else {
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") conversation.card.close();
  });
}
window.conversation = conversation;
