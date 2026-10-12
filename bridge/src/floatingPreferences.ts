import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type FloatingGeometry = {
  version: 1;
  dimensions: Partial<
    Record<
      "compact" | "expanded",
      Partial<Record<"pip" | "popup", { width: number; height: number }>>
    >
  >;
  popupPosition?: { left: number; top: number };
  popupChrome?: { width: number; height: number };
};

export const EMPTY_FLOATING_GEOMETRY: FloatingGeometry = {
  version: 1,
  dimensions: {},
};

const MAX_DIMENSION = 32_768;
const MAX_POSITION = 1_000_000;
const sizes = ["compact", "expanded"] as const;
const kinds = ["pip", "popup"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

/** Returns a detached canonical version-1 value, or undefined if malformed. */
export function normalizeFloatingGeometry(
  value: unknown,
): FloatingGeometry | undefined {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.dimensions))
    return undefined;

  const dimensions: FloatingGeometry["dimensions"] = {};
  for (const size of sizes) {
    const rawByKind = value.dimensions[size];
    if (rawByKind === undefined) continue;
    if (!isRecord(rawByKind)) return undefined;
    const byKind: NonNullable<FloatingGeometry["dimensions"][typeof size]> = {};
    for (const kind of kinds) {
      const rawDimension = rawByKind[kind];
      if (rawDimension === undefined) continue;
      if (
        !isRecord(rawDimension) ||
        !boundedNumber(rawDimension.width, Number.MIN_VALUE, MAX_DIMENSION) ||
        !boundedNumber(rawDimension.height, Number.MIN_VALUE, MAX_DIMENSION)
      )
        return undefined;
      byKind[kind] = {
        width: rawDimension.width,
        height: rawDimension.height,
      };
    }
    if (Object.keys(byKind).length) dimensions[size] = byKind;
  }

  let popupPosition: FloatingGeometry["popupPosition"];
  if (value.popupPosition !== undefined) {
    if (
      !isRecord(value.popupPosition) ||
      !boundedNumber(value.popupPosition.left, -MAX_POSITION, MAX_POSITION) ||
      !boundedNumber(value.popupPosition.top, -MAX_POSITION, MAX_POSITION)
    )
      return undefined;
    popupPosition = {
      left: value.popupPosition.left,
      top: value.popupPosition.top,
    };
  }

  let popupChrome: FloatingGeometry["popupChrome"];
  if (value.popupChrome !== undefined) {
    if (
      !isRecord(value.popupChrome) ||
      !boundedNumber(value.popupChrome.width, 0, MAX_DIMENSION) ||
      !boundedNumber(value.popupChrome.height, 0, MAX_DIMENSION)
    )
      return undefined;
    popupChrome = {
      width: value.popupChrome.width,
      height: value.popupChrome.height,
    };
  }

  return {
    version: 1,
    dimensions,
    ...(popupPosition ? { popupPosition } : {}),
    ...(popupChrome ? { popupChrome } : {}),
  };
}

export function defaultFloatingPreferencesPath(): string {
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "glimpselet", "floating-geometry-v1.json");
}

export class FloatingPreferences {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string | null) {}

  read(): Promise<FloatingGeometry> {
    const operation = this.operationQueue.then(() => this.readFile());
    this.operationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async readFile(): Promise<FloatingGeometry> {
    if (!this.path) return { version: 1, dimensions: {} };
    try {
      const beforeOpen = await lstat(this.path);
      if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile())
        return { version: 1, dimensions: {} };
      const file = await open(
        this.path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const info = await file.stat();
        if (
          !info.isFile() ||
          info.dev !== beforeOpen.dev ||
          info.ino !== beforeOpen.ino
        )
          return { version: 1, dimensions: {} };
        const raw = await file.readFile({ encoding: "utf8" });
        return (
          normalizeFloatingGeometry(JSON.parse(raw)) ?? {
            version: 1,
            dimensions: {},
          }
        );
      } finally {
        await file.close();
      }
    } catch {
      return { version: 1, dimensions: {} };
    }
  }

  write(value: FloatingGeometry): Promise<boolean> {
    if (!this.path) return Promise.resolve(false);
    const operation = this.operationQueue.then(() => this.writeFile(value));
    this.operationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async writeFile(value: FloatingGeometry): Promise<boolean> {
    const target = this.path!;
    const directory = dirname(target);
    let temporary: string | undefined;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        const targetInfo = await lstat(target);
        if (targetInfo.isSymbolicLink() || !targetInfo.isFile()) return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
      }
      temporary = join(
        directory,
        `.floating-geometry-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`,
      );
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(value), "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        const targetInfo = await lstat(target);
        if (targetInfo.isSymbolicLink() || !targetInfo.isFile()) return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
      }
      await rename(temporary, target);
      temporary = undefined;
      return true;
    } catch {
      return false;
    } finally {
      if (temporary) await unlink(temporary).catch(() => undefined);
    }
  }
}
