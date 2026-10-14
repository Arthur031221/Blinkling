import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
export class PositionStore {
  constructor(path) {
    this.path = path;
    this.positions = {};
    this.lastDisplay = null;
    this.pending = Promise.resolve();
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8"));
      if (
        value?.version === 1 &&
        value.positions &&
        typeof value.positions === "object" &&
        !Array.isArray(value.positions)
      ) {
        this.positions = value.positions;
        this.lastDisplay = value.lastDisplay;
      }
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error;
    }
    return this;
  }
  save(id, position) {
    this.positions[String(id)] = position;
    this.lastDisplay = String(id);
    const data = JSON.stringify({
      version: 1,
      positions: this.positions,
      lastDisplay: this.lastDisplay,
    });
    this.pending = this.pending
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = this.path + ".tmp";
        await writeFile(temporary, data, { mode: 0o600 });
        await rename(temporary, this.path);
      });
    return this.pending;
  }
}
