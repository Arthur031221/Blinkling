import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  symlink,
  readdir,
  stat,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, deflateRawSync, crc32 } from "node:zlib";
import {
  installDesktop,
  readArchive,
  withLock,
  treeFingerprint,
} from "./install.mjs";
import { launchDesktop, verifyInstalled } from "./launcher.mjs";
import { startDesktopHost } from "./host.mjs";
import { EventEmitter } from "node:events";

// Real tar records: parsing and extraction operate on bytes, not mocked listings.
export function tar(entries) {
  const records = [];
  for (const {
    name,
    data = Buffer.alloc(0),
    type = "0",
    link = "",
    mode = 0o755,
  } of entries) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write(mode.toString(8).padStart(7, "0") + "\0", 100);
    header.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write(link, 157, 100);
    header.write("ustar\0", 257);
    header.write(
      [...header]
        .reduce((a, b) => a + b, 0)
        .toString(8)
        .padStart(6, "0") + "\0 ",
      148,
    );
    records.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...records, Buffer.alloc(1024)]));
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const elf = Buffer.alloc(64);
elf.write("\x7fELF", 0, "binary");
elf[4] = 2;
elf[5] = 1;
elf.writeUInt16LE(62, 18);
const archive = tar([
  { name: "app/blink", data: elf },
  { name: "app/resources/data", data: Buffer.from("original") },
]);
const manifest = {
  schemaVersion: 1,
  version: "3.0.0",
  builds: [
    {
      os: "linux",
      arch: "x64",
      url: "https://github.com/Arthur031221/Glimpselet/releases/download/v3.0.0/linux.tar.gz",
      sha256: sha(archive),
      archive: "tar.gz",
      entry: "app/blink",
    },
  ],
};

