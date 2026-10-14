import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  texts: [
    "First PDF page",
    "Introduction. Transformer training. Background UNRELATED_SECTION",
  ],
  send: vi.fn(),
}));
vi.mock("./content", () => ({}));
vi.mock("./png", () => ({
  encodeCanvasPng: () => "data:image/png;base64,AAA=",
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: vi.fn().mockResolvedValue(undefined),
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (number: number) => ({
        getViewport: () => ({ width: 600, height: 800, scale: 1 }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({
          items: [{ str: state.texts[number - 1] }],
        }),
      }),
    }),
  }),
  TextLayer: class {
    constructor(
      private options: {
        container: HTMLElement;
        textContentSource: { items: { str: string }[] };
      },
    ) {}
    render() {
      const span = document.createElement("span");
      span.textContent = this.options.textContentSource.items[0].str;
      this.options.container.append(span);
      return Promise.resolve();
    }
    cancel() {}
  },
}));
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function openReader() {
  await import("./reader");
  await settle();
  const input = document.querySelector<HTMLInputElement>("#file")!;
  Object.defineProperty(input, "files", {
    value: [
      {
        name: "paper.pdf",
        size: 12,
        arrayBuffer: async () => new ArrayBuffer(12),
      },
    ],
  });
  input.dispatchEvent(new Event("change"));
  await settle();
  document.querySelector<HTMLButtonElement>("#next")!.click();
  await settle();
  state.send.mockClear();
}
function select(start = 0, end?: number) {
  const node = document.querySelector(".pdf-text-layer span")!.firstChild!;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end ?? node.textContent!.length);
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}
function action(name: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-action="${name}"]`,
  );
  expect(button, `Reader must offer ${name}`).not.toBeNull();
  return button!;
}
function actionRequests() {
  return state.send.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === "blinkling:reader-action");
}
let readerListeners: {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
}[];
beforeEach(() => {
  vi.resetModules();
  readerListeners = [];
  for (const target of [document, window]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (listener && ["selectionchange", "resize"].includes(type))
          readerListeners.push({ target, type, listener });
        add(type, listener, options);
      },
    );
  }
  state.texts = [
    "First PDF page",
    "Introduction. Transformer training. Background UNRELATED_SECTION",
  ];
  state.send.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: state.send,
    },
    storage: {
      local: { get: vi.fn().mockResolvedValue({ locale: "en" }) },
      onChanged: { addListener: vi.fn() },
    },
  });
  document.body.innerHTML = readFileSync(
    "extension/reader.html",
    "utf8",
  ).replace(/<script[\s\S]*?<\/script>/g, "");
});
afterEach(() => {
  for (const { target, type, listener } of readerListeners)
    target.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});
describe("PDF reader action scope", () => {
  it("disables selection-only translation until a passage is selected", async () => {
    expect(action("translate").disabled).toBe(true);
    await openReader();
    expect(action("translate").disabled).toBe(true);
    select(0, 13);
    expect(action("translate").disabled).toBe(false);
  });
  it("rejects a forced empty translation without sending a reader action", async () => {
    await openReader();
    action("translate").dispatchEvent(new MouseEvent("click"));
    await settle();
    expect(actionRequests()).toHaveLength(0);
    expect(document.querySelector("#status")?.textContent).toBe(
      "Select a passage first.",
    );
  });
  it("translates the preserved passage exactly once when the button takes focus", async () => {
    await openReader();
    select(0, 13);
    const button = action("translate");
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    button.focus();
    getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(button.disabled).toBe(false);
    button.click();
    await settle();
    expect(actionRequests()).toHaveLength(1);
    expect(actionRequests()[0]).toMatchObject({
      action: "translate",
      text: "Introduction.",
      question: "Translate this selected passage into my target language.",
      page: 2,
    });
    expect(actionRequests()[0].image).toBeUndefined();
  });
  it("clears a remembered passage when the page is clicked with an action still focused", async () => {
    await openReader();
    select(0, 13);
    action("translate").focus();
    getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    document
      .querySelector("#page canvas")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new Event("selectionchange"));
    expect(action("translate").disabled).toBe(true);
    expect(action("summary-selection").disabled).toBe(true);
    action("translate").dispatchEvent(new MouseEvent("click"));
    await settle();
    expect(actionRequests()).toHaveLength(0);
  });
  it("explains a page without selectable text and keeps page summary separately available", async () => {
    state.texts[1] = "";
    await openReader();
    expect(document.querySelector(".pdf-text-layer")).not.toBeNull();
    expect(action("translate").disabled).toBe(true);
    expect(action("summary-selection").disabled).toBe(true);
    const help = document.querySelector<HTMLElement>("#selection-help");
    expect(help).not.toBeNull();
    expect(help?.hidden).toBe(false);
    expect(help?.textContent).toBe(
      "This page has no selectable text. Use Ask about page or Summarize page to ask about the page image.",
    );
    action("translate").dispatchEvent(new MouseEvent("click"));
    await settle();
    expect(actionRequests()).toHaveLength(0);
    expect(document.querySelector("#status")?.textContent).toBe(
      help?.textContent,
    );
    action("summary").click();
    await settle();
    expect(actionRequests()).toHaveLength(1);
    expect(actionRequests()[0]).toMatchObject({
      action: "summary",
      text: "",
      page: 2,
      image: "data:image/png;base64,AAA=",
    });
  });
  it("shows selection guidance until a passage is selected", async () => {
    await openReader();
    const help = document.querySelector<HTMLElement>("#selection-help");
    expect(help).not.toBeNull();
    expect(help?.hidden).toBe(false);
    expect(help?.textContent).toBe(
      "Select a passage to translate or summarize it.",
    );
    select(0, 13);
    expect(help?.hidden).toBe(true);
  });
  it("rejects whitespace-only translation and over-limit passages", async () => {
    state.texts[1] = "   " + "x".repeat(5001);
    await openReader();
    select(0, 3);
    expect(action("translate").disabled).toBe(true);
    action("translate").dispatchEvent(new MouseEvent("click"));
    await settle();
    expect(actionRequests()).toHaveLength(0);
    select(3);
    action("translate").click();
    await settle();
    expect(actionRequests()).toHaveLength(0);
    expect(document.querySelector("#status")?.textContent).toMatch(/5,000/);
  });
  it("explains that the reader Ask action leaves a question ready to review in chat", async () => {
    await openReader();
    select(0, 13);
    action("ask").click();
    await settle();
    expect(actionRequests()).toHaveLength(1);
    expect(actionRequests()[0]).toMatchObject({
      action: "ask",
      text: "Introduction.",
    });
    expect(document.querySelector("#status")?.textContent).toBe(
      "Question ready in chat. Review it and select Ask to send.",
    );
  });
  it("sends only a selected passage for a clearly named section summary", async () => {
    await openReader();
    select(0, "Introduction. Transformer training.".length);
    expect(action("summary-selection").textContent).toContain(
      "Summarize selection",
    );
    action("summary-selection").click();
    await settle();
    expect(actionRequests()).toHaveLength(1);
    expect(actionRequests()[0]).toMatchObject({
      action: "summary-selection",
      text: "Introduction. Transformer training.",
      page: 2,
    });
    expect(actionRequests()[0].image).toBeUndefined();
  });
  it("preserves the passage when an action button takes focus and collapses selection", async () => {
    await openReader();
    select(0, 13);
    const button = action("summary-selection");
    button.focus();
    getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    button.click();
    await settle();
    expect(actionRequests()[0]?.text).toBe("Introduction.");
  });
  it("clears stale selected text on page changes and retains a separate whole-page summary", async () => {
    await openReader();
    select(0, 13);
    document.querySelector<HTMLButtonElement>("#prev")!.click();
    await settle();
    expect(action("summary-selection").disabled).toBe(true);
    expect(action("summary").textContent).toContain("Summarize page");
    action("summary").click();
    await settle();
    expect(actionRequests()[0]).toMatchObject({
      action: "summary",
      text: "",
      page: 1,
    });
    expect(actionRequests()[0].context.text).toContain("First PDF page");
  });
  it("accepts 5000 characters but explicitly rejects an over-limit selection", async () => {
    state.texts[1] = "x".repeat(5001);
    await openReader();
    select(0, 5000);
    action("summary-selection").click();
    await settle();
    expect(actionRequests()[0]?.text).toHaveLength(5000);
    state.send.mockClear();
    select();
    action("summary-selection").click();
    await settle();
    expect(actionRequests()).toHaveLength(0);
    expect(document.querySelector("#status")?.textContent).toMatch(/5,000/);
  });
});
