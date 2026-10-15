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
import { PanelError } from "./errors.js";
import { DesktopCompanion } from "./desktop-companion.js";
import { ExtensionBridge } from "./extension-bridge.js";
import {
  extensionSourceFolder,
  installExtension,
  installGuide,
  INSTALL_GUIDE_SCRIPT,
  loadDistributionConfig,
  openInstallSurface,
  revealExtensionFolder,
  extensionFolder,
  selectedStoreUrl,
} from "./extension-install.js";

const mime: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
};
export type CompanionOptions = ConstructorParameters<
  typeof ExtensionBridge
>[2] & {
  /** Holds assets/ (the install guide's logo and screenshots). */
  assetsDir?: string;
};

/** The small local server behind the optional browser helper: the install
 * guide, the helper's websocket and the reverse RPC Blink calls. It serves no
 * chat, no sessions and no model access. */
export class CompanionServer {
  private server?: Server;
  private extension?: ExtensionBridge;
  private desktopCompanion?: DesktopCompanion;
  private port = 0;
  private readonly distributionFile =
    process.env.BLINKLING_DISTRIBUTION_CONFIG ||
    resolve(
      dirname(resolve(process.argv[1] || ".")),
      "config/distribution.json",
    );
  private readonly assetsDir: string;

  constructor(private readonly options: CompanionOptions = {}) {
    this.assetsDir = resolve(
      options.assetsDir ??
        process.env.BLINKLING_COMPANION_DIR ??
        `${dirname(resolve(process.argv[1] ?? process.cwd()))}/companion`,
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
                "The local companion could not complete this request.",
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
    this.extension = new ExtensionBridge(
      server,
      () => this.origin,
      this.options,
    );
    await new Promise<void>((resolveStarted, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not bind the local companion"));
          return;
        }
        this.port = address.port;
        resolveStarted();
      });
    });
    this.desktopCompanion = new DesktopCompanion(
      () => this.origin,
      this.extension,
      () => this.openExtensionGuide(),
    );
    this.desktopCompanion.start();
    return this;
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }
  get bridge(): ExtensionBridge {
    return this.extension!;
  }

  /** Installs the helper's files, opens the guide and returns what to tell the user. */
  async openExtensionGuide(): Promise<string> {
    let folder: string;
    try {
      folder = await installExtension(extensionSourceFolder());
    } catch {
      throw new PanelError(
        "extension_missing",
        "The extension files are missing. Update the plugin, then run /blinkling:install again.",
        503,
      );
    }
    const code = this.extension!.issueCode();
    const url = `${this.origin}/install#code=${code}`;
    const storeUrl = selectedStoreUrl(
      loadDistributionConfig(this.distributionFile),
      process.env.BLINKLING_BROWSER === "msedge" ? "edge" : "chrome",
    );
    openInstallSurface(url, storeUrl ? undefined : folder);
    return `Open ${url} to install the optional Blinkling browser helper. It connects to Blink by itself.`;
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
    if (path === "/install/status" || path === "/install/reveal") {
      const code =
        new URL(req.url!, this.origin).searchParams.get("code") || "";
      const connected = this.extension?.installStatus(code);
      if (connected === undefined)
        throw new PanelError(
          "pairing_expired",
          "Run /blinkling:install again for a new setup link.",
          401,
        );
      if (path === "/install/status" && req.method === "GET") {
        this.reply(res, 200, {
          connected,
          active: this.extension!.installConnectionActive(code),
        });
        return;
      }
      if (
        path !== "/install/reveal" ||
        req.method !== "POST" ||
        req.headers.origin !== this.origin
      )
        throw new PanelError(
          "invalid_origin",
          "Open the setup page to reveal the folder.",
          403,
        );
      await revealExtensionFolder();
      this.reply(res, 200, { revealed: true });
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
          "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'",
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
    const file = resolve(this.assetsDir, `.${path}`);
    const within = relative(this.assetsDir, file);
    if (
      !within ||
      within === ".." ||
      within.startsWith(`..${sep}`) ||
      isAbsolute(within) ||
      !mime[extname(file)]
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
      "Content-Type": mime[extname(file)]!,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'",
    });
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  cancelRequests(): void {
    this.extension?.cancelRequests();
  }

  async close(): Promise<void> {
    this.desktopCompanion?.close();
    await this.extension?.close();
    if (this.server?.listening) {
      this.server.closeAllConnections();
      await new Promise<void>((resolveClosed) =>
        this.server!.close(() => resolveClosed()),
      );
    }
    this.server = undefined;
  }
}
