import { describe, expect, it } from "vitest";
import { readerLocales } from "./reader-locales";
import { parseReaderPdfUrl, isReaderPdfCandidate } from "./reader-url";

describe("reader PDF URLs", () => {
  it.each([
    "https://arxiv.org/pdf/1706.03762",
    "https://arxiv.org/pdf/1706.03762v7?download=true",
    "https://docs.example.test/PAPER.PDF?download=1",
  ])("offers the reader for PDF link %s", (url) => {
    expect(isReaderPdfCandidate(url)).toBe(true);
  });

  it.each([
    "https://arxiv.org/abs/1706.03762",
    "https://arxiv.org.evil.test/pdf/1706.03762",
    "https://example.test/page?next=paper.pdf",
    "file:///tmp/paper.pdf",
  ])("does not classify non PDF page %s as a reader link", (url) => {
    expect(isReaderPdfCandidate(url)).toBe(false);
  });

  it("accepts HTTP(S) URLs", () => {
    const parsed = parseReaderPdfUrl(
      "https://docs.example.test:8443/a/file.pdf",
    );

    expect(parsed?.href).toBe("https://docs.example.test:8443/a/file.pdf");
  });

  it.each([
    "",
    "file:///tmp/file.pdf",
    "ftp://docs.example.test/file.pdf",
    "https://user:secret@docs.example.test/file.pdf",
    "not a URL",
  ])("rejects unsafe or unsupported URL %j", (value) => {
    expect(parseReaderPdfUrl(value)).toBeUndefined();
  });

  it("has the same reader strings in all nine locales", () => {
    const locales = Object.values(readerLocales);
    expect(locales).toHaveLength(9);
    const keys = Object.keys(readerLocales.en).sort();
    for (const strings of locales) {
      expect(Object.keys(strings).sort()).toEqual(keys);
      expect(Object.values(strings).every((text) => text.trim())).toBe(true);
    }
  });
});
