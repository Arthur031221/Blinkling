import { mountConversation, sessionFromDesktopAPI } from "./conversation.mjs";
import { anchorOf, growOrigin } from "./origin.mjs";
import { pickLocale, translator } from "../shared/i18n.mjs";
import { cssVariables } from "../shared/motion.mjs";
import { strings } from "./strings.mjs";
import { followShellTheme } from "./theme.mjs";
import { mountGuidePanel } from "./guide-panel.mjs";
const api = window.blinkling;
const locale = pickLocale(navigator.languages);
const tr = translator(strings, locale);
document.documentElement.lang = locale;
// The motion tokens reach the stylesheet as custom properties (CSSOM, so the
// page's CSP stays free of inline styles).
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.*)/s).map((part) => part?.trim());
  if (name && value) document.documentElement.style.setProperty(name, value);
}
followShellTheme();
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
let shapeHook;
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
  onShape: () => shapeHook?.(),
  onReference: ({ ref }) => api.bubbleHover?.({ ref }),
});
const unMark = api.onMarkClick?.(({ ref }) =>
  conversation.bubbles?.reveal(ref),
);
const unCapture = api.onCapture?.((capture) => conversation.capture(capture));
const unSurface = api.onSurface?.((event) => {
  if (event.type === "hover") conversation.hover(event.value);
  if (event.type === "pin") conversation.store.pin(event.value);
  if (event.type === "display") conversation.store.leaveDisplay();
  if (event.type === "new-chat") conversation.store.reset();
  if (event.type === "menu") conversation.bubbles?.avoid(event.rect);
  if (event.type === "open") {
    if (event.seed) conversation.seed(event.seed);
    conversation.card?.open(event.messageId);
    placeOrigin();
  }
  if (event.type === "close") conversation.card?.close();
});
window.addEventListener(
  "pagehide",
  () => {
    unCapture?.();
    unMark?.();
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
const guidePanel = mountGuidePanel({
  host: guide,
  tr,
  onAction: (action) => api.action(action).catch(() => {}),
});
const unEvent = api.onEvent((event) => {
  if (event.type !== "guide") return;
  notice.hidden = true;
  guidePanel.update(event);
});
let cleanShapes;
if (configuration.surface === "bubbles") {
  const box = (r) => ({
    x: Math.max(0, Math.ceil(r.x)),
    y: Math.max(0, Math.ceil(r.y)),
    width: Math.max(
      0,
      Math.min(innerWidth, Math.floor(r.right)) - Math.max(0, Math.ceil(r.x)),
    ),
    height: Math.max(
      0,
      Math.min(innerHeight, Math.floor(r.bottom)) - Math.max(0, Math.ceil(r.y)),
    ),
  });
  const shapes = () => {
    // The deck knows which of its bubbles are in view and whether it is
    // scrolling; the notice and the guide are plain elements.
    const regions = [
      ...(conversation.bubbles?.regions() ?? []),
      ...[...document.querySelectorAll(".gl-notice, .gl-guide > button")]
        .filter((n) => n.getClientRects().length)
        .map((n) => box(n.getBoundingClientRect()))
        .filter((r) => r.width && r.height),
    ];
    api.bubbleRegions?.(regions);
  };
  shapeHook = shapes;
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
    // One Escape closes one thing: an open list first, then the card.
    if (event.key === "Escape" && !event.isComposing)
      conversation.card.escape();
  });
}
window.conversation = conversation;
