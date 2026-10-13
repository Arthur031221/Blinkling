import { describe, expect, it } from "vitest";
import { readerLocales } from "./reader-locales";
import { parseReaderPdfUrl, readerUrlOriginPattern } from "./reader-url";

describe("reader PDF URL permissions", () => {
  it("accepts HTTP(S) URLs and requests access only for their origin", () => {
    const parsed = parseReaderPdfUrl(
      "https://docs.example.test:8443/a/file.pdf",
    );

    expect(parsed?.href).toBe("https://docs.example.test:8443/a/file.pdf");
    expect(readerUrlOriginPattern(parsed!)).toBe(
      "https://docs.example.test:8443/*",
    );
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

  it("provides actionable permission text in all nine reader locales", () => {
    const permissionMessages = Object.values(readerLocales).map(
      (strings) => strings.permissionRequired,
    );

    expect(permissionMessages).toHaveLength(9);
    expect(permissionMessages.every((message) => message.length > 0)).toBe(
      true,
    );
    expect(new Set(permissionMessages).size).toBe(9);
  });
});
