/**
 * Translates the page the user is looking at in place. The page script lists
 * the text nodes, the bridge's coding assistant translates them in batches and
 * the page script writes them back. Turning it off puts the originals back.
 */
export type TranslateDeps = {
  /** Message to the page script of this tab. */
  page(
    message: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined>;
  /** The translation of one batch, as the model's raw answer. */
  ask(prompt: string, signal: AbortSignal): Promise<string | undefined>;
  language: string;
};

const MAX_BATCHES = 80;

export function translationPrompt(
  language: string,
  texts: readonly string[],
): string {
  return [
    `Translate each string of the JSON array below into the language with the code "${language}".`,
    "Keep numbers, names, code and markup as they are. Keep leading and trailing spaces.",
    `Answer with one JSON array of exactly ${texts.length} strings in the same order and nothing else.`,
    "",
    JSON.stringify(texts),
  ].join("\n");
}

/** The array a model answered with, or undefined when it is not usable. */
export function parseTranslation(
  answer: string,
  expected: number,
): string[] | undefined {
  const start = answer.indexOf("[");
  const end = answer.lastIndexOf("]");
  if (start < 0 || end <= start) return undefined;
  try {
    const value = JSON.parse(answer.slice(start, end + 1));
    return Array.isArray(value) &&
      value.length === expected &&
      value.every((item) => typeof item === "string")
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export async function translateTab(
  deps: TranslateDeps,
  signal: AbortSignal,
): Promise<boolean> {
  let cursor: number | undefined = 0;
  let batches = 0;
  while (cursor !== undefined) {
    if (signal.aborted || batches++ >= MAX_BATCHES) return false;
    const listed = await deps.page({ type: "blinkling:text-nodes", cursor });
    if (!listed || listed.error) return false;
    const nodes = (listed.nodes ?? []) as Array<{ id: string; text: string }>;
    if (nodes.length) {
      const answer = await deps.ask(
        translationPrompt(
          deps.language,
          nodes.map((node) => node.text),
        ),
        signal,
      );
      if (signal.aborted || answer === undefined) return false;
      const translated = parseTranslation(answer, nodes.length);
      if (!translated) return false;
      const applied = await deps.page({
        type: "blinkling:translate",
        nodes: nodes.map((node, index) => ({
          id: node.id,
          text: translated[index],
        })),
      });
      if (!applied || applied.error) return false;
    }
    cursor =
      typeof listed.nextCursor === "number" ? listed.nextCursor : undefined;
  }
  return true;
}

export async function restoreTab(deps: TranslateDeps): Promise<boolean> {
  const reply = await deps.page({ type: "blinkling:restore" });
  return Boolean(reply);
}
