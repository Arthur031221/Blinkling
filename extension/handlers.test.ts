import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandlers } from "./handlers";

const tab = (url: string, over: object = {}) => ({
  id: 4,
  windowId: 2,
  index: 3,
  active: true,
  incognito: false,
  url,
  ...over,
});
const win = (t: object) => ({
  id: 2,
  left: 100,
  top: 50,
  width: 1000,
  height: 800,
  focused: true,
  state: "normal",
  tabs: [t],
});
const context = () => ({ signal: new AbortController().signal, send: vi.fn() });

function setup(url = "https://example.test/", over: object = {}) {
  const sendMessage = vi.fn(async (_id: number, message: { type: string }) => {
    if (message.type === "blinkling:elements")
      return {
        elements: [
          {
            id: "e1",
            kind: "input",
            rect: { x: 1, y: 2, width: 3, height: 4 },
            role: "textbox",
            name: "",
            text: "",
            parentId: null,
            secure: true,
          },
        ],
        selection: {
          text: "Chosen words",
          rect: { x: 5, y: 6, width: 70, height: 16 },
        },
        title: "T",
        url,
        innerWidth: 984,
        innerHeight: 700,
        devicePixelRatio: 2,
      };
    return undefined;
  });
  const executeScript = vi.fn(async (details: { files?: string[] }) =>
    details.files
      ? [{ result: undefined }]
      : [
          {
            result: {
              innerWidth: 984,
              innerHeight: 700,
              devicePixelRatio: 2,
              scrollX: 0,
              scrollY: 640,
              pageWidth: 984,
              pageHeight: 4200,
            },
          },
        ],
  );
  const create = vi.fn(async () => ({}));
  const t = tab(url, over);
  vi.stubGlobal("chrome", {
    windows: {
      getAll: vi.fn(async () => [win(t)]),
      getLastFocused: vi.fn(async () => ({ id: 2 })),
    },
    tabs: { sendMessage, getZoom: vi.fn(async () => 1), create },
    scripting: { executeScript },
    runtime: { getURL: (p: string) => `chrome-extension://me/${p}` },
    i18n: { getUILanguage: () => "fr" },
  });
  return { sendMessage, executeScript, create };
}
const helper = { call: vi.fn() };
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => helper.call.mockReset());

