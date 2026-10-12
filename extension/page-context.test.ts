import { beforeEach, describe, expect, it } from "vitest";
import { buildPageContext, stableElementId } from "./page-context";

describe("bounded page context", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("maps headings and controls with stable document-relative ids and rectangles", () => {
    document.body.innerHTML =
      '<h1>Welcome</h1><button aria-label="Save">✓</button><a href="#">Read more</a>';
    const button = document.querySelector("button")!;
    expect(stableElementId(button)).toBe(stableElementId(button));
    const context = buildPageContext(document);
    expect(context.elements.map((item) => item.text)).toEqual([
      "Welcome",
      "Save",
      "Read more",
    ]);
    expect(context.elements[1].role).toBe("button");
    expect(context.elements[0].rect).toHaveLength(4);
  });

  it("omits editable/private/form values and reports password presence", () => {
    document.body.innerHTML =
      '<p>Public paragraph</p><p data-private>Secret note</p><div contenteditable="true">Draft text</div><input type="text" value="private form value"><input type="password">';
    const context = buildPageContext(document);
    expect(context.text).toContain("Public paragraph");
    expect(context.text).not.toMatch(/Secret|Draft|private form value/);
    expect(context.hasPassword).toBe(true);
  });

  it("caps element and text capture", () => {
    document.body.innerHTML = `${"<button>Item</button>".repeat(140)}<p>${"x".repeat(25_000)}</p>`;
    const context = buildPageContext(document);
    expect(context.elements).toHaveLength(120);
    expect(context.text.length).toBeLessThanOrEqual(24_000);
  });

  it("ignores hidden nodes and the extension overlay", () => {
    document.body.innerHTML =
      "<p>Visible</p><p hidden>Hidden words</p><div data-glimpselet-overlay><p>Overlay words</p></div>";
    const context = buildPageContext(document);
    expect(context.text).toContain("Visible");
    expect(context.text).not.toMatch(/Hidden|Overlay/);
  });
  it("omits hidden and sensitive descendants from labels and page text", () => {
    document.body.innerHTML =
      '<button>Export <span data-private>secret token</span><span hidden>private hint</span></button><div style="display:none"><p>Hidden descendant</p></div>';
    const context = buildPageContext(document);
    expect(context.elements[0].text).toBe("Export");
    expect(context.text).not.toMatch(/secret|private|Hidden/);
  });

  it("limits PDF context to the rendered page with stable selectable text ids", () => {
    document.body.innerHTML =
      '<button>Reader toolbar</button><section data-glimpselet-reader-page><div class="pdf-text-layer"><span role="presentation">Paper title</span><span role="presentation">Section text</span></div></section>';
    const context = buildPageContext(document);
    expect(
      context.elements.every((element) => element.role === "paragraph"),
    ).toBe(true);
    expect(context.text).toBe("Paper title Section text");
    expect(context.elements.map((item) => item.text)).toEqual([
      "Paper title",
      "Section text",
    ]);
  });
});
