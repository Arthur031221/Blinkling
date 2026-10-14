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
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, deflateRawSync, crc32 } from "node:zlib";
import { installDesktop, readArchive, withLock } from "./install.mjs";
import { launchDesktop } from "./launcher.mjs";
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
      platform: "linux",
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
      version: "3.0.1",
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
            platform,
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
