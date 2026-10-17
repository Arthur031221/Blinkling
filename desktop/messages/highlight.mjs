/** A small syntax highlighter for the code in an answer. It reads one language
 * family at a time and returns [type, text] pieces that cover the source
 * exactly, so nothing is lost or reordered; the card draws each piece in its
 * own span. A language it does not know comes back as one plain piece. */
const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
const C_LIKE = {
  keywords: words(`abstract as async await break case catch class const continue
    debugger default delete do else enum export extends finally for from function
    get if implements import in instanceof interface let new of package private
    protected public return set static super switch this throw try type typeof
    var void while with yield namespace declare readonly override satisfies keyof
    fn impl let mut pub use mod match loop where trait struct unsafe ref move dyn
    crate self func go defer chan range select fallthrough goto map final throws
    synchronized volatile native transient extern inline register sizeof typedef
    union signed unsigned auto template typename virtual operator friend using
    internal sealed partial lock readonly foreach fixed checked is out params
    val var fun object when companion data lateinit by init guard protocol
    extension associatedtype inout rethrows`),
  literals: words("true false null undefined nil None NaN Infinity"),
  line: ["//"],
  block: [["/*", "*/"]],
  quotes: ["'", '"', "`"],
};
const FAMILIES = {
  c: C_LIKE,
  json: {
    keywords: words(""),
    literals: words("true false null"),
    line: [],
    block: [],
    quotes: ['"'],
  },
  python: {
    keywords: words(`and as assert async await break class continue def del elif
      else except finally for from global if import in is lambda nonlocal not or
      pass raise return try while with yield match case`),
    literals: words("True False None self cls"),
    line: ["#"],
    block: [],
    quotes: ["'''", '"""', "'", '"'],
  },
  shell: {
    keywords: words(`if then else elif fi for while until do done case esac in
      function select time return exit export local readonly set unset source alias
      echo cd read shift trap eval exec`),
    literals: words("true false"),
    line: ["#"],
    block: [],
    quotes: ["'", '"', "`"],
    variable: true,
  },
  ruby: {
    keywords:
      words(`alias and begin break case class def defined do else elsif end
      ensure for if in module next not or redo rescue retry return super then undef
      unless until when while yield require include extend attr_accessor puts`),
    literals: words("true false nil self"),
    line: ["#"],
    block: [],
    quotes: ["'", '"', "`"],
  },
  sql: {
    keywords: words(`select from where and or not insert into values update set
      delete create table drop alter add column index join left right inner outer
      full on as group by order having limit offset union all distinct case when
      then else end in is between like exists primary key foreign references
      default unique with returning begin commit rollback view`),
    literals: words("null true false"),
    line: ["--"],
    block: [["/*", "*/"]],
    quotes: ["'", '"'],
    fold: true,
  },
  yaml: {
    keywords: words(""),
    literals: words("true false null yes no on off"),
    line: ["#"],
    block: [],
    quotes: ["'", '"'],
    keys: true,
  },
  css: {
    keywords: words(""),
    literals: words("important inherit initial unset none auto"),
    line: [],
    block: [["/*", "*/"]],
    quotes: ["'", '"'],
    css: true,
  },
  markup: {
    keywords: words(""),
    literals: words(""),
    line: [],
    block: [["<!--", "-->"]],
    quotes: ["'", '"'],
    markup: true,
  },
};
const ALIAS = {
  c: [
    "js javascript jsx mjs cjs ts typescript tsx java c h cpp cc cxx hpp cs csharp",
    "go golang rust rs swift kotlin kt scala dart php groovy objc",
  ],
  python: ["py python python3"],
  shell: ["sh bash zsh shell console fish"],
  ruby: ["rb ruby"],
  sql: ["sql postgres postgresql mysql sqlite"],
  yaml: ["yml yaml toml ini"],
  json: ["json jsonc json5"],
  css: ["css scss sass less"],
  markup: ["html xml svg vue"],
};
const BY_NAME = new Map();
for (const [family, lists] of Object.entries(ALIAS))
  for (const name of lists.join(" ").split(/\s+/))
    BY_NAME.set(name, FAMILIES[family]);
/** The language family for a fence's info string, or null. */
export const familyOf = (lang) =>
  BY_NAME.get(
    String(lang ?? "")
      .trim()
      .split(/[\s{]/)[0]
      .toLowerCase(),
  ) ?? null;
const NUMBER =
  /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)(?:[a-zA-Z%]{0,3})/y;
