import type { LiveChannel } from "./live-channel.js";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { readPanelImage } from "./panel-image.js";
import { runProvider } from "./provider.js";
import type { AnswerProvider, ProviderRequest } from "./provider-request.js";
import type { AnswerEntry } from "./sessions.js";
import type { Capture } from "./history.js";
import { MAX_UPLOAD_MESSAGE_BYTES } from "./config.js";
import {
  ExtensionSessions,
  type ExtensionThread,
} from "./extension-sessions.js";
import { SlidingWindowLimiter } from "./limiter.js";
import { PanelError } from "./errors.js";

type Page = NonNullable<ProviderRequest["page"]> & { hasPassword: boolean };
type Pair = {
  selecting?: boolean;
  live?: boolean;
  origin: string;
  expires: number;
  thread: ExtensionThread;
  history: AnswerEntry[];
  client?: WebSocket;
  job?: { id: string; controller: AbortController; done: Promise<void> };
};
type Options = {
  provider?: AnswerProvider;
  sessions?: ExtensionSessions;
  now?: () => number;
  answerTimeoutMs?: number;
};
const MODELS = [
  { id: "opus", modelId: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "sonnet", modelId: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "haiku", modelId: "claude-haiku-5-5", label: "Haiku 5.5" },
];
const same = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (client: WebSocket, value: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value));
};
function pageData(value: unknown): Page | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid page context.");
  const p = value as Record<string, unknown>;
  if (
    typeof p.url !== "string" ||
    p.url.length > 4000 ||
    typeof p.title !== "string" ||
    p.title.length > 1000 ||
    typeof p.text !== "string" ||
    p.text.length > 32_000 ||
    !Array.isArray(p.elements) ||
    p.elements.length > 160 ||
    typeof p.hasPassword !== "boolean"
  )
    throw new Error(
      "The page exceeds the context limit. Select a smaller section.",
    );
  const url = new URL(p.url);
  if (!["http:", "https:", "chrome-extension:"].includes(url.protocol))
    throw new Error("This page cannot be read.");
  const elements = p.elements.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid page element.");
    const e = value as Record<string, unknown>;
    if (
      typeof e.id !== "string" ||
      e.id.length > 100 ||
      typeof e.role !== "string" ||
      e.role.length > 100 ||
      typeof e.text !== "string" ||
      e.text.length > 500 ||
      !Array.isArray(e.rect) ||
      e.rect.length !== 4 ||
      !e.rect.every(
        (n) =>
          typeof n === "number" &&
          Number.isFinite(n) &&
          Math.abs(n) <= 10_000_000,
      )
    )
      throw new Error("Invalid page element.");
    return { id: e.id, role: e.role, text: e.text, rect: e.rect };
  });
  return {
    url: p.url,
    title: p.title,
    text: p.text,
    elements,
    hasPassword: p.hasPassword,
  };
}

export class ExtensionBridge {
  private readonly sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_UPLOAD_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  private readonly pairs = new Map<string, Pair>();
  private readonly codes = new Map<string, number>();
  private readonly installation = new Map<
    string,
    { expires: number; token?: string }
  >();
  private readonly attempts = new SlidingWindowLimiter(12, 60_000);
  private readonly passive = new SlidingWindowLimiter(6, 60_000);
  private readonly pendingCaptures = new Map<
    string,
    { client: WebSocket; finish: (capture?: Capture) => void }
  >();
  private readonly sessions: ExtensionSessions;
  private readonly provider: AnswerProvider;
  private readonly now: () => number;
  private channel?: LiveChannel;
  attachChannel(channel: LiveChannel): void {
    this.channel = channel;
    channel.onReady = () => {
      for (const pair of this.pairs.values())
        if (pair.client)
          send(pair.client, { type: "channel-status", liveAvailable: true });
    };
    channel.onUnavailable = () => {
      for (const pair of this.pairs.values())
        if (pair.client)
          send(pair.client, { type: "channel-status", liveAvailable: false });
    };
  }
  private sharingIntent = false;
  private sharingClient?: WebSocket;
  private readonly expiry: NodeJS.Timeout;

