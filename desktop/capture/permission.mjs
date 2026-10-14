import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { aborted } from "./core.mjs";
export class IntentStore {
  constructor(path) {
    this.path = path;
  }
  async read() {
    try {
      const v = JSON.parse(await readFile(this.path, "utf8"));
      if (
        !["screen", "region", "guide", "auto-explain"].includes(v.kind) ||
        typeof v.displayId !== "string" ||
        !Number.isFinite(v.createdAt) ||
        Date.now() - v.createdAt > 86400000 ||
        !Number.isInteger(v.restarts) ||
        v.restarts < 0 ||
        v.restarts > 1
      )
        return null;
      return v;
    } catch (e) {
      if (e.code === "ENOENT" || e instanceof SyntaxError) return null;
      throw e;
    }
  }
  async write(intent) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(intent), { mode: 0o600 });
      await rename(temp, this.path);
    } finally {
      await rm(temp, { force: true });
    }
  }
  clear() {
    return rm(this.path, { force: true });
  }
}
export function permissionLabels(version) {
  const major = Number(String(version).split(".")[0]);
  return major >= 14
    ? {
        app: "System Settings",
        pane: "Privacy & Security",
        section: "Screen & System Audio Recording",
        control: "switch",
      }
    : major >= 13
      ? {
          app: "System Settings",
          pane: "Privacy & Security",
          section: "Screen Recording",
          control: "switch",
        }
      : {
          app: "System Preferences",
          pane: "Security & Privacy",
          section: "Screen Recording",
          control: "checkbox",
        };
}
/** OS adapters are injected; this state machine is also exercised across versions.
 * No automatic TCC reset, credential reads or attempts to grant consent. */
export class PermissionRecovery {
  constructor({
    status,
    request,
    showGuide,
    store,
    restart,
    restartAfterGrant = false,
    wait = (signal) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(done, 800);
        function done() {
          signal?.removeEventListener("abort", abort);
          resolve();
        }
        function abort() {
          clearTimeout(timer);
          reject(signal.reason);
        }
        signal?.addEventListener("abort", abort, { once: true });
      }),
  }) {
    Object.assign(this, {
      status,
      request,
      showGuide,
      store,
      restart,
      restartAfterGrant,
      wait,
    });
  }
  async ensure(intent, signal) {
    aborted(signal);
    if (this.status() === "granted") return false;
    await this.store.write(intent);
    // desktopCapturer triggers the one OS prompt; Electron's askForMediaAccess
    // supports camera/microphone, not Screen Recording.
    if (this.status() === "not-determined")
      await this.request().catch(() => {});
    aborted(signal);
    if (this.status() === "granted") return true;
    const guide = await this.showGuide(signal);
    try {
      while (this.status() !== "granted") {
        aborted(signal);
        await this.wait(signal);
      }
    } finally {
      guide.close();
    }
    return true;
  }
  async relaunch(intent) {
    await this.store.write({ ...intent, restarts: 1 });
    await this.restart();
    throw Object.assign(new Error("Capture will resume after restart"), {
      code: "CAPTURE_RESTARTING",
    });
  }
  async capture(task, intent, signal) {
    const newlyGranted = await this.ensure(intent, signal);
    // macOS may return a nonempty black thumbnail until the process restarts.
    // One automatic restart after a new grant avoids attaching that stale image.
    if (newlyGranted && this.restartAfterGrant && intent.restarts === 0)
      return this.relaunch(intent);
    try {
      const capture = await task();
      await this.store.clear();
      return capture;
    } catch (error) {
      aborted(signal);
      if (
        this.status() === "granted" &&
        error.code === "CAPTURE_UNAVAILABLE" &&
        intent.restarts === 0
      ) {
        return this.relaunch(intent);
      }
      throw error;
    }
  }
}
