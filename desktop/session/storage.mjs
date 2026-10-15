import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export class SessionStore {
  constructor(userDataDir) {
    if (!userDataDir) throw new Error("OS user-data directory is required");
    this.directory = join(resolve(userDataDir), "session");
    this.file = join(this.directory, "state.json");
    this.lock = join(this.directory, "writer.lock");
    this.token = randomUUID();
    this.writes = Promise.resolve();
  }
  async acquire() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await mkdir(this.lock, { mode: 0o700 });
        // An incomplete lock is treated as live, not stolen while its owner writes it.
        await writeAtomic(join(this.lock, "owner.json"), {
          pid: process.pid,
          token: this.token,
        });
        this.held = true;
        return;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let owner;
        try {
          owner = JSON.parse(
            await readFile(join(this.lock, "owner.json"), "utf8"),
          );
        } catch {
          throw Object.assign(
            new Error("Session writer lock is initializing"),
            { code: "SESSION_LOCKED" },
          );
        }
        if (
          !Number.isSafeInteger(owner.pid) ||
          owner.pid <= 0 ||
          !isUUID(owner.token)
        )
          throw new Error("Invalid session writer lock");
        try {
          process.kill(owner.pid, 0);
        } catch (error) {
          if (error.code === "ESRCH") {
            // Rename before deletion so competing recoverers cannot remove a new lock.
            const recovery = `${this.lock}.recovering`;
            try {
              await mkdir(recovery, { mode: 0o700 });
            } catch (error) {
              if (error.code === "EEXIST")
                throw Object.assign(
                  new Error("Session writer recovery in progress"),
                  { code: "SESSION_LOCKED" },
                );
              throw error;
            }
            try {
              const current = JSON.parse(
                await readFile(join(this.lock, "owner.json"), "utf8"),
              );
              if (current.token === owner.token) {
                const stale = `${this.lock}.${owner.token}.stale`;
                await rename(this.lock, stale);
                await rm(stale, { recursive: true, force: true });
              }
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            } finally {
              await rm(recovery, { recursive: true, force: true });
            }
            continue;
          }
          if (error.code !== "EPERM") throw error;
        }
        throw Object.assign(
          new Error("Blinkling session already has a writer"),
          { code: "SESSION_LOCKED" },
        );
      }
    }
    throw new Error("Could not acquire session writer lock");
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (
        value.schema !== 1 ||
        !isUUID(value.localId) ||
        !Array.isArray(value.turns) ||
        !Array.isArray(value.messages) ||
        value.turns.some(
          (item) =>
            !item ||
            !isUUID(item.turn?.id) ||
            ![
              "queued",
              "dispatching",
              "accepted",
              "done",
              "interrupted",
              "uncertain",
              "cancelled",
            ].includes(item.state),
        ) ||
        value.messages.some(
          (message) =>
            !message ||
            message.type !== "message" ||
            typeof message.id !== "string" ||
            !["user", "assistant"].includes(message.role) ||
            !Array.isArray(message.content),
        )
      )
        throw new Error("Invalid saved Blinkling session");
      return revive(value);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw Object.assign(
        new Error("Invalid saved Blinkling session", { cause: error }),
        { code: "INVALID_STATE" },
      );
    }
  }
  save(state) {
    if (!this.held)
      return Promise.reject(new Error("Session writer lock is not held"));
    const value = persistable(state);
    const write = this.writes.then(() => writeAtomic(this.file, value));
    this.writes = write.catch(() => {});
    return write;
  }
  async release() {
    await this.writes;
    if (!this.held) return;
    const owner = JSON.parse(
      await readFile(join(this.lock, "owner.json"), "utf8"),
    );
    if (owner.token === this.token) await rm(this.lock, { recursive: true });
    this.held = false;
  }
}
async function writeAtomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    // The write-ahead fence must survive a crash of the OS, not only the process.
    if (process.platform !== "win32") {
      const directory = await open(dirname(file), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}
/** What reaches the disk (PV-2). Blinkling keeps no copy of anything it sends:
 * no pixels, no picked or answered text. Claude's own transcript is the only
 * record, and history is rebuilt from it on the next start. A turn that is
 * still waiting in the outbox keeps its typed text so it can go out after a
 * restart; a turn that carried pixels cannot, so it is marked and cancelled. */
export function persistable(state) {
  const value = structuredClone(state);
  value.turns = value.turns.map((item) => {
    const { id, source } = item.turn;
    const waiting = item.state === "queued";
    const pixels = !!item.turn.attachments?.length || item.turn.redacted;
    const turn = { id, source };
    if (waiting && !pixels) turn.text = item.turn.text;
    if (waiting && pixels) turn.redacted = true;
    const rest = { ...item };
    delete rest.turn;
    delete rest.digest;
    return { ...rest, turn };
  });
  value.messages = value.messages.map(({ type, id, role }) => ({
    type,
    id,
    role,
    content: [],
  }));
  return value;
}
/** Applied after load: a turn with no content cannot be sent. */
export function revive(state) {
  for (const item of state.turns) {
    item.turn.text ??= "";
    item.turn.attachments ??= [];
    if (item.turn.redacted && item.state === "queued") item.state = "cancelled";
  }
  return state;
}
export function isUUID(value) {
  return (
    typeof value === "string" &&
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
  );
}
export function transcriptPath(
  cwd,
  localId,
  configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
) {
  if (!isUUID(localId)) throw new Error("Invalid owned session ID");
  return join(
    configDir,
    "projects",
    resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-"),
    `${localId}.jsonl`,
  );
}
export async function readTranscript(cwd, localId) {
  let contents;
  try {
    contents = await readFile(transcriptPath(cwd, localId), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const lines = contents.split("\n");
  // A writer may have an unfinished last record. Never ignore corrupt complete records.
  if (lines.at(-1) !== "") lines.pop();
  return lines.filter(Boolean).map((line) => JSON.parse(line));
}
