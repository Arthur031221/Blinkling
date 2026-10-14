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
  send(turn: Turn): Promise<void>;
  select(selection: Selection): Promise<Selection>;
  stop(): Promise<void>;
  subscribe(listener: (event: SessionEvent) => void): () => void;
  dispose(): Promise<void>;
}
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
  }): Promise<{ session_url: string; bridge_session_id: string }>;
  send(turn: Turn, sessionId?: string): Promise<void>;
  getSelection(): Promise<Selection>;
  select(selection: Selection): Promise<Selection>;
  stop(): Promise<unknown>;
  dispose(): Promise<void>;
}
