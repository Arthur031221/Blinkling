import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const helper = resolve(
  fileURLToPath(new URL("native/ax-linux/atspi.py", import.meta.url)),
);
const python = spawnSync("python3", ["--version"]).status === 0;

// A stand-in for the accessibility bus: nodes that answer the calls the helper
// makes, so the placeholder handling is tried without a desktop session.
const STUB = `
class Node:
    def __init__(self, role, text=None, name="", links=()):
        self.role, self.text, self.name, self.links = role, text, name, list(links)
    def get_text_iface(self): return None if self.text is None else self
    def get_hypertext_iface(self): return self if self.links else None
    def get_role_name(self): return self.role
    def get_name(self): return self.name

class Text:
    get_character_count = staticmethod(lambda n: len(n.text))
    get_text = staticmethod(lambda n, a, b: n.text[a:b])

class Hypertext:
    @staticmethod
    def get_link_index(n, offset):
        spots = [i for i, c in enumerate(n.text) if c == "\\ufffc"]
        return spots.index(offset) if offset in spots else -1
    get_link = staticmethod(lambda n, i: n.links[i])

class Hyperlink:
    get_object = staticmethod(lambda link, _i: link)

def init(): pass

import sys
Atspi = sys.modules[__name__]
`;

function run(body) {
  const dir = mkdtempSync(join(tmpdir(), "blinkling-atspi-"));
  try {
    mkdirSync(join(dir, "gi", "repository"), { recursive: true });
    writeFileSync(
      join(dir, "gi", "__init__.py"),
      "def require_version(*_a): pass\n",
    );
    writeFileSync(join(dir, "gi", "repository", "__init__.py"), STUB);
    const script = `
import importlib.util, json, sys
sys.path.insert(0, ${JSON.stringify(dir)})
spec = importlib.util.spec_from_file_location("atspi", ${JSON.stringify(helper)})
atspi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atspi)
from gi.repository import Atspi
Node = Atspi.Node
${body}
`;
    const out = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    return JSON.parse(out.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test(
  "a link inside a paragraph shows its words, not a placeholder",
  { skip: !python },
  () => {
    const out = run(`
link = Node("link", text="the chart", name="chart")
image = Node("image", name="a figure")
para = Node("paragraph", text="See \\ufffc, and \\ufffc.", links=[link, image])
print(json.dumps(atspi.text_of(para)))
`);
    assert.equal(out, "See the chart, and a figure.");
  },
);

test(
  "a placeholder that leads nowhere, or leads to a password field, leaves nothing",
  { skip: !python },
  () => {
    const out = run(`
secret = Node("password text", text="hunter2")
para = Node("paragraph", text="a \\ufffc b \\ufffc c", links=[secret])
print(json.dumps(atspi.text_of(para)))
`);
    assert.equal(out, "a  b  c");
  },
);

test("plain text passes through unchanged", { skip: !python }, () => {
  const out = run(
    `print(json.dumps(atspi.text_of(Node("static", text="plain"))))`,
  );
  assert.equal(out, "plain");
});
