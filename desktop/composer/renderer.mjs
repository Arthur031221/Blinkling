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
import { readerScroll } from "./reading.mjs";
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
    // A folded card has no box and draws nothing; that is not a frame.
    const box = card.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) log("card", box);
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
let tr = translator(strings, documentLocale(document));
document.documentElement.lang = documentLocale(document);
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
  const viewed = shellState?.interaction?.viewing;
  shellState = event.state;
  // The image viewer closed: the answer it was opened from is back in view.
  if (viewed && !event.state.interaction?.viewing) conversation.card.toNewest();
  // A language chosen in settings: the card says its words again, from the
  // same chat and draft, without reloading the page.
  if (event.state.locale !== documentLocale(document)) {
    setDocumentLocale(document, event.state.locale);
    document.documentElement.lang = documentLocale(document);
    tr = translator(strings, documentLocale(document));
    conversation.relocalize();
  }
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
const CAPTURE_ID = "capture-status";
export const conversation = mountConversation({
  session: sessionFromDesktopAPI(api),
  cardHost: document.querySelector("#card"),
  ...configuration,
  onPin: (value) => api.pin?.(value),
  onNudge: (value) => api.nudge?.(value),
  nudgeNow: () => shellState?.nudge,
  onClose: () => api.close?.(),
  onChat: (key) => api.switchChat?.(key),
  onTyping: (value) => api.typing?.(value),
  onHold: (value) => api.hold?.(value),
  onSize: (height) => api.cardSize?.(height),
  openLink: (url) => api.openLink?.(url),
  openImage: (image) => api.viewImage?.(image),
  onQuick: (value) => api.quick?.(value),
  onReference: ({ ref }) => api.referenceHover?.({ ref }),
  onAction: (action) => {
    if (action === "guide-dismiss") conversation.store.dismiss(FAILURE_ID);
    api.action(action).catch(() => {});
  },
});
const unMark = api.onMarkClick?.(({ ref }) => conversation.card.reveal(ref));
const unCapture = api.onCapture?.((capture) => {
  conversation.store.dismiss(CAPTURE_ID);
  conversation.capture(capture);
});
window.addEventListener("resize", () => placeOrigin());
const unSurface = api.onSurface?.((event) => {
  if (event.type === "open") {
    if (event.seed) conversation.seed(event.seed);
    conversation.card.open(event.messageId);
    // The history is always there on opening: a card that holds none asks
    // for it again.
    if (!conversation.store.state().messages.length) api.replay?.();
    placeOrigin();
    watchFrames();
  }
  if (event.type === "close") {
    conversation.card.close(true);
    watchFrames();
  }
});
const unEvent = api.onEvent((event) => {
  if (event.type === "capture-status") {
    // The auto explain states share this channel and are not for the card.
    if (!["working", "error", "idle"].includes(event.state)) return;
    conversation.store.dismiss(CAPTURE_ID);
    // Progress is Blink's bubble, not a message in the card.
    if (event.message && event.state === "error")
      conversation.store.fail({
        id: CAPTURE_ID,
        text: event.message,
        actions: [{ id: "capture", label: tr("guide-retry") }],
      });
    return;
  }
  if (event.type === "quick") {
    conversation.card.quick(event);
    return;
  }
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
// The card also scrolls itself, to the newest line as the history loads and an
// answer streams in. That is not reading and must not hold Blink out.
const reading = readerScroll();
for (const type of ["wheel", "pointerdown", "touchstart", "keydown"])
  addEventListener(type, () => reading.input(), {
    capture: true,
    passive: true,
  });
addEventListener(
  "scroll",
  () => {
    if (reading.isReader()) report("scroll");
  },
  true,
);
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
