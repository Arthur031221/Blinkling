import { createComposer } from "./index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { mountComposer } from "./view.mjs";

/** The chat card: the one surface that shows the conversation. The shell opens
 * it, moves it with Blink and closes it by the interaction machine's rule. */
export function mountConversation({
  session,
  cardHost,
  selection,
  models,
  efforts,
  onPin,
  onClose,
  onTyping,
  onHold,
  copy,
  openLink,
  onReference,
  onAction,
} = {}) {
  const store = createMessageStream();
  const composer = createComposer({ session, selection });
  const card = mountComposer(cardHost, {
    composer,
    store,
    models,
    efforts,
    onPin,
    onClose,
    onTyping,
    onHold,
    onAction,
    onReference,
    copy,
    openLink,
  });
  const unsubscribe = session.subscribe((event) => store.accept(event));
  return {
    store,
    composer,
    card,
    capture: (value) => card.capture(value),
    /** Carry the mini composer's text and chips into the card. */
    seed(value) {
      try {
        composer.seed(value);
      } catch (e) {
        composer.error(e.code ?? "unreadable");
      }
    },
    dispose() {
      unsubscribe();
      card.dispose();
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
