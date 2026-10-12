import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../src/extension-install.js";

const openGuide = async (mode: "direct" | "tunnel", store = false) => {
  const html = installGuide("/home/linux/.glimpselet/extension", {
    chromeWebStoreUrl: store
      ? "https://chromewebstore.google.com/detail/glimpselet/id"
      : "",
    edgeAddonsUrl: "",
  });
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:4312/#code=0123456789ABCDEF",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).startsWith("/install/status")) {
      return {
        ok: true,
        json: async () => ({
          mode,
          tunnelCommand: "ssh -N -L 4312:127.0.0.1:4312 levi@host",
        }),
      } as Response;
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  Object.assign(window, { fetch, setTimeout: () => 0 });
  window.eval(INSTALL_GUIDE_SCRIPT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, fetch };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("welcome install guide remote onboarding", () => {
  it("keeps the stable local folder flow and zero-install for direct mode", async () => {
    const { dom } = await openGuide("direct");
    const { document } = dom.window;

    expect(document.querySelector("#install-local")?.hidden).toBe(false);
    expect(document.querySelector("#install-remote")?.hidden).toBe(true);
    expect(document.querySelector("#try-zero")?.hidden).toBe(false);
    expect(document.querySelector("#install-local .path")?.textContent).toBe(
      "/home/linux/.glimpselet/extension",
    );
    dom.window.close();
  });

  it("shows remote ZIP instructions and SSH tunnel in English and Chinese", async () => {
    const { dom } = await openGuide("tunnel");
    const { document } = dom.window;
    const { version } = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };

    expect(document.querySelector("#install-local")?.hidden).toBe(true);
    expect(document.querySelector("#install-remote")?.hidden).toBe(false);
    expect(document.querySelector("#try-zero")?.hidden).toBe(true);
    expect(document.querySelector("#install-remote .path")).toBeNull();
    expect(
      document.querySelector<HTMLAnchorElement>("#install-remote a")?.href,
    ).toBe(
      `https://github.com/Arthur031221/Glimpselet/releases/download/v${version}/glimpselet-extension.zip`,
    );
    expect(document.querySelector("#tunnel")?.hidden).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>("#tunnel-command")?.value,
    ).toBe("ssh -N -L 4312:127.0.0.1:4312 levi@host");
    expect(
      document.querySelector("#install-remote")?.textContent?.toLowerCase(),
    ).toContain("extract it on this computer");

    document.querySelector<HTMLButtonElement>("#language")?.click();
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(document.querySelector("#install-remote")?.textContent).toContain(
      "在這台電腦解壓縮",
    );
    expect(document.querySelector("#mode")?.textContent).toContain(
      "Claude Code 位於另一台電腦",
    );
    dom.window.close();
  });

  it("uses a configured store listing without exposing the unpacked flow", async () => {
    const { dom } = await openGuide("tunnel", true);
    const { document } = dom.window;

    expect(document.querySelector("#install-store")?.hidden).toBe(false);
    expect(document.querySelector("#install-remote")).toBeNull();
    expect(document.querySelector("#install-local")).toBeNull();
    expect(
      document.querySelector("#install-store a")?.getAttribute("href"),
    ).toBe("https://chromewebstore.google.com/detail/glimpselet/id");
    dom.window.close();
  });
});
