import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, inflateRawSync } from "node:zlib";
import {
  mkdir,
  lstat,
  readFile,
  writeFile,
  rm,
  rename,
  readdir,
  chmod,
  symlink,
  readlink,
  realpath,
  open,
} from "node:fs/promises";
import { join, dirname, relative, isAbsolute, posix } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { selectBuild, verifyArchive } from "./launcher.mjs";

const digest = (data) => createHash("sha256").update(data).digest("hex");
const MAX_DOWNLOAD = 512 * 1024 * 1024;
const MAX_UNPACKED = 1536 * 1024 * 1024;
export const defaultInstallRoot = () =>
  process.platform === "win32"
    ? join(
        process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
        "Blinkling",
      )
    : process.platform === "darwin"
      ? join(
          homedir(),
          "Library",
          "Application Support",
          "Blinkling",
          "desktop",
        )
      : join(
          process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
          "blinkling",
          "desktop",
        );

export async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Unsafe cache directory (symlink)");
  if (process.platform !== "win32" && stat.uid !== process.getuid())
    throw new Error("Cache directory is owned by another user");
  await chmod(path, 0o700);
}
export async function atomicJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
export async function withLock(path, task, timeoutMs = 120_000) {
  const owner = { pid: process.pid, token: randomUUID() };
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const file = await open(path, "wx", 0o600);
      await file.writeFile(JSON.stringify(owner));
      await file.close();
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const stat = await lstat(path);
        if (stat.isSymbolicLink() || !stat.isFile())
          throw new Error("Unsafe install lock");
        const other = JSON.parse(await readFile(path, "utf8"));
        if (!Number.isSafeInteger(other.pid) || other.pid < 1)
          throw new Error("Invalid install lock");
        try {
          process.kill(other.pid, 0);
        } catch (e) {
          if (e.code === "ESRCH") {
            // Competing stale-lock recoveries must not unlink a new owner's lock.
            await withLock(
              `${path}.recovery`,
              async () => {
                try {
                  const candidate = JSON.parse(await readFile(path, "utf8"));
                  try {
                    process.kill(candidate.pid, 0);
                  } catch (probe) {
                    if (probe.code === "ESRCH") await rm(path);
                  }
                } catch (read) {
                  if (read.code !== "ENOENT") throw read;
                }
              },
              Math.max(1, deadline - Date.now()),
            );
            continue;
          }
        }
      } catch (e) {
        if (e.code === "ENOENT") continue;
        if (!(e instanceof SyntaxError)) throw e;
      }
      if (Date.now() >= deadline)
        throw new Error("Desktop install is still running. Try again shortly.");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const release = async () => {
    try {
      const current = JSON.parse(await readFile(path, "utf8"));
      if (current.token === owner.token) await rm(path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  };
  try {
    return await task();
  } finally {
    await release();
  }
}

function safePath(name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.includes(":")
  )
    throw new Error("Unsafe archive path");
  const parts = name.replace(/\/$/, "").split("/");
  if (isAbsolute(name) || parts.some((p) => !p || p === ".."))
    throw new Error("Unsafe archive path");
  const path = posix.normalize(name).replace(/\/$/, "");
  if (path === ".") return undefined;
  if (path.startsWith("../")) throw new Error("Unsafe archive path");
  return path;
}
function validateEntries(entries) {
  const paths = new Map();
  for (const entry of entries) {
    entry.name = safePath(entry.name);
    if (!entry.name) continue;
    if (paths.has(entry.name)) throw new Error("Duplicate archive path");
    paths.set(entry.name, entry);
    if (entry.type === "link") {
      if (
        !entry.link ||
        entry.link.includes("\\") ||
        entry.link.includes(":") ||
        entry.link.includes("\0") ||
        posix.isAbsolute(entry.link)
      )
        throw new Error("Unsafe archive link");
      const target = posix.normalize(
        posix.join(posix.dirname(entry.name), entry.link),
      );
      if (target === ".." || target.startsWith("../"))
        throw new Error("Archive link escapes installation");
    }
  }
  for (const entry of paths.values()) {
    for (
      let parent = posix.dirname(entry.name);
      parent !== ".";
      parent = posix.dirname(parent)
    ) {
      if (paths.has(parent) && paths.get(parent).type !== "directory")
        throw new Error("Archive path traverses a file or link");
    }
    if (entry.type === "link") {
      let target = posix.normalize(
        posix.join(posix.dirname(entry.name), entry.link),
      );
      const seen = new Set([entry.name]);
      for (let depth = 0; depth < 100; depth++) {
        const parts = target.split("/");
        const i = parts.findIndex(
          (_, i) => paths.get(parts.slice(0, i + 1).join("/"))?.type === "link",
        );
        if (i < 0) break;
        const key = parts.slice(0, i + 1).join("/");
        if (seen.has(key)) throw new Error("Cyclic archive link");
        seen.add(key);
        target = posix.normalize(
          posix.join(
            posix.dirname(key),
            paths.get(key).link,
            ...parts.slice(i + 1),
          ),
        );
        if (depth === 99) throw new Error("Archive link chain too long");
      }
      if (
        !paths.has(target) &&
        ![...paths.keys()].some((p) => p.startsWith(target + "/"))
      )
        throw new Error("Broken archive link");
    }
  }
  return [...paths.values()];
}
function tarNumber(bytes) {
  if (bytes[0] & 128) throw new Error("Unsupported archive numeric encoding");
  const text = bytes.toString("ascii").replace(/\0.*$/s, "").trim();
  if (text && !/^[0-7]+$/.test(text)) throw new Error("Invalid archive number");
  const n = parseInt(text || "0", 8);
  if (!Number.isSafeInteger(n)) throw new Error("Invalid archive size");
  return n;
}
function pax(data) {
  const fields = {};
  for (let offset = 0; offset < data.length; ) {
    const space = data.indexOf(32, offset);
    const size = Number(data.subarray(offset, space).toString());
    if (
      space < offset ||
      !Number.isSafeInteger(size) ||
      size <= space - offset + 1 ||
      offset + size > data.length
    )
      throw new Error("Invalid archive PAX record");
    const record = data.subarray(space + 1, offset + size - 1).toString("utf8");
    const equals = record.indexOf("=");
    fields[record.slice(0, equals)] = record.slice(equals + 1);
    offset += size;
  }
  return fields;
}
export function readArchive(
  bytes,
  type,
  { maxUnpackedBytes = MAX_UNPACKED } = {},
) {
  const entries = [];
  let total = 0;
  const add = (entry) => {
    total += entry.data?.length || 0;
    if (total > maxUnpackedBytes || entries.length >= 100_000)
      throw new Error("Archive exceeds unpacked size limit");
    entries.push(entry);
  };
  if (type === "tar.gz") {
    const data = gunzipSync(bytes, { maxOutputLength: maxUnpackedBytes });
    let fields = {},
      global = {},
      longName,
      longLink;
    let ended = false;
    for (let offset = 0; offset + 512 <= data.length; ) {
      const header = data.subarray(offset, offset + 512);
      if (header.every((b) => b === 0)) {
        ended = true;
        break;
      }
      const expected = tarNumber(header.subarray(148, 156));
      const sum = [...header].reduce(
        (n, b, i) => n + (i >= 148 && i < 156 ? 32 : b),
        0,
      );
      if (sum !== expected) throw new Error("Invalid archive header checksum");
      const size = tarNumber(header.subarray(124, 136));
      if (offset + 512 + size > data.length)
        throw new Error("Truncated archive");
      const content = data.subarray(offset + 512, offset + 512 + size);
      const text = (start, end) =>
        header.subarray(start, end).toString("utf8").replace(/\0.*$/s, "");
      const type = text(156, 157) || "0";
      offset += 512 + Math.ceil(size / 512) * 512;
      if (type === "x") {
        fields = pax(content);
        continue;
      }
      if (type === "g") {
        global = { ...global, ...pax(content) };
        continue;
      }
      if (type === "L") {
        longName = content.toString().replace(/\0.*$/s, "");
        continue;
      }
      if (type === "K") {
        longLink = content.toString().replace(/\0.*$/s, "");
        continue;
      }
      const attributes = { ...global, ...fields };
      if (attributes.size && Number(attributes.size) !== size)
        throw new Error("Unsupported archive PAX size");
      if (!["0", "2", "5"].includes(type))
        throw new Error("Unsupported archive entry type");
      add({
        name:
          attributes.path ||
          longName ||
          [text(345, 500), text(0, 100)].filter(Boolean).join("/"),
        type: type === "2" ? "link" : type === "5" ? "directory" : "file",
        mode: tarNumber(header.subarray(100, 108)) & 0o777,
        link: attributes.linkpath || longLink || text(157, 257),
        data: type === "0" ? content : undefined,
      });
      fields = {};
      longName = undefined;
      longLink = undefined;
    }
    if (!ended) throw new Error("Truncated archive terminator");
  } else if (type === "zip") {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
      if (
        bytes.readUInt32LE(i) === 0x06054b50 &&
        i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
      ) {
        end = i;
        break;
      }
    if (end < 0) throw new Error("Invalid ZIP archive");
    const count = bytes.readUInt16LE(end + 10),
      directorySize = bytes.readUInt32LE(end + 12);
    let offset = bytes.readUInt32LE(end + 16);
    if (
      bytes.readUInt32LE(end + 4) !== 0 ||
      count !== bytes.readUInt16LE(end + 8) ||
      count === 65535 ||
      offset + directorySize !== end
    )
      throw new Error("Unsupported ZIP archive layout");
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
        throw new Error("Invalid ZIP directory");
      const flags = bytes.readUInt16LE(offset + 8),
        method = bytes.readUInt16LE(offset + 10);
      const packed = bytes.readUInt32LE(offset + 20),
        size = bytes.readUInt32LE(offset + 24);
      const nameSize = bytes.readUInt16LE(offset + 28),
        extraSize = bytes.readUInt16LE(offset + 30),
        commentSize = bytes.readUInt16LE(offset + 32);
      const name = bytes
        .subarray(offset + 46, offset + 46 + nameSize)
        .toString("utf8");
      const mode = bytes.readUInt32LE(offset + 38) >>> 16,
        local = bytes.readUInt32LE(offset + 42);
      if (
        flags & 1 ||
        ![0, 8].includes(method) ||
        total + size > maxUnpackedBytes ||
        local + 30 > offset ||
        bytes.readUInt32LE(local) !== 0x04034b50
      )
        throw new Error("Invalid or oversized ZIP entry");
      const localNameSize = bytes.readUInt16LE(local + 26),
        localExtraSize = bytes.readUInt16LE(local + 28);
      if (
        bytes
          .subarray(local + 30, local + 30 + localNameSize)
          .toString("utf8") !== name ||
        bytes.readUInt16LE(local + 8) !== method
      )
        throw new Error("Mismatched ZIP entry");
      const start = local + 30 + localNameSize + localExtraSize;
      if (start + packed > offset) throw new Error("Truncated ZIP entry");
      const compressed = bytes.subarray(start, start + packed);
      const data =
        method === 8
          ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) })
          : compressed;
      if (data.length !== size) throw new Error("ZIP entry size mismatch");
      const kind = mode & 0o170000;
      if (kind && ![0o100000, 0o040000, 0o120000].includes(kind))
        throw new Error("Unsupported ZIP entry type");
      add({
        name,
        type:
          kind === 0o120000
            ? "link"
            : name.endsWith("/")
              ? "directory"
              : "file",
        mode: mode & 0o777 || (name.endsWith("/") ? 0o755 : 0o644),
        data,
        link: kind === 0o120000 ? data.toString("utf8") : undefined,
      });
      offset += 46 + nameSize + extraSize + commentSize;
    }
    if (offset !== end) throw new Error("Invalid ZIP directory length");
  } else throw new Error("Unsupported desktop archive type");
  return validateEntries(entries);
}

