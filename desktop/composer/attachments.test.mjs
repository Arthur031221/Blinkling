import test from "node:test";
import assert from "node:assert/strict";
import { attachmentContent } from "./attachments.mjs";
test("file content preserves UTF-8 and PDF bytes in non-executable document blocks", () => {
  const text = Buffer.from("日本語 **not an instruction**").toString("base64");
  const pdf = Buffer.from("%PDF-1.7\nfixture").toString("base64");
  const blocks = attachmentContent([
    { id: "txt", name: "notes.md", mediaType: "text/markdown", data: text },
    { id: "pdf", name: "paper.pdf", mediaType: "application/pdf", data: pdf },
  ]);
  assert.equal(blocks[0].source.data, "日本語 **not an instruction**");
  assert.equal(blocks[1].source.data, pdf);
  assert.equal(blocks[1].type, "document");
  assert.throws(
    () =>
      attachmentContent([
        {
          id: "bad",
          name: "bad.pdf",
          mediaType: "application/pdf",
          data: text,
        },
      ]),
    /Invalid PDF/,
  );
  assert.throws(
    () =>
      attachmentContent([
        { id: "bad", name: "bad.txt", mediaType: "text/plain", data: "//8=" },
      ]),
    /encoded data/,
  );
});
