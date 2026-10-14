import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./content", () => ({}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: vi.fn().mockResolvedValue(undefined),
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 600, height: 800, scale: 1 }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [{ str: "Paper text" }] }),
      }),
    }),
  }),
  TextLayer: class {
    render() {
      return Promise.resolve();
    }
    cancel() {}
  },
}));

const contains = vi.fn();
const request = vi.fn();
const send = vi.fn();
const requestWindow = vi.fn();
let events: string[];
let handoffNotice: { hidden?: boolean; text?: string | null };
let listeners: {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
}[];
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function prepare() {
  await import("./reader");
  await settle();
  const input = document.querySelector<HTMLInputElement>("#pdf-url")!;
  input.value = "https://arxiv.org/pdf/1706.03762";
  input.dispatchEvent(new Event("input"));
  await settle();
}
function submit() {
  document
    .querySelector("#url-form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
}
beforeEach(() => {
  vi.resetModules();
  listeners = [];
  events = [];
  handoffNotice = {};
  for (const target of [document, window]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (listener) listeners.push({ target, type, listener });
        add(type, listener, options);
      },
    );
  }
  contains.mockReset().mockResolvedValue(false);
  request.mockReset().mockResolvedValue(true);
  send.mockReset().mockImplementation(async (message) => {
    if (message.type === "blinkling:reader-permission-handoff") {
      events.push("handoff");
      handoffNotice = {
        hidden: document.querySelector<HTMLElement>("#permission-recovery")
          ?.hidden,
        text: document.querySelector("#permission-note")?.textContent,
      };
      return { ok: true, interrupted: true };
    }
    if (message.type === "blinkling:reader-resume-floating")
      events.push("resume-message");
    return { ok: true };
  });
  requestWindow.mockReset().mockImplementation(() => {
    events.push("request-window");
    return Promise.resolve({ close: vi.fn() });
  });
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: send,
    },
    permissions: { contains, request },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          locale: "en",
          pipSize: { width: 420, height: 650 },
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("documentPictureInPicture", { requestWindow });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  document.body.innerHTML = readFileSync(
    "extension/reader.html",
    "utf8",
  ).replace(/<script[\s\S]*?<\/script>/g, "");
  document.querySelector<HTMLElement>("#permission-recovery")!.scrollIntoView =
    vi.fn();
});
afterEach(() => {
  for (const { target, type, listener } of listeners)
    target.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
describe("reader permission recovery", () => {
  it("resumes an abandoned URL preparation and requires a fresh handoff before site access", async () => {
    await prepare();
    const button = document.querySelector<HTMLButtonElement>("#resume-panel")!;
    expect(button.hidden).toBe(false);
    expect(document.querySelector("#permission-note")?.textContent).toMatch(
      /permission.*close floating chat/i,
    );
    expect(request).not.toHaveBeenCalled();
    button.click();
    await settle();
    expect(requestWindow).toHaveBeenCalledOnce();
    expect(
      document.querySelector<HTMLElement>("#permission-recovery")?.hidden,
    ).toBe(true);
    submit();
    expect(request).not.toHaveBeenCalled();
    await settle();
    expect(events.filter((event) => event === "handoff")).toHaveLength(2);
    expect(button.hidden).toBe(false);
    submit();
    expect(request).toHaveBeenCalledExactlyOnceWith({
      origins: ["https://arxiv.org/*"],
    });
    expect(button.hidden).toBe(true);
    await settle();
    expect(button.hidden).toBe(false);
  });
  it.each(["grant", "deny", "cancel", "failure"])(
    "explains the handoff and offers one-gesture resume after %s",
    async (outcome) => {
      let resolve!: (granted: boolean) => void;
      let reject!: (error: Error) => void;
      request.mockReturnValue(
        new Promise<boolean>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      );
      await prepare();
      expect(events).toContain("handoff");
      expect(handoffNotice.hidden).toBe(false);
      expect(handoffNotice.text).toMatch(/permission.*close floating chat/i);
      expect(request).not.toHaveBeenCalled();
      submit();
      expect(request).toHaveBeenCalledExactlyOnceWith({
        origins: ["https://arxiv.org/*"],
      });
      expect(
        document.querySelector<HTMLButtonElement>("#resume-panel")?.hidden,
      ).toBe(true);
      if (outcome === "failure")
        reject(new Error("Permission prompt dismissed"));
      else resolve(outcome === "grant");
      await settle();
      const button =
        document.querySelector<HTMLButtonElement>("#resume-panel")!;
      expect(
        button,
        "one clear resume action after the permission prompt",
      ).not.toBeNull();
      expect(button.hidden).toBe(false);
      expect(button.textContent).toBe("Resume floating chat");
      expect(document.querySelector("#permission-note")?.textContent).toMatch(
        /session, draft and attachment/i,
      );
      if (outcome !== "grant")
        expect(document.querySelector("#status")?.textContent).toMatch(
          /Permission was not granted/,
        );
      button.click();
      expect(events.at(-1)).toBe("request-window");
      await settle();
      expect(events.slice(-2)).toEqual(["request-window", "resume-message"]);
      expect(send).toHaveBeenCalledWith({
        type: "blinkling:reader-resume-floating",
      });
      expect(
        document.querySelector<HTMLElement>("#permission-recovery")?.hidden,
      ).toBe(true);
    },
  );
  it("keeps the existing floating chat when site access is already granted", async () => {
    contains.mockResolvedValue(true);
    await prepare();
    submit();
    await settle();
    expect(events).not.toContain("handoff");
    expect(
      document.querySelector<HTMLElement>("#permission-recovery")?.hidden,
    ).toBe(true);
  });
  it("offers recovery when the chat closed before permission preparation failed", async () => {
    send.mockResolvedValueOnce({ ok: false, interrupted: true });
    await prepare();
    const button = document.querySelector<HTMLButtonElement>("#resume-panel")!;
    expect(button.hidden).toBe(false);
    expect(
      document.querySelector<HTMLElement>("#permission-recovery")?.hidden,
    ).toBe(false);
    expect(document.querySelector("#permission-note")?.textContent).toMatch(
      /session, draft and attachment/i,
    );
    expect(request).not.toHaveBeenCalled();
    button.click();
    await settle();
    expect(requestWindow).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      type: "blinkling:reader-resume-floating",
    });
    expect(
      document.querySelector<HTMLElement>("#permission-recovery")?.hidden,
    ).toBe(true);
    expect(document.querySelector("#status")?.textContent).toBe(
      "Floating chat resumed.",
    );
  });
  it("keeps resume available if Chrome rejects reopening", async () => {
    await prepare();
    submit();
    await settle();
    requestWindow.mockRejectedValueOnce(new Error("Activation required"));
    const button = document.querySelector<HTMLButtonElement>("#resume-panel")!;
    expect(button).not.toBeNull();
    button.click();
    await settle();
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(false);
    expect(document.querySelector("#status")?.textContent).toBe(
      "Could not resume floating chat. Select Resume floating chat to try again.",
    );
    expect(
      send.mock.calls.some(
        ([message]) => message.type === "blinkling:reader-resume-floating",
      ),
    ).toBe(false);
    button.click();
    await settle();
    expect(
      document.querySelector<HTMLElement>("#permission-recovery")?.hidden,
    ).toBe(true);
    expect(document.querySelector("#status")?.textContent).toBe(
      "Floating chat resumed.",
    );
  });
  it("explains a resume failure when floating-window support is unavailable", async () => {
    await prepare();
    submit();
    await settle();
    vi.stubGlobal("documentPictureInPicture", undefined);
    document.querySelector<HTMLButtonElement>("#resume-panel")!.click();
    await settle();
    expect(document.querySelector("#status")?.textContent).toBe(
      "Could not resume floating chat. Select Resume floating chat to try again.",
    );
    expect(requestWindow).not.toHaveBeenCalled();
  });
});
