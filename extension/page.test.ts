import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ContentMessage = (
  message: Record<string, unknown>,
  sender: unknown,
  respond: (value: unknown) => void,
) => void;

let onMessage: ContentMessage;
let text: Text;
const observers: MutationObserver[] = [];

async function startContentScript() {
  const listeners: ContentMessage[] = [];
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: { get: vi.fn().mockResolvedValue({}) },
        onChanged: { addListener: vi.fn() },
      },
      runtime: {
        onMessage: {
          addListener: (listener: ContentMessage) => listeners.push(listener),
        },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
  vi.resetModules();
  Reflect.deleteProperty(globalThis, "blinklingPageReady");
  await import("./page");
  onMessage = listeners[0];
}

function send<T>(type: string, fields: Record<string, unknown> = {}): T {
  let response: unknown;
  onMessage({ type, ...fields }, {}, (value) => (response = value));
  return response as T;
}

async function setup() {
  document.body.innerHTML = "<p>Original product price</p>";
  text = document.querySelector("p")!.firstChild as Text;
  await startContentScript();
  return send<{ nodes: Array<{ id: string; text: string }> }>(
    "blinkling:text-nodes",
  ).nodes[0];
}

function translate(id: string, value: string) {
  return send<{ applied: number }>("blinkling:translate", {
    nodes: [{ id, text: value }],
  });
}

