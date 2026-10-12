import { describe, expect, it } from "vitest";
import { safeMarkdown } from "./sanitize";
describe("safe markdown", () => {
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
