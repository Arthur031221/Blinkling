import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(
  "public/assets/glimpselet-welcome-sample.js",
  "utf8",
);
let receive: (event: MessageEvent) => void;
const opener = { postMessage: vi.fn() };
const guidance = [
  [
    "float",
    "Float the bubble, then switch windows.",
    "開啟浮動視窗，再切換到其他視窗。",
  ],
  [
    "capture",
    "Capture this page and ask what changes the taste.",
    "擷取此頁面，詢問哪些因素會改變茶的風味。",
  ],
  [
    "suggest",
    "Choose one of the suggested questions in the bubble.",
    "在浮動視窗中選擇一個建議問題。",
  ],
  [
    "passive",
    "Turn on passive mode, then change pages.",
    "開啟被動模式，再切換頁面。",
  ],
  [
    "guide",
    "Start Guide and follow its pointers to the tea buttons.",
    "啟動導覽，跟著指引找到茶葉按鈕。",
  ],
  [
    "translate",
    "Translate this page in place, then restore the original.",
    "在頁面上翻譯內容，再切回原文。",
  ],
  [
    "selection",
    "Select a sentence and choose Explain, Translate, or Ask.",
    "選取一句文字，選擇解釋、翻譯或提問。",
  ],
  [
    "pdf",
    "Open the sample PDF in the Glimpselet reader.",
    "在 Glimpselet 閱讀器開啟 PDF 範例。",
  ],
] as const;

beforeEach(() => {
  opener.postMessage.mockClear();
  document.documentElement.lang = "en";
  document.body.innerHTML =
    '<div id="tour-request"></div><aside data-practice-label>Glimpselet practice page</aside>';
  Object.defineProperty(window, "opener", {
    configurable: true,
    value: opener,
  });
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
    if (type === "message") receive = listener as (event: MessageEvent) => void;
  });
  new Function("window", "document", "location", source)(
    window,
    document,
    location,
  );
});

afterEach(() => vi.restoreAllMocks());

function deliver(
  data: Record<string, unknown>,
  fields: Partial<MessageEvent> = {},
) {
  receive({
    source: opener,
    origin: location.origin,
    data,
    ...fields,
  } as unknown as MessageEvent);
}

function contentReady() {
  deliver(
    { type: "glimpselet:tutorial:content-ready", version: 1 },
    { source: window },
  );
}

function probe(locale: unknown = "en") {
  contentReady();
  deliver({
    type: "glimpselet:tutorial:probe",
    version: 1,
    requestId: "request-1",
    locale,
  });
}

function action(locale: unknown = "en", fields: Record<string, unknown> = {}) {
  deliver({
    type: "glimpselet:tutorial-action",
    version: 1,
    requestId: "request-1",
    action: "translate",
    step: 6,
    locale,
    ...fields,
  });
}

describe("welcome sample guidance", () => {
  it("acknowledges the sample only after the content script can receive its first action", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    deliver({
      type: "glimpselet:tutorial:probe",
      version: 1,
      requestId: "request-1",
      locale: "zh-TW",
    });
    expect(opener.postMessage).not.toHaveBeenCalled();
    deliver(
      { type: "glimpselet:tutorial:content-ready", version: 2 },
      { source: window },
    );
    deliver(
      { type: "glimpselet:tutorial:content-ready", version: 1 },
      { source: null },
    );
    deliver(
      { type: "glimpselet:tutorial:content-ready", version: 1 },
      { source: window, origin: "http://example.com" },
    );
    expect(opener.postMessage).not.toHaveBeenCalled();
    contentReady();
    expect(opener.postMessage).toHaveBeenCalledWith(
      {
        type: "glimpselet:tutorial:loaded",
        version: 1,
        requestId: "request-1",
      },
      location.origin,
    );
    action("zh-TW");
    expect(document.querySelector("#tour-request")?.textContent).toContain(
      "導覽步驟 6：",
    );
    action("zh-TW");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("renders the selected initial language before an extension handshake", () => {
    new Function("window", "document", "location", source)(window, document, {
      search: "?locale=zh-TW",
      origin: location.origin,
    });
    expect(document.documentElement.lang).toBe("zh-TW");
    expect(document.querySelector("[data-practice-label]")?.textContent).toBe(
      "Glimpselet 練習頁面",
    );
    expect(opener.postMessage).not.toHaveBeenCalled();
  });
  for (const locale of ["en", "zh-TW"] as const) {
    it.each(
      guidance.map(([name, en, zh], index) => ({
        name,
        en,
        zh,
        step: index + 1,
      })),
    )(
      `renders ${locale} $name guidance and carries the locale to the content script`,
      ({ name, en, zh, step }) => {
        const dispatch = vi.spyOn(window, "dispatchEvent");
        probe(locale);
        action(locale, { action: name, step });
        expect(document.documentElement.lang).toBe(locale);
        expect(document.querySelector("#tour-request")?.textContent).toBe(
          locale === "zh-TW"
            ? `導覽步驟 ${step}：${zh}`
            : `Tour step ${step}: ${en}`,
        );
        expect(
          document.querySelector("[data-practice-label]")?.textContent,
        ).toBe(
          locale === "zh-TW"
            ? "Glimpselet 練習頁面"
            : "Glimpselet practice page",
        );
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect((dispatch.mock.calls[0][0] as CustomEvent).detail).toEqual({
          type: "glimpselet:tutorial-action",
          version: 1,
          action: name,
          step,
          locale,
          code: null,
        });
        expect(opener.postMessage).toHaveBeenLastCalledWith(
          {
            type: "glimpselet:tutorial:ready",
            version: 1,
            requestId: "request-1",
            action: name,
            step,
          },
          location.origin,
        );
      },
    );
  }

  it("switches an existing Chinese practice page back to English for its next action", () => {
    probe("zh-TW");
    action("zh-TW");
    deliver({
      type: "glimpselet:tutorial:probe",
      version: 1,
      requestId: "request-2",
      locale: "en",
    });
    action("en", { requestId: "request-2" });
    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelector("[data-practice-label]")?.textContent).toBe(
      "Glimpselet practice page",
    );
    expect(document.querySelector("#tour-request")?.textContent).toBe(
      "Tour step 6: Translate this page in place, then restore the original.",
    );
  });

  it("keeps English guidance for invalid locale values", () => {
    probe("unsupported");
    action({ locale: "zh-TW" });
    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelector("#tour-request")?.textContent).toContain(
      "Tour step 6:",
    );
  });

  it("keeps source, origin, request and action/step validation", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    probe("zh-TW");
    deliver(
      {
        type: "glimpselet:tutorial-action",
        version: 1,
        requestId: "request-1",
        action: "translate",
        step: 6,
        locale: "zh-TW",
      },
      { source: window },
    );
    deliver(
      {
        type: "glimpselet:tutorial-action",
        version: 1,
        requestId: "request-1",
        action: "translate",
        step: 6,
        locale: "zh-TW",
      },
      { origin: "http://example.com" },
    );
    action("zh-TW", { requestId: "other" });
    action("zh-TW", { step: 5 });
    action("zh-TW", { version: 2 });
    expect(document.querySelector("#tour-request")?.textContent).toBe("");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
