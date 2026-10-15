import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectElements, MAX_COLLECTED } from "./elements";

/** jsdom has no layout, so a data-rect="x,y,w,h" attribute stands in for it. */
function rectOf(this: Element): DOMRect {
  const [x = 0, y = 0, width = 0, height = 0] = (
    this.getAttribute("data-rect") ?? ""
  )
    .split(",")
    .map(Number);
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON() {},
  } as DOMRect;
}

describe("page element collector", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      rectOf,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("maps headings, paragraphs and controls with roles, names, text and parents", () => {
    document.body.innerHTML = `
      <main data-rect="0,0,800,600" aria-label="Shop">
        <h1 data-rect="10,10,300,40">Pricing</h1>
        <p data-rect="10,60,400,60">Plans for <b>everyone</b>.</p>
        <a href="https://example.com/docs" data-rect="10,130,80,20">Docs</a>
        <label for="q">Search</label>
        <input id="q" data-rect="10,160,200,24" value="private words" />
        <button data-rect="220,160,60,24">Go</button>
        <img alt="Logo" src="x.png" data-rect="10,200,64,64" />
      </main>`;
    const { elements } = collectElements();
    const byRole = (role: string) => elements.filter((e) => e.role === role);
    expect(byRole("heading")[0]).toMatchObject({
      kind: "heading",
      name: "Pricing",
      text: "Pricing",
      secure: false,
      content: { markdown: "# Pricing" },
      rect: { x: 10, y: 10, width: 300, height: 40 },
    });
    expect(byRole("paragraph")[0].text).toBe("Plans for everyone.");
    expect(byRole("link")[0].content?.markdown).toBe(
      "[Docs](https://example.com/docs)",
    );
    const input = byRole("textbox")[0];
    expect(input).toMatchObject({ kind: "input", name: "Search", text: "" });
    expect(JSON.stringify(elements)).not.toContain("private words");
    expect(byRole("button")[0].name).toBe("Go");
    expect(byRole("img")[0]).toMatchObject({ kind: "image", name: "Logo" });
    const main = byRole("main")[0];
    expect(main.name).toBe("Shop");
    expect(byRole("heading")[0].parentId).toBe(main.id);
    expect(main.parentId).toBeNull();
  });

  it("marks a password input secure with no name, text or content", () => {
    document.body.innerHTML = `
      <form data-rect="0,0,400,300">
        <label for="pw">Your password</label>
        <input id="pw" type="password" value="hunter2" aria-label="Password" placeholder="secret" data-rect="10,40,200,24" />
        <input autocomplete="cc-number" value="4242424242424242" aria-label="Card" data-rect="10,80,200,24" />
        <input autocomplete="one-time-code" value="123456" data-rect="10,120,200,24" />
      </form>`;
    const { elements } = collectElements();
    const secure = elements.filter((e) => e.secure);
    expect(secure).toHaveLength(3);
    for (const field of secure) {
      expect(field.name).toBe("");
      expect(field.text).toBe("");
      expect(field.content).toBeUndefined();
      expect(field.rect.width).toBeGreaterThan(0);
    }
    const text = JSON.stringify(elements);
    for (const leaked of [
      "hunter2",
      "4242",
      "123456",
      "Your password",
      "secret",
    ])
      expect(text).not.toContain(leaked);
  });

  it("treats anything under data-private as secure", () => {
    document.body.innerHTML = `<div data-private><p data-rect="0,0,100,20">my account number</p></div>`;
    const [p] = collectElements().elements;
    expect(p).toMatchObject({ secure: true, text: "", name: "" });
  });

  it("reads code with its language, tables as markdown and formulas as LaTeX and MathML", () => {
    document.body.innerHTML = `
      <pre class="language-ts" data-rect="0,0,300,80"><code>const a = 1;</code></pre>
      <table data-rect="0,100,300,80"><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2|3</td></tr></table>
      <span class="katex" data-rect="0,200,60,20"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span>`;
    const { elements } = collectElements();
    expect(elements.find((e) => e.kind === "code")?.content).toEqual({
      code: "const a = 1;",
      language: "ts",
    });
    expect(elements.find((e) => e.kind === "table")?.content?.markdown).toBe(
      "| A | B |\n| --- | --- |\n| 1 | 2\\|3 |",
    );
    const math = elements.find((e) => e.kind === "math")!;
    expect(math.content?.latex).toBe("x^2");
    expect(math.content?.mathml).toContain("<math");
  });

  it("reports the tag, and reads figures and table cells as their own elements", () => {
    document.body.innerHTML = `
      <figure data-rect="0,0,300,200"><canvas data-rect="0,0,300,160"></canvas><figcaption data-rect="0,160,300,20">Plot</figcaption></figure>
      <table data-rect="0,300,300,40"><tr><th data-rect="0,300,100,20">A</th><td data-rect="100,300,100,20">1</td></tr></table>
      <svg role="img" aria-label="Revenue chart" data-rect="0,400,100,100"></svg>`;
    const { elements } = collectElements();
    const by = (tag: string) => elements.find((e) => e.tag === tag);
    expect(by("figure")).toMatchObject({ role: "figure", kind: "figure" });
    expect(by("canvas")).toMatchObject({ role: "img" });
    expect(by("th")).toMatchObject({ role: "columnheader", text: "A" });
    expect(by("td")).toMatchObject({ role: "cell", text: "1" });
    expect(by("svg")).toMatchObject({ name: "Revenue chart" });
  });

  it("skips hidden, empty and off-screen elements and the Blink overlay", () => {
    document.body.innerHTML = `
      <p data-rect="0,0,100,20">shown</p>
      <p hidden data-rect="0,30,100,20">hidden</p>
      <p style="display:none" data-rect="0,60,100,20">none</p>
      <p data-rect="0,90,0,0">empty</p>
      <p data-rect="0,5000,100,20">below the fold</p>
      <div data-blinkling-overlay><p data-rect="0,120,100,20">overlay</p></div>`;
    expect(collectElements().elements.map((e) => e.text)).toEqual(["shown"]);
  });

  it("reads same-origin frames in page coordinates and counts cross-origin ones", () => {
    document.body.innerHTML = `<iframe id="f" data-rect="100,50,400,300"></iframe><iframe id="g" data-rect="0,400,10,10"></iframe>`;
    const frame = document.getElementById("f") as HTMLIFrameElement;
    frame.contentDocument!.body.innerHTML = `<p data-rect="5,6,100,20">inside</p>`;
    vi.spyOn(
      frame.contentDocument!.body.firstElementChild!,
      "getBoundingClientRect",
    ).mockImplementation(rectOf);
    Object.defineProperty(document.getElementById("g"), "contentDocument", {
      get: () => null,
    });
    const page = collectElements();
    const inside = page.elements.find((e) => e.text === "inside")!;
    expect(inside.rect).toMatchObject({ x: 105, y: 56 });
    expect(page.skippedFrames).toBe(1);
  });

  it("reads open shadow roots", () => {
    const host = document.createElement("div");
    host.setAttribute("data-rect", "0,0,200,50");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<button data-rect="4,4,60,20">Inside</button>`;
    expect(collectElements().elements.map((e) => e.name)).toContain("Inside");
  });

  it("caps the list and keeps what is under the pointer", () => {
    document.body.innerHTML = Array.from(
      { length: MAX_COLLECTED + 100 },
      (_, i) => `<p data-rect="0,${i % 300},100,10">p${i}</p>`,
    ).join("");
    expect(collectElements().elements).toHaveLength(MAX_COLLECTED);
    const near = collectElements(document, {
      near: { x: 5, y: 295 },
      limit: 5,
    });
    expect(near.elements).toHaveLength(5);
    expect(
      near.elements.every(
        (e) => e.rect.y <= 295 && e.rect.y + e.rect.height >= 295,
      ),
    ).toBe(true);
  });
});
