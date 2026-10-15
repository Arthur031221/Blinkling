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
import { launchDesktop } from "../../plugin/desktop/launcher.mjs";
import { PORT } from "./config.js";
import { DesktopCompanion } from "./desktop-companion.js";
import { desktopRunning } from "./desktop-session.js";
import { PanelError } from "./errors.js";
import {
  extensionFolder,
  extensionSourceFolder,
  installExtension,
  installGuide,
  INSTALL_GUIDE_SCRIPT,
  loadDistributionConfig,
  openInstallSurface,
  revealExtensionFolder,
  selectedStoreUrl,
} from "./extension-install.js";
import { HelperBridge } from "./helper-bridge.js";
import { HelperTrust } from "./helper-trust.js";
import type { AnswerProvider } from "./provider-request.js";

const mime: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webm": "video/webm",
};
/** The helper looks for the bridge on these ports, so the bridge takes the first free one. */
export const HELPER_PORTS = 10;

export type HelperServerOptions = {
  provider?: AnswerProvider;
  now?: () => number;
  panelDir?: string;
  trust?: HelperTrust;
  /** First port tried; 0 picks a free one (tests). */
  port?: number;
  onClear?: () => Promise<void>;
};

/**
 * The bridge's loopback HTTP server: the helper socket, the install page and
 * the authenticated endpoint Blink uses to reach the helper.
 */
export class HelperServer {
  private server?: Server;
  private helper?: HelperBridge;
  private desktopCompanion?: DesktopCompanion;
  private extensionArchive?: Promise<Buffer>;
  private readonly distributionFile =
    process.env.BLINKLING_DISTRIBUTION_CONFIG ||
    resolve(
      dirname(resolve(process.argv[1] || ".")),
      "config/distribution.json",
    );
  private port = 0;
  readonly trust: HelperTrust;
  private readonly panelDir: string;

  constructor(private readonly options: HelperServerOptions = {}) {
    this.trust = options.trust ?? new HelperTrust();
    this.panelDir = resolve(
      options.panelDir ??
        process.env.BLINKLING_PANEL_DIR ??
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
                "The local bridge could not complete this request.",
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
    this.helper = new HelperBridge(server, () => this.origin, this.trust, {
      provider: this.options.provider,
      now: this.options.now,
      wake: async () => {
        try {
          await launchDesktop();
          return true;
        } catch {
          return false;
        }
      },
      blinkRunning: async () => Boolean(await desktopRunning().catch(() => 0)),
    });
    this.port = await this.listen(server);
    this.desktopCompanion = new DesktopCompanion(
      () => this.origin,
      this.helper,
      () => this.openExtensionGuide(),
    );
    this.desktopCompanion.start();
    return this;
  }

  /** The first free port of the helper's range, or any free port when the range is taken. */
  private async listen(server: Server): Promise<number> {
    const first = this.options.port ?? PORT;
    const candidates =
      first === 0
        ? [0]
        : [...Array.from({ length: HELPER_PORTS }, (_, i) => first + i), 0];
    for (const candidate of candidates) {
      try {
        return await new Promise<number>((resolveStarted, reject) => {
          const failed = (error: Error) => reject(error);
          server.once("error", failed);
          server.listen(candidate, "127.0.0.1", () => {
            server.off("error", failed);
            const address = server.address();
            if (!address || typeof address === "string")
              reject(new Error("Could not bind the local bridge"));
            else resolveStarted(address.port);
          });
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      }
    }
    throw new Error("Could not bind the local bridge");
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get helperConnected(): boolean {
    return Boolean(this.helper?.connected);
  }

  async openExtensionGuide(): Promise<string> {
    const source = extensionSourceFolder();
    let folder: string;
    try {
      folder = await installExtension(source);
    } catch {
      throw new PanelError(
        "extension_missing",
        "The extension files are missing. Update the plugin, then try again.",
        503,
      );
    }
    const url = `${this.origin}/install#code=${this.trust.issueCode()}`;
    const storeUrl = selectedStoreUrl(
      loadDistributionConfig(this.distributionFile),
      process.env.BLINKLING_BROWSER === "msedge" ? "edge" : "chrome",
    );
    openInstallSurface(url, storeUrl ? undefined : folder);
    return `Open ${url} to set up the Blinkling companion. It connects to Blink automatically.`;
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

  private async readJson(
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new PanelError(
        "invalid_request",
        "Use an application/json request.",
        415,
      );
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 4096)
        throw new PanelError(
          "request_limit",
          "The request exceeds its size limit.",
          413,
        );
      chunks.push(Buffer.from(chunk));
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (value && typeof value === "object" && !Array.isArray(value))
        return value as Record<string, unknown>;
    } catch {
      /* Fall through to the shared error. */
    }
    throw new PanelError("invalid_request", "Supply a JSON object.");
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
    if (path === "/desktop-companion") {
      await this.desktopCompanion!.handle(req, res);
      return;
    }
    const code = new URL(req.url!, this.origin).searchParams.get("code") || "";
    if (path === "/install/status" && req.method === "GET") {
      this.requireCode(code);
      this.reply(res, 200, { connected: this.helperConnected });
      return;
    }
    if (path === "/install/trust" || path === "/install/reveal") {
      if (req.method !== "POST" || req.headers.origin !== this.origin)
        throw new PanelError(
          "invalid_origin",
          "Open the setup page to continue.",
          403,
        );
      if (path === "/install/reveal") {
        this.requireCode(code);
        await revealExtensionFolder();
        this.reply(res, 200, { revealed: true });
        return;
      }
      const body = await this.readJson(req);
      const secret = this.trust.redeem(String(body.code ?? ""));
      if (!secret)
        throw new PanelError(
          "link_expired",
          "This setup link was already used or expired. Open the companion guide from Blink's settings again.",
          401,
        );
      this.reply(res, 200, { secret, port: this.port });
      return;
    }
    if (
      req.method === "GET" &&
      (path === "/install" || path === "/install-guide.js")
    ) {
      const script = path === "/install-guide.js";
      res.writeHead(200, {
        "Content-Type": script
          ? "text/javascript; charset=utf-8"
          : "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      res.end(
        script
          ? INSTALL_GUIDE_SCRIPT
          : installGuide(
              extensionFolder(),
              loadDistributionConfig(this.distributionFile),
            ),
      );
      return;
    }
    if (req.method !== "GET" || !path.startsWith("/assets/"))
      throw new PanelError("not_found", "Not found.", 404);
    const file = resolve(this.panelDir, `.${path}`);
    const within = relative(this.panelDir, file);
    if (
      !within ||
      within === ".." ||
      within.startsWith(`..${sep}`) ||
      isAbsolute(within)
    )
      throw new PanelError("not_found", "Not found.", 404);
    try {
      if (!(await stat(file)).isFile()) throw new Error("Not a file");
    } catch {
      throw new PanelError(
        "not_found",
        "The requested file is unavailable.",
        404,
      );
    }
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  private requireCode(code: string): void {
    if (!this.trust.codeKnown(code))
      throw new PanelError(
        "link_expired",
        "This setup link expired. Open the companion guide from Blink's settings again.",
        401,
      );
  }

  async clearAll(): Promise<void> {
    await this.options.onClear?.();
    this.helper?.cancelPending();
  }

  async close(): Promise<void> {
    this.desktopCompanion?.close();
    await this.helper?.close();
    if (this.server?.listening) {
      this.server.closeAllConnections();
      await new Promise<void>((resolveClosed) =>
        this.server!.close(() => resolveClosed()),
      );
    }
    this.server = undefined;
  }
}
