// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { CaptureHistory } from "./history.js";
import { createExtensionZip } from "./extension-install.js";
import { PanelServer } from "./panel.js";

const panels: PanelServer[] = [];
const tempDirs: string[] = [];
const savedEnv = new Map<string, string | undefined>();
const setEnv = (key: string, value: string) => {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
  process.env[key] = value;
};

afterEach(async () => {
  await Promise.all(panels.splice(0).map((panel) => panel.close()));
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
});

function readZip(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString(
      "utf8",
      offset + 46,
      offset + 46 + nameLength,
    );
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "glimpselet-extension-download-"));
  tempDirs.push(root);
  const source = join(root, "packaged", "extension");
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, "manifest.json"),
    JSON.stringify({ manifest_version: 3, name: "Glimpselet fixture" }),
  );
  await writeFile(
    join(source, "background.js"),
    "self.packagedBuild = 'fixture';\n",
  );
  setEnv("HOME", join(root, "home"));
  setEnv("GLIMPSELET_EXTENSION_DIR", source);
  setEnv("GLIMPSELET_DISABLE_BROWSER_OPEN", "1");
  setEnv("GLIMPSELET_TEST_MODE", "1");
  delete process.env.SSH_CONNECTION;

  const panel = await new PanelServer(new CaptureHistory(), {
    panelDir: root,
  }).start();
  panels.push(panel);
  const guide = await panel.openExtensionGuide();
  const code = /#code=([A-F0-9]{16})/.exec(guide)?.[1];
  expect(code).toBeTruthy();
  return { panel, source, code: code! };
}

function requestRaw(
  panel: PanelServer,
  path: string,
  headers: Record<string, string> = {},
) {
  const address = new URL(panel.origin);
  return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: address.hostname,
        port: address.port,
        path,
        headers: { host: address.host, ...headers },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.once("error", reject);
    request.end();
  });
}

describe("local extension ZIP download", () => {
  it("archives only regular extension files and rejects symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "glimpselet-zip-unit-"));
    tempDirs.push(root);
    const source = join(root, "extension");
    await mkdir(source);
    await writeFile(join(source, "manifest.json"), '{"manifest_version":3}');
    await mkdir(join(source, "assets"));
    await writeFile(join(source, "assets", "icon.svg"), "<svg/>");

    const files = readZip(await createExtensionZip(source));
    expect([...files.keys()].sort()).toEqual([
      "assets/icon.svg",
      "manifest.json",
    ]);
    expect(files.get("manifest.json")?.toString()).toBe(
      '{"manifest_version":3}',
    );
    const secret = join(root, "private-runtime.json");
    await writeFile(secret, "must not be archived");
    await symlink(secret, join(source, "runtime.json"));
    await expect(createExtensionZip(source)).rejects.toThrow(/symbolic links/);
  });

  it("serves the packaged extension over HTTP only with the install nonce", async () => {
    const { panel, source, code } = await setup();
    const path = `/install/extension.zip?code=${code}`;
    const response = await fetch(`${panel.origin}${path}`, {
      headers: { origin: panel.origin },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(
      "glimpselet-extension.zip",
    );
    const archive = Buffer.from(await response.arrayBuffer());
    const files = readZip(archive);
    expect([...files.keys()].sort()).toEqual([
      "background.js",
      "manifest.json",
    ]);
    expect(files.get("manifest.json")).toEqual(
      await readFile(join(source, "manifest.json")),
    );
    expect(files.get("background.js")?.toString()).toBe(
      "self.packagedBuild = 'fixture';\n",
    );
    expect(archive.includes(Buffer.from("must not be archived"))).toBe(false);

    const missingNonce = await fetch(`${panel.origin}/install/extension.zip`);
    expect(missingNonce.status).toBe(401);
    const invalidOrigin = await fetch(`${panel.origin}${path}`, {
      headers: { origin: "http://attacker.invalid" },
    });
    expect(invalidOrigin.status).toBe(403);
    const traversal = await requestRaw(
      panel,
      `/install/extension.zip/%2e%2e/%2e%2e/private-runtime.json?code=${code}`,
    );
    expect(traversal.status).toBe(404);
    expect(traversal.body.toString()).not.toContain("must not be archived");
    const wrongHost = await requestRaw(panel, path, {
      host: "attacker.invalid",
    });
    expect(wrongHost.status).toBe(403);
  });
});