describe("helper handlers", () => {
  it("answers elements with the page, the frame and the collected elements", async () => {
    const { sendMessage } = setup();
    const reply:
      | {
          ok: boolean;
          result: {
            page: unknown;
            frame: unknown;
            elements: { secure: boolean }[];
            selection?: unknown;
          };
        }
      | undefined = await createHandlers(helper).handle(
      { type: "elements", id: "1", point: { x: 300, y: 300 } },
      context(),
    );
    expect(reply.ok).toBe(true);
    expect(reply.result.page).toEqual({
      url: "https://example.test/",
      title: "T",
      tabId: 4,
      incognito: false,
    });
    expect(reply.result.frame).toEqual({
      screenX: 108,
      screenY: 142,
      devicePixelRatio: 2,
      zoom: 1,
      scrollX: 0,
      scrollY: 640,
      viewWidth: 984,
      viewHeight: 700,
      pageWidth: 984,
      pageHeight: 4200,
    });
    expect(reply.result.elements[0].secure).toBe(true);
    expect(reply.result.selection).toEqual({
      text: "Chosen words",
      rect: { x: 5, y: 6, width: 70, height: 16 },
    });
    // The point is handed to the page in viewport CSS pixels.
    expect(sendMessage).toHaveBeenCalledWith(4, {
      type: "blinkling:elements",
      near: { x: 192, y: 158 },
    });
  });

  it("scrolls the page under the point to the page coordinates it is given", async () => {
    const { executeScript } = setup();
    executeScript.mockImplementation(async (details: { files?: string[] }) => [
      { result: details.files ? undefined : true },
    ]);
    const reply = await createHandlers(helper).handle(
      { type: "scroll-page", id: "1", point: { x: 300, y: 300 }, y: 1200 },
      context(),
    );
    expect(reply).toEqual({ ok: true });
    const scrolled = executeScript.mock.calls.find(
      ([details]) => (details as { func?: unknown }).func,
    );
    expect(scrolled?.[0]).toMatchObject({
      target: { tabId: 4 },
      args: [null, 1200],
    });
  });

  it("does not scroll a page an extension cannot enter", async () => {
    const { executeScript } = setup("chrome://settings");
    expect(
      await createHandlers(helper).handle(
        { type: "scroll-page", id: "1", y: 10 },
        context(),
      ),
    ).toEqual({ ok: false });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("returns null for pages an extension cannot read", async () => {
    setup("chrome://settings");
    const reply:
      | {
          ok: boolean;
          result: {
            page: unknown;
            frame: unknown;
            elements: { secure: boolean }[];
          };
        }
      | undefined = await createHandlers(helper).handle(
      { type: "elements", id: "1" },
      context(),
    );
    expect(reply).toEqual({ ok: true, result: null });
  });

  it("returns null when the page script cannot be injected (PDF viewer, other extensions)", async () => {
    const { executeScript } = setup("https://example.test/paper.pdf");
    executeScript.mockRejectedValue(new Error("Cannot access"));
    const reply:
      | {
          ok: boolean;
          result: {
            page: unknown;
            frame: unknown;
            elements: { secure: boolean }[];
          };
        }
      | undefined = await createHandlers(helper).handle(
      { type: "elements", id: "1" },
      context(),
    );
    expect(reply).toEqual({ ok: true, result: null });
  });

  it("returns null for the browser's PDF viewer, which lets a script in but has no page to read", async () => {
    const { executeScript } = setup("https://example.test/download?id=7");
    executeScript.mockImplementation(async (details: { files?: string[] }) =>
      details.files
        ? [{ result: undefined }]
        : [
            {
              result: {
                innerWidth: 984,
                innerHeight: 700,
                devicePixelRatio: 2,
                contentType: "application/pdf",
              },
            },
          ],
    );
    const reply:
      | {
          ok: boolean;
          result: {
            page: unknown;
            frame: unknown;
            elements: { secure: boolean }[];
          };
        }
      | undefined = await createHandlers(helper).handle(
      { type: "elements", id: "1" },
      context(),
    );
    expect(reply).toEqual({ ok: true, result: null });
  });

  it("opens the PDF reader next to a PDF tab and refuses other pages", async () => {
    const pdf = setup("https://example.test/paper.pdf");
    expect(
      await createHandlers(helper).handle(
        { type: "open-pdf-reader", id: "1" },
        context(),
      ),
    ).toEqual({ ok: true });
    expect(pdf.create).toHaveBeenCalledWith({
      url: "chrome-extension://me/reader.html?url=https%3A%2F%2Fexample.test%2Fpaper.pdf",
      windowId: 2,
      index: 4,
    });
    const page = setup("https://example.test/article");
    expect(
      await createHandlers(helper).handle(
        { type: "open-pdf-reader", id: "1" },
        context(),
      ),
    ).toEqual({ ok: false });
    expect(page.create).not.toHaveBeenCalled();
  });

  it("translates through the bridge in the browser language and restores on off", async () => {
    const { sendMessage } = setup();
    sendMessage.mockImplementation(
      async (_id: number, message: { type: string }) => {
        if (message.type === "blinkling:text-nodes")
          return { nodes: [{ id: "t1", text: "Hello" }] };
        if (message.type === "blinkling:translate") return { applied: 1 };
        if (message.type === "blinkling:restore") return { restored: 1 };
      },
    );
    helper.call.mockResolvedValue({ ok: true, answer: '["Bonjour"]' });
    const handlers = createHandlers(helper);
    expect(
      await handlers.handle(
        { type: "translate-page", id: "1", on: true },
        context(),
      ),
    ).toEqual({ ok: true });
    expect(helper.call.mock.calls[0]![0].prompt).toContain('"fr"');
    expect(sendMessage).toHaveBeenCalledWith(4, {
      type: "blinkling:translate",
      nodes: [{ id: "t1", text: "Bonjour" }],
    });
    expect(
      await handlers.handle(
        { type: "translate-page", id: "2", on: false },
        context(),
      ),
    ).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith(4, { type: "blinkling:restore" });
  });

  it("fails full-page on a restricted page without capturing", async () => {
    setup("chrome://newtab");
    expect(
      await createHandlers(helper).handle(
        { type: "full-page", id: "1" },
        context(),
      ),
    ).toEqual({ ok: false, error: "restricted_page" });
  });

  it("ignores requests it does not know", async () => {
    setup();
    expect(
      await createHandlers(helper).handle({ type: "nope", id: "1" }, context()),
    ).toBeUndefined();
  });
});
