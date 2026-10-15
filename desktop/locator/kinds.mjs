// Kind detection: one vocabulary for the DOM export and for the three
// operating-system accessibility trees.

export const KINDS = Object.freeze([
  "paragraph",
  "sentence",
  "heading",
  "section",
  "text",
  "image",
  "figure",
  "table",
  "cell",
  "code",
  "formula",
  "chart",
  "video",
  "canvas",
  "link",
  "button",
  "control",
  "input",
  "window",
  "page",
]);

const KIND_SET = new Set(KINDS);
export const isKind = (value) => KIND_SET.has(value);

// An svg this big is a drawing worth asking about, not an icon.
const CHART_MIN = { width: 160, height: 120 };

const DOM_KIND = {
  heading: "heading",
  paragraph: "paragraph",
  listitem: "paragraph",
  quote: "paragraph",
  caption: "text",
  text: "text",
  link: "link",
  button: "button",
  code: "code",
  table: "table",
  cell: "cell",
  figure: "figure",
  math: "formula",
  page: "page",
  dialog: "window",
};

// Widgets the extension sends as kind "input" that are not text entry.
const CONTROL_ROLES = new Set([
  "checkbox",
  "radio",
  "slider",
  "switch",
  "spinbutton",
  "scrollbar",
  "progressbar",
  "menuitem",
  "tab",
]);

export function kindOfDom({ kind, role, tag, rect } = {}) {
  if (kind === "image" || role === "img" || role === "graphics-document") {
    if (tag === "canvas") return "canvas";
    if (
      role === "graphics-document" ||
      (tag === "svg" &&
        rect &&
        rect.width >= CHART_MIN.width &&
        rect.height >= CHART_MIN.height)
    )
      return "chart";
    return "image";
  }
  if (tag === "canvas") return "canvas";
  if (kind === "media")
    return role === "video" || tag === "video" ? "video" : "control";
  if (kind === "input") return CONTROL_ROLES.has(role) ? "control" : "input";
  return DOM_KIND[kind] ?? "section";
}

// Role names as AT-SPI (lower case words), macOS AX (AXFoo) and Windows UI
// Automation (ControlType names) spell them, compared without case, the AX
// prefix, spaces and dashes.
const AX_KIND = {
  pushbutton: "button",
  button: "button",
  togglebutton: "button",
  menubutton: "button",
  splitbutton: "button",
  popupbutton: "button",
  checkbox: "control",
  checkmenuitem: "control",
  radiobutton: "control",
  slider: "control",
  spinbutton: "control",
  scrollbar: "control",
  switch: "control",
  progressbar: "control",
  entry: "input",
  textfield: "input",
  textarea: "input",
  edit: "input",
  combobox: "input",
  searchfield: "input",
  passwordtext: "input",
  link: "link",
  hyperlink: "link",
  heading: "heading",
  paragraph: "paragraph",
  listitem: "paragraph",
  blockquote: "paragraph",
  static: "text",
  label: "text",
  statictext: "text",
  text: "text",
  caption: "text",
  image: "image",
  icon: "image",
  canvas: "canvas",
  chart: "chart",
  figure: "figure",
  table: "table",
  tablecell: "cell",
  cell: "cell",
  dataitem: "cell",
  code: "code",
  math: "formula",
  mathfraction: "formula",
  video: "video",
  section: "section",
  panel: "section",
  group: "section",
  filler: "section",
  splitpane: "section",
  scrollpane: "section",
  documentweb: "page",
  documentframe: "page",
  documentpresentation: "page",
  webarea: "page",
  document: "page",
  page: "page",
  frame: "window",
  dialog: "window",
  window: "window",
  alert: "window",
};

export function kindOfAx(role) {
  if (typeof role !== "string") return "section";
  const key = role
    .replace(/^AX/, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return AX_KIND[key] ?? "section";
}
