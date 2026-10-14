import { randomUUID } from "node:crypto";
import { ChangePolicy, fingerprint } from "./policy.mjs";
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
    intervalMs = 6000,
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
    this.unsubscribe = this.session?.subscribe((e) => {
      if (e.type === "done" && e.turnId === this.pending) this.pending = null;
    });
  }
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.generation++;
    this.policy.reset();
    this.timer = setInterval(
      () =>
        this.tick().catch(() =>
          this.onState({ enabled: true, state: "retrying" }),
        ),
      this.intervalMs,
    );
    this.timer.unref?.();
    this.onState({ enabled: true, state: "watching" });
  }
  disable() {
    this.enabled = false;
    this.resumeRequested = false;
    this.generation++;
    clearInterval(this.timer);
    this.onState({ enabled: false, state: "paused" });
  }
  async resume() {
    this.enable();
    this.resumeRequested = true;
    await this.tick();
  }
  async tick() {
    if (!this.enabled || this.running || this.pending || !this.session) return;
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
    try {
      const id = this.displayId();
      // A display change establishes a new baseline instead of comparing unrelated monitors.
      if (this.lastDisplay !== id) {
        this.lastDisplay = id;
        this.policy.reset();
      }
      const sample = await this.sample(id);
      if (!this.enabled || generation !== this.generation) return;
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
      const turn = {
        id: randomUUID(),
        text: "只觀看並解說，不要操作其他程式，不要使用電腦控制、編輯或任何工具。用這個畫面的語言，以兩到三句短句說明：這是什麼，以及最重要的內容。每句獨立一段，不要前言，不要追問。",
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
  dispose() {
    this.disable();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