const WORD = /[A-Za-z_$][\w$-]*/y;
function readQuoted(source, at, quote) {
  const triple = quote.length === 3;
  let i = at + quote.length;
  while (i < source.length) {
    if (source[i] === "\\" && !triple) i += 2;
    else if (source.startsWith(quote, i)) return i + quote.length;
    else if (source[i] === "\n" && !triple && quote !== "`") return i;
    else i++;
  }
  return source.length;
}
function highlightDiff(source) {
  const out = [];
  for (const line of source.split(/(?<=\n)/)) {
    const type = /^(\+\+\+|---|diff |index )/.test(line)
      ? "meta"
      : line.startsWith("@@")
        ? "keyword"
        : line.startsWith("+")
          ? "added"
          : line.startsWith("-")
            ? "removed"
            : "plain";
    out.push([type, line]);
  }
  return out;
}
/** [type, text] pieces covering `source`. Types: plain, comment, string,
 * number, keyword, literal, function, variable, tag, attr, property, added,
 * removed, meta. */
export function highlight(source, lang) {
  const text = String(source);
  if (/^(diff|patch)\b/i.test(String(lang ?? "").trim()))
    return highlightDiff(text);
  const family = familyOf(lang);
  if (!family || text.length > 60000) return [["plain", text]];
  const out = [];
  const push = (type, piece) => {
    if (!piece) return;
    const last = out.at(-1);
    if (last && last[0] === type) last[1] += piece;
    else out.push([type, piece]);
  };
  const fold = family.fold;
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i, i + 4);
    const block = family.block.find(([open]) => text.startsWith(open, i));
    if (block) {
      const end = text.indexOf(block[1], i + block[0].length);
      const stop = end < 0 ? text.length : end + block[1].length;
      push("comment", text.slice(i, stop));
      i = stop;
      continue;
    }
    const line = family.line.find((open) => text.startsWith(open, i));
    if (line && !(line === "#" && family.css)) {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      push("comment", text.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = family.quotes.find((q) => text.startsWith(q, i));
    if (quote) {
      const stop = readQuoted(text, i, quote);
      const isKey =
        (family.keys || family === FAMILIES.json) &&
        /^\s*:/.test(text.slice(stop, stop + 8));
      push(isKey ? "property" : "string", text.slice(i, stop));
      i = stop;
      continue;
    }
    if (family.markup) {
      const tag = /<\/?[A-Za-z][\w:-]*|\/?>/y;
      tag.lastIndex = i;
      const m = tag.exec(text);
      if (m) {
        push("tag", m[0]);
        i += m[0].length;
        continue;
      }
      const attr = /[A-Za-z_:][\w:.-]*(?==)/y;
      attr.lastIndex = i;
      const a = attr.exec(text);
      if (a) {
        push("attr", a[0]);
        i += a[0].length;
        continue;
      }
    }
    if (family.css) {
      const at = /@[A-Za-z-]+/y;
      at.lastIndex = i;
      const m = at.exec(text);
      if (m) {
        push("keyword", m[0]);
        i += m[0].length;
        continue;
      }
      const hex = /#[0-9a-fA-F]{3,8}\b/y;
      hex.lastIndex = i;
      const h = hex.exec(text);
      if (h) {
        push("number", h[0]);
        i += h[0].length;
        continue;
      }
      const prop = /-{0,2}[a-z][\w-]*(?=\s*:)/y;
      prop.lastIndex = i;
      const p = prop.exec(text);
      if (p) {
        push("property", p[0]);
        i += p[0].length;
        continue;
      }
    }
    if (family.variable && text[i] === "$") {
      const v = /\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?*!$-])/y;
      v.lastIndex = i;
      const m = v.exec(text);
      if (m) {
        push("variable", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(text[i]) && !/[\w$]/.test(text[i - 1] ?? " ")) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (m) {
        push("number", m[0]);
        i += m[0].length;
        continue;
      }
    }
    WORD.lastIndex = i;
    const w = WORD.exec(text);
    if (w) {
      const word = fold ? w[0].toLowerCase() : w[0];
      const after = text[i + w[0].length];
      const type = family.keywords.has(word)
        ? "keyword"
        : family.literals.has(w[0])
          ? "literal"
          : family.keys && after === ":"
            ? "property"
            : after === "(" && !family.markup
              ? "function"
              : "plain";
      push(type, w[0]);
      i += w[0].length;
      continue;
    }
    push("plain", text[i] ?? rest[0]);
    i++;
  }
  return out;
}
