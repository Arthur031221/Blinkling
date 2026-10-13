import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  distributionMode,
  INSTALL_GUIDE_SCRIPT,
  installExtension,
  installGuide,
  loadDistributionConfig,
  selectedStoreUrl,
  tunnelCommand,
} from "./extension-install.js";

describe("extension distribution and first-run guide", () => {
  it("defaults to unpacked and only selects validated store URLs", () => {
    expect(distributionMode()).toBe("unpacked");
    expect(installGuide("/home/test/.glimpselet/extension")).toContain(
      "Developer mode",
    );
    const config = {
      chromeWebStoreUrl:
        "https://chromewebstore.google.com/detail/glimpselet/abcdefgh",
      edgeAddonsUrl: "",
    };
    expect(distributionMode(config)).toBe("store");
    expect(selectedStoreUrl(config)).toBe(config.chromeWebStoreUrl);
    expect(installGuide("/x", config)).toContain("Add to browser");
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
            "https://microsoftedge.microsoft.com/addons/detail/glimpselet/id",
        },
        "edge",
      ),
    ).toContain("microsoftedge.microsoft.com");
  });

  it("escapes the stable path and renders a single-language beginner guide", () => {
    const guide = installGuide('/tmp/<script>"&');
    expect(guide).toContain("&lt;script&gt;&quot;&amp;");
    expect(guide).not.toContain('/tmp/<script>"&');
    expect(guide).toContain('aria-live="polite"');
    expect(guide).toContain('id="language"');
    expect(guide).toContain("data-en=");
    expect(guide).toContain("data-zh=");
    expect(guide).not.toContain("English / 繁體中文");
    expect(guide).toContain('id="replay"');
    expect(guide).toContain('id="progress"');
    expect(guide).toContain('id="tunnel-command"');
    expect(guide).toContain("Copy SSH command");
    expect(guide).toContain("Glimpselet is ready when you are.");
    expect(guide).not.toContain("Blink is ready when you are.");
    expect(guide).toContain("Click Pair extension in the browser window");
    expect(INSTALL_GUIDE_SCRIPT).toContain("glimpselet-install-tour-v1");
    expect(INSTALL_GUIDE_SCRIPT).toContain("glimpselet-welcome-sample.html");
    expect(INSTALL_GUIDE_SCRIPT).toContain("titles:[");
    expect(INSTALL_GUIDE_SCRIPT).toContain("descs:[");
    expect(INSTALL_GUIDE_SCRIPT).toContain("/install/status?code=");
    expect(INSTALL_GUIDE_SCRIPT).toContain("/install/try?code=");
    expect(INSTALL_GUIDE_SCRIPT).toContain("method:'POST'");
    expect(INSTALL_GUIDE_SCRIPT).toContain("glimpselet:tutorial-action");
    expect(INSTALL_GUIDE_SCRIPT).toContain("glimpselet:tutorial:done");
    expect(INSTALL_GUIDE_SCRIPT).toContain("result.tunnelCommand");
    expect(INSTALL_GUIDE_SCRIPT).toContain("copy-tunnel");
    expect(INSTALL_GUIDE_SCRIPT).toContain("copyTunnelFail");
    expect(INSTALL_GUIDE_SCRIPT).toContain("tryStarted");
    expect(INSTALL_GUIDE_SCRIPT).toContain("extensionReady");
    expect(INSTALL_GUIDE_SCRIPT).not.toContain("autoPairing");
    expect(INSTALL_GUIDE_SCRIPT).toContain("pair-controls').hidden=true");
    expect(() => new Function(INSTALL_GUIDE_SCRIPT)).not.toThrow();
  });

  it("uses the validated SSH server port while preserving default and IPv6 commands", () => {
    expect(
      tunnelCommand(37115, {
        SSH_CONNECTION: "192.0.2.4 41000 10.0.0.3 22",
        GLIMPSELET_SSH_USER: "reader",
      }),
    ).toBe("ssh -N -L 37115:127.0.0.1:37115 reader@10.0.0.3");
    expect(
      tunnelCommand(37115, {
        SSH_CONNECTION: "192.0.2.4 41000 10.0.0.3 46797",
        GLIMPSELET_SSH_USER: "reader",
      }),
    ).toBe("ssh -N -p 46797 -L 37115:127.0.0.1:37115 reader@10.0.0.3");
    expect(
      tunnelCommand(37115, {
        SSH_CONNECTION: "192.0.2.4 41000 2001:db8::3 46797",
        GLIMPSELET_SSH_USER: "reader",
        GLIMPSELET_SSH_PORT: "5522",
      }),
    ).toBe("ssh -N -p 5522 -L 37115:127.0.0.1:37115 reader@[2001:db8::3]");
    for (const invalid of ["0", "65536", "22;touch", "abc"]) {
      expect(
        tunnelCommand(37115, {
          SSH_CONNECTION: "1 2 host.example 46797",
          GLIMPSELET_SSH_PORT: invalid,
        }),
      ).toBeUndefined();
    }
  });

  it("uses the fixture message actions for all eight hands-on steps", async () => {
    const fixture = await readFile(
      join(process.cwd(), "public/assets/glimpselet-welcome-sample.html"),
      "utf8",
    );
    expect(fixture).toContain(
      '<script src="/assets/glimpselet-welcome-sample.js"></script>',
    );
    expect(fixture).not.toContain("<script>");
    const fixtureScript = await readFile(
      join(process.cwd(), "public/assets/glimpselet-welcome-sample.js"),
      "utf8",
    );
    for (const action of [
      "float",
      "capture",
      "suggest",
      "passive",
      "guide",
      "translate",
      "selection",
      "pdf",
    ]) {
      expect(INSTALL_GUIDE_SCRIPT).toContain(`'${action}'`);
      expect(fixtureScript).toContain(`"${action}"`);
    }
    expect(fixtureScript).toContain("glimpselet:tutorial-action");
    expect(fixtureScript).toContain("glimpselet:tutorial:ready");
    expect(fixtureScript).toContain("event.source !== window.opener");
    expect(fixtureScript).toContain(
      'new CustomEvent("glimpselet:tutorial-action"',
    );
    expect(fixtureScript).toContain('type: "glimpselet:tutorial-action"');
    expect(fixtureScript).toContain("version: 1");
  });

  it("loads only store URL fields from the one distribution file", async () => {
    const root = await mkdtemp(join(tmpdir(), "glimpselet-dist-"));
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

  it("selects the active browser store while keeping source loading advanced", () => {
    const previous = process.env.GLIMPSELET_BROWSER;
    process.env.GLIMPSELET_BROWSER = "msedge";
    try {
      const guide = installGuide("/stable/path", {
        chromeWebStoreUrl:
          "https://chromewebstore.google.com/detail/glimpselet/id",
        edgeAddonsUrl:
          "https://microsoftedge.microsoft.com/addons/detail/glimpselet/id",
      });
      expect(guide).toContain(
        'href="https://microsoftedge.microsoft.com/addons/detail/glimpselet/id"',
      );
      expect(guide).toContain("Advanced: load from source");
      expect(guide).toContain("dist-extension");
      expect(guide).toContain("Add to browser");
    } finally {
      if (previous === undefined) delete process.env.GLIMPSELET_BROWSER;
      else process.env.GLIMPSELET_BROWSER = previous;
    }
  });

  it("copies an unpacked extension to a stable destination and rejects a missing manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "glimpselet-install-"));
    try {
      const source = join(root, "build");
      const destination = join(root, ".glimpselet", "extension");
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
