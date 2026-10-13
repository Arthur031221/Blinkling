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
    .filter((message) => message.type === "glimpselet:reader-action");
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