  constructor(
    server: Server,
    private readonly origin: () => string,
    private readonly options: Options = {},
  ) {
    this.sessions = options.sessions ?? new ExtensionSessions();
    this.provider = options.provider ?? runProvider;
    this.now = options.now ?? Date.now;
    server.on("upgrade", (req, socket, head) => {
      if (req.url !== "/extension") return;
      if (
        req.headers.host !== new URL(this.origin()).host ||
        !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin ?? "") ||
        this.sockets.clients.size >= 8
      ) {
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(req, socket, head, (client) =>
        this.connect(client, req),
      );
    });
    this.expiry = setInterval(() => this.prune(), 10_000);
    this.expiry.unref();
  }

  get mode(): "direct" | "tunnel" {
    return process.env.SSH_CONNECTION ? "tunnel" : "direct";
  }
  get isSharing(): boolean {
    return this.sharingIntent;
  }
  issueCode(): string {
    this.prune();
    if (this.codes.size >= 20)
      this.codes.delete(this.codes.keys().next().value!);
    const code = randomBytes(8).toString("hex").toUpperCase();
    this.codes.set(code, this.now() + 600_000);
    if (this.installation.size >= 20)
      this.installation.delete(this.installation.keys().next().value!);
    this.installation.set(code, { expires: this.now() + 600_000 });
    return code;
  }

  installStatus(code: string): boolean | undefined {
    const status = this.installation.get(code);
    if (!status || status.expires <= this.now()) return undefined;
    return Boolean(
      status.token &&
        this.pairs.get(status.token)?.client?.readyState === WebSocket.OPEN,
    );
  }

