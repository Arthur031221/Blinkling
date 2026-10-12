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
});
