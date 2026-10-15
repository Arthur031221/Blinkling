import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desktopConnection } from "./desktop-session.js";
import type { HelperBridge } from "./helper-bridge.js";

/** Authenticated reverse RPC: Blink asks the optional browser helper for page
 * structure, a full-length capture, in-place translation and the PDF reader.
 * Browsers cannot call this endpoint directly.
 */
export class DesktopCompanion {
  private token = randomBytes(32).toString("hex");
  private timer?: NodeJS.Timeout;
  private registered = "";
  private closed = false;
  constructor(
    private readonly origin: () => string,
    private readonly extension: HelperBridge,
    private readonly openGuide?: () => Promise<unknown>,
  ) {}
  start(): void {
    const register = async () => {
      try {
        const desktop = await desktopConnection();
        if (this.closed || !desktop) return;
        // The desktop forgets the companion after a refused call, so a token
        // it has been told about is only current while its status says so.
        if (
          this.registered === desktop.client.endpoint.token &&
          desktop.status?.companion === true
        )
          return;
        await desktop.client.rpc("companion", {
          url: this.origin() + "/desktop-companion",
          token: this.token,
        });
        this.registered = desktop.client.endpoint.token;
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
    if (message.method === "elements") {
      const point = message.point;
      const valid =
        point &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Math.abs(point.x) < 1e6 &&
        Math.abs(point.y) < 1e6;
      const controller = new AbortController();
      res.once("close", () => controller.abort());
      const result = await this.extension.elements(
        valid ? { x: point.x, y: point.y } : undefined,
        controller.signal,
        { fresh: message.fresh === true },
      );
      res.end(JSON.stringify({ result }));
      return;
    }
    if (message.method === "translate-page") {
      const controller = new AbortController();
      res.once("close", () => controller.abort());
      res.end(
        JSON.stringify({
          ok: await this.extension.translatePage(
            message.on !== false,
            controller.signal,
          ),
        }),
      );
      return;
    }
    if (message.method === "open-pdf-reader") {
      res.end(JSON.stringify({ ok: await this.extension.openPdfReader() }));
      return;
    }
    if (message.method !== "full-page")
      throw new Error("Unknown companion request");
    const controller = new AbortController();
    res.once("close", () => controller.abort());
    // One JSON object per line: progress while the page is scrolled, then the result.
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    const line = (value: unknown) => res.write(JSON.stringify(value) + "\n");
    const capture = await this.extension.requestFullPage(
      90_000,
      controller.signal,
      (completed, total) => line({ progress: { completed, total } }),
    );
    line(
      capture
        ? {
            capturedAt: Date.now(),
            truncated: capture.truncated,
            tiles: capture.tiles.map((tile, index) => ({
              id: randomUUID(),
              pixelWidth: tile.width,
              pixelHeight: tile.height,
              image: {
                id: randomUUID(),
                name:
                  capture.tiles.length > 1
                    ? `Full page ${index + 1} of ${capture.tiles.length}.png`
                    : "Full page.png",
                mediaType: "image/png",
                data: tile.image.toString("base64"),
              },
            })),
            page: capture.page,
          }
        : { companionRequired: true },
    );
    res.end();
  }
  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
  }
}
