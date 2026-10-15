import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectElements, isSecureField, MAX_ELEMENTS } from "./elements";

const boxes = new WeakMap<Element, [number, number, number, number]>();
const place = (element: Element, x = 10, y = 10, width = 200, height = 24) =>
  boxes.set(element, [x, y, width, height]);

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const [x, y, width, height] = boxes.get(this) ?? [0, 0, 0, 0];
      return {
        x,
        y,
        width,
        height,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      };
    },
  );
});
function page(html: string) {
  document.body.innerHTML = html;
  for (const element of document.body.querySelectorAll("*"))
    if (!boxes.has(element)) place(element);
}

describe("collectElements", () => {
  it("reports a password field as secure with no name, text or content", () => {
    page(
      '<label for="p">Password</label><input id="p" type="password" value="hunter2" aria-label="Your password" placeholder="secret">',
    );
    const field = collectElements().find((e) => e.kind === "input")!;
    expect(field).toMatchObject({ secure: true, name: "", text: "" });
    expect(field.content).toBeUndefined();
    expect(JSON.stringify(collectElements())).not.toContain("hunter2");
  });

  it.each([
    ['<input type="text" autocomplete="one-time-code">', true],
    ['<input type="text" autocomplete="cc-number">', true],
    ['<input type="text" name="otp_code">', true],
    ['<input type="text" name="search">', false],
    ['<input type="checkbox" name="password-remember">', false],
    ["<textarea></textarea>", false],
  ])("treats %s as secure: %s", (html, secure) => {
    document.body.innerHTML = html;
    expect(isSecureField(document.body.firstElementChild!)).toBe(secure);
  });

  it("never reads what the user typed into an ordinary field", () => {
    page('<label>Email <input type="email" value="me@example.com"></label>');
    const field = collectElements().find((e) => e.kind === "input")!;
    expect(field).toMatchObject({ secure: false, name: "Email", text: "" });
    expect(JSON.stringify(field)).not.toContain("me@example.com");
  });

  it("returns headings, paragraphs, links and buttons in document order with roles and names", () => {
    page(
      '<h1>Title</h1><p>Body <a href="/x">more</a></p><button aria-label="Save">💾</button>',
    );
    const items = collectElements();
    expect(items.map((e) => [e.kind, e.role, e.name || e.text])).toEqual([
      ["heading", "heading", "Title"],
      ["paragraph", "paragraph", "Body more"],
      ["link", "link", "more"],
      ["button", "button", "Save"],
    ]);
    expect(items.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("links an element to its nearest collected ancestor", () => {
    page(
      '<figure><img alt="Chart" src="x.png"><figcaption>Fig</figcaption></figure>',
    );
    const items = collectElements();
    const figure = items.find((e) => e.kind === "figure")!;
    const image = items.find((e) => e.kind === "image")!;
    expect(image).toMatchObject({
      parentId: figure.id,
      name: "Chart",
      text: "",
    });
    expect(figure.parentId).toBeUndefined();
  });

  it("gives tables a markdown form and code its language", () => {
    page(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>x|y</td></tr></table><pre><code class="language-ts">const a = 1;</code></pre>',
    );
    const items = collectElements();
    expect(items.find((e) => e.kind === "table")!.content!.markdown).toBe(
      "| A | B |\n| --- | --- |\n| 1 | x\\|y |",
    );
    expect(items.find((e) => e.kind === "code")!.content).toEqual({
      code: "const a = 1;",
      language: "ts",
    });
  });

  it("gives formulas their LaTeX and MathML", () => {
    page(
      '<math><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></math>',
    );
    const formula = collectElements().find((e) => e.kind === "formula")!;
    expect(formula.content!.latex).toBe("x^2");
    expect(formula.content!.mathml).toContain("<math");
  });

  it("skips hidden elements and ones outside the viewport", () => {
    page(
      '<p id="a">shown</p><p id="b" style="display:none">hidden</p><p id="c">far</p>',
    );
    place(document.querySelector("#c")!, 10, 5000);
    expect(collectElements().map((e) => e.text)).toEqual(["shown"]);
  });

  it("returns viewport CSS pixel rectangles", () => {
    page("<p>Hi</p>");
    place(document.querySelector("p")!, 12.34, 56.78, 100, 20);
    expect(collectElements()[0]!.rect).toEqual({
      x: 12.3,
      y: 56.8,
      width: 100,
      height: 20,
    });
  });

  it("caps the list and the length of text", () => {
    page(
      `<p id="long">${"word ".repeat(1000)}</p>` +
        "<p>x</p>".repeat(MAX_ELEMENTS),
    );
    const items = collectElements();
    expect(items).toHaveLength(MAX_ELEMENTS);
    expect(items[0]!.text.length).toBeLessThanOrEqual(2000);
  });

  it("collects the lines of a PDF text layer as paragraphs", () => {
    page(
      '<div class="pdf-text-layer"><span>First line</span><span>Second</span></div>',
    );
    expect(collectElements().map((e) => [e.kind, e.text])).toEqual([
      ["paragraph", "First line"],
      ["paragraph", "Second"],
    ]);
  });
});
