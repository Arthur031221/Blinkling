import { describe, expect, it } from "vitest";
import { safeMarkdown } from "./sanitize";
describe("safe markdown", () => {
  it("keeps CJK emphasis alongside links, tables and sanitized hostile markup", () => {
    const container = document.createElement("div");
    container.innerHTML = safeMarkdown(
      "**注意：**文字 [**出典：**資料](https://example.com)\n\n|項目|説明|\n|---|---|\n|一|**重點：**內容|\n\n**警告：**內容<img src=x onerror=alert(1)><script>alert(2)</script>",
    );
    expect(container.querySelectorAll("strong")).toHaveLength(4);
    expect(container.querySelector("a")!.getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    expect(container.querySelector("td strong")!.textContent).toBe("重點：");
    expect(container.querySelector("script,img,[onerror]")).toBeNull();
    expect(safeMarkdown("**注意：**文字 *emphasis* **bold**")).toContain(
      "<em>emphasis</em> <strong>bold</strong>",
    );
    expect(safeMarkdown("**Note:**adjacent")).not.toContain("<strong>");
  });
  it.each([
    ["**不確定之處：**橫幅右側文字被截斷", "不確定之處："],
    ["**重点：**右侧文字被截断", "重点："],
    ["**注意：**右側の文字が切れています", "注意："],
    ["前文**重點：**接著說明", "重點："],
    ["**結論。**下一句", "結論。"],
    ["**주의：**오른쪽 글자가 잘렸습니다", "주의："],
  ])("renders punctuation-adjacent CJK bold in %s", (source, label) => {
    const html = safeMarkdown(source);
    expect(html).toContain(`<strong>${label}</strong>`);
    expect(html).not.toContain("**");
  });

  it("preserves literal/code asterisks and incomplete streamed CJK emphasis", () => {
    const source =
      "`**注意：**文字`\n\n```text\n**注意：**文字\n```\n\n\\*\\*注意：\\*\\*文字\n\n**注意：*";
    const container = document.createElement("div");
    container.innerHTML = safeMarkdown(source);
    expect(container.querySelectorAll("strong")).toHaveLength(0);
    expect(container.querySelector("code")!.textContent).toBe("**注意：**文字");
    expect(container.querySelector("pre code")!.textContent).toContain(
      "**注意：**文字",
    );
    expect(container.textContent).toContain("**注意：**文字");
    expect(container.textContent).toContain("**注意：*");
    container.innerHTML = safeMarkdown("Inline <code>**注意：**文字</code>.");
    expect(container.querySelector("code strong")).toBeNull();
    expect(container.querySelector("code")!.textContent).toBe("**注意：**文字");
  });

  it("keeps ordinary formatting and safe links", () => {
    const html = safeMarkdown("[guide](https://example.com) **clear**");
    expect(html).toContain("<strong>clear</strong>");
    expect(html).toContain("https://example.com");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("keeps semantic Markdown tables and ordinary formatting", () => {
    const html = safeMarkdown(
      "**Comparison**\n\n| Feature | Basic | Pro |\n| --- | --- | --- |\n| Speed | **Fast** | *Faster* |",
    );
    expect(html).toContain("<strong>Comparison</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<tr>");
    expect(html).toContain("<th>Feature</th>");
    expect(html).toContain("<th>Basic</th>");
    expect(html).toContain("<strong>Fast</strong>");
    expect(html).toContain("<em>Faster</em>");
  });
  it("opens external links without exposing the panel as their opener", () => {
    const html = safeMarkdown(
      '<a href="//example.com/plans" target="panel" rel="opener">Plans</a>',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('target="panel"');
  });
  it("removes images and executable markup", () => {
    const html = safeMarkdown(
      "<img src=x onerror=alert(1)> <script>alert(2)</script> [click](javascript:alert(3)) [data](data:text/html,payload)",
    );
    expect(html).not.toMatch(/<img|<script|onerror|javascript:|data:text/i);
  });
  it("removes relative links that would navigate the local panel", () => {
    for (const href of [
      "/settings",
      "relative",
      "../settings",
      "#settings",
      "?backend=api",
      "https:relative",
      "http:/settings",
      "http:relative",
    ]) {
      const container = document.createElement("div");
      container.innerHTML = safeMarkdown(`<a href="${href}">Settings</a>`);
      expect(container.querySelector("a")?.getAttribute("href")).toBeNull();
    }
    const html = safeMarkdown(
      "[Site](HTTPS://example.com) [Email](mailto:user@example.com)",
    );
    expect(html).toContain('href="HTTPS://example.com"');
    expect(html).toContain('href="mailto:user@example.com"');
  });
  it("removes raw markup, script payloads, and unsafe protocols", () => {
    const html = safeMarkdown(
      '<table onclick="alert(1)" target="_blank" rel="opener"><tr><td onmouseover="alert(2)">unsafe</td></tr></table> <a href="/relative" target="_blank" rel="opener">relative</a> <a href="javascript:alert(3)" onclick="alert(4)">unsafe link</a>',
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<td>unsafe</td>");
    expect(html).not.toMatch(/onclick|onmouseover|javascript:/i);
    expect(html).not.toMatch(/target=|rel=/i);
  });
  it("removes malformed links that become relative after URL parsing", () => {
    for (const href of [
      "h t t p s://example.com/plans",
      "h&#32;ttps://example.com/plans",
      "https&#12;://example.com/plans",
      "https&#11;://example.com/plans",
      "//",
      "https://",
      "https://[invalid",
      "https://example.com:invalid",
      "https://example .com/plans",
      "java&#9;script:alert(1)",
      "data:text/html,payload",
    ]) {
      const container = document.createElement("div");
      container.innerHTML = safeMarkdown(
        `<a href="${href}" target="panel" rel="opener">Link</a>`,
      );
      const link = container.querySelector("a")!;
      expect(link.getAttribute("href"), href).toBeNull();
      expect(link.getAttribute("target"), href).toBeNull();
      expect(link.getAttribute("rel"), href).toBeNull();
    }
  });
  it("normalizes browser-ignored whitespace before opening external links", () => {
    for (const [href, expected] of [
      ["&#9;https://example.com/plans", "https://example.com/plans"],
      ["h&#10;ttps://example.com/plans", "https://example.com/plans"],
      ["ht&#13;tps://example.com/plans", "https://example.com/plans"],
      ["https:&#9;//example.com/plans", "https://example.com/plans"],
      [" https://example.com/plans ", "https://example.com/plans"],
      ["&#160;https://example.com/plans", "https://example.com/plans"],
      ["&#13;//example.com/plans", "//example.com/plans"],
      ["//example.com/plans&#10;", "//example.com/plans"],
      ["HTTPS://example.com/plans", "HTTPS://example.com/plans"],
    ]) {
      const container = document.createElement("div");
      container.innerHTML = safeMarkdown(`<a href="${href}">Link</a>`);
      const link = container.querySelector("a")!;
      expect(link.getAttribute("href"), href).toBe(expected);
      expect(link.getAttribute("target"), href).toBe("_blank");
      expect(link.getAttribute("rel"), href).toBe("noopener noreferrer");
    }
  });
});
