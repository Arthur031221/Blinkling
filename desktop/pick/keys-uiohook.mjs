const FORWARDED = ["keydown", "keyup", "mousedown", "wheel"];

/** The global key, wheel and mouse source behind the pick key: uiohook-napi
 * emits native input and this hands it to `createPickKeys` as plain events. It
 * is loaded on demand so a machine where the native module cannot start (no
 * input access, a Wayland session) loses the pick key but not the rest of the app. */
export function createKeySource({ load, handle, onError = () => {} }) {
  let hook = null;
  return {
    /** Starts listening. Resolves {ok:true}, or {ok:false, error} when the native
     * module is missing or refused to start. */
    async start() {
      if (hook) return { ok: true };
      try {
        const { uIOhook } = await load();
        for (const type of FORWARDED)
          uIOhook.on(type, (event) => handle({ type, code: event.keycode }));
        try {
          uIOhook.start();
        } catch (error) {
          // A refused start must not leave listeners behind for the retry.
          for (const type of FORWARDED) uIOhook.removeAllListeners(type);
          throw error;
        }
        hook = uIOhook;
        return { ok: true };
      } catch (error) {
        onError(error);
        return { ok: false, error };
      }
    },
    stop() {
      if (!hook) return;
      for (const type of FORWARDED) hook.removeAllListeners(type);
      hook.stop();
      hook = null;
    },
    started: () => hook !== null,
  };
}

/** Loads the real module. Kept separate so tests inject a fake. */
export async function loadUiohook() {
  const module = await import("uiohook-napi");
  return module.uIOhook ? module : module.default;
}
