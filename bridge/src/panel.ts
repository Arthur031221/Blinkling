import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { OneTimeTokens } from "./auth.js";
import { BrowserCaptures } from "./browser-captures.js";
import { HISTORY_TTL_MS, MAX_UPLOAD_MESSAGE_BYTES } from "./config.js";
import { PanelError, cancelled } from "./errors.js";
import {
  defaultFloatingPreferencesPath,
  FloatingPreferences,
  normalizeFloatingGeometry,
} from "./floatingPreferences.js";
import { CaptureHistory, type Capture } from "./history.js";
import { hasFrameChanged, readPanelImage, sampleFrame } from "./panel-image.js";
import { runProvider, type AnswerProvider } from "./provider.js";
import {
  SessionStore,
  type AnswerEntry,
  type AnswerKind,
  type PanelSession,
} from "./sessions.js";

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".gif": "image/gif",
};
export type PanelOptions = {
  provider?: AnswerProvider;
  now?: () => number;
  sessionTtlMs?: number;
  answerTimeoutMs?: number;
  panelDir?: string;
  onClear?: () => Promise<void>;
  floatingGeometryPath?: string | null;
};
type RequestBody = Record<string, unknown>;

export class PanelServer {
  private server?: Server;
  private captures?: BrowserCaptures;
  private expiryTimer?: NodeJS.Timeout;
  private port = 0;
  private readonly tokens: OneTimeTokens;
  private readonly sessions: SessionStore;
  private readonly provider: AnswerProvider;
  private readonly now: () => number;
  private readonly panelDir: string;
  private readonly floatingPreferences: FloatingPreferences;

  constructor(
    private readonly history: CaptureHistory,
    private readonly options: PanelOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.tokens = new OneTimeTokens(60_000, this.now);
    this.sessions = new SessionStore(
      this.now,
      options.sessionTtlMs,
      8,
      (session) => this.captures?.expire(session.id),
    );
    this.provider = options.provider ?? runProvider;
    const floatingGeometryPath =
      options.floatingGeometryPath !== undefined
        ? options.floatingGeometryPath
        : process.env.GLIMPSELET_TEST_MODE === "1"
          ? null
          : defaultFloatingPreferencesPath();
    this.floatingPreferences = new FloatingPreferences(floatingGeometryPath);
    this.panelDir = resolve(
      options.panelDir ??
        process.env.GLIMPSELET_PANEL_DIR ??
        `${dirname(resolve(process.argv[1] ?? process.cwd()))}/panel`,
    );
  }