test("installs a pinned archive atomically, verifies cache bytes, and repairs a damaged cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-install-"));
  let downloads = 0;
  const options = {
    root,
    platform: "linux",
    arch: "x64",
    fetch: async () => {
      downloads++;
      return new Response(archive);
    },
  };
  try {
    const first = await installDesktop(manifest, options);
    assert.equal(
      await readFile(join(first.directory, "app/resources/data"), "utf8"),
      "original",
    );
    assert.equal((await installDesktop(manifest, options)).entry, first.entry);
    assert.equal(downloads, 1);
    await writeFile(join(first.directory, "app/resources/data"), "damaged");
    await installDesktop(manifest, options);
    assert.equal(
      await readFile(join(first.directory, "app/resources/data"), "utf8"),
      "original",
    );
    assert.equal(downloads, 1, "repair reuses the verified archive");
    await rm(join(first.directory, "app/resources/data"));
    await symlink("/etc/passwd", join(first.directory, "app/resources/data"));
    await installDesktop(manifest, options);
    assert.equal(
      await readFile(join(first.directory, "app/resources/data"), "utf8"),
      "original",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("serializes concurrent installs and refuses corrupt downloads without replacing an earlier build", async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-install-"));
  let downloads = 0;
  const options = {
    root,
    platform: "linux",
    arch: "x64",
    fetch: async () => {
      downloads++;
      await new Promise((r) => setTimeout(r, 50));
      return new Response(archive);
    },
  };
  try {
    const installs = await Promise.all([
      installDesktop(manifest, options),
      installDesktop(manifest, options),
    ]);
    assert.equal(installs[0].entry, installs[1].entry);
    assert.equal(downloads, 1);
    const next = {
      ...manifest,
      version: "3.2.2",
      builds: [{ ...manifest.builds[0], sha256: "a".repeat(64) }],
    };
    await assert.rejects(installDesktop(next, options), /checksum/);
    assert.deepEqual(await readFile(installs[0].entry), elf);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("streams release bytes into a private temporary file before promoting the verified archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-stream-install-"));
  let chunks = 0;
  const split = Math.floor(archive.length / 2);
  try {
    await installDesktop(manifest, {
      root,
      platform: "linux",
      arch: "x64",
      fetch: async () =>
        new Response(
          new ReadableStream(
            {
              async pull(controller) {
                if (chunks++ === 0)
                  controller.enqueue(archive.subarray(0, split));
                else {
                  const files = await readdir(join(root, "archives"));
                  assert.equal(files.length, 1);
                  assert.match(files[0], /\.tmp$/);
                  const partial = join(root, "archives", files[0]);
                  assert.deepEqual(
                    await readFile(partial),
                    archive.subarray(0, split),
                  );
                  if (process.platform !== "win32")
                    assert.equal((await stat(partial)).mode & 0o777, 0o600);
                  controller.enqueue(archive.subarray(split));
                  controller.close();
                }
              },
            },
            { highWaterMark: 0 },
          ),
        ),
    });
    assert.deepEqual(await readdir(join(root, "archives")), [sha(archive)]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses traversal, escaping links, link parents, duplicate paths and wrong CPU executables", async () => {
  for (const entries of [
    [{ name: "../escape", data: elf }],
    [{ name: "/escape", data: elf }],
    [{ name: "C:/escape", data: elf }],
    [{ name: "app/link", type: "2", link: "../../escape" }],
    [
      { name: "app/link", type: "2", link: "data" },
      { name: "app/link/escape", data: elf },
    ],
    [
      { name: "app/data", data: elf },
      { name: "app/data", data: elf },
    ],
  ])
    assert.throws(
      () => readArchive(tar(entries), "tar.gz"),
      /archive|path|link/i,
    );
  const root = await mkdtemp(join(tmpdir(), "glimpse-install-"));
  const wrong = Buffer.from(elf);
  wrong.writeUInt16LE(183, 18);
  const bytes = tar([{ name: "app/blink", data: wrong }]);
  try {
    await assert.rejects(
      installDesktop(
        {
          ...manifest,
          builds: [{ ...manifest.builds[0], sha256: sha(bytes) }],
        },
        {
          root,
          platform: "linux",
          arch: "x64",
          fetch: async () => new Response(bytes),
        },
      ),
      /architecture/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounds downloads and decompression, rejects redirects away from release infrastructure and symlinked caches", async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-install-"));
  try {
    await assert.rejects(
      installDesktop(manifest, {
        root,
        platform: "linux",
        arch: "x64",
        maxDownloadBytes: 4,
        fetch: async () => new Response(archive),
      }),
      /size/,
    );
    await assert.rejects(
      installDesktop(manifest, {
        root,
        platform: "linux",
        arch: "x64",
        fetch: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.test/binary" },
          }),
      }),
      /redirect|origin/,
    );
    assert.throws(
      () => readArchive(archive, "tar.gz", { maxUnpackedBytes: 4 }),
      /size|length|large/i,
    );
    await mkdir(join(root, "versions"), { recursive: true });
    await rm(join(root, "archives"), { recursive: true });
    await symlink("/tmp", join(root, "archives"));
    await assert.rejects(
      installDesktop(manifest, { root, platform: "linux", arch: "x64" }),
      /symlink|directory/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function zip(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const { name, data, mode = 0o100755 } of entries) {
    const filename = Buffer.from(name),
      packed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, packed);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(0x0314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE((mode << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, filename);
    offset += local.length + filename.length + packed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("extracts native ZIP formats for both CPUs and validates safe framework links", async () => {
  for (const platform of ["darwin", "win32"])
    for (const arch of ["arm64", "x64"]) {
      const root = await mkdtemp(join(tmpdir(), "glimpse-zip-"));
      const executable = Buffer.alloc(256);
      if (platform === "darwin") {
        executable.writeUInt32LE(0xfeedfacf);
        executable.writeUInt32LE(arch === "arm64" ? 0x0100000c : 0x01000007, 4);
      } else {
        executable.write("MZ");
        executable.writeUInt32LE(128, 60);
        executable.writeUInt32LE(0x4550, 128);
        executable.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, 132);
      }
      const entry =
        platform === "darwin"
          ? "Blinkling.app/Contents/MacOS/Blinkling"
          : "app/Blinkling.exe";
      const bytes = zip([
        { name: entry, data: executable },
        {
          name: "app/resources/Versions/A/framework",
          data: Buffer.from("framework"),
        },
        {
          name: "app/resources/Current",
          data: Buffer.from("Versions/A"),
          mode: 0o120777,
        },
      ]);
      const pinned = {
        ...manifest,
        builds: [
          {
            ...manifest.builds[0],
            os: platform,
            arch,
            archive: "zip",
            entry,
            sha256: sha(bytes),
          },
        ],
      };
      try {
        if (platform === "darwin" && process.platform === "darwin") {
          // Synthetic Mach-O headers are deliberately unsigned; the real native
          // signature gate must reject them. ZIP paths/links are still parsed.
          assert.equal(readArchive(bytes, "zip").length, 3);
          await assert.rejects(
            installDesktop(pinned, {
              root,
              platform,
              arch,
              fetch: async () => new Response(bytes),
            }),
            /codesign/,
          );
          continue;
        }
        const result = await installDesktop(pinned, {
          root,
          platform,
          arch,
          fetch: async () => new Response(bytes),
        });
        assert.deepEqual(await readFile(result.entry), executable);
        assert.equal(
          await readFile(
            join(result.directory, "app/resources/Current/framework"),
            "utf8",
          ),
          "framework",
        );
        assert.throws(
          () =>
            readArchive(zip([{ name: "../escape", data: executable }]), "zip"),
          /path/,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
});

test("recovers a dead install lock, bounds live lock waiting and releases after failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-lock-"));
  const path = join(root, "install.lock");
  try {
    await writeFile(path, JSON.stringify({ pid: 2147483647, token: "dead" }));
    assert.equal(await withLock(path, async () => "recovered"), "recovered");
    await assert.rejects(
      withLock(path, async () => {
        throw new Error("extract failed");
      }),
      /extract failed/,
    );
    assert.equal(await withLock(path, async () => "released"), "released");
    await writeFile(path, JSON.stringify({ pid: process.pid, token: "live" }));
    await assert.rejects(
      withLock(path, async () => "unsafe", 20),
      /still running/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed desktop startup preserves the current release and terminates only its own child", async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-start-failure-"));
  const runtime = join(root, "runtime");
  const pointer = join(root, "current.json");
  const previous = { version: "2.9.0", entry: "preserved" };
  await writeFile(pointer, JSON.stringify(previous));
  let killed = 0;
  const child = new EventEmitter();
  child.unref = () => {};
  child.kill = () => {
    killed++;
  };
  try {
    await assert.rejects(
      launchDesktop({
        root,
        runtime,
        platform: "linux",
        arch: "x64",
        manifest,
        fetch: async () => new Response(archive),
        startTimeoutMs: 1,
        spawn: () => child,
      }),
      /did not finish starting/,
    );
    assert.equal(killed, 1);
    assert.deepEqual(JSON.parse(await readFile(pointer)), previous);
    await assert.rejects(readFile(join(runtime, "enabled.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const oldAddress =
  "https://github.com/Arthur031221/Glimpselet/releases/download/v3.0.0/Blinkling-3.0.0-linux-x64.AppImage";
const newAddress = oldAddress.replace("/Glimpselet/", "/Blinkling/");
const storage =
  "https://release-assets.githubusercontent.com/github-production-release-asset/1/x";
const appImage = Buffer.concat([elf, Buffer.from("squashfs")]);
const single = (extra = {}) => ({
  schemaVersion: 1,
  version: "3.0.0",
  builds: [
    {
      os: "linux",
      arch: "x64",
      url: oldAddress,
      sha256: sha(appImage),
      size: appImage.length,
      archive: "file",
      entry: "Blinkling-3.0.0-linux-x64.AppImage",
      ...extra,
    },
  ],
});

test("a single-file build such as an AppImage installs executable and follows the old address through GitHub's redirects", async () => {
  const root = await mkdtemp(join(tmpdir(), "blinkling-file-"));
  const requested = [];
  try {
    const installed = await installDesktop(single(), {
      root,
      platform: "linux",
      arch: "x64",
      fetch: async (url) => {
        requested.push(url);
        if (url === oldAddress)
          return new Response(null, {
            status: 301,
            headers: { location: newAddress },
          });
        if (url === newAddress)
          return new Response(null, {
            status: 302,
            headers: { location: storage },
          });
        return new Response(appImage, {
          headers: { "content-length": String(appImage.length) },
        });
      },
    });
    assert.deepEqual(requested, [oldAddress, newAddress, storage]);
    assert.deepEqual(await readFile(installed.entry), appImage);
    // Windows files have no execute bit; the extension decides there.
    if (process.platform !== "win32")
      assert.ok((await stat(installed.entry)).mode & 0o100, "owner can run it");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the published size is enforced and a wrong or oversized single file is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "blinkling-size-"));
  const options = (body) => ({
    root,
    platform: "linux",
    arch: "x64",
    fetch: async () => new Response(body),
  });
  try {
    await assert.rejects(
      installDesktop(single({ size: appImage.length - 1 }), options(appImage)),
      /size/,
    );
    await assert.rejects(
      installDesktop(
        single({ entry: "../Blinkling.AppImage" }),
        options(appImage),
      ),
      /Unsafe/,
    );
    const notNative = Buffer.from("#!/bin/sh\n");
    await assert.rejects(
      installDesktop(
        single({ sha256: sha(notNative), size: notNative.length }),
        options(notNative),
      ),
      /mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function spawned(sandboxFacts, build = {}) {
  const root = await mkdtemp(join(tmpdir(), "blinkling-args-"));
  let call;
  const child = new EventEmitter();
  child.unref = () => {};
  child.kill = () => {};
  try {
    await launchDesktop({
      root,
      runtime: join(root, "runtime"),
      platform: "linux",
      arch: "x64",
      manifest: single(build),
      fetch: async () => new Response(appImage),
      startTimeoutMs: 1,
      sandboxFacts,
      args: ["--hidden"],
      spawn: (entry, args, options) => {
        call = { entry, args, env: options.env };
        return child;
      },
    }).catch(() => undefined);
    return call;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("the launcher adds --no-sandbox only when the machine cannot sandbox and unpacks AppImages itself", async () => {
  const blocked = await spawned({
    platform: "linux",
    userns: "apparmor",
    helper: "none",
  });
  assert.deepEqual(blocked.args, ["--no-sandbox", "--hidden"]);
  assert.equal(blocked.env.APPIMAGE_EXTRACT_AND_RUN, "1");
  const open = await spawned({
    platform: "linux",
    userns: "open",
    helper: "none",
  });
  assert.deepEqual(open.args, ["--hidden"]);
  const helper = await spawned({
    platform: "linux",
    userns: "apparmor",
    helper: "setuid root",
  });
  assert.deepEqual(helper.args, ["--hidden"]);
});

test("a Windows install removes any Zone.Identifier stream from the extracted exe", async () => {
  const root = await mkdtemp(join(tmpdir(), "blinkling-motw-"));
  const exe = Buffer.alloc(256);
  exe.write("MZ");
  exe.writeUInt32LE(128, 60);
  exe.writeUInt32LE(0x4550, 128);
  exe.writeUInt16LE(0x14c, 132); // the portable build's 32-bit launcher stub
  const unlinked = [];
  try {
    const installed = await installDesktop(
      {
        schemaVersion: 1,
        version: "3.0.0",
        builds: [
          {
            os: "win32",
            arch: "x64",
            url: "https://github.com/Arthur031221/Blinkling/releases/download/v3.0.0/Blinkling-3.0.0-win-x64.exe",
            sha256: sha(exe),
            size: exe.length,
            archive: "file",
            entry: "Blinkling-3.0.0-win-x64.exe",
          },
        ],
      },
      {
        root,
        platform: "win32",
        arch: "x64",
        fetch: async () => new Response(exe),
        unlink: async (path) => {
          unlinked.push(path);
          throw Object.assign(new Error("no stream"), { code: "ENOENT" });
        },
      },
    );
    assert.equal(unlinked.length, 1);
    assert.ok(
      unlinked[0].endsWith("Blinkling-3.0.0-win-x64.exe:Zone.Identifier"),
    );
    assert.ok(installed.entry.endsWith("Blinkling-3.0.0-win-x64.exe"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const freshRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "glimpse-fast-"));
  let downloads = 0;
  const options = {
    root,
    platform: "linux",
    arch: "x64",
    fetch: async () => {
      downloads++;
      return new Response(archive);
    },
  };
  return { root, options, downloads: () => downloads };
};
const archiveFile = (root) => join(root, "archives", manifest.builds[0].sha256);

test("a build verified once is trusted by its fingerprint: the next start reads no archive and downloads nothing", async () => {
  const { root, options, downloads } = await freshRoot();
  try {
    const first = await installDesktop(manifest, options);
    assert.equal(first.fast, undefined, "the first install is the full one");
    // Without the archive, only the fingerprint can vouch for the tree.
    await rm(archiveFile(root));
    const second = await installDesktop(manifest, options);
    assert.equal(second.fast, true);
    assert.equal(second.entry, first.entry);
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal(downloads(), 1);
    // Touching the tree withdraws the trust: it is verified and repaired again.
    await writeFile(join(first.directory, "app/resources/data"), "damaged");
    const third = await installDesktop(manifest, options);
    assert.equal(third.fast, undefined);
    assert.equal(downloads(), 2);
    assert.equal(
      await readFile(join(first.directory, "app/resources/data"), "utf8"),
      "original",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the full check behind a started Blink catches what the fingerprint cannot, and withdraws the trust without touching the tree", async () => {
  const { root, options, downloads } = await freshRoot();
  try {
    const first = await installDesktop(manifest, options);
    const data = join(first.directory, "app/resources/data");
    const { atime, mtime } = await stat(data);
    // Same size, same mtime: only reading the bytes can tell.
    await writeFile(data, "ORIGINAL");
    await utimes(data, atime, mtime);
    assert.equal(
      await treeFingerprint(first.directory),
      first.fingerprint,
      "the fingerprint is blind to it",
    );
    assert.equal((await installDesktop(manifest, options)).fast, true);
    await assert.rejects(
      installDesktop(manifest, { ...options, full: true }),
      /does not match/,
    );
    assert.equal(
      await readFile(data, "utf8"),
      "ORIGINAL",
      "a running Blink's files are not replaced underneath it",
    );
    assert.equal(downloads(), 1);
    // The next start has no trust left and repairs the tree.
    const next = await installDesktop(manifest, options);
    assert.equal(next.fast, undefined);
    assert.equal(await readFile(data, "utf8"), "original");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the full check never downloads: with no cached archive it stands down", async () => {
  const { root, options, downloads } = await freshRoot();
  try {
    await installDesktop(manifest, options);
    await rm(archiveFile(root));
    assert.deepEqual(
      await installDesktop(manifest, { ...options, full: true }),
      { skipped: true },
    );
    assert.equal(downloads(), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a start on an installed build does not wait for the archive: Blink is up, and the full check is left for afterwards", async () => {
  const { root, options } = await freshRoot();
  const runtime = join(root, "runtime");
  const hosts = [];
  const spawnBlink = () => {
    const child = new EventEmitter();
    child.unref = () => {};
    child.kill = () => {};
    startDesktopHost({
      directory: runtime,
      descriptor: join(runtime, "desktop.json"),
      version: "3.0.0",
    }).then((host) => hosts.push(host));
    return child;
  };
  try {
    await installDesktop(manifest, options);
    await rm(archiveFile(root));
    const failing = {
      ...options,
      runtime,
      manifest,
      spawn: spawnBlink,
      fetch: async () => {
        throw new Error("the archive must not be needed");
      },
    };
    const began = performance.now();
    const result = await launchDesktop({ ...failing, deferVerification: true });
    const took = performance.now() - began;
    assert.equal(result.alreadyRunning, false);
    assert.equal(result.verifyLater, true);
    assert.ok(!Object.keys(result).includes("verifyLater"));
    assert.ok(took < 1000, `took ${took} ms`);
    // The check itself, run apart from the start, finds the tree sound or
    // stands down for want of an archive; it never throws into the session.
    assert.equal(await verifyInstalled({ ...failing, runtime }), true);
  } finally {
    await Promise.all(hosts.map((h) => h.close()));
    await rm(root, { recursive: true, force: true });
  }
});
