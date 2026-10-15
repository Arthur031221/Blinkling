/** What a pick is, and which confirmation effect tells the user what was
 * taken (M4). One table, so the renderer and the tests read the same truth. */
export const TAKEN_KINDS = Object.freeze([
  "text",
  "image",
  "table",
  "code",
  "formula",
  "chart",
  "video",
  "control",
  "section",
  "window",
  "area",
  "screen",
  "page",
]);

export const EFFECTS = Object.freeze({
  text: "crayon-lines",
  image: "loop",
  table: "outline-sweep",
  code: "brackets-sides",
  formula: "wavy-underline",
  chart: "corner-brackets",
  control: "circle",
  video: "corner-brackets-tag",
  section: "bracket-left",
  window: "window-edge",
  page: "window-edge",
  screen: "window-edge",
  area: "outline",
});

const FROM_ELEMENT = Object.freeze({
  paragraph: "text",
  sentence: "text",
  text: "text",
  cell: "text",
  heading: "section",
  section: "section",
  image: "image",
  figure: "image",
  table: "table",
  code: "code",
  formula: "formula",
  chart: "chart",
  video: "video",
  canvas: "video",
  link: "control",
  button: "control",
  control: "control",
  input: "control",
  window: "window",
  page: "page",
});

/** Locator element kind -> Taken kind. Unknown kinds are a plain area. */
export const takenKind = (elementKind) => FROM_ELEMENT[elementKind] ?? "area";
export const effectFor = (kind) => EFFECTS[kind] ?? "outline";
