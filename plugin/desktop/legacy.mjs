// The product used to be called Glimpselet. This is the one place that still
// knows the old name: environment switches are read under it as a fallback for
// one more release, and a first start moves the old locations to the new ones.
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const OLD_PREFIX = "GLIMPSELET_";
const NEW_PREFIX = "BLINKLING_";

/** Make every GLIMPSELET_X switch available as BLINKLING_X unless the new name
 * is already set. The environment is changed in place and returned. */
export function adoptLegacyEnv(env = process.env) {
  for (const key of Object.keys(env)) {
    if (!key.startsWith(OLD_PREFIX)) continue;
    const next = NEW_PREFIX + key.slice(OLD_PREFIX.length);
    if (env[next] === undefined) env[next] = env[key];
  }
  return env;
}

/** Old location, new location and what lives there. */
export function legacyLocations({
  home = homedir(),
  platform = process.platform,
  env = process.env,
} = {}) {
  const config =
    platform === "win32"
      ? env.APPDATA || join(home, "AppData", "Roaming")
      : platform === "darwin"
        ? join(home, "Library", "Application Support")
        : env.XDG_CONFIG_HOME || join(home, ".config");
  const data =
    platform === "win32"
      ? env.LOCALAPPDATA || join(home, "AppData", "Local")
      : platform === "darwin"
        ? join(home, "Library", "Application Support")
        : env.XDG_DATA_HOME || join(home, ".local", "share");
  const pairs = [
    // Runtime state first: it is also where the marker below is written.
    [join(home, ".glimpselet"), join(home, ".blinkling"), "runtime"],
    [join(config, "Glimpselet"), join(config, "Blinkling"), "settings"],
    [
      join(home, "Glimpselet-extension"),
      join(home, "Blinkling-extension"),
      "extension",
    ],
    [
      join(home, "Documents", "Glimpselet Guides"),
      join(home, "Documents", "Blinkling Guides"),
      "guides",
    ],
  ];
  if (platform === "linux") {
    // The panel's window geometry lives in a lowercase folder on Linux.
    pairs.push([
      join(config, "glimpselet"),
      join(config, "blinkling"),
      "settings",
    ]);
    pairs.push([join(data, "glimpselet"), join(data, "blinkling"), "builds"]);
  } else if (platform === "win32") {
    pairs.push([join(data, "Glimpselet"), join(data, "Blinkling"), "builds"]);
    pairs.push([
      join(config, "glimpselet"),
      join(config, "blinkling"),
      "settings",
    ]);
  }
  return pairs;
}

const exists = (path) =>
  lstat(path).then(
    () => true,
    () => false,
  );

async function relocate(from, to, moved) {
  if (!(await exists(from))) return;
  if (!(await exists(to))) {
    await mkdir(dirname(to), { recursive: true });
    try {
      await rename(from, to);
    } catch (error) {
      if (!["EXDEV", "EPERM", "EACCES"].includes(error.code)) throw error;
      await cp(from, to, { recursive: true, verbatimSymlinks: true });
      await rm(from, { recursive: true, force: true });
    }
    moved.push({ from, to });
    return;
  }
  const [a, b] = await Promise.all([lstat(from), lstat(to)]);
  // Anything the new version already wrote wins; only the gaps are filled.
  if (!a.isDirectory() || !b.isDirectory()) return;
  for (const name of await readdir(from))
    await relocate(join(from, name), join(to, name), moved);
  await rmdir(from).catch(() => {});
}

/** Move settings, saved guides, the extension folder and cached builds from the
 * Glimpselet locations to the Blinkling ones, quietly and once. Nothing is ever
 * overwritten, and a failure on one location leaves the others to proceed. */
export async function migrateLegacyData({
  home = homedir(),
  platform = process.platform,
  env = process.env,
} = {}) {
  // An explicit runtime directory or an automated test run owns its own data.
  if (env.BLINKLING_RUNTIME_DIR || env.BLINKLING_E2E === "1")
    return { skipped: "explicit", moved: [], failed: [] };
  const marker = join(home, ".blinkling", "migrated.json");
  if (await exists(marker)) return { skipped: "done", moved: [], failed: [] };
  const moved = [],
    failed = [];
  for (const [from, to] of legacyLocations({ home, platform, env })) {
    try {
      await relocate(from, to, moved);
    } catch (error) {
      failed.push({ from, error: String(error.code ?? error.message) });
    }
  }
  // Stay silent when there was nothing to bring over, but still remember it:
  // a fresh install must not be mistaken for a v2 user on a later start.
  if (!failed.length) {
    try {
      await mkdir(dirname(marker), { recursive: true });
      await writeFile(
        marker,
        `${JSON.stringify({ at: new Date().toISOString(), moved })}\n`,
      );
    } catch {
      // Without the marker the next start only repeats a harmless check.
    }
  }
  return { moved, failed };
}

/** The marker's text, for tests and support. */
export async function migrationRecord(home = homedir()) {
  try {
    return JSON.parse(
      await readFile(join(home, ".blinkling", "migrated.json"), "utf8"),
    );
  } catch {
    return null;
  }
}
