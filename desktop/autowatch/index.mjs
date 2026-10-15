import { randomUUID } from "node:crypto";
import { ChangePolicy, fingerprint, MIN_INTERVAL_MS } from "./policy.mjs";
/** A usage limit that did not say when it ends holds auto explain this long. */
export const LIMIT_FALLBACK_MS = 30 * 60 * 1000;
/** All producers share SessionBridge. Sampling itself never starts Claude.
 * Global idle time conservatively pauses on keyboard AND mouse activity, avoiding
 * an extra Accessibility permission or collecting the user's keystrokes. */
export class AutoWatch {
  constructor({
    session,
    capture,
    displayId,
    sample,
    idleSeconds,
    typing = () => false,
    busy = () => false,
    intervalMs = MIN_INTERVAL_MS,
    now = Date.now,
    onState = () => {},
    policy = new ChangePolicy(),
  }) {
    if (intervalMs < 3000)
      throw Error("Auto explain sampling must be low rate");
    Object.assign(this, {
      session,
      capture,
      displayId,
      sample,
      idleSeconds,
      typing,
      busy,
      intervalMs,
      now,
      onState,
      policy,
    });
    this.enabled = false;
    this.running = false;
    this.pending = null;
    this.generation = 0;
    this.holdUntil = null;
    this.shown = null;
    this.unsubscribe = this.session?.subscribe((e) => {
      if (e.type === "done" && e.turnId === this.pending) this.pending = null;
      if (e.type === "usage-limit") this.pause(e.resetAt);
    });
  }
  /** One report per change, to the shell status and to the privacy layer. */
  report(state) {
    const key = JSON.stringify(state);
    if (key === this.shown) return;
    this.shown = key;
    this.onState(state);
    this.capture?.privacy?.report?.(state);
  }
  /** Hold until `until` (epoch ms); the tick lifts the hold by itself. */
  pause(until) {
    if (!this.enabled) return;
    // A limit that names no time is not stretched by the same limit repeating.
    if (until == null) {
      if (this.holdUntil !== null) return;
      until = this.now() + LIMIT_FALLBACK_MS;
    }
    this.holdUntil = until;
    this.policy.pause();
    this.report({ enabled: true, state: "paused", until });
  }
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.generation++;
    this.holdUntil = null;
    this.policy.reset();
    this.timer = setInterval(
      () =>
        this.tick().catch(() =>
          this.report({ enabled: true, state: "retrying" }),
        ),
      this.intervalMs,
    );
    this.timer.unref?.();
    this.report({ enabled: true, state: "watching" });
  }
  disable() {
    this.enabled = false;
    this.resumeRequested = false;
    this.holdUntil = null;
    this.generation++;
    clearInterval(this.timer);
    this.report({ enabled: false, state: "paused" });
  }
  async resume() {
    this.enable();
    this.resumeRequested = true;
    await this.tick();
  }
  async tick() {
    if (!this.enabled || this.running || this.pending || !this.session) return;
    if (this.holdUntil !== null) {
      if (this.now() < this.holdUntil) return;
      this.holdUntil = null;
      this.report({ enabled: true, state: "watching" });
    }
    if (
      this.busy() ||
      this.capture.busy ||
      this.typing() ||
      this.idleSeconds() < 3
    ) {
      this.policy.pause();
      return;
    }
    this.running = true;
    const generation = this.generation;
    let ok;
    try {
      // PV-1: asked before any pixel is read, so a secure field is never sampled.
      ok = this.permitted();
      if (typeof ok !== "boolean") ok = await ok;
      if (!ok) {
        this.policy.pause();
        return;
      }
      const id = this.displayId();
      // A display change establishes a new baseline instead of comparing unrelated monitors.
      if (this.lastDisplay !== id) {
        this.lastDisplay = id;
        this.policy.reset();
      }
      const sample = await this.sample(id);
      if (!this.enabled || generation !== this.generation) return;
      ok = this.permitted();
      if (typeof ok !== "boolean") ok = await ok;
      if (!ok) return;
      if (
        !this.resumeRequested &&
        !this.policy.observe(fingerprint(sample), {
          now: this.now(),
          idleSeconds: this.idleSeconds(),
          typing: this.typing(),
          busy: this.busy(),
        })
      )
        return;
      ok = this.permitted();
      if (typeof ok !== "boolean") ok = await ok;
      if (!ok) return;
      const capture = await this.capture.screen(id, undefined, {
        attach: false,
        kind: "auto-explain",
      });
      if (
        !capture ||
        !this.enabled ||
        generation !== this.generation ||
        this.typing() ||
        this.idleSeconds() < 3 ||
        this.busy()
      )
        return;
      ok = this.permitted();
      if (typeof ok !== "boolean") ok = await ok;
      if (!ok) return;
      const turn = {
        id: randomUUID(),
        text: "只觀看並解說，不要操作其他程式，不要使用電腦控制、編輯或任何工具。用這個畫面的語言，最多兩句短句說明：這是什麼，以及最重要的內容。每句獨立一段，不要前言，不要追問。",
        attachments: [capture.image],
        source: "auto-explain",
      };
      this.pending = turn.id;
      try {
        await this.session.send(turn);
        this.resumeRequested = false;
        this.policy.sent(this.now());
      } catch (error) {
        this.pending = null;
        throw error;
      }
    } finally {
      this.running = false;
    }
  }
  /** Locked while a secure field, password manager or private window has focus. */
  /** Boolean for a synchronous guard, a promise for an asynchronous one. The tick
   * awaits only the promise: a synchronous answer must not give up the turn
   * before the sample is requested. */
  permitted() {
    const answer = this.capture?.privacy?.allowed?.({ automatic: true });
    return typeof answer?.then === "function"
      ? answer.then((verdict) => this.verdict(verdict))
      : this.verdict(answer);
  }
  verdict(verdict) {
    if (!verdict || verdict.ok !== false) {
      if (this.shown?.includes('"locked"'))
        this.report({ enabled: true, state: "watching" });
      return true;
    }
    this.report({ enabled: true, state: "locked", reason: verdict.reason });
    return false;
  }
  dispose() {
    this.disable();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
