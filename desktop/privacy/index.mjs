import { pickLocale } from "../shared/i18n.mjs";
import { LIMIT_FALLBACK_MS } from "../autowatch/index.mjs";
import { createGuard } from "./guard.mjs";
import { lockKey, say } from "./strings.mjs";

/** Turns that carry what is on screen. A typed question with no pixels does not. */
const SCREEN_SOURCES = new Set(["auto-explain", "guide", "companion"]);
const carriesScreen = (turn) =>
  !!turn?.attachments?.length || SCREEN_SOURCES.has(turn?.source);
/** A limit this far away is told with its day, not only the hour. */
const SAME_DAY_MS = 18 * 60 * 60 * 1000;

const stub = { focus: () => ({ secure: false, window: null }) };

/** Privacy and usage notices for the desktop app.
 *  - PV-1: refuses capture and sending while a secure field, password manager or
 *    private window has focus, and tells Blink (`guard`) and the watching face.
 *  - PV-3: one calm bubble for the usage limit, and auto explain waits it out.
 *  - PV-5: one bubble when Claude Code is not installed.
 * Nothing here stores what it sees; it only decides whether to look. */
export function installPrivacy({
  session,
  features,
  locator = stub,
  send,
  languages = [],
  now = Date.now,
}) {
  const locale = pickLocale(languages);
  const t = say(locale);
  let override;
  const source = {
    focus: () => (override === undefined ? locator.focus() : override),
  };
  let missing = false,
    episode = 0,
    toldLock = false,
    limitUntil = null;
  const said = (id, text) => send({ type: "blink-say", id, text });
  const guard = createGuard({
    locator: source,
    onChange: ({ lock }) => {
      if (lock) episode++;
      toldLock = false;
      send({ type: "guard", lock });
    },
  });
  const tellLock = (reason) => {
    if (toldLock) return;
    toldLock = true;
    said(`privacy-lock-${episode}`, t(lockKey[reason] ?? lockKey.secure));
  };
  const refused = (verdict) => {
    tellLock(verdict.reason);
    return verdict;
  };

  // Capture itself is refused, so nothing is read from a locked window at all.
  const capture = features?.capture;
  const originals = {};
  for (const name of ["screen", "region"]) {
    if (typeof capture?.[name] !== "function") continue;
    originals[name] = { own: Object.hasOwn(capture, name), fn: capture[name] };
    capture[name] = async (id, signal, options) => {
      const verdict = await guard.allowed({
        automatic: options?.kind === "auto-explain",
      });
      if (verdict.ok === false) {
        refused(verdict);
        return null;
      }
      return originals[name].fn.call(capture, id, signal, options);
    };
  }
  if (capture)
    capture.privacy = {
      allowed: (options) => guard.allowed(options),
      // Auto explain reports its state; Blink shows the watching face while it is on.
      report: (state) => {
        const on = !!state.enabled && state.state !== "paused";
        if (on !== watching) send({ type: "watching", on: (watching = on) });
      },
    };
  let watching = false;

  const unhook = session?.beforeSend?.(async (turn) => {
    if (!carriesScreen(turn)) return { ok: true };
    const verdict = await guard.allowed({
      automatic: turn.source === "auto-explain",
    });
    return verdict.ok === false ? refused(verdict) : { ok: true };
  });

  const clock = (resetAt) => {
    const sameDay = resetAt - now() < SAME_DAY_MS;
    return new Intl.DateTimeFormat(locale, {
      ...(sameDay ? {} : { weekday: "short" }),
      hour: "numeric",
      minute: "2-digit",
    }).format(resetAt);
  };
  const unsubscribe = session?.subscribe?.((event) => {
    if (event.type === "usage-limit") {
      const resetAt = Number.isFinite(event.resetAt) ? event.resetAt : null;
      const active = limitUntil !== null && now() < limitUntil;
      if (active && (resetAt === null || resetAt === limitUntil)) return;
      limitUntil = resetAt ?? now() + LIMIT_FALLBACK_MS;
      said(
        `usage-limit-${limitUntil}`,
        resetAt === null
          ? t("usageLimitUnknown")
          : t("usageLimit", { time: clock(resetAt) }),
      );
      features?.auto?.pause?.(resetAt);
    } else if (event.type === "claude-missing") {
      if (!missing) said("claude-missing", t("claudeMissing"));
      missing = true;
    } else if (event.type === "status" && event.state === "connected") {
      missing = false;
    }
  });

  const hooks = globalThis.blinklingTest
    ? (globalThis.blinklingTest.privacy = {
        guard,
        focus: (value) => (override = value === null ? undefined : value),
      })
    : null;

  return {
    guard,
    dispose() {
      unhook?.();
      unsubscribe?.();
      guard.dispose();
      for (const [name, { own, fn }] of Object.entries(originals))
        if (own) capture[name] = fn;
        else delete capture[name];
      if (capture) delete capture.privacy;
      if (hooks && globalThis.blinklingTest?.privacy === hooks)
        delete globalThis.blinklingTest.privacy;
    },
  };
}
