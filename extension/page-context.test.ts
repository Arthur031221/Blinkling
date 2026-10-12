import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPageContext,
  contextTextNode,
  contextRangeText,
  stableElementId,
  textForElement,
} from "./page-context";

describe("bounded page context", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.each([
    "data-private",
    "data-sensitive",
    "contenteditable",
    'contenteditable="plaintext-only"',
    "hidden",
    'aria-hidden="true"',
    'style="display:none"',
    'role="option"',
    'role="combobox"',
  ])(
    "rejects selected text crossing %s between public endpoints",
    (attribute) => {
      document.body.innerHTML = `<p>Public start.</p><div ${attribute}>PRIVATE_VALUE</div><p>Public end.</p>`;
      const paragraphs = document.querySelectorAll("p");
      const range = document.createRange();
      range.setStart(paragraphs[0].firstChild!, 0);
      range.setEnd(paragraphs[1].firstChild!, 11);
      expect(contextRangeText(range)).toBe("");
    },
  );

  it("accepts element boundaries, public whitespace and partial text without including an adjacent private node", () => {
    document.body.innerHTML =
      "<p>Public <b>start.</b> </p> <p>Public end.</p><div data-private>PRIVATE_VALUE</div>";
    const range = document.createRange();
    range.setStart(document.body, 0);
    range.setEnd(document.body, 3);
    expect(contextRangeText(range)).toBe("Public start.  Public end.");
    range.setStart(document.querySelector("p")!.firstChild!, 0);
    range.setEnd(document.querySelector("b")!.firstChild!, 5);
    expect(contextRangeText(range)).toBe("Public start");
  });

  it("rechecks privacy, disconnection and the selection length after a popover opens", () => {
    document.body.innerHTML = "<p>Public start.</p>";
    const paragraph = document.querySelector("p")!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    expect(contextRangeText(range)).toBe("Public start.");
    paragraph.setAttribute("data-private", "");
    expect(contextRangeText(range)).toBe("");
    paragraph.removeAttribute("data-private");
    paragraph.firstChild!.nodeValue = "a".repeat(5001);
    range.selectNodeContents(paragraph);
    expect(contextRangeText(range)).toBe("");
    paragraph.remove();
    expect(contextRangeText(range)).toBe("");
  });

  it.each(["data-private", "contenteditable", "hidden"])(
    "rejects a shadow selection whose host is %s",
    (attribute) => {
      document.body.innerHTML = `<div ${attribute}></div>`;
      const shadow = document
        .querySelector("div")!
        .attachShadow({ mode: "open" });
      shadow.innerHTML = "<p>PRIVATE_SHADOW_TEXT</p>";
      const range = document.createRange();
      range.selectNodeContents(shadow.querySelector("p")!);
      expect(contextRangeText(range)).toBe("");
    },
  );

  it("rejects public text assigned to a private slot", () => {
    document.body.innerHTML = "<div><p>PRIVATE_SLOTTED_TEXT</p></div>";
    const shadow = document
      .querySelector("div")!
      .attachShadow({ mode: "open" });
    shadow.innerHTML = "<section data-private><slot></slot></section>";
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    expect(contextRangeText(range)).toBe("");
  });

  it("rejects descendants of ignored SVG ancestors", () => {
    document.body.innerHTML =
      "<p>Public start.</p><svg><text><tspan>SVG_TEXT</tspan></text></svg><p>Public end.</p>";
    const range = document.createRange();
    range.selectNodeContents(document.body);
    expect(contextRangeText(range)).toBe("");
  });

  it("accepts a public range rooted at the document", () => {
    document.body.innerHTML = "<p>Public text.</p>";
    const range = document.createRange();
    range.selectNodeContents(document);
    expect(contextRangeText(range)).toBe("Public text.");
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

  it("omits native and ARIA choice text while preserving field labels and article text", () => {
    document.body.innerHTML =
      '<p>Public article text</p><label for="region">Region</label><select id="region"><option>PRIVATE_NATIVE_OPTION_7X9</option></select><div role="combobox" aria-label="Delivery method"><div role="option">PRIVATE_ARIA_OPTION_4K2</div></div><button>Open menu</button>';
    const context = buildPageContext(document);

    expect(context.text).not.toMatch(
      /PRIVATE_NATIVE_OPTION_7X9|PRIVATE_ARIA_OPTION_4K2/,
    );
    expect(
      context.elements.map((element) => element.text).join(" "),
    ).not.toMatch(/PRIVATE_NATIVE_OPTION_7X9|PRIVATE_ARIA_OPTION_4K2/);
    expect(context.text).toContain("Public article text");
    expect(context.elements.map((element) => element.text)).toContain("Region");
    expect(context.elements.map((element) => element.text)).toContain(
      "Delivery method",
    );
    expect(context.elements.map((element) => element.text)).toContain(
      "Open menu",
    );
    expect(contextTextNode(document.querySelector("option")!.firstChild!)).toBe(
      false,
    );
    expect(
      contextTextNode(document.querySelector('[role="option"]')!.firstChild!),
    ).toBe(false);
  });

  it("caps element and text capture", () => {
    document.body.innerHTML = `${"<button>Item</button>".repeat(140)}<p>${"x".repeat(25_000)}</p>`;
    const context = buildPageContext(document);
    expect(context.elements).toHaveLength(120);
    expect(context.text.length).toBeLessThanOrEqual(24_000);
  });

  it("excludes nested choices, displayed selections and their accessibility labels", () => {
    document.body.innerHTML =
      '<p>Public article</p><label for="choice">Safe field label</label><select id="choice"><optgroup label="PRIVATE_GROUP"><option></option></optgroup></select><div role="option"><span>PRIVATE_NESTED</span><h2 aria-label="PRIVATE_HEADING_LABEL">PRIVATE_HEADING_TEXT</h2></div><div role="combobox" aria-label="Safe dropdown label">PRIVATE_SELECTION<span>PRIVATE_COMBO_CHILD</span></div><button>Safe action</button>';
    const nested = document.createElement("span");
    nested.textContent = "PRIVATE_NATIVE_NESTED";
    document.querySelector("option")!.append(nested);
    const context = buildPageContext(document);
    expect(JSON.stringify(context)).not.toContain("PRIVATE_");
    expect(context.text).toContain("Public article");
    expect(context.elements.map((item) => item.text)).toEqual([
      "Safe field label",
      "Safe dropdown label",
      "Safe action",
    ]);
    expect(textForElement(document.querySelector("h2")!)).toBe("");
    expect(contextTextNode(nested.firstChild!)).toBe(false);
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