describe("page script translation freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Element", window.Element);
    vi.stubGlobal("Node", window.Node);
    vi.stubGlobal("Text", window.Text);
    vi.stubGlobal("NodeFilter", window.NodeFilter);
    vi.stubGlobal(
      "MutationObserver",
      class extends window.MutationObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          observers.push(this);
        }
      },
    );
  });

  afterEach(() => {
    for (const observer of observers.splice(0)) observer.disconnect();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "chrome");
    Reflect.deleteProperty(globalThis, "blinklingPageReady");
  });

  it("applies an explicit grammatical omission without replacing inline nodes and restores exact whitespace", async () => {
    document.body.innerHTML =
      '<p> \n<span>この記事は</span><a href="#verifiable">検証可能</a><span>な</span><a href="#sources">参考文献や出典</a><span>が全く示されていないか、不十分です。</span>\t </p>';
    const paragraph = document.querySelector("p")!;
    const children = [...paragraph.childNodes];
    const fragments = [...paragraph.children];
    const originals = fragments.map((element) => element.firstChild!);
    const originalText = paragraph.textContent;
    await startContentScript();
    const source = send<{ nodes: Array<{ id: string; text: string }> }>(
      "blinkling:text-nodes",
    ).nodes;
    expect(source.map((node) => node.text)).toEqual([
      "この記事は",
      "検証可能",
      "な",
      "参考文献や出典",
      "が全く示されていないか、不十分です。",
    ]);
    const translated = [
      "This article ",
      "does not cite ",
      "",
      "any sources",
      " or has insufficient citations.",
    ];
    expect(
      send("blinkling:translate", {
        nodes: source.map(({ id }, index) => ({
          id,
          text: translated[index],
          ...(index === 2 ? { omit: true } : {}),
        })),
      }),
    ).toMatchObject({ applied: 5, changed: 5, rejected: 0 });
    expect(paragraph.textContent).toBe(
      " \nThis article does not cite any sources or has insufficient citations.\t ",
    );
    expect(paragraph.childNodes.length).toBe(children.length);
    for (const [index, child] of children.entries())
      expect(paragraph.childNodes[index]).toBe(child);
    for (const [index, fragment] of fragments.entries())
      expect(fragment.firstChild).toBe(originals[index]);
    expect(originals[2].nodeValue).toBe("");
    expect(send("blinkling:restore")).toEqual({ restored: 5 });
    expect(paragraph.textContent).toBe(originalText);
    for (const [index, fragment] of fragments.entries())
      expect(fragment.firstChild).toBe(originals[index]);
    expect(document.querySelector("[data-blinkling-translated]")).toBeNull();
  });

  it("recollects every original source ID after an explicit omission without collecting arbitrary empty nodes", async () => {
    document.body.innerHTML =
      "<p> \n<span>検証可能</span><span>な</span><span>出典</span>\t </p>";
    document.querySelector("p")!.appendChild(document.createTextNode(""));
    await startContentScript();
    const source = send<{ nodes: Array<{ id: string; text: string }> }>(
      "blinkling:text-nodes",
    ).nodes;
    expect(source.map(({ text }) => text)).toEqual(["検証可能", "な", "出典"]);
    send("blinkling:translate", {
      nodes: [
        { id: source[0].id, text: "verifiable " },
        { id: source[1].id, text: "", omit: true },
        { id: source[2].id, text: "sources" },
      ],
    });
    expect(
      send<{ nodes: Array<{ id: string; text: string }> }>(
        "blinkling:text-nodes",
      ).nodes,
    ).toEqual(source);
  });

  it("translates a previously omitted fragment into nonempty text on a language change and restores exact originals", async () => {
    document.body.innerHTML =
      "<p> \n<span>検証可能</span><span>な</span><span>出典</span>\t </p>";
    const paragraph = document.querySelector("p")!;
    const children = [...paragraph.childNodes];
    const fragments = [...paragraph.children].map(
      (element) => element.firstChild!,
    );
    const originalText = fragments.map((node) => node.nodeValue);
    const originalParagraph = paragraph.textContent;
    await startContentScript();
    const source = send<{ nodes: Array<{ id: string; text: string }> }>(
      "blinkling:text-nodes",
    ).nodes;
    send("blinkling:translate", {
      nodes: [
        { id: source[0].id, text: "verifiable " },
        { id: source[1].id, text: "", omit: true },
        { id: source[2].id, text: "sources" },
      ],
    });
    expect(fragments[1].nodeValue).toBe("");
    expect(
      send("blinkling:translate", {
        nodes: source.map(({ id }, index) => ({
          id,
          text: ["可验证", "的", "来源"][index],
        })),
      }),
    ).toEqual({
      applied: 3,
      changed: 3,
      rejected: 0,
      skipped: { disconnected: 0, sourceChanged: 0, ineligible: 0 },
    });
    expect(paragraph.textContent).toBe(" \n可验证的来源\t ");
    expect(send("blinkling:restore")).toEqual({ restored: 3 });
    expect(paragraph.textContent).toBe(originalParagraph);
    expect([...paragraph.childNodes]).toEqual(children);
    expect(fragments.map((node) => node.nodeValue)).toEqual(originalText);
    for (const [index, element] of [...paragraph.children].entries())
      expect(element.firstChild).toBe(fragments[index]);
  });

  it.each(["hidden", "private"])(
    "does not recollect or translate a retained omitted node that becomes %s",
    async (state) => {
      const node = await setup();
      send("blinkling:translate", {
        nodes: [{ id: node.id, text: "", omit: true }],
      });
      const paragraph = document.querySelector("p")!;
      if (state === "hidden") paragraph.hidden = true;
      else paragraph.setAttribute("data-private", "");
      expect(send("blinkling:text-nodes")).toEqual({ nodes: [] });
      expect(translate(node.id, "Private overwrite")).toMatchObject({
        applied: 0,
        changed: 0,
        skipped: { ineligible: 1 },
      });
      expect(text.nodeValue).toBe("");
    },
  );

  it.each(["Updated product price", "   "])(
    "does not overwrite or restore a site update after an omission: %j",
    async (updated) => {
      const node = await setup();
      send("blinkling:translate", {
        nodes: [{ id: node.id, text: "", omit: true }],
      });
      text.nodeValue = updated;
      expect(translate(node.id, "Stale translation").applied).toBe(0);
      expect(send("blinkling:restore")).toEqual({ restored: 0 });
      expect(text.nodeValue).toBe(updated);
    },
  );

  it("leaves unchanged provider text available without a restore marker", async () => {
    const node = await setup();
    expect(translate(node.id, node.text).applied).toBe(1);
    expect(document.querySelector("[data-blinkling-translated]")).toBeNull();
    expect(send<{ restored: number }>("blinkling:restore").restored).toBe(0);
    expect(text.nodeValue).toBe(node.text);
  });

  it("restores the original when the translated value is still present", async () => {
    const node = await setup();
    expect(translate(node.id, "Precio original").applied).toBe(1);
    expect(text.nodeValue).toBe("Precio original");

    expect(send<{ restored: number }>("blinkling:restore").restored).toBe(1);
    expect(text.nodeValue).toBe("Original product price");
  });

  it.each(["hidden", "display", "aria", "blank", "spaces"])(
    "restores unchanged original text after a %s translation state",
    async (kind) => {
      const node = await setup();
      const value =
        kind === "blank" ? "" : kind === "spaces" ? "   " : "Translated price";
      expect(translate(node.id, value).applied).toBe(1);
      const paragraph = document.querySelector("p")!;
      if (kind === "hidden") paragraph.hidden = true;
      if (kind === "display") paragraph.style.display = "none";
      if (kind === "aria") paragraph.setAttribute("aria-hidden", "true");
      expect(send<{ restored: number }>("blinkling:restore").restored).toBe(1);
      paragraph.hidden = false;
      paragraph.style.display = "";
      paragraph.removeAttribute("aria-hidden");
      expect(text.nodeValue).toBe("Original product price");
    },
  );

  it.each(["disconnected", "sourceChanged", "ineligible"] as const)(
    "accounts for a delayed translation skipped because of %s",
    async (reason) => {
      const node = await setup();
      if (reason === "disconnected") text.remove();
      if (reason === "sourceChanged") text.nodeValue = "Updated product price";
      if (reason === "ineligible") document.querySelector("p")!.hidden = true;
      expect(translate(node.id, "Translated price")).toEqual({
        applied: 0,
        changed: 0,
        rejected: 0,
        skipped: {
          disconnected: Number(reason === "disconnected"),
          sourceChanged: Number(reason === "sourceChanged"),
          ineligible: Number(reason === "ineligible"),
        },
      });
    },
  );

  it("counts actual writes separately from accepted unchanged values", async () => {
    const node = await setup();
    expect(translate(node.id, node.text)).toMatchObject({
      applied: 1,
      changed: 0,
    });
    expect(translate(node.id, "Translated price")).toMatchObject({
      applied: 1,
      changed: 1,
    });
    expect(translate("unknown", "Translated price")).toMatchObject({
      applied: 0,
      rejected: 1,
    });
  });

  it("does not apply a delayed translation over a site update", async () => {
    const node = await setup();
    text.nodeValue = "Updated product price";

    expect(translate(node.id, "Precio original").applied).toBe(0);
    expect(text.nodeValue).toBe("Updated product price");
  });

  it("does not restore over a site update made after translation", async () => {
    const node = await setup();
    translate(node.id, "Precio original");
    text.nodeValue = "$19.99";

    expect(send<{ restored: number }>("blinkling:restore").restored).toBe(0);
    expect(text.nodeValue).toBe("$19.99");
  });

  it("reports an oversized source instead of silently skipping it", async () => {
    await setup();
    const original = "Source passage. ".repeat(800);
    text.nodeValue = original;
    expect(send("blinkling:text-nodes")).toEqual({
      error: "translation_incomplete",
    });
    expect(text.nodeValue).toBe(original);
  });

  it("recollects changed source content and retranslates from the refreshed original", async () => {
    const first = await setup();
    translate(first.id, "Precio original");
    text.nodeValue = "Updated product price";
    const refreshed = send<{ nodes: Array<{ id: string; text: string }> }>(
      "blinkling:text-nodes",
    ).nodes[0];

    expect(refreshed.text).toBe("Updated product price");
    expect(refreshed.id).not.toBe(first.id);
    expect(translate(refreshed.id, "Prix actualisé").applied).toBe(1);
    expect(send<{ restored: number }>("blinkling:restore").restored).toBe(1);
    expect(text.nodeValue).toBe("Updated product price");
  });

  it("does not apply or restore text after a node becomes private", async () => {
    const node = await setup();
    translate(node.id, "Precio original");
    document.querySelector("p")!.setAttribute("data-private", "");

    expect(translate(node.id, "Private overwrite").applied).toBe(0);
    expect(send<{ restored: number }>("blinkling:restore").restored).toBe(0);
    expect(text.nodeValue).toBe("Precio original");
  });

  it("ignores an outstanding response after recollection changes the node identity", async () => {
    const first = await setup();
    text.nodeValue = "Current product price";
    const refreshed = send<{ nodes: Array<{ id: string; text: string }> }>(
      "blinkling:text-nodes",
    ).nodes[0];

    expect(translate(first.id, "Stale translation").applied).toBe(0);
    expect(text.nodeValue).toBe("Current product price");
    expect(translate(refreshed.id, "Traduction actuelle").applied).toBe(1);
    expect(text.nodeValue).toBe("Traduction actuelle");
  });

  it("invalidates an old response when a restored node is collected again", async () => {
    const first = await setup();
    translate(first.id, "Precio original");
    send("blinkling:restore");
    text.nodeValue = "Current product price";
    const refreshed = send<{ nodes: Array<{ id: string; text: string }> }>(
      "blinkling:text-nodes",
    ).nodes[0];

    expect(refreshed.id).not.toBe(first.id);
    expect(translate(first.id, "Stale translation").applied).toBe(0);
    expect(text.nodeValue).toBe("Current product price");
    expect(translate(refreshed.id, "Traduction actuelle").applied).toBe(1);
  });
});
