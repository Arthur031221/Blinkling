import { timing } from "../shared/motion.mjs";
import { promisify } from "node:util";
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import {
  assertClaudeVersion,
  ControlRequests,
  enableRemote,
  launchArguments,
  remoteMode,
  userMessage,
} from "./protocol.mjs";

/** One owned child, with no credential access and no writes to an interactive origin.
 * `remote` overrides BLINKLING_REMOTE ("off", "test" or "on") for this session. */
export class OwnedSession extends EventEmitter {
  constructor({
    controlTimeoutMs = 15000,
    connectTimeoutMs = 45000,
    executableArgs = [],
    remote,
  } = {}) {
    super();
    this.remoteOverride = remote;
    this.controlTimeoutMs = controlTimeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.executableArgs = [...executableArgs];
    this.abort = new AbortController();
  }
  async connect({
    cwd,
    localId,
    sessionId,
    remoteId,
    model,
    effort,
    executable = "claude",
  }) {
    if (this.disposing) throw new Error("Session closed");
    if (this.connecting) throw new Error("Session already started");
    this.connecting = true;
    this.versionCheck = promisify(execFile)(
      executable,
      [...this.executableArgs, "--version"],
      {
        timeout: 10000,
        windowsHide: true,
        signal: this.abort.signal,
        killSignal: "SIGKILL",
      },
    );
    const version = await this.versionCheck;
    if (this.disposing) throw new Error("Session closed");
    assertClaudeVersion(version.stdout);
    const env = { ...process.env };
    delete env.CLAUDECODE; // Only the owned child may clear the nested-session marker.
    const child = (this.child = spawn(
      executable,
      [
        ...this.executableArgs,
        ...launchArguments({
          sessionId,
          newSessionId: sessionId ? undefined : localId,
          model,
          effort,
        }),
      ],
      {
        cwd,
        env,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ));
    this.controls = new ControlRequests((event) => {
      if (
        !child.stdin.writable ||
        child.exitCode !== null ||
        child.signalCode !== null
      )
        throw new Error("Claude transport closed");
      child.stdin.write(`${JSON.stringify(event)}\n`);
    }, this.controlTimeoutMs);
    this.lines = createInterface({ input: child.stdout });
    const connected = new Promise((resolve, reject) => {
      this.connectedResolve = resolve;
      this.connectedReject = reject;
    });
    // Attach immediately, including when initialize fails before this promise is awaited.
    connected.catch(() => {});
    const timer = setTimeout(
      () =>
        this.connectedReject(new Error("Remote Control connection timeout")),
      this.connectTimeoutMs,
    );
    this.lines.on("line", (line) => {
      let event;
      try {
        event = JSON.parse(line);
        if (
          !event ||
          typeof event !== "object" ||
          typeof event.type !== "string"
        )
          throw new Error();
      } catch {
        this.fault(new Error("Invalid Claude stream frame"));
        return;
      }
      this.controls.accept(event);
      if (
        event.type === "system" &&
        event.subtype === "bridge_state" &&
        event.state === "connected"
      ) {
        this.connectedResolve();
        this.remoteConnected = true;
      }
      if (
        event.type === "system" &&
        event.subtype === "bridge_state" &&
        !["connected", "ready"].includes(event.state)
      )
        this.remoteConnected = false;
      this.emit("event", event);
    });
    child.stdin.on("error", (error) => this.fault(error));
    child.stdout.on("error", (error) => this.fault(error));
    child.stderr.on("data", () => {
      /* Drain without exposing account/configuration information. */
    });
    child.on("error", (error) => this.fault(error));
    child.on("exit", () => this.fault(new Error("Claude transport exited")));
    try {
      this.initialized = await this.controls.request({ subtype: "initialize" });
      const mode = this.remoteOverride ?? remoteMode();
      if (mode === "off") {
        // No Remote Control request: the session only answers Blink and shows
        // nowhere in the account's list. Keep a known remote identity untouched.
        this.connectedResolve();
        this.remoteConnected = true;
        this.remote = {
          bridge_session_id: remoteId ?? null,
          session_url: null,
        };
        return this.remote;
      }
      const remote = await this.controls.request(enableRemote(remoteId, mode));
      if (
        !/^https:\/\/claude\.ai\/code\/[a-zA-Z0-9_-]+$/.test(
          remote.session_url ?? "",
        ) ||
        !/^cse_[a-zA-Z0-9]+$/.test(remote.bridge_session_id ?? "")
      )
        throw new Error("Remote Control did not return a valid session");
      if (remoteId && remote.bridge_session_id !== remoteId)
        throw Object.assign(new Error("Remote Control identity changed"), {
          code: "IDENTITY_CHANGED",
        });
      await connected;
      this.remote = remote;
      return remote;
    } catch (error) {
      await this.dispose();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  fault(error) {
    this.controls?.close();
    this.connectedReject?.(error);
    if (!this.disposing) this.emit("fault", error);
  }
  async send(turn, sessionId) {
    if (!this.remote || !this.remoteConnected)
      throw new Error("Remote Control must connect before sending");
    const frame = `${JSON.stringify(userMessage(turn, sessionId))}\n`;
    await new Promise((resolve, reject) =>
      this.child.stdin.write(frame, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
  async getSelection() {
    const settings = await this.controls.request({ subtype: "get_settings" });
    // Never forward effective settings, permissions, environment or local paths to a view.
    return { model: settings.applied?.model, effort: settings.applied?.effort };
  }
  async select({ model, effort }) {
    await this.controls.request({ subtype: "set_model", model });
    await this.controls.request({
      subtype: "apply_flag_settings",
      settings: { effortLevel: effort },
    });
    return this.getSelection();
  }
  stop() {
    return this.controls.request({ subtype: "interrupt" });
  }
  async dispose() {
    if (this.disposal) return this.disposal;
    this.disposing = true;
    this.abort.abort();
    this.controls?.close();
    this.connectedReject?.(new Error("Claude transport closed"));
    this.lines?.close();
    this.remote = undefined;
    this.remoteConnected = false;
    const child = this.child;
    this.disposal = (async () => {
      await this.versionCheck?.catch(() => {});
      const probe = this.versionCheck?.child;
      if (probe && probe.exitCode === null && probe.signalCode === null)
        await new Promise((resolve) => probe.once("exit", resolve));
      if (!child?.pid) return;
      const kill = async (signal) => {
        try {
          if (process.platform === "win32") {
            await promisify(execFile)(
              "taskkill",
              ["/PID", String(child.pid), "/T", "/F"],
              { windowsHide: true, timeout: 5000 },
            );
          } else process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== "ESRCH" && process.platform !== "win32")
            throw error;
        }
      };
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        await kill("SIGTERM");
        let timer;
        await Promise.race([
          exited,
          new Promise((resolve) => {
            timer = setTimeout(resolve, timing.killGrace);
          }),
        ]);
        clearTimeout(timer);
        await kill("SIGKILL"); // Also reap descendants if the parent exited first.
        if (child.exitCode === null && child.signalCode === null) await exited;
      } else await kill("SIGKILL");
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      this.child = undefined;
    })();
    return this.disposal;
  }
}
