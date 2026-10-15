/** What an element is, from the role every source reports. DOM, AT-SPI, AX and
 * UI Automation each name roles their own way; the source parsers bring them to
 * ARIA-like names and this table is the only place those become a Kind. */
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

export const MAX_TEXT = 4000;

const BY_ROLE = new Map(
  Object.entries({
    paragraph: ["paragraph", "listitem", "blockquote", "quote", "note"],
    heading: ["heading", "title"],
    section: [
      "section",
      "region",
      "generic",
      "article",
      "main",
      "navigation",
      "complementary",
      "banner",
      "contentinfo",
      "form",
      "dialog",
      "alertdialog",
      "group",
      "list",
      "listbox",
      "toolbar",
      "menu",
      "menubar",
      "tablist",
      "tree",
      "row",
      "rowgroup",
      "panel",
      "pane",
      "scrollpane",
      "splitpane",
      "layeredpane",
      "filler",
      "statusbar",
      "header",
      "footer",
      "custom",
    ],
    text: [
      "text",
      "statictext",
      "label",
      "caption",
      "tooltip",
      "status",
      "alert",
      "log",
      "textleaf",
    ],
    image: ["img", "image", "icon", "graphic"],
    figure: ["figure"],
    table: ["table", "grid", "treegrid"],
    cell: ["cell", "gridcell", "columnheader", "rowheader", "tablecell"],
    code: ["code", "terminal"],
    formula: ["math", "formula"],
    chart: ["chart", "graphics-document", "graphicsdocument"],
    video: ["video", "audio", "media"],
    canvas: ["canvas"],
    link: ["link", "hyperlink"],
    button: ["button", "pushbutton", "togglebutton", "splitbutton"],
    control: [
      "checkbox",
      "radio",
      "radiobutton",
      "slider",
      "switch",
      "combobox",
      "tab",
      "tabitem",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "listitemcontrol",
      "treeitem",
      "progressbar",
      "scrollbar",
      "spinner",
      "dropdown",
      "thumb",
    ],
    input: [
      "textbox",
      "searchbox",
      "spinbutton",
      "input",
      "entry",
      "edit",
      "password",
      "passwordtext",
      "textfield",
      "textarea",
      "textentry",
    ],
    window: ["window", "frame", "application", "desktopframe", "titlebar"],
    page: ["document", "webarea", "page", "documentweb", "documentframe"],
  }).flatMap(([kind, roles]) => roles.map((role) => [role, kind])),
);
const IGNORED = new Set(["separator", "presentation", "none", "unknown"]);
const CHARTISH = /chart|graph|plot|diagram|sparkline|histogram/i;

const squashRole = (role) =>
  String(role ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

/** One of KINDS, or null for decoration (separators). A secure element is
 * always an input; the tag refines what the role cannot tell apart (a canvas and
 * an svg are both roleless images). */
export function kindOf({ role, tag, name, text, secure } = {}) {
  if (secure) return "input";
  const key = squashRole(role);
  if (IGNORED.has(key)) return null;
  const element = String(tag ?? "").toLowerCase();
  if (element === "canvas") return "canvas";
  if (element === "video" || element === "audio") return "video";
  if (element === "svg" && (key === "img" || key === "" || key === "image"))
    return CHARTISH.test(String(name ?? "")) ? "chart" : "image";
  if (element === "figure") return "figure";
  if (element === "pre") return "code";
  if (element === "td" || element === "th") return "cell";
  const found = BY_ROLE.get(key) ?? BY_ROLE.get(role);
  if (found) return found;
  return text ? "text" : "section";
}

const CONTAINERS = new Set(["section", "page", "window", "figure", "table"]);
/** The kinds a click climbs to, not what it lands on. */
export const isContainerKind = (kind) => CONTAINERS.has(kind);

/** Whitespace squashed and capped at MAX_TEXT. */
export const normalizeText = (value, max = MAX_TEXT) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
