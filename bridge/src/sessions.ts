import { randomBytes } from "node:crypto";
import { HISTORY_TTL_MS, WATCH_LIMIT_PER_MINUTE } from "./config.js";
import { SlidingWindowLimiter } from "./limiter.js";
import { PanelError } from "./errors.js";
import type { FrameSample } from "./panel-image.js";

export type AnswerKind = "ask" | "passive" | "summary";
export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
export type AnswerEntry = {
  id: string;
  at: number;
  question: string;
  answer: string;
  kind: AnswerKind;
  usage?: Usage;
};
export type AnswerJob = {
  controller: AbortController;
  kind: AnswerKind;
  finished: Promise<void>;
};
export type PanelSession = {
  id: string;
  expiresAt: number;
  entries: AnswerEntry[];
  key?: string;
  job?: AnswerJob;
  generation: number;
  passiveLimiter: SlidingWindowLimiter;
  captureLimiter: SlidingWindowLimiter;
  lastPassiveFrame?: FrameSample;
};

export class SessionStore {
  private readonly sessions = new Map<string, PanelSession>();
  constructor(
    private readonly now = () => Date.now(),
    private readonly ttlMs = 30 * 60_000,
    private readonly maximum = 8,
    private readonly onExpire: (session: PanelSession) => void = () => {},
  ) {}

  create(): PanelSession {
    this.prune();
    if (this.sessions.size >= this.maximum)
      throw new PanelError(
        "session_limit",
        "Close an older panel before opening another.",
        429,
      );
    const session: PanelSession = {
      id: randomBytes(32).toString("base64url"),
      expiresAt: this.now() + this.ttlMs,
      entries: [],
      generation: 0,
      passiveLimiter: new SlidingWindowLimiter(WATCH_LIMIT_PER_MINUTE, 60_000),
      captureLimiter: new SlidingWindowLimiter(30, 60_000),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): PanelSession | undefined {
    this.prune();
    const session = this.sessions.get(id);
    if (session) this.pruneEntries(session);
    return session;
  }

  pruneEntries(session: PanelSession): void {
    session.entries = session.entries.filter(
      (entry) => entry.at + HISTORY_TTL_MS > this.now(),
    );
  }

  append(session: PanelSession, entry: AnswerEntry): void {
    this.pruneEntries(session);
    session.entries.push(entry);
    if (session.entries.length > 100)
      session.entries.splice(0, session.entries.length - 100);
  }

  reset(session: PanelSession): Promise<void> {
    session.generation++;
    session.entries = [];
    session.key = undefined;
    session.lastPassiveFrame = undefined;
    session.job?.controller.abort();
    return session.job?.finished ?? Promise.resolve();
  }

  prune(): void {
    for (const [id, session] of this.sessions) {
      this.pruneEntries(session);
      if (session.expiresAt > this.now()) continue;
      this.sessions.delete(id);
      void this.reset(session);
      this.onExpire(session);
    }
  }

  async clear(): Promise<void> {
    await Promise.allSettled(
      [...this.sessions.values()].map((session) => this.reset(session)),
    );
  }

  async close(): Promise<void> {
    await this.clear();
    for (const session of this.sessions.values()) this.onExpire(session);
    this.sessions.clear();
  }
}
