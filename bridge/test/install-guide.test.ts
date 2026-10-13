import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../src/extension-install.js";

const openGuide = async (
  mode: "direct" | "tunnel",
  store = false,
  connected = false,
  url = "http://127.0.0.1:4312/install#code=0123456789ABCDEF",
) => {
  const html = installGuide("/home/linux/.glimpselet/extension", {
    chromeWebStoreUrl: store
      ? "https://chromewebstore.google.com/detail/glimpselet/id"
      : "",
    edgeAddonsUrl: "",
  });
  const dom = new JSDOM(html, {
    url,
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
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.eval(INSTALL_GUIDE_SCRIPT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, fetch };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("documented plugin upgrades", () => {
  const readmes = [
    "README.md",
    "README.zh-TW.md",
    "README.zh-CN.md",
    "README.ja.md",
    "README.ko.md",
    "README.es.md",
    "README.fr.md",
    "README.de.md",
    "README.pt-BR.md",
  ];

  it.each(readmes)(
    "%s lets an existing user refresh, update, reload and verify v2",
    async (file) => {
      const readme = await readFile(file, "utf8");
      expect(readme).toContain("claude plugin marketplace update glimpselet");
      expect(readme).toContain("claude plugin update glimpselet@glimpselet");
      expect(readme).toContain("/reload-plugins");
      expect(readme).toContain("claude plugin list");
      expect(readme).toContain("2.0.0");
      expect(readme).toContain("chrome://extensions");
      expect(readme.trim().split("\n").at(-1)).toBe(
        "Assisted by Claude/Codex.",
      );
    },
  );
});

describe("welcome install guide remote onboarding", () => {
  it.each(["direct", "tunnel"] as const)(
    "offers a copyable manager address with address-bar instructions in %s mode",
    async (mode) => {
      const { dom } = await openGuide(mode);
      const { document, navigator } = dom.window;
      const card = document.querySelector(
        mode === "direct" ? "#install-local" : "#install-remote",
      )!;
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      expect(card.querySelector('a[href="chrome://extensions"]')).toBeNull();
      expect(
        card.querySelector<HTMLInputElement>(".manager-address")?.value,
      ).toBe("chrome://extensions");
      expect(card.textContent).toContain(
        "Paste this address into your browser's address bar",
      );
      card.querySelector<HTMLButtonElement>(".copy-manager")!.click();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith("chrome://extensions");
      dom.window.close();
    },
  );

  it.each(["direct", "tunnel"] as const)(
    "selects the manager address for manual copying if clipboard access is denied in %s mode",
    async (mode) => {
      const { dom } = await openGuide(mode);
      const { document, navigator } = dom.window;
      const card = document.querySelector(
        mode === "direct" ? "#install-local" : "#install-remote",
      )!;
      const input = card.querySelector<HTMLInputElement>(".manager-address")!;
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error("Permission denied")),
        },
        configurable: true,
      });

      document.querySelector<HTMLButtonElement>("#language")!.click();
      expect(card.textContent).toContain("請把這個網址貼到瀏覽器網址列");
      card.querySelector<HTMLButtonElement>(".copy-manager")!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(document.activeElement).toBe(input);
      expect(input.value).toBe("chrome://extensions");
      expect(input.readOnly).toBe(true);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
      dom.window.close();
    },
  );

  it("offers the Edge manager address when Edge is the configured browser", async () => {
    vi.stubEnv("GLIMPSELET_BROWSER", "msedge");
    const { dom } = await openGuide("direct");
    const { document, navigator } = dom.window;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    expect(
      document.querySelector<HTMLInputElement>("#manager-local")?.value,
    ).toBe("edge://extensions");
    document
      .querySelector<HTMLButtonElement>("#install-local .copy-manager")!
      .click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("edge://extensions");
    expect(document.querySelector('a[href="edge://extensions"]')).toBeNull();
    dom.window.close();
  });

  it("offers tour-only replay without reporting a false setup failure", async () => {
    const { dom, fetch } = await openGuide(
      "direct",
      false,
      false,
      "http://127.0.0.1:4312/install#tour",
    );
    const { document } = dom.window;
    expect(document.querySelector<HTMLElement>("#installation")?.hidden).toBe(
      true,
    );
    expect(document.querySelector<HTMLElement>("#pairing")?.hidden).toBe(true);
    expect(document.querySelector("#tour #try-note")).not.toBeNull();
    expect(document.querySelector("#tour")?.textContent).not.toContain(
      "Waiting for Glimpselet",
    );
    expect(document.querySelector("#tour")?.textContent).not.toContain(
      "pairing code",
    );
    expect(fetch).not.toHaveBeenCalled();
    dom.window.close();
  });

  it("keeps setup visible for a genuinely unpaired normal welcome", async () => {
    const { dom } = await openGuide(
      "direct",
      false,
      false,
      "http://127.0.0.1:4312/install",
    );
    const { document } = dom.window;
    expect(document.querySelector<HTMLElement>("#installation")?.hidden).toBe(
      false,
    );
    expect(document.querySelector<HTMLElement>("#pairing")?.hidden).toBe(false);
    expect(document.querySelector("#pair")?.textContent).toContain(
      "pairing code",
    );
    dom.window.close();
  });

  it("carries the selected welcome language to pairing and practice", async () => {
    const { dom } = await openGuide("direct");
    const { window } = dom;
    const pair = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    window.document.querySelector<HTMLButtonElement>("#language")!.click();
    window.document.querySelector<HTMLButtonElement>("#connect")!.click();
    expect(pair).toHaveBeenCalledWith(
      {
        type: "glimpselet:pair",
        port: 4312,
        code: "0123456789ABCDEF",
        locale: "zh-TW",
      },
      window.location.origin,
    );
    const sample = { closed: false, focus: vi.fn(), postMessage: vi.fn() };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(sample as unknown as Window);
    window.document.querySelector<HTMLButtonElement>(".try")!.click();
    expect(open).toHaveBeenCalledWith(
      "http://127.0.0.1:4312/assets/glimpselet-welcome-sample.html?locale=zh-TW",
      "_blank",
    );
    const probe = sample.postMessage.mock.calls[0][0];
    expect(probe.locale).toBe("zh-TW");
    window.dispatchEvent(
      new window.MessageEvent("message", {
        origin: window.location.origin,
        source: sample as unknown as Window,
        data: {
          type: "glimpselet:tutorial:loaded",
          version: 1,
          requestId: probe.requestId,
        },
      }),
    );
    expect(sample.postMessage.mock.calls[1][0]).toMatchObject({
      locale: "zh-TW",
      action: "float",
    });
    dom.window.close();
  });

  it("clears obsolete Pair guidance after ready, language switch and connection", async () => {
    const { dom } = await openGuide("direct");
    const { window } = dom;
    const send = (type: string) =>
      window.dispatchEvent(
        new window.MessageEvent("message", {
          source: window,
          origin: window.location.origin,
          data: { type },
        }),
      );
    send("glimpselet:extension-ready");
    window.document.querySelector<HTMLButtonElement>("#language")!.click();
    expect(window.document.querySelector("#try-note")?.textContent).toContain(
      "配對擴充功能",
    );
    send("glimpselet:paired");
    expect(
      window.document.querySelector("#try-note")?.textContent,
    ).not.toContain("Pair extension");
    expect(
      window.document.querySelector("#try-note")?.textContent,
    ).not.toContain("配對擴充功能");
    window.document.querySelector<HTMLButtonElement>("#language")!.click();
    expect(window.document.querySelector("#connection")?.textContent).toContain(
      "Connected.",
    );
    expect(
      window.document.querySelector("#try-note")?.textContent,
    ).not.toContain("Pair extension");
    expect(
      window.document.querySelector<HTMLElement>("#pair-controls")?.hidden,
    ).toBe(true);
    expect(
      window.document.querySelector<HTMLButtonElement>("#connect")?.hidden,
    ).toBe(true);
    expect(
      window.document.querySelector<HTMLButtonElement>("#copy")?.hidden,
    ).toBe(true);
    dom.window.close();
  });

  it("initializes replay language only from supported locale values", async () => {
    for (const [locale, language] of [
      ["zh-TW", "zh-Hant"],
      ["en", "en"],
      ["invalid", "en"],
    ]) {
      const { dom } = await openGuide(
        "direct",
        false,
        false,
        `http://127.0.0.1:4312/install?locale=${locale}#tour`,
      );
      expect(dom.window.document.documentElement.lang).toBe(language);
      dom.window.close();
    }
  });
  it.each([
    "README.md",
    "README.zh-TW.md",
    "README.zh-CN.md",
    "README.ja.md",
    "README.ko.md",
    "README.es.md",
    "README.fr.md",
    "README.de.md",
    "README.pt-BR.md",
  ])(
    "%s explains refreshing, updating and checking an existing plugin",
    async (file) => {
      const readme = await readFile(file, "utf8");
      expect(readme).toContain("claude plugin marketplace update glimpselet");
      expect(readme).toContain("claude plugin update glimpselet@glimpselet");
      expect(readme).toContain("claude plugin list");
      expect(readme).toContain("/reload-plugins");
      expect(readme).toContain("2.0.0");
      expect(readme.trimEnd().endsWith("Assisted by Claude/Codex.")).toBe(true);
    },
  );
  it("accepts only a matching delivery acknowledgement and completion from the practice tab", async () => {
    const { dom } = await openGuide("direct");
    const { window } = dom;
    const sample = {
      closed: false,
      location: {
        href: window.location.origin + "/assets/glimpselet-welcome-sample.html",
      },
      focus: vi.fn(),
      postMessage: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(sample as unknown as Window);
    window.document.querySelectorAll<HTMLButtonElement>(".try")[4].click();
    const note = window.document.querySelector("#try-note");
    expect(note?.textContent).not.toContain("Requested in the sample page");
    const ping = sample.postMessage.mock.calls[0][0];
    const message = (
      data: unknown,
      source: Window = sample as unknown as Window,
      origin = window.location.origin,
    ) =>
      window.dispatchEvent(
        new window.MessageEvent("message", { origin, source, data }),
      );
    const ready = {
      type: "glimpselet:tutorial:loaded",
      version: 1,
      requestId: ping.requestId,
    };
    message(ready, window);
    message(ready, sample as unknown as Window, "https://example.com");
    expect(sample.postMessage).toHaveBeenCalledTimes(1);
    message(ready);
    const request = sample.postMessage.mock.calls[1][0];
    expect(request).toMatchObject({
      type: "glimpselet:tutorial-action",
      action: "guide",
      step: 5,
    });
    message(ready);
    expect(sample.postMessage).toHaveBeenCalledTimes(2);
    const ack = { ...request, type: "glimpselet:tutorial:ready" };
    message({ ...ack, requestId: "wrong" });
    message({ ...ack, action: "capture" });
    message({ type: "glimpselet:tutorial:done", version: 1, step: 5 });
    expect(note?.textContent).not.toContain("Requested in the sample page");
    expect(
      window.document.querySelectorAll(".step")[4].classList.contains("done"),
    ).toBe(false);
    message(ack);
    expect(note?.textContent).toContain("Requested in the sample page");
    message({ type: "glimpselet:tutorial:done", version: 1, step: 4 });
    expect(
      window.document.querySelectorAll(".step")[3].classList.contains("done"),
    ).toBe(false);
    message({ type: "glimpselet:tutorial:done", version: 1, step: 5 });
    expect(
      window.document.querySelectorAll(".step")[4].classList.contains("done"),
    ).toBe(true);
    window.document.querySelector<HTMLElement>("#tour")!.scrollIntoView =
      vi.fn();
    window.document.querySelector<HTMLButtonElement>("#replay")!.click();
    message({ type: "glimpselet:tutorial:done", version: 1, step: 5 });
    expect(
      window.document.querySelectorAll(".step")[4].classList.contains("done"),
    ).toBe(false);
    dom.window.close();
  });

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
      "/install/try?code=0123456789ABCDEF&locale=en",
      expect.objectContaining({ method: "POST" }),
    );
    expect(document.querySelector("#try-note")?.textContent).toContain(
      "In the new practice window, click Pair extension to connect that browser.",
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
