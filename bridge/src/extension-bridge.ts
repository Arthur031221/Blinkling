import {
  desktopStatePresent,
  desktopTranslate,
  wakeDesktop,
} from "./desktop-link.js";
import { launchDesktop } from "../../plugin/desktop/launcher.mjs";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { readCompanionImage } from "./companion-image.js";
import { MAX_UPLOAD_MESSAGE_BYTES } from "./config.js";
import { SlidingWindowLimiter } from "./limiter.js";

export const ELEMENT_KINDS = [
  "paragraph",
  "heading",
  "image",
  "figure",
  "table",
  "code",
  "formula",
  "video",
  "canvas",
  "link",
  "button",
  "input",
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export type PageElement = {
  id: string;
  kind: ElementKind;
  /** Viewport CSS pixels. */
  rect: { x: number; y: number; width: number; height: number };
  role: string;
  name: string;
  text: string;
  parentId?: string;
  /** Password and other secret fields: reported, never read. */
  secure: boolean;
  content?: {
    markdown?: string;
    code?: string;
    language?: string;
    latex?: string;
    mathml?: string;
  };
};
export type PageElements = {
  page: { url: string; title: string; tabId: number; incognito: boolean };
  /** Where the viewport sits on the screen (DIP), its pixel ratio and zoom. */
  frame: {
    screenX: number;
    screenY: number;
    devicePixelRatio: number;
    zoom: number;
  };
  elements: PageElement[];
};
/** A full page, top to bottom, as readable pieces. */
export type FullPageCapture = {
  tiles: { image: Buffer; width: number; height: number }[];
  truncated: boolean;
  page?: { url: string; title: string };
};
type Request =
  | { op: "full-page" }
  | { op: "elements"; point?: { x: number; y: number } }
  | { op: "translate"; on: boolean }
  | { op: "pdf-reader" };
type Pending = {
  client: WebSocket;
  op: string;
  progress?: (completed: number, total: number) => void;
  finish: (value?: Record<string, unknown>) => void;
};
type Pair = { origin: string; expires: number; client?: WebSocket };
type Options = {
  now?: () => number;
  /** Brings Blink forward; the default starts it when it is not running. */
  wake?: () => Promise<boolean>;
  /** Translates strings for a page; the default asks the running Blink. */
  translate?: (
    texts: string[],
    target: string,
    signal: AbortSignal,
  ) => Promise<string[]>;
};

const same = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (client: WebSocket, value: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value));
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid message.");
  return value as Record<string, unknown>;
};
const text = (value: unknown, limit: number, what: string): string => {
  if (typeof value !== "string" || value.length > limit)
    throw new Error(`Invalid ${what}.`);
  return value;
};
const number = (value: unknown, what: string, limit = 10_000_000): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > limit
  )
    throw new Error(`Invalid ${what}.`);
  return value;
};

