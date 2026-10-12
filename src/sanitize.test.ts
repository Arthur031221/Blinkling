import { describe, expect, it } from "vitest";
import { safeMarkdown } from "./sanitize";
describe("safe markdown", () => {
  it("keeps ordinary formatting and safe links", () => {
    const html = safeMarkdown("[guide](https://example.com) **clear**");
    expect(html).toContain("<strong>clear</strong>");
    expect(html).toContain("https://example.com");
  });
  it("removes raw markup, script payloads, and unsafe protocols", () => {
    const html = safeMarkdown(
      "<img src=x onerror=alert(1)> [click](javascript:alert(2))",
    );
    expect(html).not.toMatch(/<img|onerror|javascript:/i);
  });
});
