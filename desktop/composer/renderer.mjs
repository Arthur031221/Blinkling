import { mountConversation, sessionFromDesktopAPI } from "./conversation.mjs";
const api = window.glimpselet;
const configuration = await api.configuration();
document.body.dataset.surface = configuration.surface ?? "card";
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
  openLink: (url) => api.openLink?.(url),
});
const unCapture = api.onCapture?.((capture) => conversation.capture(capture));
const unSurface = api.onSurface?.((event) => {
  if (event.type === "hover") conversation.hover(event.value);
  if (event.type === "open") conversation.card?.open(event.messageId);
  if (event.type === "close") conversation.card?.close();
});
window.addEventListener(
  "pagehide",
  () => {
    unCapture?.();
    unSurface?.();
    conversation.dispose();
  },
  { once: true },
);
