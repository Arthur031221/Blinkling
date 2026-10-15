import { beforeEach, describe, expect, it } from "vitest";
import { PageTranslation, TRANSLATED_ATTRIBUTE } from "./translate";

beforeEach(() => {
  document.documentElement.removeAttribute(TRANSLATED_ATTRIBUTE);
  document.body.innerHTML =
    "<h1>Hello world</h1><p>First <b>bold</b> text.</p><script>var a=1</script><pre>code()</pre><textarea>typed</textarea><p>2024</p>";
});

describe("PageTranslation", () => {
  it("collects readable text nodes and skips code, fields, scripts and bare numbers", () => {
    expect(new PageTranslation().collect()).toEqual([
      "Hello world",
      "First ",
      "bold",
      " text.",
    ]);
  });

  it("writes translations in place, keeping the spacing, and marks the page", () => {
    const translation = new PageTranslation();
    translation.collect();
    translation.apply(0, ["你好，世界", "首先", "粗體", "文字。"]);
    expect(document.body.textContent).toContain("你好，世界");
    expect(document.querySelector("p")!.firstChild!.textContent).toBe("首先 ");
    expect(document.documentElement.getAttribute(TRANSLATED_ATTRIBUTE)).toBe(
      "true",
    );
  });

  it("restores exactly the original text and clears the mark", () => {
    const before = document.body.innerHTML;
    const translation = new PageTranslation();
    translation.collect();
    translation.apply(0, ["a", "b", "c", "d"]);
    translation.restore();
    expect(document.body.innerHTML).toBe(before);
    expect(document.documentElement.hasAttribute(TRANSLATED_ATTRIBUTE)).toBe(
      false,
    );
    expect(translation.active).toBe(false);
  });

  it("leaves a node the page rewrote after translation alone, on apply and on restore", () => {
    const translation = new PageTranslation();
    translation.collect();
    translation.apply(0, ["A", "B", "C", "D"]);
    const heading = document.querySelector("h1")!.firstChild as Text;
    heading.data = "Live update";
    translation.restore();
    expect(heading.data).toBe("Live update");
  });

  it("ignores empty or non-string translations and nodes that left the page", () => {
    const translation = new PageTranslation();
    translation.collect();
    document.querySelector("h1")!.remove();
    expect(
      translation.apply(0, ["gone", "", 5 as unknown as string, "x"]),
    ).toBe(1);
  });

  it("collects the original text again after a translation", () => {
    const translation = new PageTranslation();
    translation.collect();
    translation.apply(0, ["A", "B", "C", "D"]);
    expect(translation.collect()[0]).toBe("Hello world");
  });
});
