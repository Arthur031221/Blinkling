import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  distributionMode,
  installExtension,
  extensionFolder,
  folderRevealCommand,
  installGuide,
  loadDistributionConfig,
  selectedStoreUrl,
} from "./extension-install.js";

describe("extension distribution and first-run guide", () => {
  it("defaults to unpacked and only selects validated store URLs", () => {
    expect(distributionMode()).toBe("unpacked");
    expect(extensionFolder().split("/").at(-1)).toBe("Blinkling-extension");
    const config = {
      chromeWebStoreUrl:
        "https://chromewebstore.google.com/detail/blinkling/abcdefgh",
      edgeAddonsUrl: "",
    };
    expect(distributionMode(config)).toBe("store");
    expect(selectedStoreUrl(config)).toBe(config.chromeWebStoreUrl);
    expect(installGuide("/x", config)).toContain(config.chromeWebStoreUrl);
    expect(installGuide("/x", config)).not.toContain(
      "turn on <strong>Developer mode",
    );
    expect(
      selectedStoreUrl({
        chromeWebStoreUrl: "javascript:alert(1)",
        edgeAddonsUrl: "",
      }),
    ).toBeUndefined();
    expect(
      selectedStoreUrl(
        {
          chromeWebStoreUrl: "",
          edgeAddonsUrl:
            "https://microsoftedge.microsoft.com/addons/detail/blinkling/id",
        },
        "edge",
      ),
    ).toContain("microsoftedge.microsoft.com");
  });

  it("escapes user paths and reveals folders with literal platform arguments", () => {
    const guide = installGuide('/tmp/<script>"&');
    expect(guide).toContain("&lt;script&gt;&quot;&amp;");
    expect(guide).not.toContain('/tmp/<script>"&');
    const folder = "/tmp/a folder $(touch nope)";
    expect(folderRevealCommand(folder, "darwin")).toEqual([
      "open",
      ["-R", folder],
    ]);
    expect(folderRevealCommand(folder, "linux")).toEqual([
      "xdg-open",
      [folder],
    ]);
    expect(folderRevealCommand(folder, "win32")).toEqual([
      "explorer.exe",
      [folder],
    ]);
  });

  it("loads only store URL fields from the one distribution file", async () => {
    const root = await mkdtemp(join(tmpdir(), "blinkling-dist-"));
    try {
      const file = join(root, "distribution.json");
      await writeFile(
        file,
        JSON.stringify({
          chromeWebStoreUrl: "https://chromewebstore.google.com/detail/name/id",
          edgeAddonsUrl: "",
          ignored: "x",
        }),
      );
      expect(loadDistributionConfig(file)).toEqual({
        chromeWebStoreUrl: "https://chromewebstore.google.com/detail/name/id",
        edgeAddonsUrl: "",
      });
      expect(loadDistributionConfig(join(root, "missing.json"))).toEqual({
        chromeWebStoreUrl: "",
        edgeAddonsUrl: "",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("selects the active browser store without extra installation steps", () => {
    const previous = process.env.BLINKLING_BROWSER;
    process.env.BLINKLING_BROWSER = "msedge";
    try {
      const guide = installGuide("/stable/path", {
        chromeWebStoreUrl:
          "https://chromewebstore.google.com/detail/blinkling/id",
        edgeAddonsUrl:
          "https://microsoftedge.microsoft.com/addons/detail/blinkling/id",
      });
      expect(guide).toContain(
        'href="https://microsoftedge.microsoft.com/addons/detail/blinkling/id"',
      );
      expect(guide).not.toContain('id="manager"');
      expect(guide).not.toContain("/stable/path");
    } finally {
      if (previous === undefined) delete process.env.BLINKLING_BROWSER;
      else process.env.BLINKLING_BROWSER = previous;
    }
  });

  it("copies an unpacked extension to a stable destination and rejects a missing manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "blinkling-install-"));
    try {
      const source = join(root, "build");
      const destination = join(root, ".blinkling", "extension");
      await mkdir(source);
      await writeFile(join(source, "manifest.json"), '{"manifest_version":3}');
      await writeFile(join(source, "background.js"), "// fixture");
      expect(await installExtension(source, destination)).toBe(destination);
      expect(await readFile(join(destination, "background.js"), "utf8")).toBe(
        "// fixture",
      );
      await expect(
        installExtension(join(root, "missing"), destination),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
