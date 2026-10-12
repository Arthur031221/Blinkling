import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { MAX_UPLOAD_MESSAGE_BYTES } from "./config.js";
import type { Capture } from "./history.js";
import type { PanelSession } from "./sessions.js";
import { readPanelImage } from "./panel-image.js";
import { cancelled, PanelError } from "./errors.js";

type PendingCapture = {
  client: WebSocket;
  resolve: (capture: Capture) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class BrowserCaptures {
  private readonly sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_UPLOAD_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  private readonly clients = new Map<
    WebSocket,
    { session: string; sharing: boolean }
  >();
  private readonly pending = new Map<string, PendingCapture>();
  private readonly sharingSessions = new Set<string>();

  constructor(
    server: Server,
    private readonly origin: () => string,
    private readonly getSession: (id: string) => PanelSession | undefined,
    private readonly now = () => Date.now(),
  ) {
    server.on("upgrade", (req, socket, head) => {
      if (req.url === "/extension") return;
      const protocols = (req.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((part) => part.trim());
      const session =
        protocols.length === 2 ? this.getSession(protocols[1]!) : undefined;
      if (
        req.headers.host !== new URL(this.origin()).host ||
        req.headers.origin !== this.origin() ||
        req.url !== "/api/stream" ||
        protocols[0] !== "glimpselet" ||
        !session
      ) {
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(req, socket, head, (client) =>
        this.sockets.emit("connection", client, req, session),
      );
    });
    this.sockets.on(
      "connection",
      (client: WebSocket, _req: IncomingMessage, session: PanelSession) => {
        this.clients.set(client, { session: session.id, sharing: false });
        client.on("error", () => this.remove(client));
        client.on("close", () => this.remove(client));
        client.on("message", (raw) => {
          if (!this.getSession(session.id)) {
            client.close(4001, "Session expired");
            return;
          }
          let message;
          try {
            message = JSON.parse(raw.toString());
          } catch {
            client.close(1007, "Invalid JSON");
            return;
          }
          if (
            !message ||
            typeof message !== "object" ||
            Array.isArray(message)
          ) {
            client.close(1008, "Invalid message");
            return;
          }
          if (message.type === "share" && typeof message.active === "boolean") {
            this.clients.set(client, {
              session: session.id,
              sharing: message.active,
            });
            if (message.active) this.sharingSessions.add(session.id);
            else {
              this.cancelClient(client);
              if (
                ![...this.clients.values()].some(
                  (state) => state.session === session.id && state.sharing,
                )
              )
                this.sharingSessions.delete(session.id);
            }
            return;
          }
          if (message.type !== "capture" || typeof message.id !== "string") {
            client.close(1008, "Invalid message");
            return;
          }
          const pending = this.pending.get(message.id);
          if (!pending || pending.client !== client) return;
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          try {
            if (message.error)
              throw new PanelError(
                "capture_unavailable",
                "The shared surface is no longer available.",
                409,
              );
            if (!session.captureLimiter.take(this.now()))
              throw new PanelError(
                "capture_limit",
                "The local capture limit was reached. Try again in a minute.",
                429,
              );
            const png = readPanelImage(message.image);
            pending.resolve({
              ...png,
              at: this.now(),
              source: "shared browser surface",
              note: "",
            });
          } catch (error) {
            pending.reject(
              error instanceof Error
                ? error
                : new PanelError("invalid_image", "Invalid shared capture."),
            );
          }
        });
      },
    );
  }

  request(
    timeoutMs = 2500,
    signal?: AbortSignal,
  ): Promise<Capture | undefined> {
    if (signal?.aborted) return Promise.reject(cancelled());
    const sharing = [...this.clients].filter(
      ([client, state]) =>
        state.sharing &&
        client.readyState === WebSocket.OPEN &&
        this.getSession(state.session),
    );
    const client = sharing.at(-1)?.[0];
    if (!client)
      return this.isSharing
        ? Promise.reject(
            new PanelError(
              "capture_unavailable",
              "The shared surface disconnected. Share it again or explicitly stop sharing before native capture.",
              409,
            ),
          )
        : Promise.resolve(undefined);
    if (this.pending.size >= 4)
      return Promise.reject(
        new PanelError(
          "capture_busy",
          "A shared capture is already pending.",
          429,
        ),
      );
    const id = randomBytes(12).toString("hex");
    return new Promise<Capture>((resolve, reject) => {
      const finish = (callback: () => void) => {
        signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        finish(() => reject(cancelled()));
      };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        finish(() =>
          reject(
            new PanelError(
              "capture_timeout",
              "The shared surface did not reply. Native capture was not substituted.",
              504,
            ),
          ),
        );
      }, timeoutMs);
      this.pending.set(id, {
        client,
        resolve: (capture) => finish(() => resolve(capture)),
        reject: (error) => finish(() => reject(error)),
        timer,
      });
      signal?.addEventListener("abort", abort, { once: true });
      client.send(JSON.stringify({ type: "capture-request", id }), (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(timer);
        this.pending.delete(id);
        finish(() =>
          reject(
            new PanelError(
              "capture_unavailable",
              "The shared surface disconnected.",
              409,
            ),
          ),
        );
      });
    });
  }

  get isSharing(): boolean {
    return this.sharingSessions.size > 0;
  }

  private cancelClient(client: WebSocket): void {
    for (const [id, pending] of this.pending) {
      if (pending.client !== client) continue;
      clearTimeout(pending.timer);
      pending.reject(cancelled());
      this.pending.delete(id);
    }
  }
  private remove(client: WebSocket): void {
    this.cancelClient(client);
    this.clients.delete(client);
  }
  expire(session: string): void {
    this.sharingSessions.delete(session);
    for (const [client, state] of this.clients)
      if (state.session === session) {
        this.remove(client);
        client.close(4001, "Session expired");
      }
  }
  cancelPending(): void {
    for (const client of this.clients.keys()) this.cancelClient(client);
  }
  clear(): void {
    this.cancelPending();
    this.sharingSessions.clear();
    for (const [client, state] of this.clients) {
      state.sharing = false;
      if (client.readyState === WebSocket.OPEN)
        client.send(JSON.stringify({ type: "clear" }));
    }
  }
  close(): void {
    this.cancelPending();
    this.sharingSessions.clear();
    for (const client of this.clients.keys()) client.terminate();
    this.clients.clear();
    this.sockets.close();
  }
}
