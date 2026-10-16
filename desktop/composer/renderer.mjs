import { mountConversation, sessionFromDesktopAPI } from "./conversation.mjs";
import { anchorOf, growOrigin, mouthOfState, tailOf } from "./origin.mjs";
import {
  setDocumentLocale,
  documentLocale,
  translator,
} from "../shared/i18n.mjs";
import { cssVariables, duration, frameLog } from "../shared/motion.mjs";
import { strings } from "./strings.mjs";
import { followShellTheme } from "./theme.mjs";
const api = window.blinkling;
const log = frameLog();
/** Frames of the grow and fold transition, for the end-to-end frame gate. */
function watchFrames() {
  const card = document.querySelector(".gl-chat-card");
  if (!card) return;
  let running = true;
  const stop = () => (running = false);
  card.addEventListener("transitionend", stop, { once: true });
  // A safety stop in case the transition never ends (reduced motion).
  setTimeout(stop, duration.slow * 2);
  const frame = () => {
    log("card", card.getBoundingClientRect());
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
// The motion tokens reach the stylesheet as custom properties (CSSOM, so the
// page's CSP stays free of inline styles).
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.*)/s).map((part) => part?.trim());
  if (name && value) document.documentElement.style.setProperty(name, value);
}
followShellTheme();
const configuration = await api.configuration();
// Main sends the one system locale; the page follows it and says so in `lang`.
setDocumentLocale(document, configuration.locale);
const locale = documentLocale(document);
const tr = translator(strings, locale);
document.documentElement.lang = locale;
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
  // The tail points the card at Blink's mouth.
  const tail = shellState.mouth
    ? tailOf(
        { x, y, width: card.offsetWidth, height: card.offsetHeight },
        mouthOfState(shellState),
      )
    : null;
  if (tail) {
    card.dataset.tail = tail.side;
    card.style.setProperty("--gl-tail-at", `${tail.at}px`);
  } else delete card.dataset.tail;
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
const FAILURE_ID = "guide-failure";
export const conversation = mountConversation({
  session: sessionFromDesktopAPI(api),
  cardHost: document.querySelector("#card"),
  ...configuration,
  onPin: (value) => api.pin?.(value),
  onNudge: (value) => api.nudge?.(value),
  nudgeNow: () => shellState?.nudge,
  onClose: () => api.close?.(),
  onTyping: (value) => api.typing?.(value),
  onHold: (value) => api.hold?.(value),
  openLink: (url) => api.openLink?.(url),
  onReference: ({ ref }) => api.referenceHover?.({ ref }),
  onAction: (action) => {
    if (action === "guide-dismiss") conversation.store.dismiss(FAILURE_ID);
    api.action(action).catch(() => {});
  },
});
const unMark = api.onMarkClick?.(({ ref }) => conversation.card.reveal(ref));
const unCapture = api.onCapture?.((capture) => conversation.capture(capture));
const unSurface = api.onSurface?.((event) => {
  if (event.type === "new-chat") conversation.store.reset();
  if (event.type === "open") {
    if (event.seed) conversation.seed(event.seed);
    conversation.card.open(event.messageId);
    placeOrigin();
    watchFrames();
  }
  if (event.type === "close") {
    conversation.card.close();
    watchFrames();
  }
});
const unEvent = api.onEvent((event) => {
  if (event.type !== "guide") return;
  conversation.store.dismiss(FAILURE_ID);
  // A failed guide is one more message in the card, with its own actions.
  if (event.phase === "error") {
    conversation.card.guide({ phase: "dismissed" });
    conversation.store.fail({
      id: FAILURE_ID,
      text: event.bubbles?.[0] ?? event.message ?? "",
      actions: [
        { id: "guide-retry", label: tr("guide-retry") },
        { id: "guide-dismiss", label: tr("guide-close") },
      ],
    });
    return;
  }
  conversation.card.guide(event);
});
window.addEventListener(
  "pagehide",
  () => {
    unCapture?.();
    unMark?.();
    unSurface?.();
    unShell?.();
    unEvent?.();
    conversation.dispose();
  },
  { once: true },
);
// Reading keeps the card: scroll, selection and an IME composition tell the
// machine in main. Scroll and selection report at most every 250 ms.
const reportedAt = { scroll: -Infinity, select: -Infinity };
const report = (kind) => {
  const now = performance.now();
  if (now - reportedAt[kind] < 250) return;
  reportedAt[kind] = now;
  api.engage?.({ kind });
};
addEventListener("scroll", () => report("scroll"), true);
addEventListener("wheel", () => report("scroll"), { passive: true });
document.addEventListener("selectionchange", () => {
  if (!document.getSelection()?.isCollapsed) report("select");
});
addEventListener("compositionstart", () =>
  api.engage?.({ kind: "ime", value: true }),
);
addEventListener("compositionend", () =>
  api.engage?.({ kind: "ime", value: false }),
);
addEventListener("keydown", (event) => {
  // One Escape closes one thing: an open list first, then the card.
  if (event.key === "Escape" && !event.isComposing) conversation.card.escape();
});
window.conversation = conversation;
