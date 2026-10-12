import { describe, expect, it } from "vitest";
import type { PageContext } from "./page-context";
import { pageRevision } from "./page-revision";

const context = (): PageContext => ({
  url: "https://example.test/article",
  title: "Article",
  text: "Public article text",
  hasPassword: false,
  elements: [
    {
      id: "g1",
      role: "button",
      text: "Continue",
      rect: [10, 20, 80, 24],
    },
  ],
});

describe("pageRevision", () => {
  it("changes for semantic content but ignores geometry and generated ids", () => {
    const original = context();
    const moved = context();
    moved.elements[0].rect = [0, 250, 95, 24];
    moved.elements[0].id = "g98";
    expect(pageRevision(moved)).toBe(pageRevision(original));

    moved.text = "A fresh article revision";
    expect(pageRevision(moved)).not.toBe(pageRevision(original));
  });

  it("includes accessible semantic labels, title and URL", () => {
    const original = context();
    for (const change of [
      (value: PageContext) => (value.title = "New title"),
      (value: PageContext) => (value.url = "https://example.test/next"),
      (value: PageContext) => (value.elements[0].text = "Save"),
    ]) {
      const changed = context();
      change(changed);
      expect(pageRevision(changed)).not.toBe(pageRevision(original));
    }
  });

  it("tracks the password-page privacy gate without reading its value", () => {
    const original = context();
    const sensitive = context();
    sensitive.hasPassword = true;
    expect(pageRevision(sensitive)).not.toBe(pageRevision(original));
  });

  it("bounds oversized context values deterministically", () => {
    const long = context();
    long.text = "x".repeat(100_000);
    const samePrefix = context();
    samePrefix.text = `${"x".repeat(24_000)}hidden tail`;
    expect(pageRevision(long)).toBe(pageRevision(samePrefix));
  });
});
