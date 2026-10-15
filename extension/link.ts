/** The browser helper's websocket to the local bridge: pairing, requests that
 * Blink sends down (one result per request, cancellable), and the few calls the
 * helper sends up (wake, status, translate). */
export type Request = { id: string; op: string; [key: string]: unknown };
export type RequestContext = {
  signal: AbortSignal;
  progress(completed: number, total: number): void;
};
/** Resolves with the fields of the result; `ok` is true unless it says otherwise. */
export type RequestHandler = (
  request: Request,
  context: RequestContext,
) => Promise<Record<string, unknown>>;
export type Credentials = { url: string; code?: string; token?: string };

const PAIR_TIMEOUT_MS = 8000;
const CALL_TIMEOUT_MS = 130_000;
const PING_MS = 20_000;
const RETRY_FIRST_MS = 1000;
const RETRY_LAST_MS = 30_000;
/** Close codes after which retrying would only fight another window or a bad pairing. */
const FINAL_CLOSES = new Set([4001, 4002]);

export class HelperLink {
  private socket?: WebSocket;
  private credentials?: Credentials;
  private readonly calls = new Map<
    string,
    {
      resolve: (m: Record<string, unknown>) => void;
      reject: (e: Error) => void;
    }
  >();
  private readonly jobs = new Map<string, AbortController>();
  private ping?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private delay = RETRY_FIRST_MS;
  private wanted = false;
  /** Set when the bridge closed for good (replaced, pairing gone): retrying would not help. */
  private final = false;
  private sequence = 0;
  constructor(
    private readonly handler: RequestHandler,
    private readonly saveToken: (
      token: string,
    ) => void | Promise<void> = () => {},
    private readonly Socket: typeof WebSocket = WebSocket,
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === 1 && this.paired;
  }
  private paired = false;

  /** Pairs (with a one-time code or a stored token) and resolves once Blink's bridge accepts. */
  open(credentials: Credentials): Promise<void> {
    this.close();
    this.credentials = credentials;
    this.wanted = true;
    this.final = false;
    return this.connect();
  }

  /** Reconnects with a stored token after the worker slept or the bridge restarted. */
  keep(credentials: Credentials): void {
    void this.open(credentials).catch(() => this.schedule());
  }

  private connect(): Promise<void> {
    const credentials = this.credentials!;
    return new Promise<void>((resolve, reject) => {
      const socket = new this.Socket(credentials.url);
      this.socket = socket;
      this.paired = false;
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
          if (this.socket === socket && socket.readyState < 2) socket.close();
        } else resolve();
      };
      const timer = setTimeout(
        () => settle(new Error("connection_timeout")),
        PAIR_TIMEOUT_MS,
      );
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: "pair",
            ...(credentials.token
              ? { token: credentials.token }
              : { code: credentials.code }),
          }),
        );
      socket.onerror = () => settle(new Error("connection_failed"));
      socket.onclose = (event) => {
        if (this.socket === socket && FINAL_CLOSES.has(event?.code ?? 0))
          this.final = true;
        settle(new Error("connection_closed"));
        if (this.socket !== socket) return;
        this.stop();
        this.schedule();
      };
      socket.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!this.paired) {
          if (message.type === "error") settle(new Error("connection_failed"));
          if (
            message.type === "paired" &&
            typeof message.token === "string" &&
            /^[a-f0-9]{64}$/.test(message.token)
          ) {
            this.paired = true;
            this.delay = RETRY_FIRST_MS;
            this.credentials = { url: credentials.url, token: message.token };
            this.ping = setInterval(
              () => socket.send(JSON.stringify({ type: "ping" })),
              PING_MS,
            );
            Promise.resolve(this.saveToken(message.token)).then(
              () => settle(),
              () => settle(new Error("connection_failed")),
            );
          }
          return;
        }
        this.dispatch(socket, message);
      };
    });
  }

  private dispatch(socket: WebSocket, message: Record<string, unknown>): void {
    const id = typeof message.id === "string" ? message.id : "";
    if (message.type === "request") {
      const controller = new AbortController();
      this.jobs.set(id, controller);
      const request = message as unknown as Request;
      void this.handler(request, {
        signal: controller.signal,
        progress: (completed, total) =>
          socket.send(
            JSON.stringify({ type: "progress", id, completed, total }),
          ),
      })
        .then((fields) => ({ ok: true, ...fields }))
        .catch(() => ({ ok: false }))
        .then((fields) => {
          this.jobs.delete(id);
          if (controller.signal.aborted || socket.readyState !== 1) return;
          socket.send(JSON.stringify({ type: "result", id, ...fields }));
        });
      return;
    }
    if (message.type === "cancel") {
      this.jobs.get(id)?.abort();
      return;
    }
    const call = this.calls.get(id);
    if (!call) return;
    this.calls.delete(id);
    if (message.type === "error")
      call.reject(new Error(String(message.message)));
    else call.resolve(message);
  }

  /** One round trip to the bridge: wake, status or translate-batch. */
  call(
    message: Record<string, unknown>,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket || !this.connected)
      return Promise.reject(new Error("not_connected"));
    const id = `c${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.calls.delete(id);
        reject(new Error("call_timeout"));
      }, timeoutMs);
      this.calls.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ ...message, id }));
    });
  }

  /** Asks the bridge to stop a batch it is still translating. */
  cancelCall(id: string): void {
    if (this.connected)
      this.socket?.send(JSON.stringify({ type: "translate-cancel", id }));
  }

  private schedule(): void {
    if (!this.wanted || this.final || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.connect().catch(() => this.schedule());
    }, this.delay);
    this.delay = Math.min(RETRY_LAST_MS, this.delay * 2);
  }

  private stop(): void {
    clearInterval(this.ping);
    this.ping = undefined;
    this.paired = false;
    for (const controller of this.jobs.values()) controller.abort();
    this.jobs.clear();
    for (const call of this.calls.values())
      call.reject(new Error("not_connected"));
    this.calls.clear();
  }

  close(): void {
    this.wanted = false;
    clearTimeout(this.retry);
    this.retry = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.stop();
    socket?.close();
  }
}
