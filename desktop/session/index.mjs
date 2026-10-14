import { promisify } from "node:util";
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import {
  assertClaudeVersion,
  ControlRequests,
  enableRemote,
  launchArguments,
  userMessage,
} from "./protocol.mjs";
/** Transport scaffold, intentionally not wired to UI until durable recovery is built.
 * Only this owned process writes the session; never --resume a live parent session.
 */
export class OwnedSession extends EventEmitter {
  async connect({
    cwd,
    sessionId,
    remoteId,
    model,
    effort,
    executable = "claude",
  }) {
    if (this.child) throw new Error("Session already started");
    const version = await promisify(execFile)(executable, ["--version"], {
      timeout: 10000,
      windowsHide: true,
    });
    assertClaudeVersion(version.stdout);
    const child = (this.child = spawn(
      executable,
      launchArguments({ sessionId, model, effort }),
      { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    ));
    this.controls = new ControlRequests((event) =>
      child.stdin.write(`${JSON.stringify(event)}\n`),
    );
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        this.controls.accept(event);
        this.emit("event", event);
      } catch {
        this.emit("fault", new Error("Invalid Claude stream frame"));
      }
    });
    child.stdin.on("error", (error) => this.emit("fault", error));
    child.stderr.on("data", () => {
      /* No raw credentials or local configuration in renderer logs. */
    });
    child.on("error", (error) => {
      this.controls.close();
      this.emit("fault", error);
    });
    child.on("exit", () => {
      this.controls.close();
      this.emit("event", { type: "status", state: "retrying" });
    });
    try {
      await this.controls.request({ subtype: "initialize" });
      this.remote = await this.controls.request(enableRemote(remoteId));
      if (!this.remote.session_url || !this.remote.bridge_session_id)
        throw new Error("Remote Control did not return a session");
      return this.remote;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  send(turn, sessionId) {
    if (!this.remote)
      throw new Error("Remote Control must connect before sending");
    this.child.stdin.write(`${JSON.stringify(userMessage(turn, sessionId))}\n`);
  }
  async select({ model, effort }) {
    await this.controls.request({ subtype: "set_model", model });
    await this.controls.request({
      subtype: "apply_flag_settings",
      settings: { effortLevel: effort },
    });
    const settings = await this.controls.request({ subtype: "get_settings" });
    return settings.applied;
  }
  stop() {
    return this.controls.request({ subtype: "interrupt" });
  }
  async dispose() {
    const child = this.child;
    if (!child) return;
    this.controls.close();
    this.lines.close();
    if (child.pid && child.exitCode === null && child.signalCode === null)
      await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
    this.child = undefined;
    this.remote = undefined;
  }
}
