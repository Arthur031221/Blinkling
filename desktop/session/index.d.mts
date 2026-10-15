import type {
  SessionBridge as BridgeContract,
  Selection,
  SessionEvent,
  Turn,
} from "../shared/contracts.js";
import type { EventEmitter } from "node:events";
export type SessionOptions = {
  /** Pass Electron app.getPath('userData'); session data must never live in the repo. */
  userDataDir: string;
  cwd: string;
  executable?: string;
  selection?: Selection;
  transportFactory?: () => OwnedSession;
  readTranscript?: (cwd: string, localId: string) => Promise<unknown[]>;
  retry?: { minMs?: number; maxMs?: number };
};
export class DesktopSessionBridge implements BridgeContract {
  constructor(options: SessionOptions);
  connect(originSessionId?: string): Promise<void>;
  /** Rejects with `code: "SEND_BLOCKED"` when a `beforeSend` hook vetoes the turn. */
  send(turn: Turn): Promise<void>;
  /** Runs before a turn is queued or persisted. Return `false` or `{ ok: false, reason }`
   * to veto it; a hook that throws vetoes too. Returns an unsubscribe function. */
  beforeSend(
    hook: (
      turn: Turn,
    ) =>
      | boolean
      | { ok: boolean; reason?: string }
      | Promise<boolean | { ok: boolean; reason?: string }>,
  ): () => void;
  select(selection: Selection): Promise<Selection>;
  stop(): Promise<void>;
  /** Besides the shared contract events: `{ type: "usage-limit", resetAt }` (epoch ms,
   * null when unknown), once per limit episode, and `{ type: "claude-missing" }`. */
  subscribe(
    listener: (
      event: SessionEvent | UsageLimitEvent | ClaudeMissingEvent,
    ) => void,
    options?: { visible?: boolean },
  ): () => void;
  dispose(): Promise<void>;
}
export type UsageLimitEvent = { type: "usage-limit"; resetAt: number | null };
export type ClaudeMissingEvent = { type: "claude-missing" };
export { DesktopSessionBridge as SessionBridge };
export class OwnedSession extends EventEmitter {
  constructor(options?: {
    controlTimeoutMs?: number;
    connectTimeoutMs?: number;
    executableArgs?: string[];
  });
  connect(options: {
    cwd: string;
    executable?: string;
    localId?: string;
    sessionId?: string;
    remoteId?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
  }): Promise<{ session_url: string; bridge_session_id: string }>;
  send(turn: Turn, sessionId?: string): Promise<void>;
  getSelection(): Promise<Selection>;
  select(selection: Selection): Promise<Selection>;
  stop(): Promise<unknown>;
  dispose(): Promise<void>;
}