async function download(build, options, temporaryPath) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.downloadTimeoutMs ?? 120_000,
  );
  const limit = Math.min(
    options.maxDownloadBytes ?? MAX_DOWNLOAD,
    build.size ?? Infinity,
  );
  try {
    let url = build.url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await (options.fetch || fetch)(url, {
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(response.headers.get("location") || "", url);
        await response.body?.cancel();
        if (
          next.protocol !== "https:" ||
          next.username ||
          next.password ||
          next.port ||
          ![
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
          ].includes(next.hostname)
        )
          throw new Error("Invalid release redirect origin");
        url = next.href;
        continue;
      }
      if (!response.ok)
        throw new Error(`Desktop download failed (${response.status})`);
      if (Number(response.headers.get("content-length")) > limit)
        throw new Error("Desktop download exceeds size limit");
      const hash = createHash("sha256");
      let size = 0;
      if (!response.body) throw new Error("Empty desktop download");
      const reader = response.body.getReader();
      const file = await open(temporaryPath, "wx", 0o600);
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit)
            throw new Error("Desktop download exceeds size limit");
          hash.update(value);
          await file.writeFile(value);
        }
        if (build.size !== undefined && size !== build.size)
          throw new Error("Desktop download size differs from the release");
        if (hash.digest("hex") !== build.sha256)
          throw new Error("Desktop archive checksum mismatch");
        await file.sync();
      } finally {
        await file.close();
        await reader.cancel();
      }
      return;
    }
    throw new Error("Too many release redirects");
  } finally {
    clearTimeout(timer);
  }
}
function verifyExecutable(entries, build) {
  const path = safePath(build.entry);
  const entry = entries.find((e) => e.name === path && e.type === "file");
  if (!entry)
    throw new Error("Desktop archive is missing its executable entry");
  const data = entry.data;
  let matches = false;
  if (build.os === "linux")
    matches =
      data.length >= 20 &&
      data.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) &&
      data[4] === 2 &&
      data[5] === 1 &&
      data.readUInt16LE(18) === (build.arch === "arm64" ? 183 : 62) &&
      Boolean(entry.mode & 0o111);
  if (
    build.os === "win32" &&
    data.length >= 64 &&
    data.toString("ascii", 0, 2) === "MZ"
  ) {
    const pe = data.readUInt32LE(60);
    matches =
      pe + 6 <= data.length &&
      data.readUInt32LE(pe) === 0x4550 &&
      data.readUInt16LE(pe + 4) === (build.arch === "arm64" ? 0xaa64 : 0x8664);
  }
  if (build.os === "darwin" && data.length >= 8)
    matches =
      data.readUInt32LE(0) === 0xfeedfacf &&
      data.readUInt32LE(4) ===
        (build.arch === "arm64" ? 0x0100000c : 0x01000007) &&
      Boolean(entry.mode & 0o111);
  if (!matches)
    throw new Error("Desktop executable platform or architecture mismatch");
}
async function extract(entries, directory) {
  await privateDirectory(directory);
  for (const entry of entries.filter((e) => e.type !== "link")) {
    const path = join(directory, entry.name);
    await mkdir(dirname(path), { recursive: true, mode: 0o755 });
    if (entry.type === "directory")
      await mkdir(path, { recursive: true, mode: entry.mode || 0o755 });
    else
      await writeFile(path, entry.data, {
        flag: "wx",
        mode: entry.mode & 0o777,
      });
  }
  for (const entry of entries.filter((e) => e.type === "link")) {
    const path = join(directory, entry.name);
    await mkdir(dirname(path), { recursive: true, mode: 0o755 });
    await symlink(entry.link, path);
  }
}
async function cacheMatches(entries, directory) {
  try {
    if (!(await lstat(directory)).isDirectory()) return false;
    const expected = new Map(entries.map((e) => [e.name, e]));
    for (const entry of entries) {
      for (
        let parent = dirname(entry.name);
        parent !== ".";
        parent = dirname(parent)
      )
        expected.set(parent, expected.get(parent) || { type: "directory" });
    }
    const walk = async (path = "") => {
      for (const name of await readdir(join(directory, path))) {
        const key = path ? `${path}/${name}` : name,
          entry = expected.get(key);
        if (!entry) return false;
        const stat = await lstat(join(directory, key));
        if (entry.type === "link") {
          if (
            !stat.isSymbolicLink() ||
            (await readlink(join(directory, key))) !== entry.link
          )
            return false;
        } else if (entry.type === "directory") {
          if (!stat.isDirectory() || !(await walk(key))) return false;
        } else if (
          !stat.isFile() ||
          stat.size !== entry.data.length ||
          digest(await readFile(join(directory, key))) !== digest(entry.data) ||
          (process.platform !== "win32" && (stat.mode & 0o777) !== entry.mode)
        )
          return false;
        expected.delete(key);
      }
      return true;
    };
    return (await walk()) && expected.size === 0;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}
export async function installDesktop(manifest, options = {}) {
  const platform = options.platform || process.platform,
    arch = options.arch || process.arch;
  const build = selectBuild(manifest, platform, arch);
  if (
    manifest.schemaVersion !== 1 ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version) ||
    !["zip", "tar.gz", "file"].includes(build.archive) ||
    typeof build.entry !== "string"
  )
    throw new Error("Invalid pinned desktop manifest");
  safePath(build.entry);
  const root = options.root || defaultInstallRoot();
  await privateDirectory(root);
  for (const folder of ["archives", "versions"])
    await privateDirectory(join(root, folder));
  return withLock(join(root, "install.lock"), async () => {
    const archivePath = join(root, "archives", build.sha256);
    let bytes;
    try {
      const stat = await lstat(archivePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOWNLOAD)
        throw new Error("Unsafe cached archive");
      bytes = await readFile(archivePath);
      verifyArchive(bytes, build);
    } catch (error) {
      if (error.code !== "ENOENT") await rm(archivePath, { force: true });
      const temp = `${archivePath}.${randomUUID()}.tmp`;
      try {
        await download(build, options, temp);
        await rename(temp, archivePath);
        bytes = await readFile(archivePath);
      } finally {
        await rm(temp, { force: true });
      }
    }
    const entries =
      build.archive === "file"
        ? // An AppImage or portable executable is the program itself.
          [
            {
              name: safePath(build.entry),
              type: "file",
              data: bytes,
              mode: 0o755,
            },
          ]
        : readArchive(bytes, build.archive, options);
    verifyExecutable(entries, build);
    const directory = join(
      root,
      "versions",
      `${manifest.version}-${platform}-${arch}-${build.sha256.slice(0, 16)}`,
    );
    if (!(await cacheMatches(entries, directory))) {
      const staging = `${directory}.${randomUUID()}.staging`,
        previous = `${directory}.${randomUUID()}.previous`;
      try {
        await extract(entries, staging);
        if (platform === "darwin" && process.platform === "darwin") {
          const appName = build.entry
            .split("/")
            .findIndex((p) => p.endsWith(".app"));
          if (appName < 0)
            throw new Error("macOS release must contain an app bundle");
          const bundle = join(
            staging,
            ...build.entry.split("/").slice(0, appName + 1),
          );
          // Only the newly verified bundle; never unblock arbitrary user folders.
          await promisify(execFile)("/usr/bin/xattr", [
            "-dr",
            "com.apple.quarantine",
            bundle,
          ]).catch((e) => {
            if (!/No such xattr|No such attribute/.test(e.stderr || ""))
              throw e;
          });
          await promisify(execFile)("/usr/bin/codesign", [
            "--verify",
            "--deep",
            "--strict",
            bundle,
          ]);
        }
        try {
          await rename(directory, previous);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        try {
          await rename(staging, directory);
        } catch (e) {
          await rename(previous, directory).catch(() => {});
          throw e;
        }
        await rm(previous, { recursive: true, force: true });
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    const entry = await realpath(join(directory, build.entry));
    const rel = relative(directory, entry);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error("Executable escapes installation");
    return { entry, directory, root, version: manifest.version, build };
  });
}