/** Validates what the browser reports about the page under a point. */
export function pageElements(value: unknown): PageElements | null {
  if (value === null || value === undefined) return null;
  const v = record(value);
  const page = record(v.page),
    frame = record(v.frame);
  const url = text(page.url, 4000, "page url");
  if (
    !["http:", "https:", "file:", "chrome-extension:"].includes(
      new URL(url).protocol,
    )
  )
    throw new Error("This page cannot be read.");
  if (
    !Array.isArray(v.elements) ||
    v.elements.length > 600 ||
    !Number.isSafeInteger(page.tabId) ||
    typeof page.incognito !== "boolean"
  )
    throw new Error("Invalid page.");
  const ids = new Set<string>();
  const elements = v.elements.map((item): PageElement => {
    const e = record(item),
      rect = record(e.rect);
    const id = text(e.id, 64, "element id");
    if (ids.has(id)) throw new Error("Invalid element id.");
    ids.add(id);
    if (!ELEMENT_KINDS.includes(e.kind as ElementKind))
      throw new Error("Invalid element kind.");
    const secure = e.secure === true;
    const out: PageElement = {
      id,
      kind: e.kind as ElementKind,
      rect: {
        x: number(rect.x, "rect"),
        y: number(rect.y, "rect"),
        width: number(rect.width, "rect"),
        height: number(rect.height, "rect"),
      },
      role: text(e.role, 64, "role"),
      name: secure ? "" : text(e.name, 300, "name"),
      // A secret field is reported without its text, whatever the page sent.
      text: secure ? "" : text(e.text, 2000, "text"),
      secure,
    };
    if (e.parentId !== undefined) out.parentId = text(e.parentId, 64, "parent");
    if (e.content !== undefined && !secure) {
      const c = record(e.content);
      out.content = {};
      for (const [key, limit] of [
        ["markdown", 20_000],
        ["code", 20_000],
        ["language", 40],
        ["latex", 4000],
        ["mathml", 8000],
      ] as const)
        if (c[key] !== undefined) out.content[key] = text(c[key], limit, key);
    }
    return out;
  });
  for (const e of elements)
    if (e.parentId !== undefined && !ids.has(e.parentId))
      throw new Error("Invalid element parent.");
  return {
    page: {
      url,
      title: text(page.title, 1000, "title"),
      tabId: page.tabId as number,
      incognito: page.incognito,
    },
    frame: {
      screenX: number(frame.screenX, "frame"),
      screenY: number(frame.screenY, "frame"),
      devicePixelRatio: number(frame.devicePixelRatio, "frame", 100),
      zoom: number(frame.zoom, "frame", 100),
    },
    elements,
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
  private readonly pending = new Map<string, Pending>();
  private readonly translations = new Map<string, AbortController>();
  private readonly now: () => number;
  private readonly wake: () => Promise<boolean>;
  private readonly translate: NonNullable<Options["translate"]>;
  private readonly expiry: NodeJS.Timeout;

  constructor(
    server: Server,
    private readonly origin: () => string,
    options: Options = {},
  ) {
    this.now = options.now ?? Date.now;
    this.wake = options.wake ?? (() => wakeDesktop(() => launchDesktop()));
    this.translate = options.translate ?? desktopTranslate;
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

  /** One-time capability for the install guide; the user never sees it. */
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
      status.token && (this.pairs.get(status.token)?.expires ?? 0) > this.now(),
    );
  }

  /** A completed pairing can outlive its socket; setup is not live health. */
  installConnectionActive(code: string): boolean {
    if (this.installStatus(code) !== true) return false;
    const token = this.installation.get(code)?.token;
    return Boolean(
      token && this.pairs.get(token)?.client?.readyState === WebSocket.OPEN,
    );
  }

  /** Whether a paired browser helper is connected right now. */
  get connected(): boolean {
    return Boolean(this.openClient());
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
      if (pair?.client === client) pair.client = undefined;
      for (const pending of this.pending.values())
        if (pending.client === client) pending.finish();
    });
    client.on("message", (raw) => {
      if (pair && pair.client !== client) {
        client.close(4002, "Opened in another window");
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = record(JSON.parse(raw.toString()));
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
              message:
                "Run /blinkling:install to reconnect the browser helper.",
            });
            client.close(4001, "Pair again");
            return;
          }
          this.codes.delete(code);
          pairToken = randomBytes(32).toString("hex");
          pair = {
            origin,
            expires: this.now() + 12 * 60 * 60 * 1000,
          };
          this.pairs.set(pairToken, pair);
          const installation = this.installation.get(code);
          if (installation) installation.token = pairToken;
        }
        const previous = pair.client;
        pair.client = client;
        if (previous && previous !== client)
          previous.close(4002, "Opened in another window");
        clearTimeout(timer);
        send(client, { type: "paired", token: pairToken });
        return;
      }
      if (pair.expires <= this.now()) {
        client.close(4001, "Pair again");
        return;
      }
      void this.handle(client, message).catch((error: unknown) =>
        send(client, {
          type: "error",
          id: message.id,
          message:
            error instanceof Error ? error.message : "The request failed.",
        }),
      );
    });
  }

  private async handle(
    client: WebSocket,
    message: Record<string, unknown>,
  ): Promise<void> {
    const id = typeof message.id === "string" ? message.id : "";
    if (id.length > 100) throw new Error("Invalid request.");
    if (message.type === "progress") {
      const pending = this.pending.get(id);
      if (
        pending?.client === client &&
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
    if (message.type === "result") {
      const pending = this.pending.get(id);
      if (!pending || pending.client !== client) return;
      try {
        pending.finish(this.readResult(pending.op, message));
      } catch {
        pending.finish();
      }
      return;
    }
    if (message.type === "ping") {
      send(client, { type: "pong" });
      return;
    }
    if (message.type === "status") {
      send(client, {
        type: "status",
        id,
        desktop: await desktopStatePresent(),
      });
      return;
    }
    if (message.type === "wake") {
      const ok = await this.wake().catch(() => false);
      send(client, { type: "wake", id, ok });
      return;
    }
    if (message.type === "translate-batch") {
      const target = text(message.target, 40, "language");
      if (
        !Array.isArray(message.texts) ||
        message.texts.length === 0 ||
        message.texts.length > 60 ||
        !message.texts.every((t) => typeof t === "string" && t.length <= 2000)
      )
        throw new Error("Invalid translation batch.");
      const controller = new AbortController();
      this.translations.set(id, controller);
      try {
        const texts = await this.translate(
          message.texts as string[],
          target,
          controller.signal,
        );
        send(client, { type: "translate-batch", id, texts });
      } finally {
        this.translations.delete(id);
      }
      return;
    }
    if (message.type === "translate-cancel") {
      this.translations.get(id)?.abort();
      return;
    }
    throw new Error("Unknown request.");
  }

  private readResult(op: string, message: Record<string, unknown>) {
    if (message.ok !== true) return { ok: false };
    if (op === "full-page") {
      const images: unknown[] = Array.isArray(message.images)
        ? message.images
        : [];
      if (!images.length || images.length > 8) throw new Error("tiles");
      const page =
        message.page === undefined ? undefined : record(message.page);
      return {
        ok: true,
        tiles: images.map((value) => {
          const image = readCompanionImage(value, 4096);
          return {
            image: image.image,
            width: image.width,
            height: image.height,
          };
        }),
        truncated: message.truncated === true,
        page: page
          ? {
              url: text(page.url, 4000, "url"),
              title: text(page.title, 1000, "title"),
            }
          : undefined,
      };
    }
    if (op === "elements")
      return { ok: true, elements: pageElements(message.elements) };
    return { ok: true };
  }

  private openClient(): WebSocket | undefined {
    return [...this.pairs.values()]
      .map((p) => p.client)
      .find((c) => c?.readyState === WebSocket.OPEN);
  }
  /** The paired browser, waiting a few seconds for one that is reconnecting. */
  private async waitClient(
    graceMs: number,
    signal?: AbortSignal,
  ): Promise<WebSocket | undefined> {
    const deadline = Date.now() + graceMs;
    for (;;) {
      const client = this.openClient();
      if (client || signal?.aborted || Date.now() >= deadline) return client;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  private async ask(
    request: Request,
    timeoutMs: number,
    signal?: AbortSignal,
    onProgress?: Pending["progress"],
    graceMs = 0,
  ): Promise<Record<string, unknown> | undefined> {
    const client = await this.waitClient(graceMs, signal);
    if (!client || signal?.aborted) return undefined;
    return new Promise((resolve) => {
      const id = randomUUID();
      const finish = (value?: Record<string, unknown>) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
        resolve(value?.ok === true ? value : undefined);
      };
      const abort = () => {
        send(client, { type: "cancel", id });
        finish();
      };
      const timer = setTimeout(abort, timeoutMs);
      this.pending.set(id, {
        client,
        op: request.op,
        progress: onProgress,
        finish,
      });
      signal?.addEventListener("abort", abort, { once: true });
      send(client, { type: "request", id, ...request });
    });
  }

  async requestFullPage(
    timeoutMs = 90_000,
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
    reconnectGraceMs = 3000,
  ): Promise<FullPageCapture | undefined> {
    const result = await this.ask(
      { op: "full-page" },
      timeoutMs,
      signal,
      onProgress,
      reconnectGraceMs,
    );
    return result
      ? {
          tiles: result.tiles as FullPageCapture["tiles"],
          truncated: result.truncated === true,
          page: result.page as FullPageCapture["page"],
        }
      : undefined;
  }
  /** Null when there is no helper, no browser window there or a restricted page. */
  async requestElements(
    point?: { x: number; y: number },
    signal?: AbortSignal,
  ): Promise<PageElements | null> {
    const result = await this.ask({ op: "elements", point }, 4000, signal);
    return (result?.elements as PageElements | null | undefined) ?? null;
  }
  async requestTranslate(on: boolean, signal?: AbortSignal): Promise<boolean> {
    return Boolean(await this.ask({ op: "translate", on }, 120_000, signal));
  }
  async requestPdfReader(signal?: AbortSignal): Promise<boolean> {
    return Boolean(await this.ask({ op: "pdf-reader" }, 8000, signal));
  }

  cancelRequests(): void {
    for (const [id, pending] of this.pending) {
      send(pending.client, { type: "cancel", id });
      pending.finish();
    }
    for (const controller of this.translations.values()) controller.abort();
  }
  private prune(): void {
    for (const [code, expiry] of this.codes)
      if (expiry <= this.now()) this.codes.delete(code);
    for (const [token, pair] of this.pairs)
      if (pair.expires <= this.now()) {
        pair.client?.close(4001, "Pair again");
        this.pairs.delete(token);
      }
  }
  async close(): Promise<void> {
    clearInterval(this.expiry);
    this.cancelRequests();
    for (const client of this.sockets.clients) client.terminate();
    this.pairs.clear();
    this.codes.clear();
    this.installation.clear();
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
  }
}
