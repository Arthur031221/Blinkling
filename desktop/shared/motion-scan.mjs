/** The N6.1 / N6.3 rules as a scanner: durations, easings, spring frequencies
 * and timer delays are written once, in shared/motion.mjs, and only transform
 * and opacity ever animate. motion.test.mjs runs this over the whole tree. */
import { parse } from "acorn";

const TIMERS = new Set(["setTimeout", "setInterval", "setTimer", "schedule"]);
// Spring helpers and the position of their frequency argument.
const SPRINGS = Object.freeze({ spring: 4, stepSpring: 2 });
// Names that hold a motion value; a bare number assigned to one is a literal.
const MOTION_NAME = /(duration|delay|stagger|easing|frequency)$/i;
const ANIMATED = new Set(["transform", "opacity"]);
const KEYFRAME_KEYS = new Set([...ANIMATED, "offset", "easing", "composite"]);
const WAAPI_KEYS = new Set(["duration", "delay", "endDelay", "easing"]);
const TIME = /(?<![\w.-])\d*\.?\d+m?s\b/g;
const CURVE = /cubic-bezier\(|steps\(/;
const KEYWORD =
  /(?<![\w-])(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)(?![\w(-])/;

const nonZeroTime = (text) =>
  [...text.matchAll(TIME)].some(([m]) => Number.parseFloat(m) !== 0);

/** A number built only from number literals, such as 3000 or 2 * 800. */
function constant(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "number")
    return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-") {
    const value = constant(node.argument);
    return value === null ? null : -value;
  }
  if (node.type === "BinaryExpression") {
    const [a, b] = [constant(node.left), constant(node.right)];
    if (a === null || b === null) return null;
    return (
      { "+": a + b, "-": a - b, "*": a * b, "/": a / b }[node.operator] ?? null
    );
  }
  return null;
}

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc") continue;
    if (Array.isArray(value)) for (const v of value) walk(v, visit, node);
    else if (value && typeof value === "object") walk(value, visit, node);
  }
}

const keyName = (node) =>
  node.computed
    ? null
    : node.key?.type === "Identifier"
      ? node.key.name
      : String(node.key?.value);

