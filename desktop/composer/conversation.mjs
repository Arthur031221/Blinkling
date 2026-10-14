import { createComposer } from "./index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { mountComposer } from "./view.mjs";
import { mountMessageBubbles } from "../messages/view.mjs";

/** The shell supplies separate focusable card and non-focusable bubble hosts. */
export function mountConversation({
  session,
  cardHost,
  bubbleHost,
  selection,
  models,
  efforts,
  onActivity = () => {},
  onOpenChat,
  onPin,
  onClose,
  onTyping,
  copy,
  openLink,
  quietMs,
} = {}) {
  const store = createMessageStream({ quietMs });
  const composer = createComposer({ session, selection });
  const card =
    cardHost &&
    mountComposer(cardHost, {
      composer,
      store,
      models,
      efforts,
      onPin,
      onClose,
      onTyping,
      copy,
      openLink,
    });
  const bubbles =
    bubbleHost &&
    mountMessageBubbles(bubbleHost, {
      store,
      copy,
      openLink,
      openChat: (id) => (onOpenChat ? onOpenChat(id) : card?.open(id)),
    });
  let lastVisible = false;
  const unActivity = store.subscribe(({ visible, speaking }) => {
    onActivity({ visible, speaking });
    const state = composer.state();
    if (
      lastVisible &&
      !visible &&
      !state.draft &&
      !state.attachments.length &&
      !state.busy
    )
      card?.quiet();
    lastVisible = visible;
  });
  const unsubscribe = session.subscribe((event) => store.accept(event));
  return {
    store,
    composer,
    card,
    bubbles,
    capture: (value) => (card ? card.capture(value) : composer.capture(value)),
    hover: (value) => store.hover(value),
    dispose() {
      unsubscribe();
      unActivity();
      bubbles?.dispose();
      card?.dispose();
      composer.dispose();
      store.dispose();
    },
  };
}
/** Narrow preload adapter; no renderer filesystem, network or child access. */
export function sessionFromDesktopAPI(api) {
  return {
    send: (turn) => api.sendTurn(turn),
    select: (selection) => api.select(selection),
    stop: () => api.stop(),
    subscribe: (listener) => api.onEvent(listener),
  };
}
