/** Largest text sent as one attachment. The composer caps whole turns lower. */
export const MAX_TEXT = 200000;

const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** Rows of cells as a Markdown table; the first row is the header. */
export function tableMarkdown(rows) {
  if (!rows?.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const row = (cells) =>
    `| ${Array.from({ length: width }, (_, i) => cell(cells[i])).join(" | ")} |`;
  return [
    row(rows[0]),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map(row),
  ].join("\n");
}

/** Picked text as a UTF-8 text file the composer sends like any attachment. */
export function textAttachment(text, name = "Selection.txt") {
  const capped = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    mediaType: "text/plain",
    data: Buffer.from(capped, "utf8").toString("base64"),
  };
}

export function imageAttachment({ data, width, height }, name = "Selection.png") {
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    mediaType: "image/png",
    data,
    width,
    height,
  };
}

/** The text chip: the first words and how long the whole text is (N2.9). */
export function chipText(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  const preview = flat.length > 32 ? `${flat.slice(0, 31).trimEnd()}…` : flat;
  return { preview, length: text.length };
}
