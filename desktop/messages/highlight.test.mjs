import test from "node:test";
import assert from "node:assert/strict";
import { highlight, familyOf } from "./highlight.mjs";

const join = (pieces) => pieces.map(([, t]) => t).join("");
const typeOf = (pieces, text) => pieces.find(([, t]) => t === text)?.[0];

test("the pieces always add up to the source, for every language and for odd input", () => {
  const samples = [
    ["js", "const a = `x ${1}` // note\nfunction f(b) { return b + 0x1F; }"],
    ["python", 'def f(x):\n    """doc\nmore"""\n    return x  # tail'],
    ["bash", 'echo "$HOME" | grep -c \'x\' # c\nif [ -n "${A}" ]; then ok; fi'],
    ["json", '{"a": [1, 2.5e3, true, null], "b": "c"}'],
    ["css", "a:hover { color: #fff; margin: 0 -2px } /* c */ @media (x) {}"],
    ["html", '<div class="a" id=b><!-- c --><br/></div>'],
    ["sql", "SELECT a FROM t WHERE x = 'y' -- c\nLIMIT 3;"],
    ["yaml", "name: x\nlist:\n  - true # c\n"],
    ["diff", "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n same"],
    ["rust", "fn main() { let x: u8 = 1; /* open"],
    ["js", 'const s = "unterminated'],
    ["js", ""],
    ["unknown", "anything at all"],
    [undefined, "plain"],
  ];
  for (const [lang, source] of samples)
    assert.equal(join(highlight(source, lang)), source, String(lang));
});

test("keywords, strings, numbers, comments and calls get their own type", () => {
  const js = highlight(
    'const total = add(1, 2.5); // sum\nlet s = "a\\"b";',
    "ts",
  );
  assert.equal(typeOf(js, "const"), "keyword");
  assert.equal(typeOf(js, "add"), "function");
  assert.equal(typeOf(js, "1"), "number");
  assert.equal(typeOf(js, "2.5"), "number");
  assert.equal(typeOf(js, "// sum"), "comment");
  assert.equal(typeOf(js, '"a\\"b"'), "string");
  const py = highlight("def f(self):\n    return None  # x", "py");
  assert.equal(typeOf(py, "def"), "keyword");
  assert.equal(typeOf(py, "None"), "literal");
  assert.equal(typeOf(py, "# x"), "comment");
});

test("names that merely contain a keyword are not keywords, and words in strings stay strings", () => {
  const js = highlight('const format = "if else";', "js");
  assert.equal(js.find(([, t]) => t.includes("format"))[0], "plain");
  assert.equal(typeOf(js, '"if else"'), "string");
});

test("JSON keys, shell variables, CSS properties, tags and diff lines are told apart", () => {
  assert.equal(typeOf(highlight('{"k": 1}', "json"), '"k"'), "property");
  assert.equal(typeOf(highlight('echo "$A" $B', "sh"), "$B"), "variable");
  assert.equal(
    typeOf(highlight("a { color: red }", "css"), "color"),
    "property",
  );
  const html = highlight('<a href="x">t</a>', "html");
  assert.equal(typeOf(html, "<a"), "tag");
  assert.equal(typeOf(html, "href"), "attr");
  const diff = highlight("+a\n-b\n c", "diff");
  assert.deepEqual(
    diff.map(([type]) => type),
    ["added", "removed", "plain"],
  );
});

test("a fence's info string picks the language, ignoring case and extra words", () => {
  assert.ok(familyOf("TypeScript"));
  assert.ok(familyOf("js title=x"));
  assert.ok(familyOf("python{1,3}"));
  assert.equal(familyOf("klingon"), null);
  assert.equal(familyOf(""), null);
  assert.equal(familyOf(undefined), null);
});
