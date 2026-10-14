import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desktopConnection } from "./desktop-session.js";
import type { ExtensionBridge } from "./extension-bridge.js";

/** Authenticated reverse RPC: Blink requests browser-only captures through the
 * already paired optional helper. Browsers cannot call this endpoint directly.
 */
export class DesktopCompanion {
  private token = randomBytes(32).toString("hex");
  private timer?: NodeJS.Timeout;
  private registered = "";
  private closed = false;
  constructor(
    private readonly origin: () => string,
    private readonly extension: ExtensionBridge,
    private readonly openGuide?: () => Promise<unknown>,
  ) {}
  start(): void {
    const register = async () => {
      try {
        const desktop = await desktopConnection();
        if (this.closed || !desktop) return;
        if (this.registered === desktop.client.endpoint.token) return;
        await desktop.client.rpc("companion", {
          url: this.origin() + "/desktop-companion",
          token: this.token,
        });
        this.registered = desktop.client.endpoint.token;
        this.extension.useDesktopSession();
      } catch {
        /* Retry quietly after startup, restart or transient disconnect. */
      }
    };
    void register();
    this.timer = setInterval(() => {
      void register();
    }, 2000);
    this.timer.unref();
  }
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const supplied = req.headers.authorization || "",
      expected = `Bearer ${this.token}`;
    if (
      req.headers.origin ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") {
      res.end(JSON.stringify({ companion: true }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.method === "open-guide" && this.openGuide) {
      await this.openGuide();
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (message.method !== "full-page")
      throw new Error("Unknown companion request");
    const controller = new AbortController();
    res.once("close", () => controller.abort());
    const capture = await this.extension.requestFullPage(
      90_000,
      controller.signal,
    );
    res.end(
      JSON.stringify(
        capture
          ? {
              id: randomUUID(),
              capturedAt: Date.now(),
              pixelWidth: capture.width,
              pixelHeight: capture.height,
              image: {
                id: randomUUID(),
                name: "Full page.png",
                mediaType: "image/png",
                data: capture.image.toString("base64"),
              },
              page: capture.page,
            }
          : { companionRequired: true },
      ),
    );
  }
  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
  }
}