  async start(): Promise<this> {
    const server = createServer((req, res) => {
      void this.handle(req, res).catch((error: unknown) => {
        if (res.destroyed) return;
        if (res.headersSent) {
          res.end();
          return;
        }
        const failure =
          error instanceof PanelError
            ? error
            : new PanelError(
                "internal_error",
                "The local panel could not complete this request.",
                500,
              );
        this.reply(res, failure.status, {
          code: failure.code,
          error: failure.message,
        });
      });
    });
    server.headersTimeout = 10_000;
    server.requestTimeout = 30_000;
    this.server = server;
    this.captures = new BrowserCaptures(
      server,
      () => this.origin,
      (id) => this.sessions.get(id),
      this.now,
    );
    await new Promise<void>((resolveStarted, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not bind the local panel"));
          return;
        }
        this.port = address.port;
        resolveStarted();
      });
    });
    this.expiryTimer = setInterval(() => {
      this.sessions.prune();
      this.history.prune();
    }, 10_000);
    this.expiryTimer.unref();
    return this;
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }
  requestCapture(
    timeoutMs = 2500,
    signal?: AbortSignal,
  ): Promise<Capture | undefined> {
    return (
      this.captures?.request(timeoutMs, signal) ?? Promise.resolve(undefined)
    );
  }

  get isSharing(): boolean {
    return this.captures?.isSharing ?? false;
  }

  cancelCaptures(): void {
    this.captures?.cancelPending();
  }

  async openUrl(): Promise<string> {
    const url = `${this.origin}/#${this.tokens.issue()}`;
    if (process.env.GLIMPSELET_DISABLE_BROWSER_OPEN !== "1") {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
      const args =
        process.platform === "win32" ? ["/c", "start", "", url] : [url];
      execFile(
        command,
        args,
        { timeout: 3000, windowsHide: true },
        () => {},
      ).unref();
    }
    return `Glimpselet panel URL, valid once for 60 seconds: ${url}`;
  }

  private reply(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(JSON.stringify(body));
  }

  private async body(req: IncomingMessage): Promise<RequestBody> {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new PanelError(
        "invalid_request",
        "Use an application/json request.",
        415,
      );
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX_UPLOAD_MESSAGE_BYTES)
      throw new PanelError(
        "request_limit",
        "The request exceeds its size limit.",
        413,
      );
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_UPLOAD_MESSAGE_BYTES)
        throw new PanelError(
          "request_limit",
          "The request exceeds its size limit.",
          413,
        );
      chunks.push(bytes);
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new PanelError("invalid_request", "Supply a JSON object.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new PanelError("invalid_request", "Supply a JSON object.");
    return value as RequestBody;
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.headers.host !== `127.0.0.1:${this.port}`)
      throw new PanelError("invalid_origin", "Unexpected local host.", 403);
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? "/", this.origin).pathname);
    } catch {
      throw new PanelError("invalid_request", "Invalid request path.");
    }
    if (path.startsWith("/api/")) {
      if (req.method !== "POST")
        throw new PanelError("invalid_request", "Use POST.", 405);
      if (req.headers.origin !== this.origin)
        throw new PanelError(
          "invalid_origin",
          "Unexpected request origin.",
          403,
        );
      if (path === "/api/session") {
        const data = await this.body(req);
        if (typeof data.token !== "string" || !this.tokens.consume(data.token))
          throw new PanelError(
            "session_expired",
            "This panel link expired or was already used. Run /glimpselet:glimpse again.",
            401,
          );
        const session = this.sessions.create();
        this.reply(res, 200, {
          session: session.id,
          expiresAt: session.expiresAt,
          floatingGeometry: await this.floatingPreferences.read(),
        });
        return;
      }
      const auth =
        /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
          req.headers.authorization ?? "",
        )?.[1] ?? "";
      const session = this.sessions.get(auth);
      if (!session)
        throw new PanelError(
          "session_expired",
          "The panel session expired. Run /glimpselet:glimpse again.",
          401,
        );
      const data = await this.body(req);
      if (this.sessions.get(auth) !== session)
        throw new PanelError(
          "session_expired",
          "The panel session expired. Run /glimpselet:glimpse again.",
          401,
        );
      if (path === "/api/history") {
        this.reply(res, 200, {
          entries: session.entries,
          expiresAfterMs: HISTORY_TTL_MS,
        });
      } else if (path === "/api/floating-geometry") {
        const geometry = normalizeFloatingGeometry(data.geometry);
        if (!geometry)
          throw new PanelError(
            "invalid_request",
            "Supply valid version 1 floating geometry.",
          );
        const stored = await this.floatingPreferences.write(geometry);
        this.reply(res, 200, { ok: true, stored });
      } else if (path === "/api/clear") {
        await this.clearAll();
        this.reply(res, 200, { ok: true });
      } else if (path === "/api/pause") {
        if (session.job?.kind === "passive") {
          session.job.controller.abort();
          await session.job.finished;
        }
        this.reply(res, 200, { ok: true });
      } else if (path === "/api/capture") {
        if (!session.captureLimiter.take(this.now(), 6))
          throw new PanelError(
            "capture_limit",
            "The local capture limit was reached. Try again in a minute.",
            429,
          );
        const png = readPanelImage(data.image);
        this.history.add({
          ...png,
          at: this.now(),
          source: "shared browser surface",
          note: "",
        });
        this.reply(res, 200, {
          ok: true,
          width: png.width,
          height: png.height,
        });
      } else if (path === "/api/ask") {
        await this.ask(req, res, session, data);
      } else throw new PanelError("not_found", "Unknown API route.", 404);
      return;
    }
    if (req.method !== "GET")
      throw new PanelError("not_found", "Not found.", 404);
    const file = resolve(
      this.panelDir,
      `.${path === "/" ? "/index.html" : path}`,
    );
    const pathWithinPanel = relative(this.panelDir, file);
    if (
      !pathWithinPanel ||
      pathWithinPanel === ".." ||
      pathWithinPanel.startsWith(`..${sep}`) ||
      isAbsolute(pathWithinPanel)
    )
      throw new PanelError("not_found", "Not found.", 404);
    try {
      if (!(await stat(file)).isFile()) throw new Error("Not a file");
    } catch {
      throw new PanelError(
        "not_found",
        "The requested panel file is unavailable.",
        404,
      );
    }
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  private async ask(
    req: IncomingMessage,
    res: ServerResponse,
    session: PanelSession,
    data: RequestBody,
  ): Promise<void> {
    if (session.job)
      throw new PanelError(
        "answer_busy",
        "An answer is already running. Pause or wait for it.",
        429,
      );
    const kind: AnswerKind =
      data.mode === undefined
        ? "ask"
        : data.mode === "ask" ||
            data.mode === "passive" ||
            data.mode === "summary"
          ? data.mode
          : (() => {
              throw new PanelError("invalid_request", "Unknown answer mode.");
            })();
    if (
      typeof data.question !== "string" ||
      !data.question.trim() ||
      data.question.length > 2000
    )
      throw new PanelError(
        "question_limit",
        "Add a question of up to 2,000 characters.",
      );
    const model = data.model === undefined ? "sonnet" : data.model;
    if (model !== "sonnet" && model !== "opus" && model !== "haiku")
      throw new PanelError("invalid_model", "Choose Sonnet, Opus, or Haiku.");
    const backend = data.backend === undefined ? "cli" : data.backend;
    if (backend !== "cli" && backend !== "api")
      throw new PanelError("invalid_request", "Unknown answer backend.");
    if (
      data.key !== undefined &&
      (typeof data.key !== "string" ||
        data.key.length > 512 ||
        /[\r\n]/.test(data.key))
    )
      throw new PanelError("invalid_request", "The API key is invalid.");
    if (backend === "api" && typeof data.key === "string")
      session.key = data.key.trim() || undefined;
    if (backend === "api" && !session.key)
      throw new PanelError(
        "api_key_missing",
        "Add an API key or switch to the installed CLI.",
      );
    if (
      kind === "summary" &&
      !session.entries.some((entry) => entry.kind === "passive")
    )
      throw new PanelError(
        "notes_empty",
        "There are no passive notes from the last ten minutes.",
        409,
      );
    const png = kind === "summary" ? undefined : readPanelImage(data.image);
    const sample =
      kind === "passive" && png ? sampleFrame(png.image) : undefined;
    if (sample) {
      if (!hasFrameChanged(session.lastPassiveFrame, sample))
        throw new PanelError(
          "unchanged_frame",
          "The processed frame has not changed enough for another note.",
          409,
        );
      const cap = data.rateCap === undefined ? 6 : data.rateCap;
      if (
        typeof cap !== "number" ||
        !Number.isInteger(cap) ||
        cap < 1 ||
        cap > 6
      )
        throw new PanelError(
          "invalid_request",
          "Choose a passive limit from one to six requests per minute.",
        );
      if (!session.passiveLimiter.take(this.now(), cap))
        throw new PanelError(
          "passive_limit",
          "The passive request limit was reached. Sampling will resume next minute.",
          429,
        );
    }
    const controller = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((resolveFinished) => {
      finish = resolveFinished;
    });
    const job = { controller, kind, finished };
    session.job = job;
    const generation = session.generation;
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", disconnected);
    res.once("close", disconnected);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.answerTimeoutMs ?? 120_000);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Referrer-Policy": "no-referrer",
    });
    res.flushHeaders();
    const send = (event: string, payload: unknown) => {
      if (!res.destroyed)
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    try {
      const result = await this.provider({
        image: png?.image,
        question: data.question.trim(),
        model,
        backend,
        key: backend === "api" ? session.key : undefined,
        kind,
        context: [...session.entries],
        signal: controller.signal,
        onText: (text) => {
          if (!controller.signal.aborted) send("delta", { text });
        },
      });
      if (controller.signal.aborted || generation !== session.generation)
        throw cancelled();
      if (!result.answer.trim())
        throw new PanelError(
          "provider_error",
          "The provider returned an empty answer.",
          502,
        );
      const entry: AnswerEntry = {
        id: randomBytes(12).toString("hex"),
        at: this.now(),
        question: data.question.trim(),
        answer: result.answer,
        kind,
        usage: result.usage,
      };
      this.sessions.append(session, entry);
      if (sample) session.lastPassiveFrame = sample;
      if (png)
        this.history.add({
          ...png,
          at: entry.at,
          source: "shared browser surface",
          note: entry.answer.slice(0, 2000),
        });
      this.history.addNote(entry.question, "user");
      this.history.addNote(entry.answer, "assistant");
      send("done", { entry });
    } catch (error) {
      const failure = timedOut
        ? new PanelError(
            "answer_timeout",
            "The answer timed out after two minutes.",
            504,
          )
        : controller.signal.aborted
          ? cancelled()
          : error instanceof PanelError
            ? error
            : new PanelError(
                "provider_error",
                "The answer provider could not complete this request.",
                502,
              );
      send("error", { code: failure.code, message: failure.message });
    } finally {
      clearTimeout(timeout);
      req.removeListener("aborted", disconnected);
      res.removeListener("close", disconnected);
      if (session.job === job) session.job = undefined;
      finish();
      res.end();
    }
  }

  async clearAll(): Promise<void> {
    await this.options.onClear?.();
    this.captures?.clear();
    await this.sessions.clear();
    this.history.clear();
  }

  async close(): Promise<void> {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.captures?.close();
    await this.sessions.close();
    this.tokens.clear();
    if (this.server?.listening) {
      this.server.closeAllConnections();
      await new Promise<void>((resolveClosed) =>
        this.server!.close(() => resolveClosed()),
      );
    }
    this.server = undefined;
  }
}
