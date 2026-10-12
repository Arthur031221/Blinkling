import { randomUUID } from "node:crypto";
import {
  getSessionMessages,
  listSessions,
} from "@anthropic-ai/claude-agent-sdk";
import type { ProviderRequest, ProviderResult } from "./provider-request.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isSessionId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);
export type RecentSession = { id: string; title: string; updatedAt: number };
type SessionExists = (id: string, project: string) => Promise<boolean>;
const sessionExists: SessionExists = async (id, project) =>
  (await getSessionMessages(id, { dir: project, limit: 1 })).length > 0;

export class ExtensionSessions {
  constructor(
    readonly project = process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    private readonly list = listSessions,
    private readonly persisted: SessionExists = sessionExists,
  ) {}

  async recent(): Promise<RecentSession[]> {
    const sessions = await this.list({
      dir: this.project,
      limit: 20,
      includeWorktrees: false,
    });
    return sessions
      .filter((s) => isSessionId(s.sessionId))
      .map((s) => ({
        id: s.sessionId,
        title: (s.customTitle || s.summary || "Untitled session").slice(0, 160),
        updatedAt: s.lastModified,
      }));
  }

  create(): ExtensionThread {
    return new ExtensionThread(this.project, undefined, false, this.persisted);
  }

  async resume(id: unknown): Promise<ExtensionThread> {
    if (!isSessionId(id) || !(await this.recent()).some((s) => s.id === id))
      throw new Error(
        "That session is no longer in this project. Choose a recent session again.",
      );
    return new ExtensionThread(this.project, id, false, this.persisted);
  }
}

export class ExtensionThread {
  id: string;
  started: boolean;
  forkPending: boolean;
  constructor(
    readonly project: string,
    source?: string,
    fork = false,
    private readonly persisted: SessionExists = sessionExists,
  ) {
    this.id = source ?? randomUUID();
    this.started = !!source;
    this.forkPending = fork;
  }

  async reconcile(): Promise<void> {
    if (!this.started && (await this.persisted(this.id, this.project)))
      this.started = true;
  }

  get options(): NonNullable<ProviderRequest["cliSession"]> {
    return {
      id: this.id,
      project: this.project,
      resume: this.started,
      fork: this.forkPending,
    };
  }

  complete(result: ProviderResult): void {
    if (
      this.forkPending &&
      (!isSessionId(result.sessionId) || result.sessionId === this.id)
    )
      throw new Error(
        "The session copy was not confirmed. Choose a new conversation and try again.",
      );
    if (isSessionId(result.sessionId)) {
      if (!this.forkPending && result.sessionId !== this.id)
        throw new Error(
          "The provider returned a different session. Choose the conversation again.",
        );
      this.id = result.sessionId;
    }
    this.started = true;
    this.forkPending = false;
  }
}