  private connect(client: WebSocket, req: IncomingMessage): void {
    this.sockets.clients.add(client);
    let pair: Pair | undefined;
    const timer = setTimeout(
      () => client.close(4001, "Pairing required"),
      5000,
    );
    client.on("error", () => {});
    client.once("close", () => {
      clearTimeout(timer);
      this.sockets.clients.delete(client);
      pair?.job?.controller.abort();
      if (pair?.client === client) pair.client = undefined;
      if (this.sharingClient === client) this.sharingClient = undefined;
      for (const pending of this.pendingCaptures.values())
        if (pending.client === client) pending.finish();
    });
    client.on("message", (raw) => {
      let message: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw.toString());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Invalid message.");
        message = parsed;
      } catch {
        client.close(1007, "Invalid message");
        return;
      }
      if (!pair) {
        if (message.type !== "pair" || !this.attempts.take()) {
          client.close(4001, "Pair again from the install guide");
          return;
        }
        const origin = req.headers.origin!;
        const token = typeof message.token === "string" ? message.token : "";
        const old = [...this.pairs.entries()].find(
          ([key, value]) =>
            same(key, token) &&
            value.origin === origin &&
            value.expires > this.now(),
        );
        let pairToken: string;
        if (old) {
          [pairToken, pair] = old;
        } else {
          const code =
            typeof message.code === "string"
              ? message.code.toUpperCase().replace(/\s/g, "")
              : "";
          const expiry = this.codes.get(code);
          if (!expiry || expiry <= this.now() || this.pairs.size >= 8) {
            send(client, {
              type: "error",
              code: "pairing_expired",
              message: "Run /glimpselet:glimpse for a new pairing code.",
            });
            client.close(4001, "Pair again");
            return;
          }
          this.codes.delete(code);
          pairToken = randomBytes(32).toString("hex");
          pair = {
            origin,
            expires: this.now() + 12 * 60 * 60 * 1000,
            thread: this.sessions.create(),
            history: [],
            live: Boolean(this.channel?.ready),
          };
          this.pairs.set(pairToken, pair);
          const installation = this.installation.get(code);
          if (installation) installation.token = pairToken;
        }
        if (pair.client && pair.client !== client)
          pair.client.close(4002, "Opened in another window");
        pair.client = client;
        clearTimeout(timer);
        send(client, {
          type: "paired",
          token: pairToken,
          mode: this.mode,
          project: this.sessions.project,
          liveAvailable: Boolean(this.channel?.ready),
          live: Boolean(pair.live),
          models: MODELS,
          efforts: ["low", "medium", "high"],
          sessionId: pair.live ? "live" : pair.thread.id,
        });
        return;
      }
      if (pair.expires <= this.now()) {
        client.close(4001, "Pair again");
        return;
      }
      void this.handle(client, pair, message).catch((error: unknown) =>
        send(client, {
          type: "error",
          id: message.id,
          code: error instanceof PanelError ? error.code : "request_failed",
          message:
            error instanceof Error
              ? error.message
              : "The request could not finish. Try again.",
        }),
      );
    });
  }

  private async handle(
    client: WebSocket,
    pair: Pair,
    message: Record<string, unknown>,
  ): Promise<void> {
    if (message.type === "share" && typeof message.active === "boolean") {
      this.sharingIntent = message.active;
      this.sharingClient = message.active ? client : undefined;
      return;
    }
    if (message.type === "capture-result") {
      const pending =
        typeof message.id === "string"
          ? this.pendingCaptures.get(message.id)
          : undefined;
      if (!pending || pending.client !== client) return;
      try {
        const image = readPanelImage(message.image);
        pending.finish({
          ...image,
          at: this.now(),
          source: "browser",
          note: "Explicitly shared screen",
        });
      } catch {
        pending.finish();
      }
      return;
    }
    if (message.type === "cancel") {
      const acknowledged = typeof message.jobId === "string";
      const jobId = acknowledged ? message.jobId : message.id;
      if (
        typeof jobId !== "string" ||
        jobId.length > 100 ||
        typeof message.id !== "string" ||
        message.id.length > 100
      )
        throw new Error("Invalid cancellation request.");
      const job = pair.job;
      if (jobId === job?.id) {
        job.controller.abort();
        if (acknowledged) await job.done;
      }
      if (acknowledged) send(client, { type: "cancelled", id: message.id });
      return;
    }
    if (typeof message.id !== "string" || message.id.length > 100)
      throw new Error("Invalid request.");
    if (message.type === "sessions") {
      send(client, {
        type: "sessions",
        id: message.id,
        sessions: await this.sessions.recent(),
        liveAvailable: Boolean(this.channel?.ready),
      });
      return;
    }
    if (message.type === "session") {
      if (pair.job || pair.selecting)
        throw new Error(
          "Stop the current answer before changing the conversation.",
        );
      pair.selecting = true;
      try {
        if (message.sessionId === "live") {
          if (!this.channel?.ready)
            throw new Error(
              "The live session is not connected. Restart with the channel enabled, then run /glimpse.",
            );
          pair.live = true;
        } else {
          const thread =
            message.sessionId === undefined
              ? this.sessions.create()
              : await this.sessions.resume(message.sessionId);
          pair.thread = thread;
          pair.live = false;
        }
        pair.history = [];
        send(client, {
          type: "session",
          id: message.id,
          sessionId: pair.live ? "live" : pair.thread.id,
          title: pair.live
            ? "Live terminal session"
            : message.sessionId
              ? "Parallel continuation"
              : "Glimpselet conversation",
          live: !!pair.live,
        });
      } finally {
        pair.selecting = false;
      }
      return;
    }
    if (message.type !== "ask") throw new Error("Unknown request.");
    if (pair.job || pair.selecting)
      throw new Error(
        "Stop the current answer or wait for the conversation change first.",
      );
    if (
      typeof message.question !== "string" ||
      !message.question.trim() ||
      message.question.length > 32_000
    )
      throw new Error("Write a shorter question or select a smaller section.");
    if (!["sonnet", "opus", "haiku"].includes(String(message.model)))
      throw new Error("Choose a listed model.");
    if (
      message.effort !== undefined &&
      !["low", "medium", "high"].includes(String(message.effort))
    )
      throw new Error("Choose a listed effort level.");
    if (
      !["ask", "passive", "guide", "translate", "suggest"].includes(
        String(message.kind),
      )
    )
      throw new Error("Choose a supported action.");
    const page = pageData(message.page);
    if (
      message.kind === "passive" &&
      (page?.hasPassword || !this.passive.take())
    )
      throw new Error(
        page?.hasPassword
          ? "Passive mode pauses on pages with password fields."
          : "Passive mode reached its rate limit. It will resume in a minute.",
      );
    const image =
      message.image === undefined
        ? undefined
        : readPanelImage(message.image).image;
    const controller = new AbortController();
    const id = message.id;
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.answerTimeoutMs ?? 120_000,
    );
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const job = { id, controller, done };
    pair.job = job;
    try {
      const conversational = message.kind === "ask" || message.kind === "guide";
      const result = await (
        conversational && pair.live
          ? this.channel!.ask.bind(this.channel)
          : this.provider
      )({
        image,
        page,
        question: message.question,
        model: message.model as ProviderRequest["model"],
        effort: message.effort as ProviderRequest["effort"],
        backend: "cli",
        kind: "ask",
        context: conversational ? [...pair.history] : [],
        ...(conversational ? { cliSession: pair.thread.options } : {}),
        signal: controller.signal,
        onText: (text) => {
          if (!controller.signal.aborted)
            send(client, { type: "delta", id, text });
        },
      });
      if (controller.signal.aborted || pair.client !== client)
        throw new Error("The answer stopped. Partial text was kept.");
      if (conversational) {
        if (!pair.live) pair.thread.complete(result);
        pair.history.push({
          id,
          at: this.now(),
          question: message.question,
          answer: result.answer,
          kind: "ask",
        });
        pair.history = pair.history.slice(-8);
      }
      send(client, {
        type: "done",
        id,
        answer: result.answer,
        usage: result.usage,
        sessionId: pair.live ? "live" : pair.thread.id,
      });
    } finally {
      clearTimeout(timeout);
      if (pair.job === job) pair.job = undefined;
      finish();
    }
  }

  requestCapture(
    timeoutMs = 2500,
    signal?: AbortSignal,
  ): Promise<Capture | undefined> {
    const client = this.sharingClient;
    if (
      !this.sharingIntent ||
      client?.readyState !== WebSocket.OPEN ||
      signal?.aborted
    )
      return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const id = randomUUID();
      const finish = (capture?: Capture) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pendingCaptures.delete(id);
        resolve(capture);
      };
      const abort = () => finish();
      const timer = setTimeout(finish, timeoutMs);
      this.pendingCaptures.set(id, { client, finish });
      signal?.addEventListener("abort", abort, { once: true });
      send(client, { type: "capture", id });
    });
  }
  cancelCaptures(): void {
    for (const pending of this.pendingCaptures.values()) pending.finish();
  }
  private prune(): void {
    for (const [code, expiry] of this.codes)
      if (expiry <= this.now()) this.codes.delete(code);
    for (const [token, pair] of this.pairs)
      if (pair.expires <= this.now()) {
        pair.job?.controller.abort();
        pair.client?.close(4001, "Pair again");
        this.pairs.delete(token);
      }
  }
  async clear(): Promise<void> {
    this.cancelCaptures();
    this.sharingIntent = false;
    this.sharingClient = undefined;
    await Promise.all(
      [...this.pairs.values()].map(async (pair) => {
        pair.job?.controller.abort();
        await pair.job?.done;
        pair.history = [];
        pair.thread = this.sessions.create();
      }),
    );
  }
  async close(): Promise<void> {
    clearInterval(this.expiry);
    await this.clear();
    for (const client of this.sockets.clients) client.terminate();
    this.pairs.clear();
    this.codes.clear();
    this.installation.clear();
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
  }
}
