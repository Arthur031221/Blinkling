/**
 * The companion's link to the Blinkling bridge on this computer. It finds the
 * bridge on its port range, proves it holds the shared secret (and checks the
 * bridge does too) with an HMAC exchange, then answers the bridge's requests.
 */
export const HELPER_FIRST_PORT = 43827;
export const HELPER_PORT_COUNT = 10;
const SECRET = /^[0-9a-f]{64}$/;
const PING_MS = 20_000;
const STORAGE_KEY = "helperSecret";

export type Request = { type: string; id?: string; [key: string]: unknown };
export type HelperHandlers = {
  /** Answers one bridge request. A returned object is sent back as `<type>-result`. */
  handle(
    request: Request,
    context: { signal: AbortSignal; send(message: object): void },
  ): Promise<object | undefined>;
};
export type HelperState = {
  trusted: boolean;
  connected: boolean;
  blink?: boolean;
};

export const inHelperRange = (port: number): boolean =>
  Number.isInteger(port) &&
  port >= HELPER_FIRST_PORT &&
  port < HELPER_FIRST_PORT + HELPER_PORT_COUNT;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function proof(
  secret: string,
  role: "client" | "server",
  first: string,
  second: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${role}:${first}:${second}`),
  );
  return hex(new Uint8Array(signed));
}

const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function storedSecret(): Promise<string | undefined> {
  const value = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  return typeof value === "string" && SECRET.test(value) ? value : undefined;
}
export async function storeSecret(secret: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: secret });
}

export class HelperClient {
  private socket?: WebSocket;
  private searching?: Promise<void>;
  private ping?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private lastPort?: number;
  private readonly running = new Map<string, AbortController>();
  private readonly waiting = new Map<
    string,
    (value: Record<string, unknown>) => void
  >();
  private closed = false;
  trustedNow = false;
  onChange?: () => void;

  constructor(
    private readonly handlers: HelperHandlers,
    private readonly open: (url: string) => WebSocket = (url) =>
      new WebSocket(url),
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.trustedNow;
  }

  /** Looks for the bridge now unless already connected or looking. */
  wake(): Promise<void> {
    if (this.connected) return Promise.resolve();
    clearTimeout(this.retry);
    this.searching ??= this.search().finally(() => {
      this.searching = undefined;
    });
    return this.searching;
  }

  /** Forgets the connection and looks again, for a freshly received secret. */
  async reconnect(): Promise<void> {
    this.attempts = 0;
    this.socket?.close();
    await this.searching?.catch(() => undefined);
    await this.wake();
  }

  stop(): void {
    this.closed = true;
    clearTimeout(this.retry);
    this.socket?.close();
  }

  private async search(): Promise<void> {
    const secret = await storedSecret();
    if (!secret) {
      this.onChange?.();
      return;
    }
    const ports = Array.from(
      { length: HELPER_PORT_COUNT },
      (_, i) => HELPER_FIRST_PORT + i,
    );
    if (this.lastPort) ports.sort((a) => (a === this.lastPort ? -1 : 0));
    for (const port of ports) {
      if (this.closed) return;
      if (await this.attempt(port, secret)) {
        this.lastPort = port;
        this.attempts = 0;
        return;
      }
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    clearTimeout(this.retry);
    // Back off up to a minute; the service worker's alarm also wakes this.
    const delay = Math.min(60_000, 2000 * 2 ** Math.min(this.attempts++, 5));
    this.retry = setTimeout(() => void this.wake(), delay);
  }

  /** Opens one port and completes the mutual proof. Resolves true once trusted. */
  private attempt(port: number, secret: string): Promise<boolean> {
    return new Promise((resolve) => {
      let socket: WebSocket;
      try {
        socket = this.open(`ws://127.0.0.1:${port}/extension`);
      } catch {
        resolve(false);
        return;
      }
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok) socket.close();
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), 4000);
      let nonce = "";
      let challenge = "";
      socket.onerror = () => done(false);
      socket.onclose = () => {
        if (!settled) done(false);
        else if (this.socket === socket) this.lost();
      };
      socket.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!settled) {
          if (
            message.type === "challenge" &&
            typeof message.nonce === "string" &&
            /^[0-9a-f]{32}$/.test(message.nonce)
          ) {
            challenge = message.nonce;
            nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
            void proof(secret, "client", challenge, nonce).then((p) =>
              socket.send(JSON.stringify({ type: "hello", nonce, proof: p })),
            );
          } else if (message.type === "ready" && nonce) {
            void proof(secret, "server", nonce, challenge).then((expected) => {
              if (
                typeof message.proof !== "string" ||
                !equal(message.proof, expected)
              )
                return done(false);
              this.socket = socket;
              this.trustedNow = true;
              this.startPing();
              done(true);
              this.onChange?.();
            });
          }
          return;
        }
        void this.receive(socket, message);
      };
    });
  }

  private startPing(): void {
    clearInterval(this.ping);
    this.ping = setInterval(() => this.post({ type: "ping" }), PING_MS);
  }

  private lost(): void {
    clearInterval(this.ping);
    this.trustedNow = false;
    this.socket = undefined;
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
    this.onChange?.();
    if (!this.closed) this.scheduleRetry();
  }

  post(message: object): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Sends a request and waits for its `<type>-result` reply. */
  call(
    message: { type: string; [key: string]: unknown },
    timeoutMs = 10_000,
  ): Promise<Record<string, unknown> | undefined> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(`${message.type}-result:${id}`);
        resolve(undefined);
      }, timeoutMs);
      this.waiting.set(`${message.type}-result:${id}`, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      if (!this.post({ ...message, id })) {
        clearTimeout(timer);
        this.waiting.delete(`${message.type}-result:${id}`);
        resolve(undefined);
      }
    });
  }

  /** The Blink status the bridge reports, for the popup. */
  async blinkRunning(): Promise<boolean | undefined> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete("status:");
        resolve(undefined);
      }, 3000);
      this.waiting.set("status:", (value) => {
        clearTimeout(timer);
        resolve(value.blink === true);
      });
      if (!this.post({ type: "status" })) {
        clearTimeout(timer);
        this.waiting.delete("status:");
        resolve(undefined);
      }
    });
  }

  private async receive(
    socket: WebSocket,
    message: Record<string, unknown>,
  ): Promise<void> {
    const type = String(message.type);
    if (type === "pong") return;
    if (type === "status") {
      this.waiting.get("status:")?.(message);
      this.waiting.delete("status:");
      return;
    }
    if (type.endsWith("-result") && typeof message.id === "string") {
      const key = `${type}:${message.id}`;
      this.waiting.get(key)?.(message);
      this.waiting.delete(key);
      return;
    }
    if (typeof message.id !== "string") return;
    const id = message.id;
    if (type.endsWith("-cancel")) {
      this.running.get(id)?.abort();
      this.running.delete(id);
      return;
    }
    const controller = new AbortController();
    this.running.set(id, controller);
    try {
      const result = await this.handlers.handle(message as Request, {
        signal: controller.signal,
        send: (value) => {
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify(value));
        },
      });
      if (
        !controller.signal.aborted &&
        result &&
        socket.readyState === WebSocket.OPEN
      )
        socket.send(JSON.stringify({ type: `${type}-result`, id, ...result }));
    } catch {
      if (!controller.signal.aborted && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: `${type}-result`, id, ok: false }));
    } finally {
      this.running.delete(id);
    }
  }
}
