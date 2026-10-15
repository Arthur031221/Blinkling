import { classify } from "./rules.mjs";

/** How often a held lock looks again, so Blink relaxes soon after the field is left. */
export const RECHECK_MS = 2000;

/** `allowed()` answers `{ ok, reason? }` for the focused window. A locator that
 * answers synchronously gets a synchronous answer; a promise gets a promise.
 * An automatic capture that cannot find out what is focused is refused (fail
 * closed); an explicit one by the user goes ahead, since they asked and can see. */
export function createGuard({
  locator,
  onChange = () => {},
  recheckMs = RECHECK_MS,
} = {}) {
  let locked = null,
    timer,
    disposed = false,
    automatic = false;
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const settle = (verdict) => {
    if (disposed) return verdict;
    const reason = verdict.ok ? null : verdict.reason;
    if (reason !== locked) {
      locked = reason;
      onChange(reason ? { lock: true, reason } : { lock: false });
    }
    if (reason && !timer) {
      timer = setInterval(() => void guard.allowed({ automatic }), recheckMs);
      timer.unref?.();
    } else if (!reason) stop();
    return verdict;
  };
  const failed = (options) =>
    options.automatic ? settle({ ok: false, reason: "secure" }) : { ok: true };
  const guard = {
    allowed(options = {}) {
      automatic = !!options.automatic;
      let focus;
      try {
        focus = locator?.focus?.();
      } catch {
        return failed(options);
      }
      if (typeof focus?.then === "function")
        return focus.then(
          (value) => settle(classify(value)),
          () => failed(options),
        );
      return settle(classify(focus));
    },
    get locked() {
      return locked;
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
  return guard;
}
