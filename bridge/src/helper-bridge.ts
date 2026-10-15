import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { MAX_UPLOAD_MESSAGE_BYTES } from "./config.js";
import type { HelperTrust } from "./helper-trust.js";
import { readPanelImage } from "./panel-image.js";
import { runCliProvider } from "./provider-cli.js";
import type { AnswerProvider } from "./provider-request.js";

export type HelperPage = {
  url: string;
  title: string;
  tabId: number;
  incognito: boolean;
};
export type HelperElement = {
  id: string;
  kind: string;
  /** The HTML tag, lowercase, or "" when the helper did not say. */
  tag: string;
  rect: { x: number; y: number; width: number; height: number };
  role: string;
  name: string;
  text: string;
  parentId: string | null;
  secure: boolean;
  content?: {
    markdown?: string;
    code?: string;
    language?: string;
    latex?: string;
    mathml?: string;
  };
};
export type ElementsResult = {
  page: HelperPage;
  frame: {
    screenX: number;
    screenY: number;
    devicePixelRatio: number;
    zoom: number;
  };
  elements: HelperElement[];
};
/** A full page, top to bottom, as readable pieces. */
export type FullPageCapture = {
  tiles: { image: Buffer; width: number; height: number }[];
  truncated: boolean;
  page?: { url: string; title: string };
};
type Options = {
  provider?: AnswerProvider;
  /** Wakes Blink. The popup's button lands here. */
  wake?: () => Promise<boolean>;
  /** Whether Blink is running, for the popup's status lines. */
  blinkRunning?: () => Promise<boolean>;
  now?: () => number;
};
type Pending = {
  client: WebSocket;
  kind: string;
  reply: (value: Record<string, unknown> | undefined) => void;
  progress?: (completed: number, total: number) => void;
};

const MAX_ELEMENTS = 400;
const CACHE_MS = 1500;
const MODELS = ["sonnet", "opus", "haiku"] as const;

const send = (client: WebSocket, value: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value));
};
const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";
const finite = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e7
    ? value
    : fallback;

/** Shapes what a helper reports. Secure fields never carry text, whatever the helper sent. */
export function readElements(value: unknown): ElementsResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const page = raw.page as Record<string, unknown> | undefined;
  const frame = raw.frame as Record<string, unknown> | undefined;
  if (!page || !frame || !Array.isArray(raw.elements)) return null;
  const elements: HelperElement[] = [];
  for (const item of raw.elements.slice(0, MAX_ELEMENTS)) {
    const e = item as Record<string, unknown> | null;
    const rect = e?.rect as Record<string, unknown> | undefined;
    if (!e || typeof e.id !== "string" || !rect) continue;
    const secure = e.secure === true;
    const element: HelperElement = {
      id: text(e.id, 100),
      kind: text(e.kind, 40),
      tag: text(e.tag, 20),
      rect: {
        x: finite(rect.x),
        y: finite(rect.y),
        width: finite(rect.width),
        height: finite(rect.height),
      },
      role: text(e.role, 60),
      name: secure ? "" : text(e.name, 300),
      text: secure ? "" : text(e.text, 2000),
      parentId: typeof e.parentId === "string" ? text(e.parentId, 100) : null,
      secure,
    };
    const content = e.content as Record<string, unknown> | undefined;
    if (!secure && content && typeof content === "object") {
      const kept: NonNullable<HelperElement["content"]> = {};
      for (const key of ["markdown", "code", "latex", "mathml"] as const)
        if (typeof content[key] === "string")
          kept[key] = text(content[key], 8000);
      if (typeof content.language === "string")
        kept.language = text(content.language, 40);
      if (Object.keys(kept).length) element.content = kept;
    }
    elements.push(element);
  }
  return {
    page: {
      url: text(page.url, 4000),
      title: text(page.title, 1000),
      tabId: finite(page.tabId, -1),
      incognito: page.incognito === true,
    },
    frame: {
      screenX: finite(frame.screenX),
      screenY: finite(frame.screenY),
      devicePixelRatio: finite(frame.devicePixelRatio, 1) || 1,
      zoom: finite(frame.zoom, 1) || 1,
    },
    elements,
  };
}

