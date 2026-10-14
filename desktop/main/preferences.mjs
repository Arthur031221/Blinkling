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

const valid = (p) =>
  p &&
  ["left", "right", "top", "bottom"].includes(p.edge) &&
  Number.isFinite(p.fraction) &&
  p.fraction >= 0 &&
  p.fraction <= 1;
export class PlacementStore {
  constructor(file) {
    this.file = file;
    this.positions = new Map();
    this.pending = Promise.resolve();
  }
  async load() {
    this.positions.clear();
    try {
      const saved = JSON.parse(await readFile(this.file, "utf8"));
      if (
        saved?.version === 1 &&
        saved.positions &&
        typeof saved.positions === "object"
      )
        for (const [id, p] of Object.entries(saved.positions))
          if (valid(p)) this.positions.set(id, p);
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error;
    }
  }
  get(id) {
    const p = this.positions.get(String(id));
    return p ? { ...p } : undefined;
  }
  async set(id, p) {
    if (!valid(p)) throw new Error("Invalid display placement");
    this.positions.set(String(id), { ...p });
    const contents = JSON.stringify({
      version: 1,
      positions: Object.fromEntries(this.positions),
    });
    const save = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + ".tmp", contents, { mode: 0o600 });
      await rename(this.file + ".tmp", this.file);
    };
    const next = this.pending.then(save, save);
    this.pending = next;
    await next;
  }
}