/** Violations in one JavaScript source: `{ line, rule, text }`. */
export function scanJs(source, { module = true } = {}) {
  const found = [];
  const add = (node, rule, text) =>
    found.push({ line: node.loc.start.line, rule, text });
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: module ? "module" : "script",
    locations: true,
    allowHashBang: true,
  });
  walk(ast, (node, parent) => {
    if (node.type === "CallExpression") {
      const callee = node.callee;
      const name =
        callee.type === "Identifier"
          ? callee.name
          : callee.type === "MemberExpression" && !callee.computed
            ? callee.property.name
            : "";
      if (TIMERS.has(name)) {
        const ms = constant(node.arguments[1]);
        if (ms !== null && ms !== 0)
          add(node, "timer", `${name}(…, ${ms}) needs a token from motion.mjs`);
      }
      if (name in SPRINGS && constant(node.arguments[SPRINGS[name]]) !== null)
        add(node, "spring", `${name} frequency is a literal, use springs.*`);
      if (name === "animate") {
        const [frames, options] = node.arguments;
        if (frames?.type === "ArrayExpression")
          for (const frame of frames.elements)
            for (const prop of frame?.properties ?? []) {
              const key = keyName(prop);
              if (key && !KEYFRAME_KEYS.has(key))
                add(prop, "animated-property", `animate() moves ${key}`);
            }
        for (const prop of options?.properties ?? []) {
          const key = keyName(prop);
          if (!WAAPI_KEYS.has(key)) continue;
          const value = constant(prop.value);
          const text =
            prop.value.type === "Literal" &&
            typeof prop.value.value === "string";
          if ((value !== null && value !== 0) || text)
            add(prop, "literal", `animate() ${key} is a literal`);
        }
      }
    }
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      /^(transition|animation)/.test(node.left.property?.name ?? "")
    ) {
      const value = node.right;
      const text =
        value.type === "Literal"
          ? String(value.value)
          : value.type === "TemplateLiteral"
            ? value.quasis.map((q) => q.value.cooked).join("0")
            : "";
      checkText(node, `${node.left.property.name}: ${text}`, add);
    }
    if (node.type === "Literal" && typeof node.value === "string")
      checkText(node, node.value, add);
    if (node.type === "TemplateElement")
      checkText(node, node.value.cooked ?? "", add);
    const named =
      node.type === "Property" || node.type === "PropertyDefinition"
        ? [keyName(node), node.value]
        : node.type === "VariableDeclarator" && node.id.type === "Identifier"
          ? [node.id.name, node.init]
          : node.type === "AssignmentPattern" && node.left.type === "Identifier"
            ? [node.left.name, node.right]
            : null;
    if (named && named[0] && MOTION_NAME.test(named[0])) {
      const value = constant(named[1]);
      if (value !== null && value !== 0 && !(parent?.type === "ObjectPattern"))
        add(
          node,
          "literal",
          `${named[0]} = ${value} needs a token from motion.mjs`,
        );
    }
  });
  const seen = new Set();
  return found.filter((v) => {
    const key = `${v.line}:${v.rule}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

/** CSS written inside a JavaScript string, and code that is itself a string. */
function checkText(node, text, add) {
  if (/set(?:Timeout|Interval)\([^;]*,\s*\d+\s*\)/.test(text))
    add(node, "timer", "a timer with a literal delay inside a string of code");
  if (CURVE.test(text)) add(node, "easing", "an easing curve is a literal");
  if (/transition|animation/.test(text)) {
    if (nonZeroTime(text)) add(node, "literal", "a time in a style string");
    if (KEYWORD.test(text))
      add(node, "easing", "a named easing in a style string");
    if (/transition[^;]*(?<![\w-])all(?![\w-])/.test(text))
      add(node, "animated-property", "transition: all");
  }
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Violations in one stylesheet (or the CSS of an HTML file). */
export function scanCss(source) {
  const found = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  const add = (index, rule, what) =>
    found.push({ line: lineOf(text, index), rule, text: what });
  for (const m of text.matchAll(TIME))
    if (Number.parseFloat(m[0]) !== 0)
      add(m.index, "literal", `${m[0]} needs a --motion-* variable`);
  for (const m of text.matchAll(/cubic-bezier\(|steps\(/g))
    add(m.index, "easing", "an easing curve is a literal, use --ease-*");
  for (const m of text.matchAll(
    /(?<![\w-])((?:-webkit-)?(?:transition|animation)(?:-timing-function)?)\s*:\s*([^;}]+)/g,
  ))
    if (KEYWORD.test(m[2]))
      add(m.index, "easing", `${m[1]} names an easing, use --ease-*`);
  for (const m of text.matchAll(
    /(?<![\w-])(?:-webkit-)?transition(?:-property)?\s*:\s*([^;}]+)/g,
  )) {
    const segments = m[1].split(/,(?![^(]*\))/);
    for (const segment of segments) {
      const property = segment.trim().split(/\s+/)[0];
      if (
        property &&
        !ANIMATED.has(property) &&
        !/^(none|var\(|initial|inherit)/.test(property) &&
        !/^\d|^calc\(/.test(property)
      )
        add(m.index, "animated-property", `transition animates ${property}`);
    }
  }
  for (const m of text.matchAll(/@(?:-webkit-)?keyframes\s+[\w-]+\s*\{/g)) {
    let depth = 1;
    let end = m.index + m[0].length;
    while (depth && end < text.length) {
      if (text[end] === "{") depth += 1;
      if (text[end] === "}") depth -= 1;
      end += 1;
    }
    const body = text.slice(m.index + m[0].length, end - 1);
    for (const d of body.matchAll(/(?<![\w-])([a-z-]+)\s*:/g))
      if (!ANIMATED.has(d[1]) && d[1] !== "animation-timing-function")
        add(
          m.index + m[0].length + d.index,
          "animated-property",
          `@keyframes animates ${d[1]}`,
        );
  }
  return found;
}

/** Violations in one file, by extension. */
export function scanFile(file, source) {
  if (file.endsWith(".css")) return scanCss(source);
  if (file.endsWith(".html")) {
    const found = [];
    for (const m of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const offset = lineOf(source, m.index + m[0].indexOf(m[1])) - 1;
      for (const v of scanCss(m[1]))
        found.push({ ...v, line: v.line + offset });
    }
    for (const m of source.matchAll(/\sstyle="([^"]*)"/g))
      for (const v of scanCss(m[1]))
        found.push({ ...v, line: lineOf(source, m.index) });
    return found;
  }
  return scanJs(source, { module: file.endsWith(".mjs") });
}