/**
 * The companion extension's socket. A helper proves it holds the shared secret
 * with a mutual HMAC challenge before anything else is accepted, then answers
 * the host's requests for page structure, a full-length capture, in-place
 * translation and the PDF reader, and may ask for Blink to wake.
 */
export class HelperBridge {
  private readonly sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_UPLOAD_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  private readonly trusted = new Set<WebSocket>();
  private readonly pending = new Map<string, Pending>();
  private readonly provider: AnswerProvider;
  private readonly now: () => number;
  private cache?: { key: string; at: number; value: ElementsResult | null };

  constructor(
    server: Server,
    private readonly origin: () => string,
    private readonly trust: HelperTrust,
    private readonly options: Options = {},
  ) {
    this.provider = options.provider ?? runCliProvider;
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
        this.connect(client),
      );
    });
  }

  get connected(): boolean {
    return [...this.trusted].some((c) => c.readyState === WebSocket.OPEN);
  }

  private connect(client: WebSocket): void {
    const challenge = randomBytes(16).toString("hex");
    const timer = setTimeout(() => client.close(4001, "Not trusted"), 5000);
    client.on("error", () => {});
    client.once("close", () => {
      clearTimeout(timer);
      this.trusted.delete(client);
      this.cache = undefined;
      for (const [id, pending] of this.pending)
        if (pending.client === client) {
          this.pending.delete(id);
          pending.reply(undefined);
        }
    });
    client.on("message", (raw) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(raw));
      } catch {
        client.close(4000, "Invalid message");
        return;
      }
      if (!this.trusted.has(client)) {
        if (
          message.type === "hello" &&
          typeof message.nonce === "string" &&
          /^[0-9a-f]{32}$/.test(message.nonce) &&
          this.trust.verify(
            message.proof,
            this.trust.proof("client", challenge, message.nonce),
          )
        ) {
          clearTimeout(timer);
          this.trusted.add(client);
          send(client, {
            type: "ready",
            proof: this.trust.proof("server", message.nonce, challenge),
          });
        } else client.close(4003, "Not trusted");
        return;
      }
      void this.handle(client, message).catch((error: unknown) => {
        if (typeof message.id === "string")
          send(client, {
            type: `${String(message.type)}-result`,
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : "failed",
          });
      });
    });
    send(client, { type: "challenge", nonce: challenge });
  }

  private async handle(
    client: WebSocket,
    message: Record<string, unknown>,
  ): Promise<void> {
    const type = String(message.type);
    if (type === "ping") {
      send(client, { type: "pong" });
      return;
    }
    if (type === "page-changed") {
      this.cache = undefined;
      return;
    }
    if (type === "status") {
      send(client, {
        type: "status",
        blink: (await this.options.blinkRunning?.()) ?? false,
      });
      return;
    }
    if (typeof message.id !== "string" || message.id.length > 100)
      throw new Error("Invalid request.");
    if (type === "wake") {
      const ok = (await this.options.wake?.()) ?? false;
      send(client, { type: "wake-result", id: message.id, ok });
      return;
    }
    if (type === "translate-batch") {
      if (
        typeof message.prompt !== "string" ||
        !message.prompt.trim() ||
        message.prompt.length > 64_000
      )
        throw new Error("Invalid translation request.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      client.once("close", () => controller.abort());
      try {
        const result = await this.provider({
          question: message.prompt,
          model: MODELS.includes(message.model as (typeof MODELS)[number])
            ? (message.model as (typeof MODELS)[number])
            : "haiku",
          signal: controller.signal,
          onText: () => {},
        });
        send(client, {
          type: "translate-batch-result",
          id: message.id,
          ok: true,
          answer: result.answer,
        });
      } finally {
        clearTimeout(timeout);
      }
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending || pending.client !== client) return;
    if (type === "full-page-progress") {
      if (
        Number.isSafeInteger(message.completed) &&
        Number.isSafeInteger(message.total) &&
        (message.total as number) > 0 &&
        (message.total as number) <= 10_000 &&
        (message.completed as number) >= 0 &&
        (message.completed as number) <= (message.total as number)
      )
        pending.progress?.(
          message.completed as number,
          message.total as number,
        );
      return;
    }
    if (type.endsWith("-result")) {
      this.pending.delete(message.id);
      pending.reply(message);
    }
  }

  /** Sends a request to the first open helper and waits for its reply. */
  private request(
    body: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
    progress?: Pending["progress"],
  ): Promise<Record<string, unknown> | undefined> {
    const client = [...this.trusted].find(
      (c) => c.readyState === WebSocket.OPEN,
    );
    if (!client || signal?.aborted) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const id = randomUUID();
      const finish = (value?: Record<string, unknown>) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
        resolve(value);
      };
      const abort = () => {
        send(client, { type: `${String(body.type)}-cancel`, id });
        finish();
      };
      const timer = setTimeout(abort, timeoutMs);
      this.pending.set(id, {
        client,
        kind: String(body.type),
        reply: finish,
        progress,
      });
      signal?.addEventListener("abort", abort, { once: true });
      send(client, { ...body, id });
    });
  }

  /** The helper's graceful wait for a browser that is still reconnecting. */
  private async ready(graceMs: number, signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + graceMs;
    while (!this.connected) {
      if (signal?.aborted || Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return true;
  }

  /** Page structure under a screen point, or null when there is no helper or no
   * page. `fresh` skips the short cache, for the read a click depends on. */
  async elements(
    point?: { x: number; y: number },
    signal?: AbortSignal,
    options: { fresh?: boolean } = {},
  ): Promise<ElementsResult | null> {
    const key = point
      ? `${Math.round(point.x / 16)},${Math.round(point.y / 16)}`
      : "";
    if (
      !options.fresh &&
      this.cache?.key === key &&
      this.now() - this.cache.at < CACHE_MS
    )
      return this.cache.value;
    const reply = await this.request({ type: "elements", point }, 4000, signal);
    const value =
      reply?.ok === false ? null : readElements(reply?.result ?? null);
    if (reply) this.cache = { key, at: this.now(), value };
    return value;
  }

  async translatePage(on: boolean, signal?: AbortSignal): Promise<boolean> {
    const reply = await this.request(
      { type: "translate-page", on },
      30 * 60_000,
      signal,
    );
    return reply?.ok === true;
  }

  async openPdfReader(signal?: AbortSignal): Promise<boolean> {
    const reply = await this.request({ type: "open-pdf-reader" }, 8000, signal);
    return reply?.ok === true;
  }

  async requestFullPage(
    timeoutMs = 90_000,
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
    reconnectGraceMs = 3000,
  ): Promise<FullPageCapture | undefined> {
    if (!(await this.ready(reconnectGraceMs, signal))) return undefined;
    const reply = await this.request(
      { type: "full-page" },
      timeoutMs,
      signal,
      onProgress,
    );
    if (!reply || reply.ok === false) return undefined;
    try {
      const images: unknown[] = Array.isArray(reply.images)
        ? reply.images
        : [reply.image];
      if (!images.length || images.length > 8) return undefined;
      const page = reply.page as Record<string, unknown> | undefined;
      return {
        tiles: images.map((value) => {
          const image = readPanelImage(value, 4096);
          return {
            image: image.image,
            width: image.width,
            height: image.height,
          };
        }),
        truncated: reply.truncated === true,
        page: page
          ? { url: text(page.url, 4000), title: text(page.title, 1000) }
          : undefined,
      };
    } catch {
      return undefined;
    }
  }

  cancelPending(): void {
    for (const [id, pending] of this.pending) {
      send(pending.client, { type: `${pending.kind}-cancel`, id });
      pending.reply(undefined);
    }
  }

  async close(): Promise<void> {
    this.cancelPending();
    for (const client of this.sockets.clients) client.terminate();
    this.trusted.clear();
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
  }
}
