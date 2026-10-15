import { classify } from "./rules.mjs";

/** How often a held lock looks again, so Blink relaxes soon after the field is left. */
export const RECHECK_MS = 2000;

/** The points that stand for a rect: its middle and its corners. A window that
 * lies in any of them is part of what a capture of the rect would read. */
const pointsOf = ({ x, y, width = 0, height = 0 }) => [
  { x: x + width / 2, y: y + height / 2 },
  { x, y },
  { x: x + width, y },
  { x, y: y + height },
  { x: x + width, y: y + height },
];
/** The first refusal among the focus and the windows looked at; secure comes first. */
function refusal(looks) {
  const [focus, ...windows] = looks;
  const verdicts = [
    classify(focus),
    ...windows
      .filter(Boolean)
      .map((window) => classify({ secure: false, window })),
  ];
  return verdicts.find((v) => v.ok === false) ?? { ok: true };
}

/** `allowed({point?, rect?, window?, automatic?})` answers `{ ok, reason? }` for
 * the focused window and for the window under a point, a rect or the one given. A locator that
 * answers synchronously gets a synchronous answer; a promise gets a promise.
 * An automatic capture that cannot find out what is focused is refused (fail
 * closed); an explicit one by the user goes ahead, since they asked and can see. */
export function createGuard({
  locator,
  onChange = () => {},
  recheckMs = RECHECK_MS,
} = {}) {
  let guard,
    locked = null,
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
  const windowsAt = ({ point, rect, window }) => [
    ...(window ? [window] : []),
    ...[...(point ? [point] : []), ...(rect ? pointsOf(rect) : [])].map((p) =>
      locator?.windowAt?.(p),
    ),
  ];
  const failed = (options) =>
    options.automatic ? settle({ ok: false, reason: "secure" }) : { ok: true };
  guard = {
    allowed(options = {}) {
      automatic = !!options.automatic;
      let looks;
      try {
        looks = [locator?.focus?.(), ...windowsAt(options)];
      } catch {
        return failed(options);
      }
      if (looks.some((look) => typeof look?.then === "function"))
        return Promise.all(looks).then(
          (values) => settle(refusal(values)),
          () => failed(options),
        );
      return settle(refusal(looks));
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
