import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../src/extension-install.js";

const openGuide = async (
  mode: "direct" | "tunnel",
  store = false,
  connected = false,
) => {
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
          connected,
        }),
      } as Response;
    }
    if (String(input).startsWith("/install/try"))
      return {
        ok: true,
        status: 202,
        json: async () => ({ started: true }),
      } as Response;
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

    expect(document.querySelector("#install-local")?.hidden).toBe(true);
    expect(document.querySelector("#install-remote")?.hidden).toBe(false);
    expect(document.querySelector("#try-zero")?.hidden).toBe(true);
    expect(document.querySelector("#install-remote .path")).toBeNull();
    expect(
      document.querySelector<HTMLAnchorElement>("#install-remote a")?.href,
    ).toBe("http://127.0.0.1:4312/install/extension.zip?code=0123456789ABCDEF");
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

  it("does not open a practice tab automatically after pairing", async () => {
    const { dom } = await openGuide("direct");
    const open = vi.spyOn(dom.window, "open").mockReturnValue(null);
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        origin: dom.window.location.origin,
        source: dom.window,
        data: { type: "glimpselet:paired" },
      }),
    );
    expect(
      dom.window.document
        .querySelector("#connection")
        ?.classList.contains("connected"),
    ).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(INSTALL_GUIDE_SCRIPT).not.toContain("tryStep(0,'float')");
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

  it("waits for a user initiated pairing and only reports success after connection", async () => {
    const { dom, fetch } = await openGuide("direct");
    const { window } = dom;
    const { document } = window;

    expect(document.querySelector("h1")?.textContent).toContain("Glimpselet");
    expect(document.querySelector("#connection")?.textContent).toContain(
      "Click Pair extension",
    );

    document.querySelector<HTMLButtonElement>("#try-zero")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledWith(
      "/install/try?code=0123456789ABCDEF",
      expect.objectContaining({ method: "POST" }),
    );
    expect(document.querySelector("#try-note")?.textContent).toContain(
      "Chromium launch requested. If its Glimpselet window opens, click Pair extension",
    );
    expect(document.querySelector("#connection")?.textContent).toContain(
      "Waiting for Glimpselet",
    );

    window.dispatchEvent(
      new window.MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: { type: "glimpselet:extension-ready" },
      }),
    );
    expect(document.querySelector("#try-note")?.textContent).toContain(
      "Click Pair extension to approve",
    );
    expect(
      document.querySelector("#connection")?.classList.contains("connected"),
    ).toBe(false);

    document.querySelector<HTMLButtonElement>("#connect")?.click();
    expect(document.querySelector("#connection")?.textContent).toContain(
      "Pairing request sent",
    );
    window.dispatchEvent(
      new window.MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: { type: "glimpselet:paired" },
      }),
    );
    expect(
      document.querySelector("#connection")?.classList.contains("connected"),
    ).toBe(true);
    expect(document.querySelector("#pair-controls")?.hidden).toBe(true);
    expect(document.querySelector("#pair")?.hidden).toBe(true);
    dom.window.close();
  });

  it("reflects a server-confirmed connection and hides redundant pairing controls", async () => {
    const { dom } = await openGuide("direct", false, true);
    const { document } = dom.window;
    expect(document.querySelector("#connection")?.textContent).toContain(
      "Connected. Choose a practice step below.",
    );
    expect(document.querySelector("#pair-controls")?.hidden).toBe(true);
    expect(document.querySelector("#pair")?.hidden).toBe(true);
    dom.window.close();
  });
});
